#!/usr/bin/env python3
"""Palco B sem Resolve: RVM recorta a pessoa, palco_b_composite.py monta card + cabeça vazando.

Para cada unidade de palco B do storyboard (plan.json), lê o trecho do edit/aroll.mov,
gera o alfa com o RVM e grava edit/overlay/hostB_<unidade>.mov (ProRes 4444), o mesmo
arquivo que o compose.py empilha sob o canvas B. Rode depois do trim.py.

    python3 video/headless/palco_b.py --project video/projects/<slug> [--units u01,u04] [--thresh 128]
"""
from __future__ import annotations

import argparse, shutil, sys, time

from common import FPS, KIT, die, load_cuts, need, palcos, project_dir, rel, work
from matte import Matter, matte_range

sys.path.insert(0, str(KIT / "engine"))
import palco_b_composite as pbc  # noqa: E402  (motor aprovado do 09-jev; só o layout)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", required=True)
    ap.add_argument("--units", help="lista separada por vírgula (default: todas de palco B no storyboard)")
    ap.add_argument("--thresh", type=int, default=pbc.THRESH, help="corte do alfa do RVM (0..255)")
    ap.add_argument("--keep", action="store_true", help="mantém rgb/matte em edit/.work/palco_b/")
    a = ap.parse_args()
    need("ffmpeg")

    pdir = project_dir(a.project)
    _cuts, fps, units = load_cuts(pdir)
    aroll = pdir / "edit" / "aroll.mov"
    if not aroll.is_file():
        die("faltou edit/aroll.mov; rode trim.py antes")
    by_id = {u.id: u for u in units}
    if a.units:
        wanted = [x.strip() for x in a.units.split(",") if x.strip()]
        missing = [x for x in wanted if x not in by_id]
        if missing:
            die(f"unidades desconhecidas: {', '.join(missing)}")
    else:
        stage = palcos(pdir, units)
        wanted = [u.id for u in units if stage[u.id] == "B"]
    if not wanted:
        print("nenhuma unidade de palco B no storyboard")
        return

    overlay = pdir / "edit" / "overlay"
    overlay.mkdir(parents=True, exist_ok=True)
    matter = Matter()
    t_all = time.time()
    for uid in wanted:
        u, t0 = by_id[uid], time.time()
        wdir = work(pdir, "palco_b", uid)
        n = matte_range(aroll, u.start, u.end, wdir, fps or FPS, rgb=True, matter=matter)
        dest = overlay / f"hostB_{uid}.mov"
        tmp = overlay / f".hostB_{uid}.tmp.mov"
        pbc.encode((pbc.composite_frame(wdir / f"rgb_{i:04d}.png", wdir / f"matte_{i:04d}.png", a.thresh)
                    for i in range(n)), tmp)
        tmp.replace(dest)
        mid = pbc.composite_frame(wdir / f"rgb_{n // 2:04d}.png", wdir / f"matte_{n // 2:04d}.png", a.thresh)
        mid.convert("RGB").save(overlay / f"hostB_{uid}.png")
        if not a.keep:
            shutil.rmtree(wdir, ignore_errors=True)
        print(f"{uid}: {n}f → {rel(dest, pdir)}  ({time.time() - t0:.1f}s)", flush=True)
    print(f"palco B: {len(wanted)} unidades em {time.time() - t_all:.1f}s")


if __name__ == "__main__":
    main()
