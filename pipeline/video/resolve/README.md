# Kit de edição (docs, presets, estilos e motores)

> O DaVinci Resolve foi removido do pipeline em 23/09/2026. A montagem, a máscara do palco B, o
> export e a captura rodam em [../headless](../headless/README.md). As seções deste README que falam
> de rodar no Resolve (launcher, Fusion, `build_timeline.py`) são legado; captions, motion e SFX
> continuam valendo.

Default do creator: explicação ilustrada / palco A/B/C, fechado no 09-jev. Ver `DEFAULT.md`.
Canvas B/C em Remotion (`motion/`). Captions palco preservadas.

Antes de cortes ou acabamento, ler o contrato de montagem em `WORKFLOW.md`, §3: roteiro obrigatório,
fala sem respiros entre cortes, seleção e inspeção nativas, verificação da timeline real.
O perfil visual não altera esse contrato. `--validate-only` verifica estrutura do manifesto;
não verifica fala, roteiro ou ritmo e não libera a montagem como concluída.

- `DEFAULT.md`: estilo default (09-jev) e pipeline de scripts.
- `WORKFLOW.md`: fluxo atual e critérios de conclusão; `FORMATOS.md`: YAP e demais formatos.
- `motion/README.md`: canvas B/C — skills de motion, faixa travada.
- `BEHAVIORS.md`: padrões de execução visual + sonora; punch, texto, destaque e transição.
- `assets/packs/brainstorm-academy/README.md`: fundos, guias, SFX e referências Adobe/fontes do pack.
- `SCENES.md`: repertório opcional, ajustes por cena e caminho para comps próprias.
- `FUSION.md`: nós, captura, preservação e limites reais.
- `profiles/`: defaults técnicos do helper native_scenes (energético/sóbrio); não são formatos
  editoriais nem substituem o perfil do creator.
- `engine/native_scenes.py`: recipes Fusion; `pipeline/capture_frame.py`: captura sem render.
- `references/04-cta-glass/`: comp e frame reais do CTA aprovado.
- `presets/registry.json`: catálogo histórico; aprovação tem escopo de vídeo.
- `presets/GALLERY.md`: visão do catálogo, gerada por `presets.py table` (não editar à mão).

O agente escolhe e adapta composição, ritmo, movimento e som. Receitas são atalhos; edição
direta e grafos próprios no Fusion fazem parte do fluxo. O builder abaixo é opcional para
reprodução por manifesto. Captions aprovadas mantêm o motor existente.

```bash
# A partir da raiz; primeiro validar, depois reconstruir em nome NOVO:
python3 video/resolve/pipeline/build_timeline.py --project video/projects/<slug> --validate-only
python3 video/resolve/pipeline/render_overlays.py --project video/projects/<slug>
python3 video/resolve/pipeline/build_timeline.py --project video/projects/<slug>
```

Inspecionar/exportar trabalho atual antes de usar manifestos antigos. Render externo de UI é
legado. A seção abaixo cobre a exceção deliberada das captions existentes.

## Instalar / atualizar menu

```bash
video/resolve/install.sh
```

Requisitos: `ffmpeg` no PATH, `/opt/homebrew/bin/python3` com `Pillow` e `numpy`
(o launcher chama esse interpretador; o Python interno do Resolve só usa stdlib).
Fonte do template precisa existir no caminho do JSON (`font`).

## Como funciona ao rodar no Resolve

1. Percorre os clipes de **V1** (fala). Se o clipe não tem transcrição, roda
   `TranscribeAudio` (nativo, Studio). Palavras viram frames da timeline.
2. Agrupa em blocos (pausa > 12 frames, máx 4 palavras / 22 chars, pontuação forte)
   e escolhe a **palavra-herói** (número > palavra mais longa fora das stopwords).
3. Renderiza o overlay em `~/Movies/Legendas/<projeto>/<timeline>/captions_<template>.mov`.
4. Importa e coloca na track `LEGENDAS` (cria se não existir; substitui o que tiver lá).

Ajuste fino sem mexer em código: copie `blocks_auto.json` (gerado na mesma pasta) para
`blocks.json`, edite herói/quebras/texto, rode o script de novo.

## Criar um template novo

```bash
cp styles/trendy-stack-chroma.json styles/meu-estilo.json   # edite os valores (default atual)
./install.sh                                         # aparece "Legendas - meu-estilo"
```

Parâmetros principais (`hero-lockin.json`; o `trendy-stack*.json` usa `size`/`pack`/`chroma`, ver `_doc`):

| grupo | chaves | efeito |
|---|---|---|
| tipografia | `font`, `hero_size`, `small_size`, `tracking_*`, `case` | tamanho herói vs pequeno, caixa |
| layout | `y_auto`, `max_width`, `word_gap_*`, `line_gap` | posição vertical (px em 1080x1920), larguras |
| física | `in_frames`, `rise_px`, `ease_k`, `motion_blur`, `focus_blur`, `lead`, `out_frames` | peso/velocidade da entrada, arrasto, desfoque |
| contraste | `shadow`, `glow` | drop shadow + halo estático |
| efeitos | `shine`, `flicker`, `bounce`, `jitter` | parâmetros de cada efeito |
| classes | `passage_words`, `fx_rules`, `fx_default` | quem é palavra de passagem; qual efeito o herói ganha |
| auto | `auto.gap_frames`, `auto.max_words`, `auto.max_chars`, `auto.hold_frames` | agrupamento automático |

## Uso direto (sem Resolve) — pra testar um template rápido

```bash
python3 engine/captions_engine.py --job job.json --style styles/hero-lockin.json --out /tmp/cap.mov
python3 engine/captions_engine.py --job job.json --style styles/hero-lockin.json --stills 10,20,30 --stills-dir /tmp/stills
```

`job.json`: `{"fps":30,"size":[1080,1920],"total_frames":N,"words":[{"text","start_f","end_f"},...]}`.

Modo legado (projeto `01-muse-split` com `caption_plan.json` feito à mão): `--project <dir>`.

## Limites atuais

- Overlay não enxerga o vídeo de fundo → **inverted cutout** ainda não existe. Exige
  compor no Fusion com acesso ao MediaIn; não implementar por render paralelo.
- Assume fala na V1. Multicam/nested: não testado.
