import type { Executor, ExecutorRequest, ExecutorResult } from "./types.js";

/**
 * Future stub — OpenCode CLI adapter (not implemented).
 * Same Executor contract as Claude Code / Codex / Grok Build.
 */
export class OpenCodeExecutor implements Executor {
  readonly id = "opencode";
  readonly label = "OpenCode (stub)";

  async run(_request: ExecutorRequest): Promise<ExecutorResult> {
    throw new Error(
      "OpenCode adapter is a stub. Use executor id \"claude-code\" for now.",
    );
  }
}
