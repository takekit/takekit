# Takekit Harness — Architecture

The harness is a **chat-orchestrated multi-project video editor** UI (Codex-app style) plus a thin **engine** that schedules agent runs against the **in-repo pipeline**.

This document covers **CI / coding-agent adapters**. Product layout lives in [SPEC.md](./SPEC.md); the ported editing skill + Resolve scripts live in [PIPELINE.md](./PIPELINE.md).

## Pieces

| Path | Role |
|------|------|
| `apps/harness` | Vite + React + TypeScript UI (dark mode). Left: threads. Center: chat. Right: toggleable timeline/preview (**play only**). |
| `engine` | Node/TypeScript HTTP API + `ProjectRunner` + pluggable `Executor` adapters. |
| `pipeline/` | In-repo copy of editor-reels + `video/resolve` (09-jev). See [PIPELINE.md](./PIPELINE.md). Not a rewrite of script logic. |

```
┌─────────────┐     HTTP /api/*      ┌──────────────┐     spawn      ┌─────────────────┐
│ harness UI  │ ───────────────────► │ takekit      │ ─────────────► │ Executor        │
│ (threads +  │ ◄─────────────────── │ engine       │                │ (Claude/Codex/…)│
│  chat +     │   jobs / preview     │ ProjectRunner│                └────────┬────────┘
│  preview)   │                      └──────────────┘                         │
└─────────────┘                                                               ▼
                                                                    takekit/pipeline
                                                                    (editor-reels /
                                                                     resolve / 09-jev)
```

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
- `TAKEKIT_CLAUDE_SKIP_PERMS=1` — pass `--dangerously-skip-permissions` (sandboxes only)

If the binary is missing, the adapter **fails with a clear error** (no fake success).

`ProjectRunner` composes a prompt that points the agent at:

- `.agents/skills/editor-reels/SKILL.md`
- `video/resolve/DEFAULT.md` (09-jev)
- `video/resolve/WORKFLOW.md`
- the thread’s `projectPath`

It does **not** reimplement FFmpeg/Resolve/captions scripts — those live under `pipeline/video/resolve/`.

## Pluggable executors

| Adapter id | File | Status |
|------------|------|--------|
| `claude-code` | `adapters/claude-code.ts` | **Active** — spawns Claude Code CLI |
| `codex` | `adapters/codex.ts` | Stub — throws “not implemented” |
| `grok-build` | `adapters/grok-build.ts` | Stub — throws “not implemented” |
| `opencode` | `adapters/opencode.ts` | Stub — throws “not implemented” |

Same `Executor` contract; swap via registry / `TAKEKIT_EXECUTOR` when ready.

## HTTP API (engine)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness + executor list + CLI help |
| GET | `/api/projects` | Known projects (09-jev wired) |
| GET | `/api/threads` | List threads |
| POST | `/api/threads` | Create thread |
| GET | `/api/threads/:id` | Thread + messages |
| POST | `/api/threads/:id/messages` | Post chat; queues job (`run` default true) |
| GET | `/api/jobs/:id` | Job status / stdout / stderr |
| GET | `/api/threads/:id/preview` | Stream `previewPath` if set |

In-memory store only (scaffold). No secrets in repo — use env / `.env` locally (gitignored).

## What works vs missing (E2E video)

**Works now**

- Installable harness + engine
- Dark UI layout (threads / chat / right preview toggle)
- Mock + live threads; chat → job → Claude Code spawn
- Pipeline path wiring (env-overridable)

**Still missing for first guinea-pig video end-to-end**

- Discovering / attaching real export as `previewPath` after a run
- Headless pipeline steps inside Takekit (today agent must drive `pipeline/video/resolve` scripts)
- Persistence (DB), multi-user, auth
- Codex / Grok Build / OpenCode adapters (stubs registered)
- Parallel job scheduling / cancellation UX
