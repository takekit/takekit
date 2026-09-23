#!/usr/bin/env python3
"""Captions palco-abc: linha única 1–3 palavras, ênfase duas linhas, hold de CTA.

Contrato visual: video/resolve/styles/caption-style-config.json
  — camadas independentes; overlap medido por glyph bounds visíveis;
    sombra da frente cai na linha de trás; ouro radial só no CTA;
    profundidade e cor da ênfase vêm do bloco, não da família.

  --style styles/palco-face.json | palco-canvas.json | palco-hold.json
"""
from __future__ import annotations
import argparse, json, math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import captions_engine as ce

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(ROOT))
STYLE = {}
_fonts = {}
_cmap = {}


def ease_out(t):
    return 1.0 if t >= 1 else 1 - math.pow(2, -STYLE["ease_k"] * max(0.0, t))


def hex_rgba(c, a=255):
    if isinstance(c, (list, tuple)):
        if len(c) == 4:
            return tuple(int(x) for x in c)
        return tuple(int(x) for x in c) + (int(a),)
    s = str(c).lstrip("#")
    r, g, b = int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    return (r, g, b, int(a))


def _srgb_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _lin_srgb(c):
    c = 12.92 * c if c <= 0.0031308 else 1.055 * (max(c, 0) ** (1 / 2.4)) - 0.055
    return int(round(max(0.0, min(1.0, c)) * 255))


def rgb_oklab(r, g, b):
    r, g, b = _srgb_lin(r), _srgb_lin(g), _srgb_lin(b)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return L, a, b2


def oklab_rgb(L, a, b):
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b2 = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return _lin_srgb(r), _lin_srgb(g), _lin_srgb(b2)


def oklch_lerp(c0, c1, t):
    L0, a0, b0 = rgb_oklab(*c0)
    L1, a1, b1 = rgb_oklab(*c1)
    C0, C1 = math.hypot(a0, b0), math.hypot(a1, b1)
    h0, h1 = math.atan2(b0, a0), math.atan2(b1, a1)
    dh = h1 - h0
    if dh > math.pi:
        dh -= 2 * math.pi
    if dh < -math.pi:
        dh += 2 * math.pi
    L = L0 + (L1 - L0) * t
    C = C0 + (C1 - C0) * t
    h = h0 + dh * t
    return oklab_rgb(L, C * math.cos(h), C * math.sin(h))


def gold_stops():
    spec = ((STYLE.get("cta") or {}).get("front") or {}).get("fill") or {}
    stops = spec.get("stops") or [
        {"at_percent": 0, "color": "#FFD85A"},
        {"at_percent": 48, "color": "#F4B400"},
        {"at_percent": 100, "color": "#8C5400"},
    ]
    out = []
    for s in stops:
        out.append((s["at_percent"] / 100.0, hex_rgba(s["color"])[:3]))
    return out, spec


def sample_gold(t, stops):
    t = max(0.0, min(1.0, t))
    for i in range(len(stops) - 1):
        a, ca = stops[i]
        b, cb = stops[i + 1]
        if t <= b or i == len(stops) - 2:
            u = 0 if b == a else (t - a) / (b - a)
            return oklch_lerp(ca, cb, max(0.0, min(1.0, u)))
    return stops[-1][1]


def cmap_of(path):
    if path not in _cmap:
        try:
            from fontTools.ttLib import TTFont
            _cmap[path] = TTFont(path).getBestCmap() or {}
        except Exception:
            _cmap[path] = None
    return _cmap[path]


def font_path(kind):
    key = "font_sans" if kind == "sans" else "font_script"
    return STYLE[key]


def font_has(path, text):
    cmap = cmap_of(path)
    if cmap is None:
        return True
    return all(ch == " " or ord(ch) in cmap for ch in text)


def pick_font(kind, text):
    """Cursiva só quando a Alvito tem o glifo; senão Hetrixo. Família não manda profundidade."""
    script = font_path("script")
    sans = font_path("sans")
    if kind == "script" and font_has(script, text):
        return script, "script"
    return sans, "sans"


def font(kind, size, text=""):
    path, used = pick_font(kind, text)
    size = max(8, int(round(size * ce.SCALE)))
    key = (path, size)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(path, size)
    return _fonts[key], used


def load_style(path):
    st = json.load(open(path))
    cfg_rel = st.get("caption_config")
    if cfg_rel:
        cfg_p = cfg_rel if os.path.isabs(cfg_rel) else os.path.join(ROOT, cfg_rel)
        if not os.path.isfile(cfg_p):
            cfg_p = os.path.join(REPO, cfg_rel)
        if os.path.isfile(cfg_p):
            cfg = json.load(open(cfg_p))
            fonts = cfg.get("fonts") or {}
            if fonts.get("sans", {}).get("file"):
                st["font_sans"] = fonts["sans"]["file"]
            if fonts.get("script", {}).get("file"):
                st["font_script"] = fonts["script"]["file"]
            styles = cfg.get("styles") or {}
            if "cta_double_line" in styles:
                st["cta"] = styles["cta_double_line"]
            if "emphasis_double_line" in styles:
                st["emphasis"] = styles["emphasis_double_line"]
            contract = cfg.get("composition_contract") or {}
            st.setdefault("max_width", contract.get("max_width_px", 920))
    st.setdefault("font_script", st.get("font_accent", st.get("font_sans")))
    for k in ("font_sans", "font_script"):
        p = os.path.expanduser(st[k])
        if p.startswith("video/"):
            p = os.path.join(REPO, p)
        st[k] = p if os.path.isabs(p) else os.path.join(ROOT, p)
    for k in ("color_sans", "color_accent"):
        if k in st:
            st[k] = tuple(st[k])
    if st.get("stroke") and st["stroke"].get("color"):
        st["stroke"]["color"] = tuple(st["stroke"]["color"])
    st["_passage"] = ce.wordset(st.get("passage_words", ""))
    return st


def apply_case(text, case):
    if case == "upper":
        return text.upper()
    if case == "lower" or case == "lowercase":
        return text.lower()
    return text


def text_size(draw, text, fnt, tracking):
    if not text:
        return 0
    w = 0
    for i, ch in enumerate(text):
        w += draw.textlength(ch, font=fnt)
        if i < len(text) - 1:
            w += tracking
    return int(math.ceil(w))


def draw_tracked(draw, xy, text, fnt, fill, tracking):
    x, y = xy
    for i, ch in enumerate(text):
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + (tracking if i < len(text) - 1 else 0)


def vis_bounds(img, thr=12):
    a = np.array(img)[..., 3]
    ys, xs = np.where(a > thr)
    if xs.size == 0:
        return (0, 0, img.size[0], img.size[1])
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def paint_gold(mask_img, vis):
    stops, spec = gold_stops()
    arr = np.array(mask_img)
    h, w = arr.shape[:2]
    x0, y0, x1, y1 = vis
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)
    cx = x0 + bw * (spec.get("center") or {}).get("x_percent", 46) / 100.0
    cy = y0 + bh * (spec.get("center") or {}).get("y_percent", 30) / 100.0
    radius = max(bw, bh) * spec.get("radius_percent", 70) / 100.0
    yy, xx = np.ogrid[:h, :w]
    t = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / max(1.0, radius)
    t = np.clip(t, 0, 1)
    lut = np.array([sample_gold(i / 255.0, stops) for i in range(256)], dtype=np.uint8)
    idx = (t * 255).astype(np.uint8)
    rgb = lut[idx]
    out = np.zeros_like(arr)
    out[..., :3] = rgb
    out[..., 3] = arr[..., 3]
    return Image.fromarray(out)


def render_line(spec):
    """Uma linha: fill (+ shadow separado). Bounds = glifos visíveis, não metrics."""
    text = apply_case(spec["text"], spec.get("case", "preserve"))
    kind = spec.get("font", "sans")
    size = int(spec.get("size_px") or STYLE["size"]["sans" if kind == "sans" else "accent"])
    tracking = float(spec.get("tracking_px", STYLE.get("tracking", {}).get(kind, -2)))
    fnt, used = font(kind, size, text)
    d0 = ImageDraw.Draw(Image.new("RGBA", (4, 4)))
    tw = text_size(d0, text, fnt, tracking)
    asc, desc = fnt.getmetrics()
    sh = spec.get("shadow") or {"enabled": False}
    blur = int(sh.get("blur_px", 0) or 0) if sh.get("enabled") else 0
    dx = int(sh.get("offset_x_px", 0) or 0) if sh.get("enabled") else 0
    dy = int(sh.get("offset_y_px", 0) or 0) if sh.get("enabled") else 0
    pad = max(blur * 3, abs(dx), abs(dy), 16)
    img_w = tw + pad * 2 + 8
    img_h = asc + desc + pad * 2 + abs(dy) + 8
    fill_img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    td = ImageDraw.Draw(fill_img)
    origin = (pad, pad)
    fill = spec.get("fill") or {"type": "solid", "color": "#FFFFFF"}
    if isinstance(fill, str):
        fill = {"type": "solid", "color": fill}
    if fill.get("type") != "radial_gradient" and not fill.get("color"):
        fill = dict(fill)
        fill["color"] = fill.get("color_on_dark") or fill.get("example_color_from_reference") or fill.get("color_on_light") or "#FFFFFF"
    if fill.get("type") == "radial_gradient":
        draw_tracked(td, origin, text, fnt, (255, 255, 255, 255), tracking)
        vis = vis_bounds(fill_img)
        fill_img = paint_gold(fill_img, vis)
    else:
        col = hex_rgba(fill.get("color") or fill.get("color_on_dark") or "#FFFFFF")
        draw_tracked(td, origin, text, fnt, col, tracking)
        vis = vis_bounds(fill_img)
    shadow_img = None
    if sh.get("enabled") and (blur or sh.get("opacity", 0)):
        shadow_img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow_img)
        alpha = int(round(float(sh.get("opacity", 0.5)) * 255))
        scol = hex_rgba(sh.get("color", "#000000"), alpha)
        draw_tracked(sd, (origin[0] + dx, origin[1] + dy), text, fnt, scol, tracking)
        if blur:
            shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(blur))
    return {
        "fill": fill_img,
        "shadow": shadow_img,
        "vis": vis,
        "used_font": used,
        "text": text,
    }


def tokens(block):
    return [t for c in block["chunks"] for t in c[0].split()]


def line_spec_from_style(role_style, text, fill_override=None):
    fill = fill_override or role_style.get("fill")
    return {
        "text": text,
        "font": role_style.get("font", "sans"),
        "size_px": role_style.get("size_px"),
        "tracking_px": role_style.get("tracking_px", -2),
        "case": role_style.get("case", "preserve"),
        "fill": fill,
        "shadow": role_style.get("shadow") or {"enabled": False},
        "z_index": role_style.get("z_index", 1),
    }


def _items_for_line(line, x, y, delay, z_fill, z_shadow):
    items = []
    if line["shadow"] is not None:
        items.append({"img": line["shadow"], "x": x, "y": y, "pad": 0, "delay": delay, "z": z_shadow})
    items.append({"img": line["fill"], "x": x, "y": y, "pad": 0, "delay": delay, "z": z_fill})
    return items


def layout_double(block, recipe):
    """Duas camadas. Distância = borda visível dos glifos + visual_gap_px (negativo = overlap)."""
    rec_block = recipe.get("block") or {}
    cx = block.get("center_x_px", rec_block.get("center_x_px", 540)) * (ce.W / 1080)
    cy = block.get("y", rec_block.get("center_y_px", STYLE.get("y", 1180))) * (ce.H / 1920)
    gap = int(block.get("visual_gap_px", rec_block.get("visual_gap_px", -20)))
    back_s = block.get("back") or {}
    front_s = block.get("front") or {}
    back_text = back_s.get("text") or (recipe.get("example") or {}).get("back_line", "")
    front_text = front_s.get("text") or (recipe.get("example") or {}).get("front_line", "")
    back_spec = line_spec_from_style(recipe["back_line"], back_text, back_s.get("fill"))
    front_spec = line_spec_from_style(recipe["front_line"], front_text, front_s.get("fill"))
    for spec, ov in ((back_spec, back_s), (front_spec, front_s)):
        for k in ("font", "size_px", "tracking_px", "case", "z_index"):
            if k in ov:
                spec[k] = ov[k]
    # tracking até a largura visual das duas linhas ficar próxima (12% CTA / 18% ênfase)
    rel = str((recipe.get("block") or {}).get("width_relationship") or "")
    tol = 0.12 if "12%" in rel else 0.18
    back = front = None
    for _ in range(10):
        back = render_line(back_spec)
        front = render_line(front_spec)
        bw = max(1, back["vis"][2] - back["vis"][0])
        fw = max(1, front["vis"][2] - front["vis"][0])
        if min(bw, fw) / max(bw, fw) >= 1 - tol:
            break
        if bw < fw:
            back_spec["tracking_px"] = float(back_spec.get("tracking_px") or 0) + 1.2
        else:
            front_spec["tracking_px"] = float(front_spec.get("tracking_px") or 0) + 1.2
    bv, fv = back["vis"], front["vis"]
    bh, fh = bv[3] - bv[1], fv[3] - fv[1]
    bw, fw = bv[2] - bv[0], fv[2] - fv[0]
    total = bh + gap + fh
    back_vis_y = cy - total / 2.0
    front_vis_y = back_vis_y + bh + gap
    back_x = cx - bw / 2.0 - bv[0]
    front_x = cx - fw / 2.0 - fv[0]
    back_y = back_vis_y - bv[1]
    front_y = front_vis_y - fv[1]
    bz = int((block.get("back") or {}).get("z_index", recipe["back_line"].get("z_index", 1)))
    fz = int((block.get("front") or {}).get("z_index", recipe["front_line"].get("z_index", 3)))
    # ordem de blit: trás (sombra+glifo) → sombra da frente → glifo da frente
    items = []
    items += _items_for_line(back, back_x, back_y, delay=0, z_fill=bz, z_shadow=bz - 1)
    items += _items_for_line(front, front_x, front_y, delay=2, z_fill=fz, z_shadow=fz - 1)
    return items


def layout_single(block):
    words = tokens(block)
    text = " ".join(words)
    accent = any(c[1] == "b" for c in block["chunks"])
    kind = "script" if accent else "sans"
    fill = STYLE["color_accent" if accent else "color_sans"]
    # ênfase de uma linha continua sólida; script só se o glifo existir
    spec = {
        "text": apply_case(text, block.get("case", STYLE.get("case", "sentence"))),
        "font": kind,
        "size_px": STYLE["size"]["accent" if accent else "sans"],
        "tracking_px": STYLE.get("tracking", {}).get("script" if kind == "script" else "sans", -2),
        "case": "preserve",
        "fill": {"type": "solid", "color": "#%02X%02X%02X" % tuple(fill[:3])},
        "shadow": {
            "enabled": bool((STYLE.get("shadow") or {}).get("alpha")),
            "offset_x_px": (STYLE.get("shadow") or {}).get("dx", 0),
            "offset_y_px": (STYLE.get("shadow") or {}).get("dy", 3),
            "blur_px": (STYLE.get("shadow") or {}).get("blur", 6),
            "opacity": ((STYLE.get("shadow") or {}).get("alpha", 0) / 255.0),
            "color": "#000000",
        },
    }
    if STYLE.get("case") == "sentence" and spec["text"]:
        spec["text"] = spec["text"][:1].upper() + spec["text"][1:]
    line = render_line(spec)
    vis = line["vis"]
    yc = block.get("y", STYLE["y"]) * (ce.H / 1920)
    vh, vw = vis[3] - vis[1], vis[2] - vis[0]
    x = (ce.W - vw) / 2.0 - vis[0]
    y = yc - vh / 2.0 - vis[1]
    return _items_for_line(line, x, y, delay=0, z_fill=2, z_shadow=1)


def layout_block(block):
    layout = block.get("layout") or STYLE.get("layout", "face")
    if layout in ("hold", "cta"):
        rec = STYLE.get("cta") or {}
        return layout_double(block, rec)
    if layout in ("emphasis", "stack"):
        rec = STYLE.get("emphasis") or {}
        return layout_double(block, rec)
    return layout_single(block)


def transform(el, f_i, t_in, t_out):
    IN, OUT = STYLE["in_frames"], STYLE["out_frames"]
    delay = int(el.get("delay") or 0)
    t_in = t_in + delay
    img, op = el["img"], 1.0
    k = (f_i - t_in) / max(1, IN)
    if k < 1:
        e = ease_out(max(0.0, k))
        op = e
        rise = int((1 - e) * img.size[1] * 0.45)
        if rise > 0:
            shifted = Image.new("RGBA", img.size, (0, 0, 0, 0))
            shifted.paste(img, (0, rise))
            img = shifted
    if f_i >= t_out:
        e = min(1.0, (f_i - t_out + 1) / max(1, OUT))
        op = min(op, 1 - e)
    return img, op


def blit(canvas, img, x, y, pad, op):
    arr = np.array(img)
    if op < 1:
        arr = arr.copy()
        arr[..., 3] = (arr[..., 3].astype(np.float32) * op).astype(np.uint8)
    x, y = int(x - pad), int(y - pad)
    ys, xs = max(0, y), max(0, x)
    ye, xe = min(ce.H, y + arr.shape[0]), min(ce.W, x + arr.shape[1])
    if ye <= ys or xe <= xs:
        return
    src = arr[ys - y:ye - y, xs - x:xe - x]
    dst = canvas[ys:ye, xs:xe]
    sa = src[..., 3:4].astype(np.float32) / 255
    da = dst[..., 3:4].astype(np.float32) / 255
    oa = sa + da * (1 - sa)
    dst[..., :3] = ((src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)).astype(np.uint8)
    dst[..., 3:4] = (oa * 255).astype(np.uint8)


def build(data, range_a=0, range_b=None):
    range_b = data.total if range_b is None else range_b
    blocks = sorted(data.plan["blocks"], key=lambda b: b["start_f"])
    items = []
    for i, b in enumerate(blocks):
        if b["end_f"] < range_a or b["start_f"] > range_b:
            continue
        end = b["end_f"]
        if i + 1 < len(blocks):
            end = min(end, blocks[i + 1]["start_f"] - STYLE["lead"])
        t_in = max(0, b["start_f"] - STYLE["lead"])
        t_out = max(t_in + 1, end - STYLE["out_frames"])
        for sp in layout_block(b):
            items.append({**sp, "t_in": t_in, "t_out": t_out})
    items.sort(key=lambda e: e.get("z", 0))
    return items


def frame_canvas(items, f_i):
    canvas = np.zeros((ce.H, ce.W, 4), dtype=np.uint8)
    for el in items:
        if f_i < el["t_in"] or f_i > el["t_out"] + STYLE["out_frames"]:
            continue
        img, op = transform(el, f_i, el["t_in"], el["t_out"])
        if op > 0:
            blit(canvas, img, el["x"], el["y"], el.get("pad", 0), op)
    return canvas


def render(items, a, b, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
           "-s", f"{ce.W}x{ce.H}", "-r", str(ce.FPS), "-i", "-",
           "-c:v", "prores_ks", "-profile:v", "4444", "-alpha_bits", "16",
           "-vendor", "apl0", "-pix_fmt", "yuva444p10le", path]
    import subprocess
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f_i in range(a, b):
        proc.stdin.write(frame_canvas(items, f_i).tobytes())
    proc.stdin.close()
    proc.wait()


def save_still(canvas, path, under=None):
    cap = Image.fromarray(canvas)
    if under and os.path.isfile(under):
        bg = Image.open(under).convert("RGBA").resize((ce.W, ce.H))
        bg.alpha_composite(cap)
        bg.save(path)
    else:
        cap.save(path)


def main():
    global STYLE
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", required=True)
    ap.add_argument("--style", required=True)
    ap.add_argument("--out")
    ap.add_argument("--range", nargs=2, type=int)
    ap.add_argument("--stills")
    ap.add_argument("--stills-dir")
    ap.add_argument("--under-dir", help="PNG fXXXX.png de frame real para composite")
    a = ap.parse_args()
    STYLE = load_style(a.style)
    ce.STYLE = STYLE
    data = ce.Data(job=a.job)
    r0, r1 = (a.range if a.range else (0, data.total))
    items = build(data, r0, r1)
    if a.stills:
        d = a.stills_dir or os.path.join(os.path.dirname(a.job), "stills")
        os.makedirs(d, exist_ok=True)
        for f_i in [int(x) for x in a.stills.split(",")]:
            canvas = frame_canvas(items, f_i)
            under = None
            if a.under_dir:
                under = os.path.join(a.under_dir, f"f{f_i:04d}.png")
            save_still(canvas, os.path.join(d, f"f{f_i:04d}.png"), under)
        return
    out = a.out or os.path.join(os.path.dirname(a.job), f"captions_{os.path.splitext(os.path.basename(a.style))[0]}.mov")
    render(items, r0, r1, out)


if __name__ == "__main__":
    main()
