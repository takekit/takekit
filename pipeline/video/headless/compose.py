#!/usr/bin/env python3
"""Export final sem Resolve: FFmpeg empilha os palcos do 09-jev e masteriza o áudio.

Por unidade (storyboard do plan.json):
    A  edit/aroll.mov no trecho da unidade
    B  edit/overlay/hostB_<u>.mov (palco_b.py) + canvas <u>_B.mov por cima
    C  creme + canvas <u>_C.mov
Depois, a timeline inteira recebe as captions (edit/overlay/captions_*.mov) e o filmburn
(presets/filmburn-hook.json, composite Screen, pico no corte): no gancho sempre e nas
trocas marcadas `"transicao": "filmburn"` no beat do storyboard. O áudio junta voz +
SFX (edit/sfx_map.json → edit/sfx_prep/) + som do burn + cama ducked e sai em −14 LUFS /
−1 dBTP (loudnorm em dois passes). Vídeo H.264 1080x1920@30, 8–12 Mbps.

    python3 video/headless/compose.py --project video/projects/<slug> [--out exports/x.mp4]
        [--spec edit/compose.json] [--music <arquivo>|none] [--draft] [--dry-run]

Sem --spec, o spec é derivado das convenções acima e gravado em edit/compose.resolved.json;
copie para edit/compose.json, ajuste e passe --spec para exceções do vídeo.
"""
from __future__ import annotations

import argparse, json, os, re, time
from pathlib import Path

from common import CREAM_HEX, FPS, H, KIT, W, die, load_cuts, need, palcos, probe, project_dir, rel, run, threads

MUSIC_DEFAULT = "music/arpmedia-trap-trap-hype-569432.mp3"   # cama do 09-jev (DEFAULT.md)
MUSIC_GAIN_DB = -25.0
CANVAS_DIRS = ("edit/overlay", "edit/motion/out", "edit/motion", "edit/motion-v2")
CAPTION_ORDER = ("face", "canvas", "hold")
FILMBURN = json.loads((KIT / "presets" / "filmburn-hook.json").read_text(encoding="utf-8"))


# ───────── spec ─────────

def find_asset(name: str) -> Path | None:
    """Assets pesados ficam fora do repo (assets/OMITTED.md): procura no kit e em $TAKEKIT_ASSETS."""
    roots = [KIT / "assets"]
    if os.environ.get("TAKEKIT_ASSETS"):
        roots.append(Path(os.environ["TAKEKIT_ASSETS"]).expanduser())
    for r in roots:
        if (r / name).is_file():
            return (r / name).resolve()
    return None


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


def burn_cuts(pdir: Path, units) -> list[int]:
    """Frames de corte que levam filmburn: gancho (0) + beats marcados no storyboard."""
    cuts = [0]
    plan = pdir / "edit" / "plan.json"
    if plan.is_file():
        board = json.loads(plan.read_text(encoding="utf-8")).get("storyboard") or []
        by_id = {u.id: u for u in units}
        for i, beat in enumerate(board):
            if str(beat.get("transicao") or beat.get("fx") or "").lower() != "filmburn":
                continue
            uid = beat.get("unit") or beat.get("unidade") or (units[i].id if i < len(units) else None)
            if uid in by_id and by_id[uid].start not in cuts:
                cuts.append(by_id[uid].start)
    return sorted(cuts)


def filmburns(pdir: Path, units) -> tuple[list[dict], list[dict]]:
    asset = find_asset(FILMBURN["asset"].removeprefix("assets/"))
    if not asset:
        print(f"aviso: {FILMBURN['asset']} não encontrado (defina TAKEKIT_ASSETS); sai sem filmburn")
        return [], []
    start, n = int(FILMBURN["start_offset"]), int(FILMBURN["length_frames"])
    lead = int(FILMBURN["peak_frame_in_asset"]) - start     # frames entre o início do burn e o pico
    sound = find_asset(FILMBURN["sfx"].removeprefix("assets/"))
    fx, sfx = [], []
    for cut in burn_cuts(pdir, units):
        at = 0 if cut == 0 else cut - lead                   # gancho: como no preset (rec 0); troca: pico no corte
        fx.append({"file": str(asset), "src_start": start, "frames": n, "at": at, "mode": "screen", "why": f"filmburn corte {cut}"})
        if sound:
            sfx.append({"file": str(sound), "at": at, "gain_db": float(FILMBURN.get("sfx_gain_db", 0)), "why": "som do filmburn"})
    return fx, sfx


def derive_spec(pdir: Path, music_arg: str | None) -> dict:
    _cuts, fps, units = load_cuts(pdir)
    stage = palcos(pdir, units)
    spec_units, problems = [], []
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
        spec_units.append(entry)
    if problems:
        die("faltam camadas:\n  " + "\n  ".join(problems))

    overlay = pdir / "edit" / "overlay"
    caps = sorted(overlay.glob("captions_*.mov"),
                  key=lambda p: (CAPTION_ORDER.index(p.stem[9:]) if p.stem[9:] in CAPTION_ORDER else 9, p.name))
    fx, burn_sfx = filmburns(pdir, units)
    music = None
    if music_arg != "none":
        mpath = Path(music_arg).expanduser().resolve() if music_arg else find_asset(MUSIC_DEFAULT)
        if mpath and mpath.is_file():
            music = {"file": str(mpath), "gain_db": MUSIC_GAIN_DB, "duck": True}
        else:
            print(f"aviso: cama {MUSIC_DEFAULT} não encontrada (defina TAKEKIT_ASSETS ou --music); sai sem música")
    return {
        "_doc": "Gerado por compose.py a partir de plan.json + cuts.json + convenções de edit/overlay. "
                "Para exceções, copie para edit/compose.json e passe --spec.",
        "fps": fps, "size": [W, H], "frames": units[-1].end, "aroll": "edit/aroll.mov",
        "units": spec_units,
        "overlays": [{"file": rel(c, pdir), "at": 0} for c in caps],
        "fx": fx,
        "audio": {"voice": "aroll", "sfx": sfx_from_map(pdir) + burn_sfx, "music": music,
                  "loudnorm": {"I": -14, "TP": -1, "LRA": 11}},
        "export": {"video_bitrate": "10M", "maxrate": "12M", "bufsize": "20M", "audio_bitrate": "256k"},
    }


# ───────── filtergraph ─────────

class Graph:
    """Monta o filter_complex. Cada uso de uma entrada passa por src(): uma entrada lida em
    vários pontos ganha split/asplit explícito (sem isso o FFmpeg reparte os frames entre
    os consumidores em vez de copiar, e o SFX/burn repetido sai picotado)."""

    def __init__(self, pdir: Path):
        self.pdir, self.inputs, self.parts, self.uses = pdir, [], [], {}

    def input(self, path: str) -> int:
        p = Path(path)
        p = p if p.is_absolute() else self.pdir / p
        if not p.is_file():
            die(f"arquivo não encontrado: {rel(p, self.pdir)}")
        key = str(p)
        if key not in self.inputs:
            self.inputs.append(key)
        return self.inputs.index(key)

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


def video_graph(g: Graph, spec: dict) -> str:
    fps = spec["fps"]
    aroll = g.input(spec["aroll"])
    clean = f"settb=1/{fps},setpts=N"          # timestamps CFR limpos antes de empilhar/concatenar
    segs = []
    for i, u in enumerate(spec["units"]):
        n = u["end"] - u["start"]
        if u["base"] == "aroll":
            g.add(f"{g.src(aroll, 'v')}trim=start_frame={u['start']}:end_frame={u['end']},{clean}[b{i}]")
        elif u["base"] == "cream":
            g.add(f"color=c={CREAM_HEX}:s={W}x{H}:r={fps},trim=end_frame={n},{clean}[b{i}]")
        else:   # clipe próprio (hostB): congela o último frame se vier curto
            k = g.input(u["base"])
            g.add(f"{g.src(k, 'v')}{clean},tpad=stop_mode=clone:stop=-1,trim=end_frame={n}[b{i}]")
        cur = f"b{i}"
        for j, layer in enumerate(u.get("layers", [])):
            k = g.input(layer)
            g.add(f"{g.src(k, 'v')}{clean}[l{i}_{j}]")
            g.add(f"[{cur}][l{i}_{j}]overlay=0:0:format=auto:eof_action=repeat[o{i}_{j}]")
            cur = f"o{i}_{j}"
        g.add(f"[{cur}]trim=end_frame={n},{clean},scale={W}:{H},setsar=1,format=yuv444p[s{i}]")
        segs.append(f"[s{i}]")
    # concat devolve outra base de tempo; sem voltar a 1/fps inteiro, o framesync do
    # overlay/blend pega o frame anterior da camada (burn/caption 1 frame atrasado)
    g.add("".join(segs) + f"concat=n={len(segs)}:v=1:a=0,{clean}[body]")
    cur = "body"
    for j, ov in enumerate(spec.get("overlays", [])):
        k = g.input(ov["file"])
        at = int(ov.get("at", 0))
        g.add(f"{g.src(k, 'v')}settb=1/{fps},setpts=N+{at}[ov{j}]")
        g.add(f"[{cur}][ov{j}]overlay=0:0:format=auto:eof_action=pass[c{j}]")
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
        g.add(f"color=c=black:s={W}x{H}:r={fps},trim=end_frame={total},{clean},format=gbrp[fxt_{m}]")
        track = f"fxt_{m}"
        for j, (k, s0, n, at) in enumerate(clips):
            g.add(f"{g.src(k, 'v')}trim=start_frame={s0}:end_frame={s0 + n},{clean},scale={W}:{H},setsar=1,"
                  f"format=gbrp,setpts=N+{at}[fxc_{m}{j}]")
            g.add(f"[{track}][fxc_{m}{j}]overlay=0:0:format=gbrp:eof_action=pass[fxt_{m}{j}]")
            track = f"fxt_{m}{j}"
        windows = "+".join(f"between(n,{at},{at + n - 1})" for _k, _s, n, at in clips)
        g.add(f"[{cur}]{clean},format=gbrp[fb_{m}]")
        g.add(f"[fb_{m}][{track}]blend=all_mode={m}:enable='{windows}'[f_{m}]")
        cur = f"f_{m}"
    g.add(f"[{cur}]trim=end_frame={total},format=yuv420p[vout]")
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
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-v", "info"]
    for p in g.inputs:
        cmd += ["-i", p]
    err = run(cmd + ["-filter_complex", g.graph(), "-map", f"[{out}]", "-f", "null", "-"]).stderr
    m = re.search(r"\{\s*\"input_i\"[\s\S]*?\}", err)
    if not m:
        die("não consegui medir a loudness (loudnorm sem JSON)")
    return json.loads(m.group(0))


def next_export(pdir: Path) -> Path:
    exports = pdir / "exports"
    exports.mkdir(parents=True, exist_ok=True)
    n = 1
    while (exports / f"{pdir.name}-v{n}.mp4").exists():
        n += 1
    return exports / f"{pdir.name}-v{n}.mp4"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", required=True)
    ap.add_argument("--spec", help="spec próprio (ex.: edit/compose.json)")
    ap.add_argument("--out", help="default: exports/<slug>-vN.mp4 (próximo livre)")
    ap.add_argument("--music", help="arquivo da cama ou `none` (default: trap-hype do 09-jev)")
    ap.add_argument("--draft", action="store_true", help="encode rápido para revisão (não é entrega)")
    ap.add_argument("--dry-run", action="store_true", help="só resolve o spec e mostra o comando")
    a = ap.parse_args()
    need("ffmpeg", "ffprobe")

    pdir = project_dir(a.project)
    if not (pdir / "edit" / "aroll.mov").is_file():
        die("faltou edit/aroll.mov; rode trim.py antes")
    if a.spec:
        sp = Path(a.spec)
        spec = json.loads((sp if sp.is_absolute() else pdir / sp).read_text(encoding="utf-8"))
    else:
        spec = derive_spec(pdir, a.music)
        (pdir / "edit" / "compose.resolved.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n",
                                                            encoding="utf-8")
    fps = int(spec.get("fps") or FPS)
    target = (spec.get("audio") or {}).get("loudnorm") or {"I": -14, "TP": -1, "LRA": 11}
    out = Path(a.out).expanduser() if a.out else next_export(pdir)
    out = out if out.is_absolute() else pdir / out
    t0 = time.time()

    measured = None if a.dry_run else measure_loudness(pdir, spec, target)
    ln = (f"loudnorm=I={target['I']}:TP={target['TP']}:LRA={target['LRA']}"
          + (f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}"
             f":measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true" if measured else "")
          + f",alimiter=limit={10 ** (target['TP'] / 20):.3f}:level=false,aresample=48000")
    g = Graph(pdir)
    vout = video_graph(g, spec)
    aout = audio_graph(g, spec, ln)
    ex = spec.get("export") or {}
    cmd = ["ffmpeg", "-y", "-hide_banner", "-v", "error"]
    for p in g.inputs:
        cmd += ["-i", p]
    cmd += ["-filter_complex", g.graph(), "-filter_complex_threads", str(threads()), "-threads", str(threads()),
            "-map", f"[{vout}]", "-map", f"[{aout}]", "-r", str(fps),
            "-c:v", "libx264", "-preset", "veryfast" if a.draft else "medium", "-profile:v", "high", "-pix_fmt", "yuv420p",
            "-b:v", "6M" if a.draft else ex.get("video_bitrate", "10M"), "-maxrate", ex.get("maxrate", "12M"),
            "-bufsize", ex.get("bufsize", "20M"), "-g", str(fps * 2),
            "-c:a", "aac", "-b:a", ex.get("audio_bitrate", "256k"), "-ar", "48000", "-movflags", "+faststart"]
    if a.dry_run:
        print(" ".join(cmd + [str(out)]))
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(f".{out.stem}.part.mp4")
    run(cmd + [str(tmp)])
    tmp.replace(out)

    got = probe(out)
    if got.frames != spec["frames"]:
        die(f"export saiu com {got.frames} frames, esperado {spec['frames']}")
    stats = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(out), "-map", "0:a", "-af", "ebur128=peak=true",
                 "-f", "null", "-"]).stderr
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", stats)
    peak = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", stats)
    units = spec["units"]
    print(f"palcos: " + " ".join(f"{u['id']}={u['palco']}" for u in units))
    print(f"camadas: {len(g.inputs)} arquivos · captions {len(spec.get('overlays', []))} · "
          f"filmburn {len(spec.get('fx', []))} · "
          f"sfx {len((spec.get('audio') or {}).get('sfx', []))} · cama {'sim' if (spec.get('audio') or {}).get('music') else 'não'}")
    print(f"áudio: {lufs[-1] if lufs else '?'} LUFS integrado, true peak {peak[-1] if peak else '?'} dBTP")
    print(f"escrito {rel(out, pdir)}  {got.width}x{got.height}  {got.frames}f = {got.duration:.2f}s  ({time.time() - t0:.1f}s)")


if __name__ == "__main__":
    main()
