# Kit de edição (docs, presets, estilos e motores)

Pipeline headless: montagem, máscara do palco B, preview/export e captura em
[../headless](../headless/README.md). Este kit guarda o que eles usam: captions, motion, SFX,
presets, estilos e assets.

Default do creator: explicação ilustrada / palco A/B/C, fechado no 09-jev: estilo Talking Head + Motions (`styles/talking-head-motions/` na raiz do repo).
Canvas B/C em Remotion (`motion/`). Captions palco preservadas.

Antes de cortes ou acabamento, ler o contrato de montagem em `WORKFLOW.md`, §3: roteiro obrigatório,
fala sem respiros entre cortes, inspeção do resultado real (preview e frames).

- `DEFAULT.md`: ponteiro para o estilo default (pacote Style Kit `talking-head-motions`).
- `WORKFLOW.md`: fluxo atual e critérios de conclusão; `FORMATOS.md`: YAP e demais formatos.
- `motion/README.md`: canvas B/C — skills de motion, faixa travada.
- `BEHAVIORS.md`: padrões de execução visual + sonora; punch, texto, destaque e transição.
- `assets/packs/brainstorm-academy/README.md`: fundos, guias, SFX e referências Adobe/fontes do pack.
- `engine/`: captions (`captions_palco.py`, `caption_preview.py`), palco B (`palco_b_composite.py`), SFX (`sfx_prep.py`).
- `pipeline/`: cortes (`tighten_cuts.py`), rascunho de captions (`caption_jobs.py`), SFX (`map_sfx_cues.py`), storyboard.
- `presets/registry.json`: catálogo histórico; aprovação tem escopo de vídeo.
- `presets/GALLERY.md`: visão do catálogo, gerada por `presets.py table` (não editar à mão).

O agente escolhe e adapta composição, ritmo, movimento e som. Receitas são atalhos. Captions
aprovadas mantêm o motor existente.

## Captions

`engine/captions_palco.py` renderiza as legendas dos palcos (`styles/palco-{face,canvas,hold}.json`,
contrato em `styles/caption-style-config.json`); `engine/caption_preview.py` desenha um preset sem
projeto (caption builder). `engine/captions_engine.py` é a base dos dois: job de palavras e
agrupamento automático em blocos com palavra-herói. Comandos em [../headless](../headless/README.md).

## Limites atuais

- Overlay não enxerga o vídeo de fundo → **inverted cutout** ainda não existe.
