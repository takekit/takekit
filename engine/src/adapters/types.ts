/**
 * Executor — CI / agent adapter contract.
 * Claude Code is the first implementation; Codex, Grok Build, and OpenCode are stubs.
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
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface ExecutorResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Optional path to a preview artifact if the run produced one */
  previewPath?: string | null;
}

export interface Executor {
  readonly id: string;
  readonly label: string;
  run(request: ExecutorRequest): Promise<ExecutorResult>;
}
