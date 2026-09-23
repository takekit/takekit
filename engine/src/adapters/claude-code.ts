import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { delimiter, dirname } from "node:path";
import type { Executor, ExecutorRequest, ExecutorResult } from "./types.js";

/**
 * Claude Code CLI adapter.
 *
 * Documented commands (Claude Code):
 *   claude                  Interactive REPL (not used by harness)
 *   claude -p "<prompt>"    Non-interactive print mode (used here)
 *   claude --print ...      Alias of -p
 *
 * Extra flags we may pass:
 *   --add-dir <path>        Allow tool access to additional directories
 *   --dangerously-skip-permissions  Only when TAKEKIT_CLAUDE_SKIP_PERMS=1
 *
 * Binary resolution: `claude` on PATH, or CLAUDE_BIN env override.
 * If missing → clear error (no silent mock success).
 */
const DEFAULT_BIN = process.env.CLAUDE_BIN?.trim() || "claude";

async function resolveClaudeBin(bin: string): Promise<string> {
  if (bin.includes("/") || bin.includes("\\")) {
    await access(bin, fsConstants.X_OK);
    return bin;
  }
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = `${dir}/${bin}`;
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `Claude Code CLI not found (looked for "${bin}" on PATH). ` +
      `Install Claude Code and ensure \`claude\` is available, ` +
      `or set CLAUDE_BIN to the binary path.`,
  );
}

function buildArgs(request: ExecutorRequest): string[] {
  const args: string[] = ["-p", request.prompt];

  // Allow the agent to touch the video project and pipeline trees
  args.push("--add-dir", request.projectPath);
  if (request.pipelineRoot && request.pipelineRoot !== request.projectPath) {
    args.push("--add-dir", request.pipelineRoot);
  }

  if (process.env.TAKEKIT_CLAUDE_SKIP_PERMS === "1") {
    args.push("--dangerously-skip-permissions");
  }

  return args;
}

export class ClaudeCodeExecutor implements Executor {
  readonly id = "claude-code";
  readonly label = "Claude Code";

  async run(request: ExecutorRequest): Promise<ExecutorResult> {
    const bin = await resolveClaudeBin(DEFAULT_BIN);
    const args = buildArgs(request);
    const cwd = request.cwd ?? request.pipelineRoot;

    return new Promise<ExecutorResult>((resolve, reject) => {
      const child = spawn(bin, args, {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      const onAbort = () => {
        child.kill("SIGTERM");
      };
      request.signal?.addEventListener("abort", onAbort, { once: true });

      child.on("error", (err) => {
        request.signal?.removeEventListener("abort", onAbort);
        reject(
          new Error(
            `Failed to spawn Claude Code ("${bin}"): ${err.message}. ` +
              `Is the CLI installed?`,
          ),
        );
      });

      child.on("close", (code) => {
        request.signal?.removeEventListener("abort", onAbort);
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          previewPath: null,
        });
      });
    });
  }
}

/** Hint for docs / health checks */
export function claudeCodeCliHelp(): string {
  return [
    "Claude Code CLI (adapter: claude-code)",
    "  Interactive:  claude",
    "  Print mode:   claude -p \"<prompt>\"",
    "  Add dirs:     claude -p \"...\" --add-dir <project> --add-dir <pipeline>",
    `  Binary:       ${DEFAULT_BIN} (override with CLAUDE_BIN)`,
    `  Bin dir hint: ${dirname(DEFAULT_BIN)}`,
  ].join("\n");
}
