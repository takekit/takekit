# Galeria de presets

Visão do catálogo para escolher recursos na edição. **Gerada** por `python3 video/kit/presets.py table`
a partir de `registry.json` — não editar a tabela à mão. Fonte de verdade do que existe, do status e
do escopo de aprovação é o registro: `python3 video/kit/presets.py list [kind]`.

"aprovado" significa aprovado **no vídeo listado**, não uso universal — exceto o pacote
do 09-jev (`caption/palco-*`, `layout/host-bottom-split`, `motion/canvas-kit`,
`sfx/palco-cues`, `kit/brands`), que é o **default** da explicação ilustrada
([Talking Head + Motions](../../../../styles/talking-head-motions/prompt.md)). "draft" permite experimentar no escopo pedido sem inventar
aprovação. Regras de promoção: [WORKFLOW.md](../WORKFLOW.md), §6.

<!-- presets:start -->
| preset | tipo | arquivo | status | aprovado em |
|---|---|---|---|---|
| `caption/palco-canvas` | caption | `styles/palco-canvas.json` | ✅ aprovado | 09-jev |
| `caption/palco-face` | caption | `styles/palco-face.json` | ✅ aprovado | 09-jev |
| `caption/palco-hold` | caption | `styles/palco-hold.json` | ✅ aprovado | 09-jev |
| `fx/filmburn-hook` | hook | `presets/filmburn-hook.json` | ✅ aprovado | 02-muse-v2 |
| `motion/canvas-kit` | macro | `motion/README.md` | ✅ aprovado | 09-jev |
| `kit/brands` | other | `assets/brands/catalog.json` | ✅ aprovado | 09-jev |
| `library/brainstorm-reels` | other | `assets/packs/brainstorm-academy/README.md` | 🧪 draft | — |
| `sfx/filmburn` | sfx | `assets/sfx/filmburn_yt_l2pxVBGIxSs.wav` | ⛔ descontinuado | 02-muse-v2 |
| `sfx/library-peu` | sfx | `assets/sfx/catalog.json` | ✅ aprovado | 02-muse-v2 |
| `sfx/palco-cues` | sfx | `pipeline/map_sfx_cues.py` | ✅ aprovado | 09-jev |
| `layout/host-bottom-split` | ui | `presets/host-bottom-split.json` | ✅ aprovado | 09-jev |
<!-- presets:end -->
