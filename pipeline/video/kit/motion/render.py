#!/usr/bin/env python3
"""Renderiza os beats de canvas a partir de beats.json.

    python3 video/kit/motion/render.py --project video/projects/<slug>
    python3 video/kit/motion/render.py --project video/projects/<slug> u01 u04

Copia o JSON do projeto para o kit, renderiza ProRes 4444 mudo com alfa, e
devolve os .mov/.png em <projeto>/edit/motion/.
"""
from __future__ import annotations

import argparse, json, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


def run(cmd: list[str], cwd: Path) -> None:
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit(f'falhou: {" ".join(cmd)}\n{p.stdout[-2000:]}\n{p.stderr[-2000:]}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--project', required=True)
    ap.add_argument('beats', nargs='*')
    ap.add_argument('--audit-only', action='store_true')
    a = ap.parse_args()

    pdir = Path(a.project)
    if not pdir.is_absolute():
        pdir = REPO / pdir
    motion = pdir / 'edit' / 'motion'
    src = motion / 'beats.json'
    if not src.is_file():
        sys.exit(f'falta {src} — rode scaffold.py primeiro')
    if not (motion / 'src' / 'beats' / 'index.ts').is_file():
        sys.exit(f'falta {motion}/src/beats — rode scaffold.py primeiro')

    job = json.loads(src.read_text())
    beats = job['beats']
    if a.beats:
        want = set(a.beats)
        beats = [b for b in beats if b['id'] in want]
        missing = want - {b['id'] for b in beats}
        if missing:
            sys.exit(f'beats ausentes no JSON: {sorted(missing)}')

    proj_json = motion / 'src' / 'project' / 'beats.json'
    proj_json.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, proj_json)

    cwd = motion
    if not (cwd / 'node_modules').is_dir():
        run(['bun', 'install'], cwd)

    out_dir = motion
    chk = motion / 'out'
    chk.mkdir(exist_ok=True)

    failed = []
    for spec in beats:
        uid, palco, n = spec['id'], spec['palco'], int(spec['frames'])
        print(f'--- {uid} ({palco}, {n} f)')
        picks = sorted({0, n // 5, (2 * n) // 5, (3 * n) // 5, n - 2, n - 1})
        files = []
        for f in picks:
            dest = chk / f'_chk_{uid}_f{f:03d}.png'
            run(['npx', 'remotion', 'still', uid, str(dest.relative_to(cwd)), '--frame', str(f), '--log', 'error'], cwd)
            files.append(str(dest))
        gate = subprocess.run(
            [sys.executable, str(cwd / 'tools' / 'audit.py'), uid, palco, *files],
            cwd=cwd, capture_output=True, text=True,
        )
        print(gate.stdout.strip() or gate.stderr.strip())
        if gate.returncode != 0:
            failed.append(uid)
            continue
        if a.audit_only:
            continue
        png = out_dir / f'{uid}_{palco}.png'
        mov = out_dir / f'{uid}_{palco}.mov'
        run(['npx', 'remotion', 'still', uid, str(png), '--frame', '6', '--log', 'error'], cwd)
        run(['npx', 'remotion', 'render', uid, str(mov), '--log', 'error'], cwd)
        print('escrito', mov)

    if failed:
        sys.exit('auditoria falhou: ' + ', '.join(failed))


if __name__ == '__main__':
    main()
