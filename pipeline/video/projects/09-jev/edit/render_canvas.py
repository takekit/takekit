#!/usr/bin/env python3
"""Renderiza o canvas de cada beat B/C do 09-jev (ProRes 4444)."""
from __future__ import annotations

import json, subprocess, sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3] / "resolve"
sys.path.insert(0, str(ROOT / "engine"))
import palco_canvas as pc

HERE = Path(__file__).resolve().parent
OUT = HERE / "overlay"
BRAND = ROOT / "assets" / "brands"
CUTS = json.loads((HERE / "cuts.json").read_text(encoding="utf-8"))["cuts"]
FPS = 30

# u_id -> palco (storyboard b01=u01)
PALCO = {
    "u01": "B", "u02": "A", "u03": "C", "u04": "B", "u05": "C",
    "u06": "A", "u07": "B", "u08": "C", "u09": "B", "u10": "B",
    "u11": "B", "u12": "B", "u13": "C", "u14": "B", "u15": "A",
    "u16": "A", "u17": "A",
}


def load_brand(bid, kind="logo"):
    p = BRAND / bid / f"{kind}.png"
    if not p.exists():
        p = BRAND / bid / "logo.png"
    im = Image.open(p).convert("RGBA")
    return im


def fit(im, max_w, max_h):
    s = min(max_w / im.width, max_h / im.height)
    return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.Resampling.LANCZOS)


def draw_u01(img, f, n):
    sc = pc.enter_scale(f, n)
    a = pc.chip("financeiro", "94%", width=460)
    b = pc.chip("suporte", "4%", width=460)
    c = pc.chip("humano", "2%", width=460)
    pc.paste_center(img, a, (540, 160), sc)
    pc.paste_center(img, b, (540, 300), sc)
    pc.paste_center(img, c, (540, 440), sc)


def draw_u03(img, f, n):
    d = ImageDraw.Draw(img)
    sc = pc.enter_scale(f, n)
    d.text((140, 620), "sim", font=pc.FONT_SERIF(int(168 * sc)), fill=pc.INK)
    d.text((140, 820), "ou não", font=pc.FONT_SERIF(int(128 * sc)), fill=pc.MUTED)
    bar_w = int(800 * min(1.0, (f + 1) / max(8, n * 0.6)))
    d.rounded_rectangle((140, 1060, 940, 1116), radius=18, fill=(230, 224, 214, 255))
    d.rounded_rectangle((140, 1060, 140 + bar_w, 1116), radius=18, fill=pc.GOLD)


def draw_u04(img, f, n):
    logo = fit(load_brand("jev", "logo"), 420, 420)
    logo = pc.shine(logo, f / max(1, n - 1))
    pc.paste_center(img, logo, (540, 420), pc.enter_scale(f, n))


def draw_u05(img, f, n):
    logo = fit(load_brand("chatgpt"), 560, 560)
    logo = pc.shine(logo, f / max(1, n - 1))
    pc.paste_center(img, logo, (540, 900), pc.enter_scale(f, n))


def draw_u07(img, f, n):
    labels = ["financeiro", "suporte", "urgente", "humano"]
    sc = pc.enter_scale(f, n)
    for i, lab in enumerate(labels):
        appear = n * i / 8
        if f < appear:
            continue
        local = pc.enter_scale(f - appear, n)
        pc.paste_center(img, pc.chip(lab, width=400), (540, 180 + i * 150), local)


def draw_u08(img, f, n):
    d = ImageDraw.Draw(img)
    pct = min(94, int(94 * (f + 1) / max(10, n * 0.7)))
    d.text((120, 620), "financeiro", font=pc.FONT_SANS(56), fill=pc.MUTED)
    d.text((110, 720), f"{pct}%", font=pc.FONT_SERIF(200), fill=pc.GOLD)
    bar_w = int(840 * pct / 94)
    d.rounded_rectangle((120, 1020, 960, 1076), radius=18, fill=(230, 224, 214, 255))
    d.rounded_rectangle((120, 1020, 120 + bar_w, 1076), radius=18, fill=pc.GOLD)


def draw_u09(img, f, n):
    pc.paste_center(img, pc.chip("inbox", "classifica", width=520), (540, 380), pc.enter_scale(f, n))


def draw_u10(img, f, n):
    pc.paste_center(img, pc.chip("chamado", "encaminha", width=520), (540, 380), pc.enter_scale(f, n))


def draw_u11(img, f, n):
    pc.paste_center(img, pc.chip("desconto", "não existe", width=520), (540, 380), pc.enter_scale(f, n))


def draw_u12(img, f, n):
    sc = pc.enter_scale(f, n)
    logos = [("chatgpt", 280), ("claude", 540), ("grok", 800)]
    for bid, x in logos:
        im = fit(load_brand(bid), 180, 180)
        pc.paste_center(img, im, (x, 400), sc)


def draw_u13(img, f, n):
    d = ImageDraw.Draw(img)
    sc = pc.enter_scale(f, n, enter=12)
    logo = fit(load_brand("chatgpt"), 200, 200)
    pc.paste_center(img, logo, (540, 420), sc)
    d.text((90, 720), "5–18×", font=pc.FONT_SANS(int(200 * sc)), fill=pc.INK)
    d.text((100, 960), "mais rápido", font=pc.FONT_SERIF(80), fill=pc.MUTED)


def draw_u14(img, f, n):
    d = ImageDraw.Draw(img)
    t = min(0.50, 0.50 * (f + 1) / max(6, n * 0.5))
    d.text((200, 320), f"{t:.2f}s", font=pc.FONT_SANS(140), fill=pc.INK)


DRAW = {
    "u01": draw_u01, "u03": draw_u03, "u04": draw_u04, "u05": draw_u05,
    "u07": draw_u07, "u08": draw_u08, "u09": draw_u09, "u10": draw_u10,
    "u11": draw_u11, "u12": draw_u12, "u13": draw_u13, "u14": draw_u14,
}


def encode(frames, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
           "-s", f"{pc.W}x{pc.H}", "-r", str(FPS), "-i", "-",
           "-c:v", "prores_ks", "-profile:v", "4444", "-alpha_bits", "16",
           "-vendor", "apl0", "-pix_fmt", "yuva444p10le", str(dest)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for fr in frames:
        proc.stdin.write(fr.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise SystemExit(f"ffmpeg falhou: {dest}")


def main():
    OUT.mkdir(exist_ok=True)
    for c in CUTS:
        uid, palco = c["id"], PALCO[c["id"]]
        if palco == "A" or uid not in DRAW:
            continue
        n = c["src"][1] - c["src"][0]
        print(uid, palco, n, "f", flush=True)
        frames = []
        for f in range(n):
            img = pc.cream(palco)
            DRAW[uid](img, f, n)
            frames.append(img)
        encode(frames, OUT / f"{uid}_{palco}.mov")
        frames[min(6, n - 1)].save(OUT / f"{uid}_{palco}.png")
        print(" ", OUT / f"{uid}_{palco}.mov", flush=True)


if __name__ == "__main__":
    main()
