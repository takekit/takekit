import { randomUUID } from "node:crypto";
import type { Job, Message, Thread } from "./types.js";
import { DEFAULT_PROJECT_PATH, DEFAULT_STYLE_ID } from "./config.js";

/** In-memory store for scaffold — no DB yet */
const threads = new Map<string, Thread>();
const jobs = new Map<string, Job>();

function now(): string {
  return new Date().toISOString();
}

function seed(): void {
  if (threads.size > 0) return;

  const t1: Thread = {
    id: randomUUID(),
    title: "09-jev (guinea pig)",
    projectPath: DEFAULT_PROJECT_PATH,
    styleId: DEFAULT_STYLE_ID,
    createdAt: now(),
    updatedAt: now(),
    messages: [
      {
        id: randomUUID(),
        role: "system",
        content:
          "Thread ligada ao projeto DEFAULT 09-jev em ai-content-agent. " +
          "Mensagens disparam o executor (Claude Code) via ProjectRunner.",
        createdAt: now(),
      },
      {
        id: randomUUID(),
        role: "assistant",
        content:
          "Harness scaffold pronto. Envie um briefing ou pedido de edição — " +
          "ainda não gera o vídeo end-to-end; o adapter só spawna o CLI.",
        createdAt: now(),
      },
    ],
    previewPath: null,
    lastJobId: null,
  };

  const t2: Thread = {
    id: randomUUID(),
    title: "Novo projeto (mock)",
    projectPath: DEFAULT_PROJECT_PATH,
    styleId: DEFAULT_STYLE_ID,
    createdAt: now(),
    updatedAt: now(),
    messages: [
      {
        id: randomUUID(),
        role: "assistant",
        content: "Thread mock — troque o projectPath ao criar threads reais.",
        createdAt: now(),
      },
    ],
    previewPath: null,
    lastJobId: null,
  };

  threads.set(t1.id, t1);
  threads.set(t2.id, t2);
}

seed();

export function listThreads(): Thread[] {
  return [...threads.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getThread(id: string): Thread | undefined {
  return threads.get(id);
}

export function createThread(input: {
  title?: string;
  projectPath?: string;
  styleId?: string;
}): Thread {
  const thread: Thread = {
    id: randomUUID(),
    title: input.title?.trim() || "Untitled project",
    projectPath: input.projectPath?.trim() || DEFAULT_PROJECT_PATH,
    styleId: input.styleId?.trim() || DEFAULT_STYLE_ID,
    createdAt: now(),
    updatedAt: now(),
    messages: [],
    previewPath: null,
    lastJobId: null,
  };
  threads.set(thread.id, thread);
  return thread;
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
  const thread = threads.get(input.threadId);
  if (thread) {
    thread.lastJobId = job.id;
    thread.updatedAt = now();
  }
  return job;
}

export function updateJob(id: string, patch: Partial<Job>): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, patch, { updatedAt: now() });
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function setThreadPreview(
  threadId: string,
  previewPath: string | null,
): void {
  const thread = threads.get(threadId);
  if (!thread) return;
  thread.previewPath = previewPath;
  thread.updatedAt = now();
}
