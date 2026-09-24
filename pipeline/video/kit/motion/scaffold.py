#!/usr/bin/env python3
"""Prepara edit/motion/ com o kit e um stub por beat B/C.

    python3 video/kit/motion/scaffold.py --project video/projects/<slug>

Não escolhe a cena. Escreve palco, frames e a faixa útil. O agente anima o
objeto da cláusula com as skills de motion, dentro de <StageB>/<StageC>.
"""
from __future__ import annotations

import argparse, json, os, shutil, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]

STUB = '''import React from 'react';
import {{useCurrentFrame, useVideoConfig}} from 'remotion';
import {{Stage{palco}}} from '../kit/Stage';

/**
 * {uid} — palco {palco}, {frames} f.
 * Objeto: {objeto}
 * Faixa útil (tela): {faixa}
 * Caption do outro agente: {quiet} — não pintar.
 */
export const {comp}: React.FC = () => {{
  const frame = useCurrentFrame();
  const {{durationInFrames: duration}} = useVideoConfig();
  return <Stage{palco}>{{/* skill: animar o objeto; usar <Enter> */}}</Stage{palco}>;
}};
'''

INDEX_HEAD = """import type React from 'react';
"""

FAIXA = {
    'B': 'x 80–1000, y 180–620',
    'C': 'x 80–1000, y 200–1400',
}
QUIET = {
    'B': 'y 640–800',
    'C': 'y 1500–1750',
}


def palco_of(plan: dict, uid: str, idx: int) -> tuple[str, str]:
    sb = plan.get('storyboard') or []
    for b in sb:
        bid = str(b.get('id') or '')
        if bid == uid or bid.replace('b', 'u') == uid:
            return b.get('palco') or '', b.get('visual_previsto') or ''
    if idx < len(sb):
        return sb[idx].get('palco') or '', sb[idx].get('visual_previsto') or ''
    return '', ''


def link_or_copy(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() or dest.is_symlink():
        return
    try:
        os.symlink(src, dest)
    except OSError:
        if src.is_dir():
            shutil.copytree(src, dest)
        else:
            shutil.copy2(src, dest)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--project', required=True)
    a = ap.parse_args()
    pdir = Path(a.project)
    if not pdir.is_absolute():
        pdir = REPO / pdir
    plan_p = pdir / 'edit' / 'plan.json'
    cuts_p = pdir / 'edit' / 'cuts.json'
    if not cuts_p.is_file():
        sys.exit(f'falta {cuts_p}')
    plan = json.loads(plan_p.read_text()) if plan_p.is_file() else {}
    cuts = json.loads(cuts_p.read_text())

    dest = pdir / 'edit' / 'motion'
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'src' / 'beats').mkdir(parents=True, exist_ok=True)

    for name in ('package.json', 'remotion.config.ts', 'tsconfig.json'):
        link_or_copy(HERE / name, dest / name)
    link_or_copy(HERE / 'src' / 'kit', dest / 'src' / 'kit')
    link_or_copy(HERE / 'src' / 'patterns.tsx', dest / 'src' / 'patterns.tsx')
    link_or_copy(HERE / 'src' / 'spec.ts', dest / 'src' / 'spec.ts')
    link_or_copy(HERE / 'public', dest / 'public')
    link_or_copy(HERE / 'tools', dest / 'tools')
    shutil.copy2(HERE / 'src' / 'index.ts', dest / 'src' / 'index.ts')
    shutil.copy2(HERE / 'src' / 'Root.tsx', dest / 'src' / 'Root.tsx')

    beats_meta = []
    exports = []
    imports = []
    for i, c in enumerate(cuts.get('cuts') or []):
        uid = c['id']
        src = c.get('src') or [0, 0]
        frames = int(src[1]) - int(src[0])
        palco, visual = palco_of(plan, uid, i)
        if palco not in ('B', 'C'):
            continue
        comp = uid.upper()
        stub = dest / 'src' / 'beats' / f'{uid}.tsx'
        if not stub.is_file():
            stub.write_text(STUB.format(
                uid=uid, palco=palco, frames=frames, comp=comp,
                objeto=visual or '(preencher a partir da cláusula)',
                faixa=FAIXA[palco], quiet=QUIET[palco],
            ))
            print('stub', stub)
        imports.append(f"import {{{comp}}} from './{uid}';")
        exports.append(f"  {{id: '{uid}', Comp: {comp}}},")
        beats_meta.append({'id': uid, 'palco': palco, 'frames': frames, 'objeto': visual})

    idx = dest / 'src' / 'beats' / 'index.ts'
    if not idx.is_file():
        idx.write_text(
            INDEX_HEAD
            + '\n'.join(imports) + '\n\n'
            + "export type BeatDef = {id: string; Comp: React.FC};\n\n"
            + 'export const BEATS: BeatDef[] = [\n' + '\n'.join(exports) + '\n];\n'
        )

    payload = {
        'project': plan.get('project') or pdir.name,
        'fps': 30,
        'beats': beats_meta,
    }
    for job in (dest / 'beats.json', dest / 'src' / 'project' / 'beats.json'):
        job.parent.mkdir(parents=True, exist_ok=True)
        if not job.is_file():
            job.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
            print('escrito', job)
    print(f'{len(beats_meta)} beat(s) B/C. Anime com as skills; não saia da faixa.')


if __name__ == '__main__':
    main()

