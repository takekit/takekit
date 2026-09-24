#!/usr/bin/env python3
"""Varredura do clipe inteiro — o portão final, depois de `tools/batch.py`.

    python3 tools/verify.py            # os 12
    python3 tools/verify.py u01 u07

`tools/audit.py` olha 6 stills por beat, o que é barato e pega quase tudo, mas o
extremo do percurso cai ENTRE as amostras: u01 e u07 passaram lá e mesmo assim
fechavam abaixo de y=620. Aqui cada .mov é decodificado frame a frame e o que se
mede é o pior caso real: contagem de frames, ausência de áudio, alfa abaixo da
costura, zona morta da UI do Instagram e a faixa útil do palco.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

W, H = 1080, 1920
SPLIT_Y = 960
IG_SAFE_TOP = 180
CREAM = np.array([244, 239, 230])

BAND = {'B': (180, 620), 'C': (200, 1400)}


def load_beats() -> dict:
    for p in (Path('beats.json'), Path('src/project/beats.json')):
        if p.is_file():
            job = json.loads(p.read_text())
            return {b['id']: b for b in job.get('beats') or []}
    raise SystemExit('falta beats.json')


def decode(path: str) -> np.ndarray:
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 4)


BEATS = load_beats()


def check(uid: str) -> list[str]:
    spec = BEATS.get(uid)
    if not spec:
        return [f'{uid} ausente em beats.json']
    stage = spec['palco']
    path = f'{uid}_{stage}.mov'
    problems: list[str] = []

    meta = json.loads(subprocess.run(
        ['ffprobe', '-v', 'error', '-count_frames', '-show_entries',
         'stream=codec_type,profile,nb_read_frames', '-of', 'json', path],
        capture_output=True, text=True,
    ).stdout)
    video = [s for s in meta['streams'] if s['codec_type'] == 'video'][0]
    audio = [s for s in meta['streams'] if s['codec_type'] == 'audio']

    if int(video['nb_read_frames']) != int(spec['frames']):
        problems.append(f'{video["nb_read_frames"]} frames, esperado {spec["frames"]}')
    if video['profile'] != '4444':
        problems.append(f'perfil {video["profile"]}, esperado ProRes 4444')
    if audio:
        problems.append(f'{len(audio)} faixa(s) de áudio: a entrega é muda')

    arr = decode(path)
    if stage == 'B':
        drawn = arr[:, :, :, 3] > 8
        abaixo = int((arr[:, SPLIT_Y:, :, 3] > 0).sum())
        if abaixo:
            problems.append(f'{abaixo} px com alfa abaixo de y={SPLIT_Y}')
    else:
        drawn = np.abs(arr[:, :, :, :3].astype(int) - CREAM).sum(3) > 26

    topo = int(drawn[:, :IG_SAFE_TOP].sum())
    if topo:
        problems.append(f'{topo} px na zona morta da UI do IG (y<{IG_SAFE_TOP})')

    ys = np.nonzero(drawn.any(2).any(0))[0]
    lo, hi = BAND[stage]
    if len(ys) == 0:
        problems.append('nada desenhado')
    else:
        if ys.min() < lo or ys.max() > hi:
            problems.append(f'faixa: conteúdo em {ys.min()}..{ys.max()}, permitido {lo}..{hi}')
        print(f'     {uid}: y {ys.min()}..{ys.max()} (faixa {lo}..{hi})')

    return problems


def main() -> None:
    uids = sys.argv[1:] or list(BEATS)
    bad = []
    for uid in uids:
        problems = check(uid)
        if problems:
            bad.append(uid)
            print(f'FALHA {uid}')
            for p in problems:
                print('  -', p)
    print()
    print(f'passaram: {" ".join(u for u in uids if u not in bad) or "-"}')
    print(f'falharam: {" ".join(bad) or "-"}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
