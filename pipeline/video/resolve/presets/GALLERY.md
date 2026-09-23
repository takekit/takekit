# Galeria de presets

Visão do catálogo para escolher recursos na edição. **Gerada** por `python3 video/resolve/presets.py table`
a partir de `registry.json` — não editar a tabela à mão. Fonte de verdade do que existe, do status e
do escopo de aprovação é o registro: `python3 video/resolve/presets.py list [kind]`.

"aprovado" significa aprovado **no vídeo listado**, não uso universal — exceto o pacote
do 09-jev (`caption/palco-*`, `layout/host-bottom-split`, `motion/canvas-kit`,
`sfx/palco-cues`, `kit/brands`), que é o **default** da explicação ilustrada
([Talking Head + Motions](../../../../styles/talking-head-motions/prompt.md)). "draft" permite experimentar no escopo pedido sem inventar
aprovação. Regras de promoção: [WORKFLOW.md](../WORKFLOW.md), §6.

<!-- presets:start -->
| preset | tipo | arquivo | status | aprovado em |
|---|---|---|---|---|
| `camera/intro-zoomout` | camera | `presets/intro-zoomout.json` | ✅ aprovado | 02-muse-v2 |
| `camera/punch` | camera | `presets/punch.json` | ✅ aprovado | 02-muse-v2 |
| `camera/shake` | camera | `presets/shake.json` | ✅ aprovado | 02-muse-v2 |
| `motion/smooth-camera` | camera | `presets/motion-smooth.json` | 🧪 draft | — |
| `caption/hero-lockin` | caption | `styles/hero-lockin.json` | ✅ aprovado | 01-muse-split (teste v6) |
| `caption/palco-canvas` | caption | `styles/palco-canvas.json` | ✅ aprovado | 09-jev |
| `caption/palco-face` | caption | `styles/palco-face.json` | ✅ aprovado | 09-jev |
| `caption/palco-hold` | caption | `styles/palco-hold.json` | ✅ aprovado | 09-jev |
| `caption/trendy-stack` | caption | `styles/trendy-stack.json` | 🧪 draft | — |
| `caption/trendy-stack-chroma` | caption | `styles/trendy-stack-chroma.json` | ✅ aprovado | 03-claude-limite (preview 14/09) |
| `fx/filmburn-hook` | hook | `presets/filmburn-hook.json` | ✅ aprovado | 02-muse-v2 |
| `motion/broll-parallax` | macro | `presets/broll-parallax.json` | ✅ aprovado | preview parallax-kit-v1 (16/09) |
| `motion/canvas-kit` | macro | `motion/README.md` | ✅ aprovado | 09-jev |
| `kit/brands` | other | `assets/brands/catalog.json` | ✅ aprovado | 09-jev |
| `library/brainstorm-reels` | other | `assets/packs/brainstorm-academy/README.md` | 🧪 draft | — |
| `audio/voice-master` | sfx | `presets/ui-overlays.json` | ✅ aprovado | 02-muse-v2 |
| `music/ducked-bed` | sfx | `presets/ui-overlays.json` | ✅ aprovado | 02-muse-v2 |
| `sfx/filmburn` | sfx | `assets/sfx/filmburn_yt_l2pxVBGIxSs.wav` | ⛔ descontinuado | 02-muse-v2 |
| `sfx/library-peu` | sfx | `assets/sfx/catalog.json` | ✅ aprovado | 02-muse-v2 |
| `sfx/map-v1` | sfx | `presets/ui-overlays.json` | ✅ aprovado | 02-muse-v2 |
| `sfx/palco-cues` | sfx | `pipeline/map_sfx_cues.py` | ✅ aprovado | 09-jev |
| `layout/host-bottom-split` | ui | `presets/host-bottom-split.json` | ✅ aprovado | 09-jev |
| `layout/split-top-bottom` | ui | `presets/split-top-bottom.json` | ✅ aprovado | 02-muse-v2 |
| `motion/card-chip` | ui | `presets/motion-smooth.json` | 🧪 draft | — |
| `text/cta-serif` | ui | `presets/ui-overlays.json` | ✅ aprovado | 02-muse-v2 |
| `ui/card-page` | ui | `presets/ui-overlays.json` | ✅ aprovado | 02-muse-v2 |
| `ui/counter` | ui | `presets/ui-overlays.json` | ✅ aprovado | 02-muse-v2 |
| `ui/notification` | ui | `presets/ui-overlays.json` | ✅ aprovado | 02-muse-v2 |
<!-- presets:end -->
