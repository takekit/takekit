import { randomUUID } from "node:crypto";
import { access, readdir, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { getExecutor } from "./adapters/index.js";
import { getConfig } from "./config.js";
import {
  createJob,
  getJob,
  getThread,
  resetThreadPipeline,
  setJobMode,
  setThreadPipelineStep,
  setThreadPreview,
  setThreadSession,
  setThreadStage,
  updateJob,
  upsertActivity,
  appendMessage,
} from "./store.js";
import { getStyle, type StyleKit } from "./styles.js";
import type { ActivityItem, ActivityUpdate } from "./activity.js";
import type { ExecutorResult, LiveInput } from "./adapters/types.js";
import type { HarnessSession, Job, Message, SteerDelivery, Thread } from "./types.js";

/** A job while it runs: stop it, hand it a message, or stop just the current CLI turn. */
interface RunHandle {
  controller: AbortController;
  live: LiveInput;
  /** Stops the current turn only (the job resumes the session with the queued messages). */
  interruptTurn: (() => void) | null;
  /** Session the current turn runs in, once known. */
  session: () => string | undefined;
}

const runs = new Map<string, RunHandle>();
/** Messages sent mid-run that still have to reach the agent, per job. */
const steers = new Map<string, string[]>();

/** Ask a running job to stop (SIGTERM to the CLI). False when it isn't running. */
export function cancelJob(jobId: string): boolean {
  const run = runs.get(jobId);
  if (!run) return false;
  updateJob(jobId, { cancelRequested: true });
  steers.delete(jobId);
  run.controller.abort();
  return true;
}

const DELIVERY_NOTE: Record<SteerDelivery, string> = {
  live: "Entregue ao agente; ele considera no próximo passo.",
  interrupt: "Interrompeu o passo atual; o agente retoma a sessão com ela.",
  next: "Entra assim que o passo atual terminar.",
};

/**
 * A user message sent while the job runs. Straight into the CLI when it takes input mid-run
 * (Claude); otherwise the current turn stops and the same session resumes with it (Codex,
 * Grok, OpenCode). Null when the job isn't running: the caller starts a new job instead.
 */
export function steerJob(jobId: string, text: string): SteerDelivery | null {
  const run = runs.get(jobId);
  if (!run || getJob(jobId)?.cancelRequested) return null;
  let delivery: SteerDelivery;
  if (run.live.send?.(`[Mensagem nova do usuário enquanto você trabalha; leve em conta a partir de agora:]\n${text}`)) {
    delivery = "live";
  } else {
    steers.set(jobId, [...(steers.get(jobId) ?? []), text]);
    delivery = run.interruptTurn && run.session() ? "interrupt" : "next";
    if (delivery === "interrupt") run.interruptTurn!();
  }
  upsertActivity(jobId, { id: `user-${randomUUID()}`, kind: "user", title: clip(text, 400), detail: DELIVERY_NOTE[delivery], status: "done" });
  return delivery;
}

/**
 * ProjectRunner — wires a video project path + prompt to an Executor.
 *
 * Does NOT reimplement the editor-reels pipeline (headless: FFmpeg + RVM).
 * It only:
 *   1) Validates project + pipeline paths exist
 *   2) Builds a prompt that points the agent at editor-reels + the thread's Style Kit package
 *   3) Spawns the configured CI adapter (default: Claude Code, model opus)
 *   4) Discovers the exported mp4 (TAKEKIT_PREVIEW= marker, else newest exports/**.mp4)
 *
 * Every failure path ends with job `failed` + a chat message; this function
 * never rejects (it is fired without await from the HTTP handler).
 *
 * Reference paths (read-only wiring):
 *   skill:     .agents/skills/editor-reels/SKILL.md
 *   style:     styles/<styleId>/ (prompt.md goes into the prompt)
 *   project:   the thread's folder (new ones: <projects root>/NN-name)
 */
export async function runProjectJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  const run: RunHandle = { controller: new AbortController(), live: { send: null }, interruptTurn: null, session: () => undefined };
  runs.set(jobId, run);
  try {
    await runJob(jobId, run);
  } catch (err) {
    failJob(jobId, err instanceof Error ? err.message : String(err));
  } finally {
    runs.delete(jobId);
    settleActivity(jobId);
    const leftover = steers.get(jobId) ?? [];
    steers.delete(jobId);
    if (leftover.length && !getJob(jobId)?.cancelRequested) startFollowUp(job, leftover);
  }
}

/** Messages that arrived while the job was wrapping up run as the thread's next job. */
function startFollowUp(prev: Job, messages: string[]): void {
  const next = createJob({ threadId: prev.threadId, prompt: messages.join("\n\n"), projectPath: prev.projectPath });
  appendMessage(prev.threadId, {
    role: "assistant",
    content: `Job ${next.id} queued on executor ${getConfig().executorId}…`,
    jobId: next.id,
  });
  void runProjectJob(next.id);
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
  closeRunningRows(jobId, job.status === "succeeded" ? "done" : "failed");
  updateJob(jobId, {}); // flush the throttled write
}

function closeRunningRows(jobId: string, status: "done" | "failed"): void {
  const job = getJob(jobId);
  if (!job) return;
  for (const item of job.activity ?? []) {
    if (item.status !== "running") continue;
    upsertActivity(jobId, { id: item.id, status, endedAt: new Date().toISOString() });
    if (item.step) setThreadPipelineStep(job.threadId, item.step, status);
  }
}

/** The run got somewhere (a tool call or an answer), as opposed to dying on start. */
function didWork(jobId: string): boolean {
  return (getJob(jobId)?.activity ?? []).some((a) => a.kind !== "error" && a.kind !== "user");
}

/** Where each CLI prints its session id in the JSON stream a job's stdout keeps. */
const SESSION_IN_LOG: Record<string, RegExp> = {
  "claude-code": /"session_id":"([0-9a-f-]{36})"/,
  "grok-build": /"session_id":"([0-9a-f-]{36})"/,
  codex: /"type":"thread\.started","thread_id":"([0-9a-f-]{36})"/,
  opencode: /"sessionID":"(ses_[A-Za-z0-9]+)"/,
};
const QUEUED_ON = /^Job (\S+) queued on executor (\S+?)…?$/;

/**
 * Threads from before sessions were saved: the last job this executor ran in the thread still
 * has the session id in its logged stdout (first event), so the CLI session can be resumed.
 */
function loggedSession(thread: Thread, executorId: string, currentJobId: string, cwd: string): HarnessSession | undefined {
  const pattern = SESSION_IN_LOG[executorId];
  if (!pattern) return undefined;
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const match = QUEUED_ON.exec(thread.messages[i].content);
    if (!match || match[1] === currentJobId || match[2] !== executorId) continue;
    const job = getJob(match[1]);
    if (!job || job.status === "queued" || job.status === "running") return undefined;
    const id = pattern.exec(job.stdout ?? "")?.[1];
    if (!id) return undefined;
    // It saw the thread up to its own reply.
    const reply = thread.messages.findIndex((m, k) => k > i && m.jobId === job.id);
    return { id, cwd, seen: (reply >= 0 ? reply : i) + 1, updatedAt: job.finishedAt ?? job.updatedAt };
  }
  return undefined;
}

/** Claude and Grok let us name a new session up front; Codex and OpenCode report theirs. */
function newSessionId(executorId: string): string | undefined {
  return executorId === "claude-code" || executorId === "grok-build" ? randomUUID() : undefined;
}

async function runJob(jobId: string, run: RunHandle): Promise<void> {
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

  const style = getStyle(thread?.styleId);
  if (!style) {
    failJob(jobId, `Estilo "${thread?.styleId ?? ""}" não está na galeria (styles/). Crie o pacote ou troque o estilo da thread.`);
    return;
  }

  const executor = getExecutor(config.executorId);
  const cwd = pipelineRoot;
  const fullPrompt = () =>
    composeAgentPrompt({
      pipelineRoot,
      projectPath: job.projectPath,
      inputVideoPaths: thread?.inputVideoPaths ?? [],
      style,
      userPrompt: job.prompt,
      history: thread ? conversationSoFar(thread, jobId) : [],
    });

  // Same harness as before in this thread: resume its CLI session (it already has the skill,
  // the style and what it did), sending only the new request. Otherwise a new session.
  const prior = thread ? (thread.sessions?.[executor.id] ?? loggedSession(thread, executor.id, jobId, cwd)) : undefined;
  const resuming = Boolean(prior && prior.cwd === cwd);
  let session: { id?: string; resume: boolean } = resuming
    ? { id: prior!.id, resume: true }
    : { id: newSessionId(executor.id), resume: false };
  let prompt = resuming
    ? composeResumePrompt({
        projectPath: job.projectPath,
        userPrompt: job.prompt,
        missed: thread ? missedTurns(thread, jobId, prior!.seen) : [],
      })
    : fullPrompt();
  if (resuming) updateJob(jobId, { resumed: true });
  run.session = () => run.live.sessionId ?? session.id;

  const onActivity = (update: ActivityUpdate) => {
    const item = upsertActivity(jobId, update);
    if (item && changesProject(item, [job.projectPath, pipelineRoot])) startEditing();
    if (item?.kind === "command" && item.step && update.status) {
      setThreadPipelineStep(job.threadId, item.step, item.status === "running" ? "running" : item.status === "failed" ? "failed" : "done");
    }
  };

  // One CLI turn per pass. A message that arrives mid-run (and can't go in live) stops the
  // turn and the next pass resumes the same session with it.
  let result: ExecutorResult;
  for (let pass = 0; ; pass++) {
    const turn = new AbortController();
    const stopTurn = () => turn.abort();
    run.controller.signal.addEventListener("abort", stopTurn, { once: true });
    run.interruptTurn = stopTurn;
    run.live.sessionId = undefined;
    // Each pass has a fresh parser: keep its row ids apart from the previous pass's.
    const tag = pass ? `p${pass}:` : "";
    result = await executor.run({
      projectPath: job.projectPath,
      pipelineRoot,
      prompt,
      cwd,
      model: config.model,
      effort: config.effort || undefined,
      // config.claudeBin only applies to Claude; other adapters read their own *_BIN env var.
      bin: executor.id === "claude-code" ? config.claudeBin : binFromEnv(executor.id),
      skipPermissions: config.skipPermissions,
      signal: turn.signal,
      session,
      live: run.live,
      onActivity: (update) => onActivity(tag && update.id !== "plan" ? { ...update, id: tag + update.id } : update),
    });
    run.interruptTurn = null;
    run.controller.signal.removeEventListener("abort", stopTurn);
    const id = result.sessionId ?? run.live.sessionId ?? session.id;
    if (id) session = { id, resume: true };
    if (run.controller.signal.aborted) break; // cancelled by the user

    const pending = steers.get(jobId) ?? [];
    if (pending.length && session.id) {
      steers.delete(jobId);
      const interrupted = turn.signal.aborted;
      if (interrupted) closeRunningRows(jobId, "failed");
      prompt = composeSteerPrompt({ projectPath: job.projectPath, messages: pending, interrupted });
      continue;
    }
    // The saved session is gone (CLI cleaned it up, other machine…): start over once, full prompt.
    if (pass === 0 && resuming && result.exitCode !== 0 && !didWork(jobId)) {
      upsertActivity(jobId, {
        id: "fresh-session",
        kind: "tool",
        title: "Sessão anterior indisponível; começando uma nova com o contexto completo",
        status: "done",
      });
      updateJob(jobId, { resumed: false });
      session = { id: newSessionId(executor.id), resume: false };
      prompt = fullPrompt();
      continue;
    }
    break;
  }
  // JSON-streaming adapters hand back the final answer; stdout is then the raw event log.
  const answer = (result.text ?? result.stdout).trim();
  // Next message in this thread (same harness) continues this session.
  const rememberSession = () => {
    if (!session.id) return;
    setThreadSession(job.threadId, executor.id, {
      id: session.id,
      cwd,
      model: config.model,
      seen: getThread(job.threadId)?.messages.length ?? 0,
      updatedAt: new Date().toISOString(),
    });
  };

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
    rememberSession();
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
    rememberSession();
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
  rememberSession();
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

type Turn = { role: "user" | "assistant"; text: string };

/** Past turns of the thread for a new session's prompt (a new CLI session has no memory). */
function conversationSoFar(thread: Thread, currentJobId: string): Turn[] {
  return turnsOf(thread.messages.slice(0, requestIndex(thread, currentJobId)));
}

/** Turns a resumed session didn't see (another harness answered them), since `seen`. */
function missedTurns(thread: Thread, currentJobId: string, seen: number): Turn[] {
  const upTo = requestIndex(thread, currentJobId);
  return turnsOf(thread.messages.slice(Math.min(seen, upTo), upTo));
}

/** Index of the user message that started the job (it goes in as the request itself). */
function requestIndex(thread: Thread, jobId: string): number {
  const queued = thread.messages.findIndex((m) => m.jobId === jobId);
  return queued >= 0 ? queued - 1 : thread.messages.length - 1;
}

function turnsOf(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
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
  style: StyleKit;
  userPrompt: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
}): string {
  const context = [
    `ROOT do pipeline (cwd): ${input.pipelineRoot}`,
    "Skill principal: .agents/skills/editor-reels/SKILL.md",
    `Estilo da thread: ${input.style.name} (id ${input.style.id}). Pacote Style Kit: ${input.style.dir}/`,
    "  prompt.md (abaixo), storyboard.md, stage-scheme.json, caption.json, cuts.json, sound-effects.json,",
    "  transitions.json, engine-scripts.json. O pacote substitui o default citado na skill.",
    "Workflow: video/resolve/WORKFLOW.md",
    "Render sem Resolve: video/headless/README.md (Python: .venv/bin/python; trim.py → palco_b.py → compose.py)",
    `Projeto de vídeo: ${input.projectPath}`,
    ...(input.inputVideoPaths.length > 1
      ? ["Vídeos de entrada (na ordem escolhida):", ...input.inputVideoPaths.map((p, i) => `  ${i + 1}) ${p}`)]
      : [`Vídeo de entrada: ${input.inputVideoPaths[0] ?? "(não informado; procure em <projeto>/input/)"}`]),
  ];
  const styleBrief = input.style.promptMarkdown
    ? ["", `Briefing do estilo (${input.style.id}/prompt.md):`, "<style-brief>", input.style.promptMarkdown, "</style-brief>"]
    : [];
  const history = input.history.length
    ? [
        "",
        "Conversa até aqui nesta thread (mais antiga primeiro; use como contexto):",
        ...input.history.map((t) => `[${t.role === "user" ? "usuário" : "você"}] ${t.text}`),
      ]
    : [];
  const annotations = annotationNotes(input.userPrompt);

  return [
    "Você é o editor do Takekit. Trabalhe APENAS via as skills e scripts do pipeline.",
    "",
    ...context,
    ...styleBrief,
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

/**
 * Next message of a resumed session: the session already has the skill, the style brief and
 * the rules, so only what's new goes in (plus a one-line reminder of the output contract).
 */
function composeResumePrompt(input: { projectPath: string; userPrompt: string; missed: Turn[] }): string {
  const annotations = annotationNotes(input.userPrompt);
  return [
    "[Nova mensagem nesta thread do Takekit. Projeto, estilo e regras são os do início desta sessão.]",
    ...(input.missed.length
      ? [
          "",
          "Na thread, desde o seu último turno (outro agente atendeu; mais antiga primeiro):",
          ...input.missed.map((t) => `[${t.role === "user" ? "usuário" : "agente"}] ${t.text}`),
        ]
      : []),
    "",
    "Pedido do usuário:",
    input.userPrompt,
    "",
    ...annotations,
    reminder(input.projectPath),
  ].join("\n");
}

/** Resume after messages that came in mid-run (the turn may have been cut off). */
function composeSteerPrompt(input: { projectPath: string; messages: string[]; interrupted: boolean }): string {
  return [
    input.interrupted
      ? "[O usuário mandou mensagem enquanto você trabalhava e eu interrompi seu turno para entregar. Confira o que" +
        " já ficou pronto (o último comando pode ter sido cortado no meio) e continue de onde parou, levando isto em conta:]"
      : "[Mensagem do usuário que chegou enquanto você trabalhava; continue levando isto em conta:]",
    "",
    ...input.messages,
    "",
    reminder(input.projectPath),
  ].join("\n");
}

function reminder(projectPath: string): string {
  return (
    "Lembrete: pergunta → só responda (sem editar nem exportar). Mudança → aplique pelos scripts; ao exportar," +
    ` gere o mp4 em ${join(projectPath, "exports")}/ e imprima na ÚLTIMA linha TAKEKIT_PREVIEW=<caminho-absoluto-do-mp4>.`
  );
}

/** How to read a <timeline-context> block, when the request carries one. */
function annotationNotes(userPrompt: string): string[] {
  return userPrompt.includes("<timeline-context")
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
