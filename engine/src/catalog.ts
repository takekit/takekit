/**
 * Models offered per harness in the UI picker. Snapshot of what each CLI
 * reported on 2026-09-23; any other id still works via "custom model".
 *
 * `efforts` are the values the CLI accepts for its reasoning flag
 * (claude --effort, codex model_reasoning_effort, grok --reasoning-effort,
 * opencode --variant). Omitted = the model has no effort knob.
 */
export interface ModelOption {
  id: string;
  label: string;
  /** Other ids the CLI resolves to this model (e.g. "opus"). */
  aliases?: string[];
  efforts?: string[];
  defaultEffort?: string;
}

export interface HarnessCatalog {
  defaultModel: string;
  models: ModelOption[];
}

const CLAUDE = ["low", "medium", "high", "xhigh", "max"];
const CODEX = ["low", "medium", "high", "xhigh", "max", "ultra"];
const GROK = ["low", "medium", "high", "xhigh"];

export const CATALOG: Record<string, HarnessCatalog> = {
  "claude-code": {
    defaultModel: "opus",
    models: [
      { id: "claude-opus-5-5", label: "Opus 5.5", aliases: ["opus-5.5"], efforts: CLAUDE, defaultEffort: "medium" },
      { id: "claude-fable-5-1", label: "Fable 5.1", aliases: ["fable", "fable-5.1"], efforts: CLAUDE, defaultEffort: "medium" },
      { id: "claude-opus-5", label: "Opus 5", aliases: ["opus", "opus-5"], efforts: CLAUDE, defaultEffort: "high" },
      { id: "claude-sonnet-5", label: "Sonnet 5", aliases: ["sonnet", "sonnet-5"], efforts: CLAUDE, defaultEffort: "high" },
      { id: "claude-haiku-4-5", label: "Haiku 4.5", aliases: ["haiku", "haiku-4.5"] },
    ],
  },
  codex: {
    defaultModel: "gpt-6-astra",
    models: [
      { id: "gpt-6-astra", label: "GPT-6 Astra", efforts: CODEX, defaultEffort: "medium" },
      { id: "gpt-6-sol", label: "GPT-6 Sol", efforts: CODEX, defaultEffort: "medium" },
      { id: "gpt-6-luna", label: "GPT-6 Luna", efforts: CODEX.slice(0, 5), defaultEffort: "medium" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", efforts: CODEX, defaultEffort: "low" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", efforts: CODEX, defaultEffort: "medium" },
      { id: "gpt-5.5", label: "GPT-5.5", efforts: CODEX.slice(0, 4), defaultEffort: "medium" },
    ],
  },
  "grok-build": {
    defaultModel: "grok-4.7",
    models: [
      { id: "grok-4.7", label: "Grok 4.7", efforts: GROK, defaultEffort: "high" },
      { id: "grok-4.7-build-fast", label: "Grok 4.7 Fast", efforts: GROK, defaultEffort: "high" },
      { id: "grok-4.6", label: "Grok 4.6", efforts: GROK, defaultEffort: "high" },
      { id: "grok-4.5", label: "Grok 4.5", efforts: GROK.slice(0, 3), defaultEffort: "high" },
      { id: "grok-build", label: "Grok Build" },
    ],
  },
  opencode: {
    defaultModel: "anthropic/claude-opus-5-5",
    models: [
      { id: "anthropic/claude-opus-5-5", label: "Claude Opus 5.5", efforts: CLAUDE, defaultEffort: "high" },
      { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", efforts: CLAUDE, defaultEffort: "high" },
      { id: "opencode-go/grok-4.7", label: "Grok 4.7", efforts: GROK },
      { id: "opencode-go/kimi-k2.7-code", label: "Kimi K2.7 Code", efforts: GROK },
      { id: "opencode-go/glm-5.3", label: "GLM-5.3", efforts: ["low", "high", "max"] },
      { id: "opencode-go/deepseek-v4-pro", label: "DeepSeek V4 Pro", efforts: ["high", "max"] },
      { id: "nvidia/qwen/qwen3-coder-480b-a35b-instruct", label: "Qwen3 Coder 480B", efforts: GROK },
    ],
  },
};

export function defaultModelFor(executorId: string): string {
  return CATALOG[executorId]?.defaultModel ?? "";
}
