import express from "express";
import cors from "cors";
import { createReadStream, existsSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import {
  appendMessage,
  createJob,
  createThread,
  getJob,
  getThread,
  listThreads,
} from "./store.js";
import { runProjectJob } from "./project-runner.js";
import { listExecutors } from "./adapters/index.js";
import { claudeCodeCliHelp } from "./adapters/claude-code.js";
import {
  DEFAULT_PROJECT_PATH,
  DEFAULT_STYLE_ID,
  PIPELINE_ROOT,
} from "./config.js";
import type { ProjectSummary } from "./types.js";

export function createApp() {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "takekit-engine",
      pipelineRoot: PIPELINE_ROOT,
      defaultProject: DEFAULT_PROJECT_PATH,
      executors: listExecutors(),
      claudeCli: claudeCodeCliHelp(),
    });
  });

  app.get("/api/projects", (_req, res) => {
    const projects: ProjectSummary[] = [
      {
        id: "09-jev",
        path: DEFAULT_PROJECT_PATH,
        label: "09-jev (DEFAULT guinea pig)",
        styleId: DEFAULT_STYLE_ID,
      },
    ];
    res.json({ projects, pipelineRoot: PIPELINE_ROOT });
  });

  app.get("/api/threads", (_req, res) => {
    res.json({ threads: listThreads() });
  });

  app.post("/api/threads", (req, res) => {
    const { title, projectPath, styleId } = req.body ?? {};
    const thread = createThread({ title, projectPath, styleId });
    res.status(201).json({ thread });
  });

  app.get("/api/threads/:id", (req, res) => {
    const thread = getThread(req.params.id);
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    res.json({ thread });
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
      content: `Job ${job.id} queued on executor…`,
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

  app.get("/api/threads/:id/preview", (req, res) => {
    const thread = getThread(req.params.id);
    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }
    if (!thread.previewPath) {
      res.status(404).json({
        error: "No preview path yet",
        hint: "Jobs do not yet discover exports; set preview after a successful pipeline run.",
      });
      return;
    }
    if (!existsSync(thread.previewPath)) {
      res.status(404).json({ error: "Preview file missing", path: thread.previewPath });
      return;
    }

    const stat = statSync(thread.previewPath);
    const ext = extname(thread.previewPath).toLowerCase();
    const type =
      ext === ".mp4"
        ? "video/mp4"
        : ext === ".webm"
          ? "video/webm"
          : ext === ".mov"
            ? "video/quicktime"
            : "application/octet-stream";

    res.setHeader("Content-Type", type);
    res.setHeader("Content-Length", stat.size);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${basename(thread.previewPath)}"`,
    );
    createReadStream(thread.previewPath).pipe(res);
  });

  return app;
}
