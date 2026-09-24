# Talking Head + Motions

Estilo travado em 19/09/2026, aprovado no vídeo 09-jev (export `09-jev-v3`; recorte em
`preview.mp4` deste pacote). **Não redescobrir estilo.** Exceção só com pedido explícito do
usuário. YAP e outros formatos continuam em `video/kit/FORMATOS.md`.

Caminhos relativos à raiz do pipeline (cwd do agente). Assets relativos a `video/kit/`
(ou `TAKEKIT_ASSETS`). Os números de cada camada estão nos JSON deste pacote.

Tudo headless (FFmpeg + RVM), com vários vídeos em paralelo. Comandos e
validação: `video/headless/README.md`.

## O que está fechado

| camada | default | script / arquivo |
|---|---|---|
| Formato | `explicacao-ilustrada` / palco A/B/C | `video/kit/FORMATOS.md` · `stage-scheme.json` |
| Câmera (palco A) | estável; punch só na ênfase, centrado no rosto (face tracking) | beat `"camera": "punch"` no storyboard → `video/headless/compose.py` (preset `camera`) |
| Palco B | host no card embaixo, cabeça vaza | `video/headless/palco_b.py` (RVM) + `video/kit/engine/palco_b_composite.py` |
| Caption | Hetrixo + Alvito, 1–3 palavras, hold só no CTA | `video/kit/engine/captions_palco.py` + `video/kit/styles/palco-*.json` · `caption.json` |
| Caption ênfase/CTA | duas linhas, overlap por glyph | `video/kit/styles/caption-style-config.json` |
| Canvas B/C | Remotion, sempre em motion | `video/kit/motion/README.md` |
| Safe zone B | gráfico y 180–620; caption 640–800 | `<StageB>` |
| Safe zone C | gráfico y 200–1400; caption 1500–1750 | `<StageC>` |
| SFX | kind → catálogo, tempo local do beat | `video/kit/pipeline/map_sfx_cues.py` · `sound-effects.json` |
| Transição | corte seco + filmburn (gancho sempre; troca marcada `"transicao": "filmburn"` no beat) | `video/kit/presets/filmburn-hook.json` via `video/headless/compose.py` · `transitions.json` |
| Cama | trap-hype −25 dB, ducked | `assets/music/arpmedia-trap-trap-hype-569432.mp3` |
| Preview | 720p, H.264 veryfast 1,5 Mbps (rápido, durante a edição) | `video/headless/compose.py` (default) → `edit/preview.mp4` · `quality.json` |
| Export final | 1080×1920@30, H.264 8–12 Mbps, −14 LUFS; só pelo botão Exportar do creator | `compose.py --quality final --from-preview` · `quality.json` · `video/kit/WORKFLOW.md` §5 |

O que **não** está fechado: o objeto de cada beat B/C. Isso é skill de motion no contexto da
cláusula. Palco e faixa, sim.

Os números de legenda, palcos, câmera, cortes, SFX e transições são **presets** (`modules.json` deste
pacote, biblioteca em `styles/_presets/`). A thread pode trocar um preset sem mexer no pacote; o
que vale para o vídeo chega em `edit/style.resolved.json` e os scripts aplicam sozinhos. Quando
a thread trocar um preset, vale o preset, não a tabela acima.

## Skills de motion por etapa

Estão em `.agents/skills/` (packs iart-ai/motion-design-skills e kinetic-typography-skills). Abra a
skill da etapa antes de executá-la. Elas dizem **como** fazer; não reabrem o que este estilo trava
(palco, faixa, paleta, fontes, regras de caption, SFX kind, filmburn).

| etapa | skill | para quê |
|---|---|---|
| Storyboard | `beat-sync-editing` | ritmo das trocas de palco e de onde entra cada beat B/C |
| Storyboard / Motion | `motion-art-direction` | direção do objeto de cada beat |
| Motion | `shot-composition` | composição dentro da safe zone do palco |
| Motion | `animation-principles` | timing, easing, antecipação, follow-through |
| Motion | `kinetic-typography` | todo texto animado no canvas (título, número, palavra-chave, eyebrow) e a entrada do hold do CTA |
| Motion | `color-motion` | transição e interpolação de cor, sempre dentro da paleta |
| Motion | `motion-background` | só se o beat pedir fundo vivo: sutil, sobre o creme, nunca disputando com o objeto |
| Motion | `logo-animation` | logos do kit de marcas |
| Motion | `remotion-video` | escrever e renderizar o beat em Remotion |
| SFX | `beat-sync-editing` | hits de motion, SFX e filmburn na batida da cama, sem mover os cortes da fala |
| Preview / revisão | `color-motion` | conferir cor do render (creme `#F4EFE6` igual no mp4; Rec.709 vs sRGB) |

## Pipeline (não reabrir as decisões)

1. **Fala**: Whisper → unidades → `video/kit/pipeline/tighten_cuts.py` →
   `video/headless/trim.py` (FFmpeg, frame exato) → `edit/aroll.mov`. Regras em `cuts.json`.
2. **Storyboard**: no `plan.json`: palco A/B/C, caption seguir/segurar, objeto da cláusula. Ritmo das
   trocas com `beat-sync-editing`. Vista HTML (opcional, sem gate): `video/kit/pipeline/storyboard_html.py
   --project video/projects/<slug>`. Não escrever o HTML na mão. Descrição do estilo em `storyboard.md`.
3. **Palco B**: `video/headless/palco_b.py`: RVM recorta a pessoa, `palco_b_composite.py` monta
   o card → `edit/overlay/hostB_*.mov`.
4. **Captions**: `video/kit/pipeline/caption_jobs.py` rascunha blocos; ênfase/hold o agente
   marca; `video/kit/engine/captions_palco.py --style video/kit/styles/palco-{face,canvas,hold}.json`.
5. **Motion**: `video/kit/motion/scaffold.py` gera stubs na faixa certa. Skills escrevem o
   beat (tabela acima: `motion-art-direction`, `shot-composition`, `animation-principles`,
   `kinetic-typography` em todo texto animado, `color-motion`, `motion-background` se pedir,
   `logo-animation`, `remotion-video`). Logo entra pelo kit de marcas, não desenhada.
   `video/kit/motion/render.py` audita safe zone e entrega ProRes.
6. **SFX**: cues do motion → `map_sfx_cues.py --prep --voice edit/voice.wav` → `sfx_prep.py`.
   Filmburn: gancho sempre; nas trocas, `"transicao": "filmburn"` no beat do storyboard (o burn
   entra com o som do preset). Hits na batida da cama com `beat-sync-editing`.
7. **Preview / revisão**: `video/headless/compose.py` (qualidade de preview) → `edit/preview.mp4`;
   stills com `video/headless/frame.py`. Critérios em `video/kit/WORKFLOW.md` §5; cor do render
   com `color-motion`. O export final (`exports/<slug>-vN.mp4`, qualidade cheia) não é do agente:
   o creator dispara pelo botão Exportar, com o mesmo spec do último preview.

Comandos a partir da raiz do pipeline, com `.venv/bin/python` (setup em `video/headless/setup.sh`).
N vídeos ao mesmo tempo: `video/headless/batch.py --jobs N <projetos…>`.
