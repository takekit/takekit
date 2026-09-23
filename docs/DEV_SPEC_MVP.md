# Takekit — Spec técnica do MVP (fluxo cobaia)

**Audiência:** bot/dev que vai implementar o código.  
**Escopo:** fechar o fluxo *thread → chat → CI → pipeline 09-jev → preview mp4*, com persistência, config e erros.  
**NÃO é produto completo** — é o caminho mínimo pra um Short “cobaia” sair no player da direita.

Documentos relacionados: [SPEC.md](./SPEC.md) (produto), [HARNESS.md](./HARNESS.md) (adapters), [PIPELINE.md](./PIPELINE.md) (skill portada).

---

## 0. Contexto do que já existe (não reinventar)

| Peça | Onde | Estado |
|------|------|--------|
| UI React/Vite | `apps/harness/` | Threads esq., chat centro, preview dir. (play-only) |
| Shell desktop | `apps/harness/src-tauri/` | Tauri 2, id `com.takekit.app`; commands `spawn_ci`, `read_file`, `write_file`, `list_dir` |
| Engine HTTP | `engine/` | Express `:8787`; store **in-memory**; `ProjectRunner` + adapters |
| Adapter Claude Code | `engine/src/adapters/claude-code.ts` | `claude -p` + `--add-dir`; **ainda sem** `--model opus`; `previewPath` sempre `null` |
| Codex / Grok Build / OpenCode | `engine/src/adapters/*` | Stubs (throw) |
| Pipeline 09-jev | `pipeline/` | Skill + `video/resolve` **copiados** (não reescritos) |
| Preview API | `GET /api/threads/:id/preview` | Serve arquivo se `thread.previewPath` existir |

**Lacunas do MVP (este doc fecha):** descoberta do mp4 de saída; persistência JSON; config CI/modelo; `--model opus` no default; erro no chat sem travar UI; player funcional com o export real.

---

## 1. Objetivo de aceite (definição de pronto)

Um operador consegue, numa instalação local:

1. Abrir o harness (`npm run tauri:dev` ou Vite + engine).
2. Criar uma thread apontando pra um projeto de vídeo com **vídeo de entrada**.
3. Digitar no chat: `edita esse Short com o estilo 09-jev`.
4. O CI default (**Claude Code**, modelo **opus**) roda com cwd/`TAKEKIT_PIPELINE_ROOT` = `pipeline/`, lendo a skill `editor-reels` e `video/resolve/DEFAULT.md`.
5. Ao fim com sucesso, um **mp4** aparece e a thread atualiza `previewPath`.
6. A sidebar direita toca o vídeo (HTML5 `<video controls>`).
7. Se o CI falhar, a thread recebe mensagem de erro no chat; a UI deixa de ficar “busy”; o app **não** congela.
8. Reiniciar o app: threads, mensagens, paths e status voltam do JSON local.

---

## 2. Arquitetura recomendada (MVP)

Manter o **engine Node** como orquestrador. A UI (web ou Tauri) continua falando HTTP `/api/*`.

```
[Harness UI] --HTTP--> [engine ProjectRunner] --spawn--> [Claude Code CLI]
                              |                              |
                              |                              v
                              |                    pipeline/ (.agents + video/)
                              v
                     JSON persistência + previewPath
                              |
                              v
                     GET /api/threads/:id/preview --> <video>
```

**Papel do Tauri no MVP:**

- Preferência: UI ainda usa o engine HTTP (igual ao Vite). Commands Rust (`spawn_ci`, fs) ficam disponíveis para **fase seguinte** ou fallback desktop quando o engine não estiver rodando.
- Obrigatório no MVP do adapter: o spawn real do Claude Code continua em `ClaudeCodeExecutor` (Node `spawn`), **a menos** que o implementador unifique tudo em `spawn_ci` do Tauri — nesse caso o engine deve chamar Tauri só no desktop; **não faça os dois caminhos divergirem**. Escolha **um**:
  - **Opção A (recomendada):** Node spawn no engine (já existe); Tauri commands documentados mas não obrigatórios pra fechar o fluxo.
  - **Opção B:** UI Tauri chama `spawn_ci` e o engine só persiste estado — exige redesenhar o runner. Evitar no MVP.

Default = **Opção A**.

---

## 3. Fluxo detalhado thread → chat → CI → pipeline → preview

### 3.1 Criar thread (projeto de vídeo)

**UI:** botão na `ThreadsSidebar` (já existe create).

**API (já existe, estender payload):** `POST /api/threads`

Body proposto:

```json
{
  "title": "Short cobaia 01",
  "projectPath": "/abs/path/para/projeto",
  "styleId": "09-jev",
  "inputVideoPath": "/abs/path/para/entrada.mp4"
}
```

**Layout de pasta do projeto** (criar se não existir):

```
<projectPath>/
  briefing.md          # texto livre / briefing da thread
  input/               # ou symlink; inputVideoPath pode apontar pra cá
    source.mp4
  edit/                # metadados do pipeline (JSON legados ok)
  exports/             # OUTPUT: mp4 gerado pelo pipeline
  takekit-thread.json  # espelho opcional; canônico fica em data dir (seção 4)
```

Regras:

- `styleId` default `"09-jev"` → aponta semanticamente pra `pipeline/video/resolve/DEFAULT.md`.
- `projectPath` deve ser acessível ao Claude (`--add-dir`).
- Se `inputVideoPath` vier, copiar ou registrar no estado da thread; incluir no prompt do runner.

### 3.2 Mensagem no chat

**UI:** `ChatPanel` → `POST /api/threads/:id/messages` com `{ content, run: true }` (já existe).

Engine:

1. Append mensagem `user`.
2. Cria `Job` `queued` → `running`.
3. `ProjectRunner.runJob(job)`:
   - Monta prompt (template abaixo).
   - `getExecutor(config.executorId)` (default `claude-code`).
   - Passa `model` da config pro adapter.
4. Polling na UI (`GET /api/jobs/:id` + refresh thread) a cada 1–2s enquanto `busy`.

### 3.3 Prompt template (Claude Code / qualquer CI)

O runner **já** aponta skill + DEFAULT; completar assim:

```
Você é o editor do Takekit. Trabalhe APENAS via as skills e scripts do pipeline.

ROOT do pipeline (cwd): <TAKEKIT_PIPELINE_ROOT>
Skill principal: .agents/skills/editor-reels/SKILL.md
Estilo travado: video/resolve/DEFAULT.md (09-jev)
Workflow: video/resolve/WORKFLOW.md
Projeto de vídeo: <projectPath>
Vídeo de entrada: <inputVideoPath>
Estilo: <styleId>

Pedido do usuário:
<content>

Ao terminar com sucesso:
1) Gere o mp4 final em <projectPath>/exports/ (nome sugerido: final.mp4 ou timestamp).
2) Imprima na ÚLTIMA linha do stdout exatamente:
   TAKEKIT_PREVIEW=<caminho-absoluto-do-mp4>

Não reescreva a lógica dos scripts; invoque-os. Se falhar, explique o erro e saia com código ≠ 0.
```

### 3.4 Claude Code — flags obrigatórias no MVP

Atualizar `engine/src/adapters/claude-code.ts` `buildArgs`:

```
claude -p "<prompt>" \
  --model <config.model> \          # default: opus (ex. claude-opus-4-... conforme CLI local; usar o id que o CLI aceitar; documentar em config)
  --add-dir <projectPath> \
  --add-dir <pipelineRoot> \
  [--dangerously-skip-permissions se TAKEKIT_CLAUDE_SKIP_PERMS=1]
```

`cwd` = `pipelineRoot` (`TAKEKIT_PIPELINE_ROOT`, default in-repo `pipeline/`).

### 3.5 Pipeline (não reescrever)

O CI deve seguir a skill. Scripts relevantes já em:

- `pipeline/video/resolve/pipeline/` (`tighten_cuts`, captions, etc.)
- `pipeline/video/resolve/engine/`
- `pipeline/video/resolve/motion/`

MVP **não** exige desacoplar Resolve/headless além do que a skill já faz. Sucesso = mp4 em `exports/` + linha `TAKEKIT_PREVIEW=`.

### 3.6 Descoberta do preview (`previewPath`)

Ordem de resolução no `ProjectRunner` após `ExecutorResult`:

1. Se `stdout` contiver `TAKEKIT_PREVIEW=<path>` e o arquivo existir → usar.
2. Senão, listar `<projectPath>/exports/**/*.mp4` e pegar o **mais recente** por `mtime`.
3. Senão, `previewPath = null` mas job pode ser `succeeded` se exit 0 — nesse caso mensagem assistant: “Job ok, mas não achei mp4 em exports/”.
4. Chamar `setThreadPreview` + persistir JSON.

Estender `ExecutorResult.previewPath` quando o adapter parsear o marker (opcional; pode ficar só no runner).

### 3.7 Player na direita

`TimelinePreview.tsx` já usa `previewUrl(threadId)` se `thread.previewPath` setado.

Garantir:

- Após job success, UI refetch thread → `hasPreview` true → `<video src={previewUrl} controls />`.
- Engine `GET .../preview` continua streaming com `Content-Type` video/mp4.
- Cache-bust: query `?t=<updatedAt>` na URL do vídeo pra não ficar mídia velha.

---

## 4. Persistência JSON por thread

Substituir (ou espelhar) o store in-memory.

### 4.1 Diretório de dados

```
~/.takekit/
  config.json
  threads/
    <threadId>.json
  jobs/                    # opcional
    <jobId>.json
```

Override: `TAKEKIT_DATA_DIR`.

### 4.2 Schema `threads/<id>.json`

```json
{
  "id": "thr_...",
  "title": "Short cobaia 01",
  "projectPath": "/abs/...",
  "styleId": "09-jev",
  "briefing": "",
  "inputVideoPath": "/abs/.../source.mp4",
  "previewPath": "/abs/.../exports/final.mp4",
  "stageStatus": {
    "ingest": "done",
    "edit": "running",
    "export": "pending"
  },
  "messages": [ { "id", "role", "content", "createdAt", "jobId?" } ],
  "lastJobId": "job_...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`stageStatus`: mapa livre string→`pending|running|done|failed`. Mínimo MVP: atualizar `edit`/`export` conforme job.

### 4.3 Comportamento do store

- Boot do engine: carregar todos `threads/*.json`.
- Toda mutação (create thread, append message, job status, preview): **write atômico** (write temp + rename).
- Jobs: persistir o suficiente pra UI mostrar erro após reload (`status`, `error`, `stderr` truncado).

---

## 5. Config (CI + modelo)

### 5.1 Arquivo `~/.takekit/config.json`

```json
{
  "executorId": "claude-code",
  "model": "opus",
  "pipelineRoot": null,
  "claudeBin": null,
  "skipClaudePerms": false
}
```

Valores válidos `executorId`: `claude-code` | `codex` | `grok-build` | `opencode`.

Precedência: **env > config.json > defaults**.

| Campo | Env | Default |
|-------|-----|---------|
| executorId | `TAKEKIT_EXECUTOR` | `claude-code` |
| model | `TAKEKIT_MODEL` | `opus` |
| pipelineRoot | `TAKEKIT_PIPELINE_ROOT` | `<repo>/pipeline` |
| claudeBin | `CLAUDE_BIN` | `claude` |
| skipClaudePerms | `TAKEKIT_CLAUDE_SKIP_PERMS=1` | false |

### 5.2 API

- `GET /api/config` — config efetiva (sem secrets).
- `PUT /api/config` — merge + salvar JSON (MVP; UI settings pode ser mínima: dropdown executor + input model, ou só editar arquivo).

Stubs Codex/Grok/OpenCode: se selecionados, job falha com mensagem clara no chat (“adapter não implementado”), **sem** crash.

---

## 6. Tratamento de erro

| Falha | Comportamento |
|-------|----------------|
| CLI não encontrado | Job `failed`; mensagem `assistant`/`system` no chat com o erro; UI `busy=false` |
| exitCode ≠ 0 | Idem; incluir trecho de `stderr` (últimos ~2–4KB) |
| Adapter stub | Idem, mensagem explícita |
| mp4 não encontrado após exit 0 | Job `succeeded` ou `failed`? → **succeeded** + aviso no chat (ver 3.6) |
| Exceção no runner | catch → job failed + chat; **nunca** deixar request HTTP pendurada sem resposta no POST de message (responder 200 com job id; falha assíncrona) |

Regras UI:

- `busy` só enquanto job `queued|running` da thread ativa.
- Erro **não** desmonta React root / não trava Tauri.
- Não usar `alert()` bloqueante.

`project-runner.ts` já anexa falha em mensagem em alguns caminhos — padronizar sempre.

---

## 7. Arquivos a tocar (checklist de implementação)

Ordem sugerida:

1. **Config** — `engine/src/config.ts` + loader `~/.takekit/config.json` + `GET/PUT /api/config`.
2. **Persistência** — refatorar `engine/src/store.ts` pra JSON em disco; estender `types.ts` (`inputVideoPath`, `briefing`, `stageStatus`).
3. **Claude `--model`** — `claude-code.ts` lê model da config.
4. **Prompt + preview discovery** — `project-runner.ts` (marker + scan `exports/`).
5. **API threads** — aceitar `inputVideoPath` no create; garantir erros no chat.
6. **UI** — refetch após job; cache-bust no `<video>`; opcional form de input path na create thread; settings mínimos.
7. **Docs** — uma linha no README apontando este arquivo + HARNESS.

**Não tocar:** lógica interna dos scripts em `pipeline/video/resolve/**` (só invocar).

---

## 8. Fora de escopo (MVP)

- Implementar de verdade Codex / Grok Build / OpenCode.
- SaaS, multi-usuário, auth, DB remota.
- Editar timeline frame a frame.
- Reescrever pipeline / remover Resolve do legado além do que a skill já faz.
- Paralelismo polido de N jobs (um job por thread por vez basta).
- Bundle automático do engine dentro do Tauri (pode continuar dois processos no MVP).
- Upload de vídeo pela UI (path local absoluto basta).

---

## 9. Critérios de aceite testáveis

- [ ] `docs/DEV_SPEC_MVP.md` versionado (este arquivo).
- [ ] Com `executorId=claude-code` e `model=opus`, o processo spawnado inclui `--model` (verificar via log/args).
- [ ] Após run bem-sucedido num projeto com `exports/final.mp4` (ou marker), `GET /api/threads/:id` retorna `previewPath` preenchido.
- [ ] `GET /api/threads/:id/preview` retorna 200 video/mp4.
- [ ] Player na direita reproduz o arquivo.
- [ ] Matar e subir o engine: threads/mensagens voltam do `~/.takekit/threads/`.
- [ ] Forçar falha (binário inexistente): chat mostra erro; UI responde a novos inputs.
- [ ] Selecionar stub executor: erro amigável no chat, app vivo.

---

## 10. Invocação do pipeline (referência rápida)

- Root: `pipeline/` (`TAKEKIT_PIPELINE_ROOT`)
- Skill: `pipeline/.agents/skills/editor-reels/SKILL.md`
- Default estilo: `pipeline/video/resolve/DEFAULT.md`
- Detalhes: [PIPELINE.md](./PIPELINE.md)

---

## 11. Nota pro implementador

Priorize **caminho feliz cobaia** com um mp4 curto local. Não perfectione adapters stubs. Persistência e descoberta de preview são o que destravam o demo; o resto é polish.
