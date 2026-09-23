import { access, readdir, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { getExecutor } from "./adapters/index.js";
import { getConfig } from "./config.js";
import {
  getJob,
  getThread,
  resetThreadPipeline,
  setJobMode,
  setThreadPipelineStep,
  setThreadPreview,
  setThreadStage,
  updateJob,
  upsertActivity,
  appendMessage,
} from "./store.js";
import type { ActivityItem, ActivityUpdate } from "./activity.js";
import type { Thread } from "./types.js";

/** Running jobs, so POST /api/jobs/:id/cancel can stop the CLI. */
const controllers = new Map<string, AbortController>();

/** Ask a running job to stop (SIGTERM to the CLI). False when it isn't running. */
export function cancelJob(jobId: string): boolean {
  const controller = controllers.get(jobId);
  if (!controller) return false;
  updateJob(jobId, { cancelRequested: true });
  controller.abort();
  return true;
}

/**
 * ProjectRunner — wires a video project path + prompt to an Executor.
 *
 * Does NOT reimplement the editor-reels pipeline (headless: FFmpeg + RVM).
 * It only:
 *   1) Validates project + pipeline paths exist
 *   2) Builds a prompt that points the agent at editor-reels / DEFAULT 09-jev
 *   3) Spawns the configured CI adapter (default: Claude Code, model opus)
 *   4) Discovers the exported mp4 (TAKEKIT_PREVIEW= marker, else newest exports/**.mp4)
 *
 * Every failure path ends with job `failed` + a chat message; this function
 * never rejects (it is fired without await from the HTTP handler).
 *
 * Reference paths (read-only wiring):
 *   skill:     .agents/skills/editor-reels/SKILL.md
 *   default:   video/resolve/DEFAULT.md (09-jev)
 *   project:   video/projects/09-jev (guinea pig)
 */
export async function runProjectJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  const controller = new AbortController();
  controllers.set(jobId, controller);
  try {
    await runJob(jobId, controller.signal);
  } catch (err) {
    failJob(jobId, err instanceof Error ? err.message : String(err));
  } finally {
    controllers.delete(jobId);
    settleActivity(jobId);
  }
}

/** Steps that only look at the project; anything else in the pipeline changes it. */
const LOOK_ONLY_STEPS = new Set(["review"]);

/**
 * Does this row mean the agent is changing the project (not just answering)? A pipeline
 * script that renders, or a file edit inside the project / pipeline (scratch files in /tmp
 * don't count).
 */
function changesProject(item: ActivityItem, roots: string[]): boolean {
  if (item.kind === "command") return Boolean(item.step) && !LOOK_ONLY_STEPS.has(item.step!);
  if (item.kind !== "edit") return false;
  const paths = (item.detail ?? "").split("\n").filter(Boolean);
  if (!paths.length) return true;
  return paths.some((p) => !isAbsolute(p) || roots.some((root) => p === root || p.startsWith(`${root}/`)));
}

/** Rows still "running" when the CLI exits: done if the job succeeded, failed otherwise. */
function settleActivity(jobId: string): void {
  const job = getJob(jobId);
  if (!job) return;
  const status = job.status === "succeeded" ? "done" : "failed";
  for (const item of job.activity ?? []) {
    if (item.status !== "running") continue;
    upsertActivity(jobId, { id: item.id, status, endedAt: new Date().toISOString() });
    if (item.step) setThreadPipelineStep(job.threadId, item.step, status);
  }
  updateJob(jobId, {}); // flush the throttled write
}

async function runJob(jobId: string, signal: AbortSignal): Promise<void> {
  const job = getJob(jobId)!;
  const thread = getThread(job.threadId);
  const config = getConfig();
  const pipelineRoot = config.pipelineRoot;

  const startedAt = new Date();
  updateJob(jobId, { status: "running", startedAt: startedAt.toISOString() });
  // The agent decides whether the message is a question or an edit. Stages only move once it
  // actually changes something, so answering a question leaves the last edit's state alone.
  let editing = false;
  const startEditing = () => {
    if (editing) return;
    editing = true;
    setJobMode(jobId, "edit");
    setThreadStage(job.threadId, { edit: "running", export: "pending" });
    resetThreadPipeline(job.threadId);
  };

  if (!(await readable(job.projectPath))) {
    failJob(jobId, `Project path not readable: ${job.projectPath}`);
    return;
  }

  if (!(await readable(pipelineRoot))) {
    failJob(
      jobId,
      `Pipeline root not readable: ${pipelineRoot}. ` +
        `Set TAKEKIT_PIPELINE_ROOT (or config.pipelineRoot) to takekit/pipeline or another checkout with .agents + video/.`,
    );
    return;
  }

  const executor = getExecutor(config.executorId);
  const composedPrompt = composeAgentPrompt({
    pipelineRoot,
    projectPath: job.projectPath,
    inputVideoPaths: thread?.inputVideoPaths ?? [],
    styleId: thread?.styleId ?? "09-jev",
    userPrompt: job.prompt,
    history: thread ? conversationSoFar(thread, jobId) : [],
  });

  const result = await executor.run({
    projectPath: job.projectPath,
    pipelineRoot,
    prompt: composedPrompt,
    cwd: pipelineRoot,
    model: config.model,
    effort: config.effort || undefined,
    // config.claudeBin only applies to Claude; other adapters read their own *_BIN env var.
    bin: executor.id === "claude-code" ? config.claudeBin : binFromEnv(executor.id),
    skipPermissions: config.skipPermissions,
    signal,
    onActivity: (update: ActivityUpdate) => {
      const item = upsertActivity(jobId, update);
      if (item && changesProject(item, [job.projectPath, pipelineRoot])) startEditing();
      if (item?.kind === "command" && item.step && update.status) {
        setThreadPipelineStep(job.threadId, item.step, item.status === "running" ? "running" : item.status === "failed" ? "failed" : "done");
      }
    },
  });
  // JSON-streaming adapters hand back the final answer; stdout is then the raw event log.
  const answer = (result.text ?? result.stdout).trim();

  if (getJob(jobId)?.cancelRequested) {
    updateJob(jobId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      stdout: truncate(result.stdout, 50_000),
      stderr: tail(result.stderr, 20_000),
      error: "Cancelado pelo usuário",
    });
    if (editing) setThreadStage(job.threadId, { edit: "failed" });
    appendMessage(job.threadId, { role: "assistant", content: "Job failed: cancelado pelo usuário.", jobId });
    return;
  }

  if (result.exitCode !== 0) {
    const errors = (getJob(jobId)?.activity ?? []).filter((a) => a.kind === "error").map((a) => a.title);
    const detail =
      tail(result.stderr.trim(), 3000) || tail(answer, 3000) || tail(errors.join("\n"), 3000) || "(no output)";
    updateJob(jobId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      stdout: truncate(result.stdout, 50_000),
      stderr: tail(result.stderr, 20_000),
      error: `Executor exited with code ${result.exitCode}`,
    });
    if (editing) setThreadStage(job.threadId, { edit: "failed" });
    appendMessage(job.threadId, {
      role: "assistant",
      content: [`Executor ${executor.id} falhou (exit ${result.exitCode}).`, detail].join("\n\n"),
      jobId,
    });
    return;
  }

  // Only an mp4 written during this job counts as a new export: answering a question must not
  // re-announce the previous render. The marker may be in the final answer or
  // echoed by a command the agent ran.
  const commandOutputs = (getJob(jobId)?.activity ?? []).map((a) => a.output ?? "").join("\n");
  const since = startedAt.getTime() - 2000;
  const previewPath =
    (await freshFile(result.previewPath ?? null, job.projectPath, since)) ??
    (await freshFile(parsePreviewMarker(answer), job.projectPath, since)) ??
    (await freshFile(parsePreviewMarker(commandOutputs), job.projectPath, since)) ??
    (await freshFile(await newestMp4(join(job.projectPath, "exports")), job.projectPath, since));
  if (previewPath) startEditing();

  updateJob(jobId, {
    status: "succeeded",
    finishedAt: new Date().toISOString(),
    exitCode: 0,
    stdout: truncate(result.stdout, 50_000),
    stderr: tail(result.stderr, 20_000),
    error: null,
    previewPath,
  });

  if (previewPath) {
    setThreadPreview(job.threadId, previewPath);
    setThreadStage(job.threadId, { edit: "done", export: "done" });
  } else if (editing) {
    // Changed files without a new render: keep the last export.
    setThreadStage(job.threadId, { edit: "done", export: thread?.previewPath ? "done" : "pending" });
  } else {
    setJobMode(jobId, "chat"); // answered a question; the edit stays as it was
  }

  // The marker is for the engine; the preview card shows the file.
  const reply = answer.replace(/^.*TAKEKIT_PREVIEW=.*$/gm, "").trim();
  const summary = truncate(reply || "(o agente terminou sem resposta final)", 12_000);
  appendMessage(job.threadId, {
    role: "assistant",
    content: previewPath ? `${summary}\n\nPreview: ${previewPath}` : summary,
    jobId,
  });
}

/** Mark job failed + tell the user in chat. Safe to call from any path. */
function failJob(jobId: string, error: string): void {
  const job = getJob(jobId);
  if (!job) return;
  try {
    updateJob(jobId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error,
      exitCode: job.exitCode ?? 1,
    });
    setThreadStage(job.threadId, { edit: "failed" });
    appendMessage(job.threadId, {
      role: "assistant",
      content: `Job failed: ${error}`,
      jobId,
    });
  } catch (err) {
    // Persistence itself failed — log, never throw out of the runner.
    console.error(`[takekit-engine] could not record failure for job ${jobId}:`, err);
  }
}

/** Past turns of the thread for the prompt: each job is a fresh CLI session with no memory. */
function conversationSoFar(thread: Thread, currentJobId: string): Array<{ role: "user" | "assistant"; text: string }> {
  const turns: Array<{ role: "user" | "assistant"; text: string }> = [];
  const current = thread.messages.findIndex((m) => m.jobId === currentJobId);
  // Up to the user message that started this job (it goes in as the request itself).
  const past = thread.messages.slice(0, current >= 0 ? current - 1 : thread.messages.length - 1);
  for (const m of past) {
    if (m.role === "user") turns.push({ role: "user", text: m.content });
    else if (m.role === "assistant" && m.jobId && !/^Job \S+ queued on executor/.test(m.content)) {
      turns.push({ role: "assistant", text: m.content.replace(/\n*Preview: \S[^\n]*\s*$/, "") });
    }
  }
  return turns.slice(-HISTORY_TURNS).map((t) => ({ ...t, text: clip(t.text, HISTORY_CHARS) }));
}

const HISTORY_TURNS = 10;
const HISTORY_CHARS = 1500;

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function composeAgentPrompt(input: {
  pipelineRoot: string;
  projectPath: string;
  inputVideoPaths: string[];
  styleId: string;
  userPrompt: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
}): string {
  const context = [
    `ROOT do pipeline (cwd): ${input.pipelineRoot}`,
    "Skill principal: .agents/skills/editor-reels/SKILL.md",
    "Estilo travado: video/resolve/DEFAULT.md (09-jev)",
    "Workflow: video/resolve/WORKFLOW.md",
    "Render sem Resolve: video/headless/README.md (Python: .venv/bin/python; trim.py → palco_b.py → compose.py)",
    `Projeto de vídeo: ${input.projectPath}`,
    ...(input.inputVideoPaths.length > 1
      ? ["Vídeos de entrada (na ordem escolhida):", ...input.inputVideoPaths.map((p, i) => `  ${i + 1}) ${p}`)]
      : [`Vídeo de entrada: ${input.inputVideoPaths[0] ?? "(não informado; procure em <projeto>/input/)"}`]),
    `Estilo: ${input.styleId}`,
  ];
  const history = input.history.length
    ? [
        "",
        "Conversa até aqui nesta thread (mais antiga primeiro; use como contexto):",
        ...input.history.map((t) => `[${t.role === "user" ? "usuário" : "você"}] ${t.text}`),
      ]
    : [];
  const annotations = input.userPrompt.includes("<timeline-context")
    ? [
        "Anotações na timeline (bloco <timeline-context>):",
        "- Cada item [n] marca um clipe ou intervalo da timeline editada; a linha `nota:` diz o que mudar ali.",
        "- Tempos são da timeline gravada (= tempo do export), em timecode hh:mm:ss:ff e segundos, no fps indicado.",
        "- `ref` aponta o item no arquivo-fonte indicado (ex.: cuts[4] em edit/build.json); num intervalo, as faixas",
        "  listadas são o que está dentro dele.",
        "- Fonte edit/compose.resolved.json é gerada pelo compose.py a cada export: não edite ela. `units[i]` é a",
        "  unidade (cuts.json + beat do storyboard em plan.json), `fx[i]` o filmburn (`transicao` do beat),",
        "  `audio.sfx[i]` o SFX (sfx_map.json). Mudanças vão na origem; exceção pontual em edit/compose.json + --spec.",
        "",
      ]
    : [];

  return [
    "Você é o editor do Takekit. Trabalhe APENAS via as skills e scripts do pipeline.",
    "",
    ...context,
    ...history,
    "",
    "Pedido do usuário:",
    input.userPrompt,
    "",
    ...annotations,
    "Primeiro decida o que a mensagem pede:",
    "- Pergunta, dúvida ou conversa sobre o vídeo (ex.: \"por que…\", \"o que acha…\", \"como funciona…\"):",
    "  só responda. Investigue o que precisar (ler arquivos, ffprobe, ver frames com frame.py --out /tmp), mas",
    "  não edite arquivos do projeto, não rode trim/palco_b/compose/captions/motion e não exporte. Se a resposta",
    "  sugerir uma mudança, diga o que faria e pergunte se deve aplicar. Não imprima TAKEKIT_PREVIEW.",
    "- Pedido de mudança no vídeo: aplique pelas skills/scripts (não reescreva a lógica deles; invoque-os)" +
      (annotations.length ? ", aplique todas as notas e diga, item por item, o que mudou." : "."),
    "Quando houver mudança, ao terminar:",
    `1) Gere o mp4 final em ${join(input.projectPath, "exports")}/ (nome sugerido: final.mp4 ou timestamp).`,
    "2) Imprima na ÚLTIMA linha exatamente: TAKEKIT_PREVIEW=<caminho-absoluto-do-mp4>",
    "Se falhar, explique o erro e saia com código ≠ 0.",
  ].join("\n");
}

/** Last `TAKEKIT_PREVIEW=<path>` in stdout (tolerates markdown backticks). */
export function parsePreviewMarker(stdout: string): string | null {
  const matches = [...stdout.matchAll(/TAKEKIT_PREVIEW=([^\r\n`]+)/g)];
  const last = matches.at(-1)?.[1]?.trim();
  return last ? last : null;
}

/** `path` (absolute or relative to baseDir) if it is a file modified at/after `since` (ms). */
async function freshFile(path: string | null, baseDir: string, since: number): Promise<string | null> {
  if (!path) return null;
  const abs = isAbsolute(path) ? path : resolve(baseDir, path);
  try {
    const info = await stat(abs);
    return info.isFile() && info.mtimeMs >= since ? abs : null;
  } catch {
    return null;
  }
}

/** Newest `*.mp4` (by mtime) anywhere under `dir`, or null. */
async function newestMp4(dir: string): Promise<string | null> {
  let best: { path: string; mtime: number } | null = null;
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".mp4")) {
        const { mtimeMs } = await stat(full);
        if (!best || mtimeMs > best.mtime) best = { path: full, mtime: mtimeMs };
      }
    }
  }
  await walk(dir);
  return (best as { path: string } | null)?.path ?? null;
}

async function readable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

function tail(text: string, max: number): string {
  if (text.length <= max) return text;
  return `…[truncated]\n${text.slice(-max)}`;
}

const BIN_ENV: Record<string, string> = {
  codex: "CODEX_BIN",
  "grok-build": "GROK_BIN",
  opencode: "OPENCODE_BIN",
};

function binFromEnv(executorId: string): string | undefined {
  const name = BIN_ENV[executorId];
  return name ? process.env[name]?.trim() || undefined : undefined;
}
