import type { Executor, ExecutorRequest, ExecutorResult } from "./types.js";

/**
 * Future stub — OpenAI Codex CLI adapter (not implemented).
 */
export class CodexExecutor implements Executor {
  readonly id = "codex";
  readonly label = "Codex (stub)";

  async run(_request: ExecutorRequest): Promise<ExecutorResult> {
    throw new Error(
      "Codex adapter is a stub. Use executor id \"claude-code\" for now.",
    );
  }
}
