# Style Kit — Spec canônica

Documento único do Style Kit no Takekit. Substitui o rascunho antigo `docs/SPEC_STYLEKIT.md` (apagado).

**Nomenclatura:** o estilo atual é **Talking Head + Motions**, id **`talking-head-motions`**. Antes era chamado de “default 09-jev” (nome do vídeo onde foi aprovado; em áudio pode sair “GEV” / “09-gev”). `09-jev` ficou como **alias**: threads antigas com `styleId: "09-jev"` resolvem para o pacote novo. O projeto/vídeo `09-jev` continua com esse nome; só o estilo mudou de nome.

***

## Objetivo

**Style Kit** é o **produto**: galeria de estilos + pacote em disco que o agente/engine consomem. Cada estilo deixa de ser um default hardcoded (o antigo `09-jev` / `DEFAULT.md`) e vira item de uma galeria; o Talking Head + Motions é o primeiro.

**Modo estúdio** é só a **interface** (onde a galeria e o seletor aparecem no harness). Esta spec define o produto Style Kit; não inventa outro produto paralelo.

***

## Fase 1 — implementar agora

1. Migrar o estilo hardcoded (antigo `09-jev`) para o pacote `styles/talking-head-motions/` na galeria, com o **schema completo** abaixo (campos sem valor ainda ficam vazios/`null`/lista vazia).
2. **Galeria** na sidebar esquerda, **abaixo de “Nova thread”** (nome + preview se houver).
3. **Seletor de estilo** no fluxo de **nova thread** (antes fixo em `09-jev`): lista a galeria e grava `styleId` na thread.
4. Agente/CI leem o pacote pelo `id` — **não** assumir DEFAULT hardcoded depois da migração.

**Fora da Fase 1:** criar estilo a partir de vídeos; painel rico com Aplicar / Duplicar / Exportar / Excluir / botão + (nota futura, se precisar).

***

## Schema do pacote

Modelo **completo desde a v1**, sem overengineering. Fase 1 popula o `talking-head-motions`; o resto pode nascer vazio.

```ts
interface StyleKit {
  /** Id estável, imutável (= nome da pasta). Ex.: "talking-head-motions". */
  id: string;

  /** Nome exibível, mutável. Ex.: "Talking Head + Motions". */
  name: string;

  /** Ids antigos que ainda resolvem para este estilo. Ex.: ["09-jev"]. */
  aliases: string[];

  /** Preview curto (loop / thumbnail). */
  previewVideoPath: string | null;

  /** Briefing injetado no CI (system / preâmbulo). */
  promptMarkdown: string | null;

  /** Storyboard / descrição do estilo. */
  storyboard: string | null;

  /** Sound effects: cues, catálogo, paths. */
  soundEffects: object | null;

  /** Transições (corte seco, filmburn, etc.). */
  transitions: object | null;

  /** Esquema de palco / cenário (A/B/C, layouts, safe zones). */
  stageScheme: object | null;

  /** Regras de trim / tighten. */
  cuts: object | null;

  /** Defaults de legenda (tipografia, posição, timing). */
  caption: object | null;

  /** Paths de LUT (.cube / .3dl) para FFmpeg lut3d. */
  lutPaths: string[];

  /** Entrypoints da engine que o agente usa. */
  engineScripts: {
    entries: string[];
    byName?: Record<string, string>;
  } | null;

  createdAt: string;
  updatedAt: string;
}
```

### Layout em disco

```
styles/<id>/
  meta.json              # id, name, aliases, datas, previewVideoPath (relativo à pasta)
  prompt.md              # briefing do CI
  storyboard.md          # descrição / storyboard
  sound-effects.json
  transitions.json
  stage-scheme.json
  cuts.json
  caption.json
  engine-scripts.json
  lut/                   # .cube / .3dl (opcional)
  preview.mp4            # opcional; loop curto (thumbnail sai dele)
```

Pasta segue o **`id`**, nunca o nome (`styles/talking-head-motions/`, não `styles/Talking Head + Motions/`).

Caminhos dentro dos arquivos do pacote são relativos à raiz do pipeline (cwd do agente); assets, relativos a `video/kit/` (ou `TAKEKIT_ASSETS`).

### Mapeamento legado → Style Kit (orientação)

| Campo          | Fonte atual                                         |
| -------------- | --------------------------------------------------- |
| id / name      | `talking-head-motions` / “Talking Head + Motions” (alias `09-jev`) |
| promptMarkdown | `DEFAULT.md` / preâmbulo do estilo                  |
| storyboard     | `DEFAULT.md` + trechos de estilo-creator / WORKFLOW |
| soundEffects   | pipeline SFX / map\_sfx\_cues / catálogo            |
| transitions    | filmburn / corte seco no DEFAULT                    |
| stageScheme    | palcos A/B/C, layouts                               |
| cuts           | parâmetros tighten\_cuts / trim                     |
| caption        | defaults do gerador de legendas                     |
| lutPaths       | LUTs do estilo (quando existirem)                   |
| engineScripts  | scripts citados pelo DEFAULT / skill                |
| preview        | recorte de 9 s do export `09-jev-v3` (palcos B, C, B e o CTA) |

***

## Regras id vs nome

1. **`id` imutável** — criado uma vez; threads, projetos e paths usam só o `id`.
2. **`name` mutável** — UI e labels; rename **não** migra pasta nem quebra jobs.
3. Nova thread **escolhe** um estilo da galeria (default sugerido: `talking-head-motions`).
4. Fase 1 **não** cria estilo a partir de vídeos (isso é Fase 2).
5. Mudar um id que já existe: o id antigo entra em `aliases` do pacote, e as threads que o usam continuam funcionando.

***

## UI (Fase 1 — mínimo)

| Onde                             | O quê                                                       |
| -------------------------------- | ----------------------------------------------------------- |
| Sidebar, abaixo de “Nova thread” | Galeria **Estilos** (nome + thumbnail; hover mostra o loop do preview; clique abre nova thread com o estilo) |
| Fluxo de **nova thread**         | Seletor listando a galeria; persiste `styleId`              |

Ações ricas (Aplicar na thread ativa, Duplicar, Exportar zip, Excluir, criar com +) ficam **fora** desta spec; podem voltar depois se fizer sentido.

***

## Fase 2 — roadmap (só documentar; não implementar agora)

* Criar estilo **novo** a partir de **2+ vídeos** de referência.
* Agente decompõe em storyboard e traduz para componentes da engine (SFX, transições, palco, cuts, caption, LUT, scripts).
* O estilo **cresce no tempo** (refinos) **sem** mudar o `id`.

Aceite futuro: sobe referências → nasce pacote com `id` novo → aparece na galeria → selecionável na nova thread.

***

## Critérios de aceite (Fase 1)

* [x] Existe `styles/talking-head-motions/` com schema completo; campos não migrados podem estar vazios, mas as chaves/arquivos existem.
* [x] Galeria na sidebar abaixo de “Nova thread”, com o Talking Head + Motions listado.
* [x] Nova thread tem seletor (não mais estilo único fixo no código).
* [x] Renomear o `name` não altera `id` nem quebra `styleId` existentes (threads com `09-jev` resolvem pelo alias).
* [x] Fase 2 só neste doc (roadmap), sem código de ingestão por vídeo.

## Implementação (Fase 1)

* Engine: `engine/src/styles.ts` lê a galeria do disco a cada request (`TAKEKIT_STYLES_DIR`, default `styles/` na raiz). Rotas: `GET /api/styles`, `GET /api/styles/:id` (pacote completo), `/api/styles/:id/preview`, `/api/styles/:id/thumb`. `POST /api/threads` recusa `styleId` fora da galeria (400).
* Agente: o runner carrega o pacote pelo `styleId` da thread e injeta o `prompt.md` no prompt (`<style-brief>`), com o caminho do pacote para o resto. Estilo ausente da galeria = job falha com mensagem.
* Pipeline: `video/kit/DEFAULT.md` virou ponteiro para o pacote; a skill editor-reels lê o estilo da thread.

***

## Relacionados

* Produto: [SPEC.md](../SPEC.md) (§ estilo portátil)
* MVP cobaia: [DEV\_SPEC\_MVP.md](../DEV_SPEC_MVP.md)
* Pipeline: [PIPELINE.md](../PIPELINE.md)
* Expansão (módulos, presets, palco D, caption builder, criar estilo de referências): [SPEC-EXPANSION.md](./SPEC-EXPANSION.md)
* Preview / export final (`quality.json`): [../preview-export/SPEC.md](../preview-export/SPEC.md)
* Pacote: [styles/talking-head-motions/](../../styles/talking-head-motions/)
* Legado: `video/kit/DEFAULT.md` (agora ponteiro), skill editor-reels

