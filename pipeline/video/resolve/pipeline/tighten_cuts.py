#!/usr/bin/env python3
"""Aperta cortes de fala na energia real do waveform.

ASR (Whisper ou nativo) é índice: escolhe o take. A borda é o primeiro/último
frame com voz acima do limiar. Sem isso, o timestamp da palavra entra com ar
na cabeça — o 'buraco' de dentro do clipe.

  python3 video/resolve/pipeline/tighten_cuts.py \
      --audio video/projects/09-jev/edit/audio-16k.wav \
      --cuts  video/projects/09-jev/edit/cuts.json
"""
from __future__ import annotations

import argparse, json, math, struct, wave
from pathlib import Path

FPS = 30
THRESH_DB = -40.0
PAD_FRAMES = 1  # fonema; 2f do 08 recolocava o respiro que o usuário marca


def rms_frames(wav: Path) -> list[float]:
    w = wave.open(str(wav), "r")
    sr, n, sw, ch = w.getframerate(), w.getnframes(), w.getsampwidth(), w.getnchannels()
    raw = w.readframes(n)
    w.close()
    if sw != 2 or ch != 1:
        raise SystemExit(f"esperado pcm 16-bit mono, veio sw={sw} ch={ch}")
    samples = struct.unpack("<" + "h" * n, raw)
    hop = sr / FPS
    n_f = int(math.ceil(n / hop))
    out = []
    for fi in range(n_f):
        a = int(fi * hop)
        b = min(n, int((fi + 1) * hop))
        if b <= a:
            out.append(-120.0)
            continue
        acc = sum(s * s for s in samples[a:b]) / (b - a)
        out.append(-120.0 if acc <= 1 else 20 * math.log10(math.sqrt(acc) / 32768.0))
    return out


def snap(src: list[int], db: list[float], thresh: float) -> tuple[list[int], int, int]:
    a, b = src
    a = max(0, min(a, len(db) - 1))
    b = max(a + 1, min(b, len(db)))
    voiced = [f for f in range(a, b) if db[f] >= thresh]
    if not voiced:
        return [a, b], 0, 0
    head, tail = voiced[0], voiced[-1] + 1
    head = max(a, head - PAD_FRAMES)
    tail = min(b, tail + PAD_FRAMES)
    if head >= tail:
        return [a, b], 0, 0
    return [head, tail], head - a, b - tail


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--cuts", required=True)
    ap.add_argument("--thresh", type=float, default=THRESH_DB)
    args = ap.parse_args()

    path = Path(args.cuts)
    data = json.loads(path.read_text(encoding="utf-8"))
    db = rms_frames(Path(args.audio))
    total_h = total_t = 0
    for c in data["cuts"]:
        src = c.get("src_asr") or c["src"]
        tight, dh, dt = snap(src, db, args.thresh)
        c["src_asr"] = list(src)
        c["src"] = tight
        c["drop_head_f"] = dh
        c["drop_tail_f"] = dt
        total_h += dh
        total_t += dt
        print(f"{c.get('id','?'):4} {src[0]:4d}-{src[1]:4d} -> {tight[0]:4d}-{tight[1]:4d}  "
              f"-{dh}f/-{dt}f  {c.get('texto','')[:48]}")
    data["criterion"] = {
        "index": "whisper",
        "border": "rms",
        "thresh_db": args.thresh,
        "pad_frames": PAD_FRAMES,
        "drop_head_total_f": total_h,
        "drop_tail_total_f": total_t,
    }
    frames = sum(c["src"][1] - c["src"][0] for c in data["cuts"])
    data["timeline_frames"] = frames
    data["timeline_seconds"] = round(frames / FPS, 2)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"escrito {path}  {frames}f = {frames/FPS:.2f}s  ar removido {total_h+total_t}f")


if __name__ == "__main__":
    main()
