#!/usr/bin/env python3
"""N vídeos em paralelo: trim → palco B → compose por projeto.

Cada projeto é um processo independente que só escreve no próprio edit/ e
exports/; o batch divide os núcleos (TAKEKIT_JOB_THREADS) para N jobs não brigarem.

    python3 video/headless/batch.py --jobs 3 video/projects/a video/projects/b video/projects/c
        [--steps trim,palco_b,compose] [--compose-args "--quality final"]

O compose sai em preview (edit/preview.mp4, 720p) por default; o export final
(exports/<slug>-vN.mp4) é `--compose-args "--quality final"` (ou `"--quality final --from-preview"`
para refazer em qualidade cheia exatamente o último preview de cada projeto).

Log de cada projeto: <projeto>/edit/.work/batch.log. Sai com código 1 se algum falhar.
"""
from __future__ import annotations

import argparse, os, re, shlex, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from common import HERE, die, project_dir, rel, work

STEPS = {"trim": "trim.py", "palco_b": "palco_b.py", "compose": "compose.py"}


def run_project(pdir: Path, steps: list[str], extra: dict[str, list[str]], env: dict) -> dict:
    log = work(pdir, "") / "batch.log"
    result = {"project": pdir.name, "ok": True, "times": {}, "export": None, "error": ""}
    with log.open("w", encoding="utf-8") as fh:
        for step in steps:
            t0 = time.time()
            cmd = [sys.executable, str(HERE / STEPS[step]), "--project", str(pdir), *extra.get(step, [])]
            fh.write(f"$ {shlex.join(cmd)}\n")
            fh.flush()
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
            fh.write(proc.stdout)
            result["times"][step] = time.time() - t0
            if proc.returncode != 0:
                result["ok"] = False
                result["error"] = f"{step}: " + (proc.stdout.strip().splitlines() or ["falhou"])[-1]
                break
            if step == "compose":
                m = re.findall(r"^TAKEKIT_(?:PREVIEW|EXPORT)=(.+)$", proc.stdout, re.M)
                if m:
                    result["export"] = rel(Path(m[-1].strip()), pdir)
                elif m := re.search(r"escrito (\S+\.(?:mp4|mov))", proc.stdout):
                    result["export"] = m.group(1)
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("projects", nargs="+")
    ap.add_argument("--jobs", type=int, default=int(os.environ.get("TAKEKIT_MAX_JOBS", "2") or 2))
    ap.add_argument("--steps", default="trim,palco_b,compose")
    for s in STEPS:
        ap.add_argument(f"--{s.replace('_', '-')}-args", default="", help=f"args extras do {STEPS[s]}")
    a = ap.parse_args()

    steps = [s.strip() for s in a.steps.split(",") if s.strip()]
    if bad := [s for s in steps if s not in STEPS]:
        die(f"etapas desconhecidas: {', '.join(bad)} (use {', '.join(STEPS)})")
    projects = [project_dir(p) for p in a.projects]
    if len({p for p in projects}) != len(projects):
        die("projeto repetido: dois jobs no mesmo edit/ se atropelam")
    jobs = max(1, min(a.jobs, len(projects)))
    env = dict(os.environ, TAKEKIT_MAX_JOBS=str(jobs),
               TAKEKIT_JOB_THREADS=os.environ.get("TAKEKIT_JOB_THREADS") or str(max(2, (os.cpu_count() or 4) // jobs)))
    extra = {s: shlex.split(getattr(a, f"{s}_args")) for s in STEPS}
    print(f"{len(projects)} projetos · {jobs} em paralelo · {env['TAKEKIT_JOB_THREADS']} threads cada · etapas {'→'.join(steps)}",
          flush=True)

    t0, results = time.time(), []
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = {pool.submit(run_project, p, steps, extra, env): p for p in projects}
        for fut in as_completed(futures):
            r = fut.result()
            results.append(r)
            times = " ".join(f"{k} {v:.0f}s" for k, v in r["times"].items())
            status = f"ok → {r['export']}" if r["ok"] else f"FALHOU {r['error']}"
            print(f"  {r['project']:24} {times:34} {status}", flush=True)
    failed = [r for r in results if not r["ok"]]
    print(f"total {time.time() - t0:.0f}s · {len(results) - len(failed)} ok · {len(failed)} falharam")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
