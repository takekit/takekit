import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "./config.js";

/**
 * Pipeline scripts the engine runs itself, without an agent: the final export, a preview
 * re-render after a preset swap, caption stills for the builder. Same scripts the agent
 * runs (video/headless, video/resolve), same venv, cwd = pipeline root.
 */

/** The pipeline's venv python (video/headless/setup.sh), else python3 on PATH. */
export function pythonBin(pipelineRoot = getConfig().pipelineRoot): string {
  const venv = join(pipelineRoot, ".venv", "bin", "python");
  return existsSync(venv) ? venv : "python3";
}

export interface ScriptResult {
  code: number;
  /** Last lines of stdout + stderr, for the error message. */
  tail: string;
  stdout: string;
}

/**
 * Run `python <script> …args` from the pipeline root. `onLine` gets each stdout line as it
 * arrives (progress markers). Never rejects: a spawn failure comes back as code 127.
 */
export function runScript(
  script: string,
  args: string[],
  opts: { onLine?: (line: string) => void; signal?: AbortSignal; stdin?: string | Buffer } = {},
): Promise<ScriptResult> {
  const root = getConfig().pipelineRoot;
  return new Promise((resolve) => {
    const child = spawn(pythonBin(root), [script, ...args], {
      cwd: root,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: [opts.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      signal: opts.signal,
    });
    let stdout = "";
    let stderr = "";
    let partial = "";
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      stdout = keepTail(stdout + chunk, 200_000);
      partial += chunk;
      const lines = partial.split(/\r?\n/);
      partial = lines.pop() ?? "";
      for (const line of lines) opts.onLine?.(line);
    });
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => {
      stderr = keepTail(stderr + chunk, 20_000);
    });
    if (opts.stdin !== undefined) child.stdin!.end(opts.stdin);
    let settled = false;
    const done = (code: number, extra = "") => {
      if (settled) return;
      settled = true;
      if (partial) opts.onLine?.(partial);
      const tail = [stdout.trim().split("\n").slice(-12).join("\n"), stderr.trim(), extra]
        .filter(Boolean)
        .join("\n")
        .slice(-4000);
      resolve({ code, tail, stdout });
    };
    child.on("error", (err) => done(127, err.message));
    child.on("close", (code) => done(code ?? 1));
  });
}

function keepTail(text: string, max: number): string {
  return text.length > max ? text.slice(-max) : text;
}

/** Value of the last `KEY=value` line in a script's stdout. */
export function lastMarker(stdout: string, key: string): string | null {
  const matches = [...stdout.matchAll(new RegExp(`^${key}=(.+)$`, "gm"))];
  return matches.at(-1)?.[1]?.trim() || null;
}
