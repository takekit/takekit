# Kit do canvas — contrato para quem escreve um beat

Uma composição Remotion por beat, 1080×1920 @ 30. O beat **não escolhe** número
de movimento, cor, tamanho de tipo nem duração: tudo isso está travado em
`src/kit/tokens.ts`. Escrever um beat é escolher **o que entra, onde e quando**.

Leia antes de escrever: `src/kit/tokens.ts`, `src/kit/curve.ts`,
`src/kit/motion.tsx`, `src/kit/ui.tsx`, `src/kit/Stage.tsx`, e os dois beats já
prontos `src/beats/u01.tsx` e `src/beats/u13.tsx` — eles são a referência de tom.

## A regra mestra

Entrada e deriva são **um relógio só**. A velocidade nunca é zero, nem no frame
do corte. Isso é estrutural: a deriva é uma **taxa em px/s** que começa quando a
entrada termina e segue até o corte, então a tangente do último frame é
exatamente a taxa. Um elemento que "entra e para" é defeito, não estilo.

Consequência prática: **todo elemento posicionado passa por `<Enter>`**. Um beat
que escreve a própria `transform` está fora da linguagem.

## Palcos

| | palco B | palco C |
|---|---|---|
| fundo | transparente (o creme e o host vêm de `overlay/hostB_*.mov`) | creme `#F4EFE6` opaco |
| alfa | **todo pixel abaixo de y=960 é alfa 0**, em todo frame | full frame |
| conteúdo | x 80..1000, y 180..620 | x 80..1000, y 200..1400 |
| repouso mais baixo | 620 (abaixo disso cobre a caption) | 1400 |
| faixa da caption (do outro agente) | y 640..800, quase vazia | y 1500..1750, quase vazia |
| topo da eyebrow | ~184 | 320 (cap-top 324) |
| encaixe do grupo | por beat (`STAGE_B_FIT`) | +200 px |

No palco B a caption mora no **vão de creme acima da cabeça do host**, não
abaixo dela: por isso a faixa útil fecha em 620 e a faixa quieta é 640..800.
Sobram 440 px de altura, e cinco beats nasceram mais altos que isso — eles
descem e encolhem o mínimo necessário. Os números de `STAGE_B_FIT` são medidos
por `tools/verify.py`, nunca estimados.

**y=0..180 é zona morta nos dois palcos**: a UI do Instagram cobre o topo do
Reels. `tools/audit.py` reprova qualquer pixel opaco ali.

As faixas acima são **coordenada final de tela**. O beat é escrito no espaço de
antes da descida, porque quem desce o grupo é `<StageB>`/`<StageC>`, numa
translação só (nunca escala). Quando um beat precisa citar uma faixa, usa a
ponte do kit: `EYEBROW.B` / `EYEBROW.C`, nunca o número final cru.

**Borda esquerda de todo bloco de texto: x=80 nos dois palcos.** Um corte
B→C→B não pode deslocar o tipo.

`<StageB>` já recorta em y=960. Ainda assim, não autorize repouso abaixo de
620 (final): a sombra de lift estoura ~20 px além da placa.

## Tipo, travado

`heroNumber 232 · bigNumber 132 · heroLabel 72 · cardTitle 56 · chipValue 52 ·
chipLabel 34 · unit 88 · accent 62 · logoCaption 30 · smallCaps 24 · microLabel 20`

- Hetrixo ExtraBold: toda UI e todo número.
- Alvito Nova Comp (corte bolditalic): **um** acento cursivo por gráfico, e só
  ASCII — a demo não tem acento nem `×` nem `→`.
- **Número que muda valor usa `<NumericSlots>`.** Hetrixo não tem `tnum`: o `1`
  avança 0,325 em e o `0` 0,667 em, então um contador sem slot reflui na
  horizontal enquanto conta.

## Movimento, travado

| classe | entrada | curso |
|---|---|---|
| chip, pill, label | 12 f | 42 px |
| placa, card, tile | 16 f | 32 px |
| marca, número, hero | 20 f | 30 px |
| lateral, qualquer | 12 f | ≤24 px |
| régua / write-on | 6 f, ápice +2% | 0 px, só escala |

- Stagger de grupo: **4 f** (3 f com 4+ irmãos). Nunca 5, 6 ou 7.
- Opacidade: **linear**, 6 f (8 f para placa). Ela não deriva e não é splinada.
- Deriva: `driftHero` (12, −10 px/s), `driftSupport` (0,6×), `driftAmbient`
  (0,3×). Todas as camadas no **mesmo sentido**. Elemento de largura ≥880 px
  deriva **só em y** — use `vertical(rate)`.
- Overshoot: no máximo **um ápice** por propriedade, ≤2% de escala, ≤8 px, e
  **nunca em número, barra, dinheiro ou logo**. O `pop` já é um nó de ápice na
  spline; não existe curva com bounce no kit.
- A última novidade do beat começa **antes** de `duration − tail(duration)`
  (`tail = max(8, 0.15 × duração)`). Depois disso, só deriva.
- **Nenhum beat B pode abrir com o canvas vazio**: o primeiro elemento começa em
  `start = -5`, para o corte cair sobre movimento já em curso.

Frames de entrada e deriva em `u01`/`u13` mostram os números em uso.

## Superfície e cor

Três superfícies, e só três:

- `sheet` — folha clara + hairline + sombra curta. Corpo de card.
- `block` — placa ink + lift. **Uma por beat**, e é sempre o vencedor.
- `outline` — sem preenchimento, só hairline. É o default da linha de decisão:
  no creme, placa clara quase não tem aresta, então quem desenha a linha é a
  borda e o conteúdo.

Paleta: creme, tinta `#1C1A18`, mudo `#5A544E`, ouro `#F4B400`, branco. Sem
neon, sem chroma.

- **Ouro só sobre superfície ink.** Em creme é 1,61:1; num trilho claro, 1,18:1
  — invisível. Ouro carrega *decisão*: um objeto por beat.
- Trilho vazio: 0,16 de alfa sobre a cor local, nunca 0,08.
- `<BrandMark>` desenha a marca em **tinta plana**, recortada pelo alfa do PNG.
  O verde do ChatGPT e o coral do Claude não entram no frame.

## Som

`src/cues.ts` é a fonte única dos SFX; `tools/emit-cues.ts` escreve o
`sfx-cues.json` entregue. Tempo é **local ao clipe** (frame 0 = início do beat).
O SFX existe porque o movimento existe: `snap` para chegada, `click` para troca
de estado, `whoosh` para gesto que varre, `reveal` para abertura, `riser` para
subida. Silêncio é resposta legítima — e é a resposta para shine.

## Antes de dizer que terminou

```bash
npx tsc --noEmit                 # obrigatório
python3 tools/lint_glyphs.py     # texto sem glifo na fonte
```

Quem coordena fecha com `python3 tools/batch.py` (stills + auditoria + render) e
`python3 tools/verify.py` (decodifica o .mov inteiro). O segundo não é redundante:
a auditoria por amostra deixa passar o extremo do percurso, que cai entre os
frames amostrados.

O render dos stills e a auditoria de geometria/alfa são feitos em lote por quem
coordena, não por quem escreve o beat — não rode `remotion render` em paralelo.
