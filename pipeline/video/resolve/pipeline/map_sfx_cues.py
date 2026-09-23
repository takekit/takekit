#!/usr/bin/env python3
"""Mapeia sfx-cues.json (tempo local ao beat) → catálogo + frame na timeline.

    python3 video/resolve/pipeline/map_sfx_cues.py \
        --project video/projects/<slug> \
        --cues video/projects/<slug>/edit/motion/sfx-cues.json \
        --voice video/projects/<slug>/edit/audio-16k.wav

Escreve edit/sfx_map.json e, se --prep, gera os wavs em edit/sfx_prep/ via sfx_prep.py.
kind → id do catálogo (travado; não escolher de ouvido a cada vídeo).
"""
from __future__ import annotations

import argparse, json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent
SFX_PREP = ROOT / 'engine' / 'sfx_prep.py'

KIND_TO_ID = {
    'snap': 'snap/snap_finger',
    'click': 'foley/mixkit_click_1',
    'whoosh': 'whoosh/whoosh_swoosh_01',
    'riser': 'riser/riser_metallic',
    'reveal': 'reveal/reveal_logo_element_01',
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--project', required=True)
    ap.add_argument('--cues')
    ap.add_argument('--voice')
    ap.add_argument('--prep', action='store_true')
    a = ap.parse_args()

    pdir = Path(a.project)
    if not pdir.is_absolute():
        pdir = REPO / pdir
    cuts = json.loads((pdir / 'edit' / 'cuts.json').read_text())
    cues_p = Path(a.cues) if a.cues else pdir / 'edit' / 'motion' / 'sfx-cues.json'
    if not cues_p.is_absolute():
        cues_p = REPO / cues_p
    cues = json.loads(cues_p.read_text())

    # posição na timeline = soma das durações anteriores (cuts em ordem)
    t = 0
    pos = {}
    for c in cuts.get('cuts') or []:
        src = c['src']
        dur = int(src[1]) - int(src[0])
        pos[c['id']] = t
        t += dur

    mapped = []
    for cue in cues:
        uid = cue['uid']
        kind = cue['kind']
        if kind not in KIND_TO_ID:
            sys.exit(f'kind desconhecido: {kind} (use {sorted(KIND_TO_ID)})')
        if uid not in pos:
            sys.exit(f'cue {uid} sem corte em cuts.json')
        mapped.append({
            'uid': uid,
            'kind': kind,
            'catalog_id': KIND_TO_ID[kind],
            't_local_f': int(cue['t_local_f']),
            't_timeline_f': pos[uid] + int(cue['t_local_f']),
            'why': cue.get('why', ''),
        })

    out = pdir / 'edit' / 'sfx_map.json'
    out.write_text(json.dumps({
        '_doc': 'kind→catálogo travado. t_timeline_f é o frame na fala montada.',
        'kind_to_id': KIND_TO_ID,
        'cues': mapped,
    }, ensure_ascii=False, indent=2) + '\n')
    print('escrito', out, f'({len(mapped)} cues)')

    if a.prep:
        voice = a.voice or str(pdir / 'edit' / 'audio-16k.wav')
        dest = pdir / 'edit' / 'sfx_prep'
        dest.mkdir(parents=True, exist_ok=True)
        ids = sorted({m['catalog_id'] for m in mapped})
        cmd = [sys.executable, str(SFX_PREP), '--voice', voice, '--out', str(dest), *ids]
        subprocess.check_call(cmd)


if __name__ == '__main__':
    main()
