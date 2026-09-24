#!/usr/bin/env python3
"""Prévia de um CaptionPreset com o renderizador de verdade (captions_palco), sem projeto.

Para o caption builder da UI: desenha uma frase no layout do palco (face = palco A no y do
preset; canvas = legenda do palco B no creme) sobre um fundo e grava um PNG ou um clipe curto.

    python3 video/kit/engine/caption_preview.py --preset styles/_presets/caption/caixa.json \\
        --text "Isso muda *tudo*" --layout face --bg dark --out /tmp/cap.png [--size 540x960] [--at settled|<frame>]
    ... --clip /tmp/cap.mp4      # entrada + hold (+ saída e a próxima frase), H.264

`*palavra*` marca o chunk de ênfase (a linha sai na fonte/cor de acento, como no render).
Várias frases separadas por `|` viram blocos em sequência (cada um entra, segura e sai, como na
fala), para validar a animação com mais texto; o still mostra a primeira.
--preset - lê o JSON do stdin; `none` mostra o style base. --bg: imagem (cover), `cream`
(#F4EFE6) ou `dark` (default). --at: frame da entrada (0 = primeiro frame da animação).
"""
from __future__ import annotations

import argparse, os, re, subprocess, sys, types

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import captions_engine as ce  # noqa: E402
import captions_palco as cp  # noqa: E402

STYLES = {"face": "styles/palco-face.json", "canvas": "styles/palco-canvas.json"}
BG = {"dark": (28, 28, 30), "cream": (0xF4, 0xEF, 0xE6)}
FPS = 30
CLIP_FRAMES = 36      # 1,2 s (uma frase)
CLIP_LEAD = 4         # frames de fundo vazio antes da entrada
BLOCK_FRAMES = 27     # cada frase numa sequência (~0,9 s, ritmo de fala)
TAIL_FRAMES = 12      # fundo vazio depois da última saída (o loop respira)


def chunks(text: str) -> list[list[str]]:
    """"Isso muda *tudo*" → [["Isso muda", "s"], ["tudo", "b"]]."""
    out = []
    for i, part in enumerate(re.split(r"\*([^*]+)\*", text)):
        part = " ".join(part.split())
        if part:
            out.append([part, "b" if i % 2 else "s"])
    return out or [[text.strip() or " ", "s"]]


def groups(text: str, max_words: int, max_chars: int) -> list[str]:
    """Uma frase em blocos no ritmo do preset (como caption_jobs.py): até max_words palavras e
    max_chars letras por bloco; a ênfase (*palavra*) acompanha a palavra."""
    words = []
    for i, part in enumerate(re.split(r"\*([^*]+)\*", text)):
        words += [f"*{w}*" if i % 2 else w for w in part.split()]
    out, buf = [], []
    for w in words:
        cand = buf + [w]
        if buf and (len(cand) > max_words or len(" ".join(cand).replace("*", "")) > max_chars):
            out.append(" ".join(buf))
            cand = [w]
        buf = cand
    if buf:
        out.append(" ".join(buf))
    return [re.sub(r"\*\s+\*", " ", g) for g in out]


def size_of(arg: str) -> tuple[int, int]:
    m = re.fullmatch(r"(\d+)\s*[x×]\s*(\d+)", arg.strip().lower())
    if not m:
        sys.exit(f"erro: --size inválido: {arg} (use 540x960)")
    return int(m.group(1)) // 2 * 2, int(m.group(2)) // 2 * 2


def background(arg: str, w: int, h: int) -> Image.Image:
    if arg in BG:
        return Image.new("RGBA", (w, h), BG[arg] + (255,))
    if not os.path.isfile(arg):
        sys.exit(f"erro: fundo não encontrado: {arg} (use uma imagem, cream ou dark)")
    im = Image.open(arg).convert("RGBA")
    s = max(w / im.width, h / im.height)
    im = im.resize((max(w, round(im.width * s)), max(h, round(im.height * s))), Image.BICUBIC)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preset", required=True, help="CaptionPreset .json, `-` (stdin) ou `none`")
    ap.add_argument("--text", default="Isso muda *tudo*")
    ap.add_argument("--layout", choices=tuple(STYLES), default="face")
    ap.add_argument("--bg", default="dark", help="imagem, cream ou dark")
    ap.add_argument("--size", default="540x960", help="tamanho da saída (render nesse tamanho)")
    ap.add_argument("--at", default="settled", help="`settled` ou frame da entrada (0 = início)")
    ap.add_argument("--out", help="PNG")
    ap.add_argument("--clip", help="MP4 H.264 de ~1,2 s (entrada + hold)")
    a = ap.parse_args()
    if not a.out and not a.clip:
        sys.exit("erro: passe --out (PNG) ou --clip (MP4)")

    w, h = size_of(a.size)
    ce.W, ce.H, ce.FPS, ce.SCALE = w, h, FPS, w / 1080
    preset = cp.load_preset(a.preset, None)
    st = cp.apply_preset(cp.load_style(os.path.join(cp.ROOT, STYLES[a.layout])), preset)
    cp.STYLE = ce.STYLE = st
    lead, n_in = int(st.get("lead", 2)), int(st.get("in_frames", 4))
    start = CLIP_LEAD     # a entrada começa aqui (t_in = start_f - lead)
    lines = [t.strip() for t in re.split(r"[|\n]", a.text) if t.strip()] or ["Isso muda *tudo*"]
    single = len(lines) == 1
    if not single:
        # Sequência: cada frase quebra no ritmo do preset; bloco dura ~9 frames por palavra.
        timing = (preset or {}).get("timing") or {}
        auto = st.get("auto") or {}
        mw = int(timing.get("maxWords") or auto.get("max_words") or 3)
        mc = int(timing.get("maxChars") or auto.get("max_chars") or 20)
        lines = [g for line in lines for g in groups(line, mw, mc)]
    blocks, s0 = [], start + lead
    for i, text in enumerate(lines):
        n = 10 * FPS if single else max(18, min(BLOCK_FRAMES + 6, 9 * len(text.split())))
        blocks.append({"key": f"preview{i}", "chunks": chunks(text), "start_f": s0, "end_f": s0 + n,
                       "layout": a.layout, "y": st.get("y", 1180), "palco": "A" if a.layout == "face" else "B"})
        s0 += n
    items = cp.build(types.SimpleNamespace(plan={"blocks": blocks}, total=10 ** 6), 0, 10 ** 6)
    total = CLIP_FRAMES if single else s0 + int(st.get("out_frames", 3)) + TAIL_FRAMES
    bg = background(a.bg, w, h)

    def frame(f: int) -> Image.Image:
        out = bg.copy()
        out.alpha_composite(Image.fromarray(cp.frame_canvas(items, f)))
        return out.convert("RGB")

    if a.out:
        f = n_in + 3 if a.at == "settled" else int(a.at)
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        frame(start + f).save(a.out)
        print(f"escrito {a.out}")
    if a.clip:
        os.makedirs(os.path.dirname(os.path.abspath(a.clip)), exist_ok=True)
        cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(FPS),
               "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
               "-movflags", "+faststart", a.clip]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for f in range(total):
            proc.stdin.write(frame(f).tobytes())
        proc.stdin.close()
        if proc.wait() != 0:
            sys.exit(f"erro: ffmpeg falhou ao gravar {a.clip}")
        print(f"escrito {a.clip}")


if __name__ == "__main__":
    main()
