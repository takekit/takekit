# Preview / Export — Spec

Spec do pipeline de preview rápido + export final sob demanda. Complementa docs/PIPELINE.md e a skill editor-reels.

## Problema

Hoje, a cada revisão, o creator espera o render final completo (1080×1920@30 H.264) pra validar cortes, legendas e palco. Isso trava o loop de iteração.

## Solução

Dois estágios. Preview (rápido, leve, durante a edição) e export final (qualidade cheia, só quando o creator aprova).

### Estágio 1 — Preview

Dispara ao final de cada iteração ou botão "Gerar preview". Resolução 720p, bitrate baixo, codec rápido. Usa os mesmos scripts com flag `quality=preview`. Tempo alvo <30s pra reel de 30s. Não é pipeline diferente.

### Estágio 2 — Export final

Não roda automaticamente. Fica parado até o creator clicar "Exportar". 1080×1920@30 H.264, −14 LUFS, qualidade máxima ou a que o estilo definir. Mesmos scripts sem flags de redução. Gera em `projects/<slug>/exports/`.

## Pipeline

O pipeline de edição (Whisper → tighten_cuts → timeline → palco → captions → motion → SFX → montagem) permanece idêntico. A diferença é só o ponto de parada: hoje roda até export final sempre; agora roda até preview, export final é passo separado explícito.

## Estados na UI

- **Editando** — preview atualizado ou botão
- **Preview pronto** — miniplayer + botão Exportar habilitado
- **Exportando** — barra de progresso
- **Export pronto** — link/download, preview continua

## Parâmetros default de preview

| Parâmetro | Default |
| --------- | ------- |
| resolution | 720p |
| codec | h264 |
| preset | veryfast |
| bitrate | 1.5 Mbps |
| audio | AAC 128kbps |
| container | mp4 |

Creator pode sobrescrever no estilo.

## Aceite

- Preview <30s pra reel 30s
- Export final só com clique
- Mesmos scripts nos dois estágios
- Preview na sidebar sem bloquear edição
- Sem clique = nada de arquivo final

## Implementação

- **Mesmo script, flag de qualidade:** `video/headless/compose.py --quality preview|final`
  (default `preview`; `--draft` virou alias). O preview compõe o grafo inteiro já em 720×1280
  (cada camada escalada logo na entrada) e usa loudnorm de um passo; o final mantém 1080×1920 e
  loudnorm em dois passos. Os intermediários (a-roll, palco B, canvases, legendas, SFX) são os
  mesmos: o export final não re-roda o pipeline, só recompõe em qualidade cheia.
- **Saídas:** preview em `edit/preview.mp4` (sobrescreve, escrita atômica); final em
  `exports/<slug>-vN.mp4`. Última linha do stdout: `TAKEKIT_PREVIEW=<abs>` ou
  `TAKEKIT_EXPORT=<abs>`; com `--progress`, linhas `TAKEKIT_PROGRESS=<0..1>`.
- **Mesmo spec:** todo render grava `edit/compose.resolved.json` com o spec usado (`_quality`,
  e `_source` quando veio de um `edit/compose.json` escrito à mão). `--from-preview` reusa esse
  spec, então o export final é o que o preview mostrou. Projetos de antes (sem `_quality`) com
  `compose.json` usam o `compose.json`.
- **Qualidade por estilo:** `styles/<id>/quality.json` (`preview` e `export`), gravada pelo engine
  em `edit/style.resolved.json`; sem ela, os defaults da tabela acima e 1080×1920@30 H.264
  10 Mbps / −14 LUFS no final. AAC abaixo de 192k ganha 2 dB de folga no limitador (o encode
  de 128k passava o pico para +1,2 dBTP).
- **Agente:** o prompt do job e a skill editor-reels pedem o preview e proíbem o final;
  o engine acha o preview pelo marcador ou por `edit/preview.mp4` recente.
- **Botão:** [SPEC-BUTTON.md](./SPEC-BUTTON.md#implementação).

### Medido (projeto 05, reel de 29 s, Mac de 10 núcleos com outros apps abertos)

| | antes | agora |
|---|---|---|
| preview (`--draft` antes) | 40–60 s | 12,6–21,6 s (15 s pelo job, de ponta a ponta) |
| export final | 87 s | 44–72 s, 1080×1920, 10 Mbps, −14,0 LUFS / −0,9 dBTP |

O preview bate com o draft antigo frame a frame (PSNR mínimo 40,5 dB); o comando do final é
idêntico ao anterior, fora os valores de loudness.

### Aceite

- [x] Preview < 30 s para reel de 30 s
- [x] Export final só com clique
- [x] Mesmos scripts nos dois estágios
- [x] Preview na sidebar sem bloquear edição
- [x] Sem clique = nada de arquivo final
