# Baseline do look aprovado — 05-github-gratis_EDIT_v4

Artefato de referência do look **aprovado em 16/09/2026**. Congelado: a timeline `05-github-gratis_EDIT_v4` não é mais editada; o próximo vídeo é que estreia o motor novo. Serve para comparar qualquer mudança do motor de motion contra o que foi aprovado.

- projeto: `05-github-gratis` / timeline: `05-github-gratis_EDIT_v4`
- 1080x1920, 30 fps, frames 108000–109183, start `01:00:00:00`
- `05-v4-curves.json`: escala (`Size`) e posição (`Center`, x,y) por frame de cada camada animada
- `05-v4-card.png`: frame 108182 (card `broll2-github-files_card.mov` + grid no mesmo quadro)
- `05-v4-chip.png`: frame 109090 (chip `COMENTA GITHUB` sobre o apresentador)

Curvas medidas na timeline da época; frames extraídos do render `video/projects/05-github-gratis/preview/05-github-gratis_EDIT_v4.mp4` (`ffmpeg -ss`), não por render novo.

## Estado medido

15 camadas animadas, todas com `Size` animado e **`Center` constante** — ou seja, o pan nunca renderizou nesta timeline. Só a escala tem curva; a posição não se move.

| item | camada | Size | Center |
|---|---|---|---|
| `background-03.mp4` (V2, 7 itens) | `MCP_gridMotion` | 60/60 ou 96/96 valores distintos | 1 valor |
| `*_card.mov` (V3, 7 itens) | `MCP_cardMotion` | 60/60 ou 96/96 valores distintos | 1 valor |
| `chip_cta.mov` (V3) | `MCP_chipMotion` | 13 valores distintos (entrada curta) | 1 valor |

Exemplos: card `broll2-github-files_card.mov` — `Size` 0.93 → 1.085, `Center` fixo em `{0.494, 0.5, 0.0}`. Grid `background-03.mp4` — `Size` 1.022 → 1.052, `Center` fixo em `{0.492, 0.5, 0.0}`.


## Ressalvas

- Os PNGs vieram do render aprovado.
- Este diretório é registro de evidência do que foi aprovado, não fonte de verdade de configuração. Configuração vive no preset e no registry.
