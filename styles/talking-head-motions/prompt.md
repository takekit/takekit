# Talking Head + Motions

Estilo travado em 19/09/2026, aprovado no vídeo 09-jev (export `09-jev-v3`; recorte em
`preview.mp4` deste pacote). **Não redescobrir estilo.** Exceção só com pedido explícito do
usuário. YAP e outros formatos continuam em `video/resolve/FORMATOS.md`.

Caminhos relativos à raiz do pipeline (cwd do agente). Assets relativos a `video/resolve/`
(ou `TAKEKIT_ASSETS`). Os números de cada camada estão nos JSON deste pacote.

Tudo headless (FFmpeg + RVM), sem DaVinci Resolve, com vários vídeos em paralelo. Comandos e
validação: `video/headless/README.md`.

## O que está fechado

| camada | default | script / arquivo |
|---|---|---|
| Formato | `explicacao-ilustrada` / palco A/B/C | `video/resolve/FORMATOS.md` · `stage-scheme.json` |
| Palco B | host no card embaixo, cabeça vaza | `video/headless/palco_b.py` (RVM) + `video/resolve/engine/palco_b_composite.py` |
| Caption | Hetrixo + Alvito, 1–3 palavras, hold só no CTA | `video/resolve/engine/captions_palco.py` + `video/resolve/styles/palco-*.json` · `caption.json` |
| Caption ênfase/CTA | duas linhas, overlap por glyph | `video/resolve/styles/caption-style-config.json` |
| Canvas B/C | Remotion, sempre em motion | `video/resolve/motion/README.md` |
| Safe zone B | gráfico y 180–620; caption 640–800 | `<StageB>` |
| Safe zone C | gráfico y 200–1400; caption 1500–1750 | `<StageC>` |
| SFX | kind → catálogo, tempo local do beat | `video/resolve/pipeline/map_sfx_cues.py` · `sound-effects.json` |
| Transição | corte seco + filmburn (gancho sempre; troca marcada `"transicao": "filmburn"` no beat) | `video/resolve/presets/filmburn-hook.json` via `video/headless/compose.py` · `transitions.json` |
| Cama | trap-hype −25 dB, ducked | `assets/music/arpmedia-trap-trap-hype-569432.mp3` |
| Export | 1080×1920@30, H.264 8–12 Mbps, −14 LUFS | `video/headless/compose.py` · `video/resolve/WORKFLOW.md` §5 |

O que **não** está fechado: o objeto de cada beat B/C. Isso é skill de motion no contexto da
cláusula. Palco e faixa, sim.

## Pipeline (não reabrir as decisões)

1. **Fala**: Whisper → unidades → `video/resolve/pipeline/tighten_cuts.py` →
   `video/headless/trim.py` (FFmpeg, frame exato) → `edit/aroll.mov`. Regras em `cuts.json`.
2. **Storyboard**: no `plan.json`: palco A/B/C, caption seguir/segurar, objeto da cláusula.
   Vista HTML (opcional, sem gate): `video/resolve/pipeline/storyboard_html.py --project
   video/projects/<slug>`. Não escrever o HTML na mão. Descrição do estilo em `storyboard.md`.
3. **Palco B**: `video/headless/palco_b.py`: RVM recorta a pessoa, `palco_b_composite.py` monta
   o card → `edit/overlay/hostB_*.mov`.
4. **Captions**: `video/resolve/pipeline/caption_jobs.py` rascunha blocos; ênfase/hold o agente
   marca; `video/resolve/engine/captions_palco.py --style video/resolve/styles/palco-{face,canvas,hold}.json`.
5. **Motion**: `video/resolve/motion/scaffold.py` gera stubs na faixa certa. Skills escrevem o
   beat (`motion-art-direction`, `animation-principles`, `shot-composition`, `logo-animation`,
   `remotion-video`). Logo entra pelo kit de marcas, não desenhada. `video/resolve/motion/render.py`
   audita safe zone e entrega ProRes.
6. **SFX**: cues do motion → `map_sfx_cues.py --prep --voice edit/voice.wav` → `sfx_prep.py`.
   Filmburn: gancho sempre; nas trocas, `"transicao": "filmburn"` no beat do storyboard (o burn
   entra com o som do preset).
7. **Export / revisão**: `video/headless/compose.py` → `exports/<slug>-vN.mp4`; stills com
   `video/headless/frame.py`. Critérios em `video/resolve/WORKFLOW.md` §5.

Comandos a partir da raiz do pipeline, com `.venv/bin/python` (setup em `video/headless/setup.sh`).
N vídeos ao mesmo tempo: `video/headless/batch.py --jobs N <projetos…>`.
