---
name: editor-reels
description: Editar vídeos curtos sem GUI (FFmpeg + RVM + Remotion, pipeline headless) com descoberta de estilo, storyboard interno, busca de B-roll, montagem, preview/export e revisão. Usar também para manter o workflow e seus presets; roteiro pertence a codigo-viral.
---

# Editor de vídeos curtos

## Entrada

Ler o briefing e o estado do vídeo, [estilo do creator](../../../video/estilo-creator.md),
[workflow](../../../video/kit/WORKFLOW.md) e o estilo da thread (pacote Style Kit indicado no
prompt; sem indicação, o default [Talking Head + Motions](../../../../styles/talking-head-motions/prompt.md)).
Carregar as demais referências por necessidade.
Tudo roda por linha de comando no [pipeline headless](../../../video/headless/README.md), sem
GUI. Vários vídeos podem rodar ao mesmo tempo, cada um só no próprio projeto. Nenhum harness específico é
necessário para entender o processo.

## Descobrir estilo e formato

Default do creator ativo: **Talking Head + Motions** (explicação ilustrada / palco A/B/C), fechado
no vídeo 09-jev. Não redescobrir. Pipeline e o que está travado: o `prompt.md` do
[pacote](../../../../styles/talking-head-motions/). Se o prompt trouxer outro estilo, vale o dele.
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

1. Estilo = o da thread (default Talking Head + Motions), salvo pedido/briefing em contrário. Não
   reabrir o que o `prompt.md` do estilo trava. Os presets da thread (legenda, palcos, cortes,
   SFX, transições) chegam em `edit/style.resolved.json`, gravado pelo Takekit a cada job: os
   scripts já aplicam; não edite esse arquivo nem force outro look por flag.
2. Storyboard no `plan.json`: palco (só os que a thread permite: A/B/C e, se estiver nos presets,
   D split com `broll` no beat), caption `seguir`/`segurar`, objeto da cláusula, e câmera quando a
   ênfase pedir (`"camera": "punch" | "zoom_in" | "zoom_out" | "none"`; o preset de câmera da
   thread decide o resto e o `compose.py` aplica, centrado no rosto);
   ritmo das trocas com `beat-sync-editing`. Vista: `python3 video/kit/pipeline/storyboard_html.py --project video/projects/<slug>`.
   Não escrever HTML. Não pedir aprovação do storyboard.
3. Buscar e inspecionar material somente onde o storyboard pedir; preferir YouTube e X/Twitter.
4. Montar a fala (`tighten_cuts.py` → `video/headless/trim.py`) e reconciliar os tempos reais
   antes de posicionar acabamento (§3 do workflow).
5. Aplicar o estilo (`prompt.md` do pacote, que mapeia as skills de motion por etapa). Palco B:
   `video/headless/palco_b.py` (RVM + `palco_b_composite.py`). Canvas B/C: skills de motion
   (`motion-art-direction`, `shot-composition`, `animation-principles`, `kinetic-typography`,
   `color-motion`, `motion-background`, `logo-animation`, `remotion-video`) dentro de
   `<StageB>`/`<StageC>` ([motion/README.md](../../../video/kit/motion/README.md)) — a cena
   não é catálogo; a faixa sim. Captions: `captions_palco.py`. SFX: `map_sfx_cues.py --prep`.
   Capacidade fora desse kit vira camada própria no `edit/compose.json`.
6. Gerar o **preview** com `video/headless/compose.py` (default `--quality preview`: 720p rápido,
   `edit/preview.mp4`), revisar (stills: `video/headless/frame.py`) editorial e tecnicamente,
   entregar e atualizar o mesmo estado do projeto. **Não** gerar o export final
   (`--quality final`, `exports/`): ele é do creator, pelo botão Exportar, a partir do mesmo spec
   do preview. Fora do Takekit, o export final é `compose.py --quality final --from-preview`.

YAP tem caminho curto: fala, título persistente, captions neutras e câmera discreta quando útil.
Não exige B-roll, transições elaboradas nem novos motions. A revisão de fala permanece completa.
Storyboard não é entregável nem checkpoint de aprovação: fica no plano para continuidade do trabalho.

## Consultar quando precisar

| Necessidade | Referência |
|---|---|
| Estilo default travado (Talking Head + Motions) | [pacote](../../../../styles/talking-head-motions/) · [prompt.md](../../../../styles/talking-head-motions/prompt.md) |
| Formato e intensidade de edição | [FORMATOS.md](../../../video/kit/FORMATOS.md) |
| Briefing de entrada | [Modelo de briefing](../../../video/kit/references/briefing-template.md) |
| Estado/storyboard de nova edição | [Modelo de plano](../../../video/kit/references/plan-template.json); preservar contratos de planos legados |
| Escolher/compor recursos | [BEHAVIORS.md](../../../video/kit/BEHAVIORS.md) e `python3 video/kit/presets.py list` |
| Canvas B/C (Remotion + safe zone) | [motion/README.md](../../../video/kit/motion/README.md) |
| Texto animado, cor, fundo, ritmo | skills `kinetic-typography`, `color-motion`, `motion-background`, `beat-sync-editing` (etapa de cada uma no `prompt.md` do estilo) |
| Trim, máscara, preview/export, captura, jobs em paralelo | [headless/README.md](../../../video/headless/README.md) |
| Criar estilo novo de vídeos de referência | skill `style-creator` |

Consultar exemplos apontados pelo perfil ativo. Creator atual: default = Talking Head + Motions.
O 05 é intensidade de câmera, não o default. Não copiar as cenas do 09-jev; copiar palco,
caption, SFX e faixa. Preservar originais, cortes aprovados (`cuts.json`) e exports existentes.
Critérios de montagem, verificação e registro: workflow.
