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
}

export interface ExecutorResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Optional path to a preview artifact if the run produced one */
  previewPath?: string | null;
  /** Final answer, when stdout is a JSON event stream (else read stdout). */
  text?: string;
}

export interface Executor {
  readonly id: string;
  readonly label: string;
  run(request: ExecutorRequest): Promise<ExecutorResult>;
}
