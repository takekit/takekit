import type { Executor, ExecutorRequest, ExecutorResult } from "./types.js";
import { resolveBin, runCli } from "./spawn.js";
import { codexParser } from "../activity.js";

/**
 * OpenAI Codex CLI adapter (`codex exec`, non-interactive).
 *
 *   codex exec --json --model <m> -c model_reasoning_effort="<e>"
 *              --cd <cwd> --add-dir <project> --skip-git-repo-check
 *              (--dangerously-bypass-approvals-and-sandbox | --sandbox workspace-write)
 *              -- "<prompt>"
 *   codex exec resume --json ... -- <thread id> "<prompt>"   (next messages of the thread)
 *
 * Binary: CODEX_BIN or `codex` on PATH. With --json, stdout is a JSONL event
 * stream (see activity.ts); the final answer is the last agent_message.
 */
function buildArgs(request: ExecutorRequest, cwd: string): string[] {
  if (request.session?.resume && request.session.id) return resumeArgs(request, cwd, request.session.id);
  // --json: JSONL events (commands, file changes, plan) for the live activity feed.
  const args = ["exec", "--json"];
  if (request.model) args.push("--model", request.model);
  if (request.effort) args.push("-c", `model_reasoning_effort="${request.effort}"`);
  args.push("--cd", cwd, "--skip-git-repo-check");
  for (const dir of new Set([request.projectPath, request.pipelineRoot])) {
    if (dir && dir !== cwd) args.push("--add-dir", dir);
  }
  args.push(
    ...(request.skipPermissions
      ? ["--dangerously-bypass-approvals-and-sandbox"]
      : ["--sandbox", "workspace-write"]),
  );
  args.push("--", request.prompt);
  return args;
}

/**
 * `codex exec resume <thread id> <prompt>`: same thread, current model. Resume takes no
 * --cd / --add-dir / --sandbox, so the sandbox goes in as config (cwd = the process cwd).
 */
function resumeArgs(request: ExecutorRequest, cwd: string, threadId: string): string[] {
  const args = ["exec", "resume", "--json", "--skip-git-repo-check"];
  if (request.model) args.push("--model", request.model);
  if (request.effort) args.push("-c", `model_reasoning_effort="${request.effort}"`);
  if (request.skipPermissions) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    const roots = [...new Set([cwd, request.projectPath, request.pipelineRoot].filter(Boolean))];
    args.push("-c", 'sandbox_mode="workspace-write"', "-c", `sandbox_workspace_write.writable_roots=${JSON.stringify(roots)}`);
  }
  args.push("--", threadId, request.prompt);
  return args;
}

export class CodexExecutor implements Executor {
  readonly id = "codex";
  readonly label = "Codex";

  async run(request: ExecutorRequest): Promise<ExecutorResult> {
    const bin = await resolveBin(request.bin?.trim() || "codex", "Codex", "CODEX_BIN");
    const cwd = request.cwd ?? request.pipelineRoot;
    return runCli({
      cliName: "Codex",
      bin,
      args: buildArgs(request, cwd),
      prompt: request.prompt,
      cwd,
      signal: request.signal,
      logTag: this.id,
      live: request.live,
      parser: codexParser(request.onActivity ?? (() => {})),
    });
  }
}
