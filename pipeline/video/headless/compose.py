#!/usr/bin/env python3
"""Preview e export: FFmpeg empilha os palcos e masteriza o áudio.

Dois estágios, mesmo spec (docs/preview-export/SPEC.md):
    --quality preview (default)  edit/preview.mp4, sobrescrito a cada vez. Qualidade `quality.preview`
                                 do estilo (default 720x1280 H.264 veryfast 1,5 Mbps, AAC 128k); o
                                 grafo inteiro roda no tamanho do preview e o loudnorm é de um passe.
    --quality final              exports/<slug>-vN.mp4 (próximo livre). Qualidade `quality.export`
                                 (default 1080x1920@30 H.264 10 Mbps, máx. 12, AAC 256k, −14 LUFS /
                                 −1 dBTP / LRA 11, loudnorm em dois passes). É o botão Exportar:
                                 `--quality final --from-preview` refaz exatamente o último preview.

Por unidade (storyboard do plan.json):
    A  edit/aroll.mov no trecho da unidade
    B  edit/overlay/hostB_<u>.mov (palco_b.py) + canvas <u>_B.mov por cima
    C  creme + canvas <u>_C.mov
    D  split: B-roll em cima (campo `broll` do beat, ou edit/broll/<u>.{mov,mp4,png,jpg,jpeg};
       `broll_start` em segundos), a-roll da unidade recortado embaixo, emenda branca
Depois, a timeline inteira recebe as captions (edit/overlay/captions_*.mov) e o filmburn
(presets/filmburn-hook.json, composite Screen, pico no corte). Áudio: voz + SFX
(edit/sfx_map.json → edit/sfx_prep/) + som do burn + cama ducked.

Estilo da thread: edit/style.resolved.json (o engine grava). `modules.transitions` decide o
filmburn (null = nenhum; gancho; trocas `marked` = beats com `"transicao": "filmburn"`, `all` =
toda troca de palco), `modules.soundEffects` liga/desliga os SFX e escolhe a cama,
`modules.stage` dá a geometria do palco D, `quality` dá o encode. Sem o arquivo, vale o
Talking Head + Motions.

Câmera (`modules.camera`, camera.py): com punch/zoom ou crop no rosto, o compose garante o
edit/camera/aroll_cam.mov em dia (renderiza em processo só quando o plano muda; no --progress,
até 30 % do preview / 12 % do final) e usa esse vídeo nas unidades A com movimento e no host do
palco D; o áudio segue do aroll.mov. O spec grava `camera` (movimentos, para a timeline) e
`camera_render` (vídeo, unidades, stamp e o preset, para o --from-preview refazer o mesmo plano).
Sem preset, `parada`, ou nenhum frame com crop: spec e comando iguais aos de antes. Spec à mão
sem `camera` recebe a do estilo (hand_camera); `"camera": null` desliga.

    python3 video/headless/compose.py --project video/projects/<slug>
        [--quality preview|final] [--from-preview | --spec edit/compose.json] [--out x.mp4]
        [--music <arquivo>|none] [--progress] [--dry-run]

Cada render grava o spec exato que usou em edit/compose.resolved.json (a timeline da UI lê
esse arquivo). Exceção do vídeo: copie para edit/compose.json, ajuste e passe --spec; o bloco
`export` desse spec ainda pode mudar os bitrates do final. --progress imprime
TAKEKIT_PROGRESS=<0..1>; a última linha é TAKEKIT_PREVIEW=<mp4> ou TAKEKIT_EXPORT=<mp4>.
"""
from __future__ import annotations

import argparse, json, os, re, signal, subprocess, sys, tempfile, time
from pathlib import Path

from common import (CREAM_HEX, FPS, H, KIT, ROOT, W, Progress, beats, die, kit_file, load_cuts, merged, need, palcos,
                    probe, project_dir, quality, rel, resolution, run, stage_presets, style_module, style_resolved,
                    threads, write_atomic)

MUSIC_DEFAULT = "assets/music/arpmedia-trap-trap-hype-569432.mp3"   # cama do Talking Head + Motions
MUSIC_GAIN_DB = -25.0
CANVAS_DIRS = ("edit/overlay", "edit/motion/out", "edit/motion", "edit/motion-v2")
CAPTION_ORDER = ("face", "canvas", "hold")
FILMBURN_PRESET = "video/kit/presets/filmburn-hook.json"
TRANSITIONS_DEFAULT = {"filmburn": {"preset": FILMBURN_PRESET, "hook": True, "onStageChange": "marked"}}
STILL_EXT = {".png", ".jpg", ".jpeg", ".webp"}
BROLL_EXT = (".mov", ".mp4", ".png", ".jpg", ".jpeg")
SPLIT_DEFAULT = {"band": [0, 958], "host": [962, 1920], "crop_y": 420, "seam": [958, 962], "seam_color": "#FFFFFF",
                 "fit": "cover"}   # styles/_presets/stage/d-split.json
LOUDNESS_DEFAULT = {"I": -14, "TP": -1, "LRA": 11}


# ───────── spec ─────────

def find_canvas(pdir: Path, uid: str, palco: str) -> str | None:
    for d in CANVAS_DIRS:
        p = pdir / d / f"{uid}_{palco}.mov"
        if p.is_file():
            return rel(p, pdir)
    return None


def sfx_from_map(pdir: Path) -> list[dict]:
    mp = pdir / "edit" / "sfx_map.json"
    if not mp.is_file():
        return []
    catalog = {i["id"]: i for i in json.loads((KIT / "assets" / "sfx" / "catalog.json").read_text())["items"]}
    out, missing = [], set()
    for cue in json.loads(mp.read_text(encoding="utf-8")).get("cues", []):
        item = catalog.get(cue["catalog_id"])
        name = Path(item["file"]).stem if item else cue["catalog_id"].split("/")[-1]
        wav = pdir / "edit" / "sfx_prep" / f"{name}_prep.wav"
        if wav.is_file():
            out.append({"file": rel(wav, pdir), "at": int(cue["t_timeline_f"]), "why": cue.get("why", "")})
        else:
            missing.add(wav.name)
    if missing:
        print(f"aviso: SFX sem wav preparado ({', '.join(sorted(missing))}); rode map_sfx_cues.py --prep")
    return out


def burn_cuts(board: dict[str, dict], units, stage: dict[str, str], hook: bool = True,
              on_change: str | None = "marked") -> list[int]:
    """Frames de corte que levam filmburn: gancho (0), beats marcados `"transicao": "filmburn"`
    e, com `all`, toda troca de palco."""
    cuts = {0} if hook else set()
    mode = str(on_change or "none").lower()
    for i, u in enumerate(units):
        if i == 0 or mode not in ("marked", "all"):
            continue
        beat = board.get(u.id) or {}
        marked = str(beat.get("transicao") or beat.get("fx") or "").lower() == "filmburn"
        changed = mode == "all" and stage.get(u.id) != stage.get(units[i - 1].id)
        if marked or changed:
            cuts.add(u.start)
    return sorted(cuts)


def filmburns(cuts: list[int], preset: dict) -> tuple[list[dict], list[dict]]:
    if not cuts:
        return [], []
    asset = kit_file(preset["asset"])
    if not asset:
        print(f"aviso: {preset['asset']} não encontrado (defina TAKEKIT_ASSETS); sai sem filmburn")
        return [], []
    start, n = int(preset["start_offset"]), int(preset["length_frames"])
    lead = int(preset["peak_frame_in_asset"]) - start     # frames entre o início do burn e o pico
    sound = kit_file(preset.get("sfx"))
    fx, sfx = [], []
    for cut in cuts:
        at = 0 if cut == 0 else cut - lead                   # gancho: como no preset (rec 0); troca: pico no corte
        fx.append({"file": str(asset), "src_start": start, "frames": n, "at": at, "mode": "screen", "why": f"filmburn corte {cut}"})
        if sound:
            sfx.append({"file": str(sound), "at": at, "gain_db": float(preset.get("sfx_gain_db", 0)), "why": "som do filmburn"})
    return fx, sfx


def transitions(style: dict) -> tuple[dict | None, bool, str]:
    """(preset do filmburn ou None, burn no gancho, trocas `marked`|`all`|`none`) do módulo transitions."""
    tr = style_module(style, "transitions")
    tr = tr if isinstance(tr, dict) else TRANSITIONS_DEFAULT
    fb = tr.get("filmburn", TRANSITIONS_DEFAULT["filmburn"])
    if not fb:
        return None, False, "none"
    path = kit_file(fb.get("preset") or FILMBURN_PRESET)
    if not path:
        print(f"aviso: preset {fb.get('preset')} não encontrado; uso {FILMBURN_PRESET}")
        path = ROOT / FILMBURN_PRESET
    on_change = fb.get("onStageChange", "marked")
    return (json.loads(path.read_text(encoding="utf-8")), fb.get("hook", True) is not False,
            str(on_change).lower() if on_change else "none")


def music_bed(style: dict, music_arg: str | None) -> dict | None:
    """Cama: --music ganha; senão `modules.soundEffects.music` (null = sem cama); senão trap-hype."""
    se = style_module(style, "soundEffects")
    cfg = (se.get("music") if isinstance(se, dict) and "music" in se
           else {"file": MUSIC_DEFAULT, "gainDb": MUSIC_GAIN_DB, "duck": True})
    if music_arg == "none":
        return None
    if music_arg:
        p = Path(music_arg).expanduser()
        if not p.is_file():
            die(f"cama não encontrada: {music_arg}")
        cfg = {**(cfg or {"gainDb": MUSIC_GAIN_DB, "duck": True}), "file": str(p.resolve())}
    if not cfg:
        return None
    path = kit_file(cfg.get("file"))
    if not path:
        print(f"aviso: cama {cfg.get('file')} não encontrada (defina TAKEKIT_ASSETS ou --music); sai sem música")
        return None
    return {"file": str(path), "gain_db": float(cfg.get("gainDb", MUSIC_GAIN_DB)), "duck": cfg.get("duck", True) is not False}


def split_geometry(style: dict) -> dict:
    """Faixas do palco D (preset de palco `D` do estilo, senão d-split)."""
    d = stage_presets(style).get("D") or {}
    br, host, seam = d.get("bRoll") or {}, d.get("host") or {}, d.get("seam") or {}
    return {
        "band": list(br.get("band") or SPLIT_DEFAULT["band"]),
        "host": list(host.get("band") or SPLIT_DEFAULT["host"]),
        "crop_y": int(host.get("cropY", SPLIT_DEFAULT["crop_y"])),
        "seam": list(seam.get("band") or SPLIT_DEFAULT["seam"]),
        "seam_color": seam.get("color") or SPLIT_DEFAULT["seam_color"],
        "fit": br.get("fit") or SPLIT_DEFAULT["fit"],
    }


def find_broll(pdir: Path, uid: str, beat: dict) -> tuple[Path | None, str]:
    if beat.get("broll"):
        p = Path(str(beat["broll"])).expanduser()
        p = p if p.is_absolute() else pdir / p
        return (p if p.is_file() else None), str(beat["broll"])
    for ext in BROLL_EXT:
        p = pdir / "edit" / "broll" / f"{uid}{ext}"
        if p.is_file():
            return p, rel(p, pdir)
    return None, f"edit/broll/{uid}.{{{','.join(e[1:] for e in BROLL_EXT)}}}"


def derive_spec(pdir: Path, style: dict, music_arg: str | None) -> dict:
    _cuts, fps, units = load_cuts(pdir)
    stage = palcos(pdir, units)
    board = beats(pdir, units)
    spec_units, problems = [], []
    split = split_geometry(style) if "D" in stage.values() else None
    for u in units:
        p = stage[u.id]
        entry = {"id": u.id, "start": u.start, "end": u.end, "palco": p, "base": "aroll", "layers": []}
        if p == "B":
            host = pdir / "edit" / "overlay" / f"hostB_{u.id}.mov"
            if not host.is_file():
                problems.append(f"{u.id}: faltou hostB (rode palco_b.py)")
            entry["base"] = rel(host, pdir)
            if canvas := find_canvas(pdir, u.id, "B"):
                entry["layers"].append(canvas)
            else:
                print(f"aviso: {u.id} palco B sem canvas {u.id}_B.mov (fica só o host)")
        elif p == "C":
            entry["base"] = "cream"
            if canvas := find_canvas(pdir, u.id, "C"):
                entry["layers"].append(canvas)
            else:
                problems.append(f"{u.id}: palco C sem canvas {u.id}_C.mov")
        elif p == "D":
            beat = board.get(u.id) or {}
            broll, wanted = find_broll(pdir, u.id, beat)
            if not broll:
                problems.append(f"{u.id}: palco D sem B-roll ({wanted}; campo `broll` do beat ou edit/broll/)")
            else:
                entry["base"] = "split"
                entry["split"] = {"broll": rel(broll, pdir), "broll_start": float(beat.get("broll_start") or 0),
                                  "still": broll.suffix.lower() in STILL_EXT, **split}
            if canvas := find_canvas(pdir, u.id, "D"):
                entry["layers"].append(canvas)
        elif p != "A":
            print(f"aviso: {u.id} palco {p} desconhecido; sai como A")
            entry["palco"] = "A"
        spec_units.append(entry)
    if problems:
        die("faltam camadas:\n  " + "\n  ".join(problems))

    overlay = pdir / "edit" / "overlay"
    caps = sorted((p for p in overlay.glob("captions_*.mov") if "." not in p.stem),   # sem temporários
                  key=lambda p: (CAPTION_ORDER.index(p.stem[9:]) if p.stem[9:] in CAPTION_ORDER else 9, p.name))
    burn, hook, on_change = transitions(style)
    fx, burn_sfx = filmburns(burn_cuts(board, units, stage, hook, on_change), burn) if burn else ([], [])
    se = style_module(style, "soundEffects")
    sfx_on = not (isinstance(se, dict) and se.get("sfx") is False)
    spec = {
        "_doc": "Gerado por compose.py (plan.json + cuts.json + edit/style.resolved.json + convenções de "
                "edit/overlay). Não edite: para exceções, copie para edit/compose.json e passe --spec.",
        "fps": fps, "size": [W, H], "frames": units[-1].end, "aroll": "edit/aroll.mov",
        "units": spec_units,
        "overlays": [{"file": rel(c, pdir), "at": 0} for c in caps],
        "fx": fx,
        "audio": {"voice": "aroll", "sfx": (sfx_from_map(pdir) if sfx_on else []) + burn_sfx,
                  "music": music_bed(style, music_arg)},
    }
    cam = camera_spec(pdir, style)
    if cam:
        spec["camera"], spec["camera_render"] = cam
    if style.get("styleId"):
        spec["presets"] = {"style": style["styleId"], **preset_ids(style, ("stage", "transitions", "soundEffects"))}
        if cam:
            spec["presets"]["camera"] = cam[1]["preset"].get("id")
    return spec


def camera_spec(pdir: Path, style: dict) -> tuple[list[dict], dict] | None:
    """(movimentos, camera_render) do módulo camera (camera.py), ou None quando a câmera não mexe
    em nenhum frame (sem preset, `parada`, `marcado` sem beat marcado…): aí o spec é o de antes."""
    preset = style_module(style, "camera")
    if not isinstance(preset, dict):
        return None
    import camera   # numpy/onnxruntime só quando há câmera
    plan = camera.plan_project(pdir, preset)
    if plan is None or not plan.transforms:
        return None
    return plan.moves, {"video": "edit/camera/aroll_cam.mov", "units": plan.units, "stamp": plan.stamp,
                        "preset": preset}


def hand_camera(pdir: Path, spec: dict, style: dict) -> None:
    """Spec à mão sem `camera`: recebe a câmera do estilo (trocar o preset refaz o preview também
    nesses projetos). `"camera": null` no spec desliga; unidades diferentes do cuts.json ficam sem."""
    if "camera" in spec or "camera_render" in spec:
        return
    try:
        _cuts, _fps, units = load_cuts(pdir)
    except SystemExit:
        return
    hand = {u.get("id"): u for u in spec.get("units") or []}
    if [(u.id, u.start, u.end) for u in units] != [(k, v.get("start"), v.get("end")) for k, v in hand.items()]:
        if isinstance(style_module(style, "camera"), dict):
            print("aviso: spec à mão com unidades diferentes do cuts.json; fica sem câmera")
        return
    cam = camera_spec(pdir, style)
    if not cam:
        return
    moves, render = cam
    shown = camera_shown(spec)
    render["units"] = [u for u in render["units"] if u in shown]
    if not render["units"]:
        return
    spec["camera"] = [m for m in moves if m.get("unit") in shown]
    spec["camera_render"] = render


def camera_shown(spec: dict) -> set:
    """Unidades em que a câmera aparece: a-roll cheio (A) ou a faixa do host no split (D). O plano
    da câmera segue o plan.json; um spec à mão pode ter outro palco na mesma unidade."""
    return {u.get("id") for u in spec.get("units") or [] if u.get("palco") in ("A", "D")}


def preset_ids(style: dict, names) -> dict:
    """Ids dos presets aplicados (só informativo no spec)."""
    out = {}
    for k in names:
        m = style_module(style, k)
        out[k] = [p.get("id") for p in m if isinstance(p, dict)] if isinstance(m, list) else (
            m.get("id") if isinstance(m, dict) else None)
    return out


# ───────── filtergraph ─────────

class Graph:
    """Monta o filter_complex. Cada uso de uma entrada passa por src(): uma entrada lida em
    vários pontos ganha split/asplit explícito (sem isso o FFmpeg reparte os frames entre
    os consumidores em vez de copiar, e o SFX/burn repetido sai picotado)."""

    def __init__(self, pdir: Path):
        self.pdir, self.inputs, self.parts, self.uses = pdir, [], [], {}

    def input(self, path: str, opts: list[str] | None = None, check: bool = True) -> int:
        """Índice da entrada; `opts` vão antes do -i (ex.: -loop 1 para imagem, -ss)."""
        p = Path(path)
        p = p if p.is_absolute() else self.pdir / p
        if check and not p.is_file():
            die(f"arquivo não encontrado: {rel(p, self.pdir)}")
        key = (str(p), tuple(opts or ()))
        if key not in self.inputs:
            self.inputs.append(key)
        return self.inputs.index(key)

    def args(self) -> list[str]:
        out = []
        for path, opts in self.inputs:
            out += [*opts, "-i", path]
        return out

    def add(self, part: str) -> None:
        self.parts.append(part)

    def src(self, k: int, kind: str) -> str:
        n = self.uses.get((k, kind), 0)
        self.uses[(k, kind)] = n + 1
        return f"[i{k}{kind}{n}]"

    def graph(self) -> str:
        pre = []
        for (k, kind), n in self.uses.items():
            outs = "".join(f"[i{k}{kind}{j}]" for j in range(n))
            if n == 1:
                pre.append(f"[{k}:{kind}]{'null' if kind == 'v' else 'anull'}{outs}")
            else:
                pre.append(f"[{k}:{kind}]{'split' if kind == 'v' else 'asplit'}={n}{outs}")
        return ";".join(pre + self.parts)


def _even(v: float) -> int:
    return int(round(v / 2)) * 2


def split_unit(g: Graph, i: int, u: dict, aroll: int, fps: int, clean: str, spec_size: tuple[int, int],
               work: tuple[int, int], fmt: str, ovf: str) -> None:
    """Palco D: fundo na cor da emenda, B-roll (cover) na faixa de cima, a-roll recortado na de baixo."""
    sp = u.get("split") or {}
    if not sp.get("broll"):
        die(f"{u['id']}: palco D sem `split.broll` no spec")
    (sw, sh), (cw, ch) = spec_size, work
    sy = ch / sh
    n = u["end"] - u["start"]
    b0, b1 = (int(x) for x in sp.get("band", SPLIT_DEFAULT["band"]))
    h0, h1 = (int(x) for x in sp.get("host", SPLIT_DEFAULT["host"]))
    by, bh = _even(b0 * sy), max(2, _even(b1 * sy) - _even(b0 * sy))
    hy, hh = _even(h0 * sy), max(2, _even(h1 * sy) - _even(h0 * sy))
    crop_h = max(2, min(sh, h1 - h0))
    crop_y = max(0, min(sh - crop_h, int(sp.get("crop_y", SPLIT_DEFAULT["crop_y"]))))
    still = bool(sp.get("still")) or Path(sp["broll"]).suffix.lower() in STILL_EXT
    start = float(sp.get("broll_start") or 0)
    if still:
        k = g.input(sp["broll"], ["-loop", "1", "-framerate", str(fps), "-t", f"{n / fps:.6f}"])
    else:
        k = g.input(sp["broll"], ["-ss", f"{start:.3f}"] if start > 0 else [])
    if str(sp.get("fit") or "cover") == "contain":
        fit = f"scale={cw}:{bh}:force_original_aspect_ratio=decrease,pad={cw}:{bh}:(ow-iw)/2:(oh-ih)/2:color=black"
    else:
        fit = f"scale={cw}:{bh}:force_original_aspect_ratio=increase,crop={cw}:{bh}"
    g.add(f"{g.src(k, 'v')}fps={fps},{clean},tpad=stop_mode=clone:stop=-1,trim=end_frame={n},{fit},setsar=1{fmt}[d{i}t]")
    host = f"crop={sw}:{crop_h}:0:{crop_y}" + (f",scale={cw}:{hh}" if (cw, hh) != (sw, crop_h) else "")
    g.add(f"{g.src(aroll, 'v')}trim=start_frame={u['start']}:end_frame={u['end']},{clean},{host},setsar=1{fmt}[d{i}h]")
    seam = "0x" + str(sp.get("seam_color") or SPLIT_DEFAULT["seam_color"]).lstrip("#")
    g.add(f"color=c={seam}:s={cw}x{ch}:r={fps},trim=end_frame={n},{clean}{fmt}[d{i}bg]")
    g.add(f"[d{i}bg][d{i}t]overlay=0:{by}:format={ovf}:eof_action=repeat[d{i}a]")
    g.add(f"[d{i}a][d{i}h]overlay=0:{hy}:format={ovf}:eof_action=repeat[b{i}]")


def video_graph(g: Graph, spec: dict, size: tuple[int, int], fast: bool, out_fps: int) -> str:
    """Final: palcos no tamanho do spec e escala por segmento (validado no espelho do 05, headless/README).
    Preview (`fast`): cada camada já entra no tamanho de saída, em 8 bits, e o grafo todo
    trabalha pequeno."""
    fps = spec["fps"]
    sw, sh = (int(x) for x in (spec.get("size") or [W, H]))
    ow, oh = size
    work = (ow, oh) if fast else (sw, sh)
    aroll = g.input(spec["aroll"])
    cam = spec.get("camera_render") if isinstance(spec.get("camera_render"), dict) else {}
    cam_units, cam_k = (set(cam.get("units") or []) if cam.get("video") else set()), []

    def video_of(u: dict) -> int:
        """a-roll da unidade: o da câmera (edit/camera/aroll_cam.mov) nas unidades com movimento."""
        if u.get("id") not in cam_units:
            return aroll
        if not cam_k:   # o dry-run mostra o comando mesmo antes do render da câmera
            cam_k.append(g.input(cam["video"], check=False))
        return cam_k[0]

    clean = f"settb=1/{fps},setpts=N"          # timestamps CFR limpos antes de empilhar/concatenar
    fit = f",scale={ow}:{oh}:flags=bilinear" if fast else ""
    base_fmt = ",format=yuv420p" if fast else ""
    layer_fmt = ",format=yuva420p" if fast else ""
    ovf = "yuv420" if fast else "auto"
    segs = []
    for i, u in enumerate(spec["units"]):
        n = u["end"] - u["start"]
        if u.get("base") == "split" or (u.get("palco") == "D" and u.get("split")):
            split_unit(g, i, u, video_of(u), fps, clean, (sw, sh), work, base_fmt, ovf)
        elif u["base"] == "aroll":
            g.add(f"{g.src(video_of(u), 'v')}trim=start_frame={u['start']}:end_frame={u['end']},{clean}{fit}{base_fmt}[b{i}]")
        elif u["base"] == "cream":
            g.add(f"color=c={CREAM_HEX}:s={work[0]}x{work[1]}:r={fps},trim=end_frame={n},{clean}{base_fmt}[b{i}]")
        else:   # clipe próprio (hostB): congela o último frame se vier curto
            k = g.input(u["base"])
            g.add(f"{g.src(k, 'v')}{clean},tpad=stop_mode=clone:stop=-1,trim=end_frame={n}{fit}{base_fmt}[b{i}]")
        cur = f"b{i}"
        for j, layer in enumerate(u.get("layers", [])):
            k = g.input(layer)
            g.add(f"{g.src(k, 'v')}{clean}{fit}{layer_fmt}[l{i}_{j}]")
            g.add(f"[{cur}][l{i}_{j}]overlay=0:0:format={ovf}:eof_action=repeat[o{i}_{j}]")
            cur = f"o{i}_{j}"
        if fast:
            g.add(f"[{cur}]trim=end_frame={n},{clean},setsar=1,format=yuv420p[s{i}]")
        else:
            g.add(f"[{cur}]trim=end_frame={n},{clean},scale={ow}:{oh},setsar=1,format=yuv444p[s{i}]")
        segs.append(f"[s{i}]")
    # concat devolve outra base de tempo; sem voltar a 1/fps inteiro, o framesync do
    # overlay/blend pega o frame anterior da camada (burn/caption 1 frame atrasado)
    g.add("".join(segs) + f"concat=n={len(segs)}:v=1:a=0,{clean}[body]")
    cur = "body"
    ov_fit = fit if fast else (f",scale={ow}:{oh}" if (ow, oh) != (sw, sh) else "")
    for j, ov in enumerate(spec.get("overlays", [])):
        k = g.input(ov["file"])
        at = int(ov.get("at", 0))
        g.add(f"{g.src(k, 'v')}settb=1/{fps},setpts=N+{at}{ov_fit}{layer_fmt}[ov{j}]")
        g.add(f"[{cur}][ov{j}]overlay=0:0:format={ovf}:eof_action=pass[c{j}]")
        cur = f"c{j}"
    total = spec["frames"]
    # FX por cima das captions, como a track FX. Todos os clipes de um modo viram UMA trilha
    # sobre preto (screen com preto não muda nada) e entram num blend só.
    by_mode: dict[str, list[tuple[int, int, int, int]]] = {}
    for fx in spec.get("fx", []):
        k = g.input(fx["file"])
        s0, n, at = int(fx.get("src_start", 0)), int(fx["frames"]), int(fx["at"])
        if at < 0:
            s0, n, at = s0 - at, n + at, 0
        n = min(n, total - at)
        if n > 0:
            by_mode.setdefault(fx.get("mode", "screen"), []).append((k, s0, n, at))
    for m, clips in by_mode.items():
        g.add(f"color=c=black:s={ow}x{oh}:r={fps},trim=end_frame={total},{clean},format=gbrp[fxt_{m}]")
        track = f"fxt_{m}"
        for j, (k, s0, n, at) in enumerate(clips):
            g.add(f"{g.src(k, 'v')}trim=start_frame={s0}:end_frame={s0 + n},{clean},scale={ow}:{oh},setsar=1,"
                  f"format=gbrp,setpts=N+{at}[fxc_{m}{j}]")
            g.add(f"[{track}][fxc_{m}{j}]overlay=0:0:format=gbrp:eof_action=pass[fxt_{m}{j}]")
            track = f"fxt_{m}{j}"
        windows = "+".join(f"between(n,{at},{at + n - 1})" for _k, _s, n, at in clips)
        g.add(f"[{cur}]{clean},format=gbrp[fb_{m}]")
        g.add(f"[fb_{m}][{track}]blend=all_mode={m}:enable='{windows}'[f_{m}]")
        cur = f"f_{m}"
    rate = f",fps={out_fps}" if out_fps != fps else ""
    g.add(f"[{cur}]trim=end_frame={total}{rate},format=yuv420p[vout]")
    return "vout"


def audio_graph(g: Graph, spec: dict, loudnorm: str) -> str:
    fps, dur = spec["fps"], spec["frames"] / spec["fps"]
    audio = spec.get("audio") or {}
    st = "aformat=sample_rates=48000:channel_layouts=stereo"
    aroll = g.input(spec["aroll"])
    g.add(f"{g.src(aroll, 'a')}atrim=end={dur:.6f},asetpts=PTS-STARTPTS,{st}[voice]")
    mix = ["[vmix]"]
    music = audio.get("music")
    g.add("[voice]asplit=2[vmix][vsc]" if music and music.get("duck") else "[voice]anull[vmix]")
    for j, fx in enumerate(audio.get("sfx", [])):
        k = g.input(fx["file"])
        ms = round(max(0, int(fx["at"])) / fps * 1000)
        gain = f",volume={fx['gain_db']}dB" if fx.get("gain_db") else ""
        g.add(f"{g.src(k, 'a')}{st}{gain},adelay={ms}:all=1[x{j}]")
        mix.append(f"[x{j}]")
    if music:
        k = g.input(music["file"])
        fade = min(0.6, dur / 4)
        g.add(f"{g.src(k, 'a')}{st},atrim=end={dur:.6f},asetpts=PTS-STARTPTS,volume={music.get('gain_db', MUSIC_GAIN_DB)}dB,"
              f"afade=t=out:st={dur - fade:.6f}:d={fade:.3f}[bed]")
        if music.get("duck"):
            g.add("[bed][vsc]sidechaincompress=threshold=0.03:ratio=4:attack=15:release=250[bedd]")
            mix.append("[bedd]")
        else:
            mix.append("[bed]")
    g.add("".join(mix) + f"amix=inputs={len(mix)}:normalize=0:duration=first,{loudnorm}[aout]")
    return "aout"


def measure_loudness(pdir: Path, spec: dict, target: dict) -> dict:
    """1º passe do loudnorm: mede o mix inteiro para o 2º aplicar ganho linear."""
    g = Graph(pdir)
    ln = f"loudnorm=I={target['I']}:TP={target['TP']}:LRA={target['LRA']}:print_format=json"
    out = audio_graph(g, spec, ln)
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-v", "info", *g.args()]
    err = run(cmd + ["-filter_complex", g.graph(), "-map", f"[{out}]", "-f", "null", "-"]).stderr
    m = re.search(r"\{\s*\"input_i\"[\s\S]*?\}", err)
    if not m:
        die("não consegui medir a loudness (loudnorm sem JSON)")
    return json.loads(m.group(0))


# ───────── encode ─────────

def encode(cmd: list[str], frames: int, progress: Progress, lo: float, hi: float) -> None:
    """Roda o ffmpeg do encode. Progresso por frame (-progress pipe:1); stderr vai para um
    temporário (ler os dois pipes em série trava quando o stderr enche)."""
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace") as err:
        if progress.on:
            proc = subprocess.Popen([cmd[0], "-progress", "pipe:1", "-nostats", *cmd[1:]],
                                    stdout=subprocess.PIPE, stderr=err, text=True)
            assert proc.stdout
            try:
                for line in proc.stdout:
                    if line.startswith("frame="):
                        try:
                            progress(lo + (hi - lo) * min(1.0, int(line[6:]) / max(1, frames)))
                        except ValueError:
                            pass
                rc = proc.wait()
            finally:            # cancelado (SIGTERM do engine): o ffmpeg não fica órfão
                if proc.poll() is None:
                    proc.kill()
                    proc.wait()
        else:
            rc = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=err).returncode
        if rc != 0:
            err.seek(0)
            tail = err.read().strip().splitlines()[-25:]
            die(f"ffmpeg falhou ({rc}):\n  " + "\n  ".join(tail))


def video_codec(q: dict) -> list[str]:
    codec = str(q.get("codec") or "h264").lower()
    preset = str(q.get("preset") or "medium")
    if codec in ("h264", "avc", "libx264"):
        args = ["-c:v", "libx264", "-preset", preset, "-profile:v", "high"]
    elif codec in ("hevc", "h265", "libx265"):
        args = ["-c:v", "libx265", "-preset", preset, "-tag:v", "hvc1", "-x265-params", "log-level=error"]
    else:
        die(f"codec de vídeo não suportado: {q.get('codec')} (use h264 ou hevc)")
        raise AssertionError
    args += ["-pix_fmt", "yuv420p"]
    for flag, key in (("-b:v", "bitrate"), ("-maxrate", "maxrate"), ("-bufsize", "bufsize")):
        if q.get(key):
            args += [flag, str(q[key])]
    return args


def audio_codec(q: dict) -> list[str]:
    a = q.get("audio") or {}
    codec = str(a.get("codec") or "aac").lower()
    if codec != "aac":
        die(f"codec de áudio não suportado: {a.get('codec')} (use aac)")
    return ["-c:a", "aac", "-b:a", str(a.get("bitrate") or "256k"), "-ar", "48000"]


def aac_margin(q: dict) -> float:
    """dB a mais de folga no limiter: AAC abaixo de 192 kbps passa ~2 dB do pico (128k: +1,2 dBTP sem folga)."""
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([km]?)", str((q.get("audio") or {}).get("bitrate") or "256k").lower())
    kbps = float(m.group(1)) * {"": 0.001, "k": 1, "m": 1000}[m.group(2)] if m else 256
    return 2.0 if kbps < 192 else 0.0


def container(q: dict) -> str:
    c = str(q.get("container") or "mp4").lower().lstrip(".")
    if c not in ("mp4", "mov"):
        die(f"container não suportado: {q.get('container')} (use mp4 ou mov)")
    return c


def next_export(pdir: Path, ext: str = "mp4") -> Path:
    exports = pdir / "exports"
    exports.mkdir(parents=True, exist_ok=True)
    n = 1
    while (exports / f"{pdir.name}-v{n}.{ext}").exists():
        n += 1
    return exports / f"{pdir.name}-v{n}.{ext}"


def load_spec(pdir: Path, a: argparse.Namespace, style: dict) -> tuple[dict, str]:
    """(spec, origem). `_source` só existe quando o spec veio de um arquivo escrito à mão;
    o compose.resolved.json carrega o `_source` que já tinha. Sem `_quality`, o
    compose.resolved.json é de antes do preview/export (o compose antigo não o gravava com
    --spec): havendo edit/compose.json, é ele que vale."""
    resolved = pdir / "edit" / "compose.resolved.json"
    hand = pdir / "edit" / "compose.json"
    if a.from_preview:
        if resolved.is_file():
            spec = json.loads(resolved.read_text(encoding="utf-8"))
            if "_quality" in spec or not hand.is_file():
                return spec, "último preview (edit/compose.resolved.json)"
            print("aviso: edit/compose.resolved.json é anterior ao preview (sem _quality); uso edit/compose.json")
            a.spec = "edit/compose.json"
        elif hand.is_file():
            print("aviso: sem edit/compose.resolved.json (nenhum preview ainda); uso edit/compose.json")
            a.spec = "edit/compose.json"
        else:
            print("aviso: sem edit/compose.resolved.json (nenhum preview ainda); derivo o spec")
    if a.spec:
        sp = Path(a.spec).expanduser()
        sp = sp if sp.is_absolute() else pdir / sp
        if not sp.is_file():
            die(f"spec não encontrado: {a.spec}")
        spec = json.loads(sp.read_text(encoding="utf-8"))
        if os.path.abspath(sp) != os.path.abspath(resolved):
            spec["_source"] = rel(sp, pdir)
            hand_camera(pdir, spec, style)
        return spec, spec.get("_source") or rel(sp, pdir)
    spec = derive_spec(pdir, style, a.music)
    spec.pop("_source", None)
    return spec, "derivado"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", required=True)
    ap.add_argument("--quality", choices=("preview", "final"), help="preview (default): edit/preview.mp4; "
                    "final: exports/<slug>-vN.mp4 na qualidade de export do estilo")
    ap.add_argument("--spec", help="spec próprio (ex.: edit/compose.json)")
    ap.add_argument("--from-preview", action="store_true",
                    help="usa edit/compose.resolved.json (o spec do último preview); sem ele, deriva")
    ap.add_argument("--out", help="default: edit/preview.mp4 (preview) ou exports/<slug>-vN.mp4 (final)")
    ap.add_argument("--music", help="arquivo da cama ou `none` (default: modules.soundEffects do estilo, "
                    "senão trap-hype do Talking Head + Motions)")
    ap.add_argument("--draft", action="store_true", help=argparse.SUPPRESS)   # legado = --quality preview
    ap.add_argument("--progress", action="store_true", help="imprime TAKEKIT_PROGRESS=<0..1>")
    ap.add_argument("--dry-run", action="store_true", help="só resolve o spec e mostra o comando")
    a = ap.parse_args()
    signal.signal(signal.SIGTERM, lambda *_: sys.exit("erro: interrompido"))   # finally limpa tmp e ffmpeg
    need("ffmpeg", "ffprobe")
    if a.spec and a.from_preview:
        die("use --spec ou --from-preview, não os dois")
    if a.draft:
        if a.quality == "final":
            die("--draft é o preview; não combina com --quality final")
        print("aviso: --draft está obsoleto; use --quality preview (o default)")
    final = a.quality == "final"
    progress = Progress(a.progress)
    progress(0.0)

    pdir = project_dir(a.project)
    if not (pdir / "edit" / "aroll.mov").is_file():
        die("faltou edit/aroll.mov; rode trim.py antes")
    style = style_resolved(pdir)
    spec, origin = load_spec(pdir, a, style)
    fps = int(spec.get("fps") or FPS)
    spec.setdefault("fps", fps)
    spec.setdefault("size", [W, H])

    q = quality(style, "export" if final else "preview")
    if final and isinstance(spec.get("export"), dict):    # exceção do vídeo (spec à mão) sobre o estilo
        ex = spec["export"]
        q = merged(q, {"bitrate": ex.get("video_bitrate"), "maxrate": ex.get("maxrate"), "bufsize": ex.get("bufsize"),
                       "audio": {"bitrate": ex.get("audio_bitrate")}})
    size = resolution(q.get("resolution"), tuple(spec["size"]))
    out_fps = int(q.get("fps") or fps) if final else fps
    expected = round(spec["frames"] * out_fps / fps)
    target = merged(LOUDNESS_DEFAULT, (quality(style, "export").get("audio") or {}).get("loudness"))
    if not final:
        target = merged(target, (q.get("audio") or {}).get("loudness"))
    target = merged(target, (spec.get("audio") or {}).get("loudnorm"))
    ext = container(q)
    vcodec, acodec = video_codec(q), audio_codec(q)

    if a.out:
        out = Path(a.out).expanduser()
        out = out if out.is_absolute() else pdir / out
    else:
        out = next_export(pdir, ext) if final else pdir / "edit" / f"preview.{ext}"
    t0 = time.time()

    cam_share = 0.0          # fatia do progresso que o render da câmera usou (0 sem render)
    cam = spec.get("camera_render")
    if isinstance(cam, dict) and cam.get("video") and not a.dry_run:
        import camera
        share = 0.12 if final else 0.3
        plan, rendered = camera.ensure_for_spec(pdir, cam, lambda x: progress(x * share))
        shown = camera_shown(spec)
        spec["camera"] = [m for m in plan.moves if m.get("unit") in shown]
        cam.update(units=[u for u in plan.units if u in shown], stamp=plan.stamp)
        cam_share = share if rendered else 0.0

    def at(x: float) -> float:
        return cam_share + x * (1 - cam_share)

    measured = None
    if final and not a.dry_run:
        measured = measure_loudness(pdir, spec, target)
        progress(at(0.08))
    tp = round(float(target["TP"]) - aac_margin(q), 2)
    if measured:   # 2 passes: ganho linear medido
        ln = (f"loudnorm=I={target['I']}:TP={tp:g}:LRA={target['LRA']}"
              f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}"
              f":measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true")
    else:          # preview: 1 passe (dinâmico); o alvo é o mesmo
        ln = f"loudnorm=I={target['I']}:TP={tp:g}:LRA={target['LRA']}"
    ln += f",alimiter=limit={10 ** (tp / 20):.3f}:level=false,aresample=48000"
    g = Graph(pdir)
    vout = video_graph(g, spec, size, not final, out_fps)
    aout = audio_graph(g, spec, ln)
    cmd = ["ffmpeg", "-y", "-hide_banner", "-v", "error", *g.args(),
           "-filter_complex", g.graph(), "-filter_complex_threads", str(threads()), "-threads", str(threads()),
           "-map", f"[{vout}]", "-map", f"[{aout}]", "-r", str(out_fps), *vcodec, "-g", str(out_fps * 2),
           *acodec, "-movflags", "+faststart"]
    stage = "final" if final else "preview"
    spec["_quality"] = stage       # marca de spec gravado pelo compose de preview/export
    if a.dry_run:
        dump = pdir / "edit" / ".work" / "compose.dry-run.json"
        write_atomic(dump, json.dumps(spec, ensure_ascii=False, indent=2) + "\n")
        print(f"{stage} {size[0]}x{size[1]}@{out_fps} · spec {origin} → {rel(dump, pdir)}")
        print(" ".join(cmd + [str(out)]))
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(f".{out.stem}.{os.getpid()}.part.{ext}")
    try:
        encode(cmd + [str(tmp)], expected, progress, at(0.08 if final else 0.0), at(0.97))
        tmp.replace(out)
    finally:
        tmp.unlink(missing_ok=True)

    got = probe(out)
    if got.frames != expected:
        die(f"{stage} saiu com {got.frames} frames, esperado {expected}")
    stats = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(out), "-map", "0:a", "-af", "ebur128=peak=true",
                 "-f", "null", "-"]).stderr
    write_atomic(pdir / "edit" / "compose.resolved.json", json.dumps(spec, ensure_ascii=False, indent=2) + "\n")
    progress(1.0)
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", stats)
    peak = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", stats)
    units = spec["units"]
    print(f"palcos: " + " ".join(f"{u['id']}={u['palco']}" for u in units))
    print(f"camadas: {len(g.inputs)} arquivos · captions {len(spec.get('overlays', []))} · "
          f"filmburn {len(spec.get('fx', []))} · "
          f"sfx {len((spec.get('audio') or {}).get('sfx', []))} · cama {'sim' if (spec.get('audio') or {}).get('music') else 'não'}")
    if isinstance(spec.get("camera_render"), dict):
        moves = spec.get("camera") or []
        print(f"câmera: {spec['camera_render'].get('preset', {}).get('id') or '?'} · {len(moves)} movimentos "
              f"({', '.join(m['unit'] + ' ' + m['move'] for m in moves) or 'só crop no rosto'}) · "
              f"{spec['camera_render'].get('video')}")
    print(f"áudio: {lufs[-1] if lufs else '?'} LUFS integrado, true peak {peak[-1] if peak else '?'} dBTP")
    print(f"escrito {rel(out, pdir)}  {stage} {got.width}x{got.height}  {got.frames}f = {got.duration:.2f}s  "
          f"spec {origin}  ({time.time() - t0:.1f}s)")
    print(f"{'TAKEKIT_EXPORT' if final else 'TAKEKIT_PREVIEW'}={out.resolve()}", flush=True)


if __name__ == "__main__":
    main()
