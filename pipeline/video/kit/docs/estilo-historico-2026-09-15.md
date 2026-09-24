# Histórico de feedback até a reformulação

Consulta histórica; direção vigente em ../WORKFLOW.md, especialmente o contrato obrigatório do §3.
As declarações de “canônico”, “lei”, pausas e caudas abaixo descrevem o estado antigo e não
devem orientar novas montagens. Memória atual: ../../estilo-creator.md.

# Estilo do Oldaque — memória de edição

Arquivo canônico do estilo de edição do Oldaque. Versionado neste repo
(`ai-content-agent`), lido pelo bot **editor** no início de toda edição e atualizado no
fim de cada feedback.

Formato de cada regra: **regra prática** — por quê — desde quando — quantas confirmações.
Status: `candidata` (1 confirmação) → `default` (2–3 confirmações) → `lei` (aprovou/reprovou
explicitamente várias vezes).

---

## Vertical (Reels / Shorts / TikTok)

- **02-muse-v2 aprovado inteiro** (12/09): "pro primeiro, obra de arte". Pipeline de 8 fases + presets em
  `kit/` é o padrão. Melhorias vêm por cima, não do zero. `status: lei`

## Horizontal (YouTube)

_(vazio ainda — preencher com os primeiros feedbacks)_

## Corte e ritmo

- **Corte bruto**: silêncio > 220 ms fora, cauda 3 frames; depois **acelerar 1,05x com pitch
  preservado** (ffmpeg `atempo`) antes de importar. Aprovado em 12/09 (02-muse-v2). `status: candidata`

## Legendas

- **trendy-stack-chroma é o padrão** (14/09): encaixe tetris (linhas rentes à borda da palavra grande, alternando lado;
  stopword divide linha; linha sobe até encostar), Poppins Bold + Playfair Italic 800 em ouro com glow, entrada no lugar
  blur→nítido com aberração cromática (R→G→B), saída inversa. Ref. Envato "Trendy Titles". Outros templates só se pedido
  ou se o contexto do vídeo não combinar. `status: default`

- **hero-lockin** (12/09, 02-muse-v2): herói 150 px + escada, encaixe cumulativo,
  ease expo + arrasto + desfoque, shine/flicker/bounce por classe, some antes de qualquer dispositivo. `status: aprovado, legado`

- **Legenda palavra-a-palavra com 1 palavra em destaque**: blocos de fala, texto pequeno em
  caixa alta + a palavra-chave da frase grande (≈96px vs 52px), branco com drop shadow.
  Entrada subindo com ease-out + fade, saída em fade. Fonte: **Instrument Sans** (pedida pelo
  Oldaque em 12/09 — tutorial de referência usava Montserrat, ele trocou). `status: candidata`
- **Nunca duas legendas no mesmo frame**: serializar os blocos entre si (o fade-out de um
  termina antes do fade-in do próximo) — inclusive NA EMENDA entre beats. Ghosting na emenda
  = defeito (corrigido em 12/09). `status: lei` (correção de produção)

## Som

- **SFX e música nunca sobrepõem a narração.** Pop por palavra = reprovado ("barulho tosco",
  12/09). SFX só em evento visual; música −22 dB com ducking forte. `status: lei`
- **Notificação padrão = som do iPhone** (myinstants iphone-notification). `status: lei` (12/09)
- Biblioteca de SFX na taxonomia do Peu (`kit/assets/sfx/`); Mixkit só fallback. `status: default`

## Cor e tratamento

_(vazio ainda)_

## Gancho e estrutura

- Gancho que só nomeia/anuncia o assunto = reprovado (lote de 2026-09-08). O gancho tem que
  ser magnético — subverter clichê, nunca bordão pronto. `status: lei`

## Split screen / B-roll (materiais complementares)

- **Sem ícone genérico.** Nada de "3 iconezinhos" ilustrando lista; só asset reutilizável (logo oficial,
  UI real) ou material único. **Material único de vídeo/imagem oficial → B-roll em split screen.**
  (12/09, 02-muse-v2) `status: candidata`
- **Tela dividida = quadro dividido de verdade** (dois conteúdos ocupando partes da tela ao
  mesmo tempo — corte reto, colunas, faixa), **não** painel/overlay flutuando sobre o vídeo
  do apresentador. "Split screen" entregue como painel de imagem = REPROVADO (12/09).
  `status: lei`
- **Split aprovado (Take 1, 12/09)**: o vídeo DELE em cima **ou** embaixo, material
  complementar na **metade oposta**, as duas faixas full-width, corte reto com emenda fina
  branca (~4px). "Largura encaixada, os dois vídeos unidos" — esse é o formato padrão.
  Nesta edição: apresentador EM CIMA / material EMBAIXO. `status: lei`
- **Material complementar deve ter VÍDEO sempre que existir** (screen recording, demo
  oficial, tour do produto) — não usar só prints/imagens. Baixar da internet quando preciso
  (yt-dlp com cookies do Chrome funciona nesta máquina). `status: lei` (12/09)
- O material tem que dizer algo (número, trecho, diagrama, ação do agente), não ser
  decorativo; label da fonte + dot verde se a fonte aparecer. `status: candidata`
- Captar material complementar na internet e usar de forma intencional — pedido explícito
  no briefing do 01-muse-split. `status: candidata`
- Antes de aplicar: **mostrar 3 takes/layouts diferentes** pra ele aprovar (print/cheat +
  preview com vídeo rodando). Fluxo aprovado e usado em 12/09. `status: default`
- **Legenda: animação atual precisa mudar** ("tem que ser animada de outra forma" — 12/09).
  Sessão dedicada de legendas vem em seguida; até lá NÃO redesenhar por conta própria.
  `status: candidata` (aguardando o feedback específico)

## Reprovados / o que não funciona

- **Pop/snap por palavra-herói** — "barulho tosco" (12/09, 02-muse-v2). Nunca mais.
- **Light leak procedural** no lugar de film burn real — reprovado antes de ver (12/09): "baixa da internet, feito por editor".
- **Ícones genéricos** pra ilustrar lista (12/09): usar material oficial/único ou nada.
- **SFX de film burn duplicado** com overlay que já traz som (12/09).
- **Música duckada a −23 dB / ratio 10** — "tirou a trilha" (12/09). Mínimo audível: −18 dB / ratio 6.
- **Reveal SFX no volume bruto** (12/09): alto; usar fórmula (rel −24).
