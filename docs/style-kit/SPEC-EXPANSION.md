# Style Kit — Expansão (presets de módulo + criação de estilo)

Documento complementar a SPEC.md. Adiciona campos e fluxos que a v1 deixou de fora.

## Contexto

Fase 1 migrou Talking Head + Motions pra galeria. Os cinco vídeos do criador saíram no mesmo estilo porque não há builder de preset. Esta expansão desamarra: cada bloco vira módulo com presets selecionáveis.

## Objetivo

1. Módulos com presets.
2. Palcos extras (A/B/C + D split screen).
3. Caption builder.
4. Criar estilo novo de vídeos de referência.

## Novos campos

- `modules` — `caption`, `stage`, `camera`, `cuts`, `soundEffects`, `transitions`
- `derivedFrom` — origem do estilo (ex.: vídeos de referência)

### CaptionPreset

`id`, `name`, `font`, `size`, `position`, `color`, `outline`, `animation`, `timing`

### StagePreset

`id`, `name`, `layout`, `bRoll`, `safeZones`

**D-split** = vídeo embaixo + B-roll em cima.

## Fluxo

Creator sobe vídeos → agente decompõe → propõe pacote → creator revisa → salva na galeria.

## Não muda

Schema base, threads antigas, Fase 1.

## Aceite

- `modules` sem quebrar pacotes
- 4+ CaptionPreset
- 1+ StagePreset split
- fluxo com wireframe
- troca de caption sem reescrever

***

## Implementação

### Pacote e biblioteca

```
styles/
  _presets/                      # biblioteca, compartilhada por todos os estilos
    caption/<id>.json            # CaptionPreset
    stage/<id>.json              # StagePreset (a-host, b-host-canvas, c-canvas, d-split)
    cuts/<id>.json               # justo, respiro
    sound-effects/<id>.json      # motion-hits, hits-sem-cama, so-voz
    transitions/<id>.json        # filmburn, filmburn-trocas, corte-seco
  _drafts/<id>/                  # estilos em criação (fora da galeria, gitignored)
  <id>/
    meta.json                    # + derivedFrom
    modules.json                 # preset por módulo (novo)
    quality.json                 # preview e export final (docs/preview-export)
    presets/<módulo>/<id>.json   # presets próprios do estilo (opcional; vencem a biblioteca)
    …                            # resto da v1, sem mudança
```

`modules.json` do Talking Head + Motions:

```json
{ "caption": "hetrixo-alvito", "stage": ["a-host", "b-host-canvas", "c-canvas"],
  "cuts": "justo", "soundEffects": "motion-hits", "transitions": "filmburn" }
```

O nome do arquivo é o id do preset, como a pasta é o id do estilo. Pacote sem `modules.json`
continua carregando (`modules: null`); os scripts caem nos defaults de antes.

### Presets

- **CaptionPreset** (5): `hetrixo-alvito` (o do Talking Head), `contorno-bold`, `caixa`,
  `minimal`, `editorial-serif`. Campos: `font {sans, accent, case, tracking}`,
  `size {sans, accent}`, `position {y}` (palco A; B/C/D usam a faixa do palco),
  `color {fill, accent, canvasFill, canvasAccent}`, `outline`, `shadow`, `box`,
  `animation {in: rise|pop|fade|blur|cut, out: fade|cut, inFrames, outFrames}`,
  `timing {maxWords, maxChars, leadFrames}`.
- **StagePreset** (4): `a-host`, `b-host-canvas`, `c-canvas` e **`d-split`** (B-roll em cima na
  faixa 0–958, emenda branca 958–962, host embaixo com `host.cropY`, legenda na emenda).
  Campos: `palco`, `layout`, `bRoll`, `safeZones {graphic, caption {layout, y}}`.
- `cuts`, `soundEffects` e `transitions` seguem o mesmo formato (`id`, `name`, `description` e
  os parâmetros que o script lê).

### Thread e scripts

- A thread guarda só o que trocou: `thread.modules` (`PATCH /api/threads/:id { modules }`,
  `null` volta ao do estilo). Nova thread pode trocar presets antes de começar (chip
  **Presets** na bandeja).
- A cada job e render o engine grava `<projeto>/edit/style.resolved.json`: estilo, presets
  resolvidos (objetos completos) e qualidade. Os scripts leem dele: `caption_jobs.py`
  (palavras por bloco, faixa por palco), `captions_palco.py` (fonte, cor, contorno, caixa,
  animação), `tighten_cuts.py` (limiar, pad), `compose.py` (palco D, filmburn, SFX e cama,
  qualidade). O prompt do agente recebe o resumo dos presets; trocar um preset reenvia o
  resumo na sessão retomada.
- **Troca de caption sem reescrever:** no painel do preview, trocar a legenda (ou transições,
  SFX) e clicar **Aplicar no preview**. O engine redesenha as camadas de legenda
  (`captions_palco.py` com o preset novo) e recompõe o preview, sem agente e sem mexer no
  pacote. Palcos e cortes valem a partir da próxima edição do agente.

### Caption builder

Estilos **+** › **Nova legenda** (ou **Criar legenda…** no menu de legenda). Formulário
campo a campo com o desenho do renderer real ao lado (`POST /api/presets/caption/preview`
→ `video/resolve/engine/caption_preview.py`), sobre fundo escuro, creme ou um frame do vídeo da
thread; **Ver animação** renderiza a entrada. Salvar grava em `styles/_presets/caption/<id>.json`
e, se veio de uma thread, já aplica nela.

```
┌─ Nova legenda ─────────────────────────────────────────── [Cancelar] [Salvar preset] ┐
│ Nome      [Contorno amarelo        ]  id contorno-amarelo                            │
│ Começar de [Contorno bold ▾]                                     ┌──────────────┐    │
│ ┌ Fonte ─────────────────────────────┐                           │              │    │
│ │ Texto  [Poppins-ExtraBold ▾]       │                           │              │    │
│ │ Ênfase [Poppins-ExtraBold ▾]       │                           │   ISSO MUDA  │    │
│ │ Caixa  (Frase|MAIÚSCULA|…)         │                           │     TUDO     │    │
│ └────────────────────────────────────┘                           │              │    │
│ ┌ Tamanho e posição ┐ ┌ Cor ┐ ┌ Contorno ☑ ┐ ┌ Sombra ☐ ┐       └──────────────┘    │
│ ┌ Caixa atrás ☐ ┐ ┌ Animação (Subir|Pop|Fade|Foco|Corte) ┐      [Isso *muda* tudo]    │
│ ┌ Ritmo: palavras, letras, antecipação ┐                        (Rosto|Canvas)        │
│                                                                  (Escuro|Creme|Vídeo) │
│                                                                  [▶ Ver animação]     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Criar estilo de vídeos de referência (fluxo)

```
 1 Referências          2 Agente decompõe        3 Revisar pacote          4 Salvar na galeria
 ┌───────────────┐      ┌──────────────────┐     ┌────────────────────┐    ┌──────────────────┐
 │ Nome          │      │ thread "Estilo:" │     │ painel direito:    │    │ valida presets,  │
 │ vídeos (grid) │ ───► │ skill            │ ──► │ presets, legenda   │ ─► │ gera preview.mp4 │
 │ o que copiar  │      │ style-creator    │     │ desenhada, briefing│    │ move para        │
 │ [Decompor]    │      │ escreve _drafts/ │     │ pendências; ajustes│    │ styles/<id>/     │
 └───────────────┘      └──────────────────┘     │ pela conversa      │    └──────────────────┘
                                                 └────────────────────┘
```

- **1.** Estilos **+** › **Novo estilo**: nome, vídeos (grade da pasta de projetos, outra pasta
  ou arquivos do Mac) e, opcional, o que copiar deles. `POST /api/style-drafts` cria
  `styles/_drafts/<id>/meta.json` (`derivedFrom: { kind: "references", references }`) e uma
  thread `kind: "style"` que já começa o job.
- **2.** O agente segue `.agents/skills/style-creator/SKILL.md`: mede ritmo (cortes por
  scene detection), palcos (folha de contato), legenda (frames em volta de uma troca, desenho
  comparado com `caption_preview.py`), som e transições; escolhe o preset mais próximo de cada
  módulo ou cria um em `presets/<módulo>/` do rascunho; escreve `modules.json`, `prompt.md`,
  `storyboard.md`, `quality.json`.
- **3.** O painel direito da thread mostra o **Pacote proposto** (`GET /api/style-drafts/:id`):
  referências, presets com a legenda desenhada, descrição, briefing e o que ainda falta. O
  creator pede ajustes na conversa (mesma sessão, retomada).
- **4.** **Salvar na galeria** (`POST /api/style-drafts/:id/publish`): exige briefing,
  descrição, `modules.json` com legenda e palcos que existem; sem `preview.mp4`, corta 9 s da
  primeira referência. Move para `styles/<id>/`: aparece na galeria e no seletor de nova thread.
  Refinos depois disso vão no próprio pacote, sem mudar o id.

A thread de criação fica na seção Estilos da sidebar (rascunho / criação), fora dos projetos.

### Visual primeiro (revisão de 24/09/2026)

A ferramenta é de vídeo: escolher é olhar, não ler nome. Caminho simples antes do avançado.

- **Estúdio** (sidebar › Estilos › **Ver estilos e criar**): estilos como vídeo (hover toca o
  loop), legendas prontas animadas. Clicar num estilo mostra o que ele usa, cada módulo como
  imagem: legenda animada, palcos desenhados, transição tocando o corte, cortes e som como ritmo.
  **Usar em um vídeo novo** é o caminho principal. **Editar** muda o próprio estilo (inclusive o
  padrão): troca módulos e nome pelos mesmos cards → `PATCH /api/styles/:id`. Vale para os
  próximos vídeos e, no próximo preview, para as threads que usam o estilo sem troca própria. A
  primeira edição guarda `original.json` no pacote; **Restaurar o original**
  (`POST /api/styles/:id/restore`) volta a ele. O vídeo de exemplo do estilo não muda.
- **Novo estilo**, dois caminhos:
  1. **Partir de um estilo pronto** (simples): escolher o estilo, trocar os módulos clicando nos
     cards, dar nome → `POST /api/styles/:id/duplicate` copia o pacote com os presets novos.
     Sem agente, na hora.
  2. **A partir de vídeos de exemplo** (avançado): cada vídeo tem player; **Marcar trecho** grava
     o pedaço que mostra o estilo (com nota: "a legenda daqui"), e os trechos vão para o agente.
     No pacote proposto, o agente grava `review/evidencias.json` (momento de cada decisão) e o
     painel mostra chips "Legenda 0:02", "Palcos 0:06" que pulam o player para o trecho.
- **Legenda**: o builder abre nos **tipos prontos** (cards animados com várias frases de
  exemplo, no ritmo de cada preset, sobre o vídeo mais recente). **Usar** aplica o tipo como
  está; **Configuração avançada** abre o compose do tipo escolhido (animação, fonte, tamanho,
  cor, contorno, sombra, caixa, ritmo) com a prévia animada ao lado.
- **Câmera** (módulo `camera`, dinamismo de câmera): punch, zoom in, zoom out e face tracking.
  Presets de calmo a agitado: Câmera parada, Só enquadrar no rosto, Punch na ênfase (padrão do
  Talking Head: só onde o storyboard marca `"camera": "punch"`), Zoom lento, Dinâmico,
  Acelerado. Campos: `moves`, `intensity` (escala máxima), `frequency` (`marcado`, `poucos`,
  `medio`, `muitos`), `punchFrames`, `faceTracking {enabled, baseScale, smoothing}`, `applyTo`
  (palcos A e D). O card toca o preset no seu vídeo (`GET /api/presets/camera/:id/clip`) e
  traduz em três palavras: Forte · Muitas vezes · Segue o rosto. O `compose.py` renderiza a
  câmera (`edit/camera/aroll_cam.mov`) e usa no lugar do a-roll nos palcos A/D; trocar o
  preset e **Aplicar no preview** refaz (também em projeto com `edit/compose.json` à mão, que
  recebe a câmera do estilo; `"camera": null` desliga). A trilha CÂMERA da timeline mostra
  cada punch/zoom. Rosto: Ultra-Light-Fast-Generic-Face-Detector-1MB (`version-RFB-320.onnx`,
  MIT, onnxruntime; URL e sha256 fixos em `camera.py`), ~2 ms por detecção, cache em
  `edit/camera/face_track.json`; sem o modelo, cai no topo da máscara do RVM e depois num
  pivô fixo na linha dos olhos. Detalhes e tempos em `pipeline/video/headless/README.md`.
- **Música e efeitos** (módulo `soundEffects`): o card mostra três faixas com nome (Voz,
  Efeitos, Música); a que está desligada aparece riscada ("sem música"). **Ouvir** toca ~7 s da
  sua voz com os efeitos e a música do preset, mixados como no export (cama baixa, abaixando
  sob a fala). Nomes sem jargão: Efeitos + música, Só efeitos, Só voz.
- **Presets da thread e da nova thread**: cada módulo mostra o visual do que está escolhido e
  abre os cards para trocar. O seletor de estilo da nova thread mostra os estilos como vídeo.
- Painel do preview: caminhos, pipeline e ids ficam em **Detalhes técnicos**, fechado.

### Aceite

- [x] `modules` sem quebrar pacotes (sem `modules.json` = defaults de antes).
- [x] 4+ CaptionPreset (5 na biblioteca).
- [x] 1+ StagePreset split (`d-split`, montado pelo `compose.py`).
- [x] Fluxo com wireframe (acima).
- [x] Troca de caption sem reescrever (preset na thread + **Aplicar no preview**).
