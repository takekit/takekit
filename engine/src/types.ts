import type { ActivityItem, StepState } from "./activity.js";
import type { ModuleSelection } from "./styles.js";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

/**
 * What a job turned out to be. The agent decides from the message: "chat" answered
 * without touching the project, "edit" changed it (pipeline / files). Unset while running
 * until the first change shows up.
 */
export type JobMode = "chat" | "edit";

/**
 * How a message sent while a job ran reached the agent: "live" straight into the running
 * CLI, "interrupt" by stopping the current turn and resuming the session with it, "next"
 * right after the current turn (the CLI hadn't shown its session id yet).
 */
export type SteerDelivery = "live" | "interrupt" | "next";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  jobId?: string;
  /** Set on user messages sent while a job was running. */
  delivery?: SteerDelivery;
}

/** A harness CLI session this thread can resume (one per executor). */
export interface HarnessSession {
  /** Claude / Grok session id, Codex thread id, OpenCode session id. */
  id: string;
  /** CLIs file sessions by directory: only resumed from the same cwd. */
  cwd: string;
  model?: string;
  /** thread.messages.length when this session last ran: later turns are news to it. */
  seen: number;
  /** Hash of the style brief the session got; a changed brief is sent again on resume. */
  styleHash?: string;
  /** Hash of the thread's presets when the session last ran; swapped presets are sent on resume. */
  modulesHash?: string;
  updatedAt: string;
}

export type StageState = "pending" | "running" | "done" | "failed";

/** Free-form stage map: `ingest` / `edit` / `preview` (agent jobs) / `export` (the button). */
export type StageStatus = Record<string, StageState>;

/**
 * An engine-side render of a thread, no agent involved: the final export (Exportar
 * button) or a re-render of the preview after a preset swap.
 */
export interface RenderTask {
  id: string;
  threadId: string;
  kind: "export" | "preview";
  status: "running" | "succeeded" | "failed";
  /** 0..1 */
  progress: number;
  /** What it is doing now ("Legendas 2/3", "Montando"…). */
  phase: string;
  startedAt: string;
  finishedAt?: string | null;
  /** The mp4 it wrote. */
  path?: string | null;
  error?: string | null;
}

/** A style being created from reference videos (thread kind "style"). */
export interface StyleDraftInfo {
  /** Id the style gets in the gallery (= draft folder name). */
  id: string;
  /** Set once saved to the gallery. */
  publishedAt?: string | null;
}

export interface Thread {
  id: string;
  title: string;
  projectPath: string;
  styleId: string;
  briefing: string;
  /** Raw footage, in the order the user picked it. */
  inputVideoPaths: string[];
  /** First of inputVideoPaths (kept for older clients). */
  inputVideoPath: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  previewPath?: string | null;
  /** Bumped whenever previewPath is (re)set — used for cache-busting the player. */
  previewUpdatedAt?: string | null;
  stageStatus: StageStatus;
  lastJobId?: string | null;
  /** Mirror of the last job's status so the UI can derive `busy` from the thread. */
  lastJobStatus?: JobStatus | null;
  lastJobMode?: JobMode | null;
  /** Pipeline steps the last job ran (trim, palco_b, compose…), in pipeline order. */
  pipeline?: Record<string, StepState>;
  /** "Concluída": out of the thread list (kept on disk; can be reopened). */
  archivedAt?: string | null;
  /** "Adiada": hidden until this moment, then back at the top of its project. */
  snoozedUntil?: string | null;
  /** CLI session per executor id, so the next message resumes instead of starting over. */
  sessions?: Record<string, HarnessSession>;
  /** Presets this thread swapped from its style (caption, stage, cuts…); unset = the style's. */
  modules?: ModuleSelection | null;
  /** "video" (default): edits a project. "style": creates a style from reference videos. */
  kind?: "video" | "style";
  styleDraft?: StyleDraftInfo | null;
  /** Last final export (the Exportar button); the preview stays in previewPath. */
  lastExport?: RenderTask | null;
  /** Last engine re-render of the preview (preset swap). */
  lastRender?: RenderTask | null;
}

export interface Job {
  id: string;
  threadId: string;
  status: JobStatus;
  mode?: JobMode;
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
  /** Live feed of what the agent did (tool calls, messages, plan). */
  activity?: ActivityItem[];
  activitySeq?: number;
  cancelRequested?: boolean;
  /** Continued the thread's CLI session instead of starting a new one. */
  resumed?: boolean;
}
