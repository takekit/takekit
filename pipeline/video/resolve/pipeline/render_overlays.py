#!/usr/bin/env python3
"""render_overlays — gera dependências externas (captions/ingestão/áudio; UI PIL legada) de um vídeo a partir de <projeto>/edit/renders.json.

Cada entrada é um comando de engine com saída; roda em paralelo (N processos) e pula o que já existe
e é mais novo que os inputs (`--force` refaz tudo). Depois disso, `build_timeline.py` monta no Resolve.

renders.json:
{
 "jobs":[
  {"out":"edit/overlay/captions_v4.mov","engine":"captions","args":["--job","edit/job_captions_v4.json","--style","resolve/styles/hero-lockin.json"]},
  {"out":"edit/overlay/ui_counter_v2.mov","engine":"ui","args":["counter","--frames","52","--in","7","--out","40","--start","0","--end","130000","--prefix","US$ ","--count-frames","36","--label","recompensa máxima da Meta"]},
  {"out":"edit/overlay/broll_blindagem.mov","engine":"ffmpeg","args":["-y","-v","error","-i","..."]},
  {"out":"edit/overlay/voice_master.wav","engine":"sh","args":["ffmpeg -y ... | ..."]}
 ]
}
engines: captions (engine/captions_engine.py) · captions_trendy (engine/captions_trendy.py) · ui (engine/ui_overlay.py) · lightleak · sfx_prep · ffmpeg · sh
Tokens em jobs "sh": {out} (saída), {py} (python com Pillow/numpy), {video} (raiz video/), {project} (pasta do projeto).
cwd dos jobs = pasta do projeto; caminhos "resolve/..." só resolvem em args de engines/ffmpeg — em "sh" use {video}/resolve/...
Caminhos relativos: 'resolve/…' → repo video/; resto → pasta do projeto.

Uso: render_overlays.py --project video/projects/<slug> [--only NOME] [--force] [-j 4]
"""
import argparse, json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); VIDEO = os.path.dirname(ROOT)
PY = "/opt/homebrew/bin/python3" if os.path.exists("/opt/homebrew/bin/python3") else sys.executable
ENGINES = {"captions": os.path.join(ROOT, "engine", "captions_engine.py"), "captions_trendy": os.path.join(ROOT, "engine", "captions_trendy.py"),
           "captions_palco": os.path.join(ROOT, "engine", "captions_palco.py"),
           "ui": os.path.join(ROOT, "engine", "ui_overlay.py"),
           "lightleak": os.path.join(ROOT, "engine", "lightleak.py"), "sfx_prep": os.path.join(ROOT, "engine", "sfx_prep.py")}

def resolve_path(pdir, p):
    if os.path.isabs(p): return p
    return os.path.join(VIDEO, p) if p.startswith("resolve/") else os.path.join(pdir, p)

def run(job, pdir, force):
    out = resolve_path(pdir, job["out"]); os.makedirs(os.path.dirname(out), exist_ok=True)
    inputs = [resolve_path(pdir, a) for a in job.get("args", []) if isinstance(a, str) and (a.startswith("edit/") or a.startswith("assets/") or a.startswith("resolve/")) and os.path.exists(resolve_path(pdir, a))]
    if not force and os.path.exists(out) and all(os.path.getmtime(out) >= os.path.getmtime(i) for i in inputs):
        return job["out"], "skip — sync c/ timeline NAO verificada"
    args = [resolve_path(pdir, a) if isinstance(a, str) and (a.startswith("edit/") or a.startswith("assets/") or a.startswith("resolve/")) else a for a in job.get("args", [])]
    eng = job["engine"]; t0 = time.time()
    if eng in ENGINES:
        flag = "--out-file" if eng == "ui" else ("--out" if eng in ("captions", "captions_trendy", "captions_palco", "lightleak") else None)
        cmd = [PY, ENGINES[eng]] + args + ([flag, out] if flag else [])
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=pdir)
    elif eng == "ffmpeg":
        r = subprocess.run(["ffmpeg"] + args + [out], capture_output=True, text=True, cwd=pdir)
    elif eng == "sh":
        cmd = args[0].replace("{out}", out).replace("{py}", PY).replace("{video}", VIDEO).replace("{project}", pdir)
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=pdir)
    else:
        return job["out"], f"engine desconhecida: {eng}"
    ok = r.returncode == 0 and os.path.exists(out)
    return job["out"], (f"ok {time.time() - t0:.0f}s" if ok else f"FALHOU\n{r.stderr[-800:]}")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--project", required=True); ap.add_argument("--only"); ap.add_argument("--force", action="store_true"); ap.add_argument("-j", type=int, default=4)
    a = ap.parse_args(); pdir = os.path.abspath(a.project)
    jobs = json.load(open(os.path.join(pdir, "edit", "renders.json"), encoding="utf-8"))["jobs"]
    if a.only: jobs = [j for j in jobs if a.only in j["out"]]
    for job in jobs:
        if job["engine"] in ("ui", "lightleak"):
            print("LEGADO: UI/lightleak externo; motions novos usam Fusion", file=sys.stderr)
    failed = False
    with ThreadPoolExecutor(max_workers=a.j) as ex:
        for out, status in ex.map(lambda j: run(j, pdir, a.force), jobs):
            print(f"{status:<22} {out}")
            failed |= not (status.startswith("ok ") or status.startswith("skip "))
    if failed: raise SystemExit(1)

if __name__ == "__main__":
    main()
