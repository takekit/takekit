# Default de edição — 09-jev

Tratamento travado em 19/09/2026. **Não redescobrir estilo.** Exceção só com
pedido explícito do usuário. YAP e outros formatos continuam em FORMATOS.md.

Referência entregue: `projects/09-jev/exports/09-jev-v3.mp4`.

## O que está fechado

| camada | default | script / arquivo |
|---|---|---|
| Formato | `explicacao-ilustrada` / palco A/B/C | FORMATOS.md |
| Palco B | host no card embaixo, cabeça vaza | `engine/palco_b_composite.py` |
| Caption | Hetrixo + Alvito, 1–3 palavras, hold só no CTA | `engine/captions_palco.py` + `styles/palco-*.json` |
| Caption ênfase/CTA | duas linhas, overlap por glyph | `styles/caption-style-config.json` |
| Canvas B/C | Remotion, sempre em motion | [motion/README.md](motion/README.md) |
| Safe zone B | gráfico y 180–620; caption 640–800 | `<StageB>` |
| Safe zone C | gráfico y 200–1400; caption 1500–1750 | `<StageC>` |
| SFX | kind → catálogo, tempo local do beat | `pipeline/map_sfx_cues.py` |
| Transição | corte seco + filmburn na troca de palco | `fx/filmburn-hook` |
| Cama | trap-hype −25 dB, ducked | `assets/music/arpmedia-trap-trap-hype-569432.mp3` |
| Export | 1080×1920@30, H.264 8–12 Mbps, −14 LUFS | WORKFLOW.md §5 |

O que **não** está fechado: o objeto de cada beat B/C. Isso é skill de motion
no contexto da cláusula. Palco e faixa, sim.

## Pipeline (não reabrir as decisões)

1. **Fala** — Whisper → unidades → `tighten_cuts.py` → timeline. Contrato §3.
2. **Storyboard** — no `plan.json`: palco A/B/C, caption seguir/segurar, objeto
   da cláusula. Vista HTML (opcional, sem gate):
   `pipeline/storyboard_html.py --project video/projects/<slug>`. Não escrever
   o HTML na mão.
3. **Palco B** — DepthMap + `palco_b_composite.py` → `hostB_*.mov`.
4. **Captions** — `caption_jobs.py` rascunha blocos; ênfase/hold o agente marca;
   `captions_palco.py --style styles/palco-{face,canvas,hold}.json`.
5. **Motion** — `motion/scaffold.py` gera stubs na faixa certa. Skills escrevem
   o beat (`motion-art-direction`, `animation-principles`, `shot-composition`,
   `logo-animation`, `remotion-video`). Logo entra pelo kit de marcas, não
   desenhada. `motion/render.py` audita safe zone e entrega ProRes.
6. **SFX** — cues do motion → `map_sfx_cues.py` → `sfx_prep.py`. Filmburn na
   troca de palco (o overlay já traz som).
7. **Revisão / export** — WORKFLOW.md §5.

Comandos na pasta do vídeo, a partir da raiz do repo.
