import type { Executor, ExecutorRequest, ExecutorResult } from "./types.js";

/**
 * Future stub — Grok Build / xAI coding agent adapter (not implemented).
 */
export class GrokBuildExecutor implements Executor {
  readonly id = "grok-build";
  readonly label = "Grok Build (stub)";

  async run(_request: ExecutorRequest): Promise<ExecutorResult> {
    throw new Error(
      "Grok Build adapter is a stub. Use executor id \"claude-code\" for now.",
    );
  }
}
