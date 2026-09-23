#!/usr/bin/env python3
"""Film burn / light leak procedural — asset reutilizável para gancho e transições.

Gera um clipe curto (default 24 f @30) 1080x1920 com blobs quentes que crescem, atingem pico e
somem. Pensado p/ composite **Screen/Add** (fundo preto) — o frame de pico é o frame `peak` (marcar
no Resolve com M e alinhar ao corte). Também exporta versão alpha (ProRes 4444) p/ overlay direto.

Uso: lightleak.py --out DIR [--frames 24] [--peak 6] [--seed 3] [--strength 1.0] [--hue warm|gold|cool]
Saída: DIR/lightleak_<hue>_s<seed>.mov (yuv420p, fundo preto) + _alpha.mov
"""
import argparse, os, subprocess, math, random
import numpy as np

W, H, FPS = 1080, 1920, 30
HUES = {"warm": [(255, 140, 40), (255, 60, 20), (255, 220, 160)], "gold": [(244, 180, 0), (255, 120, 20), (255, 240, 200)], "cool": [(80, 160, 255), (255, 255, 255), (120, 80, 255)]}

def blob(yy, xx, cx, cy, rx, ry, ang):
    ca, sa = math.cos(ang), math.sin(ang)
    x = (xx - cx) * ca + (yy - cy) * sa; y = -(xx - cx) * sa + (yy - cy) * ca
    return np.exp(-((x / rx) ** 2 + (y / ry) ** 2))

def render(frames, peak, seed, strength, hue, out_dir):
    rnd = random.Random(seed); cols = HUES[hue]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    yy /= H; xx /= W
    blobs = []
    for i in range(3):
        blobs.append({"cx": rnd.uniform(-0.2, 1.2), "cy": rnd.uniform(-0.1, 1.1), "rx": rnd.uniform(0.25, 0.7), "ry": rnd.uniform(0.15, 0.5),
                      "ang": rnd.uniform(0, math.pi), "col": np.array(cols[i], np.float32) / 255, "drift": (rnd.uniform(-0.02, 0.02), rnd.uniform(-0.01, 0.01)), "w": rnd.uniform(0.6, 1.0)})
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.join(out_dir, f"lightleak_{hue}_s{seed}")
    procs = []
    for suffix, pix, extra in (("", "yuv420p", ["-c:v", "libx264", "-crf", "14"]), ("_alpha", "yuva444p10le", ["-c:v", "prores_ks", "-profile:v", "4444", "-alpha_bits", "16"])):
        cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"] + extra + ["-pix_fmt", pix, base + suffix + ".mov"]
        procs.append(subprocess.Popen(cmd, stdin=subprocess.PIPE))
    for f in range(frames):
        # envelope: sobe rápido até peak, cai com cauda longa
        t = f / max(1, frames - 1)
        env = (f / peak) ** 1.6 if f <= peak else math.exp(-(f - peak) / (frames - peak) * 3.2)
        env = min(1.0, env) * strength
        img = np.zeros((H, W, 3), np.float32)
        for b in blobs:
            k = 1 + 0.9 * t
            m = blob(yy, xx, b["cx"] + b["drift"][0] * f, b["cy"] + b["drift"][1] * f, b["rx"] * k, b["ry"] * k, b["ang"]) * b["w"]
            img += m[..., None] * b["col"][None, None, :]
        # flash branco no pico
        flash = math.exp(-((f - peak) / 1.2) ** 2) * 0.22 * strength
        img = img * env + flash
        # grão leve
        img += (np.random.RandomState(seed * 100 + f).rand(H, W, 1).astype(np.float32) - 0.5) * 0.03 * env
        rgb = np.clip(img, 0, 1)
        a = np.clip(rgb.max(axis=2), 0, 1)
        frame = np.dstack([rgb * 255, a[..., None] * 255]).astype(np.uint8)
        # versão screen: fundo preto, alpha 255
        scr = frame.copy(); scr[..., 3] = 255
        procs[0].stdin.write(scr.tobytes()); procs[1].stdin.write(frame.tobytes())
    for p in procs: p.stdin.close(); p.wait()
    print("ok:", base + ".mov", "| peak frame:", peak)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--frames", type=int, default=24); ap.add_argument("--peak", type=int, default=6)
    ap.add_argument("--seed", type=int, default=3); ap.add_argument("--strength", type=float, default=0.7); ap.add_argument("--hue", default="warm", choices=list(HUES))
    a = ap.parse_args(); render(a.frames, a.peak, a.seed, a.strength, a.hue, a.out)
