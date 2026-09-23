# Style Kit — Spec canônica

Documento único do Style Kit no Takekit. Substitui o rascunho antigo `docs/SPEC_STYLEKIT.md` (apagado).

**Nomenclatura:** no código/docs o estilo atual é **`09-jev`**. Em áudio pode sair “GEV” / “09-gev”; o **id estável** é `09-jev`. O **nome** exibível pode ser “Jev” (ou outro) sem mudar o id.

***

## Objetivo

**Style Kit** é o **produto**: galeria de estilos + pacote em disco que o agente/engine consomem. Cada estilo deixa de ser um default hardcoded (`09-jev` / `DEFAULT.md`) e vira o primeiro item de uma galeria.

**Modo estúdio** é só a **interface** (onde a galeria e o seletor aparecem no harness). Esta spec define o produto Style Kit; não inventa outro produto paralelo.

***

## Fase 1 — implementar agora

1. Migrar o estilo hardcoded `09-jev` para um pacote Style Kit na galeria, com o **schema completo** abaixo (campos sem valor ainda ficam vazios/`null`/lista vazia).
2. **Galeria** na sidebar esquerda, **abaixo de “Nova thread”** (nome + preview se houver).
3. **Seletor de estilo** no fluxo de **nova thread** (hoje fixo em `09-jev`): lista a galeria e grava `styleId` na thread/projeto.
4. Agente/CI leem o pacote pelo `id` — **não** assumir DEFAULT hardcoded depois da migração.

**Fora da Fase 1:** criar estilo a partir de vídeos; painel rico com Aplicar / Duplicar / Exportar / Excluir / botão + (nota futura, se precisar).

***

## Schema do pacote

Modelo **completo desde a v1**, sem overengineering. Fase 1 popula o `09-jev`; o resto pode nascer vazio.

```ts
interface StyleKit {
  /** Id estável, imutável. Ex.: "09-jev". */
  id: string;

  /** Nome exibível, mutável. Ex.: "Jev". */
  name: string;

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
  meta.json              # id, name, datas, previewVideoPath
  prompt.md              # briefing do CI
  storyboard.md          # descrição / storyboard
  sound-effects.json
  transitions.json
  stage-scheme.json
  cuts.json
  caption.json
  engine-scripts.json
  lut/                   # .cube / .3dl (opcional)
  preview.mp4            # opcional na v1
```

Pasta segue o **`id`**, nunca o nome (`styles/09-jev/`, não `styles/Jev/`).

### Mapeamento legado → Style Kit (orientação)

| Campo          | Fonte atual                                         |
| -------------- | --------------------------------------------------- |
| id / name      | `09-jev` / “Jev”                                    |
| promptMarkdown | `DEFAULT.md` / preâmbulo do estilo                  |
| storyboard     | `DEFAULT.md` + trechos de estilo-creator / WORKFLOW |
| soundEffects   | pipeline SFX / map\_sfx\_cues / catálogo            |
| transitions    | filmburn / corte seco no DEFAULT                    |
| stageScheme    | palcos A/B/C, layouts                               |
| cuts           | parâmetros tighten\_cuts / trim                     |
| caption        | defaults do gerador de legendas                     |
| lutPaths       | LUTs do estilo (quando existirem)                   |
| engineScripts  | scripts citados pelo DEFAULT / skill                |
| preview        | clip/frame de referência, se houver                 |

***

## Regras id vs nome

1. **`id` imutável** — criado uma vez; threads, projetos e paths usam só o `id`.
2. **`name` mutável** — UI e labels; rename **não** migra pasta nem quebra jobs.
3. Nova thread **escolhe** um estilo da galeria (default sugerido: `09-jev` enquanto for o único).
4. Fase 1 **não** cria estilo a partir de vídeos (isso é Fase 2).

***

## UI (Fase 1 — mínimo)

| Onde                             | O quê                                                       |
| -------------------------------- | ----------------------------------------------------------- |
| Sidebar, abaixo de “Nova thread” | Galeria **Estilos** (card do Jev: nome + preview se houver) |
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

* [ ] Existe `styles/09-jev/` com schema completo; campos não migrados podem estar vazios, mas as chaves/arquivos existem.
* [ ] Galeria na sidebar abaixo de “Nova thread”, com o Jev listado.
* [ ] Nova thread tem seletor (não mais estilo único fixo no código).
* [ ] Renomear o `name` do Jev não altera `id` nem quebra `styleId` existentes.
* [ ] Fase 2 só neste doc (roadmap), sem código de ingestão por vídeo.

***

## Relacionados

* Produto: [SPEC.md](../SPEC.md) (§ estilo portátil)
* MVP cobaia: [DEV\_SPEC\_MVP.md](../DEV_SPEC_MVP.md)
* Pipeline: [PIPELINE.md](../PIPELINE.md)
* Legado: `video/resolve/DEFAULT.md`, skill editor-reels / pipeline do Jev

