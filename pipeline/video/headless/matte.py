#!/usr/bin/env python3
"""Máscara da pessoa com Robust Video Matting (RVM), sem Resolve/DepthMap.

Lê um trecho de vídeo com FFmpeg, roda o RVM (ONNX, CPU) quadro a quadro com o
estado recorrente e grava o alfa. O primeiro quadro é repetido algumas vezes antes
de gravar: sem isso a rede "acorda" no meio do corte e a borda do 1º frame sai mole.

    python3 video/headless/matte.py --video edit/aroll.mov --start 0 --end 57 --out edit/.work/u01 [--rgb]

Saída: <out>/matte_%04d.png (alfa 0..255, frame 0 = --start) e, com --rgb, rgb_%04d.png.
Precisa de onnxruntime (bash video/headless/setup.sh); o modelo vai para ~/.cache/takekit.
"""
from __future__ import annotations

import argparse, subprocess, time
from pathlib import Path

import numpy as np
from PIL import Image

from common import H, W, FPS, die, need, rvm_model, threads

WARMUP = 4
DOWNSAMPLE = 0.25   # recomendado pelo RVM para HD; o alfa sai em resolução cheia


def frames(video: Path, start: int, end: int, fps: int):
    """RGB uint8 HxWx3 de [start, end) — seek preciso no input + contagem exata."""
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start / fps:.6f}", "-i", str(video),
           "-frames:v", str(end - start), "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = W * H * 3
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    finally:
        proc.stdout.close()
        proc.wait()


class Matter:
    """Sessão RVM com estado recorrente; uma por trecho contínuo."""

    def __init__(self, downsample: float = DOWNSAMPLE):
        try:
            import onnxruntime as ort
        except ImportError:
            die("onnxruntime ausente. Rode `bash video/headless/setup.sh` e use pipeline/.venv/bin/python")
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads()
        so.inter_op_num_threads = 1
        so.log_severity_level = 3
        # CPU foi mais rápido que CoreML no M4 (~11 vs ~7 fps em 1080x1920).
        self.sess = ort.InferenceSession(str(rvm_model()), so, providers=["CPUExecutionProvider"])
        self.ratio = np.array([downsample], np.float32)
        self.reset()

    def reset(self) -> None:
        self.rec = [np.zeros((1, 1, 1, 1), np.float32)] * 4

    def __call__(self, rgb: np.ndarray) -> np.ndarray:
        x = (rgb.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        feeds = {"src": x, "downsample_ratio": self.ratio, **{f"r{i + 1}i": r for i, r in enumerate(self.rec)}}
        _fgr, pha, *self.rec = self.sess.run(None, feeds)
        return (pha[0, 0] * 255.0 + 0.5).clip(0, 255).astype(np.uint8)


def matte_range(video: Path, start: int, end: int, out: Path, fps: int = FPS, rgb: bool = False,
                matter: Matter | None = None) -> int:
    out.mkdir(parents=True, exist_ok=True)
    m = matter or Matter()
    m.reset()
    n = 0
    for n, fr in enumerate(frames(video, start, end, fps)):
        if n == 0:
            for _ in range(WARMUP):
                m(fr)
        Image.fromarray(m(fr), "L").save(out / f"matte_{n:04d}.png", compress_level=1)
        if rgb:
            Image.fromarray(fr, "RGB").save(out / f"rgb_{n:04d}.png", compress_level=1)
    count = n + 1 if end > start else 0
    if count != end - start:
        die(f"li {count} frames de {video.name} [{start},{end}), esperado {end - start}")
    return count


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--start", type=int, required=True, help="frame inicial")
    ap.add_argument("--end", type=int, required=True, help="frame final (exclusivo)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=int, default=FPS)
    ap.add_argument("--rgb", action="store_true", help="grava também rgb_%%04d.png (contrato do palco_b_composite)")
    ap.add_argument("--downsample", type=float, default=DOWNSAMPLE)
    a = ap.parse_args()
    need("ffmpeg")
    t0 = time.time()
    n = matte_range(Path(a.video), a.start, a.end, Path(a.out), a.fps, a.rgb, Matter(a.downsample))
    print(f"escrito {a.out}  {n} mattes  ({time.time() - t0:.1f}s)")


if __name__ == "__main__":
    main()
