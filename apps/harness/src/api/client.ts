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

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

/**
 * What a job turned out to be, decided by the agent: "chat" answered without touching the
 * project, "edit" changed it (pipeline / files). Null while the run hasn't shown which.
 */
export type JobMode = "chat" | "edit";

export interface Thread {
  id: string;
  title: string;
  projectPath: string;
  styleId: string;
  briefing?: string;
  /** Raw footage, in the order it was picked. */
  inputVideoPaths?: string[];
  inputVideoPath?: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  previewPath?: string | null;
  previewUpdatedAt?: string | null;
  stageStatus?: Record<string, "pending" | "running" | "done" | "failed">;
  lastJobId?: string | null;
  lastJobStatus?: JobStatus | null;
  lastJobMode?: JobMode | null;
  /** Pipeline steps the last job ran (trim, palco_b, compose…), in pipeline order. */
  pipeline?: Record<string, StepState>;
  /** Out of the thread list, restorable. */
  archivedAt?: string | null;
}

export function isThreadBusy(thread: Thread | null): boolean {
  return thread?.lastJobStatus === "queued" || thread?.lastJobStatus === "running";
}

export interface Job {
  id: string;
  threadId: string;
  status: JobStatus;
  prompt: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  previewPath?: string | null;
}

/** Where the UI talks to the engine ("" = same origin through the Vite proxy). */
export function engineBaseUrl(): string {
  return ENGINE_URL || `${window.location.origin} (proxy → 127.0.0.1:8787)`;
}

export interface EngineHealth {
  ok: boolean;
  pipelineRoot: string;
  defaultProject: string;
  dataDir: string;
}

export function getHealth() {
  return request<EngineHealth>("/api/health");
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
  inputVideoPaths?: string[];
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

export function setThreadArchived(id: string, archived: boolean) {
  return request<{ thread: Thread }>(`/api/threads/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

/** Removes the project's threads from Takekit; `trash` also sends the folder to the Trash. */
export function deleteProject(path: string, trash: boolean) {
  return request<{ removedThreads: number; trashed: boolean }>("/api/projects", {
    method: "DELETE",
    body: JSON.stringify({ path, trash }),
  });
}

export function getJob(id: string) {
  return request<{ job: Job }>(`/api/jobs/${id}`);
}

export interface EngineConfig {
  executorId: string;
  model: string;
  /** Reasoning effort in the executor's vocabulary; "" = CLI default. */
  effort: string;
  pipelineRoot: string;
  claudeBin: string;
  /** Every executor runs without approval prompts. */
  skipPermissions: boolean;
}

export interface ModelOption {
  id: string;
  label: string;
  aliases?: string[];
  efforts?: string[];
  defaultEffort?: string;
}

export interface ExecutorInfo {
  id: string;
  label: string;
  defaultModel?: string;
  models?: ModelOption[];
}

export interface ConfigResponse {
  config: EngineConfig;
  configPath: string;
  envOverrides: Array<keyof EngineConfig>;
  executorIds: string[];
  executors?: ExecutorInfo[];
}

export function getConfig() {
  return request<ConfigResponse>("/api/config");
}

export function putConfig(patch: Partial<EngineConfig>) {
  return request<ConfigResponse>("/api/config", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export interface ProjectSummary {
  id: string;
  path: string;
  label: string;
  styleId: string;
}

export function listProjects() {
  return request<{ projects: ProjectSummary[]; pipelineRoot: string }>("/api/projects");
}

export type TrackKind = "video" | "broll" | "title" | "caption" | "fx" | "voice" | "music" | "sfx";

export interface TimelineTrack {
  id: string;
  slot: string;
  name: string;
  kind: TrackKind;
  muted?: boolean;
  clips: Array<{ start: number; end: number; label: string; ref?: string }>;
}

/** Read-only edit timeline (seconds on the record timeline). */
export interface Timeline {
  source: "compose" | "build.json" | "cuts.json";
  /** Source file relative to the project, e.g. "edit/build.json". */
  sourcePath?: string;
  fps: number;
  duration: number;
  tracks: TimelineTrack[];
  markers: Array<{ at: number; label: string }>;
}

export function getTimeline(threadId: string) {
  return request<{ timeline: Timeline | null }>(`/api/threads/${threadId}/timeline`);
}

/** `version` cache-busts the <video> so a re-export is not served stale. */
export function previewUrl(threadId: string, version?: string | null): string {
  const base = `${ENGINE_URL}/api/threads/${threadId}/preview`;
  return version ? `${base}?t=${encodeURIComponent(version)}` : base;
}

/** Inputs of a thread, oldest clients only had `inputVideoPath`. */
export function threadInputs(thread: Thread): string[] {
  return thread.inputVideoPaths ?? (thread.inputVideoPath ? [thread.inputVideoPath] : []);
}

// ── Disk (project / video pickers) ──

export interface DirEntry {
  name: string;
  path: string;
  /** Has the project layout (input/, edit/ or briefing.md). */
  project: boolean;
  /** Videos directly inside it or its input/. */
  videos: number;
}

export interface DirListing {
  path: string;
  parent: string | null;
  home: string;
  entries: DirEntry[];
  truncated: boolean;
}

/** Subfolders of `path` (default: the pipeline's video/projects). */
export function listDir(path?: string) {
  return request<DirListing>(`/api/fs/list${path ? `?path=${encodeURIComponent(path)}` : ""}`);
}

export function makeDir(parent: string, name: string) {
  return request<{ path: string }>("/api/fs/mkdir", {
    method: "POST",
    body: JSON.stringify({ parent, name }),
  });
}

export interface VideoFile {
  path: string;
  /** Relative to the project ("input/IMG_8187.mov"). */
  rel: string;
  name: string;
  size: number;
  mtime: string;
  /** Under edit/ or exports/: a render, not footage. */
  generated: boolean;
  duration: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
}

export function listVideos(root: string) {
  return request<{ root: string; videos: VideoFile[]; truncated: boolean }>(
    `/api/fs/videos?root=${encodeURIComponent(root)}`,
  );
}

export const thumbUrl = (path: string) => `${ENGINE_URL}/api/fs/thumb?path=${encodeURIComponent(path)}`;
export const videoFileUrl = (path: string) => `${ENGINE_URL}/api/fs/video?path=${encodeURIComponent(path)}`;

// ── Live job activity ──

export type StepState = "pending" | "running" | "done" | "failed";
export type ActivityKind = "message" | "command" | "read" | "edit" | "search" | "web" | "agent" | "plan" | "tool" | "error";

export interface PlanEntry {
  text: string;
  status: "pending" | "active" | "done";
}

/** One row of what the agent is doing (tool call, message, plan), merged by id. */
export interface ActivityItem {
  id: string;
  seq: number;
  kind: ActivityKind;
  title: string;
  detail?: string;
  output?: string;
  status?: "running" | "done" | "failed";
  startedAt: string;
  endedAt?: string;
  step?: string;
  plan?: PlanEntry[];
}

export interface ActivityPage {
  items: ActivityItem[];
  seq: number;
  status: JobStatus;
  mode: JobMode | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export function getActivity(jobId: string, after = 0) {
  return request<ActivityPage>(`/api/jobs/${jobId}/activity?after=${after}`);
}

export function cancelJob(jobId: string) {
  return request<{ ok: true }>(`/api/jobs/${jobId}/cancel`, { method: "POST" });
}
