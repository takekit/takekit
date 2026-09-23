import type { Executor, ExecutorRequest, ExecutorResult } from "./types.js";
import { resolveBin, runCli } from "./spawn.js";
import { opencodeParser } from "../activity.js";

/**
 * OpenCode CLI adapter (`opencode run`, non-interactive).
 *
 *   opencode run --format json --model <provider/model> --variant <e> --dir <cwd> [--auto] "<prompt>"
 *
 * --format json = raw JSON events (step/tool_use/text), read by activity.ts.
 *
 * Binary: OPENCODE_BIN or `opencode` on PATH. `--variant` is OpenCode's
 * provider-specific reasoning effort.
 */
function buildArgs(request: ExecutorRequest, cwd: string): string[] {
  const args = ["run", "--dir", cwd, "--format", "json"];
  if (request.model) args.push("--model", request.model);
  if (request.effort) args.push("--variant", request.effort);
  if (request.skipPermissions) args.push("--auto");
  args.push(request.prompt);
  return args;
}

export class OpenCodeExecutor implements Executor {
  readonly id = "opencode";
  readonly label = "OpenCode";

  async run(request: ExecutorRequest): Promise<ExecutorResult> {
    const bin = await resolveBin(request.bin?.trim() || "opencode", "OpenCode", "OPENCODE_BIN");
    const cwd = request.cwd ?? request.pipelineRoot;
    return runCli({
      cliName: "OpenCode",
      bin,
      args: buildArgs(request, cwd),
      prompt: request.prompt,
      cwd,
      signal: request.signal,
      logTag: this.id,
      parser: opencodeParser(request.onActivity ?? (() => {})),
    });
  }
}
