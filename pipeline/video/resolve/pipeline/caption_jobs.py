#!/usr/bin/env python3
"""Rascunho de blocos de caption a partir de whisper + cortes + palco do plano.

    python3 video/resolve/pipeline/caption_jobs.py --project video/projects/<slug>

Escreve blocks_face.json, blocks_canvas.json, blocks_hold.json e os job_*.json.
1–3 palavras no ataque da fala. Hold só onde o storyboard diz `segurar`.
Ênfase de duas linhas NÃO é inferida: o agente marca depois.

Com edit/style.resolved.json: palavras/caracteres por bloco vêm de `timing` do preset de
legenda e layout + y de cada palco de `safeZones.caption` dos presets de palco (D = face na
emenda, y 960). Sem ele, a tabela Y abaixo. Todo bloco leva `"palco"`.
"""
from __future__ import annotations

import argparse, json, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
FPS = 30
MAX_WORDS = 3
MAX_CHARS = 20
Y = {'A': 1180, 'B': 700, 'C': 1580, 'D': 960, 'hold': 1080}
FACE = {'A', 'D'}      # palcos com o rosto atrás da legenda; o resto é creme


def style_resolved(pdir: Path) -> dict:
    p = pdir / 'edit' / 'style.resolved.json'
    return json.loads(p.read_text()) if p.is_file() else {}


def caption_zones(style: dict) -> dict[str, tuple[str, int]]:
    """(layout, y) da legenda por palco: safeZones.caption dos presets de palco, senão a tabela."""
    out = {k: ('face' if k in FACE else 'canvas', y) for k, y in Y.items() if k != 'hold'}
    for st in (style.get('modules') or {}).get('stage') or []:
        cap = ((st or {}).get('safeZones') or {}).get('caption') or {}
        letter = str((st or {}).get('palco') or '').upper()[:1]
        if letter and cap:
            y = cap.get('y')
            if isinstance(y, list):          # faixa [y0, y1] → meio
                y = sum(y) / len(y)
            out[letter] = (cap.get('layout') or out.get(letter, ('canvas', 0))[0],
                           int(round(y)) if y is not None else out.get(letter, ('', Y['A']))[1])
    return out


def words_of(whisper: dict) -> list[dict]:
    out = []
    for seg in whisper.get('segments') or []:
        for w in seg.get('words') or []:
            t = str(w.get('word') or '').strip()
            if not t:
                continue
            out.append({'text': t, 'start': float(w['start']), 'end': float(w['end'])})
    return out


def palco_of(plan: dict, uid: str, idx: int) -> tuple[str, str, str]:
    sb = plan.get('storyboard') or []
    item = None
    for b in sb:
        bid = str(b.get('id') or '')
        if b.get('unit') == uid or bid == uid or bid.replace('b', 'u') == uid:
            item = b
            break
    if item is None and idx < len(sb):
        item = sb[idx]
    if not item:
        return 'A', 'seguir', ''
    return str(item.get('palco') or 'A').strip().upper()[:1] or 'A', item.get('caption') or 'seguir', item.get('marca') or ''


def group(words: list[dict], max_words: int = MAX_WORDS, max_chars: int = MAX_CHARS) -> list[dict]:
    """Agrupa 1–3 palavras (ou o que o preset pedir). Troca no ataque."""
    buf, out = [], []
    for w in words:
        nxt = buf + [w]
        text = ' '.join(x['text'] for x in nxt)
        if buf and (len(nxt) > max_words or len(text) > max_chars):
            start_f = round(buf[0]['start'] * FPS)
            end_f = round(buf[-1]['end'] * FPS)
            out.append({'text': ' '.join(x['text'] for x in buf), 'start_src_f': start_f, 'end_src_f': end_f})
            buf = [w]
        else:
            buf = nxt
    if buf:
        out.append({
            'text': ' '.join(x['text'] for x in buf),
            'start_src_f': round(buf[0]['start'] * FPS),
            'end_src_f': round(buf[-1]['end'] * FPS),
        })
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--project', required=True)
    a = ap.parse_args()
    pdir = Path(a.project)
    if not pdir.is_absolute():
        pdir = REPO / pdir
    plan = json.loads((pdir / 'edit' / 'plan.json').read_text())
    cuts = json.loads((pdir / 'edit' / 'cuts.json').read_text())
    wpath = pdir / 'edit' / 'transcripts' / 'whisper.json'
    if not wpath.is_file():
        wpath = pdir / 'edit' / 'audio-16k.json'
    whisper = json.loads(wpath.read_text())
    all_words = words_of(whisper)
    style = style_resolved(pdir)
    zones = caption_zones(style)
    cap = (style.get('modules') or {}).get('caption') or {}
    timing = cap.get('timing') or {}
    max_words = int(timing.get('maxWords') or MAX_WORDS)
    max_chars = int(timing.get('maxChars') or MAX_CHARS)
    print(f"legenda: {cap.get('id') or 'sem preset'} · até {max_words} palavras / {max_chars} caracteres · "
          + ' '.join(f'{k}={v[0]}@{v[1]}' for k, v in sorted(zones.items())))

    face, canvas, hold = [], [], []
    t_tl = 0
    total = 0
    for i, c in enumerate(cuts.get('cuts') or []):
        uid = c['id']
        src0, src1 = c['src']
        dur = src1 - src0
        palco, cap_mode, marca = palco_of(plan, uid, i)
        take_words = [w for w in all_words if src0 / FPS - 0.05 <= w['start'] < src1 / FPS]
        layout, y = zones.get(palco) or zones['A']
        if cap_mode == 'segurar':
            keyword = (marca or 'CTA').upper()
            hold.append({
                'key': uid,
                'palco': palco,
                'layout': 'hold',
                'start_f': t_tl,
                'end_f': t_tl + dur,
                'y': Y['hold'],
                'visual_gap_px': -20,
                'back': {'text': 'comment', 'font': 'script', 'fill': '#FFFFFF', 'z_index': 1},
                'front': {
                    'text': f'“{keyword}”',
                    'font': 'sans',
                    'fill': {'type': 'radial_gradient', 'name': 'gold'},
                    'z_index': 3,
                },
            })
        else:
            chunks = group(take_words, max_words, max_chars)
            if not chunks:
                chunks = [{'text': c.get('texto') or '', 'start_src_f': src0, 'end_src_f': src1}]
            n = len(chunks)
            for j, ch in enumerate(chunks):
                local0 = max(0, ch['start_src_f'] - src0)
                local1 = max(local0 + 4, ch['end_src_f'] - src0)
                if j + 1 < n:
                    nxt = max(0, chunks[j + 1]['start_src_f'] - src0)
                    local1 = min(local1, nxt)
                block = {
                    'key': f'{uid}{chr(97 + j) if n > 1 else ""}',
                    'chunks': [[ch['text'], 's']],
                    'start_f': t_tl + local0,
                    'end_f': t_tl + min(dur, local1 if local1 > local0 else dur),
                    'layout': layout,
                    'y': y,
                    'palco': palco,
                }
                (face if layout == 'face' else canvas).append(block)
        t_tl += dur
        total = t_tl

    edit = pdir / 'edit'
    def dump(name, blocks, style, y_mode):
        bp = edit / name
        if bp.is_file():
            print('existe, não sobrescrevo:', bp)
            return bp
        bp.write_text(json.dumps(blocks, ensure_ascii=False, indent=2) + '\n')
        print('escrito', bp, f'({len(blocks)})')
        return bp

    bf = dump('blocks_face.json', face, 'palco-face', 'face')
    bc = dump('blocks_canvas.json', canvas, 'palco-canvas', 'canvas')
    bh = dump('blocks_hold.json', hold, 'palco-hold', 'hold')

    def job(name, blocks_name):
        jp = edit / name
        if jp.is_file():
            print('existe, não sobrescrevo:', jp)
            return
        jp.write_text(json.dumps({
            'fps': FPS,
            'size': [1080, 1920],
            'total_frames': total,
            'words': [],
            'blocks_override': str(edit / blocks_name),
        }, ensure_ascii=False, indent=2) + '\n')
        print('escrito', jp)

    job('job_face.json', 'blocks_face.json')
    job('job_canvas.json', 'blocks_canvas.json')
    job('job_hold.json', 'blocks_hold.json')
    print('revise ênfase (duas linhas) à mão; hold keyword se o marca do CTA estiver errado.')


if __name__ == '__main__':
    main()
