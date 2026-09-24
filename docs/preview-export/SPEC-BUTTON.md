# Botão de Export no Preview — Spec

Spec do controle de UI que dispara o export final. Complementa SPEC.md — cobre só a interface.

## Princípio

Export final é ação do creator, não do agente. O agente já montou o pipeline e os scripts. Exportar é rodar o comando existente. O botão mora no preview, não numa tela separada.

## Onde

Sidebar direita, junto ao preview. Botão **[ Exportar vídeo final ]**. Habilitado só com preview pronto. Desabilitado durante edição ou enquanto preview renderiza. Ao clicar: dispara Estágio 2 com qualidade do estilo.

## Comportamento

1. Creator clica.
2. Barra de progresso no lugar do botão.
3. Engine roda export final 1080p usando scripts já montados.
4. Conclui: botão volta + notificação com download.
5. Preview permanece — pode exportar de novo.

## Não faz

Não passa pelo agente, não cria thread, não re-roda pipeline, não bloqueia sidebar.

## Estados

- **Sem preview** — desabilitado
- **Preview pronto** — habilitado
- **Exportando** — spinner
- **Pronto** — toast + volta ao estado

## Qualidade

Exporta na qualidade final do estilo. Estilo define `exportQuality` `{resolution, codec, bitrate, audio}`. Sem definição = default 1080×1920@30, −14 LUFS.

## Aceite

- Botão na sidebar direita
- Desabilitado sem preview
- Clique dispara sem agente
- Progresso visível
- Preview permanece
- Qualidade respeita estilo ou default

## Relacionados

- [SPEC.md](./SPEC.md)
- [../style-kit/SPEC.md](../style-kit/SPEC.md)
- [../style-kit/SPEC-EXPANSION.md](../style-kit/SPEC-EXPANSION.md)
- [../PIPELINE.md](../PIPELINE.md)

## Implementação

- **UI:** `apps/harness/src/components/ExportBar.tsx`, logo abaixo do player no painel direito.
  Estados: sem preview / agente editando / preview re-renderizando → desabilitado, com o motivo
  embaixo; habilitado mostra a qualidade do estilo (`1080×1920@30 · H.264 10 Mbps · −14 LUFS`);
  exportando → barra de progresso no lugar do botão (porcentagem + cancelar); pronto → toast
  "Export pronto" com **Mostrar no Finder** e a linha do último export (nome, há quanto tempo,
  Finder, Baixar fora do app desktop). Falha → mensagem na linha do último export.
- **Engine:** `POST /api/threads/:id/export` (`engine/src/renders.ts`) roda, sem agente e sem
  thread nova, `compose.py --project <p> --quality final --from-preview --progress`: o spec
  exato do último preview (`edit/compose.resolved.json`), na qualidade final do estilo, em
  `exports/<slug>-vN.mp4`. Progresso pelas linhas `TAKEKIT_PROGRESS=`, arquivo pela
  `TAKEKIT_EXPORT=`. `GET /api/threads/:id/render` (polling), `/render/cancel`,
  `/export/file` (download), `/export/reveal` (Finder). O resultado fica em `thread.lastExport`;
  `previewPath` não muda, então dá para exportar de novo.
- **Qualidade:** `styles/<id>/quality.json` → `export {resolution, fps, codec, bitrate, maxrate,
  bufsize, audio {codec, bitrate, loudness}}`. Sem o arquivo: 1080×1920@30, H.264 10 Mbps,
  −14 LUFS. O engine grava a qualidade da thread em `edit/style.resolved.json` antes de rodar.
- **Não bloqueia:** a sidebar e o chat seguem livres. Uma mensagem mandada durante o export vira
  job normalmente, mas espera o export terminar antes de mexer no projeto.

### Aceite

- [x] Botão na sidebar direita
- [x] Desabilitado sem preview
- [x] Clique dispara sem agente
- [x] Progresso visível
- [x] Preview permanece
- [x] Qualidade respeita estilo ou default
