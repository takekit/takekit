#!/usr/bin/env python3
"""Palco B: card arredondado + recorte duro da pessoa, 50% de baixo.

A máscara vem do RVM (video/headless/matte.py). O alfa vira binário (recorte duro, sem
amolecer a borda) e o layout é PIL.
No fluxo normal quem chama é video/headless/palco_b.py; direto:

    python3 engine/palco_b_composite.py \\
        --rgb  dir/rgb_%04d.png \\
        --matte dir/matte_%04d.png \\
        --frames 57 --out host_b.mov
"""
from __future__ import annotations

import argparse, subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1080, 1920
FPS = 30
CREAM = (244, 239, 230, 255)

# Metade de baixo. Card um pouco abaixo da linha pra cabeça vazar no creme.
SPLIT_Y = 960
CARD = (24, 960, 1032, 936)  # x, y, w, h — metade de baixo
RADIUS = 72
# Coroa acima da borda de cima do card. Medido no preview do 09-jev: o cabelo
# começa ~60 px antes de y=960 e só o miolo da cabeça sai; o quarto fica no card.
HEAD_CLEAR = 60
THRESH = 128  # alfa do RVM (0..255); abaixo disso é fundo.


def load_rgb(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)


def hard_matte(path: Path, thresh: int = THRESH) -> Image.Image:
    im = Image.open(path).convert("L").resize((W, H), Image.Resampling.BILINEAR)
    a = np.array(im)
    # corte duro: o alfa já separa pessoa/fundo
    bin_ = np.where(a >= thresh, 255, 0).astype(np.uint8)
    m = Image.fromarray(bin_, "L")
    # 1px de fecha buraco, sem blur (não amolece o recorte)
    m = m.filter(ImageFilter.MaxFilter(3))
    m = m.filter(ImageFilter.MinFilter(3))
    return m


def rounded_mask(box, radius) -> Image.Image:
    x, y, w, h = box
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=255)
    return m


def person_span(matte: Image.Image, min_px: int = 24) -> tuple[int, int] | None:
    """Topo e base da pessoa no matte duro. Ignora sujeira na borda e no canto."""
    a = np.asarray(matte)
    x0, x1 = int(W * 0.18), int(W * 0.82)
    counts = (a[:, x0:x1] >= 128).sum(axis=1)
    rows = np.flatnonzero(counts >= min_px)
    if len(rows) < 40:
        return None
    return int(rows[0]), int(rows[-1])


def layout_from_matte(matte: Image.Image) -> tuple[float, int, int] | None:
    """Escala e canto da placa 1080×1920 para a coroa ficar HEAD_CLEAR px acima do card.

    O crop fixo antigo assumia a cabeça no topo do frame. Com folga de teto, o que
    vazava era parede e a cabeça ficava inteira dentro do card — o oposto do palco.
    Devolve None se o matte não parece uma pessoa; aí o quadro usa o encaixe legado.
    A câmera é estável: quem chama numa sequência mede um frame e reusa o trio.
    """
    span = person_span(matte)
    if span is None:
        return None
    top, bot = span
    height = bot - top
    # cabelo no topo do quadro, ou matte que come o frame inteiro, não é cabeça
    if top < 40 or top > 1100 or height < 500 or height > 1750:
        return None
    crown = CARD[1] - HEAD_CLEAR
    card_bottom = CARD[1] + CARD[3]
    scale = CARD[2] / W

    def plate_bottom(s: float) -> float:
        return (crown - top * s) + H * s

    if plate_bottom(scale) < card_bottom:
        # zoom só o bastante para o card não abrir creme embaixo; a coroa não desce
        scale = min((card_bottom - crown) / max(1, H - top), (CARD[2] / W) * 1.25)
    nw = int(round(W * scale))
    nh = int(round(H * scale))
    py = int(round(crown - top * scale))
    if py + nh < card_bottom:
        py -= card_bottom - (py + nh)
    px = CARD[0] + (CARD[2] - nw) // 2
    return scale, px, py


def place_host(src: Image.Image, geo: tuple[float, int, int] | None = None,
               resample=Image.Resampling.LANCZOS) -> Image.Image:
    """Placa na metade de baixo. geo=(escala, x, y) vem de layout_from_matte."""
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if geo is None:
        # legado: recorte alto, assentado no fundo. Não acha a cabeça.
        crop = src.crop((0, 60, W, 1280))
        scale = CARD[2] / crop.width
        nw, nh = CARD[2], int(crop.height * scale)
        crop = crop.resize((nw, nh), resample)
        canvas.paste(crop, (CARD[0], CARD[1] + CARD[3] - nh + 40))
        return canvas
    scale, px, py = geo
    nw = max(1, int(round(src.width * scale)))
    nh = max(1, int(round(src.height * scale)))
    resized = src.resize((nw, nh), resample)
    canvas.paste(resized, (px, py))
    return canvas


def composite_frame(rgb_path: Path, matte_path: Path, thresh: int = THRESH,
                    geo: tuple[float, int, int] | None | str = "auto") -> Image.Image:
    rgb = load_rgb(rgb_path)
    matte_full = hard_matte(matte_path, thresh)
    if geo == "auto":
        geo = layout_from_matte(matte_full)
    host = place_host(rgb, geo)
    # matte segue a mesma escala/posição; nearest pra não amolecer o recorte no resize
    matte_rgb = Image.merge("RGB", (matte_full, matte_full, matte_full))
    matte_placed = place_host(matte_rgb, geo, Image.Resampling.NEAREST).getchannel("R")
    person = host.copy()
    person.putalpha(matte_placed)

    cream = Image.new("RGBA", (W, H), CREAM)
    card_m = rounded_mask(CARD, RADIUS)
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    card.paste(host, (0, 0))
    card.putalpha(card_m)

    out = cream.copy()
    out.alpha_composite(card)    # z=0
    out.alpha_composite(person)  # z=+1, cabeça vaza
    return out


def encode(frames, dest: Path) -> None:
    """frames: lista ou gerador (o palco_b.py manda gerador para não segurar tudo na RAM)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-c:v", "prores_ks", "-profile:v", "4444", "-alpha_bits", "16",
           "-vendor", "apl0", "-pix_fmt", "yuva444p10le", str(dest)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for im in frames:
        proc.stdin.write(im.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise SystemExit(f"ffmpeg falhou: {dest}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rgb", required=True, help="padrão rgb_0000.png")
    ap.add_argument("--matte", required=True, help="padrão matte_0000.png (alfa do RVM)")
    ap.add_argument("--thresh", type=int, default=THRESH, help="corte do alfa (0..255)")
    ap.add_argument("--frames", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--preview", type=int, default=0)
    a = ap.parse_args()
    mid = min(a.frames // 2, a.frames - 1)
    geo = layout_from_matte(hard_matte(Path(a.matte % mid), a.thresh))
    if geo is None:
        print("aviso: matte sem cabeça confiável; encaixe legado")
    else:
        print(f"layout: escala {geo[0]:.3f}  canto ({geo[1]}, {geo[2]})")
    frames = []
    for i in range(a.frames):
        rgb = Path(a.rgb % i)
        mat = Path(a.matte % i)
        im = composite_frame(rgb, mat, a.thresh, geo)
        frames.append(im)
        if i == a.preview:
            Path(a.out).with_suffix(".png").write_bytes(b"")
            im.save(Path(a.out).with_name(Path(a.out).stem + "_preview.png"))
        print(i + 1, "/", a.frames, flush=True)
    encode(frames, Path(a.out))
    print("escrito", a.out)


if __name__ == "__main__":
    main()
