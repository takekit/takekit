import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import {
  activitySince,
  appendMessage,
  createJob,
  createThread,
  getJob,
  getThread,
  listThreads,
  removeProjectThreads,
  setThreadArchived,
  threadHasActiveJob,
  threadsOfProject,
} from "./store.js";
import { cancelJob, runProjectJob, steerJob } from "./project-runner.js";
import { readTimeline } from "./timeline.js";
import { defaultStyleId, getStyle, listStyles, resolveStyleId } from "./styles.js";
import {
  FsError,
  createProject,
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
    res.json({ style });
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
      const thread = createThread({
        title: str(body.title),
        projectPath,
        styleId: styleId ?? undefined,
        inputVideoPaths: list.length ? list : single ? [single] : [],
        briefing: str(body.briefing),
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

  // Archive / restore: { archived: boolean }. Archived threads stay on disk, out of the list.
  app.patch("/api/threads/:id", (req, res) => {
    const archived = req.body?.archived;
    if (typeof archived !== "boolean") {
      res.status(400).json({ error: "archived (boolean) is required" });
      return;
    }
    const thread = setThreadArchived(req.params.id, archived);
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    res.json({ thread });
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

    const job = createJob({
      threadId: thread.id,
      prompt: content,
      projectPath: thread.projectPath,
    });
    appendMessage(thread.id, {
      role: "assistant",
      content: `Job ${job.id} queued on executor ${getConfig().executorId}…`,
      jobId: job.id,
    });

    // Fire-and-forget; client polls /api/jobs/:id
    void runProjectJob(job.id);

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
