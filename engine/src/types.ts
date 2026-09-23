export type JobStatus = "queued" | "running" | "succeeded" | "failed";

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
  status: JobStatus;
  prompt: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string | null;
  previewPath?: string | null;
}

export interface ProjectSummary {
  id: string;
  path: string;
  label: string;
  styleId: string;
}
