import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { getExecutor } from "./adapters/index.js";
import { PIPELINE_ROOT } from "./config.js";
import {
  getJob,
  setThreadPreview,
  updateJob,
  appendMessage,
} from "./store.js";

/**
 * ProjectRunner — wires a video project path + prompt to an Executor.
 *
 * Does NOT reimplement ai-content-agent / Resolve pipeline.
 * It only:
 *   1) Validates project + pipeline paths exist
 *   2) Builds a prompt that points the agent at editor-reels / DEFAULT 09-jev
 *   3) Spawns the selected CI adapter (default: Claude Code)
 *
 * Reference paths (read-only wiring):
 *   pipeline:  .../ai-content-agent
 *   skill:     .agents/skills/editor-reels/SKILL.md
 *   default:   video/resolve/DEFAULT.md (09-jev)
 *   project:   video/projects/09-jev (guinea pig)
 */
export async function runProjectJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  updateJob(jobId, { status: "running", startedAt: new Date().toISOString() });

  try {
    await access(job.projectPath, fsConstants.R_OK);
  } catch {
    const error = `Project path not readable: ${job.projectPath}`;
    updateJob(jobId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error,
      exitCode: 1,
    });
    appendMessage(job.threadId, {
      role: "assistant",
      content: `Job failed: ${error}`,
      jobId,
    });
    return;
  }

  try {
    await access(PIPELINE_ROOT, fsConstants.R_OK);
  } catch {
    const error =
      `Pipeline root not readable: ${PIPELINE_ROOT}. ` +
      `Set TAKEKIT_PIPELINE_ROOT to takekit/pipeline (in-repo) or another checkout with .agents + video/.`;
    updateJob(jobId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error,
      exitCode: 1,
    });
    appendMessage(job.threadId, {
      role: "assistant",
      content: `Job failed: ${error}`,
      jobId,
    });
    return;
  }

  const executor = getExecutor();
  const composedPrompt = composeAgentPrompt(job.projectPath, job.prompt);

  try {
    const result = await executor.run({
      projectPath: job.projectPath,
      pipelineRoot: PIPELINE_ROOT,
      prompt: composedPrompt,
      cwd: PIPELINE_ROOT,
    });

    const status = result.exitCode === 0 ? "succeeded" : "failed";
    updateJob(jobId, {
      status,
      finishedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      stdout: truncate(result.stdout, 50_000),
      stderr: truncate(result.stderr, 20_000),
      error:
        result.exitCode === 0
          ? null
          : `Executor exited with code ${result.exitCode}`,
      previewPath: result.previewPath ?? null,
    });

    if (result.previewPath) {
      setThreadPreview(job.threadId, result.previewPath);
    }

    const summary =
      status === "succeeded"
        ? truncate(result.stdout.trim() || "(executor finished with empty stdout)", 4000)
        : [
            `Executor failed (exit ${result.exitCode}).`,
            result.stderr.trim() || result.stdout.trim() || "(no output)",
          ].join("\n\n");

    appendMessage(job.threadId, {
      role: "assistant",
      content: summary,
      jobId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateJob(jobId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: message,
      exitCode: 1,
    });
    appendMessage(job.threadId, {
      role: "assistant",
      content: `Job failed: ${message}`,
      jobId,
    });
  }
}

function composeAgentPrompt(projectPath: string, userPrompt: string): string {
  return [
    "You are running inside the Takekit harness as the video-edit agent.",
    "Follow the existing ai-content-agent editor-reels skill and DEFAULT 09-jev.",
    "Do NOT invent a new pipeline. Use scripts under video/resolve/ as documented.",
    "",
    `Pipeline root (cwd): ${PIPELINE_ROOT}`,
    `Video project path: ${projectPath}`,
    "Skill: .agents/skills/editor-reels/SKILL.md",
    "Default style: video/resolve/DEFAULT.md (09-jev)",
    "Workflow: video/resolve/WORKFLOW.md",
    "",
    "User request:",
    userPrompt,
  ].join("\n");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}
