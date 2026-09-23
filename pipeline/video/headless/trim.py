#!/usr/bin/env python3
"""Fala montada sem Resolve: corta os ranges do cuts.json com FFmpeg, num passe só.

Substitui o AppendToTimeline. Decodifica a fonte uma vez, recorta cada unidade no
frame exato (fim exclusivo, como no cuts.json), aplica microfade de 4 ms no áudio
de cada emenda (clique, não respiro) e concatena. Rode depois do tighten_cuts.py.

    python3 video/headless/trim.py --project video/projects/<slug> [--source <fonte>]

Escreve:
    edit/aroll.mov    ProRes 422 1080x1920@fps + PCM 48k (base dos palcos A/B)
    edit/aroll.json   unidade → frames na fonte e na timeline montada
    edit/voice.wav    voz montada, 48k mono (referência de LUFS do sfx_prep.py)
"""
from __future__ import annotations

import argparse, json, time

from common import H, W, die, load_cuts, need, probe, project_dir, rel, run, source_path, threads, timecode

FADE_S = 0.004


def build_graph(units, fps: int, src_fps: float, has_audio: bool) -> str:
    n = len(units)
    fix_fps = f",fps={fps}" if abs(src_fps - fps) > 0.01 else ""
    parts = [f"[0:v]scale={W}:{H}:flags=lanczos,setsar=1{fix_fps},split={n}" + "".join(f"[s{i}]" for i in range(n))]
    for i, u in enumerate(units):
        a, b = u.src
        parts.append(f"[s{i}]trim=start_frame={a}:end_frame={b},setpts=PTS-STARTPTS[v{i}]")
    if has_audio:
        parts.append(f"[0:a]aresample=48000,asplit={n}" + "".join(f"[r{i}]" for i in range(n)))
        for i, u in enumerate(units):
            a, b = u.src
            dur = (b - a) / fps
            parts.append(
                f"[r{i}]atrim=start={a / fps:.6f}:end={b / fps:.6f},asetpts=PTS-STARTPTS,"
                f"afade=t=in:d={FADE_S},afade=t=out:st={max(0.0, dur - FADE_S):.6f}:d={FADE_S}[a{i}]"
            )
        parts.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[v][a]")
    else:
        parts.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[v]")
    return ";".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", required=True)
    ap.add_argument("--source", help="fonte (default: `source` do cuts.json, no projeto ou em input/)")
    a = ap.parse_args()
    need("ffmpeg", "ffprobe")

    pdir = project_dir(a.project)
    cuts, fps, units = load_cuts(pdir)
    src = source_path(pdir, cuts, a.source)
    info = probe(src)
    last = max(u.src[1] for u in units)
    if last > info.frames + 1:
        die(f"cuts.json vai até o frame {last}, a fonte tem {info.frames}")

    edit = pdir / "edit"
    out, voice = edit / "aroll.mov", edit / "voice.wav"
    tmp = edit / f".aroll.{int(time.time())}.mov"   # nunca sobrescreve pela metade
    graph = build_graph(units, fps, info.fps, info.has_audio)
    cmd = ["ffmpeg", "-y", "-v", "error", "-hwaccel", "auto", "-i", str(src),
           "-filter_complex", graph, "-filter_complex_threads", str(threads()), "-threads", str(threads()),
           "-map", "[v]", "-c:v", "prores_ks", "-profile:v", "2", "-pix_fmt", "yuv422p10le", "-r", str(fps)]
    if info.has_audio:
        cmd += ["-map", "[a]", "-c:a", "pcm_s16le", "-ar", "48000"]
    t0 = time.time()
    run(cmd + [str(tmp)])
    tmp.replace(out)
    if info.has_audio:
        run(["ffmpeg", "-y", "-v", "error", "-i", str(out), "-vn", "-ac", "1", "-ar", "48000", str(voice)])

    total = units[-1].end
    got = probe(out)
    if got.frames != total:
        die(f"aroll.mov saiu com {got.frames} frames, esperado {total}")
    (edit / "aroll.json").write_text(json.dumps({
        "_doc": "Fala montada por trim.py (FFmpeg). start/end = frames na timeline; src = frames na fonte (fim exclusivo).",
        "source": rel(src, pdir), "fps": fps, "size": [W, H], "frames": total,
        "units": [{"id": u.id, "src": list(u.src), "start": u.start, "end": u.end, "text": u.text} for u in units],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for u in units:
        print(f"{u.id:5} fonte {u.src[0]:5d}-{u.src[1]:5d} → timeline {timecode(u.start, fps)}  {u.frames:4d}f  {u.text[:44]}")
    print(f"escrito {rel(out, pdir)}  {total}f = {total / fps:.2f}s  ({time.time() - t0:.1f}s)")


if __name__ == "__main__":
    main()
