# Takekit — StyleKit (gerenciador de estilos)

**Status:** expansão / prioridade **baixa**  
**Quando:** só **depois** do pipeline headless sem DaVinci Resolve e da cobaia do Jev (fluxo chat → CI → pipeline → mp4) passar.  
**Não é MVP.** Anotar no roadmap; não implementar agora.

Relacionado: [SPEC.md](./SPEC.md) (§ estilo portátil), [DEV_SPEC_MVP.md](./DEV_SPEC_MVP.md), [PIPELINE.md](./PIPELINE.md).

---

## 1. Visão

StyleKit é o gerenciador de **estilos** do Takekit. Cada estilo é um **pacote versionável em disco** (não “preset preso no Resolve”). O operador escolhe um estilo na UI; o engine injeta o briefing do estilo no CI e passa os assets (LUT, cuts, caption, SFX) como contexto do job.

Hoje o estilo 09-jev vive em `pipeline/video/resolve/DEFAULT.md` + scripts. StyleKit generaliza isso: vários pacotes em `styles/` (ou `~/.takekit/styles/`), aplicáveis a qualquer thread.

---

## 2. Pacote de estilo (layout)

Cada estilo = uma pasta:

```
styles/<styleId>/
  meta.json          # id, nome, descrição, createdAt, updatedAt, thumbnail
  prompt.md          # system/briefing injetado no CI
  lut/               # .cube / .3dl (FFmpeg lut3d)
  cuts.json          # regras de trim / tighten (thresholds, gaps, etc.)
  caption.json       # tipografia, posição, timing defaults
  sfx.json           # mapeamento de hits / pacote SFX
  preview.mp4        # loop curto pra thumbnail / painel de detalhe
```

### 2.1 `meta.json` (schema mínimo)

```json
{
  "id": "09-jev",
  "name": "09 — Jev",
  "description": "Estilo creator Shorts do Jev",
  "thumbnail": "preview.mp4",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### 2.2 Semântica dos arquivos

| Arquivo | Uso |
|---------|-----|
| `prompt.md` | Texto injetado no **system / preâmbulo** do prompt do CI (antes do pedido do usuário) |
| `lut/` | Passado ao pipeline headless (FFmpeg `lut3d`); paths absolutos no contexto do job |
| `cuts.json` | Parâmetros pro `tighten_cuts` / trim fino |
| `caption.json` | Defaults do gerador de legendas |
| `sfx.json` | Prep / catálogo de SFX do estilo |
| `preview.mp4` | Preview em loop na UI (não é o export do projeto) |

Estilo **default do produto:** portar o 09-jev para este layout quando StyleKit for implementado (sem mudar o visual).

---

## 3. UI (sidebar esquerda)

Abaixo de **Nova thread** e **Buscar**, seção **Estilos**:

- Lista com **thumbnail** (frame ou vídeo pequeno), **nome**, botão **Aplicar**
- Clique no item → **painel de detalhe**:
  - Preview em **loop** (`preview.mp4`)
  - Botões: **Aplicar** | **Duplicar** | **Exportar** | **Excluir**
- Botão **+** → cria estilo novo (pasta vazia/template + `meta.json` + `prompt.md` stub)

**Aplicar** na thread ativa: seta `thread.styleId` (e persiste). Não muda mídia do projeto sozinho.

---

## 4. Engine / CI

Quando um job roda:

1. Resolve `styles/<styleId>/` (ou path configurado).
2. Lê `prompt.md` e **injeta** no system / preâmbulo do prompt do executor (Claude Code / outros).
3. Anexa contexto estruturado: paths de `lut/`, conteúdo ou paths de `cuts.json`, `caption.json`, `sfx.json`.
4. Pipeline headless consome esses arquivos (não Resolve).

Pseudocontrato (ilustrativo):

```ts
interface StylePackage {
  id: string;
  root: string;
  promptMarkdown: string;
  lutPaths: string[];
  cuts: object;
  caption: object;
  sfx: object;
  previewPath: string | null;
}
```

---

## 5. Fora de escopo

- Marketplace de estilos
- IA gerando estilos automaticamente
- Versionamento avançado (git de estilos, semver, diff visual)

Exportar = zip da pasta do pacote. Importar pode ser fase 2 (não obrigatório nesta spec).

---

## 6. Prioridade e dependências

1. Pipeline **sem DaVinci** (FFmpeg + RVM + etapas já headless)  
2. Cobaia do Jev ponta a ponta (chat → CI → mp4 no preview)  
3. **Só então** StyleKit (esta spec)

Até lá: um único estilo efetivo via `pipeline/video/resolve/DEFAULT.md` / `styleId: "09-jev"` no MVP.

---

## 7. Critérios de aceite (quando for a hora)

- [ ] Pacote em disco no layout da §2; 09-jev migrado como primeiro estilo
- [ ] Seção Estilos na sidebar com thumbnail, nome, Aplicar, +
- [ ] Painel detalhe com preview loop + Aplicar/Duplicar/Exportar/Excluir
- [ ] Job do CI recebe `prompt.md` + paths JSON/LUT do estilo aplicado
- [ ] Sem marketplace / gerador IA / versionamento

---

## 8. Nota

StyleKit é **expansão de produto**, não bloqueio do MVP cobaia. Implementar só com sinal explícito depois das dependências da §6.
