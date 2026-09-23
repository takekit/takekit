#!/usr/bin/env python3
"""ASCII/preview do canvas — conferência de layout sem depender de imagem.

    python3 tools/preview.py out/_chk_u01_f56.png --box 40,20,1000,620

O frame é composto sobre magenta para o alfa ficar visível, e a caixa é
recortada para o ASCII ter resolução útil no objeto (o frame inteiro em 100
colunas não mostra nada).
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

CHARS = ' .:-=+*#%@'


def preview(path: Path, box: tuple[int, int, int, int] | None, width: int) -> str:
    im = Image.open(path).convert('RGBA')
    if box:
        im = im.crop(box)
    # mantém a proporção de célula ~2:1 para o desenho não sair esticado
    height = max(1, int(im.height / im.width * width * 0.5))
    im = im.resize((width, height), Image.Resampling.BOX)
    px = im.load()
    lines = []
    for y in range(im.height):
        row = []
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 40:
                row.append(' ')  # alfa: papel
                continue
            over = a / 255
            r = int(r * over + 255 * (1 - over))
            g = int(g * over + 0 * (1 - over))
            b = int(b * over + 255 * (1 - over))
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            row.append(CHARS[min(9, int((1 - lum) * 9.99))])
        lines.append(''.join(row))
    return '\n'.join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('frame')
    ap.add_argument('--box', help='x0,y0,x1,y1')
    ap.add_argument('--width', type=int, default=150)
    a = ap.parse_args()
    box = tuple(int(v) for v in a.box.split(',')) if a.box else None
    print(preview(Path(a.frame), box, a.width))


if __name__ == '__main__':
    main()
