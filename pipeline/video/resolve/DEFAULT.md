# Default de edição — 09-jev

Tratamento travado em 19/09/2026. **Não redescobrir estilo.** Exceção só com
pedido explícito do usuário. YAP e outros formatos continuam em FORMATOS.md.

**Sem DaVinci Resolve** desde 23/09/2026: a cadeia roda headless (FFmpeg + RVM), sem GUI e
com vários vídeos em paralelo. Comandos e validação: [../headless/README.md](../headless/README.md).

Referência entregue: `projects/09-jev/exports/09-jev-v3.mp4`.

## O que está fechado

| camada | default | script / arquivo |
|---|---|---|
| Formato | `explicacao-ilustrada` / palco A/B/C | FORMATOS.md |
| Palco B | host no card embaixo, cabeça vaza | `../headless/palco_b.py` (RVM) + `engine/palco_b_composite.py` |
| Caption | Hetrixo + Alvito, 1–3 palavras, hold só no CTA | `engine/captions_palco.py` + `styles/palco-*.json` |
| Caption ênfase/CTA | duas linhas, overlap por glyph | `styles/caption-style-config.json` |
| Canvas B/C | Remotion, sempre em motion | [motion/README.md](motion/README.md) |
| Safe zone B | gráfico y 180–620; caption 640–800 | `<StageB>` |
| Safe zone C | gráfico y 200–1400; caption 1500–1750 | `<StageC>` |
| SFX | kind → catálogo, tempo local do beat | `pipeline/map_sfx_cues.py` |
| Transição | corte seco + filmburn (gancho sempre; troca marcada `"transicao": "filmburn"` no beat) | `fx/filmburn-hook` via `../headless/compose.py` |
| Cama | trap-hype −25 dB, ducked | `assets/music/arpmedia-trap-trap-hype-569432.mp3` |
| Export | 1080×1920@30, H.264 8–12 Mbps, −14 LUFS | `../headless/compose.py` · WORKFLOW.md §5 |

O que **não** está fechado: o objeto de cada beat B/C. Isso é skill de motion
no contexto da cláusula. Palco e faixa, sim.

## Pipeline (não reabrir as decisões)

1. **Fala** — Whisper → unidades → `tighten_cuts.py` → `video/headless/trim.py` (FFmpeg,
   frame exato) → `edit/aroll.mov`. Contrato §3.
2. **Storyboard** — no `plan.json`: palco A/B/C, caption seguir/segurar, objeto
   da cláusula. Vista HTML (opcional, sem gate):
   `pipeline/storyboard_html.py --project video/projects/<slug>`. Não escrever
   o HTML na mão.
3. **Palco B** — `video/headless/palco_b.py`: RVM recorta a pessoa, `palco_b_composite.py`
   monta o card → `edit/overlay/hostB_*.mov`.
4. **Captions** — `caption_jobs.py` rascunha blocos; ênfase/hold o agente marca;
   `captions_palco.py --style styles/palco-{face,canvas,hold}.json`.
5. **Motion** — `motion/scaffold.py` gera stubs na faixa certa. Skills escrevem
   o beat (`motion-art-direction`, `animation-principles`, `shot-composition`,
   `logo-animation`, `remotion-video`). Logo entra pelo kit de marcas, não
   desenhada. `motion/render.py` audita safe zone e entrega ProRes.
6. **SFX** — cues do motion → `map_sfx_cues.py --prep --voice edit/voice.wav` →
   `sfx_prep.py`. Filmburn: gancho sempre; nas trocas, `"transicao": "filmburn"` no beat
   do storyboard (o burn entra com o som do preset).
7. **Export / revisão** — `video/headless/compose.py` → `exports/<slug>-vN.mp4`; stills com
   `video/headless/frame.py`. Critérios em WORKFLOW.md §5.

Comandos a partir da raiz do pipeline, com `.venv/bin/python` (setup em `video/headless/setup.sh`).
N vídeos ao mesmo tempo: `video/headless/batch.py --jobs N <projetos…>`.
