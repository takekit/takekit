# Baseline do look aprovado — 05-github-gratis_EDIT_v4

Artefato de referência do look **aprovado em 16/09/2026**. Congelado: a timeline `05-github-gratis_EDIT_v4` não é mais editada; o próximo vídeo é que estreia o motor novo. Serve para comparar qualquer mudança do motor de motion contra o que foi aprovado.

- projeto: `05-github-gratis` / timeline: `05-github-gratis_EDIT_v4`
- 1080x1920, 30 fps, frames 108000–109183, start `01:00:00:00`
- `05-v4-curves.json`: `Size` e `Center` (x,y por frame) de cada nó animado, mais nomes de nós, modificadores e intervalo de render do comp
- `05-v4-card.png`: frame 108182 (card `broll2-github-files_card.mov` + grid no mesmo quadro)
- `05-v4-chip.png`: frame 109090 (chip `COMENTA GITHUB` sobre o apresentador)

Gerado por leitura da timeline viva no Resolve + extração de frames do render `video/projects/05-github-gratis/preview/05-github-gratis_EDIT_v4.mp4` (`ffmpeg -ss`), não por render novo.

## Estado medido

15 nós animados, todos com `Size` animado e **`Center` constante** — ou seja, o pan nunca renderizou nesta timeline. O único modificador presente é o de `Size` (`MCP_*MotionSize`, `BezierSpline`); não existe modificador em `Center`, então não há o que animar.

| item | nós | Size | Center |
|---|---|---|---|
| `background-03.mp4` (V2, 7 itens) | `MCP_gridMotion` | 60/60 ou 96/96 valores distintos | 1 valor |
| `*_card.mov` (V3, 7 itens) | `MCP_cardMotion` | 60/60 ou 96/96 valores distintos | 1 valor |
| `chip_cta.mov` (V3) | `MCP_chipMotion` | 13 valores distintos (entrada curta) | 1 valor |

Exemplos: card `broll2-github-files_card.mov` — `Size` 0.93 → 1.085, `Center` fixo em `{0.494, 0.5, 0.0}`. Grid `background-03.mp4` — `Size` 1.022 → 1.052, `Center` fixo em `{0.492, 0.5, 0.0}`.

Contraste: os comps do kit parallax na timeline LAB animam `Center` de verdade via `XYPath` (`Card_Dolly` 0.492 → 0.5076). O kit cobre o que o motor atual não faz.

## Ressalvas

- Captura de still pela API (`Project.ExportCurrentFrameAsStill`) devolveu **frame preto** no Resolve 21.1 via MCP; os PNGs daqui vieram do render, não da API.
- Este diretório é registro de evidência do que foi aprovado, não fonte de verdade de configuração. Configuração vive no preset e no registry.
