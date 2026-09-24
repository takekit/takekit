#!/usr/bin/env python3
"""Registro de presets — única fonte de verdade do que existe e do que foi aprovado.

  presets.py list [kind]          catálogo (id, status, resumo)
  presets.py add <id> --kind K --file F [--status draft|approved] [--summary S] [--video V] [--engine E]
  presets.py approve <id> --video <slug>    marca aprovado num vídeo (acumula)
  presets.py table                regenera presets/GALLERY.md a partir do registro
"""
import argparse, datetime, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); REG = os.path.join(HERE, "presets", "registry.json")
GAL = os.path.join(HERE, "presets", "GALLERY.md")
KINDS = ["caption", "hook", "camera", "ui", "sfx", "macro", "setup", "other"]

def load(): return json.load(open(REG))
def save(d): json.dump(d, open(REG, "w"), ensure_ascii=False, indent=2)

def cmd_list(a):
    d = load(); rows = [p for p in d["presets"] if not a.kind or p["kind"] == a.kind]
    for p in sorted(rows, key=lambda p: (p["kind"], p["id"])):
        ok = "✅" if p["status"] == "approved" else "🧪"
        print(f"{ok} {p['id']:<28} {p.get('file',''):<34} {p.get('summary','')}")
        if p.get("approved_in"): print(f"   aprovado em: {', '.join(p['approved_in'])}")
    print(f"\n{len(rows)} preset(s)")

def cmd_add(a):
    d = load()
    if any(p["id"] == a.id for p in d["presets"]): sys.exit(f"já existe: {a.id} (use approve)")
    if a.kind not in KINDS: sys.exit(f"kind inválido; use {KINDS}")
    if not os.path.exists(os.path.join(HERE, a.file)): print(f"aviso: {a.file} não existe ainda")
    d["presets"].append({"id": a.id, "kind": a.kind, "file": a.file, "engine": a.engine, "status": a.status,
                         "created": str(datetime.date.today()), "approved_in": [a.video] if a.video else [], "summary": a.summary or "", "preview": None, "notes": ""})
    save(d); print("adicionado:", a.id); cmd_table(a)

def cmd_approve(a):
    d = load(); p = next((p for p in d["presets"] if p["id"] == a.id), None)
    if not p: sys.exit(f"não existe: {a.id}")
    p["status"] = "approved"
    if a.video and a.video not in p["approved_in"]: p["approved_in"].append(a.video)
    save(d); print("aprovado:", a.id, "em", a.video); cmd_table(a)

def cmd_table(a=None):
    d = load(); lines = ["| preset | tipo | arquivo | status | aprovado em |", "|---|---|---|---|---|"]
    for p in sorted(d["presets"], key=lambda p: (p["kind"], p["id"])):
        st = {"approved": "✅ aprovado", "deprecated": "⛔ descontinuado"}.get(p["status"], "🧪 draft")
        lines.append(f"| `{p['id']}` | {p['kind']} | `{p.get('file','')}` | {st} | {', '.join(p.get('approved_in') or []) or '—'} |")
    table = "\n".join(lines)
    s = open(GAL).read()
    new = re.sub(r"(<!-- presets:start -->).*?(<!-- presets:end -->)", lambda m: m.group(1) + "\n" + table + "\n" + m.group(2), s, flags=re.S)
    if new == s:
        print("presets/GALLERY.md já está atualizada (ou faltam os marcadores <!-- presets:start/end -->)")
        return
    open(GAL, "w").write(new); print("presets/GALLERY.md: tabela atualizada")

ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
s = sub.add_parser("list"); s.add_argument("kind", nargs="?")
s = sub.add_parser("add"); s.add_argument("id"); s.add_argument("--kind", required=True); s.add_argument("--file", required=True)
s.add_argument("--status", default="draft"); s.add_argument("--summary"); s.add_argument("--video"); s.add_argument("--engine")
s = sub.add_parser("approve"); s.add_argument("id"); s.add_argument("--video", required=True)
sub.add_parser("table")
a = ap.parse_args(); {"list": cmd_list, "add": cmd_add, "approve": cmd_approve, "table": cmd_table}[a.cmd](a)
