#!/usr/bin/env python3
"""Prévia de um preset de câmera num vídeo qualquer, sem projeto (cards do módulo `camera` na UI).

    python3 video/headless/camera_preview.py --preset <arquivo.json>|<json>|- --footage <vídeo> --out clip.mp4
        [--size 540x960] [--seconds 6] [--start 2]

Pega `--seconds` do vídeo a partir de `--start` (puxado para trás se o vídeo acaba antes), enquadra
em 9:16 (cover) e simula um corte a cada ~1,5 s para os movimentos e a frequência aparecerem em
poucos segundos. O plano é o do camera.py (mesmo rodízio, intensidade, punchFrames, tracking e
suavização), com o intervalo já vencido no começo e o 1º trecho sem movimento automático: o
primeiro movimento cai no corte de 1,5 s. Com `frequency: marcado`, o 2º trecho conta como
marcado com o 1º movimento do preset (para ver como é o punch). Rosto: o mesmo detector do
camera.py, no clipe reduzido. Sem áudio; H.264, faststart. `parada` = o trecho sem câmera.
"""
from __future__ import annotations

import argparse, json, time
from pathlib import Path

import camera
from common import FPS, Unit, die, need, probe, resolution

CUT_S = 1.5


def sim_units(n: int, fps: int = FPS) -> list[Unit]:
    """Trechos de ~1,5 s; um resto curto (< 0,5 s) vai para o anterior."""
    seg, out, a = max(1, round(CUT_S * fps)), [], 0
    while a < n:
        b = min(n, a + seg)
        if n - b < fps // 2:
            b = n
        out.append(Unit(f"s{len(out) + 1}", (a, b), a, b))
        a = b
    return out


def preview_plan(cfg: dict | None, units: list[Unit]) -> tuple[dict | None, dict[str, str], list[dict]]:
    """(cfg da prévia, palcos, movimentos) com os trechos simulados; tudo palco A."""
    if not camera.active(cfg):
        return None, {}, []
    cfg = {**cfg, "applyTo": ["A"]}      # a prévia mostra a câmera em si, qualquer que seja o palco
    stage = {u.id: "A" for u in units}
    board = {}
    if cfg["frequency"] == "marcado" and cfg["moves"] and len(units) > 1:
        board[units[1].id] = {"camera": cfg["moves"][0]}
    gap = camera.GAP_S.get(cfg["frequency"])
    return cfg, stage, camera.plan_moves(units, stage, board, cfg, FPS, credit0=gap, skip_first=True)


def working_size(src: tuple[int, int], out: tuple[int, int]) -> tuple[int, int]:
    """Quadro de trabalho no aspecto da saída, até 2× a saída (sobra para o zoom sem amolecer),
    nunca acima do que a fonte tem."""
    cover = max(out[0] / src[0], out[1] / src[1])        # escala que faz a fonte cobrir a saída
    f = max(1.0, min(2.0, 1.0 / cover))
    return tuple(max(2, int(round(v * f / 2)) * 2) for v in out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preset", required=True, help="preset de câmera: arquivo, JSON ou - (stdin)")
    ap.add_argument("--footage", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", default="540x960")
    ap.add_argument("--seconds", type=float, default=6.0)
    ap.add_argument("--start", type=float, default=2.0, help="segundos (default 2; puxado para trás no fim)")
    a = ap.parse_args()
    need("ffmpeg", "ffprobe")
    t0 = time.time()
    preset = camera.load_preset_arg(a.preset)
    footage = Path(a.footage).expanduser()
    if not footage.is_file():
        die(f"vídeo não encontrado: {a.footage}")
    info = probe(footage)
    out = resolution(a.size)
    dur = info.duration or info.frames / (info.fps or FPS)
    seconds = max(0.5, min(a.seconds, dur))
    start = max(0.0, min(a.start, dur - seconds))
    n = max(1, int(seconds * FPS))
    ww, wh = working_size((info.width, info.height), out)
    prefix = (f"fps={FPS},scale={ww}:{wh}:force_original_aspect_ratio=increase:flags=bicubic,"
              f"crop={ww}:{wh},setsar=1,")
    hw = ("-hwaccel", "auto")

    units = sim_units(n)
    cfg, stage, moves = preview_plan(camera.settings(preset), units)
    track = None
    if cfg and cfg["tracking"] and (moves or cfg["base"] > 1 + camera.EPS):
        track = camera.Track(camera.track_video(footage, (ww, wh), n, camera.TRACK_STEP, start, prefix, hw), (ww, wh))
    t_track = time.time() - t0
    boxes = camera.frame_transforms(units, stage, moves, cfg, track, (ww, wh)) if cfg else {}

    dec = ["ffmpeg", "-v", "error", "-nostdin", *hw, "-ss", f"{start:.3f}", "-i", str(footage), "-map", "0:v:0",
           "-vf", f"{prefix}trim=end_frame={n}", "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"]
    dest = Path(a.out).expanduser()
    dest.parent.mkdir(parents=True, exist_ok=True)
    enc = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{out[0]}x{out[1]}",
           "-r", str(FPS), "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709",
           "-color_primaries", "bt709", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
           "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", str(FPS * 2), "-movflags", "+faststart", "-an", str(dest)]
    got = camera.pipe_render(dec, enc, n, "yuv420p", (ww, wh), out,
                             lambda i: camera.box_for(boxes[i], (ww, wh)) if i in boxes else None, exact=False)
    cuts = " ".join(f"{u.start / FPS:.1f}s" for u in units[1:])
    what = ", ".join(f"{m['unit']} {m['move']} {m['from']:.2f}→{m['to']:.2f}" for m in moves) or (
        "só crop no rosto" if cfg else "câmera parada")
    print(f"câmera {(preset or {}).get('id') or '-'}: cortes simulados em {cuts or '-'} · {what} · "
          f"rosto {track.detector if track else 'não usado'} ({t_track:.1f}s)")
    print(f"escrito {dest}  {out[0]}x{out[1]}  {got}f  trecho {start:.1f}s+{got / FPS:.1f}s  ({time.time() - t0:.1f}s)")


if __name__ == "__main__":
    main()
