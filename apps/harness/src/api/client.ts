const ENGINE_URL = import.meta.env.VITE_ENGINE_URL?.replace(/\/$/, "") ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  jobId?: string;
}

export interface Thread {
  id: string;
  title: string;
  projectPath: string;
  styleId: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  previewPath?: string | null;
  lastJobId?: string | null;
}

export interface Job {
  id: string;
  threadId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  prompt: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  previewPath?: string | null;
}

export function listThreads() {
  return request<{ threads: Thread[] }>("/api/threads");
}

export function getThread(id: string) {
  return request<{ thread: Thread }>(`/api/threads/${id}`);
}

export function createThread(body: {
  title?: string;
  projectPath?: string;
  styleId?: string;
}) {
  return request<{ thread: Thread }>("/api/threads", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postMessage(threadId: string, content: string, run = true) {
  return request<{ message: Message; job: Job | null }>(
    `/api/threads/${threadId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content, run }),
    },
  );
}

export function getJob(id: string) {
  return request<{ job: Job }>(`/api/jobs/${id}`);
}

export function previewUrl(threadId: string): string {
  return `${ENGINE_URL}/api/threads/${threadId}/preview`;
}
