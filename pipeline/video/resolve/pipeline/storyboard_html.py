#!/usr/bin/env python3
"""Gera storyboard.html a partir de edit/plan.json.

    python3 video/resolve/pipeline/storyboard_html.py --project video/projects/<slug>

O agente preenche o `storyboard` do plano (palco, caption, objeto). Este script
só renderiza a vista. Não é entregável nem gate de aprovação.
"""
from __future__ import annotations

import argparse, html, json, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]

CSS = """
  :root {
    --bg: #1a1c22;
    --ink: #eeeae2;
    --dim: #9aa0ab;
    --line: #333845;
    --a: #7eb0e8;
    --b: #e0b15a;
    --c: #6fc9a0;
    --gold: #f4b400;
  }
  * { box-sizing: border-box }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font: 16px/1.45 system-ui, sans-serif;
  }
  header {
    padding: 24px 20px 8px;
    max-width: 860px;
    margin: 0 auto;
  }
  h1 { font-size: 22px; font-weight: 650; margin: 0 0 6px }
  .meta { color: var(--dim); font-size: 14px }
  .strip {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    max-width: 860px;
    margin: 16px auto 8px;
    padding: 0 20px;
  }
  .chip {
    width: 32px; height: 32px;
    display: grid; place-items: center;
    border-radius: 6px;
    font: 700 13px/1 system-ui;
    color: #111;
    text-decoration: none;
  }
  .chip.A { background: var(--a) }
  .chip.B { background: var(--b) }
  .chip.C { background: var(--c) }
  .legend {
    max-width: 860px;
    margin: 0 auto 20px;
    padding: 0 20px;
    color: var(--dim);
    font-size: 13px;
  }
  .legend b.A { color: var(--a) }
  .legend b.B { color: var(--b) }
  .legend b.C { color: var(--c) }
  ol { list-style: none; margin: 0 auto; padding: 0 20px 48px; max-width: 860px }
  li {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 16px;
    padding: 16px 0;
    border-top: 1px solid var(--line);
    align-items: start;
  }
  .frame {
    width: 72px;
    aspect-ratio: 9/16;
    border-radius: 8px;
    overflow: hidden;
    background: #0e1014;
    position: relative;
    border: 1px solid var(--line);
  }
  .frame .bar {
    position: absolute; top: 0; left: 0; right: 0; height: 6px;
  }
  .frame.A .bar { background: var(--a) }
  .frame.B .bar { background: var(--b) }
  .frame.C .bar { background: var(--c) }
  .frame .host {
    position: absolute; left: 8%; right: 8%;
    background: #3a3f4a;
    border-radius: 6px 6px 4px 4px;
  }
  .frame.A .host { top: 18%; bottom: 8% }
  .frame.B .host { top: 52%; bottom: 4%; border-radius: 10px 10px 4px 4px }
  .frame.C .host { display: none }
  .frame .canvas {
    position: absolute; left: 10%; right: 10%;
    background: #ece8df;
    border-radius: 3px;
  }
  .frame.A .canvas { display: none }
  .frame.B .canvas { top: 12%; height: 32% }
  .frame.C .canvas { top: 10%; bottom: 10% }
  .copy h2 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 650;
  }
  .copy h2 span {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
    color: #111;
    margin-right: 6px;
    vertical-align: middle;
  }
  .copy h2 span.A { background: var(--a) }
  .copy h2 span.B { background: var(--b) }
  .copy h2 span.C { background: var(--c) }
  .fala { margin: 0 0 6px; font-size: 18px }
  .vis, .why { margin: 0; color: var(--dim); font-size: 14px }
  .why { margin-top: 4px }
  .cap {
    display: inline-block;
    margin-top: 6px;
    font-size: 12px;
    color: var(--dim);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 1px 6px;
  }
  .cap.hold { color: var(--gold); border-color: #5a4a18 }
"""


def esc(s: object) -> str:
    return html.escape(str(s or ""), quote=True)


def palco_of(b: dict) -> str:
    p = str(b.get("palco") or "A").upper()
    return p if p in ("A", "B", "C") else "A"


def item_html(b: dict) -> str:
    pid = esc(b.get("id") or "")
    palco = palco_of(b)
    funcao = esc(b.get("funcao") or "")
    fala = esc(b.get("fala") or "")
    vis = esc(b.get("visual_previsto") or "")
    why = esc(b.get("motivo") or "")
    cap = b.get("caption") or "seguir"
    marca = b.get("marca") or ""
    cap_txt = cap
    if marca:
        cap_txt = f"{cap} · {marca}"
    hold = " hold" if cap == "segurar" else ""
    why_html = f'<p class="why">{why}</p>' if why else ""
    vis_html = f'<p class="vis">{vis}</p>' if vis else ""
    return f"""  <li id="{pid}">
    <div class="frame {palco}"><i class="bar"></i><i class="canvas"></i><i class="host"></i></div>
    <div class="copy">
      <h2><span class="{palco}">{palco}</span> {pid} · {funcao}</h2>
      <p class="fala">{fala}</p>
      {vis_html}
      {why_html}
      <span class="cap{hold}">{esc(cap_txt)}</span>
    </div>
  </li>"""


def render(plan: dict) -> str:
    slug = esc(plan.get("project") or "")
    sb = plan.get("storyboard") or []
    n = len(sb)
    chips = "\n".join(
        f'  <a class="chip {palco_of(b)}" href="#{esc(b.get("id") or "")}">{palco_of(b)}</a>'
        for b in sb
    )
    items = "\n".join(item_html(b) for b in sb)
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{slug} — storyboard</title>
<style>{CSS}
</style>
</head>
<body>
<header>
  <h1>{slug} · storyboard</h1>
  <p class="meta">palco-abc · {n} cláusulas · corte seco · caption 1–3 palavras</p>
</header>

<div class="strip" aria-label="Sequência de palcos">
{chips}
</div>
<p class="legend"><b class="A">A</b> host fechado · <b class="B">B</b> canvas + host embaixo · <b class="C">C</b> full gráfico</p>

<ol>
{items}
</ol>
</body>
</html>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    pdir = Path(a.project)
    if not pdir.is_absolute():
        pdir = REPO / pdir
    plan_p = pdir / "edit" / "plan.json"
    if not plan_p.is_file():
        sys.exit(f"falta {plan_p}")
    plan = json.loads(plan_p.read_text())
    if not plan.get("storyboard"):
        sys.exit("plan.json sem storyboard")
    out = Path(a.out) if a.out else pdir / "storyboard.html"
    out.write_text(render(plan), encoding="utf-8")
    print("escrito", out)


if __name__ == "__main__":
    main()
