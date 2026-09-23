#!/usr/bin/env python3
"""Prepara SFX com ganho por FÓRMULA, relativo à voz — nada no olho.

  alvo_LUFS(categoria) = voz_LUFS + rel_dB(categoria)          (rel em assets/sfx/catalog.json → "rel_db")
  ganho = alvo_LUFS − LUFS_medido(arquivo)                     (ebur128 integrado; arquivos curtos: usa momentary max)

Uso: sfx_prep.py --voice voice_master.wav --out DIR item[:trim_s[:fade_s]] ...
  item = id do catálogo (ex.: whoosh/whoosh_swoosh_01) ou caminho .wav (categoria inferida da pasta)
Saída: DIR/<nome>_prep.wav (48k estéreo) já no volume certo p/ colocar direto na track SFX (fader 0 dB).
"""
import argparse, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
CAT = json.load(open(os.path.join(ROOT, "assets", "sfx", "catalog.json")))
DEFAULT_REL = CAT.get("rel_db", {})

def lufs(path, short=False):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.findall(r"\n\s+I:\s+(-?[\d.]+) LUFS", r); I = float(m[-1]) if m else None
    # arquivos < 1.5 s: integrado é pouco confiável → usa o maior momentary (M:) do log
    ms = [float(x) for x in re.findall(r"M:\s*(-?[\d.]+)", r) if x != "-inf"]
    return (max(ms) if (short and ms) else I), (max(ms) if ms else None)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--voice", required=True); ap.add_argument("--out", required=True); ap.add_argument("items", nargs="+")
    ap.add_argument("--voice-lufs", type=float); a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    vI = a.voice_lufs or lufs(a.voice)[0]; print(f"voz: {vI:.1f} LUFS")
    items = {i["id"]: i for i in CAT["items"]}
    for spec in a.items:
        parts = spec.split(":"); key = parts[0]; trim = float(parts[1]) if len(parts) > 1 and parts[1] else None; fade = float(parts[2]) if len(parts) > 2 else 0.25
        if key in items: path = os.path.join(ROOT, "assets", items[key]["file"]); cat = items[key]["category"]
        else: path = key; cat = os.path.basename(os.path.dirname(key))
        rel = DEFAULT_REL.get(cat, -18.0); target = vI + rel
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout)
        eff = min(dur, trim) if trim else dur
        tmp = os.path.join(a.out, "_tmp.wav")
        af = [f"atrim=0:{eff}", f"afade=t=out:st={max(0, eff - fade)}:d={fade}"] if trim else []
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", path, "-af", ",".join(af) if af else "anull", "-ar", "48000", "-ac", "2", tmp], check=True)
        measured, mmax = lufs(tmp, short=eff < 1.5)
        gain = target - measured
        name = os.path.splitext(os.path.basename(path))[0] + "_prep.wav"; outp = os.path.join(a.out, name)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", tmp, "-af", f"volume={gain:.2f}dB,alimiter=limit=0.7", "-ar", "48000", "-ac", "2", outp], check=True)
        print(f"{cat:<13} {name:<40} {eff:4.2f}s  medido {measured:6.1f}  alvo {target:6.1f} (rel {rel:+.0f})  ganho {gain:+.1f} dB")
    os.remove(tmp)

if __name__ == "__main__":
    main()
