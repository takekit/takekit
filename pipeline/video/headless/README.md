# Pipeline headless

O estilo default (Talking Head + Motions) roda inteiro por linha de comando, sem GUI, e vários
vídeos rodam ao mesmo tempo. Visual e som do 09-jev mantidos (validação abaixo). A pasta
`video/kit/` guarda docs, presets, estilos e motores.

## Setup (uma vez)

```bash
# a partir da raiz do pipeline (pipeline/, o cwd do agente)
bash video/headless/setup.sh          # .venv com numpy, pillow, onnxruntime + modelo RVM
PY=.venv/bin/python
```

Precisa de `ffmpeg`/`ffprobe` no PATH. O modelo `rvm_mobilenetv3_fp32.onnx` (15 MB, sha256
conferido) fica em `~/.cache/takekit/models/`, compartilhado entre jobs.
Cama e filmburn não estão no repo ([assets/OMITTED.md](../kit/assets/OMITTED.md)):
`export TAKEKIT_ASSETS=<pasta com music/ e filmburns/>`. Sem eles o export sai
sem cama/burn e avisa.

## Cadeia do 09-jev

Comandos a partir da raiz do pipeline, projeto em `video/projects/<slug>`.

| etapa | script |
|---|---|
| Fala | Whisper → `tighten_cuts.py` → **`trim.py`** (FFmpeg) |
| Palco B | **`palco_b.py`**: RVM + `palco_b_composite.py` |
| Captions, motion, SFX | `captions_palco.py`, `motion/render.py`, `map_sfx_cues.py --prep` |
| Preview / export | **`compose.py`** (FFmpeg): preview por default, final no botão Exportar |
| Captura para revisão | **`frame.py`** (FFmpeg) |

```bash
$PY video/headless/trim.py    --project video/projects/<slug>        # edit/aroll.mov + aroll.json + voice.wav
$PY video/headless/palco_b.py --project video/projects/<slug>        # edit/overlay/hostB_<u>.mov (beats B)
$PY video/headless/compose.py --project video/projects/<slug>        # edit/preview.mp4 (720p, rápido)
$PY video/headless/compose.py --project video/projects/<slug> --quality final --from-preview   # exports/<slug>-vN.mp4
$PY video/headless/frame.py   --project video/projects/<slug> --at 72 --at 00:00:10:00 --sheet
```

- **trim.py**: um passe de decodificação, corte no frame exato do `cuts.json` (fim exclusivo),
  microfade de 4 ms por emenda, fonte escalada para 1080×1920. Voz em `edit/voice.wav` serve
  de referência para o `sfx_prep.py` (`map_sfx_cues.py --voice edit/voice.wav --prep`).
- **matte.py**: RVM (ONNX, CPU; mais rápido que CoreML no M4) sobre qualquer trecho;
  aquece o estado recorrente no 1º frame. O `palco_b.py` usa ele por baixo. Corte duro
  do alfa em 128 (`--thresh`).
- **compose.py**: por unidade, palco do storyboard do `plan.json` (beat ↔ unidade na ordem,
  ou campo `unit`). A = trecho do `aroll.mov`; B = `hostB_<u>.mov` + canvas `<u>_B.mov`;
  C = creme + canvas `<u>_C.mov`; D = split (abaixo). Canvas procurado em `edit/overlay`,
  `edit/motion/out`, `edit/motion`, `edit/motion-v2`. Por cima: `edit/overlay/captions_{face,canvas,hold}.mov`
  e o filmburn do preset `fx/filmburn-hook` em Screen, com o pico no corte: no gancho
  e em cada beat com `"transicao": "filmburn"` no storyboard (ou conforme o preset de
  transições). Áudio: voz + SFX (`edit/sfx_map.json` → `edit/sfx_prep/`) + som do burn +
  cama trap-hype −25 dB com ducking pela voz, −14 LUFS / −1 dBTP.
  Todo render grava o spec exato que usou em `edit/compose.resolved.json` (a timeline da UI
  lê esse arquivo; `_quality` = `preview`|`final`, `_source` = spec à mão, quando houver).
  Exceção do vídeo = copiar para `edit/compose.json`, editar e passar `--spec edit/compose.json`;
  o bloco `export` desse spec ainda muda os bitrates do final.
- **frame.py**: frame, `hh:mm:ss:ff` ou `2.4s`; seek preciso. Um still não valida
  movimento, áudio nem cortes (WORKFLOW §5).

## Preview × export final

Dois estágios, mesmos scripts ([docs/preview-export/SPEC.md](../../../docs/preview-export/SPEC.md)).
Nada vai para `exports/` sem pedido explícito.

| | `--quality preview` (default) | `--quality final` |
|---|---|---|
| saída | `edit/preview.mp4`, sobrescrito (tmp + rename) | `exports/<slug>-vN.mp4`, próximo livre |
| vídeo | 720×1280 H.264 veryfast 1,5 Mbps; grafo inteiro já no tamanho do preview | 1080×1920@30 H.264 medium 10 Mbps (máx. 12, buffer 20) |
| áudio | AAC 128k, loudnorm de um passe | AAC 256k, loudnorm em dois passes (−14 LUFS / −1 dBTP / LRA 11) |
| tempo (05, 29 s de vídeo, M4 10 núcleos) | 13 s (14–22 s com a máquina carregada; `--draft` antigo: 35–60 s) | ~70 s |

Os valores vêm de `quality.preview` / `quality.export` do estilo (`edit/style.resolved.json`);
`resolution` aceita `720p` (lado menor, 9:16) ou `WxH`; `codec` `h264` ou `hevc` (libx265, `hvc1`).
Com AAC abaixo de 192k o limiter ganha 2 dB de folga (o codec passa do pico).

Flags: `--quality preview|final`, `--from-preview` (usa `edit/compose.resolved.json`: o export
sai igual ao último preview; spec antigo sem `_quality` + `edit/compose.json` → usa o
`compose.json`), `--spec <arquivo>`, `--out`, `--music <arquivo>|none`, `--progress`
(`TAKEKIT_PROGRESS=<0..1>`: medição ~8 %, encode por frame, verificação = 1), `--dry-run`
(spec em `edit/.work/compose.dry-run.json` + comando). `--draft` = `--quality preview` (obsoleto).
Última linha do stdout: `TAKEKIT_PREVIEW=<mp4>` ou `TAKEKIT_EXPORT=<mp4>` (caminho absoluto).

```bash
$PY video/headless/compose.py --project <p> --progress                                   # preview (UI)
$PY video/headless/compose.py --project <p> --quality final --from-preview --progress    # botão Exportar
```

## Estilo da thread: `edit/style.resolved.json`

O engine grava a cada job e antes de cada render: `modules` (presets de `styles/_presets/`
escolhidos na thread) e `quality`. Sem o arquivo, ou sem uma chave, vale o Talking Head + Motions.

| módulo | quem lê | efeito |
|---|---|---|
| `caption` | `captions_palco.py`, `caption_jobs.py`, `caption_preview.py` | fonte, tamanho, caixa, tracking, cores, contorno, sombra, caixa de fundo, animação, lead; palavras/caracteres por bloco |
| `stage` | `compose.py`, `caption_jobs.py` | geometria do palco D; layout + y da legenda por palco (`safeZones.caption`) |
| `cuts` | `tighten_cuts.py` | `tighten.threshDb` / `padFrames` (`--thresh` / `--pad` ganham) |
| `soundEffects` | `compose.py`, `map_sfx_cues.py` | `sfx: false` desliga o sfx_map; `music` (arquivo relativo a `video/kit/`, `gainDb`, `duck`; null = sem cama; `--music` ganha); `kindToCatalogId` |
| `transitions` | `compose.py` | `filmburn: null` = nenhum burn; `hook`; `onStageChange` `marked` (beats marcados) ou `all` (toda troca de palco) |
| `camera` | `compose.py` → `camera.py`, `camera_preview.py` | punch / zoom in / zoom out e face tracking no a-roll dos palcos A e D (abaixo); null ou `parada` = nada muda |

Legendas: `captions_palco.py --job edit/job_<face|canvas|hold>.json --style video/kit/styles/palco-<layer>.json
--out edit/overlay/captions_<layer>.mov` pega o preset do `style.resolved.json` ao lado do job
(`--preset <arquivo>|none` sobrescreve) e imprime `preset de legenda: <nome> (<id>)`. `position.y`
vale só para blocos de palco A; o hold/CTA mantém tamanhos, cores e y e pega fontes, contorno e
animação. Sem preset o render é o de antes (bit a bit). Prévia do caption builder, sem projeto:
`video/kit/engine/caption_preview.py --preset <json|-> --text "Isso muda *tudo*" --layout face|canvas
--bg dark|cream|<imagem> --out x.png [--at settled|<frame>] [--clip x.mp4]` (~0,1 s por still).

## Câmera (punch, zoom, face tracking)

Módulo `camera` do estilo (`styles/_presets/camera/<id>.json`): `moves` (punch|zoomIn|zoomOut,
em rodízio), `intensity` (escala máxima; 1.0 = nenhuma), `frequency` (marcado|poucos|medio|muitos),
`punchFrames`, `faceTracking {enabled, baseScale, smoothing}`, `applyTo` (A e/ou D). O compose chama
o `camera.py` sozinho; sem preset, preset `parada` ou nenhum frame com crop, spec e comando saem
iguais aos de antes (conferido byte a byte no 05).

```bash
$PY video/headless/camera.py --project <p> [--preset <arquivo>|<json>|-] [--plan-only] [--force] [--progress]
$PY video/headless/camera_preview.py --preset <arquivo>|<json>|- --footage <vídeo> --out clip.mp4 \
    [--size 540x960] [--seconds 6] [--start 2]
```

- **Plano** (por unidade do `cuts.json`, só nos palcos de `applyTo`): `"camera": "punch" | "zoom_in" |
  "zoom_out" | "none"` no beat do storyboard sempre ganha (é a marca de ênfase do agente;
  `marcado` = só essas). Sem marca, pela frequência: um movimento a cada ~6 s (poucos), ~3,5 s
  (medio) ou ~2 s (muitos) de tempo em A/D, no máximo um por unidade, alternando os `moves`;
  unidades curtas ficam de fora (punch < 10 f, zoom < 20 f). Determinístico.
- **Movimentos**: punch 1.0 → intensity em `punchFrames` no começo da unidade e segura até o corte
  (a próxima volta à base); zoomIn 1.0 → intensity ao longo da unidade (ease in-out); zoomOut
  intensity → 1.0 (ease out). Com tracking, tudo × `baseScale` (crop fixo que segue o rosto).
- **Enquadramento**: o rosto vai para o centro na horizontal, na altura mediana em que já está
  no quadro; suavização de fase zero (EMA ida e volta com `smoothing`, zerada a cada corte);
  janela sempre dentro da fonte (sem borda preta). Sem tracking, pivot na linha dos olhos
  (0.5, 0.36 do topo, a do punch aprovado no 02).
- **Rosto**: [Ultra-Light-Fast-Generic-Face-Detector-1MB](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB)
  `version-RFB-320.onnx` (MIT, 1,2 MB, sha256 conferido, `~/.cache/takekit/models/`, ou
  `TAKEKIT_FACE_MODEL`), a cada 3 frames num quadro 320×240, maior rosto. Sem o modelo: topo da
  máscara do RVM; sem os dois: pivot fixo, com aviso.
- **Render**: só vídeo, ProRes 422 HQ, mesmos frames e fps do `aroll.mov`; crop bicúbico subpixel
  nos planos YUV 10 bits (sem converter cor), em paralelo. O compose lê o `aroll_cam.mov` só nas
  unidades com crop (as outras seguem do `aroll.mov`, bit a bit como antes) e no host do D; áudio do
  `aroll.mov`. Preview e final usam o mesmo render.

Em `edit/camera/`: `face_track.json` (rosto, cache por tamanho + mtime do `aroll.mov`), `moves.json`
(`[{unit, palco, move, from, to, startFrame, endFrame, by}]`, `by` = `beat`|`auto`; o mesmo vai em
`compose.resolved.json` → `camera`, a trilha CÂMERA da timeline), `aroll_cam.mov` e `stamp.json`
(hash do plano quadro a quadro + a-roll: o render só refaz quando muda). `camera_render` no spec
guarda vídeo, unidades, stamp e o preset, para o `--from-preview` refazer o mesmo plano.
Spec à mão (`--spec edit/compose.json`) sem `camera` recebe a câmera do estilo, só nas unidades A/D
do próprio spec (trocar o preset na UI refaz o preview também nesses projetos); `"camera": null`
no spec desliga, e unidades diferentes das do `cuts.json` ficam sem câmera.
`camera.py --progress` imprime `TAKEKIT_PROGRESS`; a última linha é `TAKEKIT_CAMERA=<aroll_cam.mov>`
ou `TAKEKIT_CAMERA=none`. No compose, o render entra no `--progress` (até 30 % do preview, 12 % do final).

`camera_preview.py` (cards do módulo na UI): `--seconds` do vídeo a partir de `--start` (puxado
para trás no fim), 9:16 cover, corte simulado a cada 1,5 s, mesmo plano (o 1º movimento cai no
corte de 1,5 s; com `marcado`, o 2º trecho conta como marcado com o 1º movimento). Sem áudio,
H.264 faststart.

| tempo (M4, 05: 29 s, 4 unidades A) | |
|---|---|
| rosto (1ª vez; depois cache) | 2 s (plano B com RVM: ~8 s) |
| plano | < 0,1 s |
| render `aroll_cam.mov` (866 frames) | 6–8 s (só na 1ª vez de cada plano) |
| preview do compose com câmera | + o render na 1ª vez de cada plano; depois ~1 s a mais que sem câmera (15,5 × 14,1 s) |
| final (`--from-preview`) | reusa o render do preview (36 s no espelho sem cama/burn) |
| `camera_preview.py` 6 s | 1,3 s sobre o `aroll.mov`; 2,8 s sobre o HEVC 4K do iPhone |

## Palco D (split)

Beat com `"palco": "D"` no storyboard: B-roll na faixa de cima (cover), a-roll da unidade
recortado na de baixo, emenda branca; geometria de `styles/_presets/stage/d-split.json`
(`bRoll.band`, `host.band`, `host.cropY` = topo da janela 1080×958 no a-roll, `seam`). B-roll:
campo `broll` do beat (relativo ao projeto ou absoluto; vídeo ou imagem) com `broll_start`
opcional em segundos, senão `edit/broll/<unidade>.{mov,mp4,png,jpg,jpeg}`; sem B-roll o
compose para com erro. Imagem entra com `-loop 1`. Legenda do D: layout face na emenda (y 960),
via `caption_jobs.py`. Canvas `<u>_D.mov`, se existir, vai por cima.

## N vídeos em paralelo

```bash
$PY video/headless/batch.py --jobs 3 video/projects/a video/projects/b video/projects/c
$PY video/headless/batch.py --steps compose --compose-args "--quality final" video/projects/a video/projects/b
```

O compose do batch sai em preview por default; `--compose-args "--quality final"` (ou
`"--quality final --from-preview"`) para o export.

Cada projeto é um processo que só escreve no próprio `edit/` e `exports/` (trabalho
temporário em `edit/.work/`, fora do git). O batch divide os núcleos entre os jobs
(`TAKEKIT_JOB_THREADS`; o engine pode definir `TAKEKIT_MAX_JOBS`). O único recurso
compartilhado é o modelo RVM, só leitura e baixado com rename atômico.

## Validação: 09-jev v3 (export aprovado) × headless

Mesma fonte, mesmos cortes, canvases e captions do v3; host do palco B refeito com RVM.
Comparação frame a frame dos 988 frames:

| | PSNR médio | SSIM médio |
|---|---|---|
| palco A | 47,2 dB | 0,992 |
| palco B (host RVM) | 34,6 dB | 0,992 |
| palco B (com os hosts do v3, controle) | 40,6 dB | |
| palco C | 47,9 dB | 0,999 |
| total | 42,5 dB | 0,995 |

- Nenhum frame com diferença de luminância média > 2 (os 4 filmburns caem no frame exato).
- A diferença do palco B é a máscara: RVM × máscara do v3 no recorte (IoU 0,94–0,99; visualmente
  igual). O compositor reproduz o empilhamento do v3 (controle: 40,6 dB).
- Áudio: −14,1 LUFS (v3: −14,5); loudness de 3 s acompanha o v3 com correlação 0,994
  (diferença média 0,44 LU).
- Tempo (M4, 10 núcleos, 33 s de vídeo): trim 24 s, palco B 112 s (8 beats), export 55 s.
- 3 cópias do 09-jev com `batch.py --jobs 3`: 688 s, as três ok e isoladas (host RVM bit-idêntico
  entre elas; exports a 54–62 dB entre si, diferença de encode). Numa máquina só o total fica
  perto do sequencial (~3 × 190 s): cada etapa já usa todos os núcleos. O ganho do paralelo é não
  haver fila de projetos; throughput escala com mais máquinas ou GPU.

## Sem port ainda

Shake, intro zoom com blur e os splits dos formatos 03/04 não têm implementação headless; precisam
de port próprio antes de voltar a um vídeo. O punch voltou como módulo `camera` (acima).
