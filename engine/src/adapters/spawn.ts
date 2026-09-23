import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { delimiter } from "node:path";
import type { ExecutorResult } from "./types.js";
import type { StreamParser } from "../activity.js";

/**
 * Resolve a CLI binary: explicit path (must be executable) or a name on PATH.
 * `envHint` names the variable the user can set to point at another binary.
 */
export async function resolveBin(bin: string, cliName: string, envHint: string): Promise<string> {
  if (bin.includes("/") || bin.includes("\\")) {
    try {
      await access(bin, fsConstants.X_OK);
    } catch {
      throw new Error(
        `${cliName} CLI not found or not executable at "${bin}". ` +
          `Fix ${envHint}, or clear it to use the binary on PATH.`,
      );
    }
    return bin;
  }
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
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
    `${cliName} CLI not found (looked for "${bin}" on PATH). ` +
      `Install it or set ${envHint} to the binary path.`,
  );
}

/** Args for logs, with the (long) prompt elided. */
export function describeArgs(args: string[], prompt: string): string {
  return args.map((a) => (a === prompt ? `"<prompt ${a.length} chars>"` : JSON.stringify(a))).join(" ");
}

/** Spawn a headless CLI run and collect its output. Never rejects on non-zero exit. */
export function runCli(opts: {
  cliName: string;
  bin: string;
  args: string[];
  prompt: string;
  cwd: string;
  signal?: AbortSignal;
  logTag: string;
  /** Streaming JSON reader: gets every stdout line as it arrives; supplies the final text. */
  parser?: StreamParser;
}): Promise<ExecutorResult> {
  const { cliName, bin, args, prompt, cwd, signal, logTag, parser } = opts;
  console.log(`[${logTag}] spawn ${bin} ${describeArgs(args, prompt)} (cwd ${cwd})`);

  return new Promise<ExecutorResult>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let pendingLine = "";
    const feed = (line: string) => {
      try {
        parser?.line(line);
      } catch (err) {
        console.warn(`[${logTag}] activity parser failed on a line:`, err);
      }
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      if (!parser) return;
      const lines = (pendingLine + text).split("\n");
      pendingLine = lines.pop() ?? "";
      lines.forEach(feed);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const onAbort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error(`Failed to spawn ${cliName} ("${bin}"): ${err.message}. Is the CLI installed?`));
    });

    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (pendingLine) feed(pendingLine);
      resolve({ exitCode: code ?? 1, stdout, stderr, previewPath: null, text: parser?.finalText() });
    });
  });
}
