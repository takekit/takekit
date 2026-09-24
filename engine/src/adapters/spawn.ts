import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { delimiter } from "node:path";
import type { ExecutorResult, LiveInput } from "./types.js";
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
  /** Runner hand-off: gets the session id as it shows up (and `send` with streamInput). */
  live?: LiveInput;
  /**
   * Claude stream-json input: the prompt goes in as the first stdin message, `live.send`
   * takes more while the turn runs, and stdin closes when the `result` event arrives.
   */
  streamInput?: boolean;
}): Promise<ExecutorResult> {
  const { cliName, bin, args, prompt, cwd, signal, logTag, parser, streamInput, live } = opts;
  console.log(`[${logTag}] spawn ${bin} ${describeArgs(args, prompt)} (cwd ${cwd})`);

  return new Promise<ExecutorResult>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env },
      stdio: [streamInput ? "pipe" : "ignore", "pipe", "pipe"],
    });

    // Stream input: every user message is one JSON line; closing stdin ends the session.
    let inputOpen = Boolean(streamInput && child.stdin);
    const write = (text: string): boolean => {
      if (!inputOpen || !child.stdin) return false;
      child.stdin.write(`${JSON.stringify({ type: "user", message: { role: "user", content: text } })}\n`);
      return true;
    };
    const endInput = () => {
      if (!inputOpen) return;
      inputOpen = false;
      if (live) live.send = null;
      child.stdin?.end();
    };
    if (streamInput) {
      child.stdin?.on("error", () => endInput()); // EPIPE when the CLI died first
      write(prompt);
      if (live) live.send = write;
    }

    let stdout = "";
    let stderr = "";
    let pendingLine = "";
    const feed = (line: string) => {
      // The turn is over: no more input, so the CLI exits.
      if (inputOpen && isResultEvent(line)) endInput();
      try {
        parser?.line(line);
      } catch (err) {
        console.warn(`[${logTag}] activity parser failed on a line:`, err);
      }
      if (live && parser) live.sessionId = parser.sessionId() ?? live.sessionId;
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      if (!parser && !streamInput) return;
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
      if (live) live.send = null;
      reject(new Error(`Failed to spawn ${cliName} ("${bin}"): ${err.message}. Is the CLI installed?`));
    });

    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (live) live.send = null;
      inputOpen = false;
      if (pendingLine) feed(pendingLine);
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        previewPath: null,
        text: parser?.finalText(),
        sessionId: parser?.sessionId(),
      });
    });
  });
}

function isResultEvent(line: string): boolean {
  if (!line.includes('"result"')) return false;
  try {
    return (JSON.parse(line) as { type?: unknown }).type === "result";
  } catch {
    return false;
  }
}
