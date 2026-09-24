---
name: style-creator
description: Criar um estilo novo do Style Kit a partir de 1+ vídeos de referência. Decompõe ritmo, palcos, legenda, som e transições, escolhe presets da biblioteca (ou cria os que faltam) e escreve o pacote no rascunho para o creator revisar e salvar na galeria.
---

# Criador de estilo (Style Kit)

Entrada: o prompt do Takekit traz os vídeos de referência (caminhos absolutos, só leitura) e a
pasta do rascunho (`styles/_drafts/<id>/`, já com `meta.json`). Escreva **só** no rascunho.
Formato do pacote: [SPEC](../../../../docs/style-kit/SPEC.md) e
[expansão](../../../../docs/style-kit/SPEC-EXPANSION.md); exemplo pronto:
[talking-head-motions](../../../../styles/talking-head-motions/) (formato, não o look).

O estilo não é o vídeo: é o que se repete entre as referências. Um detalhe que aparece em uma só
vira nota no storyboard, não regra.

## 1. Decompor as referências

Rodar da raiz do pipeline; stills e folhas de contato vão para `/tmp` ou para `review/` do
rascunho (o creator vê lá). Olhe as imagens: a decisão é visual, não por número.

| aspecto | como medir | vira |
|---|---|---|
| Formato | `ffprobe` (tamanho, fps, duração) | `quality.json` só se fugir de 1080×1920@30 |
| Ritmo | cortes: `ffmpeg -i REF -vf "select='gt(scene,0.3)',showinfo" -f null -` → planos por minuto, duração média | preset de `cuts`; nota de ritmo no storyboard |
| Palcos | folha de contato `ffmpeg -i REF -vf "fps=1,scale=240:-2,tile=6x5" -frames:v 1 review/contato-N.png`; classifique cada plano | lista `stage` em `modules.json` (A host, B host+canvas, C canvas cheio, D split B-roll em cima) |
| Legenda | frames a 30 fps em volta de uma troca de legenda (`video/headless/frame.py` ou `ffmpeg -ss T -frames:v 12`); recorte a faixa da legenda | preset de `caption`: família (sans pesada, serif, cursiva), caixa, tamanho, cor, contorno/caixa/sombra, y, animação de entrada, palavras por bloco |
| Som | loudness entre falas (`ebur128`), hits curtos alinhados a cortes/motion | preset de `soundEffects` (cama sim/não, SFX sim/não) |
| Transições | frames do corte: seco, flash, burn, zoom, whip | preset de `transitions` |
| Cor | paleta dos frames (`palettegen`), fundo dos gráficos | paleta e fundo no storyboard e no `prompt.md` |

## 2. Escolher presets

Biblioteca: `styles/_presets/<módulo>/` (`caption`, `stage`, `cuts`, `sound-effects`,
`transitions`). Use o preset mais próximo quando a diferença não for visível no celular.
Quando for, crie um preset novo **no rascunho**, em `presets/<módulo>/<id>.json`, com o mesmo
schema dos da biblioteca (campos da legenda: `font`, `size`, `position`, `color`, `outline`,
`shadow`, `box`, `animation`, `timing`). Fontes vêm de `video/resolve/assets/fonts/`; não
invente arquivo que não existe.

Confira a legenda desenhada pelo renderer real ao lado de um frame da referência:

```bash
.venv/bin/python video/resolve/engine/caption_preview.py --preset <preset.json> \
  --text "Isso *muda* tudo" --layout face --bg <frame-da-referencia.png> --out review/legenda.png
```

Ajuste até ficar parecido (tamanho, peso, posição, contorno). O creator vai ver o mesmo desenho.

## 3. Escrever o pacote

No rascunho:

- `meta.json`: mantenha `id` e `derivedFrom`; ajuste `name` só se o creator pedir.
- `modules.json`: `{ "caption": id, "stage": [ids], "cuts": id, "soundEffects": id, "transitions": id }`.
- `storyboard.md`: descrição do estilo (palcos e quando cada um entra, arco do vídeo, legenda,
  paleta, som). Curto e concreto, como o do exemplo.
- `prompt.md`: briefing do agente de edição: o que está travado (tabela camada → default →
  script), o que é criativo, pipeline por etapa com os scripts do pipeline headless. Os presets
  são aplicados pelos scripts via `edit/style.resolved.json`; o briefing não repete números da
  legenda, só a intenção.
- `quality.json`: copie o do exemplo, salvo se as referências pedirem outra coisa.
- Os JSON legados (`caption.json`, `stage-scheme.json`, `cuts.json`, `sound-effects.json`,
  `transitions.json`, `engine-scripts.json`) podem ficar com o resumo e os caminhos, como no
  exemplo; campos sem valor ficam vazios.
- `preview.mp4` é opcional: sem ele, o Takekit corta 9 s da primeira referência ao salvar.

## 4. Mostrar onde viu

O creator revisa assistindo. Grave `review/evidencias.json` com o momento de cada decisão nas
referências, para o painel pular direto para o trecho:

```json
[
  { "ref": 1, "at": 3.2, "end": 5.0, "module": "caption", "note": "legenda amarela, 2 palavras, entra com pop" },
  { "ref": 2, "at": 11.0, "module": "stage", "note": "split: print em cima, host embaixo" }
]
```

`ref` é o número do vídeo na lista do prompt; `at`/`end` em segundos; `module` é `caption`,
`stage`, `cuts`, `soundEffects` ou `transitions`. Se o creator marcou trechos, comece por eles.

## 5. Propor

Resposta final, em poucas linhas: o que se repete nas referências, o preset escolhido (ou criado)
em cada módulo e por quê, o que ficou de fora e o que o creator deve conferir (arquivos em
`review/`). O creator revisa no painel do Takekit, pede ajustes na conversa e clica em
**Salvar na galeria**; depois disso o id não muda e refinos vão no próprio pacote.
