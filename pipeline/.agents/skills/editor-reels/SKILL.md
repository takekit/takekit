---
name: editor-reels
description: Editar vídeos curtos no DaVinci Resolve com descoberta de estilo, storyboard interno, busca de B-roll, execução Fusion e revisão. Usar também para manter o workflow e seus presets; roteiro pertence a codigo-viral.
---

# Editor de vídeos curtos

## Entrada

Ler o briefing e o estado do vídeo, [estilo do creator](../../../video/estilo-creator.md),
[workflow](../../../video/resolve/WORKFLOW.md) e o [default 09-jev](../../../video/resolve/DEFAULT.md).
Carregar as demais referências por necessidade.
Em manutenção do workflow, trabalhar nos arquivos; abrir/editar o Resolve somente quando a tarefa
incluir edição ou teste nele. Nenhum harness específico é necessário para entender o processo.

## Descobrir estilo e formato

Default do creator ativo: **explicação ilustrada / palco A/B/C**, fechado no 09-jev.
Não redescobrir. Pipeline e o que está travado: [DEFAULT.md](../../../video/resolve/DEFAULT.md).
YAP ou outro formato só se o pedido/briefing disser.

Se o arquivo de estilo não existir (outro creator), criá-lo a partir das respostas; registrar
desconhecidos como indefinidos. Ao trocar de creator, não transferir os gostos do anterior.

Não repetir perguntas já respondidas. Não reabrir palco, caption, fonte, paleta, SFX kind,
filmburn nem safe zone. O objeto de cada canvas B/C é o único lugar ainda criativo.

Perguntar apenas os pontos indefinidos relevantes, sem obrigar toda a lista. Uma decisão essencial
aguarda resposta; continuar ingestão/inspeção independente. Preferência geral vai no estilo;
exceção do vídeo vai no plano. Se o alcance da resposta estiver ambíguo, mantê-la local.
Referência visual ausente não impede usar uma direção declarada: registrar a falta de validação.
Amostras são úteis quando a dúvida não se resolve por descrição ou preview, sem aprovação por rotina.

## Executar

1. Default = 09-jev, salvo pedido/briefing em contrário. Não reabrir o que DEFAULT.md trava.
2. Storyboard no `plan.json`: palco A/B/C, caption `seguir`/`segurar`, objeto da cláusula.
   Vista: `python3 video/resolve/pipeline/storyboard_html.py --project video/projects/<slug>`.
   Não escrever HTML. Não pedir aprovação do storyboard.
3. Buscar e inspecionar material somente onde o storyboard pedir; preferir YouTube e X/Twitter.
4. Montar a fala e reconciliar os tempos reais antes de posicionar acabamento (§3 do workflow).
5. Aplicar o default (DEFAULT.md). Palco B: `engine/palco_b_composite.py`. Canvas B/C: skills de
   motion (inclui `logo-animation`) dentro de `<StageB>`/`<StageC>`
   ([motion/README.md](../../../video/resolve/motion/README.md)) — a cena não é catálogo; a faixa
   sim. Captions: `captions_palco.py`. SFX: `map_sfx_cues.py`. Fusion só quando faltar uma
   capacidade fora desse kit.
6. Revisar editorial e tecnicamente, entregar e atualizar o mesmo estado do projeto.

YAP tem caminho curto: fala, título persistente, captions neutras e câmera discreta quando útil.
Não exige B-roll, transições elaboradas nem novos motions. A revisão de fala permanece completa.
Storyboard não é entregável nem checkpoint de aprovação: fica no plano para continuidade do trabalho.

## Consultar quando precisar

| Necessidade | Referência |
|---|---|
| Default travado (09-jev) | [DEFAULT.md](../../../video/resolve/DEFAULT.md) |
| Formato e intensidade de edição | [FORMATOS.md](../../../video/resolve/FORMATOS.md) |
| Briefing de entrada | [Modelo de briefing](../../../video/resolve/references/briefing-template.md) |
| Estado/storyboard de nova edição | [Modelo de plano](../../../video/resolve/references/plan-template.json); preservar contratos de planos legados |
| Escolher/compor recursos | [BEHAVIORS.md](../../../video/resolve/BEHAVIORS.md) e `python3 video/resolve/presets.py list` |
| Canvas B/C (Remotion + safe zone) | [motion/README.md](../../../video/resolve/motion/README.md) |
| Criar motion em Fusion (fora do canvas) | [FUSION.md](../../../video/resolve/FUSION.md) |
| Conexão, cortes, captura ou falha de API | Seção pertinente de [API-NOTES.md](../../../video/resolve/API-NOTES.md) |
| Usar o helper native_scenes | [SCENES.md](../../../video/resolve/SCENES.md), opcional |

Consultar exemplos apontados pelo perfil ativo. Creator atual: default = 09-jev (DEFAULT.md).
O 05 é intensidade de câmera, não o default. Não copiar as cenas do 09-jev; copiar palco,
caption, SFX e faixa. Preservar originais, timeline aprovada e comps existentes.
Critérios de montagem, verificação e registro: workflow.
