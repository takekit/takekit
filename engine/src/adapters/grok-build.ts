import type { Executor, ExecutorRequest, ExecutorResult } from "./types.js";
import { resolveBin, runCli } from "./spawn.js";
import { anthropicStreamParser } from "../activity.js";

/**
 * Grok Build CLI adapter (single-turn headless mode).
 *
 *   grok -p "<prompt>" --model <m> --reasoning-effort <e>
 *        --cwd <cwd> --output-format streaming-messages-json [--always-approve]
 *
 * streaming-messages-json = NDJSON in the Anthropic Messages shape, read by the
 * same parser as Claude Code (activity.ts).
 *
 * Binary: GROK_BIN or `grok` on PATH. Grok has no --add-dir; the project path
 * travels in the prompt and cwd is the pipeline root (projects live under it).
 */
function buildArgs(request: ExecutorRequest, cwd: string): string[] {
  const args = ["-p", request.prompt, "--cwd", cwd, "--output-format", "streaming-messages-json"];
  if (request.model) args.push("--model", request.model);
  if (request.effort) args.push("--reasoning-effort", request.effort);
  if (request.skipPermissions) args.push("--always-approve");
  return args;
}

export class GrokBuildExecutor implements Executor {
  readonly id = "grok-build";
  readonly label = "Grok Build";

  async run(request: ExecutorRequest): Promise<ExecutorResult> {
    const bin = await resolveBin(request.bin?.trim() || "grok", "Grok Build", "GROK_BIN");
    const cwd = request.cwd ?? request.pipelineRoot;
    return runCli({
      cliName: "Grok Build",
      bin,
      args: buildArgs(request, cwd),
      prompt: request.prompt,
      cwd,
      signal: request.signal,
      logTag: this.id,
      parser: anthropicStreamParser(request.onActivity ?? (() => {})),
    });
  }
}
