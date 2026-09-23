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

import numpy as np

W, H = 1080, 1920
SPLIT_Y = 960
IG_SAFE_TOP = 180
CREAM = np.array([244, 239, 230])

FRAMES = {
    'u01': 57, 'u03': 40, 'u04': 32, 'u05': 75, 'u07': 36, 'u08': 71,
    'u09': 48, 'u10': 35, 'u11': 67, 'u12': 56, 'u13': 190, 'u14': 57,
}
STAGE = {
    'u01': 'B', 'u03': 'C', 'u04': 'B', 'u05': 'C', 'u07': 'B', 'u08': 'C',
    'u09': 'B', 'u10': 'B', 'u11': 'B', 'u12': 'B', 'u13': 'C', 'u14': 'B',
}
BAND = {'B': (180, 620), 'C': (200, 1400)}


def decode(path: str) -> np.ndarray:
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 4)


def check(uid: str) -> list[str]:
    stage = STAGE[uid]
    path = f'{uid}_{stage}.mov'
    problems: list[str] = []

    meta = json.loads(subprocess.run(
        ['ffprobe', '-v', 'error', '-count_frames', '-show_entries',
         'stream=codec_type,profile,nb_read_frames', '-of', 'json', path],
        capture_output=True, text=True,
    ).stdout)
    video = [s for s in meta['streams'] if s['codec_type'] == 'video'][0]
    audio = [s for s in meta['streams'] if s['codec_type'] == 'audio']

    if int(video['nb_read_frames']) != FRAMES[uid]:
        problems.append(f'{video["nb_read_frames"]} frames, esperado {FRAMES[uid]}')
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
    uids = sys.argv[1:] or list(FRAMES)
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
