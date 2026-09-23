#!/usr/bin/env python3
"""Confere que todo texto do canvas existe na fonte que o desenha.

Alvito é uma DEMO da Fontspring: tem só ASCII (95 glifos) — nenhum acento, nem
'×', nem '→'. Hetrixo ExtraBold tem os acentos do português. Trocar as duas
degola o texto em silêncio (o Chrome cai no fallback e o frame sai com a fonte
errada), então isto roda antes do lote.

    python3 tools/lint_glyphs.py            # varre src/
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parents[1]
SANS_OTF = HERE / 'public' / 'fonts' / 'hetrixotypeface-extrabold.otf'
CURSIVE_OTF = HERE / 'public' / 'fonts' / 'fontspring-demo-alvitonovacomp-bold.otf'


def cmap_of(path: Path) -> set[str]:
    font = TTFont(str(path))
    return {chr(c) for c in font.getBestCmap()}


# texto entre tags, e só isso: começa em letra/dígito, não atravessa linha e não
# contém `{`/`}`. Sem as três travas, o `=>` de uma arrow function casa com o
# `</` do componente seguinte e o lint acusa o comentário inteiro.
JSX_TEXT = re.compile(r'>\s*([A-Za-zÀ-ÿ0-9][^<>{}\n]*?)\s*<')
ATTR_STR = re.compile(r'\b(?:label|value|eyebrow|title)\s*=\s*"([^"]*)"')
ACCENT = re.compile(r'<Accent[^>]*>([^<]+)</Accent>', re.S)


def check(path: Path, sans: set[str], cursive: set[str]) -> list[str]:
    src = path.read_text(encoding='utf-8')
    problems: list[str] = []

    def bad(text: str, allowed: set[str], where: str) -> None:
        missing = sorted({c for c in text if c not in allowed and not c.isspace()})
        if missing:
            problems.append(f'{path.name}: {where} → sem glifo: {" ".join(repr(c) for c in missing)}  ({text!r})')

    for m in ACCENT.finditer(src):
        bad(m.group(1), cursive, 'Accent (Alvito)')

    accent_spans = [(m.start(), m.end()) for m in ACCENT.finditer(src)]
    for m in JSX_TEXT.finditer(src):
        if any(a <= m.start() < b for a, b in accent_spans):
            continue
        bad(m.group(1), sans, 'texto JSX (Hetrixo)')

    for m in ATTR_STR.finditer(src):
        bad(m.group(1), sans, 'atributo (Hetrixo)')

    return problems


def main() -> None:
    sans, cursive = cmap_of(SANS_OTF), cmap_of(CURSIVE_OTF)
    files = sorted((HERE / 'src').rglob('*.tsx'))
    problems: list[str] = []
    for f in files:
        problems.extend(check(f, sans, cursive))
    if problems:
        print(f'FALHA — {len(problems)} texto(s) sem glifo:')
        for p in problems:
            print('  -', p)
        sys.exit(1)
    print(f'ok   glifos — {len(files)} arquivos, nenhum texto sem glifo')


if __name__ == '__main__':
    main()
