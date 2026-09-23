#!/usr/bin/env python3
"""Palco B fora do Fusion: card arredondado + recorte duro da pessoa, 50% de baixo.

A máscara vem do RVM (video/headless/matte.py; o DepthMap do Resolve foi removido).
O Fusion amolecia no LumaKeyer/EffectMask. Aqui o alfa vira binário e o layout é PIL.
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
# Recorte cabeça+ombro no frame 1080x1920. Menos zoom que o close-up do Fusion.
SRC_CROP = (0, 60, 1080, 1280)
THRESH = 128  # alfa do RVM (0..255); abaixo disso é fundo. O DepthMap legado usava 72.


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


def place_host(src: Image.Image) -> Image.Image:
    """Escala o recorte cabeça+ombro pra caber na metade de baixo, com folga pra vazar."""
    x0, y0, x1, y1 = SRC_CROP
    crop = src.crop((x0, y0, x1, y1))
    card_w, card_h = CARD[2], CARD[3]
    # largura do card, altura proporcional — menos zoom que o close-up
    scale = card_w / crop.width
    nw, nh = card_w, int(crop.height * scale)
    crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # assenta no fundo do card; o topo do recorte passa da borda de cima
    px = CARD[0]
    py = CARD[1] + CARD[3] - nh + 40
    canvas.paste(crop, (px, py))
    return canvas


def composite_frame(rgb_path: Path, matte_path: Path, thresh: int = THRESH) -> Image.Image:
    rgb = load_rgb(rgb_path)
    host = place_host(rgb)
    matte_full = hard_matte(matte_path, thresh)
    # matte segue o mesmo crop/scale/posição do host
    matte_rgb = Image.merge("RGB", (matte_full, matte_full, matte_full))
    matte_placed = place_host(matte_rgb).getchannel("R")
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
    frames = []
    for i in range(a.frames):
        rgb = Path(a.rgb % i)
        mat = Path(a.matte % i)
        im = composite_frame(rgb, mat, a.thresh)
        frames.append(im)
        if i == a.preview:
            Path(a.out).with_suffix(".png").write_bytes(b"")
            im.save(Path(a.out).with_name(Path(a.out).stem + "_preview.png"))
        print(i + 1, "/", a.frames, flush=True)
    encode(frames, Path(a.out))
    print("escrito", a.out)


if __name__ == "__main__":
    main()
