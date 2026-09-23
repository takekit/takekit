#!/usr/bin/env python3
"""Renderiza e audita o lote inteiro — e só então promove a entrega.

    python3 tools/batch.py                 # tudo
    python3 tools/batch.py u01 u13         # só alguns beats
    python3 tools/batch.py --audit-only u01

Para cada beat B/C:
  1. renderiza 6 stills espalhados pelo clipe (o par final serve ao teste de
     "nada estaciona") e roda tools/audit.py;
  2. só se a auditoria passar, grava a entrega:
       motion-v2/{uid}_{B|C}.png   (frame 6, com alfa)
       motion-v2/{uid}_{B|C}.mov   (ProRes 4444, yuva444p12le = alfa 16-bit, mudo)

A promoção depois do portão é o ponto: um beat que invade a faixa da caption ou
que estaciona não vira arquivo de entrega.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
OUT = HERE / 'out'
DELIVERY = HERE  # edit/motion-v2/ — única pasta onde este agente escreve

FPS = 30
STAGE = {
    'u01': 'B', 'u03': 'C', 'u04': 'B', 'u05': 'C', 'u07': 'B', 'u08': 'C',
    'u09': 'B', 'u10': 'B', 'u11': 'B', 'u12': 'B', 'u13': 'C', 'u14': 'B',
}
FRAMES = {
    'u01': 57, 'u03': 40, 'u04': 32, 'u05': 75, 'u07': 36, 'u08': 71,
    'u09': 48, 'u10': 35, 'u11': 67, 'u12': 56, 'u13': 190, 'u14': 57,
}
ORDER = list(FRAMES)


def run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit(f'falhou: {" ".join(cmd)}\n{p.stdout[-2000:]}\n{p.stderr[-2000:]}')


def probe_frames(uid: str) -> list[int]:
    n = FRAMES[uid]
    picks = {0, n // 5, (2 * n) // 5, (3 * n) // 5, n - 2, n - 1}
    return sorted(picks)


def beat(uid: str, audit_only: bool = False) -> bool:
    stage = STAGE[uid]
    print(f'--- {uid} ({stage}, {FRAMES[uid]} f)')
    for f in probe_frames(uid):
        dest = OUT / f'_chk_{uid}_f{f:03d}.png'
        run(['npx', 'remotion', 'still', uid, str(dest.relative_to(HERE)), '--frame', str(f), '--log', 'error'])

    files = [str(OUT / f'_chk_{uid}_f{f:03d}.png') for f in probe_frames(uid)]
    gate = subprocess.run(
        [sys.executable, 'tools/audit.py', uid, stage, *files], cwd=HERE, capture_output=True, text=True
    )
    print(gate.stdout.strip() or gate.stderr.strip())
    if gate.returncode != 0:
        return False
    if audit_only:
        return True

    run(['npx', 'remotion', 'still', uid, f'{uid}_{stage}.png', '--frame', '6', '--log', 'error'])
    run(['npx', 'remotion', 'render', uid, f'{uid}_{stage}.mov', '--log', 'error'])
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('beats', nargs='*', default=None)
    ap.add_argument('--audit-only', action='store_true')
    a = ap.parse_args()

    uids = a.beats or ORDER
    ok, bad = [], []
    for uid in uids:
        (ok if beat(uid, a.audit_only) else bad).append(uid)
    print()
    print(f'passaram: {" ".join(ok) or "-"}')
    print(f'falharam: {" ".join(bad) or "-"}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
