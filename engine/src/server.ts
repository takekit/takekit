import express from "express";
import cors from "cors";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  activitySince,
  appendMessage,
  createJob,
  createThread,
  getJob,
  getThread,
  listThreads,
  markStyleDraftPublished,
  removeProjectThreads,
  setThreadArchived,
  setThreadSnoozed,
  setThreadModules,
  threadHasActiveJob,
  threadsOfProject,
} from "./store.js";
import { cancelJob, runProjectJob, steerJob } from "./project-runner.js";
import { readTimeline } from "./timeline.js";
import {
  MODULES,
  defaultStyleId,
  effectiveSelection,
  getPreset,
  getStyle,
  listFonts,
  listPresets,
  listStyles,
  normalizeSelection,
  resolveModules,
  resolveStyleId,
  savePreset,
  type ModuleKey,
  type ModuleSelection,
  type Preset,
} from "./styles.js";
import { RenderError, cancelRender, renderState, startExport, startPreviewRender } from "./renders.js";
import {
  DraftError,
  createStyleDraft,
  duplicateStyle,
  getStyleDraft,
  publishStyleDraft,
  restoreStyle,
  updateStyle,
} from "./style-drafts.js";
import { SAMPLE_TEXT, captionPreview } from "./caption-preview.js";
import { soundPreview } from "./sound-preview.js";
import { cameraPreview } from "./camera-preview.js";
import type { Thread } from "./types.js";
import {
  FsError,
  createProject,
  projectSlug,
  expandPath,
  isVideo,
  listDir,
  listProjects,
  listVideos,
  sendFile,
  thumbnail,
  trashProjectFolder,
} from "./files.js";
import { listExecutors } from "./adapters/index.js";
import { claudeCodeCliHelp } from "./adapters/claude-code.js";
import {
  CONFIG_PATH,
  DATA_DIR,
  EXECUTOR_IDS,
  HOST,
  envOverrides,
  getConfig,
  saveFileConfig,
} from "./config.js";

/**
 * Pages allowed to call the engine: the Tauri shell and the Vite dev server.
 * The engine can browse the disk and run agent CLIs, so any other website the
 * user has open must not be able to reach it (CORS alone would still let a
 * "simple" request through, hence the explicit 403).
 */
const ALLOWED_ORIGINS = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  ...(process.env.TAKEKIT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
]);
/** Loopback names only: blocks DNS-rebinding pages that resolve their host to 127.0.0.1. */
const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", HOST]);

export function createApp() {
  const app = express();
  app.use((req, res, next) => {
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    const origin = req.headers.origin;
    if (!ALLOWED_HOSTS.has(host) || (origin && !ALLOWED_ORIGINS.has(origin))) {
      res.status(403).json({ error: "Origem não permitida" });
      return;
    }
    next();
  });
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin)) }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    const config = getConfig();
    res.json({
      ok: true,
      service: "takekit-engine",
      pipelineRoot: config.pipelineRoot,
      projectsRoot: config.projectsRoot,
      dataDir: DATA_DIR,
      executors: listExecutors(),
      claudeCli: claudeCodeCliHelp(config.claudeBin, config.model),
    });
  });

  app.get("/api/config", (_req, res) => {
    res.json(configResponse());
  });

  app.put("/api/config", (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ error: "JSON object body required" });
      return;
    }
    try {
      saveFileConfig(body as Record<string, unknown>);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
    res.json(configResponse());
  });

  // Projects in the projects root (config.projectsRoot) + the number the next one gets.
  app.get("/api/projects", async (_req, res) => {
    await fsRoute(res, async () => res.json(await listProjects()));
  });

  // New project: { name } → <projects root>/<NN>-<slug>, with the project layout.
  app.post("/api/projects", async (req, res) => {
    await fsRoute(res, async () => {
      const path = await createProject(String(req.body?.name ?? ""));
      res.status(201).json({ path });
    });
  });

  // ── Style Kit gallery (styles/<id>/) ──

  app.get("/api/styles", (_req, res) => {
    res.json({ styles: listStyles(), defaultStyleId: defaultStyleId() });
  });

  app.get("/api/styles/:id", (req, res) => {
    const style = getStyle(req.params.id);
    if (!style) {
      res.status(404).json({ error: "Estilo não encontrado" });
      return;
    }
    res.json({ style, ...resolveModules(style, effectiveSelection(style, null)) });
  });

  // ── Module presets (docs/style-kit/SPEC-EXPANSION.md) ──

  // Every module's presets; ?styleId= adds that style's own presets/.
  app.get("/api/presets", (req, res) => {
    const style = getStyle(query(req, "styleId"));
    res.json({ presets: Object.fromEntries(MODULES.map((m) => [m, listPresets(m, style)])) });
  });

  // Fonts the caption builder can pick (relative to video/kit/).
  app.get("/api/presets/fonts", (_req, res) => {
    res.json({ fonts: listFonts(getConfig().pipelineRoot) });
  });

  app.get("/api/presets/:module/:id", (req, res) => {
    const module = moduleKey(req.params.module);
    const preset = module ? getPreset(module, req.params.id, getStyle(query(req, "styleId"))) : null;
    if (!preset) {
      res.status(404).json({ error: "Preset não encontrado" });
      return;
    }
    res.json({ preset });
  });

  // Caption builder: draw a preset with the real renderer (PNG still, or ?clip=1 for the
  // animation of a few sample phrases in the preset's rhythm).
  app.post("/api/presets/caption/preview", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const preset = body.preset;
    if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
      res.status(400).json({ error: "preset (objeto) é obrigatório" });
      return;
    }
    const clip = req.query.clip === "1";
    await captionRoute(req, res, {
      preset,
      text: String(body.text ?? "").trim().slice(0, 240) || (clip ? SAMPLE_TEXT : "Isso *muda* tudo"),
      layout: body.layout === "canvas" ? "canvas" : "face",
      background: typeof body.background === "string" ? body.background : "auto",
      clip,
    });
  });

  // A library (or style) caption preset as a looping clip / still, for <video src> in pickers.
  app.get("/api/presets/caption/:id/:kind(clip|still)", async (req, res) => {
    const preset = getPreset("caption", req.params.id, getStyle(query(req, "styleId")));
    if (!preset) {
      res.status(404).json({ error: "Preset não encontrado" });
      return;
    }
    await captionRoute(req, res, {
      preset,
      // The still is the poster: plain text shows the preset's main look (emphasis is in the clip).
      text: query(req, "text")?.slice(0, 240) ?? (req.params.kind === "clip" ? SAMPLE_TEXT : "Isso muda tudo"),
      layout: query(req, "layout") === "canvas" ? "canvas" : "face",
      background: query(req, "bg") ?? "auto",
      clip: req.params.kind === "clip",
    });
  });

  // A camera preset on real footage (punch / zoom / face tracking), for <video> in pickers.
  app.get("/api/presets/camera/:id/clip", async (req, res) => {
    const preset = getPreset("camera", req.params.id, getStyle(query(req, "styleId")));
    if (!preset) {
      res.status(404).json({ error: "Preset não encontrado" });
      return;
    }
    const thread = query(req, "thread") ? getThread(query(req, "thread")!) : undefined;
    const footage = (thread && footageOf(thread)) ?? recentFootage();
    if (!footage) {
      res.status(404).json({ error: "Nenhum vídeo para mostrar a câmera ainda" });
      return;
    }
    try {
      sendFile(req, res, await cameraPreview(preset, footage), "private, max-age=3600");
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // "Ouvir" a sound preset: a few seconds of recent footage with its effects and music bed.
  app.get("/api/presets/soundEffects/:id/demo", async (req, res) => {
    const preset = getPreset("soundEffects", req.params.id, getStyle(query(req, "styleId")));
    if (!preset) {
      res.status(404).json({ error: "Preset não encontrado" });
      return;
    }
    const thread = query(req, "thread") ? getThread(query(req, "thread")!) : undefined;
    try {
      const file = await soundPreview(preset, (thread && footageOf(thread)) ?? recentFootage());
      sendFile(req, res, file, "private, max-age=3600");
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Save a preset to the library: { preset, overwrite? }. The builder creates captions.
  app.post("/api/presets/:module", (req, res) => {
    const module = moduleKey(req.params.module);
    const preset = req.body?.preset as Preset | undefined;
    if (!module || !preset || typeof preset !== "object") {
      res.status(400).json({ error: "módulo e preset são obrigatórios" });
      return;
    }
    const id = String(preset.id || "").trim() || projectSlug(String(preset.name ?? ""));
    try {
      const saved = savePreset(module, { ...preset, id }, req.body?.overwrite === true);
      res.status(201).json({ preset: saved });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(/Já existe/.test(msg) ? 409 : 400).json({ error: msg });
    }
  });

  // ── New style ──

  // Simple path: copy a gallery style with other presets under a new name ({ name, modules }).
  app.post("/api/styles/:id/duplicate", (req, res) => {
    try {
      const style = duplicateStyle(req.params.id, {
        name: String(req.body?.name ?? ""),
        modules: normalizeSelection(req.body?.modules),
      });
      res.status(201).json({ style });
    } catch (err) {
      draftRouteError(res, err);
    }
  });

  // Edit a gallery style in place ({ name?, modules? }); the first edit keeps original.json.
  app.patch("/api/styles/:id", (req, res) => {
    try {
      const name = req.body?.name;
      if (name !== undefined && typeof name !== "string") {
        res.status(400).json({ error: "name must be a string" });
        return;
      }
      const modules = req.body?.modules === undefined ? undefined : normalizeSelection(req.body.modules);
      if (req.body?.modules !== undefined && !modules) {
        res.status(400).json({ error: "modules must be an object" });
        return;
      }
      const style = updateStyle(req.params.id, { name, modules });
      res.json({ style: { id: style.id, name: style.name } });
    } catch (err) {
      draftRouteError(res, err);
    }
  });

  // "Restaurar o original": undo the Estúdio edits (original.json → modules.json + name).
  app.post("/api/styles/:id/restore", (req, res) => {
    try {
      const style = restoreStyle(req.params.id);
      res.json({ style: { id: style.id, name: style.name } });
    } catch (err) {
      draftRouteError(res, err);
    }
  });

  // { name, references: [paths] } → draft package + a "style" thread whose agent decomposes them.
  app.post("/api/style-drafts", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const references = Array.isArray(body.references) ? body.references.filter((v): v is string => typeof v === "string") : [];
    const segments = (Array.isArray(body.segments) ? body.segments : [])
      .map((v) => v as Record<string, unknown>)
      .filter((v) => typeof v?.path === "string" && Number.isFinite(Number(v.start)) && Number(v.end) > Number(v.start))
      .map((v) => ({ path: String(v.path), start: Number(v.start), end: Number(v.end), note: String(v.note ?? "").trim().slice(0, 200) }));
    try {
      const name = String(body.name ?? "");
      const draft = createStyleDraft({ name, references, segments });
      const base = defaultStyleId();
      const thread = createThread({
        title: `Estilo: ${name.trim()}`,
        projectPath: draft.dir,
        styleId: base ?? undefined,
        inputVideoPaths: references,
        ensureLayout: false,
        kind: "style",
        styleDraft: { id: draft.id, publishedAt: null },
      });
      const note = String(body.note ?? "").trim();
      const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
      const content = [
        `Crie o estilo "${name.trim()}" a partir ${references.length > 1 ? `destes ${references.length} vídeos` : "deste vídeo"} de referência:` +
          " decomponha e proponha o pacote.",
        ...(segments.length
          ? [
              "",
              "Trechos que eu marquei (o estilo está principalmente aqui):",
              ...segments.map((seg) => {
                const n = references.indexOf(seg.path) + 1;
                return `- vídeo ${n || "?"} (${seg.path.split("/").pop()}), ${clock(seg.start)}–${clock(seg.end)}${seg.note ? `: ${seg.note}` : ""}`;
              }),
            ]
          : []),
        ...(note ? ["", note] : []),
      ].join("\n");
      const job = queueJob(thread, content);
      res.status(201).json({ draft: getStyleDraft(draft.id), thread: getThread(thread.id), job });
    } catch (err) {
      draftRouteError(res, err);
    }
  });

  app.get("/api/style-drafts/:id", (req, res) => {
    try {
      res.json({ draft: getStyleDraft(req.params.id) });
    } catch (err) {
      draftRouteError(res, err);
    }
  });

  // Save the reviewed draft to the gallery (validates presets, makes the preview loop).
  app.post("/api/style-drafts/:id/publish", async (req, res) => {
    try {
      const owner = listThreads().find((t) => t.styleDraft?.id === req.params.id && !t.styleDraft.publishedAt);
      if (owner && threadHasActiveJob(owner.id)) {
        res.status(409).json({ error: "O agente ainda está mexendo no pacote; espere terminar." });
        return;
      }
      const style = await publishStyleDraft(req.params.id);
      const thread = owner ? markStyleDraftPublished(owner.id, style.dir) : undefined;
      if (thread) {
        appendMessage(thread.id, { role: "system", content: `Estilo ${style.name} salvo na galeria (styles/${style.id}/).` });
      }
      res.json({ style, thread: thread ?? null });
    } catch (err) {
      draftRouteError(res, err);
    }
  });

  app.get("/api/styles/:id/preview", (req, res) => {
    const preview = getStyle(req.params.id)?.previewVideoPath;
    if (!preview) {
      res.status(404).json({ error: "Estilo sem preview" });
      return;
    }
    sendFile(req, res, preview);
  });

  app.get("/api/styles/:id/thumb", async (req, res) => {
    await fsRoute(res, async () => {
      const preview = getStyle(req.params.id)?.previewVideoPath;
      if (!preview) throw new FsError(404, "Estilo sem preview");
      sendFile(req, res, await thumbnail(preview), "private, max-age=86400");
    });
  });

  app.get("/api/threads", (_req, res) => {
    res.json({ threads: listThreads() });
  });

  app.post("/api/threads", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    try {
      const list = Array.isArray(body.inputVideoPaths)
        ? body.inputVideoPaths.filter((v): v is string => typeof v === "string")
        : [];
      const single = str(body.inputVideoPath);
      // A picked style must be in the gallery; none picked = the gallery default.
      const picked = str(body.styleId)?.trim();
      const styleId = picked ? resolveStyleId(picked) : undefined;
      if (picked && !styleId) {
        res.status(400).json({ error: `Estilo "${picked}" não está na galeria` });
        return;
      }
      const projectPath = str(body.projectPath)?.trim();
      if (!projectPath) {
        res.status(400).json({ error: "Escolha ou crie um projeto para a thread." });
        return;
      }
      const modules = normalizeSelection(body.modules);
      const problem = modules ? invalidModules(styleId ?? defaultStyleId(), modules) : null;
      if (problem) {
        res.status(400).json({ error: problem });
        return;
      }
      const thread = createThread({
        title: str(body.title),
        projectPath,
        styleId: styleId ?? undefined,
        inputVideoPaths: list.length ? list : single ? [single] : [],
        briefing: str(body.briefing),
        modules: modules && Object.keys(modules).length ? stripNulls(modules) : null,
      });
      res.status(201).json({ thread });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/threads/:id", (req, res) => {
    const thread = getThread(req.params.id);
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    res.json({ thread });
  });

  // { archived: boolean } concludes / reopens (stays on disk, out of the list).
  // { snoozedUntil: ISO | null } hides it until then (null = back now).
  // { modules: { caption: "id" | null, … } } swaps presets (null = back to the style's).
  app.patch("/api/threads/:id", (req, res) => {
    const current = getThread(req.params.id);
    if (!current) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    const archived = req.body?.archived;
    const snoozedUntil = req.body?.snoozedUntil;
    const modules = req.body?.modules === undefined ? undefined : normalizeSelection(req.body.modules);
    if (archived === undefined && snoozedUntil === undefined && modules === undefined) {
      res.status(400).json({ error: "archived (boolean), snoozedUntil (ISO date | null) or modules (object) is required" });
      return;
    }
    if (archived !== undefined && typeof archived !== "boolean") {
      res.status(400).json({ error: "archived must be a boolean" });
      return;
    }
    if (snoozedUntil !== undefined && snoozedUntil !== null && (typeof snoozedUntil !== "string" || Number.isNaN(Date.parse(snoozedUntil)))) {
      res.status(400).json({ error: "snoozedUntil must be an ISO date or null" });
      return;
    }
    if (req.body?.modules !== undefined && !modules) {
      res.status(400).json({ error: "modules must be an object" });
      return;
    }
    if (modules) {
      const problem = invalidModules(current.styleId, modules);
      if (problem) {
        res.status(400).json({ error: problem });
        return;
      }
      setThreadModules(current.id, modules);
    }
    if (typeof archived === "boolean") setThreadArchived(current.id, archived);
    if (snoozedUntil !== undefined) setThreadSnoozed(current.id, snoozedUntil ? new Date(snoozedUntil).toISOString() : null);
    res.json({ thread: getThread(current.id) });
  });

  // ── Renders without the agent: final export and preview re-render ──

  app.get("/api/threads/:id/render", (req, res) => {
    if (!getThread(req.params.id)) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    res.json(renderState(req.params.id));
  });

  // Exportar: final quality of the style, from the last preview's spec, into exports/.
  app.post("/api/threads/:id/export", (req, res) => {
    renderRoute(res, () => startExport(req.params.id));
  });

  // Re-render the preview with the thread's presets ({ captions: true } redraws the caption layers).
  app.post("/api/threads/:id/render", (req, res) => {
    renderRoute(res, () => startPreviewRender(req.params.id, { captions: req.body?.captions !== false }));
  });

  app.post("/api/threads/:id/render/cancel", (req, res) => {
    if (!cancelRender(req.params.id)) {
      res.status(409).json({ error: "Nenhum render rodando" });
      return;
    }
    res.status(202).json({ ok: true });
  });

  // The last export as a download (?inline=1 to play it).
  app.get("/api/threads/:id/export/file", (req, res) => {
    const path = getThread(req.params.id)?.lastExport?.path;
    if (!path || !existsSync(path)) {
      res.status(404).json({ error: "Export não encontrado" });
      return;
    }
    sendFile(req, res, path, "no-cache", req.query.inline === "1" ? "inline" : "attachment");
  });

  // Show the last export in Finder.
  app.post("/api/threads/:id/export/reveal", (req, res) => {
    const path = getThread(req.params.id)?.lastExport?.path;
    if (!path || !existsSync(path)) {
      res.status(404).json({ error: "Export não encontrado" });
      return;
    }
    execFile("open", ["-R", path], (err) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ ok: true });
    });
  });

  /**
   * Remove a project from Takekit: its threads and jobs. With `trash: true` the folder
   * also goes to the macOS Trash (never the default project or anything tracked by git).
   */
  app.delete("/api/projects", async (req, res) => {
    const path = typeof req.body?.path === "string" ? req.body.path.trim() : "";
    const trash = req.body?.trash === true;
    const owned = path ? threadsOfProject(path) : [];
    if (!owned.length) {
      res.status(404).json({ error: "Projeto não encontrado no Takekit" });
      return;
    }
    if (owned.some((t) => threadHasActiveJob(t.id))) {
      res.status(409).json({ error: "Tem um job rodando neste projeto; pare ou espere terminar." });
      return;
    }
    if (trash) {
      try {
        const config = getConfig();
        await trashProjectFolder(path, [config.pipelineRoot, DATA_DIR, config.projectsRoot]);
      } catch (err) {
        res.status(err instanceof FsError ? err.status : 500).json({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
    }
    res.json({ removedThreads: removeProjectThreads(path), trashed: trash });
  });

  app.post("/api/threads/:id/messages", (req, res) => {
    const thread = getThread(req.params.id);
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    const content = String(req.body?.content ?? "").trim();
    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const run = req.body?.run !== false;
    if (run && threadHasActiveJob(thread.id)) {
      // Sent while the agent works: goes to the running session (live, or by resuming it).
      const active = thread.lastJobId ? getJob(thread.lastJobId) : undefined;
      const delivery = active ? steerJob(active.id, content) : null;
      if (!active || !delivery) {
        res.status(409).json({ error: "Thread já tem um job em andamento; aguarde terminar." });
        return;
      }
      const message = appendMessage(thread.id, { role: "user", content, delivery });
      res.status(202).json({ message, job: active, delivery });
      return;
    }

    const userMsg = appendMessage(thread.id, { role: "user", content });
    if (!userMsg) {
      res.status(500).json({ error: "Failed to append message" });
      return;
    }

    if (!run) {
      res.status(201).json({ message: userMsg, job: null });
      return;
    }

    const job = startJob(thread, content);
    res.status(202).json({ message: userMsg, job });
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ job });
  });

  // Live feed: rows changed after `after` (the last seq the client has).
  app.get("/api/jobs/:id/activity", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const after = Number(req.query.after ?? 0) || 0;
    res.json({
      ...activitySince(job.id, after),
      status: job.status,
      mode: job.mode ?? null,
      resumed: Boolean(job.resumed),
      startedAt: job.startedAt ?? null,
      finishedAt: job.finishedAt ?? null,
    });
  });

  app.post("/api/jobs/:id/cancel", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    if (!cancelJob(job.id)) {
      res.status(409).json({ error: "Job não está rodando" });
      return;
    }
    res.status(202).json({ ok: true });
  });

  app.get("/api/threads/:id/timeline", (req, res) => {
    const thread = getThread(req.params.id);
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    // null = project has no edit data yet; the UI falls back to the export itself.
    res.json({ timeline: readTimeline(thread.projectPath) });
  });

  app.get("/api/threads/:id/preview", (req, res) => {
    const thread = getThread(req.params.id);
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    if (!thread.previewPath) {
      res.status(404).json({
        error: "No preview path yet",
        hint: "previewPath is set after a successful job (TAKEKIT_PREVIEW= marker or newest exports/**/*.mp4).",
      });
      return;
    }
    if (!existsSync(thread.previewPath)) {
      res.status(404).json({ error: "Preview file missing", path: thread.previewPath });
      return;
    }

    sendFile(req, res, thread.previewPath);
  });

  // ── Disk access for the project / video pickers ──

  app.get("/api/fs/list", async (req, res) => {
    await fsRoute(res, async () => res.json(await listDir(query(req, "path"))));
  });

  app.get("/api/fs/videos", async (req, res) => {
    await fsRoute(res, async () => {
      const root = query(req, "root");
      if (!root) throw new FsError(400, "root é obrigatório");
      res.json(await listVideos(root));
    });
  });

  app.get("/api/fs/thumb", async (req, res) => {
    await fsRoute(res, async () => sendFile(req, res, await thumbnail(query(req, "path") ?? ""), "private, max-age=86400"));
  });

  app.get("/api/fs/video", async (req, res) => {
    await fsRoute(res, async () => {
      const path = expandPath(query(req, "path") ?? "");
      if (!isVideo(path) || !existsSync(path)) throw new FsError(404, "Vídeo não encontrado");
      sendFile(req, res, path);
    });
  });

  return app;
}

/** User message + a job for it (the thread's next agent run). */
function queueJob(thread: Thread, content: string) {
  appendMessage(thread.id, { role: "user", content });
  return startJob(thread, content);
}

function startJob(thread: Thread, content: string) {
  const job = createJob({ threadId: thread.id, prompt: content, projectPath: thread.projectPath });
  appendMessage(thread.id, {
    role: "assistant",
    content: `Job ${job.id} queued on executor ${getConfig().executorId}…`,
    jobId: job.id,
  });
  // Fire-and-forget; client polls /api/jobs/:id
  void runProjectJob(job.id);
  return job;
}

function moduleKey(raw: string): ModuleKey | null {
  const key = raw === "sound-effects" ? "soundEffects" : raw;
  return (MODULES as readonly string[]).includes(key) ? (key as ModuleKey) : null;
}

/** Ids a thread picks must exist (in the library or the style's own presets). */
function invalidModules(styleId: string | null, modules: ModuleSelection): string | null {
  const style = getStyle(styleId);
  for (const key of MODULES) {
    const value = modules[key];
    if (value === null || value === undefined) continue;
    const ids = Array.isArray(value) ? value : [value];
    if (key === "stage" && !ids.length) return "Escolha pelo menos um palco.";
    for (const id of ids) if (!getPreset(key, id, style)) return `Preset ${key} "${id}" não encontrado`;
  }
  return null;
}

function stripNulls(modules: ModuleSelection): ModuleSelection {
  return Object.fromEntries(Object.entries(modules).filter(([, v]) => v !== null)) as ModuleSelection;
}

/**
 * Caption preview request → file. Background: "dark" | "cream" | "thread:<id>" (that
 * thread's footage) | "auto" (footage of the most recent video thread, else dark), so a
 * preset shows over a real face whenever there is one.
 */
async function captionRoute(
  req: express.Request,
  res: express.Response,
  input: { preset: object; text: string; layout: "face" | "canvas"; background: string; clip: boolean },
): Promise<void> {
  let background = input.background;
  if (background.startsWith("thread:")) {
    const thread = getThread(background.slice(7));
    background = (thread && footageOf(thread)) ?? "dark";
  } else if (background === "auto") {
    background = input.layout === "canvas" ? "cream" : (recentFootage() ?? "dark");
  } else if (background !== "cream") background = "dark";
  try {
    const file = await captionPreview({ ...input, background });
    sendFile(req, res, file, "private, max-age=3600");
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

/** Footage of the most recently touched video thread (for "auto" caption backgrounds). */
function recentFootage(): string | null {
  for (const thread of listThreads()) {
    if (thread.kind === "style") continue;
    const footage = footageOf(thread);
    if (footage) return footage;
  }
  return null;
}

/** Raw footage of a thread for caption previews: the trimmed a-roll, else the first input. */
function footageOf(thread: Thread): string | null {
  const aroll = join(thread.projectPath, "edit", "aroll.mov");
  if (existsSync(aroll)) return aroll;
  return thread.inputVideoPaths.find((p) => existsSync(p)) ?? null;
}

function renderRoute(res: express.Response, start: () => unknown): void {
  try {
    res.status(202).json({ task: start() });
  } catch (err) {
    res.status(err instanceof RenderError ? err.status : 500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

function draftRouteError(res: express.Response, err: unknown): void {
  res.status(err instanceof DraftError ? err.status : 500).json({ error: err instanceof Error ? err.message : String(err) });
}

function query(req: express.Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

async function fsRoute(res: express.Response, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (res.headersSent) return;
    const code = (err as NodeJS.ErrnoException).code;
    const known: Record<string, [number, string]> = {
      ENOENT: [404, "Não encontrado"],
      ENOTDIR: [400, "Não é uma pasta"],
      EACCES: [403, "Sem permissão"],
      EPERM: [403, "Sem permissão"],
      EEXIST: [409, "Já existe"],
    };
    const [status, message]: [number, string] =
      err instanceof FsError
        ? [err.status, err.message]
        : ((code ? known[code] : undefined) ?? [500, err instanceof Error ? err.message : String(err)]);
    res.status(status).json({ error: message });
  }
}

function configResponse() {
  return {
    config: getConfig(),
    configPath: CONFIG_PATH,
    envOverrides: envOverrides(),
    executorIds: EXECUTOR_IDS,
    executors: listExecutors(),
  };
}
