import type { Executor } from "./types.js";
import { ClaudeCodeExecutor } from "./claude-code.js";
import { CodexExecutor } from "./codex.js";
import { GrokBuildExecutor } from "./grok-build.js";
import { OpenCodeExecutor } from "./opencode.js";

const registry = new Map<string, Executor>();

function register(executor: Executor): void {
  registry.set(executor.id, executor);
}

register(new ClaudeCodeExecutor());
register(new CodexExecutor());
register(new GrokBuildExecutor());
register(new OpenCodeExecutor());

export function getExecutor(id?: string): Executor {
  const key = id ?? process.env.TAKEKIT_EXECUTOR ?? "claude-code";
  const executor = registry.get(key);
  if (!executor) {
    throw new Error(
      `Unknown executor "${key}". Available: ${[...registry.keys()].join(", ")}`,
    );
  }
  return executor;
}

export function listExecutors(): Array<{ id: string; label: string }> {
  return [...registry.values()].map((e) => ({ id: e.id, label: e.label }));
}

export type { Executor, ExecutorRequest, ExecutorResult } from "./types.js";
