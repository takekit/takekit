#!/usr/bin/env python3
"""Câmera sem Resolve: punch, zoom in, zoom out e face tracking sobre o a-roll (módulo `camera`).

O preset vem de `modules.camera` no edit/style.resolved.json (styles/_presets/camera/<id>.json):
`moves` (punch|zoomIn|zoomOut, em rodízio), `intensity` (escala máxima; 1.0 = nenhuma),
`frequency` (marcado|poucos|medio|muitos), `punchFrames`, `faceTracking {enabled, baseScale,
smoothing}` e `applyTo` (palcos A e/ou D). Sem preset, preset null ou `parada`: nada acontece e o
compose sai igual ao de antes.

Movimento por unidade (cuts.json), só nos palcos de `applyTo` (storyboard do plan.json):
    - `"camera": "punch" | "zoom_in" | "zoom_out" | "none"` no beat sempre ganha (é assim que o
      agente marca a ênfase; `frequency: marcado` = só esses);
    - senão, pela frequência: um movimento a cada ~6 s (poucos), ~3,5 s (medio) ou ~2 s (muitos)
      de tempo em palco A/D, alternando os `moves` do preset. Determinístico.
    punch: 1.0 → intensity em `punchFrames` no início da unidade e segura até o corte;
    zoomIn: 1.0 → intensity ao longo da unidade (ease in-out); zoomOut: intensity → 1.0 (ease out).
    Com face tracking, tudo × `baseScale` (crop constante que segue o rosto mesmo sem movimento).
O enquadramento segue o rosto (centro na horizontal, na altura em que ele já está no quadro),
suavizado sem atraso (EMA ida e volta com `smoothing`, zerado a cada corte) e preso para o quadro
escalado sempre cobrir a saída (sem borda preta). Sem tracking, o pivot é a linha dos olhos do
punch do Resolve (0.5, 0.36 do topo; [0.5, 0.64] na Fusion).

Rosto: Ultra-Light-Fast-Generic-Face-Detector-1MB (RFB-320, MIT, ONNX via onnxruntime) a cada 3
frames num quadro reduzido, maior rosto. Sem o modelo: topo da máscara do RVM; sem os dois:
pivot fixo, com aviso.

    python3 video/headless/camera.py --project video/projects/<slug>
        [--preset <arquivo.json>|<json>|-] [--plan-only] [--force] [--progress]

Escreve em edit/camera/:
    face_track.json   rostos detectados (cache: tamanho + mtime do aroll.mov)
    moves.json        [{unit, palco, move, from, to, startFrame, endFrame, by}] (by = beat|auto)
    aroll_cam.mov     aroll.mov com a câmera (mesmos frames e fps, só vídeo, ProRes 422 HQ); frames
                      fora dos movimentos saem iguais ao aroll (só reencodados)
    stamp.json        entradas do render; o .mov só é refeito quando o plano quadro a quadro muda
O compose.py chama isto sozinho (em processo) quando o estilo tem câmera. --progress imprime
TAKEKIT_PROGRESS=<0..1>; a última linha é TAKEKIT_CAMERA=<aroll_cam.mov> ou TAKEKIT_CAMERA=none.
"""
from __future__ import annotations

import argparse, contextlib, hashlib, io, json, math, os, re, subprocess, sys, tempfile, time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from common import (Progress, beats, die, file_key, load_cuts, model_file, need, palcos, probe, project_dir,
                    rel, style_module, style_resolved, threads, write_atomic)

MOVES = ("punch", "zoomIn", "zoomOut")
ALIASES = {"punch": "punch", "punchin": "punch", "zoomin": "zoomIn", "zoomout": "zoomOut",
           "none": "none", "nenhum": "none", "parada": "none", "off": "none"}
GAP_S = {"poucos": 6.0, "medio": 3.5, "muitos": 2.0}   # intervalo médio entre movimentos (tempo em A/D)
CREDIT_CAP = 1.5                 # uma unidade longa não enfileira vários movimentos seguidos
MIN_FRAMES = {"punch": 10, "zoomIn": 20, "zoomOut": 20}   # unidade mínima para um movimento automático
PIVOT = (0.5, 0.36)              # sem tracking / sem rosto: linha dos olhos (punch.json do Resolve)
ANCHOR_Y = (0.30, 0.45)          # altura aceita para o rosto no quadro (mediana do track)
EPS = 1e-4

TRACK_STEP = 3
TRACK_VERSION = 1
RENDER_VERSION = 1
DETECTOR = "ultraface-rfb320"
FACE_URL = ("https://raw.githubusercontent.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/"
            "dffdddda9794a50607cba8f318507a28c1c27cab/models/onnx/version-RFB-320.onnx")
FACE_SHA256 = "34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017"
FACE_IN = (320, 240)             # entrada fixa do RFB-320 (w, h)
FACE_MIN_SCORE = 0.7


# ───────── preset ─────────

def canon_move(value) -> str | None:
    """`punch`, `zoomIn`, `zoomOut` ou `none` (aceita zoom_in, zoom-in, "zoom in"…); None se não reconhece."""
    if value is False:
        return "none"
    return ALIASES.get(re.sub(r"[\s_-]", "", str(value or "").lower()))


def _num(v, default: float) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def settings(preset) -> dict | None:
    """Preset de câmera normalizado; None sem preset."""
    if not isinstance(preset, dict):
        return None
    ft = preset.get("faceTracking") if isinstance(preset.get("faceTracking"), dict) else {}
    tracking = bool(ft.get("enabled"))
    freq = str(preset.get("frequency") or "marcado").strip().lower().replace("é", "e")
    if freq not in GAP_S and freq != "marcado":
        print(f"aviso: frequência de câmera `{freq}` desconhecida; uso marcado")
        freq = "marcado"
    moves = []
    for m in preset.get("moves") or []:
        c = canon_move(m)
        if c in MOVES:
            moves.append(c)
        else:
            print(f"aviso: movimento de câmera `{m}` desconhecido (use punch, zoomIn, zoomOut)")
    apply = []
    for p in preset.get("applyTo") or ["A", "D"]:
        letter = str(p).strip().upper()[:1]
        if letter in ("A", "D"):
            apply.append(letter)
        else:
            print(f"aviso: câmera no palco {p} não existe (só A e D têm o a-roll inteiro)")
    return {"id": preset.get("id"), "moves": moves, "intensity": max(1.0, _num(preset.get("intensity"), 1.0)),
            "frequency": freq, "punchFrames": max(1, int(_num(preset.get("punchFrames"), 2))),
            "tracking": tracking, "base": max(1.0, _num(ft.get("baseScale"), 1.0)) if tracking else 1.0,
            "smoothing": min(0.99, max(0.0, _num(ft.get("smoothing"), 0.9))), "applyTo": apply}


def active(cfg: dict | None) -> bool:
    """Há o que renderizar: algum movimento possível (intensity > 1) ou crop fixo (baseScale > 1)."""
    return bool(cfg) and bool(cfg["applyTo"]) and (cfg["intensity"] > 1 + EPS or cfg["base"] > 1 + EPS)


# ───────── plano de movimentos ─────────

def beat_move(beat: dict, uid: str = "") -> str | None:
    """Marca `camera` do beat: move canônico, `none`, ou None (sem marca / inválida)."""
    if not isinstance(beat, dict) or beat.get("camera") in (None, ""):
        return None
    c = canon_move(beat["camera"])
    if c is None:
        print(f"aviso: {uid} `\"camera\": {json.dumps(beat['camera'])}` desconhecido "
              "(use punch, zoom_in, zoom_out ou none); sigo a frequência")
    return c


def _pick(moves: list[str], rot: int, n: int) -> tuple[str | None, int]:
    """Próximo movimento do rodízio que cabe na unidade (n frames)."""
    for j in range(len(moves)):
        m = moves[(rot + j) % len(moves)]
        if n >= MIN_FRAMES[m]:
            return m, rot + j + 1
    return None, rot


def plan_moves(units, stage: dict[str, str], board: dict[str, dict], cfg: dict, fps: int,
               credit0: float | None = None, skip_first: bool = False) -> list[dict]:
    """Movimentos por unidade. `credit` = tempo em A/D desde o último movimento; começa na metade
    do intervalo (ou `credit0`); cada movimento gasta um intervalo. `skip_first` deixa a primeira
    unidade sem movimento automático (prévia: o primeiro corte é o da unidade 2)."""
    gap = GAP_S.get(cfg["frequency"])
    credit = (gap / 2 if credit0 is None else credit0) if gap else 0.0
    zoom, base, inten = cfg["intensity"] > 1 + EPS, cfg["base"], cfg["intensity"]
    rot, out = 0, []
    for i, u in enumerate(units):
        palco = stage.get(u.id, "A")
        mark = beat_move(board.get(u.id) or {}, u.id)
        if palco not in cfg["applyTo"]:
            if mark and mark != "none":
                print(f"aviso: {u.id} marca `camera: {mark}` no palco {palco}; a câmera só vale em "
                      f"{', '.join(cfg['applyTo']) or 'nenhum palco'}")
            continue
        n = u.end - u.start
        move, by = None, None
        if mark:
            move, by = (None if mark == "none" else mark), "beat"
        elif gap and cfg["moves"] and not (skip_first and i == 0) and credit >= gap - 1e-9:
            move, rot = _pick(cfg["moves"], rot, n)
            by = "auto"
        if move and zoom:
            s0, s1 = (inten, 1.0) if move == "zoomOut" else (1.0, inten)
            out.append({"unit": u.id, "palco": palco, "move": move, "from": round(base * s0, 4),
                        "to": round(base * s1, 4), "startFrame": u.start, "endFrame": u.end, "by": by})
            if gap:
                credit = max(0.0, credit - gap)
        if gap:
            credit = min(credit + n / fps, gap * CREDIT_CAP)
    return out


def ease_out(t: float) -> float:
    return 1 - (1 - t) ** 3


def ease_in_out(t: float) -> float:
    return (1 - math.cos(math.pi * t)) / 2


def move_scale(move: str | None, k: int, n: int, intensity: float, punch_frames: int) -> float:
    """Escala do frame k (0..n-1) da unidade, sem o baseScale."""
    d = intensity - 1.0
    if not move or d <= 0:
        return 1.0
    if move == "punch":
        return 1.0 + d * ease_out(min(1.0, (k + 1) / max(1, punch_frames)))
    t = k / (n - 1) if n > 1 else 1.0
    if move == "zoomIn":
        return 1.0 + d * ease_in_out(t)
    if move == "zoomOut":
        return 1.0 + d * (1.0 - ease_out(t))
    return 1.0


def crop_box(scale: float, face: tuple[float, float], anchor: tuple[float, float],
             size: tuple[int, int]) -> tuple[float, float]:
    """Canto (x0, y0) da janela W/S × H/S na fonte que leva o rosto `face` para `anchor` na saída,
    presa dentro do quadro (a janela nunca sai da fonte: sem borda preta)."""
    w, h = size
    s = max(1.0, scale)
    x0 = min(max(face[0] - anchor[0] / s, 0.0), w - w / s)
    y0 = min(max(face[1] - anchor[1] / s, 0.0), h - h / s)
    return x0, y0


def smooth(x: np.ndarray, beta: float) -> np.ndarray:
    """EMA de ida e volta (fase zero: a câmera não chega atrasada no rosto)."""
    y = np.asarray(x, dtype=np.float64).copy()
    if beta <= 0 or len(y) < 2:
        return y
    a = 1.0 - beta
    for i in range(1, len(y)):
        y[i] = beta * y[i - 1] + a * y[i]
    for i in range(len(y) - 2, -1, -1):
        y[i] = beta * y[i + 1] + a * y[i]
    return y


class Track:
    """Centros de rosto amostrados (px da fonte); caminho suavizado por unidade."""

    def __init__(self, data: dict, size: tuple[int, int]):
        self.detector = data.get("detector") or "fixed"
        self.size = size
        s = np.array([row[:3] for row in data.get("samples") or []], dtype=np.float64).reshape(-1, 3)
        self.f, self.x, self.y = s[:, 0], s[:, 1], s[:, 2]

    @property
    def found(self) -> bool:
        return len(self.f) > 0

    def anchor(self) -> tuple[float, float]:
        """Onde o rosto fica na saída: centro na horizontal, na altura mediana em que já estava."""
        w, h = self.size
        if not self.found:
            return PIVOT[0] * w, PIVOT[1] * h
        return 0.5 * w, float(np.clip(np.median(self.y), ANCHOR_Y[0] * h, ANCHOR_Y[1] * h))

    def path(self, start: int, end: int, smoothing: float) -> tuple[np.ndarray, np.ndarray] | None:
        """Centro do rosto em cada frame de [start, end): amostras da própria unidade, interpoladas
        e suavizadas (sem misturar com o outro lado do corte); None sem amostra na unidade."""
        sel = (self.f >= start) & (self.f < end)
        if not sel.any():
            return None
        frames = np.arange(start, end, dtype=np.float64)
        xs = np.interp(frames, self.f[sel], self.x[sel])
        ys = np.interp(frames, self.f[sel], self.y[sel])
        return smooth(xs, smoothing), smooth(ys, smoothing)


def frame_transforms(units, stage: dict[str, str], moves: list[dict], cfg: dict, track: Track | None,
                     size: tuple[int, int]) -> dict[int, tuple[float, float, float]]:
    """frame da timeline → (escala, x0, y0) para todo frame com escala > 1; o resto passa direto."""
    w, h = size
    by_unit = {m["unit"]: m for m in moves}
    tracking = cfg["tracking"] and track is not None and track.found
    anchor = track.anchor() if tracking else (PIVOT[0] * w, PIVOT[1] * h)
    out: dict[int, tuple[float, float, float]] = {}
    for u in units:
        if stage.get(u.id, "A") not in cfg["applyTo"]:
            continue
        n, m = u.end - u.start, by_unit.get(u.id)
        scales = [cfg["base"] * move_scale(m and m["move"], k, n, cfg["intensity"], cfg["punchFrames"])
                  for k in range(n)]
        if max(scales) <= 1 + EPS:
            continue
        path = track.path(u.start, u.end, cfg["smoothing"]) if tracking else None
        for k, s in enumerate(scales):
            if s <= 1 + EPS:
                continue
            face = (float(path[0][k]), float(path[1][k])) if path is not None else anchor
            x0, y0 = crop_box(s, face, anchor, size)
            out[u.start + k] = (s, x0, y0)
    return out


def stamp_of(head: dict, transforms: dict[int, tuple[float, float, float]]) -> str:
    """Hash do que o render depende: a-roll, tamanho, fps, versão e cada janela, quadro a quadro."""
    h = hashlib.sha1(json.dumps({"v": RENDER_VERSION, **head}, sort_keys=True).encode())
    for f in sorted(transforms):
        s, x, y = transforms[f]
        h.update(f"{f}:{s:.5f}:{x:.3f}:{y:.3f};".encode())
    return h.hexdigest()[:16]


def _hash(obj) -> str:
    return hashlib.sha1(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


# ───────── rosto ─────────

def letterbox(w: int, h: int, box: tuple[int, int]) -> tuple[int, int, int, int]:
    """(iw, ih, ox, oy): quadro w×h encaixado (sem distorcer) numa entrada box, faixas pretas."""
    bw, bh = box
    k = min(bw / w, bh / h)
    iw, ih = min(bw, max(2, int(round(w * k / 2)) * 2)), min(bh, max(2, int(round(h * k / 2)) * 2))
    return iw, ih, (bw - iw) // 2, (bh - ih) // 2


def small_frames(video: Path, count: int, step: int, box: tuple[int, int], size: tuple[int, int],
                 start: float = 0.0, prefix: str = "", in_opts: tuple[str, ...] = ()):
    """(frame, RGB uint8 box_h×box_w) a cada `step` frames dos `count` primeiros, em letterbox."""
    iw, ih, ox, oy = letterbox(*size, box)
    vf = (f"{prefix}trim=end_frame={count},select='not(mod(n\\,{step}))',"
          f"scale={iw}:{ih}:flags=area,pad={box[0]}:{box[1]}:{ox}:{oy}:black,setsar=1")
    cmd = ["ffmpeg", "-v", "error", "-nostdin", *in_opts]
    if start > 0:
        cmd += ["-ss", f"{start:.3f}"]
    cmd += ["-i", str(video), "-map", "0:v:0", "-vf", vf, "-fps_mode", "passthrough",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    n = box[0] * box[1] * 3
    with tempfile.TemporaryFile() as err:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=err)
        try:
            i = 0
            while True:
                buf = proc.stdout.read(n)
                if len(buf) < n:
                    break
                yield i * step, np.frombuffer(buf, np.uint8).reshape(box[1], box[0], 3)
                i += 1
        finally:
            proc.stdout.close()
            if proc.poll() is None:
                proc.kill()
            proc.wait()


class FaceDetector:
    """RFB-320 do Ultra-Light-Fast-Generic-Face-Detector-1MB (saída já decodificada: scores + caixas
    normalizadas). Maior rosto (depois de NMS), caixa refinada pela média dos candidatos colados."""

    def __init__(self, path: Path):
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = min(4, threads())
        so.inter_op_num_threads = 1
        so.log_severity_level = 3
        self.sess = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])
        self.input = self.sess.get_inputs()[0].name

    def __call__(self, rgb: np.ndarray) -> tuple[float, float, float, float, float] | None:
        """Maior rosto em coordenadas normalizadas da entrada 320×240: (cx, cy, w, h, score)."""
        x = ((rgb.astype(np.float32) - 127.0) / 128.0).transpose(2, 0, 1)[None]
        scores, boxes = self.sess.run(None, {self.input: x})
        p = scores[0, :, 1]
        keep = np.where(p > FACE_MIN_SCORE)[0]
        if not len(keep):
            return None
        b, s = boxes[0, keep].astype(np.float64), p[keep].astype(np.float64)
        order, picked = np.argsort(-s), []
        while len(order):
            i = order[0]
            picked.append(i)
            order = order[1:][_iou(b[i], b[order[1:]]) < 0.3]
        area = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
        j = max(picked, key=lambda k: area[k])
        near = _iou(b[j], b) > 0.5
        wts = s[near] / s[near].sum()
        x0, y0, x1, y1 = (b[near] * wts[:, None]).sum(0)
        return (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, float(s[j])


def _iou(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ix = np.clip(np.minimum(a[2], b[:, 2]) - np.maximum(a[0], b[:, 0]), 0, None)
    iy = np.clip(np.minimum(a[3], b[:, 3]) - np.maximum(a[1], b[:, 1]), 0, None)
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1]) - inter
    return inter / np.maximum(union, 1e-9)


_DETECTOR: list = []


def face_detector() -> FaceDetector | None:
    """Detector (baixado uma vez, sha256 fixo) ou None com aviso; tenta uma vez por processo."""
    if not _DETECTOR:
        try:
            path = model_file(FACE_URL, FACE_SHA256, "TAKEKIT_FACE_MODEL", "detector de rosto", timeout=20)
            _DETECTOR.append(FaceDetector(path))
        except Exception as e:   # sem rede, checksum, onnxruntime: cai para a máscara do RVM
            print(f"aviso: detector de rosto indisponível ({e})", flush=True)
            _DETECTOR.append(None)
    return _DETECTOR[0]


def faces_track(det: FaceDetector, video: Path, size: tuple[int, int], count: int, step: int,
                start: float = 0.0, prefix: str = "", in_opts: tuple[str, ...] = ()) -> list[list[float]]:
    w, h = size
    iw, ih, ox, oy = letterbox(w, h, FACE_IN)
    out = []
    for f, rgb in small_frames(video, count, step, FACE_IN, size, start, prefix, in_opts):
        hit = det(rgb)
        if hit:
            cx, cy, bw, bh, sc = hit
            out.append([f, round((cx * FACE_IN[0] - ox) * w / iw, 2), round((cy * FACE_IN[1] - oy) * h / ih, 2),
                        round(bw * FACE_IN[0] * w / iw, 1), round(bh * FACE_IN[1] * h / ih, 1), round(sc, 3)])
    return out


def matte_track(video: Path, size: tuple[int, int], count: int, step: int, start: float = 0.0,
                prefix: str = "", in_opts: tuple[str, ...] = ()) -> list[list[float]]:
    """Plano B sem detector: cabeça = topo da máscara do RVM (quadro reduzido, estado recorrente)."""
    try:
        from matte import Matter
        matter = Matter(downsample=0.5)   # 288x512 com 0,5: metade do tempo do 1,0, mesmo erro
    except (Exception, SystemExit) as e:
        print(f"aviso: RVM indisponível ({e})", flush=True)
        return []
    w, h = size
    k = 512 / max(w, h)
    box = (max(64, int(round(w * k / 32)) * 32), max(64, int(round(h * k / 32)) * 32))
    iw, ih, ox, oy = letterbox(w, h, box)
    out = []
    for f, rgb in small_frames(video, count, step, box, size, start, prefix, in_opts):
        head = head_from_matte(matter(rgb))
        if head:
            cx, cy, hw = head
            out.append([f, round((cx - ox) * w / iw, 2), round((cy - oy) * h / ih, 2),
                        round(hw * w / iw, 1), round(1.3 * hw * h / ih, 1), 0.0])
    return out


def head_from_matte(alpha: np.ndarray) -> tuple[float, float, float] | None:
    """(cx, cy, largura) do rosto estimado: topo do blob, largura da cabeça logo abaixo, centro do
    rosto ~0,95 largura abaixo do topo (cabelo → nariz num talking head)."""
    a = alpha > 128
    hgt, wid = a.shape
    rows = np.where(a.sum(1) > 0.02 * wid)[0]
    if not len(rows):
        return None
    top = int(rows[0])
    band = a[top: top + max(4, int(0.12 * hgt))]
    ys, xs = np.nonzero(band)
    if not len(xs):
        return None
    widths = band.sum(1)
    hw = float(np.median(widths[len(widths) // 2:]))
    return float(xs.mean()), top + 0.95 * hw, hw


def track_video(video: Path, size: tuple[int, int], count: int, step: int = TRACK_STEP, start: float = 0.0,
                prefix: str = "", in_opts: tuple[str, ...] = ()) -> dict:
    """{"detector", "samples": [[frame, cx, cy, w, h, score]]} com o melhor método disponível.
    `prefix` = filtros antes da redução (a prévia enquadra o vídeo em 9:16 ali)."""
    det = face_detector()
    if det is not None:
        samples = faces_track(det, video, size, count, step, start, prefix, in_opts)
        if samples:
            return {"detector": DETECTOR, "samples": samples}
        print("aviso: nenhum rosto detectado; tento a máscara do RVM", flush=True)
    samples = matte_track(video, size, count, step, start, prefix, in_opts)
    if samples:
        return {"detector": "rvm-matte", "samples": samples}
    print(f"aviso: sem rosto nem máscara; pivot fixo ({PIVOT[0]}, {PIVOT[1]})", flush=True)
    return {"detector": "fixed", "samples": []}


def project_track(pdir: Path, aroll: Path, size: tuple[int, int], frames: int) -> dict:
    """edit/camera/face_track.json, refeito quando o aroll.mov muda (tamanho + mtime) ou quando o
    cache veio de um plano B e o detector voltou a existir."""
    cache = pdir / "edit" / "camera" / "face_track.json"
    key = {"file": rel(aroll, pdir), **file_key(aroll), "frames": frames, "step": TRACK_STEP, "v": TRACK_VERSION}
    if cache.is_file():
        try:
            data = json.loads(cache.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
        if data.get("key") == key and (data.get("detector") == DETECTOR or face_detector() is None):
            return data
    t0 = time.time()
    data = {"_doc": "Rosto no aroll.mov (camera.py): [frame, cx, cy, w, h, score] em px da fonte, a cada "
                    f"{TRACK_STEP} frames. Cache: refeito quando o aroll.mov muda.",
            "key": key, "size": list(size), **track_video(aroll, size, frames)}
    write_atomic(cache, json.dumps(data, ensure_ascii=False) + "\n")
    print(f"câmera: rosto em {len(data['samples'])} de {math.ceil(frames / TRACK_STEP)} amostras "
          f"({data['detector']}, {time.time() - t0:.1f}s)", flush=True)
    return data


# ───────── plano do projeto ─────────

@dataclass
class Plan:
    cfg: dict
    preset: dict
    moves: list[dict]
    transforms: dict[int, tuple[float, float, float]]
    size: tuple[int, int]
    fps: int
    frames: int
    detector: str
    stamp: str
    inputs: str
    units: list[str]      # unidades com algum frame recortado (o compose lê o aroll_cam.mov só nelas)


def plan_project(pdir: Path, preset) -> Plan | None:
    """Plano da câmera do projeto (rápido; o rosto sai do cache). None quando não há câmera."""
    cfg = settings(preset)
    if not active(cfg):
        return None
    _cuts, fps, units = load_cuts(pdir)
    stage = {k: (v if v in ("A", "B", "C", "D") else "A") for k, v in palcos(pdir, units).items()}
    board = beats(pdir, units)
    aroll = pdir / "edit" / "aroll.mov"
    if not aroll.is_file():
        die("faltou edit/aroll.mov; rode trim.py antes")
    info = probe(aroll)
    size = (info.width, info.height)
    if info.frames < units[-1].end:
        die(f"aroll.mov tem {info.frames} frames, cuts.json pede {units[-1].end}; rode trim.py")
    moves = plan_moves(units, stage, board, cfg, fps)
    need_face = cfg["tracking"] and (bool(moves) or cfg["base"] > 1 + EPS)
    track_data = project_track(pdir, aroll, size, info.frames) if need_face else {"detector": "off", "samples": []}
    track = Track(track_data, size)
    transforms = frame_transforms(units, stage, moves, cfg, track, size)
    head = {"aroll": file_key(aroll), "size": list(size), "fps": fps, "frames": info.frames}
    inputs = _hash({"units": [[u.id, u.start, u.end, stage[u.id], (board.get(u.id) or {}).get("camera")]
                              for u in units], "fps": fps})
    moved = [u.id for u in units if any(f in transforms for f in range(u.start, u.end))]
    return Plan(cfg, preset, moves, transforms, size, fps, info.frames, track.detector if need_face else "off",
                stamp_of(head, transforms), inputs, moved)


def write_moves(pdir: Path, plan: Plan) -> Path:
    path = pdir / "edit" / "camera" / "moves.json"
    write_atomic(path, json.dumps(plan.moves, ensure_ascii=False, indent=2) + "\n")
    return path


def current(pdir: Path, plan: Plan) -> bool:
    out = pdir / "edit" / "camera" / "aroll_cam.mov"
    stamp = pdir / "edit" / "camera" / "stamp.json"
    if not (out.is_file() and stamp.is_file()):
        return False
    try:
        return json.loads(stamp.read_text(encoding="utf-8")).get("stamp") == plan.stamp
    except json.JSONDecodeError:
        return False


def ensure(pdir: Path, plan: Plan, progress=None, force: bool = False) -> tuple[Path, bool]:
    """(aroll_cam.mov, renderizou agora?). Só renderiza quando o stamp mudou (ou --force)."""
    out = pdir / "edit" / "camera" / "aroll_cam.mov"
    write_moves(pdir, plan)
    if not force and current(pdir, plan):
        return out, False
    t0 = time.time()
    render_project(pdir, plan, progress)
    secs = time.time() - t0
    write_atomic(pdir / "edit" / "camera" / "stamp.json", json.dumps({
        "_doc": "Entradas do aroll_cam.mov (camera.py). `stamp` = hash do plano quadro a quadro + aroll.",
        "version": RENDER_VERSION, "stamp": plan.stamp, "preset": plan.cfg.get("id"),
        "presetHash": _hash(plan.preset), "inputs": plan.inputs, "aroll": file_key(pdir / "edit" / "aroll.mov"),
        "frames": plan.frames, "moved": len(plan.transforms), "detector": plan.detector,
        "seconds": round(secs, 1)}, ensure_ascii=False, indent=2) + "\n")
    print(f"câmera: {len(plan.moves)} movimentos, {len(plan.transforms)} de {plan.frames} frames com crop → "
          f"{rel(out, pdir)} ({secs:.1f}s)", flush=True)
    return out, True


def ensure_for_spec(pdir: Path, cam: dict, progress=None) -> tuple[Plan, bool]:
    """Para o compose: replaneja com o preset gravado no spec e garante o aroll_cam.mov atual."""
    with contextlib.redirect_stdout(io.StringIO()):   # os avisos do plano já saíram no derive_spec
        plan = plan_project(pdir, cam.get("preset"))
    if plan is None or not plan.transforms:
        die("o spec pede a câmera (camera_render), mas o preset gravado não gera movimento neste projeto; "
            "refaça o preview")
        raise AssertionError
    if cam.get("stamp") and cam["stamp"] != plan.stamp:
        print("aviso: cortes, palcos ou marcas de câmera mudaram desde o preview; a câmera segue o plano atual")
    _path, rendered = ensure(pdir, plan, progress)
    return plan, rendered


# ───────── render ─────────

PLANES = {  # (divisor x, divisor y, modo PIL, bytes por amostra)
    "yuv422p10le": ((1, 1, "I;16", 2), (2, 1, "I;16", 2), (2, 1, "I;16", 2)),
    "yuv420p": ((1, 1, "L", 1), (2, 2, "L", 1), (2, 2, "L", 1)),
}


def frame_bytes(fmt: str, size: tuple[int, int]) -> int:
    return sum((size[0] // dx) * (size[1] // dy) * b for dx, dy, _m, b in PLANES[fmt])


def warp(buf, fmt: str, src: tuple[int, int], box: tuple[float, float, float, float],
         dst: tuple[int, int]) -> bytes:
    """Recorte subpixel `box` (x0, y0, x1, y1 em px de luma da fonte) escalado para `dst`, plano a
    plano (bicúbico, sem converter cor). Croma 4:2:x com amostra à esquerda na horizontal (ProRes,
    H.264) e centrada na vertical (4:2:0)."""
    from PIL import Image
    x0, y0, x1, y1 = box
    k = dst[0] / (x1 - x0)
    mv, off, out = memoryview(buf), 0, []
    for dx, dy, mode, b in PLANES[fmt]:
        pw, ph = src[0] // dx, src[1] // dy
        n = pw * ph * b
        im = Image.frombuffer(mode, (pw, ph), mv[off:off + n], "raw", mode, 0, 1)
        off += n
        bw, bh = (x1 - x0) / dx, (y1 - y0) / dy
        bx = x0 if dx == 1 else x0 / 2 + 0.25 * (1 - 1 / k)
        by = y0 / dy
        bx, by = min(max(bx, 0.0), pw - bw), min(max(by, 0.0), ph - bh)
        r = im.resize((dst[0] // dx, dst[1] // dy), Image.BICUBIC, box=(bx, by, bx + bw, by + bh))
        data = r.tobytes()
        if mode == "I;16":   # overshoot do bicúbico acima do teto de 10 bits
            data = np.minimum(np.frombuffer(data, "<u2"), 1023).astype("<u2").tobytes()
        out.append(data)
    return b"".join(out)


def box_for(t: tuple[float, float, float], size: tuple[int, int]) -> tuple[float, float, float, float]:
    s, x0, y0 = t
    w, h = size
    return x0, y0, min(w, x0 + w / s), min(h, y0 + h / s)


def pipe_render(dec: list[str], enc: list[str], count: int, fmt: str, src: tuple[int, int], dst: tuple[int, int],
                box_at, progress=None, exact: bool = True) -> int:
    """Decodifica `count` frames crus (dec), aplica `box_at(i)` (None = passa igual; só com src == dst)
    em paralelo, na ordem, e manda para o encoder (enc). Devolve os frames escritos; `exact` exige
    todos os `count`."""
    n_in = frame_bytes(fmt, src)
    workers = max(1, threads())
    with tempfile.TemporaryFile() as derr, tempfile.TemporaryFile() as eerr, \
            ThreadPoolExecutor(workers) as pool:
        d = subprocess.Popen(dec, stdout=subprocess.PIPE, stderr=derr, bufsize=0)
        e = subprocess.Popen(enc, stdin=subprocess.PIPE, stderr=eerr, bufsize=0)
        ring = [bytearray(n_in) for _ in range(2 * workers + 3)]   # sem alocar 8 MB por frame
        queue: deque = deque()
        done = 0

        def flush(limit: int) -> None:
            nonlocal done
            while len(queue) > limit:
                item = queue.popleft()
                _write_all(e.stdin, item if isinstance(item, (bytes, bytearray)) else item.result())
                done += 1
                if progress and (done % 8 == 0 or done == count):
                    progress(done / count)

        broken = False
        try:
            for i in range(count):
                buf = ring[i % len(ring)]
                if not _read_exact(d.stdout, buf):
                    break
                box = box_at(i)
                if box is None and src == dst:
                    queue.append(buf)
                else:
                    box = box or (0.0, 0.0, float(src[0]), float(src[1]))
                    queue.append(pool.submit(warp, buf, fmt, src, box, dst))
                flush(2 * workers)
            flush(0)
        except BrokenPipeError:
            broken = True
        finally:
            for q in queue:
                if not isinstance(q, (bytes, bytearray)):
                    q.cancel()
            d.stdout.close()     # frames além de `count` não interessam: o decoder sai sozinho
            try:
                e.stdin.close()
            except BrokenPipeError:
                broken = True
            for p, wait in ((e, 600), (d, 5)):
                try:
                    p.wait(timeout=wait)
                except subprocess.TimeoutExpired:
                    p.kill()
                    p.wait()

        def tail(fh) -> str:
            fh.seek(0)
            return "\n  ".join(fh.read().decode("utf-8", "replace").strip().splitlines()[-15:])

        if broken or e.returncode != 0:
            die(f"ffmpeg (encode) falhou ({e.returncode}):\n  {tail(eerr)}")
        if done != count and (exact or not done):
            die(f"câmera: li {done} frames de {count}\n  {tail(derr)}")
        return done


def _read_exact(fh, buf: bytearray) -> bool:
    mv, got = memoryview(buf), 0
    while got < len(buf):
        n = fh.readinto(mv[got:])
        if not n:
            return False
        got += n
    return True


def _write_all(fh, data) -> None:
    mv = memoryview(data)
    while len(mv):
        n = fh.write(mv)
        mv = mv[n:]


def color_args(path: Path) -> list[str]:
    """Etiquetas de cor da fonte, repetidas no ProRes (o cru não carrega)."""
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=color_range,color_space,color_transfer,color_primaries", "-of", "json", str(path)],
                         capture_output=True, text=True).stdout
    try:
        st = (json.loads(out).get("streams") or [{}])[0]
    except json.JSONDecodeError:
        st = {}
    args = []
    for flag, key in (("-color_range", "color_range"), ("-colorspace", "color_space"),
                      ("-color_trc", "color_transfer"), ("-color_primaries", "color_primaries")):
        v = st.get(key)
        if v and v not in ("unknown", "reserved"):
            args += [flag, v]
    return args


def render_project(pdir: Path, plan: Plan, progress=None) -> Path:
    """edit/camera/aroll_cam.mov: todos os frames do aroll.mov, os de movimento recortados."""
    need("ffmpeg", "ffprobe")
    aroll = pdir / "edit" / "aroll.mov"
    out = pdir / "edit" / "camera" / "aroll_cam.mov"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(f".aroll_cam.{os.getpid()}.part.mov")
    fmt, (w, h), t = "yuv422p10le", plan.size, str(threads())
    dec = ["ffmpeg", "-v", "error", "-nostdin", "-threads", t, "-i", str(aroll), "-map", "0:v:0",
           "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", fmt, "-"]
    # etiquetas de cor na ENTRADA crua: na saída o ffmpeg 8 põe um scale para "converter" (1,6 s a mais)
    enc = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", fmt, "-s", f"{w}x{h}", "-r", str(plan.fps),
           *color_args(aroll), "-i", "-", "-map", "0:v", "-c:v", "prores", "-profile:v", "3", "-vendor", "apl0",
           "-pix_fmt", fmt, "-threads", t, "-an", str(tmp)]
    boxes = plan.transforms
    try:
        pipe_render(dec, enc, plan.frames, fmt, (w, h), (w, h),
                    lambda i: box_for(boxes[i], (w, h)) if i in boxes else None, progress)
        got = probe(tmp)
        if got.frames != plan.frames:
            die(f"aroll_cam.mov saiu com {got.frames} frames, esperado {plan.frames}")
        tmp.replace(out)
    finally:
        tmp.unlink(missing_ok=True)
    return out


# ───────── CLI ─────────

def load_preset_arg(value: str):
    """--preset: `-` (stdin), caminho de arquivo ou o JSON inline; `null`/`none` = sem câmera."""
    if value == "-":
        text = sys.stdin.read()
    elif not value.lstrip().startswith("{") and Path(value).expanduser().is_file():
        text = Path(value).expanduser().read_text(encoding="utf-8")
    else:
        text = value
    if text.strip().lower() in ("none", "null", ""):
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        die(f"--preset inválido: {e}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", required=True)
    ap.add_argument("--preset", help="preset de câmera (arquivo, JSON ou - para stdin); default: modules.camera "
                    "do edit/style.resolved.json")
    ap.add_argument("--plan-only", action="store_true", help="só rosto + moves.json, sem render")
    ap.add_argument("--force", action="store_true", help="renderiza mesmo com o stamp em dia")
    ap.add_argument("--progress", action="store_true", help="imprime TAKEKIT_PROGRESS=<0..1>")
    a = ap.parse_args()
    need("ffmpeg", "ffprobe")
    progress = Progress(a.progress)
    progress(0.0)
    pdir = project_dir(a.project)
    preset = load_preset_arg(a.preset) if a.preset else style_module(style_resolved(pdir), "camera")
    t0 = time.time()
    plan = plan_project(pdir, preset)
    if plan is None:
        print("câmera parada: sem preset de câmera, ou sem movimento nem crop (nada a renderizar)")
        progress(1.0)
        print("TAKEKIT_CAMERA=none")
        return
    moves = write_moves(pdir, plan)
    for m in plan.moves:
        print(f"  {m['unit']:5} {m['palco']} {m['move']:7} {m['from']:.3f}→{m['to']:.3f}  "
              f"f{m['startFrame']}-{m['endFrame']}  ({m['by']})")
    print(f"câmera {plan.cfg.get('id') or '?'}: {len(plan.moves)} movimentos, {len(plan.transforms)} frames com crop, "
          f"rosto {plan.detector} → {rel(moves, pdir)} (plano {time.time() - t0:.1f}s)", flush=True)
    if a.plan_only:
        progress(1.0)
        return
    if not plan.transforms:
        print("nenhum frame com crop: o compose usa o aroll.mov direto")
        progress(1.0)
        print("TAKEKIT_CAMERA=none")
        return
    out, rendered = ensure(pdir, plan, progress, a.force)
    if not rendered:
        print(f"{rel(out, pdir)} em dia (stamp {plan.stamp})")
    progress(1.0)
    print(f"TAKEKIT_CAMERA={out.resolve()}", flush=True)


if __name__ == "__main__":
    main()
