# Takekit Harness — Architecture

The harness is a **chat-orchestrated multi-project video editor** UI (Codex-app style) plus a thin **engine** that schedules agent runs against the **in-repo pipeline**.

This document covers **CI / coding-agent adapters**. Product layout lives in [SPEC.md](./SPEC.md); the ported editing skill + pipeline scripts live in [PIPELINE.md](./PIPELINE.md).

## Pieces

| Path | Role |
|------|------|
| `apps/harness` | Vite + React + TypeScript UI (dark mode) wrapped by **Tauri 2** desktop shell (`src-tauri/`). Left: threads. Center: chat. Right: toggleable timeline/preview (**play only**). |
| `engine` | Node/TypeScript HTTP API + `ProjectRunner` + pluggable `Executor` adapters. |
| `pipeline/` | In-repo copy of editor-reels + `video/kit` (09-jev). See [PIPELINE.md](./PIPELINE.md). Not a rewrite of script logic. |

```
┌─────────────┐     HTTP /api/*      ┌──────────────┐     spawn      ┌─────────────────┐
│ harness UI  │ ───────────────────► │ takekit      │ ─────────────► │ Executor        │
│ (threads +  │ ◄─────────────────── │ engine       │                │ (Claude/Codex/…)│
│  chat +     │   jobs / preview     │ ProjectRunner│                └────────┬────────┘
│  preview)   │                      └──────────────┘                         │
└─────────────┘                                                               ▼
                                                                    takekit/pipeline
                                                                    (editor-reels /
                                                                     headless / kit)
```


## Desktop shell (Tauri 2)

The desktop wrapper is **Tauri 2**, not Electron. React/Vite under `apps/harness` stays identical; only the native shell changes.

| Path | Role |
|------|------|
| `apps/harness/src-tauri/` | Rust host: window, plugins (`tauri-plugin-shell`, `tauri-plugin-fs`), invoke commands |
| `apps/harness` (Vite) | Same web UI; `npm run tauri dev` loads `devUrl` and wraps it |

Run:

```bash
cd apps/harness
npm run tauri dev
```

Rust invoke commands (desktop bridge for local CI / video files; engine Node HTTP can still be used in browser-dev):

| Command | Purpose |
|---------|---------|
| `spawn_ci(command, args, cwd?)` | Run Claude Code / Codex / Grok Build / OpenCode (or any local CLI) |
| `read_file(path)` | Read a text file |
| `write_file(path, contents)` | Write a text file (creates parent dirs) |
| `list_dir(path)` | List directory entry names |

Capabilities enable shell execute/spawn and fs read/write scoped for local project/video paths. Identifier: `com.takekit.app`, product name **Takekit**.

## Executor interface

Every CI adapter implements:

```ts
interface Executor {
  readonly id: string;
  readonly label: string;
  run(request: ExecutorRequest): Promise<ExecutorResult>;
}

interface ExecutorRequest {
  projectPath: string;   // video project dir
  pipelineRoot: string;  // takekit/pipeline (skill + video root)
  prompt: string;
  cwd?: string;
  signal?: AbortSignal;
}
```

Registry: `engine/src/adapters/index.ts`. Select with `TAKEKIT_EXECUTOR` (default `claude-code`).

## Claude Code (first / active)

**File:** `engine/src/adapters/claude-code.ts`

Documented CLI:

| Mode | Command |
|------|---------|
| Interactive | `claude` |
| Non-interactive (harness) | `claude -p "<prompt>"` |
| Extra dirs | `--add-dir <project>` `--add-dir <pipeline>` |

Env:

- `CLAUDE_BIN` — override binary path (default: `claude` on `PATH`)
- `TAKEKIT_SKIP_PERMS=1` — full access for every executor (legacy name `TAKEKIT_CLAUDE_SKIP_PERMS` still read)
- `TAKEKIT_EFFORT` — reasoning effort passed as `--effort`

If the binary is missing, the adapter **fails with a clear error** (no fake success).

`ProjectRunner` composes a prompt that points the agent at:

- `.agents/skills/editor-reels/SKILL.md`
- `video/kit/DEFAULT.md` (09-jev)
- `video/kit/WORKFLOW.md`
- the thread’s `projectPath`

It does **not** reimplement FFmpeg/captions scripts — those live under `pipeline/video/headless/` and `pipeline/video/kit/`.

## Pluggable executors

| Adapter id | File | Headless command | Effort flag | Full access | Binary override |
|------------|------|------------------|-------------|-------------|-----------------|
| `claude-code` | `adapters/claude-code.ts` | `claude -p` | `--effort` | `--dangerously-skip-permissions` | `CLAUDE_BIN` / `config.claudeBin` |
| `codex` | `adapters/codex.ts` | `codex exec` | `-c model_reasoning_effort=…` | `--dangerously-bypass-approvals-and-sandbox` (else `--sandbox workspace-write`) | `CODEX_BIN` |
| `grok-build` | `adapters/grok-build.ts` | `grok -p` | `--reasoning-effort` | `--always-approve` | `GROK_BIN` |
| `opencode` | `adapters/opencode.ts` | `opencode run` | `--variant` | `--auto` | `OPENCODE_BIN` |

Same `Executor` contract; shared spawn/bin resolution in `adapters/spawn.ts`. Pick one via the UI
model picker, Settings, `config.json` (`executorId` + `model` + `effort` + `skipPermissions`) or
`TAKEKIT_EXECUTOR`. The model list per harness (`engine/src/catalog.ts`) is exposed in
`GET /api/config` → `executors[]`; any other model id still works as a custom id.

### Sessions (resume per harness)

Each thread keeps one CLI session per executor (`thread.sessions[executorId]`: id, cwd, `seen`).
The first message of a harness in a thread starts a session with the full prompt (skill, style
brief, rules, recent turns). The next ones **resume** it with the model selected now, sending only
the new request plus the turns another harness answered meanwhile, so the agent keeps what it
already read and ran. If the saved session is gone, the job starts a new one with the full prompt.

| Adapter | New session | Resume |
|---------|-------------|--------|
| `claude-code` | `--session-id <uuid>` | `--resume <uuid>` |
| `grok-build` | `-s <uuid>` | `-r <uuid>` |
| `codex` | id from `thread.started` | `codex exec resume … -- <id> "<prompt>"` (sandbox via `-c`) |
| `opencode` | id from `sessionID` in events | `--session <id>` |

### Preview and final export

docs/preview-export. The agent's jobs end in a **preview** (`compose.py`, default
`--quality preview`: 720p, fast, `edit/preview.mp4`); the prompt tells it not to render the final.
The final export is the creator's: **Exportar vídeo final** in the preview panel runs
`compose.py --quality final --from-preview --progress` on the engine (same spec as the preview,
the style's `quality.json`, into `exports/`). Progress comes from `TAKEKIT_PROGRESS=` lines, the
file from `TAKEKIT_EXPORT=`. One render per thread; a job sent meanwhile waits for it.

### Presets (Style Kit modules)

docs/style-kit/SPEC-EXPANSION.md. Before every job and render the engine writes
`<project>/edit/style.resolved.json` (style + the thread's presets + quality); the pipeline
scripts read it. Swapping caption / transitions / SFX in the panel can be applied to the preview
without the agent (`POST /api/threads/:id/render`).

### Messages while a job runs

`POST /api/threads/:id/messages` during a job no longer returns 409: the message goes to the
running agent (`delivery` on the message and a "Você" row in the activity feed).

- **live** (Claude): `--input-format stream-json` keeps stdin open; the message is written to it
  and the agent reads it at the next step. Stdin closes on the `result` event.
- **interrupt** (Codex, Grok, OpenCode, or Claude after its turn ended): the current turn is
  stopped and the same session resumes at once with the message.
- **next**: the CLI hadn't reported its session yet; the message goes in as soon as the turn ends.

## HTTP API (engine)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness + executor list + CLI help |
| GET | `/api/projects` | Projects in the projects root (`config.projectsRoot`) + next number |
| POST | `/api/projects` | New project `{ name }` → `<projects root>/<NN>-<slug>` with input/, edit/, exports/ |
| GET | `/api/styles` | Style Kit gallery (`styles/<id>/`) + default id |
| GET | `/api/styles/:id` | Full style package (id or alias) |
| GET | `/api/styles/:id/preview`, `/thumb` | Preview loop / its thumbnail |
| GET | `/api/presets` | Module presets (`caption`, `stage`, `camera`, `cuts`, `soundEffects`, `transitions`); `?styleId=` adds the style's own |
| GET | `/api/presets/:module/:id`, `/api/presets/fonts` | One preset / fonts the caption builder can use |
| POST | `/api/presets/:module` | Save a preset to `styles/_presets/` (`{ preset, overwrite? }`) |
| POST | `/api/presets/caption/preview` | Caption preset (object) drawn by the real renderer (PNG; `?clip=1` = mp4 of a few sample phrases) |
| GET | `/api/presets/caption/:id/clip`, `/still` | Library caption as a looping mp4 / poster, over recent footage (`?bg=auto\|dark\|cream\|thread:<id>`) |
| GET | `/api/presets/camera/:id/clip` | Camera preset on recent footage (punch / zoom / face tracking), mp4 (`?thread=`) |
| GET | `/api/presets/soundEffects/:id/demo` | "Ouvir": ~7 s of recent footage with the preset's effects and music (m4a; `?thread=`) |
| POST | `/api/styles/:id/duplicate` | New style from a gallery one with other presets `{ name, modules }` (no agent) |
| PATCH | `/api/styles/:id` | Edit a gallery style in place `{ name?, modules? }`; the first edit keeps `original.json` |
| POST | `/api/styles/:id/restore` | Back to `original.json` (undo the Estúdio edits) |
| POST | `/api/style-drafts` | New style from example videos `{ name, references, segments?, note? }` → draft + `kind: "style"` thread + job |
| GET | `/api/style-drafts/:id` | Proposed package, resolved presets, what still blocks saving |
| POST | `/api/style-drafts/:id/publish` | Validate and move `styles/_drafts/<id>` → `styles/<id>` |
| GET | `/api/threads` | List threads |
| POST | `/api/threads` | Create thread (`projectPath` required; `styleId` must be in the gallery, omitted = default) |
| GET | `/api/threads/:id` | Thread + messages |
| POST | `/api/threads/:id/messages` | Post chat; queues job (`run` default true) |
| GET | `/api/jobs/:id` | Job status / stdout / stderr |
| PATCH | `/api/threads/:id` | `{ archived }` (Concluir / Reabrir), `{ snoozedUntil: ISO \| null }` (Adiar; `null` = back now), or `{ modules }` (swap presets; `null` = the style's). A new message clears both. |
| GET | `/api/threads/:id/preview` | Stream `previewPath` if set (the 720p preview, `edit/preview.mp4`) |
| POST | `/api/threads/:id/export` | Exportar: final render of the last preview's spec, no agent (202 + task) |
| POST | `/api/threads/:id/render` | Redraw the preview with the thread's presets (captions + compose), no agent |
| GET | `/api/threads/:id/render` | Running render (progress, phase) + last export / last re-render |
| POST | `/api/threads/:id/render/cancel` | Stop the running render |
| GET | `/api/threads/:id/export/file` | Last export as a download (`?inline=1` to play) |
| POST | `/api/threads/:id/export/reveal` | Show the last export in Finder |
| GET | `/api/threads/:id/timeline` | Read-only tracks from `edit/compose.json` / `compose.resolved.json` (or `edit/cuts.json`), `null` if none |

### Timeline annotations → agent

In the preview timeline, **Anotar** (or Shift + drag) picks a clip or a time range; the note is
attached to the composer and sent as a `<timeline-context fonte=… fps=…>` block at the end of the
chat message. Each item carries the track, timecode/seconds and the clip's `ref` in the source file
(`cuts[4]`, `audio.sfx[3]`, `splits[1].broll[0]`…); ranges list every clip inside them.
`composeAgentPrompt` adds instructions for the block whenever it's present.

In-memory store only (scaffold). No secrets in repo — use env / `.env` locally (gitignored).

## What works vs missing (E2E video)

**Works now**

- Installable harness + engine + Tauri 2 desktop shell
- Dark UI layout (threads / chat / right preview toggle)
- Mock + live threads; chat → job → Claude Code spawn
- Pipeline path wiring (env-overridable)

**Still missing for first guinea-pig video end-to-end**

- Discovering / attaching real export as `previewPath` after a run
- Headless pipeline steps inside Takekit (today agent must drive `pipeline/video/kit` scripts)
- Persistence (DB), multi-user, auth
- Parallel job scheduling / cancellation UX
