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
    """Caminho relativo ao projeto quando dá (primeiro sem seguir symlinks, depois resolvido)."""
    for p, b in ((Path(os.path.abspath(path)), Path(os.path.abspath(base))), (path.resolve(), base.resolve())):
        try:
            return str(p.relative_to(b))
        except ValueError:
            pass
    return str(path)


def write_atomic(path: Path, text: str) -> None:
    """Grava num temporário ao lado e troca por rename (nunca escreve através de um symlink)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


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


def beats(pdir: Path, units: list[Unit]) -> dict[str, dict]:
    """Beat do storyboard do plan.json por unidade (beat ↔ unidade na ordem, ou campo `unit`)."""
    plan = pdir / "edit" / "plan.json"
    if not plan.is_file():
        return {}
    board = json.loads(plan.read_text(encoding="utf-8")).get("storyboard") or []
    out: dict[str, dict] = {}
    for i, beat in enumerate(board):
        uid = beat.get("unit") or beat.get("unidade") or (units[i].id if i < len(units) else None)
        if uid:
            out[uid] = beat
    return out


def palcos(pdir: Path, units: list[Unit]) -> dict[str, str]:
    """Palco A/B/C/D por unidade (A quando o beat não diz)."""
    board = beats(pdir, units)
    return {u.id: (str((board.get(u.id) or {}).get("palco") or "A").strip().upper()[:1] or "A") for u in units}


class Progress:
    """TAKEKIT_PROGRESS=<0..1> no stdout (só com --progress), monotônico, passo mínimo de 1%."""

    def __init__(self, on: bool):
        self.on, self.last = on, -1.0

    def __call__(self, x: float) -> None:
        x = max(0.0, min(1.0, x))
        if self.on and x > self.last and (x >= 1.0 or x - self.last >= 0.01 or self.last < 0):
            self.last = x
            print(f"TAKEKIT_PROGRESS={x:.3f}", flush=True)


def work(pdir: Path, *parts: str) -> Path:
    d = pdir / "edit" / ".work"
    for p in parts:
        d = d / p
    d.mkdir(parents=True, exist_ok=True)
    return d


# ───────── estilo da thread (edit/style.resolved.json) ─────────
# O engine grava o arquivo a cada job e antes de cada render. Sem ele (ou sem uma chave),
# vale o Talking Head + Motions de hoje.

QUALITY = {
    "preview": {"resolution": "720p", "codec": "h264", "preset": "veryfast", "bitrate": "1.5M",
                "audio": {"codec": "aac", "bitrate": "128k"}, "container": "mp4"},
    "export": {"resolution": f"{W}x{H}", "fps": FPS, "codec": "h264", "preset": "medium", "bitrate": "10M",
               "maxrate": "12M", "bufsize": "20M",
               "audio": {"codec": "aac", "bitrate": "256k", "loudness": {"I": -14, "TP": -1, "LRA": 11}},
               "container": "mp4"},
}


def style_resolved(pdir: Path) -> dict:
    """edit/style.resolved.json do projeto; {} quando não existe."""
    path = pdir / "edit" / "style.resolved.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        die(f"{rel(path, pdir)} inválido: {e}")
        raise AssertionError
    return data if isinstance(data, dict) else {}


def style_module(style: dict, name: str):
    """Preset do módulo (`caption`, `stage`, `cuts`, `soundEffects`, `transitions`) ou None."""
    return (style.get("modules") or {}).get(name)


def merged(base: dict, over: dict | None) -> dict:
    """`over` por cima de `base`, recursivo; chave ausente ou null fica com o default."""
    out = dict(base)
    for k, v in (over or {}).items():
        if v is None:
            continue
        out[k] = merged(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def quality(style: dict, stage: str) -> dict:
    """Qualidade `preview` ou `export` (alias `final`) do estilo, sobre os defaults."""
    key = "export" if stage in ("export", "final") else "preview"
    return merged(QUALITY[key], (style.get("quality") or {}).get(key))


def resolution(value, frame: tuple[int, int] = (W, H)) -> tuple[int, int]:
    """`720p` (lado menor; proporção do quadro, 9:16 → 720x1280), `1080x1920` ou [w, h]. Sempre par."""
    if value in (None, ""):
        w, h = frame
    elif isinstance(value, (list, tuple)) and len(value) == 2:
        w, h = (int(x) for x in value)
    else:
        v = str(value).strip().lower()
        if m := re.fullmatch(r"(\d+)p", v):
            short, (fw, fh) = int(m.group(1)), frame
            w, h = (short, short * fh / fw) if fw <= fh else (short * fw / fh, short)
        elif m := re.fullmatch(r"(\d+)\s*[x×:]\s*(\d+)", v):
            w, h = int(m.group(1)), int(m.group(2))
        else:
            die(f"resolução inválida: {value} (use 720p ou 1080x1920)")
            raise AssertionError
    w, h = (max(2, int(round(float(n) / 2)) * 2) for n in (w, h))
    return w, h


def stage_presets(style: dict) -> dict[str, dict]:
    """Presets de palco do estilo por letra (A/B/C/D)."""
    out = {}
    for p in style_module(style, "stage") or []:
        if isinstance(p, dict) and p.get("palco"):
            out[str(p["palco"]).strip().upper()[:1]] = p
    return out


def kit_file(path: str | None) -> Path | None:
    """Arquivo de um preset: absoluto, relativo a video/resolve/ ou, para assets fora do repo
    (assets/OMITTED.md), em $TAKEKIT_ASSETS."""
    if not path:
        return None
    p = Path(path).expanduser()
    if p.is_absolute():
        return p if p.is_file() else None
    cands = [KIT / p, ROOT / p]
    if os.environ.get("TAKEKIT_ASSETS"):
        cands.append(Path(os.environ["TAKEKIT_ASSETS"]).expanduser() / str(p).removeprefix("assets/"))
    return next((c.resolve() for c in cands if c.is_file()), None)


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
    try:
        return model_file(RVM_URL, RVM_SHA256, "TAKEKIT_RVM_MODEL", "modelo RVM")
    except (OSError, ValueError) as e:
        die(str(e))
        raise AssertionError


def model_file(url: str, sha256: str, env: str, label: str, timeout: float = 60) -> Path:
    """Modelo ONNX em ~/.cache/takekit/models (ou $env), baixado uma vez de `url` com sha256
    fixo. Levanta OSError/ValueError se não der para baixar ou o checksum não conferir."""
    if os.environ.get(env):
        return Path(os.environ[env])
    dest = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "takekit" / "models" / Path(url).name
    if dest.is_file() and _sha256(dest) == sha256:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(f".{os.getpid()}.part")
    print(f"baixando {label} → {dest}", flush=True)
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp, tmp.open("wb") as fh:
            shutil.copyfileobj(resp, fh, 1 << 20)
        if _sha256(tmp) != sha256:
            raise ValueError(f"checksum do {label} não confere")
        tmp.replace(dest)   # rename atômico: jobs paralelos não leem arquivo pela metade
    finally:
        tmp.unlink(missing_ok=True)
    return dest


def file_key(path: Path) -> dict:
    """Identidade barata de um arquivo grande (tamanho + mtime) para caches."""
    st = path.stat()
    return {"size": st.st_size, "mtime": round(st.st_mtime, 3)}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
