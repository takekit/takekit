import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import type { Job, JobMode, Message, StageStatus, Thread } from "./types.js";
import { PIPELINE_STEPS, type ActivityItem, type ActivityUpdate, type StepState } from "./activity.js";
import {
  DATA_DIR,
  DEFAULT_STYLE_ID,
  defaultProjectPath,
  writeJsonAtomic,
} from "./config.js";

/**
 * JSON-on-disk store.
 *
 *   <DATA_DIR>/threads/<threadId>.json   canonical thread state
 *   <DATA_DIR>/jobs/<jobId>.json         job status / error / truncated output
 *
 * Everything is loaded into memory at boot; every mutation rewrites the
 * affected file atomically (temp + rename).
 */
const THREADS_DIR = join(DATA_DIR, "threads");
const JOBS_DIR = join(DATA_DIR, "jobs");

const threads = new Map<string, Thread>();
const jobs = new Map<string, Job>();

function now(): string {
  return new Date().toISOString();
}

function persistThread(thread: Thread): void {
  writeJsonAtomic(join(THREADS_DIR, `${thread.id}.json`), thread);
}

function persistJob(job: Job): void {
  writeJsonAtomic(join(JOBS_DIR, `${job.id}.json`), job);
}

function readJsonDir<T>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  const out: T[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, name), "utf8")) as T);
    } catch (err) {
      console.warn(`[takekit-engine] skipping unreadable ${join(dir, name)}:`, err);
    }
  }
  return out;
}

/** Fill fields added after a thread file was first written. */
function normalizeThread(raw: Thread): Thread {
  const inputs = raw.inputVideoPaths ?? (raw.inputVideoPath ? [raw.inputVideoPath] : []);
  return {
    ...raw,
    briefing: raw.briefing ?? "",
    inputVideoPaths: inputs,
    inputVideoPath: inputs[0] ?? null,
    messages: raw.messages ?? [],
    previewPath: raw.previewPath ?? null,
    previewUpdatedAt: raw.previewUpdatedAt ?? null,
    stageStatus: raw.stageStatus ?? initialStages(inputs.length > 0),
    lastJobId: raw.lastJobId ?? null,
    lastJobStatus: raw.lastJobStatus ?? null,
  };
}

function initialStages(hasInput: boolean): StageStatus {
  return {
    ingest: hasInput ? "done" : "pending",
    edit: "pending",
    export: "pending",
  };
}

function load(): void {
  // Seed the guinea-pig thread on a fresh install only, not every time the list gets emptied.
  const fresh = !existsSync(THREADS_DIR);
  mkdirSync(THREADS_DIR, { recursive: true });
  mkdirSync(JOBS_DIR, { recursive: true });

  for (const job of readJsonDir<Job>(JOBS_DIR)) jobs.set(job.id, job);
  for (const raw of readJsonDir<Thread>(THREADS_DIR)) {
    threads.set(raw.id, normalizeThread(raw));
  }

  // Jobs that were queued/running when the engine died will never finish.
  for (const job of jobs.values()) {
    if (job.status !== "queued" && job.status !== "running") continue;
    const error = "Engine reiniciado durante o job — execução interrompida.";
    for (const item of job.activity ?? []) if (item.status === "running") item.status = "failed";
    updateJob(job.id, {
      status: "failed",
      finishedAt: now(),
      error,
      exitCode: job.exitCode ?? 1,
    });
    setThreadStage(job.threadId, { edit: "failed" });
    appendMessage(job.threadId, {
      role: "system",
      content: `Job failed: ${error}`,
      jobId: job.id,
    });
  }

  if (fresh && threads.size === 0) seed();
}

function seed(): void {
  const thread = createThread({
    title: "09-jev (guinea pig)",
    projectPath: defaultProjectPath(),
    styleId: DEFAULT_STYLE_ID,
    ensureLayout: false,
  });
  appendMessage(thread.id, {
    role: "system",
    content:
      "Thread ligada ao projeto DEFAULT 09-jev (pipeline/video/projects/09-jev). " +
      "Mensagens disparam o executor configurado (default: Claude Code, modelo opus) via ProjectRunner.",
  });
}

export function listThreads(): Thread[] {
  return [...threads.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getThread(id: string): Thread | undefined {
  return threads.get(id);
}

/**
 * Create the project folder layout (spec §3.1) without touching existing files.
 * Returns warnings instead of throwing so thread creation never fails on fs.
 */
function ensureProjectLayout(projectPath: string, briefing: string): string[] {
  const warnings: string[] = [];
  try {
    for (const sub of ["input", "edit", "exports"]) {
      mkdirSync(join(projectPath, sub), { recursive: true });
    }
    const briefingPath = join(projectPath, "briefing.md");
    if (!existsSync(briefingPath)) {
      writeFileSync(briefingPath, briefing ? `${briefing}\n` : "", "utf8");
    }
  } catch (err) {
    warnings.push(
      `Não consegui preparar a pasta do projeto (${projectPath}): ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  return warnings;
}

export function createThread(input: {
  title?: string;
  projectPath?: string;
  styleId?: string;
  inputVideoPaths?: string[];
  briefing?: string;
  ensureLayout?: boolean;
}): Thread {
  const picked = [...new Set((input.inputVideoPaths ?? []).map((p) => p.trim()).filter(Boolean))];
  const briefing = input.briefing?.trim() ?? "";
  const projectPath = input.projectPath?.trim() || defaultProjectPath();
  const notes: string[] = [];
  const warnings = input.ensureLayout === false ? [] : ensureProjectLayout(projectPath, briefing);
  // Footage from outside the project gets a link in input/, so the project stays self-contained.
  const inputs = picked.map((path) => {
    if (!existsSync(path)) {
      warnings.push(`Vídeo de entrada não encontrado: ${path}`);
      return path;
    }
    if (isInside(projectPath, path) || input.ensureLayout === false) return path;
    try {
      const link = linkIntoInput(projectPath, path);
      notes.push(`${basename(path)} ligado em ${relative(projectPath, link)} (link para ${path}).`);
      return link;
    } catch (err) {
      warnings.push(`Não consegui ligar ${path} em input/: ${err instanceof Error ? err.message : String(err)}`);
      return path;
    }
  });

  const thread: Thread = {
    id: randomUUID(),
    title: input.title?.trim() || "Untitled project",
    projectPath,
    styleId: input.styleId?.trim() || DEFAULT_STYLE_ID,
    briefing,
    inputVideoPaths: inputs,
    inputVideoPath: inputs[0] ?? null,
    createdAt: now(),
    updatedAt: now(),
    messages: [],
    previewPath: null,
    previewUpdatedAt: null,
    stageStatus: initialStages(inputs.length > 0),
    lastJobId: null,
    lastJobStatus: null,
  };
  threads.set(thread.id, thread);

  if (inputs.some((p) => !existsSync(p))) thread.stageStatus.ingest = "failed";
  for (const content of [...notes, ...warnings]) {
    thread.messages.push({ id: randomUUID(), role: "system", content, createdAt: now() });
  }

  persistThread(thread);
  return thread;
}

function isInside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
}

/** Symlink `source` into <project>/input/, reusing a link that already points at it. */
function linkIntoInput(projectPath: string, source: string): string {
  const dir = join(projectPath, "input");
  mkdirSync(dir, { recursive: true });
  const ext = extname(source);
  const stem = basename(source, ext);
  for (let n = 1; n < 100; n++) {
    const link = join(dir, n === 1 ? `${stem}${ext}` : `${stem}-${n}${ext}`);
    let existing;
    try {
      existing = lstatSync(link);
    } catch {
      symlinkSync(resolve(source), link);
      return link;
    }
    if (existing.isSymbolicLink() && resolve(dir, readlinkSync(link)) === resolve(source)) return link;
  }
  throw new Error("nomes esgotados em input/");
}

export function appendMessage(
  threadId: string,
  message: Omit<Message, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Message | undefined {
  const thread = threads.get(threadId);
  if (!thread) return undefined;
  const msg: Message = {
    id: message.id ?? randomUUID(),
    role: message.role,
    content: message.content,
    createdAt: message.createdAt ?? now(),
    jobId: message.jobId,
  };
  thread.messages.push(msg);
  thread.updatedAt = now();
  persistThread(thread);
  return msg;
}

export function createJob(input: {
  threadId: string;
  prompt: string;
  projectPath: string;
}): Job {
  const job: Job = {
    id: randomUUID(),
    threadId: input.threadId,
    status: "queued",
    prompt: input.prompt,
    projectPath: input.projectPath,
    createdAt: now(),
    updatedAt: now(),
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    stdout: "",
    stderr: "",
    error: null,
    previewPath: null,
  };
  jobs.set(job.id, job);
  persistJob(job);
  const thread = threads.get(input.threadId);
  if (thread) {
    thread.lastJobId = job.id;
    thread.lastJobStatus = job.status;
    thread.lastJobMode = null;
    thread.updatedAt = now();
    persistThread(thread);
  }
  return job;
}

export function updateJob(id: string, patch: Partial<Job>): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, patch, { updatedAt: now() });
  clearTimeout(persistTimers.get(id));
  persistTimers.delete(id);
  persistJob(job);

  const thread = threads.get(job.threadId);
  if (thread && thread.lastJobId === job.id && thread.lastJobStatus !== job.status) {
    thread.lastJobStatus = job.status;
    thread.updatedAt = now();
    persistThread(thread);
  }
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

const MAX_ACTIVITY = 600;
/** Activity arrives in bursts: write the job file at most every 800 ms while it streams. */
const persistTimers = new Map<string, NodeJS.Timeout>();
function persistJobSoon(job: Job): void {
  if (persistTimers.has(job.id)) return;
  persistTimers.set(
    job.id,
    setTimeout(() => {
      persistTimers.delete(job.id);
      persistJob(job);
    }, 800),
  );
}

/** Insert or merge one activity row (by id); returns the stored row. */
export function upsertActivity(jobId: string, update: ActivityUpdate): ActivityItem | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;
  const list = (job.activity ??= []);
  const seq = (job.activitySeq = (job.activitySeq ?? 0) + 1);
  const i = list.findIndex((a) => a.id === update.id);
  let item: ActivityItem;
  if (i >= 0) {
    item = { ...list[i], ...stripUndefined(update), seq };
    list[i] = item;
  } else {
    item = { kind: "tool", title: "", startedAt: now(), ...stripUndefined(update), id: update.id, seq };
    list.push(item);
    if (list.length > MAX_ACTIVITY) list.splice(0, list.length - MAX_ACTIVITY);
  }
  job.updatedAt = now();
  persistJobSoon(job);
  return item;
}

/** Rows changed after `after` (a seq the client already has). */
export function activitySince(jobId: string, after: number): { items: ActivityItem[]; seq: number } {
  const job = jobs.get(jobId);
  const items = (job?.activity ?? []).filter((a) => a.seq > after);
  return { items, seq: job?.activitySeq ?? 0 };
}

/** Set one pipeline step on the thread, keeping pipeline order. */
export function setThreadPipelineStep(threadId: string, step: string, state: StepState): void {
  const thread = threads.get(threadId);
  if (!thread) return;
  const next = { ...(thread.pipeline ?? {}), [step]: state };
  thread.pipeline = Object.fromEntries(
    PIPELINE_STEPS.map((s) => s.key)
      .filter((k) => k in next)
      .map((k) => [k, next[k]]),
  );
  thread.updatedAt = now();
  persistThread(thread);
}

export function setThreadArchived(threadId: string, archived: boolean): Thread | undefined {
  const thread = threads.get(threadId);
  if (!thread) return undefined;
  thread.archivedAt = archived ? now() : null;
  persistThread(thread);
  return thread;
}

export function threadsOfProject(projectPath: string): Thread[] {
  return [...threads.values()].filter((t) => t.projectPath === projectPath);
}

/** Forget a project: its threads and their jobs leave the store and the data dir. */
export function removeProjectThreads(projectPath: string): number {
  const gone = threadsOfProject(projectPath);
  for (const thread of gone) {
    for (const job of [...jobs.values()]) {
      if (job.threadId !== thread.id) continue;
      clearTimeout(persistTimers.get(job.id));
      persistTimers.delete(job.id);
      jobs.delete(job.id);
      rmSync(join(JOBS_DIR, `${job.id}.json`), { force: true });
    }
    threads.delete(thread.id);
    rmSync(join(THREADS_DIR, `${thread.id}.json`), { force: true });
  }
  return gone.length;
}

/** Record what the job turned out to be (on the job and as the thread's last job mode). */
export function setJobMode(jobId: string, mode: JobMode): void {
  const job = jobs.get(jobId);
  if (!job || job.mode === mode) return;
  job.mode = mode;
  persistJob(job);
  const thread = threads.get(job.threadId);
  if (thread && thread.lastJobId === jobId) {
    thread.lastJobMode = mode;
    persistThread(thread);
  }
}

export function resetThreadPipeline(threadId: string): void {
  const thread = threads.get(threadId);
  if (!thread) return;
  thread.pipeline = {};
  persistThread(thread);
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** True while the thread's last job is still queued/running. */
export function threadHasActiveJob(threadId: string): boolean {
  const status = threads.get(threadId)?.lastJobStatus;
  return status === "queued" || status === "running";
}

export function setThreadPreview(
  threadId: string,
  previewPath: string | null,
): void {
  const thread = threads.get(threadId);
  if (!thread) return;
  thread.previewPath = previewPath;
  thread.previewUpdatedAt = now();
  thread.updatedAt = now();
  persistThread(thread);
}

export function setThreadStage(threadId: string, patch: StageStatus): void {
  const thread = threads.get(threadId);
  if (!thread) return;
  thread.stageStatus = { ...thread.stageStatus, ...patch };
  thread.updatedAt = now();
  persistThread(thread);
}

load();
