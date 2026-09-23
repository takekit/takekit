"""Base do pipeline headless (sem DaVinci Resolve): ffprobe/ffmpeg, cortes, timeline, pastas.

Tudo roda por projeto e sem estado global: cada job escreve só dentro do próprio
`<projeto>/edit/`, então N projetos rodam em paralelo (ver batch.py).
"""
from __future__ import annotations

import hashlib, json, os, re, shutil, subprocess, sys, urllib.request
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent      # video/headless
VIDEO = HERE.parent                          # video/
ROOT = VIDEO.parent                          # raiz do pipeline (cwd do agente)
KIT = VIDEO / "resolve"                      # docs, presets, engine e assets (nome legado da pasta)

W, H, FPS = 1080, 1920, 30
CREAM_HEX = "0xF4EFE6"                       # creme do palco (engine/palco_b_composite.py)

RVM_URL = "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx"
RVM_SHA256 = "88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828"


def die(msg: str) -> None:
    sys.exit(f"erro: {msg}")


def need(*bins: str) -> None:
    for b in bins:
        if not shutil.which(b):
            die(f"`{b}` não encontrado no PATH")


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    """Roda e, se falhar, mostra o stderr do ffmpeg em vez de um traceback."""
    proc = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-25:]
        die(f"{Path(cmd[0]).name} falhou ({proc.returncode}):\n  " + "\n  ".join(tail))
    return proc


def threads() -> int:
    """Threads por job. Com N jobs em paralelo, cada um fica com sua fatia da CPU."""
    env = os.environ.get("TAKEKIT_JOB_THREADS")
    if env and env.isdigit() and int(env) > 0:
        return int(env)
    jobs = int(os.environ.get("TAKEKIT_MAX_JOBS", "1") or 1)
    return max(2, (os.cpu_count() or 4) // max(1, jobs))


def project_dir(arg: str) -> Path:
    p = Path(arg).expanduser()
    for cand in (p, Path.cwd() / p, ROOT / p):
        if cand.is_dir():
            return cand.resolve()
    die(f"projeto não encontrado: {arg}")
    raise AssertionError


def rel(path: Path, base: Path) -> str:
    try:
        return str(path.resolve().relative_to(base.resolve()))
    except ValueError:
        return str(path)


# ───────── ffprobe ─────────

@dataclass
class Media:
    width: int
    height: int
    fps: float
    frames: int
    duration: float
    has_audio: bool


def probe(path: Path) -> Media:
    need("ffprobe")
    out = run(["ffprobe", "-v", "error", "-show_entries",
               "stream=codec_type,width,height,r_frame_rate,nb_frames:stream_side_data=rotation:format=duration",
               "-of", "json", str(path)]).stdout
    data = json.loads(out)
    streams = data.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    if not v:
        die(f"sem vídeo: {path}")
    num, den = (v.get("r_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den or 1)
    w, h = int(v["width"]), int(v["height"])
    rot = next((abs(int(sd.get("rotation", 0))) for sd in v.get("side_data_list", []) if "rotation" in sd), 0)
    if rot in (90, 270):
        w, h = h, w
    dur = float(data.get("format", {}).get("duration") or 0)
    frames = int(v.get("nb_frames") or round(dur * fps))
    return Media(w, h, fps, frames, dur, any(s.get("codec_type") == "audio" for s in streams))


# ───────── cortes e timeline ─────────

@dataclass
class Unit:
    id: str
    src: tuple[int, int]      # frames na fonte, fim exclusivo
    start: int                # frames na timeline montada
    end: int
    text: str = ""

    @property
    def frames(self) -> int:
        return self.end - self.start


def load_cuts(pdir: Path) -> tuple[dict, int, list[Unit]]:
    path = pdir / "edit" / "cuts.json"
    if not path.is_file():
        die(f"faltou {rel(path, pdir)} (unidades da fala; ver WORKFLOW §3)")
    data = json.loads(path.read_text(encoding="utf-8"))
    fps = int(data.get("fps") or FPS)
    units, t = [], 0
    for i, c in enumerate(data.get("cuts") or []):
        a, b = (int(x) for x in c["src"])
        if b <= a:
            die(f"corte vazio: {c.get('id', i)} {a}-{b}")
        units.append(Unit(c.get("id") or f"u{i + 1:02d}", (a, b), t, t + b - a, c.get("texto", "")))
        t += b - a
    if not units:
        die("cuts.json sem cortes")
    return data, fps, units


def source_path(pdir: Path, cuts: dict, override: str | None) -> Path:
    if override:
        p = Path(override).expanduser()
        if p.is_file():
            return p.resolve()
        die(f"fonte não encontrada: {override}")
    name = cuts.get("source") or ""
    for cand in (Path(name), pdir / name, pdir / "input" / name, pdir / "edit" / name, pdir / "input" / "source.mp4"):
        if name and cand.is_file():
            return cand.resolve()
    die(f"fonte `{name}` não encontrada no projeto; passe --source")
    raise AssertionError


def palcos(pdir: Path, units: list[Unit]) -> dict[str, str]:
    """Palco A/B/C por unidade, do storyboard do plan.json (beat ↔ unidade na ordem, ou campo `unit`)."""
    plan = pdir / "edit" / "plan.json"
    if not plan.is_file():
        return {u.id: "A" for u in units}
    board = json.loads(plan.read_text(encoding="utf-8")).get("storyboard") or []
    out: dict[str, str] = {}
    for i, beat in enumerate(board):
        uid = beat.get("unit") or beat.get("unidade") or (units[i].id if i < len(units) else None)
        if uid:
            out[uid] = str(beat.get("palco") or "A").upper()[:1]
    return {u.id: out.get(u.id, "A") for u in units}


def work(pdir: Path, *parts: str) -> Path:
    d = pdir / "edit" / ".work"
    for p in parts:
        d = d / p
    d.mkdir(parents=True, exist_ok=True)
    return d


# ───────── tempo ─────────

def timecode(frame: int, fps: int = FPS) -> str:
    s, f = divmod(max(0, frame), fps)
    return f"{s // 3600:02d}:{s // 60 % 60:02d}:{s % 60:02d}:{f:02d}"


def to_frame(value: str, fps: int = FPS) -> int:
    """`72` (frame), `00:00:02:12` (timecode) ou `2.4s` (segundos)."""
    v = value.strip()
    if re.fullmatch(r"\d+", v):
        return int(v)
    if m := re.fullmatch(r"(\d+):(\d+):(\d+):(\d+)", v):
        h, mi, s, f = (int(x) for x in m.groups())
        return ((h * 60 + mi) * 60 + s) * fps + f
    if m := re.fullmatch(r"(\d+(?:\.\d+)?)s", v):
        return round(float(m.group(1)) * fps)
    die(f"tempo inválido: {value} (use frame, hh:mm:ss:ff ou 2.4s)")
    raise AssertionError


# ───────── modelo do RVM ─────────

def rvm_model() -> Path:
    """rvm_mobilenetv3_fp32.onnx em cache compartilhado (só leitura; seguro entre jobs)."""
    env = os.environ.get("TAKEKIT_RVM_MODEL")
    if env:
        return Path(env)
    dest = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "takekit" / "models" / Path(RVM_URL).name
    if dest.is_file() and _sha256(dest) == RVM_SHA256:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(f".{os.getpid()}.part")
    print(f"baixando modelo RVM → {dest}", flush=True)
    urllib.request.urlretrieve(RVM_URL, tmp)
    if _sha256(tmp) != RVM_SHA256:
        tmp.unlink(missing_ok=True)
        die("checksum do modelo RVM não confere")
    tmp.replace(dest)   # rename atômico: jobs paralelos não leem arquivo pela metade
    return dest


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
