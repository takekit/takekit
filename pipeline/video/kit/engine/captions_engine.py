#!/usr/bin/env python3
"""Base das captions: dados do job (palavras com frame) e agrupamento automático em blocos
com palavra-herói. Usada por captions_palco.py e caption_preview.py, que renderizam.

Job: {"fps":30,"size":[1080,1920],"total_frames":N,"words":[{"text","start_f","end_f"},...]}
(gerado por pipeline/caption_jobs.py) ou `blocks_override` com blocos prontos
({chunks:[[texto,'s'|'b']...], start_f, end_f, y_mode, fx?}).
"""
import json, os, re, unicodedata

W, H, FPS = 1080, 1920, 30
SCALE = 1.0   # W/1080 — escala tamanhos do style p/ outras resoluções
STYLE = {}    # style do renderer (auto_blocks lê `auto` e `_passage`)

# ---------------- utilidades ----------------
def ease_back(t, s=1.70158): t -= 1; return t * t * ((s + 1) * t + s) + 1
def norm(s):
    s = unicodedata.normalize("NFD", s.lower()); s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s)
def wordset(s): return {norm(w) for w in s.split()}

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
    def __init__(self, job):
        global W, H, FPS, SCALE
        j = json.load(open(job)); FPS = int(round(j.get("fps", 30))); W, H = j.get("size", [1080, 1920]); SCALE = W / 1080
        self.total = j["total_frames"]
        if j.get("blocks_override") and os.path.exists(j["blocks_override"]):
            self.plan = {"blocks": json.load(open(j["blocks_override"])), "ranges": []}
        else:
            self.plan = {"blocks": auto_blocks(j["words"]), "ranges": []}
            json.dump(self.plan["blocks"], open(os.path.join(os.path.dirname(job), "blocks_auto.json"), "w"), ensure_ascii=False, indent=1)
    def word_starts(self, block):
        return block.get("words_f")
