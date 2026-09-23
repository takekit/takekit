import { dirname } from "node:path";
import type { Executor, ExecutorRequest, ExecutorResult } from "./types.js";
import { resolveBin, runCli } from "./spawn.js";
import { anthropicStreamParser } from "../activity.js";

/**
 * Claude Code CLI adapter.
 *
 * Documented commands (Claude Code):
 *   claude                  Interactive REPL (not used by harness)
 *   claude -p "<prompt>"    Non-interactive print mode (used here)
 *   claude --print ...      Alias of -p
 *
 * Flags we pass:
 *   --output-format stream-json --verbose   Live events for the activity feed (activity.ts)
 *   --model <model>         From config (TAKEKIT_MODEL / config.json), default "opus"
 *   --effort <level>        From config (TAKEKIT_EFFORT / config.json), omitted when empty
 *   --add-dir <path>        Allow tool access to additional directories
 *   --dangerously-skip-permissions  Only when skipPermissions / TAKEKIT_SKIP_PERMS=1
 *
 * Never passes --bare (the pipeline relies on skills / CLAUDE.md discovery).
 *
 * Binary resolution: request.bin (config.claudeBin / CLAUDE_BIN) or `claude` on PATH.
 * If missing → clear error (no silent mock success).
 */
function buildArgs(request: ExecutorRequest): string[] {
  // stream-json (+ --verbose, required with -p) = live tool calls for the UI; final text in the `result` event.
  const args: string[] = ["-p", request.prompt, "--output-format", "stream-json", "--verbose"];

  if (request.model) {
    args.push("--model", request.model);
  }
  if (request.effort) {
    args.push("--effort", request.effort);
  }

  // Allow the agent to touch the video project and pipeline trees
  args.push("--add-dir", request.projectPath);
  if (request.pipelineRoot && request.pipelineRoot !== request.projectPath) {
    args.push("--add-dir", request.pipelineRoot);
  }

  if (request.skipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  return args;
}

export class ClaudeCodeExecutor implements Executor {
  readonly id = "claude-code";
  readonly label = "Claude Code";

  async run(request: ExecutorRequest): Promise<ExecutorResult> {
    const bin = await resolveBin(request.bin?.trim() || "claude", "Claude Code", "CLAUDE_BIN / config.claudeBin");
    const cwd = request.cwd ?? request.pipelineRoot;
    return runCli({
      cliName: "Claude Code",
      bin,
      args: buildArgs(request),
      prompt: request.prompt,
      cwd,
      signal: request.signal,
      logTag: this.id,
      parser: anthropicStreamParser(request.onActivity ?? (() => {})),
    });
  }
}

/** Hint for docs / health checks */
export function claudeCodeCliHelp(bin = "claude", model?: string): string {
  return [
    "Claude Code CLI (adapter: claude-code)",
    "  Interactive:  claude",
    "  Print mode:   claude -p \"<prompt>\" --model <model>",
    "  Add dirs:     claude -p \"...\" --add-dir <project> --add-dir <pipeline>",
    `  Binary:       ${bin} (override with CLAUDE_BIN or config.claudeBin)`,
    `  Model:        ${model ?? "(none)"} (override with TAKEKIT_MODEL or config.model)`,
    `  Bin dir hint: ${dirname(bin)}`,
  ].join("\n");
}
