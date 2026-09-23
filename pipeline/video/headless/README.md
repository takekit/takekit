# Pipeline headless (sem DaVinci Resolve)

O Resolve saiu do pipeline em 23/09/2026. O estilo default (Talking Head + Motions) roda inteiro por linha de
comando, sem GUI, e vários vídeos rodam ao mesmo tempo. Visual e som do 09-jev mantidos
(validação abaixo). Pasta `video/resolve/` continua com docs, presets, estilos e motores;
o nome é histórico.

## Setup (uma vez)

```bash
# a partir da raiz do pipeline (pipeline/, o cwd do agente)
bash video/headless/setup.sh          # .venv com numpy, pillow, onnxruntime + modelo RVM
PY=.venv/bin/python
```

Precisa de `ffmpeg`/`ffprobe` no PATH. O modelo `rvm_mobilenetv3_fp32.onnx` (15 MB, sha256
conferido) fica em `~/.cache/takekit/models/`, compartilhado entre jobs.
Cama e filmburn não estão no repo ([assets/OMITTED.md](../resolve/assets/OMITTED.md)):
`export TAKEKIT_ASSETS=<ai-content-agent>/video/resolve/assets`. Sem eles o export sai
sem cama/burn e avisa.

## Cadeia do 09-jev

Comandos a partir da raiz do pipeline, projeto em `video/projects/<slug>`.

| etapa | antes (Resolve) | agora |
|---|---|---|
| Fala | Whisper → `tighten_cuts.py` → `AppendToTimeline` | Whisper → `tighten_cuts.py` → **`trim.py`** (FFmpeg) |
| Palco B | DepthMap renderizado no Resolve + `palco_b_composite.py` | **`palco_b.py`**: RVM + `palco_b_composite.py` |
| Captions, motion, SFX | sem Resolve já | sem mudança: `captions_palco.py`, `motion/render.py`, `map_sfx_cues.py --prep` |
| Export | render do Resolve | **`compose.py`** (FFmpeg) |
| Captura para revisão | `capture_frame.py` (still do Resolve) | **`frame.py`** (FFmpeg) |

```bash
$PY video/headless/trim.py    --project video/projects/<slug>        # edit/aroll.mov + aroll.json + voice.wav
$PY video/headless/palco_b.py --project video/projects/<slug>        # edit/overlay/hostB_<u>.mov (beats B)
$PY video/headless/compose.py --project video/projects/<slug>        # exports/<slug>-vN.mp4
$PY video/headless/frame.py   --project video/projects/<slug> --at 72 --at 00:00:10:00 --sheet
```

- **trim.py**: um passe de decodificação, corte no frame exato do `cuts.json` (fim exclusivo),
  microfade de 4 ms por emenda, fonte escalada para 1080×1920. Voz em `edit/voice.wav` serve
  de referência para o `sfx_prep.py` (`map_sfx_cues.py --voice edit/voice.wav --prep`).
- **matte.py**: RVM (ONNX, CPU; mais rápido que CoreML no M4) sobre qualquer trecho;
  aquece o estado recorrente no 1º frame. O `palco_b.py` usa ele por baixo. Corte duro
  do alfa em 128 (`--thresh`); o DepthMap legado era luma 72.
- **compose.py**: por unidade, palco do storyboard do `plan.json` (beat ↔ unidade na ordem,
  ou campo `unit`). A = trecho do `aroll.mov`; B = `hostB_<u>.mov` + canvas `<u>_B.mov`;
  C = creme + canvas `<u>_C.mov`. Canvas procurado em `edit/overlay`, `edit/motion/out`,
  `edit/motion`, `edit/motion-v2`. Por cima: `edit/overlay/captions_{face,canvas,hold}.mov`
  e o filmburn do preset `fx/filmburn-hook` em Screen, com o pico no corte: no gancho
  sempre e em cada beat com `"transicao": "filmburn"` no storyboard. Áudio: voz + SFX
  (`edit/sfx_map.json` → `edit/sfx_prep/`) + som do burn + cama trap-hype −25 dB com
  ducking pela voz; loudnorm em dois passes para −14 LUFS / −1 dBTP. Vídeo H.264
  1080×1920@30, 10 Mbps (máx. 12), AAC 256k. `--draft` para revisão rápida.
  O spec derivado vai para `edit/compose.resolved.json`; exceção do vídeo = copiar para
  `edit/compose.json`, editar e passar `--spec edit/compose.json`.
- **frame.py**: frame, `hh:mm:ss:ff` ou `2.4s`; seek preciso. Um still não valida
  movimento, áudio nem cortes (WORKFLOW §5).

## N vídeos em paralelo

```bash
$PY video/headless/batch.py --jobs 3 video/projects/a video/projects/b video/projects/c
```

Cada projeto é um processo que só escreve no próprio `edit/` e `exports/` (trabalho
temporário em `edit/.work/`, fora do git). O batch divide os núcleos entre os jobs
(`TAKEKIT_JOB_THREADS`; o engine pode definir `TAKEKIT_MAX_JOBS`). O único recurso
compartilhado é o modelo RVM, só leitura e baixado com rename atômico.

## Validação: 09-jev v3 (Resolve) × headless

Mesma fonte, mesmos cortes, canvases e captions do v3; host do palco B refeito com RVM.
Comparação frame a frame dos 988 frames:

| | PSNR médio | SSIM médio |
|---|---|---|
| palco A | 47,2 dB | 0,992 |
| palco B (host RVM) | 34,6 dB | 0,992 |
| palco B (com os hosts DepthMap do v3, controle) | 40,6 dB | |
| palco C | 47,9 dB | 0,999 |
| total | 42,5 dB | 0,995 |

- Nenhum frame com diferença de luminância média > 2 (os 4 filmburns caem no frame exato).
- A diferença do palco B é a máscara: RVM × DepthMap no recorte (IoU 0,94–0,99; visualmente
  igual). O compositor reproduz o empilhamento do Resolve (controle: 40,6 dB).
- Áudio: −14,1 LUFS (v3: −14,5); loudness de 3 s acompanha o v3 com correlação 0,994
  (diferença média 0,44 LU).
- Tempo (M4, 10 núcleos, 33 s de vídeo): trim 24 s, palco B 112 s (8 beats), export 55 s.
- 3 cópias do 09-jev com `batch.py --jobs 3`: 688 s, as três ok e isoladas (host RVM bit-idêntico
  entre elas; exports a 54–62 dB entre si, diferença de encode). Numa máquina só o total fica
  perto do sequencial (~3 × 190 s): cada etapa já usa todos os núcleos. O ganho do paralelo é não
  haver fila no Resolve; throughput escala com mais máquinas ou GPU.

## Fora do escopo headless

Resolve, MCP do Resolve e Fusion não existem mais no fluxo. Scripts que dependiam deles
ficaram como legado, marcados no topo: `pipeline/build_timeline.py` (build.json → timeline
do Resolve, formatos 03/04), `pipeline/capture_frame.py`, `pipeline/apply_broll_parallax.py`,
`scripts/Edit/legendas_launcher.py`, `engine/palco_layout.py`, `engine/fusion_motion.py`,
`engine/native_scenes.py`, além de [API-NOTES.md](../resolve/API-NOTES.md) e
[FUSION.md](../resolve/FUSION.md). Recursos que só existiam no Resolve (punch/shake,
intro zoom, splits do build.json) precisam de port próprio antes de voltar a um vídeo.
