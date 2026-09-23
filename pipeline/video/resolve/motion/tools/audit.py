#!/usr/bin/env python3
"""Auditoria objetiva dos stills do canvas — o portão antes de renderizar o lote.

    python3 tools/audit.py u01 B out/_chk_u01_f*.png
    python3 tools/audit.py u01 B --frames 0,14,28,42,55,56 out/*.png

Confere o que o olho não confere em 12 beats:
  - palco B: alfa exatamente 0 abaixo de y=960 (regra dura do brief)
  - nada opaco em y<180, a zona que a UI do Instagram cobre no Reels
  - conteúdo dentro da faixa de trabalho do palco, com folga só para sombra
  - faixa da caption quase vazia (é do outro agente)
  - nada colidindo com a cabeça do host no palco B
  - dois frames seguidos do fim nunca são idênticos (nada estaciona)

Sai com código 1 se qualquer beat falhar.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

CREAM = np.array([244, 239, 230])
SPLIT_Y = 960
HEAD_ZONE = (300, 780, 780, 960)  # x0, y0, x1, y1 — cabeça do host no bake do palco B

# faixa de trabalho + faixa quieta, por palco (coordenada final de tela)
BOX = {
    'B': (80, 180, 1000, 640),
    'C': (80, 200, 1000, 1400),
}
QUIET = {
    'B': (0, 640, 1080, 800),
    'C': (0, 1500, 1080, 1750),
}
# a UI do Instagram come o topo do Reels: nada opaco pode viver aqui
IG_SAFE_TOP = 180
SHADOW_TOL = 40  # px de folga lateral para sombra de placa


def load(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert('RGBA')).astype(int)


def content_mask(a: np.ndarray, stage: str) -> np.ndarray:
    """O que o overlay desenha. No B o fundo é transparente; no C é creme."""
    if stage == 'B':
        return a[:, :, 3] > 8
    diff = np.abs(a[:, :, :3] - CREAM).sum(2)
    return (a[:, :, 3] > 8) & (diff > 26)


def audit(uid: str, stage: str, frames: list[tuple[int, Path]]) -> list[str]:
    problems: list[str] = []
    mask_by_frame: list[tuple[int, np.ndarray]] = []
    pixel_by_frame: list[tuple[int, np.ndarray]] = []
    traj: list[tuple[int, float, float, int]] = []

    for idx, path in frames:
        if not path.exists():
            problems.append(f'{path.name}: ausente')
            continue
        a = load(path)
        m = content_mask(a, stage)
        mask_by_frame.append((idx, m))
        pixel_by_frame.append((idx, a))

        if stage == 'B':
            below = a[SPLIT_Y:, :, 3] > 0
            n = int(below.sum())
            if n:
                problems.append(f'f{idx}: {n} px com alfa abaixo de y=960')

        ys, xs = np.nonzero(m)
        if len(ys) == 0:
            problems.append(f'f{idx}: canvas vazio')
            continue
        traj.append((idx, float(xs.mean()), float(ys.mean()), int(len(ys))))

        x0, y0, x1, y1 = BOX[stage]
        if xs.min() < x0 - SHADOW_TOL or xs.max() > x1 + SHADOW_TOL:
            problems.append(
                f'f{idx}: conteúdo fora do eixo x da faixa ({xs.min()}..{xs.max()}, faixa {x0}..{x1})'
            )
        if ys.min() < y0 or ys.max() > y1:
            problems.append(
                f'f{idx}: conteúdo fora do eixo y da faixa ({ys.min()}..{ys.max()}, faixa {y0}..{y1})'
            )

        topo = int(m[:IG_SAFE_TOP].sum())
        if topo:
            problems.append(f'f{idx}: {topo} px na zona morta da UI do IG (y<{IG_SAFE_TOP})')

        qx0, qy0, qx1, qy1 = QUIET[stage]
        quiet_px = int(m[qy0:qy1, qx0:qx1].sum())
        if quiet_px > 900:
            problems.append(f'f{idx}: {quiet_px} px invadindo a faixa da caption ({qy0}..{qy1})')

        if stage == 'B':
            hx0, hy0, hx1, hy1 = HEAD_ZONE
            head_px = int(m[hy0:hy1, hx0:hx1].sum())
            if head_px > 200:
                problems.append(f'f{idx}: {head_px} px sobre a cabeça do host')

    # liveness: os dois últimos frames do beat não podem ser idênticos.
    # Conta PIXEL que mudou de forma perceptível, não a média do quadro: o canvas
    # é 97% vazio, então a média global dilui a deriva (0,2-0,4 px/f) até virar
    # ruído. O que interessa é se alguma aresta ou glifo se moveu.
    if len(pixel_by_frame) >= 2:
        (i0, a0), (i1, a1) = pixel_by_frame[-2], pixel_by_frame[-1]
        changed = int((np.abs(a1 - a0).sum(2) > 6).sum())
        if changed < 300:
            problems.append(f'f{i0}→f{i1}: só {changed} px mudaram — o canvas estacionou')

    if traj:
        print('  trajetória (centro de massa do que está desenhado):')
        anterior = None
        for idx, cx, cy, n in traj:
            passo = ''
            if anterior is not None:
                passo = f'  Δ={abs(cx - anterior[0]) + abs(cy - anterior[1]):6.2f} px'
            print(f'    f{idx:<4} cx={cx:7.2f} cy={cy:7.2f} px={n:<7}{passo}')
            anterior = (cx, cy)

    return problems


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('uid')
    ap.add_argument('stage', choices=['B', 'C'])
    ap.add_argument('files', nargs='+')
    a = ap.parse_args()

    frames = []
    for f in a.files:
        p = Path(f)
        digits = ''.join(c for c in p.stem.split('_')[-1] if c.isdigit())
        frames.append((int(digits) if digits else len(frames), p))

    problems = audit(a.uid, a.stage, frames)
    if problems:
        print(f'FALHA {a.uid} ({a.stage}) — {len(frames)} frames')
        for p in problems:
            print('  -', p)
        sys.exit(1)
    print(f'ok   {a.uid} ({a.stage}) — {len(frames)} frames conferidos')


if __name__ == '__main__':
    main()
