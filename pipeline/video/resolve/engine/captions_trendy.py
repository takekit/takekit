#!/usr/bin/env python3
"""Motor de legendas "trendy stack" — palavras empilhadas em escada, sans bold + serifa itálica de destaque.

Referência: pack "Trendy Titles" (Envato), analisado frame a frame em 14/09/2026:
  - layout: cada palavra numa "linha" própria, leading negativo (a de baixo invade a de cima),
    deslocamento horizontal em escada (drift) -> bloco compacto, encaixado;
  - papéis: big (1ª palavra de conteúdo, sans), accent (palavra-herói, serifa itálica colorida + glow),
    mid (demais palavras de conteúdo), small (stopwords, encaixadas sob a anterior);
  - entrada: NO LUGAR, blur pesado -> nítido + fade em ~5 f, uma palavra por vez (aqui: no timing do áudio);
  - saída: blur + fade escalonado de cima pra baixo.

Reusa dados/agrupamento do captions_engine (auto_blocks, Data, job.json) — só layout, sprite e física são novos.

Uso: captions_trendy.py --job JOB.json --style styles/trendy-stack.json --out OUT.mov [--range A B] [--stills f1,f2 --stills-dir DIR]
"""
import argparse, json, math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import captions_engine as ce

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STYLE = {}
_fonts = {}

def ease_out(t): return 1.0 if t >= 1 else 1 - math.pow(2, -STYLE["ease_k"] * max(0.0, t))
def font(kind, size):
    size = max(8, int(round(size * ce.SCALE))); key = (kind, size)
    if key not in _fonts:
        f = ImageFont.truetype(STYLE["font_sans" if kind == "sans" else "font_accent"], size)
        if kind == "accent" and STYLE.get("accent_weight"):
            try: f.set_variation_by_axes([STYLE["accent_weight"]])
            except Exception: pass
        _fonts[key] = f
    return _fonts[key]
def text_w(s, f, tr):
    d = ImageDraw.Draw(Image.new("RGBA", (4, 4)))
    return sum(d.textlength(ch, font=f) for ch in s) + tr * (len(s) - 1)
def disp(t): return t.upper() if STYLE.get("case") == "upper" else t

def load_style(path):
    st = json.load(open(path))
    for k in ("font_sans", "font_accent"):
        p = os.path.expanduser(st[k]); st[k] = p if os.path.isabs(p) else os.path.join(ROOT, p)
    for k in ("color_sans", "color_accent"): st[k] = tuple(st[k])
    st["_passage"] = ce.wordset(st.get("passage_words", ""))
    st["_rules"] = {}
    return st

# ---------------- layout ----------------
def roles_for(block):
    """[(palavra, papel)] — accent = chunk 'b'; small = stopword; big = 1ª palavra de conteúdo que não é accent; resto mid."""
    words = [(t, c[1] == "b") for c in block["chunks"] for t in c[0].split()]
    out, big_done = [], False
    for t, is_hero in words:
        if is_hero: out.append((t, "accent")); continue
        if ce.norm(t) in STYLE["_passage"] and len(words) > 1: out.append((t, "small")); continue
        if not big_done: out.append((t, "big")); big_done = True
        else: out.append((t, "mid"))
    if len(out) == 1: out = [(out[0][0], "big")]
    return out

def layout_block(block):
    roles = roles_for(block); sizes = dict(STYLE["size"]); scale = 1.0
    for _ in range(6):
        sprites = _pack(roles, {k: v * scale for k, v in sizes.items()})
        x0 = min(s["x"] for s in sprites); x1 = max(s["x"] + s["w"] for s in sprites)
        if x1 - x0 <= STYLE["max_width"] * ce.SCALE: break
        scale *= (STYLE["max_width"] * ce.SCALE) / (x1 - x0) * 0.98
    y0 = min(s["y"] for s in sprites); y1 = max(s["y"] + s["h"] for s in sprites)
    ym = block.get("y_mode", "auto"); yc = {"above": STYLE["y_above"], "low": STYLE["y_low"]}.get(ym, STYLE["y_auto"]) * (ce.H / 1920)
    dx = ce.W / 2 - (x0 + x1) / 2; dy = yc - (y0 + y1) / 2
    for s in sprites: s["x"] += dx; s["y"] += dy
    return sprites

def _lines(roles):
    """Agrupa em linhas: cada palavra de conteúdo é uma linha; stopword (small) divide a linha com a palavra
    seguinte (prefixo: 'up every', 'just do'); se for a última, gruda na anterior (sufixo: 'pack for')."""
    lines, pending = [], []
    for t, r in roles:
        if r == "small": pending.append((t, r)); continue
        lines.append(pending + [(t, r)]); pending = []
    if pending:
        if lines: lines[-1] += pending
        else: lines.append(pending)
    return lines

def _word_mask(text, kind, size):
    f = font(kind, size); asc, desc = f.getmetrics(); w = int(math.ceil(text_w(text, f, STYLE["tracking"][kind]))) + 4
    im = Image.new("L", (w, asc + desc), 0); d = ImageDraw.Draw(im); x = 0
    for ch in text: d.text((x, 0), ch, font=f, fill=255); x += d.textlength(ch, font=f) + STYLE["tracking"][kind]
    return np.array(im) > 96, asc, desc

def _pack(roles, sizes):
    """Encaixe tipo tetris. Linha 0 define as bordas L/R (palavra big). Cada linha seguinte: alinha flush numa
    borda (alternando; destaque vaza a borda um pouco), e sobe a partir de baixo até encostar (gap fixo) na
    máscara do que já foi colocado. Resultado: bloco compacto, encaixado nos descendentes, como na ref."""
    P = STYLE["pack"]; gap = int(P["gap"] * ce.SCALE); lines = _lines(roles)
    # 1. cada linha: palavras lado a lado, baseline alinhada
    L = []
    for ln in lines:
        words = []; x = 0
        for t, r in ln:
            kind = "accent" if r == "accent" else "sans"; m, asc, desc = _word_mask(disp(t), kind, sizes[r])
            words.append({"text": disp(t), "role": r, "kind": kind, "size": sizes[r], "trk": STYLE["tracking"][kind], "mask": m, "asc": asc, "desc": desc, "lx": x, "w": m.shape[1] - 4})
            x += m.shape[1] - 4 + int(P["word_gap"] * sizes[r] * ce.SCALE)
        base = max(w["asc"] for w in words); h = base + max(w["desc"] for w in words); wl = words[-1]["lx"] + words[-1]["w"]
        mask = np.zeros((h, wl + 4), bool)
        for w in words:
            y0 = base - w["asc"]; mask[y0:y0 + w["mask"].shape[0], w["lx"]:w["lx"] + w["mask"].shape[1]] |= w["mask"]
        acc = any(w["role"] == "accent" for w in words); big = any(w["role"] == "big" for w in words)
        L.append({"words": words, "mask": mask, "w": wl, "h": h, "base": base, "accent": acc, "big": big})
    # 2. canvas local + colocação
    Wc = int(max(l["w"] for l in L) * 2.6) + 200; Hc = int(sum(l["h"] for l in L)) + 200
    canvas = np.zeros((Hc, Wc), bool); placed = []
    sans = [l for l in L if not l["accent"]]; anchor = max(sans or L, key=lambda l: l["w"])   # bordas = linha sans mais larga
    AL = Wc // 2 - anchor["w"] // 2; AR = AL + anchor["w"]
    side = "right"
    if len(L) > 2 and L[1]["accent"]: side = "left"          # destaque na linha 1 vai pra esquerda, o resto alterna
    for i, l in enumerate(L):
        if i == 0: x = AL if l is anchor else (AL + int(P["indent"] * anchor["w"])); y = 100
        else:
            if l["accent"] and i == len(L) - 1: side = "right"        # destaque fechando o bloco vaza pra direita (ref: action/do/real)
            if l["accent"]: over = int(P["accent_overshoot"] * l["w"]); x = (AR + over - l["w"]) if side == "right" else (AL - over)
            else: ind = int(P["indent"] * anchor["w"]); x = (AR - l["w"] - (ind if l["w"] < anchor["w"] * 0.5 else 0)) if side == "right" else (AL + ind)
            x = max(0, min(Wc - l["w"] - 4, x))
            prev = placed[-1]; y = prev["y"] + prev["h"] + gap                          # começa embaixo, sem sobreposição
            y_min = prev["y"] + int(prev["h"] * P["min_drop"])                          # não sobe além disso (topo entra no corpo da anterior)
            dil = _dilate(l["mask"], gap)
            while y - 1 >= y_min:
                sub = canvas[y - 1:y - 1 + dil.shape[0], x:x + dil.shape[1]]
                if sub.shape != dil.shape or (sub & dil).any(): break
                y -= 1
            side = "left" if side == "right" else "right"
        l["x"], l["y"] = x, y; placed.append(l)
        canvas[y:y + l["mask"].shape[0], x:x + l["mask"].shape[1]] |= l["mask"]
    sprites = []
    for l in placed:
        for w in l["words"]:
            sprites.append({"text": w["text"], "role": w["role"], "kind": w["kind"], "size": w["size"], "trk": w["trk"],
                            "x": l["x"] + w["lx"], "y": l["y"] + (l["base"] - w["asc"]), "w": w["w"], "h": w["asc"] + w["desc"], "asc": w["asc"]})
    return sprites

def _dilate(m, r):
    if r <= 0: return m
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r or (dx == 0 and dy == 0): continue
            sh = np.roll(np.roll(m, dy, 0), dx, 1); out |= sh
    return out

def render_sprite(sp):
    f = font(sp["kind"], sp["size"]); asc, desc = f.getmetrics(); sh = STYLE["shadow"]; gl = STYLE["glow_accent"]
    pad = max(sh["blur"] * 3, gl["blur"] * 2) + 16
    w = int(sp["w"]) + pad * 2 + sh["dx"]; h = asc + desc + pad * 2 + sh["dy"]
    accent = sp["role"] == "accent"; col = STYLE["color_accent"] if accent else STYLE["color_sans"]
    text, under = (Image.new("RGBA", (w, h), (0, 0, 0, 0)) for _ in range(2))
    td, ud = ImageDraw.Draw(text), ImageDraw.Draw(under); x = pad
    for ch in sp["text"]:
        if accent: ud.text((x, pad), ch, font=f, fill=col[:3] + (gl["alpha"],))
        else: ud.text((x + sh["dx"], pad + sh["dy"]), ch, font=f, fill=(0, 0, 0, sh["alpha"]))
        td.text((x, pad), ch, font=f, fill=col); x += td.textlength(ch, font=f) + sp["trk"]
    under = under.filter(ImageFilter.GaussianBlur(gl["blur"] if accent else sh["blur"]))
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0)); out.alpha_composite(under); out.alpha_composite(text)
    return out, pad

# ---------------- física ----------------
def chroma_split(img, blur, prog, ramps):
    """Aberração cromática (variante 'Chromatic' da ref): cada canal é um sprite próprio, deslocado ao longo de um
    eixo (R +d, G 0, B -d) e com opacidade própria (ramps = [rR, rG, rB]); d = split_px * prog. Soma aditiva
    dos canais (premultiplicado) -> franjas vermelha/azul onde ainda não convergiram."""
    cfg = STYLE["chroma"]; d = cfg["split_px"] * ce.SCALE * prog; ang = math.radians(cfg.get("angle_deg", 15))
    if blur > 0.4: img = img.filter(ImageFilter.GaussianBlur(blur * ce.SCALE))
    arr = np.asarray(img).astype(np.float32) / 255; h, w = arr.shape[:2]
    prem = np.zeros((h, w, 3), np.float32); inv = np.ones((h, w), np.float32)
    for c, sign in ((0, 1), (1, 0), (2, -1)):
        if ramps[c] <= 0: continue
        dx, dy = int(round(sign * d * math.cos(ang))), int(round(sign * d * math.sin(ang)))
        sh = np.roll(np.roll(arr, dy, axis=0), dx, axis=1)
        if dy > 0: sh[:dy] = 0
        elif dy < 0: sh[dy:] = 0
        if dx > 0: sh[:, :dx] = 0
        elif dx < 0: sh[:, dx:] = 0
        a = sh[..., 3] * ramps[c]; prem[..., c] = sh[..., c] * a; inv *= (1 - a)
    A = 1 - inv; out = np.zeros((h, w, 4), np.float32)
    out[..., :3] = prem / np.maximum(A[..., None], 1e-6); out[..., 3] = A
    return Image.fromarray((out.clip(0, 1) * 255).astype(np.uint8))

def transform(el, f_i):
    IN, OUT = STYLE["in_frames"], STYLE["out_frames"]
    img = el["img"]; op = 1.0; blur = 0.0; chroma = STYLE.get("chroma"); prog = 0.0; ramps = None
    k = (f_i - el["t_in"]) / IN
    if k < 1:
        e = ease_out(k); op = e; blur = (1 - e) * STYLE["blur_in"]; prog = 1 - e
        if chroma:   # canais chegam escalonados: R, G, B (stagger em frames)
            fr = k * IN; ramps = [min(1.0, max(0.0, (fr - i * chroma["stagger"]) / chroma["ramp_frames"])) for i in range(3)]; op = 1.0
    t_out = el["t_out"]
    if f_i >= t_out:
        e = min(1.0, (f_i - t_out + 1) / OUT); op = min(op, 1 - e); blur = max(blur, e * STYLE["blur_out"]); prog = max(prog, e)
        if chroma:   # saída inversa: R some primeiro, B por último
            fr = e * OUT; ramps = [1 - min(1.0, max(0.0, (fr - i * chroma["stagger"]) / chroma["ramp_frames"])) for i in range(3)]; op = 1.0
    if chroma and ramps is not None: return chroma_split(img, blur, prog, ramps), op
    if blur > 0.4: img = img.filter(ImageFilter.GaussianBlur(blur * ce.SCALE))
    return img, op

def frame_at(elems, f_i, canvas):
    for el in elems:
        if f_i < el["t_in"] or f_i > el["t_out"] + STYLE["out_frames"]: continue
        img, op = transform(el, f_i)
        if op <= 0: continue
        arr = np.array(img)
        if op < 1: arr = arr.copy(); arr[..., 3] = (arr[..., 3].astype(np.float32) * op).astype(np.uint8)
        x = int(el["x"] - el["pad"]); y = int(el["y"] - el["pad"])
        ys, xs = max(0, y), max(0, x); ye, xe = min(ce.H, y + arr.shape[0]), min(ce.W, x + arr.shape[1])
        if ye <= ys or xe <= xs: continue
        src = arr[ys - y:ye - y, xs - x:xe - x]; dst = canvas[ys:ye, xs:xe]
        sa = src[..., 3:4].astype(np.float32) / 255; da = dst[..., 3:4].astype(np.float32) / 255; oa = sa + da * (1 - sa)
        dst[..., :3] = ((src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)).astype(np.uint8); dst[..., 3:4] = (oa * 255).astype(np.uint8)

def build(data, range_a=0, range_b=None):
    range_b = data.total if range_b is None else range_b
    blocks = sorted(data.plan["blocks"], key=lambda b: b["start_f"]); elems = []; fallback = 0
    for i, b in enumerate(blocks):
        if b["end_f"] < range_a or b["start_f"] > range_b: continue
        end = b["end_f"]
        if i + 1 < len(blocks): end = min(end, blocks[i + 1]["start_f"] - STYLE["lead"])
        starts = data.word_starts(b); sprites = layout_block(b); n = len(sprites)
        if starts is None or len(starts) != n:
            fallback += 1; span = max(1, end - b["start_f"] - 6); starts = [b["start_f"] + int(span * k / n) for k in range(n)]
        starts = [max(b["start_f"], s) for s in starts]
        for j, (sp, st) in enumerate(zip(sprites, starts)):
            img, pad = render_sprite(sp)
            t_out = end - STYLE["out_frames"] - (n - 1 - j) * STYLE["out_stagger"]   # topo sai primeiro, última termina em `end`
            elems.append({"img": img, "pad": pad, "x": sp["x"], "y": sp["y"], "role": sp["role"], "text": sp["text"],
                          "t_in": max(0, st - STYLE["lead"]), "t_out": max(st + 1, t_out)})
    print(f"sprites: {len(elems)} | fallback: {fallback}", flush=True)
    return elems

def render(elems, a, b, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{ce.W}x{ce.H}", "-r", str(ce.FPS), "-i", "-",
           "-c:v", "prores_ks", "-profile:v", "4444", "-alpha_bits", "16", "-vendor", "apl0", "-pix_fmt", "yuva444p10le", path]
    import subprocess; proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f_i in range(a, b):
        canvas = np.zeros((ce.H, ce.W, 4), dtype=np.uint8); frame_at(elems, f_i, canvas); proc.stdin.write(canvas.tobytes())
        if (f_i - a) % 300 == 0: print("frame", f_i, "/", b, flush=True)
    proc.stdin.close(); proc.wait()
    print("encoded:", path, round(os.path.getsize(path) / 1e6, 1), "MB", flush=True)

def main():
    global STYLE
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", required=True); ap.add_argument("--style", required=True); ap.add_argument("--out")
    ap.add_argument("--range", nargs=2, type=int); ap.add_argument("--stills"); ap.add_argument("--stills-dir")
    a = ap.parse_args()
    STYLE = load_style(a.style); ce.STYLE = STYLE          # auto_blocks lê _passage/auto de ce.STYLE
    data = ce.Data(job=a.job)
    r0, r1 = (a.range if a.range else (0, data.total))
    elems = build(data, r0, r1)
    if a.stills:
        d = a.stills_dir or os.path.join(os.path.dirname(a.job), "stills"); os.makedirs(d, exist_ok=True)
        for f_i in [int(x) for x in a.stills.split(",")]:
            canvas = np.zeros((ce.H, ce.W, 4), dtype=np.uint8); frame_at(elems, f_i, canvas); Image.fromarray(canvas).save(os.path.join(d, f"f{f_i:04d}.png"))
        return
    out = a.out or os.path.join(os.path.dirname(a.job), f"captions_{os.path.splitext(os.path.basename(a.style))[0]}.mov")
    render(elems, r0, r1, out)

if __name__ == "__main__":
    main()
