import type { ActivityUpdate } from "../activity.js";

/**
 * Executor — CI / agent adapter contract.
 * Implementations: Claude Code, Codex, Grok Build, OpenCode (headless CLI runs).
 */
export interface ExecutorRequest {
  /** Absolute path to the video project directory */
  projectPath: string;
  /** Absolute path to the pipeline root (ai-content-agent), for cwd / context */
  pipelineRoot: string;
  /** User / system prompt to run */
  prompt: string;
  /** Optional working directory override (defaults to pipelineRoot) */
  cwd?: string;
  /** Model id/alias passed to the CLI (e.g. "opus" for Claude Code) */
  model?: string;
  /** Reasoning effort, in the CLI's own vocabulary (see catalog.ts). Empty = CLI default. */
  effort?: string;
  /** Adapter-specific binary override (e.g. config.claudeBin) */
  bin?: string;
  /** Run without approval prompts (each adapter maps this to its own flag). */
  skipPermissions?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Live activity (tool calls, messages, plan) while the CLI runs. */
  onActivity?: (update: ActivityUpdate) => void;
  /**
   * CLI session to use. `resume: true` continues `id`; otherwise a new session, named `id`
   * when the CLI lets us pick it (Claude, Grok) or whatever the CLI assigns (Codex, OpenCode).
   */
  session?: { id?: string; resume: boolean };
  /** Filled by adapters whose CLI takes user messages mid-run (Claude stream-json input). */
  live?: LiveInput;
}

/** Hand-off for messages sent while the run is going. */
export interface LiveInput {
  /** Delivers a user message to the running CLI; false once it stopped taking input. Null = not supported. */
  send: ((text: string) => boolean) | null;
  /** Session id as soon as the stream shows it (so a turn can be interrupted and resumed). */
  sessionId?: string;
}

export interface ExecutorResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Optional path to a preview artifact if the run produced one */
  previewPath?: string | null;
  /** Final answer, when stdout is a JSON event stream (else read stdout). */
  text?: string;
  /** Session the run used (to resume it next time). */
  sessionId?: string;
}

export interface Executor {
  readonly id: string;
  readonly label: string;
  run(request: ExecutorRequest): Promise<ExecutorResult>;
}
