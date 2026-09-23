#!/usr/bin/env python3
"""Captura de frame sem Resolve: FFmpeg tira o quadro exato de qualquer vídeo do projeto.

Substitui o capture_frame.py (still do Resolve). Aceita frame (`72`), timecode
(`00:00:02:12`) ou segundos (`2.4s`); repita --at para vários. Com --sheet, monta uma
prancha lado a lado para revisão. Um still não valida movimento, áudio ou cortes (WORKFLOW §5).

    python3 video/headless/frame.py --project video/projects/<slug> --at 72 --at 00:00:10:00 [--sheet]
    python3 video/headless/frame.py --video exports/x.mp4 --at 2.4s --out /tmp/stills

Sem --video, usa o export mais recente do projeto (ou edit/aroll.mov). Saída padrão: edit/stills/.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from common import FPS, die, need, probe, project_dir, rel, run, timecode, to_frame


def pick_video(pdir: Path) -> Path:
    exports = sorted((pdir / "exports").glob("*.mp4"), key=lambda p: p.stat().st_mtime)
    if exports:
        return exports[-1]
    if (pdir / "edit" / "aroll.mov").is_file():
        return pdir / "edit" / "aroll.mov"
    die("sem export nem edit/aroll.mov no projeto; passe --video")
    raise AssertionError


def grab(video: Path, frame: int, fps: float, dest: Path, width: int | None) -> None:
    vf = f"scale={width}:-2" if width else "null"
    # -ss antes do -i: seek preciso (decodifica do keyframe e descarta até o frame pedido)
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{frame / fps:.6f}", "-i", str(video),
         "-frames:v", "1", "-vf", vf, str(dest)])
    if not dest.is_file():
        die(f"não saiu o frame {frame} de {video.name}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project")
    ap.add_argument("--video")
    ap.add_argument("--at", action="append", required=True, help="frame, hh:mm:ss:ff ou 2.4s (repetível)")
    ap.add_argument("--out", help="pasta de saída (default: <projeto>/edit/stills ou ./stills)")
    ap.add_argument("--width", type=int, help="redimensiona (ex.: 540)")
    ap.add_argument("--sheet", action="store_true", help="também grava uma prancha lado a lado")
    a = ap.parse_args()
    need("ffmpeg", "ffprobe")
    if not a.project and not a.video:
        die("passe --project ou --video")

    pdir = project_dir(a.project) if a.project else None
    video = Path(a.video).expanduser() if a.video else pick_video(pdir)
    if not video.is_absolute() and pdir:
        video = pdir / video
    if not video.is_file():
        die(f"vídeo não encontrado: {video}")
    info = probe(video)
    fps = info.fps or FPS
    out = Path(a.out).expanduser() if a.out else (pdir / "edit" / "stills" if pdir else Path("stills"))
    out.mkdir(parents=True, exist_ok=True)

    files = []
    for spec in a.at:
        n = to_frame(spec, round(fps))
        if not 0 <= n < info.frames:
            die(f"{spec} → frame {n} fora do vídeo (0..{info.frames - 1})")
        dest = out / f"{video.stem}_f{n:05d}.png"
        grab(video, n, fps, dest, a.width)
        files.append(dest)
        print(f"{timecode(n, round(fps))}  frame {n:5d}  → {rel(dest, pdir) if pdir else dest}")
    if a.sheet and len(files) > 1:
        sheet = out / f"{video.stem}_sheet.png"
        cmd = ["ffmpeg", "-y", "-v", "error"]
        for f in files:
            cmd += ["-i", str(f)]
        w = a.width or 360
        chain = "".join(f"[{i}:v]scale={w}:-2[s{i}];" for i in range(len(files)))
        cmd += ["-filter_complex", chain + "".join(f"[s{i}]" for i in range(len(files))) + f"hstack={len(files)}",
                str(sheet)]
        run(cmd)
        print(f"prancha → {rel(sheet, pdir) if pdir else sheet}")


if __name__ == "__main__":
    main()
