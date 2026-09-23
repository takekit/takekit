#!/usr/bin/env python3
"""Motor de legendas "hero word + encaixe cumulativo" — genérico por projeto e por template.

Entrada (dentro de --project DIR):
  edit/caption_plan.json                 blocos {chunks:[[texto,'s'|'b']...], start_f, end_f, y_mode, fx?}
                                         + ranges (mapa timeline -> source) + total_frames
  edit/transcripts/davinci_transcript.json  palavras com timecode (transcrição nativa do Resolve)
Template: --style styles/<nome>.json (todos os parâmetros visuais/físicos).
Saída:   --out arquivo.mov (ProRes 4444 com alpha, 1080x1920@30) p/ colocar numa track acima do vídeo.

Física: ease-out exponencial + motion blur direcional + desfoque de surgimento + depth glow.
Classes: passage (stopwords) -> básico | structural -> smooth lock-in | herói -> shine/flicker/bounce.
Inverted cutout NÃO está aqui (overlay não vê o fundo) — fica p/ um compositor futuro.

Uso: captions_engine.py --project DIR --style STYLE.json --out OUT.mov [--range A B] [--stills f1,f2 --stills-dir DIR] [--jitter]
"""
import argparse, json, math, os, random, re, subprocess, sys, unicodedata
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np

W, H, FPS = 1080, 1920, 30
SCALE = 1.0   # W/1080 — escala tamanhos do style p/ outras resoluções
STYLE = {}

# ---------------- utilidades ----------------
def ease_expo(t): return 1.0 if t >= 1 else 1 - math.pow(2, -STYLE["ease_k"] * t)
def ease_back(t, s=1.70158): t -= 1; return t * t * ((s + 1) * t + s) + 1
_fonts = {}
def font(size):
    size = max(8, int(round(size * SCALE)))
    if size not in _fonts: _fonts[size] = ImageFont.truetype(STYLE["font"], size)
    return _fonts[size]
def text_w(s, f, tr):
    d = ImageDraw.Draw(Image.new("RGBA", (4, 4)))
    return sum(d.textlength(ch, font=f) for ch in s) + tr * (len(s) - 1)
def norm(s):
    s = unicodedata.normalize("NFD", s.lower()); s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s)
def tc2f(tc):
    h, m, s, f = map(int, tc.split(":")); return ((h * 60 + m) * 60 + s) * FPS + f
def disp(t): return t.upper() if STYLE["case"] == "upper" else t
def wordset(s): return {norm(w) for w in s.split()}

def load_style(path):
    st = json.load(open(path))
    st["font"] = os.path.expanduser(st["font"])
    for k in ("color", "shine_text"): st[k] = tuple(st[k])
    st["_passage"] = wordset(st.get("passage_words", ""))
    st["_rules"] = {fx: {"digits": r.get("digits", False), "words": wordset(r.get("words", ""))} for fx, r in st.get("fx_rules", {}).items()}
    return st

# ---------------- dados ----------------
def auto_blocks(words):
    """Agrupa palavras em blocos e escolhe a palavra-herói. Regras (style.auto):
    quebra em pausa > gap_frames, ou ao atingir max_words / max_chars, ou depois de pontuação forte.
    Herói: palavra com dígito > mais longa fora das stopwords (empate: a última). Só stopwords -> sem herói."""
    cfg = STYLE.get("auto", {}); gap = cfg.get("gap_frames", 12); maxw = cfg.get("max_words", 4); maxc = cfg.get("max_chars", 22)
    hold = cfg.get("hold_frames", 40); ymode = cfg.get("y_mode", "auto")
    groups, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        chars = sum(len(x["text"]) for x in cur) + len(cur) - 1
        brk = nxt is None or (nxt["start_f"] - w["end_f"] > gap) or len(cur) >= maxw or chars >= maxc or re.search(r"[.!?]$", w["text"])
        if brk: groups.append(cur); cur = []
    # stopword sobrando no fim do bloco (ex.: "... enganar o") vai pro começo do próximo
    for gi in range(len(groups) - 1):
        g, nx = groups[gi], groups[gi + 1]
        while len(g) > 1 and norm(g[-1]["text"]) in STYLE["_passage"] and nx[0]["start_f"] - g[-1]["end_f"] <= gap:
            nx.insert(0, g.pop())
    units = set(cfg.get("number_units", "mil milhão milhões bilhão bilhões % reais dólares dólar euros").split())
    blocks = []
    for gi, g in enumerate(groups):
        toks = [re.sub(r"[,.!?;:]+$", "", x["text"]) for x in g]
        cand = [(any(c.isdigit() for c in t), len(t), k) for k, t in enumerate(toks) if norm(t) not in STYLE["_passage"]]
        hero_i = max(cand)[2] if cand else None
        hero_j = hero_i
        if hero_i is not None and any(c.isdigit() for c in toks[hero_i]) and hero_i + 1 < len(toks) and toks[hero_i + 1].lower() in units:
            hero_j = hero_i + 1  # "130 mil" vira herói de 2 palavras
        chunks = []
        if hero_i is None: chunks = [[" ".join(toks), "s"]]
        else:
            if hero_i > 0: chunks.append([" ".join(toks[:hero_i]), "s"])
            chunks.append([" ".join(toks[hero_i:hero_j + 1]), "b"])
            if hero_j < len(toks) - 1: chunks.append([" ".join(toks[hero_j + 1:]), "s"])
        start = g[0]["start_f"]; end = g[-1]["end_f"] + hold
        if gi + 1 < len(groups): end = min(end, groups[gi + 1][0]["start_f"])
        caps = [x["cut_at"] for x in g if x.get("cut_at")]  # palavra marca onde o bloco tem que sumir (ex.: início de split)
        if caps: end = min(end, min(caps))
        blocks.append({"key": f"B{gi:03d}", "chunks": chunks, "start_f": start, "end_f": end, "y_mode": ymode, "words_f": [x["start_f"] for x in g]})
    return blocks

class Data:
    def __init__(self, pdir=None, job=None):
        if job is not None: self._from_job(job); return
        self._from_project(pdir)
    def _from_job(self, jobp):
        global W, H, FPS, SCALE
        j = json.load(open(jobp)); FPS = int(round(j.get("fps", 30))); W, H = j.get("size", [1080, 1920]); SCALE = W / 1080
        self.total = j["total_frames"]; self.words = []
        if j.get("blocks_override") and os.path.exists(j["blocks_override"]):
            self.plan = {"blocks": json.load(open(j["blocks_override"])), "ranges": []}
        else:
            self.plan = {"blocks": auto_blocks(j["words"]), "ranges": []}
            json.dump(self.plan["blocks"], open(os.path.join(os.path.dirname(jobp), "blocks_auto.json"), "w"), ensure_ascii=False, indent=1)
        self.job_mode = True
    def _from_project(self, pdir):
        self.job_mode = False
        self.plan = json.load(open(os.path.join(pdir, "edit", "caption_plan.json")))
        tr = json.load(open(os.path.join(pdir, "edit", "transcripts", "davinci_transcript.json")))
        self.words = [(tc2f(w["start"]), tc2f(w["end"]), w["text"].strip()) for s in tr["segments"] for w in s["words"] if w["text"].strip() != "(...)"]
        self.total = self.plan["total_frames"]
    def src_frame(self, tl_f):
        for r in self.plan["ranges"]:
            if r["out_start"] <= tl_f < r["out_start"] + r["dur"]:
                return tc2f(r["src_in"]) + (tl_f - r["out_start"])
        return None
    def word_starts(self, block):
        if getattr(self, "job_mode", False): return block.get("words_f")
        toks = [t for c in block["chunks"] for t in c[0].split()]
        s0 = self.src_frame(block["start_f"])
        if s0 is None: return None
        s1 = s0 + (block["end_f"] - block["start_f"])
        cand = [w for w in self.words if s0 - 8 <= w[0] <= s1 + 2]
        out, i = [], 0
        for t in toks:
            nt = norm(t); hit = None
            for j in range(i, len(cand)):
                nc = norm(cand[j][2])
                if nc == nt or (nt and nc.startswith(nt)) or (nt and nt.startswith(nc) and len(nc) >= 3): hit = j; break
            if hit is None: return None
            out.append(cand[hit][0] - s0 + block["start_f"]); i = hit + 1
        return out

def classify(word, hero, block):
    n = norm(word)
    if hero:
        if block.get("fx"): return "keyword", block["fx"]
        for fx, r in STYLE["_rules"].items():
            if (r["digits"] and any(ch.isdigit() for ch in word)) or n in r["words"]: return "keyword", fx
        return "keyword", STYLE.get("fx_default", "bounce")
    return ("passage", None) if n in STYLE["_passage"] else ("structural", None)

# ---------------- layout ----------------
def layout_block(block):
    chunks = block["chunks"]; bi = [i for i, c in enumerate(chunks) if c[1] == "b"]
    if not bi:
        pre, hero, post = [], [t for c in chunks for t in c[0].split()], []; hero_size = STYLE["small_size"] + 30
    else:
        pre = [t for c in chunks[:bi[0]] for t in c[0].split()]
        hero = [t for c in chunks[bi[0]:bi[-1] + 1] for t in c[0].split()]
        post = [t for c in chunks[bi[-1] + 1:] for t in c[0].split()]
        hero_size = STYLE["hero_size"]
    small_size = STYLE["small_size"]
    def line_w(words, size, trk, gap):
        f = font(size); return sum(text_w(disp(w), f, trk) for w in words) + gap * (len(words) - 1)
    hw = line_w(hero, hero_size, STYLE["tracking_hero"], STYLE["word_gap_hero"])
    if hw > STYLE["max_width"] * SCALE:
        hero_size = max(70, int(hero_size * STYLE["max_width"] / hw)); hw = line_w(hero, hero_size, STYLE["tracking_hero"], STYLE["word_gap_hero"])
    for words in (pre, post):
        while words and line_w(words, small_size, STYLE["tracking_small"], STYLE["word_gap_small"]) > STYLE["max_width"] * SCALE: small_size -= 2
    ym = block.get("y_mode", "low"); yc = {"above": STYLE["y_above"], "low": STYLE["y_low"]}.get(ym, STYLE.get("y_auto", 1380)) * (H / 1920)
    fh = font(hero_size); asc_h, desc_h = fh.getmetrics(); hero_top = yc - (asc_h + desc_h) / 2; hero_left = (W - hw) / 2
    
    fs = font(small_size); asc_s, desc_s = fs.getmetrics(); small_h = asc_s + desc_s
    sprites = []
    def place(words, size, trk, gap, x0, y0, hero_flag):
        f = font(size); x = x0
        for w in words:
            wt = text_w(disp(w), f, trk); cls, fx = classify(w, hero_flag and bool(bi), block)
            sprites.append({"text": disp(w), "x": x, "y": y0, "size": size, "trk": trk, "hero": hero_flag, "w": wt, "cls": cls, "fx": fx}); x += wt + gap
    if pre:
        pw = line_w(pre, small_size, STYLE["tracking_small"], STYLE["word_gap_small"]); x0 = min(max(40, hero_left + 6), W - 40 - pw)
        place(pre, small_size, STYLE["tracking_small"], STYLE["word_gap_small"], x0, hero_top - small_h - STYLE["line_gap"] + asc_h * 0.12, False)
    place(hero, hero_size, STYLE["tracking_hero"], STYLE["word_gap_hero"], hero_left, hero_top, True)
    if post:
        pw = line_w(post, small_size, STYLE["tracking_small"], STYLE["word_gap_small"]); x0 = max(40, min(hero_left + hw - pw - 4, W - 40 - pw))
        place(post, small_size, STYLE["tracking_small"], STYLE["word_gap_small"], x0, hero_top + asc_h + desc_h - asc_h * 0.16 + STYLE["line_gap"], False)
    return sprites

def render_sprite(sp):
    f = font(sp["size"]); asc, desc = f.getmetrics(); sh, gl = STYLE["shadow"], STYLE["glow"]
    pad = max(sh["blur"] * 3, gl["blur"] * 2) + 16
    w = int(sp["w"]) + pad * 2 + sh["dx"]; h = asc + desc + pad * 2 + sh["dy"]
    col = STYLE["shine_text"] if sp["fx"] == "shine" else STYLE["color"]
    text, shadow, glow = (Image.new("RGBA", (w, h), (0, 0, 0, 0)) for _ in range(3))
    td, sd, gd = ImageDraw.Draw(text), ImageDraw.Draw(shadow), ImageDraw.Draw(glow); x = pad
    for ch in sp["text"]:
        sd.text((x + sh["dx"], pad + sh["dy"]), ch, font=f, fill=(0, 0, 0, sh["alpha"]))
        gd.text((x, pad), ch, font=f, fill=(0, 0, 0, gl["alpha"])); td.text((x, pad), ch, font=f, fill=col)
        x += td.textlength(ch, font=f) + sp["trk"]
    shadow = shadow.filter(ImageFilter.GaussianBlur(sh["blur"])); glow = glow.filter(ImageFilter.GaussianBlur(gl["blur"]))
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0)); out.alpha_composite(glow); out.alpha_composite(shadow); out.alpha_composite(text)
    return out, pad, text.split()[3]

# ---------------- efeitos ----------------
def apply_shine(img, mask, t):
    w, h = img.size; cfg = STYLE["shine"]; band = int(w * cfg["band"]); cx = -band + (w + 2 * band) * t
    xs = np.arange(w)[None, :] + np.arange(h)[:, None] * 0.55
    prof = np.exp(-((xs - cx) ** 2) / (2 * (band / 2.5) ** 2)); m = np.array(mask).astype(np.float32) / 255
    light = (prof * m * 255 * cfg["gain"]).clip(0, 255).astype(np.uint8)
    lay = Image.new("RGBA", (w, h), (255, 255, 255, 0)); lay.putalpha(Image.fromarray(light))
    b = np.array(lay.filter(ImageFilter.GaussianBlur(cfg["bloom"]))); b[..., 3] = (b[..., 3] * 0.55).astype(np.uint8)
    out = img.copy(); out.alpha_composite(Image.fromarray(b)); out.alpha_composite(lay); return out

def motion_blur_v(img, length):
    if length < 1: return img
    n = int(min(12, max(2, length))); arr = np.array(img).astype(np.float32); acc = np.zeros_like(arr)
    for i in range(n):
        off = int(round(length * i / (n - 1))); sh = np.roll(arr, off, axis=0)
        if off: sh[:off] = 0
        acc += sh
    return Image.fromarray((acc / n).astype(np.uint8))

def rot_jit(img, f_i, key):
    cfg = STYLE["jitter"]; rnd = random.Random(f"{key}{f_i // (FPS // cfg['fps'])}")
    return img.rotate(rnd.uniform(-cfg["rot"], cfg["rot"]), resample=Image.BICUBIC), rnd.uniform(-cfg["px"], cfg["px"]), rnd.uniform(-cfg["px"], cfg["px"])

def transform(el, f_i):
    IN = STYLE["in_frames"]
    if STYLE["jitter"]["on"]:
        step = FPS // STYLE["jitter"]["fps"]; f_i = el["t_in"] + ((f_i - el["t_in"]) // step) * step
    k = (f_i - el["t_in"]) / IN; img, mask = el["img"], el["mask"]
    dx = dy = 0.0; sc = op = 1.0; blur_len = focus = 0.0
    if k < 1:
        e = ease_expo(max(0.0, k)); e_prev = ease_expo(max(0.0, k - 1 / IN))
        op = min(1.0, e * 1.25); dy = (1 - e) * STYLE["rise_px"]
        blur_len = abs(e - e_prev) * STYLE["rise_px"] * STYLE["motion_blur"]; focus = (1 - e) * STYLE["focus_blur"]
        if el["fx"] == "bounce":
            b = ease_back(max(0.0, k)); cfg = STYLE["bounce"]
            dy = (1 - b) * STYLE["rise_px"]; sc = max(0.8, 1 + (b - 1) * (cfg["over_scale"] - 1) * 4 + (1 - e) * 0.08)
        if el["fx"] == "flicker":
            pat = STYLE["flicker"]["pattern"]; idx = int(k * IN)
            if idx < len(pat): op *= pat[idx]
            focus *= 0.4
    if focus > 0.3: img = img.filter(ImageFilter.GaussianBlur(focus))
    if blur_len >= 1: img = motion_blur_v(img, blur_len)
    if el["fx"] == "shine":
        cfg = STYLE["shine"]; t = (f_i - el["t_in"] - IN - cfg["delay"]) / cfg["dur"]
        if 0 <= t <= 1: img = apply_shine(img, mask, t)
    if STYLE["jitter"]["on"]:
        img, jx, jy = rot_jit(img, f_i, el["key"] + el["text"]); dx += jx; dy += jy
    OUT = STYLE["out_frames"]
    if f_i > el["t_end"] - OUT: op = min(op, max(0.0, (el["t_end"] - f_i) / OUT))
    return img, dx, dy, op, sc

def frame_at(elems, f_i, canvas):
    for el in elems:
        if f_i < el["t_in"] or f_i > el["t_end"] + 1: continue
        img, dx, dy, op, sc = transform(el, f_i)
        if op <= 0: continue
        if abs(sc - 1) > 1e-3: img = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.BICUBIC)
        arr = np.array(img)
        if op < 1: arr = arr.copy(); arr[..., 3] = (arr[..., 3].astype(np.float32) * op).astype(np.uint8)
        x = int(el["x"] - el["pad"] - (img.width - el["img"].width) / 2 + dx); y = int(el["y"] - el["pad"] - (img.height - el["img"].height) / 2 + dy)
        ys, xs = max(0, y), max(0, x); ye, xe = min(H, y + arr.shape[0]), min(W, x + arr.shape[1])
        if ye <= ys or xe <= xs: continue
        src = arr[ys - y:ye - y, xs - x:xe - x]; dst = canvas[ys:ye, xs:xe]
        sa = src[..., 3:4].astype(np.float32) / 255; da = dst[..., 3:4].astype(np.float32) / 255; oa = sa + da * (1 - sa)
        dst[..., :3] = ((src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)).astype(np.uint8); dst[..., 3:4] = (oa * 255).astype(np.uint8)

def build(data, range_a=0, range_b=None):
    range_b = data.total if range_b is None else range_b
    blocks = sorted(data.plan["blocks"], key=lambda b: b["start_f"])
    beat_end = {r["beat"]: r["out_start"] + r["dur"] - 2 for r in data.plan["ranges"]}
    elems = []; fallback = 0; fx_count = {}
    for i, b in enumerate(blocks):
        if b["end_f"] < range_a or b["start_f"] > range_b: continue
        end = b["end_f"]
        if i + 1 < len(blocks): end = min(end, blocks[i + 1]["start_f"] - STYLE["lead"])
        end = min(end, beat_end.get(b.get("beat"), end))
        starts = data.word_starts(b); sprites = layout_block(b)
        if starts is None or len(starts) != len(sprites):
            fallback += 1; n = len(sprites); span = max(1, end - b["start_f"] - 6); starts = [b["start_f"] + int(span * k / n) for k in range(n)]
        starts = [max(b["start_f"], s) for s in starts]
        for sp, st in zip(sprites, starts):
            img, pad, mask = render_sprite(sp)
            if sp["fx"]: fx_count[sp["fx"]] = fx_count.get(sp["fx"], 0) + 1
            elems.append({"img": img, "mask": mask, "pad": pad, "x": sp["x"], "y": sp["y"], "hero": sp["hero"], "fx": sp["fx"], "cls": sp["cls"],
                          "text": sp["text"], "t_in": st - STYLE["lead"], "t_end": end, "key": b.get("key", str(i))})
    print(f"sprites: {len(elems)} | fallback: {fallback} | fx: {fx_count}", flush=True)
    return elems

def render(elems, a, b, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-c:v", "prores_ks", "-profile:v", "4444", "-alpha_bits", "16", "-vendor", "apl0", "-pix_fmt", "yuva444p10le", path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f_i in range(a, b):
        canvas = np.zeros((H, W, 4), dtype=np.uint8); frame_at(elems, f_i, canvas); proc.stdin.write(canvas.tobytes())
        if (f_i - a) % 300 == 0: print("frame", f_i, "/", b, flush=True)
    proc.stdin.close(); proc.wait()
    print("encoded:", path, round(os.path.getsize(path) / 1e6, 1), "MB", flush=True)

def main():
    global STYLE
    ap = argparse.ArgumentParser()
    ap.add_argument("--project"); ap.add_argument("--job"); ap.add_argument("--style", required=True); ap.add_argument("--out")
    ap.add_argument("--range", nargs=2, type=int); ap.add_argument("--stills"); ap.add_argument("--stills-dir"); ap.add_argument("--jitter", action="store_true")
    a = ap.parse_args()
    STYLE = load_style(a.style)
    if a.jitter: STYLE["jitter"]["on"] = True
    data = Data(a.project, a.job) if a.job else Data(a.project)
    if not a.project and not a.job: ap.error("--project ou --job")
    r0, r1 = (a.range if a.range else (0, data.total))
    elems = build(data, r0, r1)
    if a.stills:
        d = a.stills_dir or os.path.join(a.project or os.path.dirname(a.job), "stills"); os.makedirs(d, exist_ok=True)
        for f_i in [int(x) for x in a.stills.split(",")]:
            canvas = np.zeros((H, W, 4), dtype=np.uint8); frame_at(elems, f_i, canvas); Image.fromarray(canvas).save(os.path.join(d, f"f{f_i:04d}.png"))
        return
    out = a.out or os.path.join(a.project or os.path.dirname(a.job), "edit" if a.project else "", "overlay" if a.project else "", f"captions_{os.path.splitext(os.path.basename(a.style))[0]}.mov")
    render(elems, r0, r1, out)

if __name__ == "__main__":
    main()
