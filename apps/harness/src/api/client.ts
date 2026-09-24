import { IS_TAURI } from "../lib/platform";

// The desktop app has no Vite proxy: without VITE_ENGINE_URL it talks to the local engine directly.
const ENGINE_URL = (import.meta.env.VITE_ENGINE_URL ?? (IS_TAURI ? "http://127.0.0.1:8787" : "")).replace(/\/$/, "");

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

/** How a message sent while the agent worked reached it (see the engine's steerJob). */
export type SteerDelivery = "live" | "interrupt" | "next";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  jobId?: string;
  delivery?: SteerDelivery;
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
  /** "Concluída": out of the thread list, can be reopened. */
  archivedAt?: string | null;
  /** "Adiada" until then; after it, back at the top of its project until opened. */
  snoozedUntil?: string | null;
  /** Presets this thread swapped from its style; unset keys = the style's. */
  modules?: ModuleSelection | null;
  /** "style": creates a style from reference videos (projectPath = the draft package). */
  kind?: "video" | "style";
  styleDraft?: { id: string; publishedAt?: string | null } | null;
  /** Last final export (Exportar); the preview stays in previewPath. */
  lastExport?: RenderTask | null;
  /** Last engine re-render of the preview (preset swap). */
  lastRender?: RenderTask | null;
}

/** Engine-side render, no agent: the final export or a preview re-render. */
export interface RenderTask {
  id: string;
  threadId: string;
  kind: "export" | "preview";
  status: "running" | "succeeded" | "failed";
  progress: number;
  phase: string;
  startedAt: string;
  finishedAt?: string | null;
  path?: string | null;
  error?: string | null;
}

export interface RenderState {
  running: RenderTask | null;
  lastExport: RenderTask | null;
  lastRender: RenderTask | null;
}

export function getRender(threadId: string) {
  return request<RenderState>(`/api/threads/${threadId}/render`);
}

/** Final export at the style's quality, from the last preview's spec (no agent). */
export function startExport(threadId: string) {
  return request<{ task: RenderTask }>(`/api/threads/${threadId}/export`, { method: "POST" });
}

/** Redraw the preview with the thread's presets (caption layers + compose), no agent. */
export function startPreviewRender(threadId: string, captions = true) {
  return request<{ task: RenderTask }>(`/api/threads/${threadId}/render`, {
    method: "POST",
    body: JSON.stringify({ captions }),
  });
}

export function cancelRender(threadId: string) {
  return request<{ ok: true }>(`/api/threads/${threadId}/render/cancel`, { method: "POST" });
}

export const exportFileUrl = (threadId: string, version?: string | null) =>
  `${ENGINE_URL}/api/threads/${threadId}/export/file${version ? `?v=${encodeURIComponent(version)}` : ""}`;

export function revealExport(threadId: string) {
  return request<{ ok: true }>(`/api/threads/${threadId}/export/reveal`, { method: "POST" });
}

export function isRendering(thread: Thread | null): boolean {
  return thread?.lastExport?.status === "running" || thread?.lastRender?.status === "running";
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
  projectsRoot: string;
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
  modules?: ModuleSelection;
}) {
  return request<{ thread: Thread }>("/api/threads", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** While a job runs, the message goes to the working agent (`delivery` says how). */
export function postMessage(threadId: string, content: string, run = true) {
  return request<{ message: Message; job: Job | null; delivery?: SteerDelivery }>(
    `/api/threads/${threadId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content, run }),
    },
  );
}

/** Swap presets: an id overrides the style's, null goes back to it. */
export function setThreadModules(id: string, modules: ModuleSelection) {
  return request<{ thread: Thread }>(`/api/threads/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ modules }),
  });
}

export function setThreadArchived(id: string, archived: boolean) {
  return request<{ thread: Thread }>(`/api/threads/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

/** Snooze until `until` (ISO); null brings it back now. */
export function snoozeThread(id: string, until: string | null) {
  return request<{ thread: Thread }>(`/api/threads/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ snoozedUntil: until }),
  });
}

/** "snoozed" while hidden, "returned" once the time passed (until the thread is opened). */
export function snoozeState(thread: Thread, now = Date.now()): "snoozed" | "returned" | null {
  if (!thread.snoozedUntil) return null;
  return Date.parse(thread.snoozedUntil) > now ? "snoozed" : "returned";
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
  /** Where "Novo projeto" creates NN-name folders. */
  projectsRoot: string;
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
  path: string;
  name: string;
}

/** Projects in the projects root, newest number first, + the number the next one gets. */
export function listProjects() {
  return request<{ root: string; nextNumber: number; projects: ProjectSummary[] }>("/api/projects");
}

/** New project folder <projects root>/<NN>-<slug of name>, with input/, edit/, exports/. */
export function createProject(name: string) {
  return request<{ path: string }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

/** Same slug the engine uses for the folder: "Review do Grok 5!" → "review-do-grok-5". */
export function projectSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export const projectFolderName = (n: number, slug: string) => `${String(n).padStart(2, "0")}-${slug}`;

// ── Style Kit gallery ──

/** One package in styles/<id>/. The id never changes; the name can. */
export interface StyleSummary {
  id: string;
  name: string;
  hasPreview: boolean;
  updatedAt: string;
  /** Preset per module (null = the package predates modules). */
  modules: ModuleSelection | null;
  /** What the Exportar button renders. */
  exportQuality: Quality;
  /** Edited in the Estúdio; "Restaurar o original" undoes it. */
  edited?: boolean;
}

export interface Quality {
  resolution: string;
  fps?: number;
  codec: string;
  bitrate: string;
  audio: { codec: string; bitrate: string; loudness?: { I: number; TP: number; LRA: number } };
}

/** "1080x1920 · H.264 10 Mbps · −14 LUFS" */
export function qualityLabel(q: Quality | null | undefined): string {
  if (!q) return "";
  const res = q.resolution.replace("x", "×") + (q.fps ? `@${q.fps}` : "");
  const lufs = q.audio?.loudness ? ` · ${String(q.audio.loudness.I).replace("-", "−")} LUFS` : "";
  return `${res} · ${q.codec.toUpperCase().replace("H264", "H.264")} ${q.bitrate.replace(/M$/, " Mbps")}${lufs}`;
}

// ── Module presets (styles/_presets/<module>/) ──

export const MODULE_KEYS = ["caption", "stage", "camera", "cuts", "soundEffects", "transitions"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABEL: Record<ModuleKey, string> = {
  caption: "Legenda",
  stage: "Palcos",
  camera: "Câmera",
  cuts: "Cortes",
  soundEffects: "Música e efeitos",
  transitions: "Transições",
};

export interface ModuleSelection {
  caption?: string | null;
  stage?: string[] | null;
  camera?: string | null;
  cuts?: string | null;
  soundEffects?: string | null;
  transitions?: string | null;
}

export interface PresetSummary {
  id: string;
  name: string;
  description: string;
  palco?: string;
  source: "library" | "style";
  /** What the UI needs to draw the preset. */
  visual: {
    y?: number;
    layout?: string;
    burn?: "none" | "hook" | "marked" | "all";
    sfx?: boolean;
    music?: boolean;
    pad?: number;
    moves?: string[];
    intensity?: number;
    frequency?: string;
    tracking?: boolean;
  };
}

export type PresetLibrary = Record<ModuleKey, PresetSummary[]>;

export function listPresets(styleId?: string) {
  return request<{ presets: PresetLibrary }>(`/api/presets${styleId ? `?styleId=${encodeURIComponent(styleId)}` : ""}`);
}

/** CaptionPreset (docs/style-kit/SPEC-EXPANSION.md). */
export interface CaptionPreset {
  id: string;
  name: string;
  description?: string;
  font: { sans: string; accent: string; case: "sentence" | "upper" | "lower" | "preserve"; tracking?: number };
  size: { sans: number; accent: number; canvasSans?: number; canvasAccent?: number };
  position: { y: number };
  color: { fill: string; accent: string; canvasFill?: string; canvasAccent?: string };
  outline: { width: number; color: string } | null;
  shadow: { dx: number; dy: number; blur: number; alpha: number } | null;
  box: { color: string; alpha: number; padX: number; padY: number; radius: number } | null;
  animation: { in: "rise" | "pop" | "fade" | "blur" | "cut"; out: "fade" | "cut"; inFrames: number; outFrames: number };
  timing: { maxWords: number; maxChars: number; leadFrames: number };
}

export function getPreset<T = Record<string, unknown>>(module: ModuleKey, id: string, styleId?: string) {
  const q = styleId ? `?styleId=${encodeURIComponent(styleId)}` : "";
  return request<{ preset: T }>(`/api/presets/${module}/${encodeURIComponent(id)}${q}`);
}

/** Font files for the caption builder, relative to video/kit/. */
export function listFonts() {
  return request<{ fonts: string[] }>("/api/presets/fonts");
}

export function savePreset(module: ModuleKey, preset: object, overwrite = false) {
  return request<{ preset: { id: string; name: string } }>(`/api/presets/${module}`, {
    method: "POST",
    body: JSON.stringify({ preset, overwrite }),
  });
}

/**
 * The caption preset drawn by the real renderer: a PNG still (or the animation as mp4).
 * `background`: "dark" | "cream" | "thread:<id>" (a frame of that thread's footage).
 */
export async function captionPreview(
  body: { preset: object; text: string; layout: "face" | "canvas"; background: string },
  clip = false,
): Promise<Blob> {
  const res = await fetch(`${ENGINE_URL}/api/presets/caption/preview${clip ? "?clip=1" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? res.statusText;
    throw new Error(detail);
  }
  return res.blob();
}

/** Library caption preset as a looping animation (a few sample phrases) or a still, for <video>/<img>. */
export function captionPresetUrl(
  id: string,
  kind: "clip" | "still",
  opts: { background?: string; layout?: "face" | "canvas"; styleId?: string } = {},
): string {
  const q = new URLSearchParams();
  if (opts.background) q.set("bg", opts.background);
  if (opts.layout) q.set("layout", opts.layout);
  if (opts.styleId) q.set("styleId", opts.styleId);
  const qs = q.toString();
  return `${ENGINE_URL}/api/presets/caption/${encodeURIComponent(id)}/${kind}${qs ? `?${qs}` : ""}`;
}

/** A camera preset on real footage (punch / zoom / face tracking), mp4. */
export function cameraClipUrl(id: string, opts: { threadId?: string; styleId?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.threadId) q.set("thread", opts.threadId);
  if (opts.styleId) q.set("styleId", opts.styleId);
  const qs = q.toString();
  return `${ENGINE_URL}/api/presets/camera/${encodeURIComponent(id)}/clip${qs ? `?${qs}` : ""}`;
}

/** "Ouvir" a sound preset: a few seconds of footage with its effects and music (m4a). */
export function soundDemoUrl(id: string, opts: { threadId?: string; styleId?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.threadId) q.set("thread", opts.threadId);
  if (opts.styleId) q.set("styleId", opts.styleId);
  const qs = q.toString();
  return `${ENGINE_URL}/api/presets/soundEffects/${encodeURIComponent(id)}/demo${qs ? `?${qs}` : ""}`;
}

/** Simple path to a new style: a gallery style with other presets under a new name. */
export function duplicateStyle(id: string, body: { name: string; modules: ModuleSelection }) {
  return request<{ style: { id: string; name: string } }>(`/api/styles/${encodeURIComponent(id)}/duplicate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Edit a gallery style in place (threads using it get the new presets on their next preview). */
export function updateStyle(id: string, body: { name?: string; modules?: ModuleSelection }) {
  return request<{ style: { id: string; name: string } }>(`/api/styles/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Undo the Estúdio edits of a style. */
export function restoreStyle(id: string) {
  return request<{ style: { id: string; name: string } }>(`/api/styles/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
}

// ── New style from reference videos ──

export interface StyleDraft {
  id: string;
  dir: string;
  style: {
    id: string;
    name: string;
    promptMarkdown: string | null;
    storyboard: string | null;
    modules: ModuleSelection | null;
    previewVideoPath: string | null;
  } | null;
  modules: {
    caption: (CaptionPreset & Record<string, unknown>) | null;
    stage: Array<{ id: string; name: string; palco?: string; description?: string }> | null;
    cuts: { id: string; name: string; description?: string } | null;
    soundEffects: { id: string; name: string; description?: string } | null;
    transitions: { id: string; name: string; description?: string } | null;
    camera?: { id: string; name: string; description?: string } | null;
  } | null;
  files: string[];
  problems: string[];
  references: string[];
  segments: RefSegment[];
  /** Where the agent saw each decision, to jump to in the reference. */
  evidence: Array<{ path: string; at: number; end?: number; module: string; note: string }>;
}

/** A stretch of a reference video the creator marked. */
export interface RefSegment {
  path: string;
  start: number;
  end: number;
  note: string;
}

export function createStyleDraft(body: { name: string; references: string[]; segments?: RefSegment[]; note?: string }) {
  return request<{ draft: StyleDraft; thread: Thread; job: Job }>("/api/style-drafts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getStyleDraft(id: string) {
  return request<{ draft: StyleDraft }>(`/api/style-drafts/${encodeURIComponent(id)}`);
}

export function publishStyleDraft(id: string) {
  return request<{ style: { id: string; name: string }; thread: Thread | null }>(
    `/api/style-drafts/${encodeURIComponent(id)}/publish`,
    { method: "POST" },
  );
}

export function listStyles() {
  return request<{ styles: StyleSummary[]; defaultStyleId: string | null }>("/api/styles");
}

const styleAsset = (style: StyleSummary, file: "thumb" | "preview") =>
  `${ENGINE_URL}/api/styles/${encodeURIComponent(style.id)}/${file}?v=${encodeURIComponent(style.updatedAt)}`;
export const styleThumbUrl = (style: StyleSummary) => styleAsset(style, "thumb");
export const stylePreviewUrl = (style: StyleSummary) => styleAsset(style, "preview");

/** Display name of a style id (the id itself when the gallery doesn't have it). */
export function styleName(styles: StyleSummary[], id: string): string {
  return styles.find((s) => s.id === id)?.name ?? id;
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
  source: "compose" | "cuts.json";
  /** Source file relative to the project, e.g. "edit/compose.resolved.json". */
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
export type ActivityKind = "message" | "user" | "command" | "read" | "edit" | "search" | "web" | "agent" | "plan" | "tool" | "error";

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
  /** Continued the thread's CLI session (vs a new one). */
  resumed: boolean;
  startedAt: string | null;
  finishedAt: string | null;
}

export function getActivity(jobId: string, after = 0) {
  return request<ActivityPage>(`/api/jobs/${jobId}/activity?after=${after}`);
}

export function cancelJob(jobId: string) {
  return request<{ ok: true }>(`/api/jobs/${jobId}/cancel`, { method: "POST" });
}
