import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultModelFor } from "./catalog.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** In-repo copy of the 09-jev / editor-reels pipeline (skill + video/resolve). */
const IN_REPO_PIPELINE = resolve(HERE, "../../pipeline");

export const EXECUTOR_IDS = ["claude-code", "codex", "grok-build", "opencode"] as const;
export type ExecutorId = (typeof EXECUTOR_IDS)[number];

/** Shape of ~/.takekit/config.json (null = use default). */
export interface FileConfig {
  executorId?: ExecutorId | null;
  model?: string | null;
  pipelineRoot?: string | null;
  claudeBin?: string | null;
  /** Reasoning effort in the executor's own vocabulary (see catalog.ts). */
  effort?: string | null;
  /** Run every executor without approval prompts (full access). */
  skipPermissions?: boolean | null;
  /** Legacy name of skipPermissions (Claude-only era); still read. */
  skipClaudePerms?: boolean | null;
}

/** Effective config after env > config.json > defaults. */
export interface EffectiveConfig {
  executorId: ExecutorId;
  model: string;
  effort: string;
  pipelineRoot: string;
  claudeBin: string;
  skipPermissions: boolean;
}

export const DEFAULT_STYLE_ID = "09-jev";
export const DEFAULT_MODEL = "opus";

export const PORT = Number(process.env.TAKEKIT_ENGINE_PORT ?? 8787);

export const HOST = process.env.TAKEKIT_ENGINE_HOST ?? "127.0.0.1";

/** Data dir: threads/, jobs/, config.json. Override with TAKEKIT_DATA_DIR. */
export const DATA_DIR = resolve(
  process.env.TAKEKIT_DATA_DIR?.trim() || join(homedir(), ".takekit"),
);

export const CONFIG_PATH = join(DATA_DIR, "config.json");

function nonEmpty(value: string | null | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

function isExecutorId(value: unknown): value is ExecutorId {
  return typeof value === "string" && (EXECUTOR_IDS as readonly string[]).includes(value);
}

export function readFileConfig(): FileConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as FileConfig) : {};
  } catch (err) {
    console.warn(`[takekit-engine] ignoring invalid ${CONFIG_PATH}:`, err);
    return {};
  }
}

/** Fields currently forced by env vars (they win over config.json). */
export function envOverrides(): Array<keyof EffectiveConfig> {
  const out: Array<keyof EffectiveConfig> = [];
  if (nonEmpty(process.env.TAKEKIT_EXECUTOR)) out.push("executorId");
  if (nonEmpty(process.env.TAKEKIT_MODEL)) out.push("model");
  if (process.env.TAKEKIT_EFFORT !== undefined) out.push("effort");
  if (nonEmpty(process.env.TAKEKIT_PIPELINE_ROOT)) out.push("pipelineRoot");
  if (nonEmpty(process.env.CLAUDE_BIN)) out.push("claudeBin");
  if (skipPermsEnv() !== undefined) out.push("skipPermissions");
  return out;
}

/**
 * Precedence: env > config.json > defaults. Re-read on every call so edits to
 * config.json (or PUT /api/config) apply to the next job without restart.
 *
 * `executorId` is returned as-is even if unknown; the runner reports it in chat.
 */
export function getConfig(): EffectiveConfig {
  const file = readFileConfig();
  const executorRaw =
    nonEmpty(process.env.TAKEKIT_EXECUTOR) ?? nonEmpty(file.executorId) ?? "claude-code";
  const skipEnv = skipPermsEnv();
  return {
    executorId: executorRaw as ExecutorId,
    model:
      nonEmpty(process.env.TAKEKIT_MODEL) ??
      nonEmpty(file.model) ??
      (defaultModelFor(executorRaw) || DEFAULT_MODEL),
    effort: (process.env.TAKEKIT_EFFORT ?? file.effort ?? "").trim(),
    pipelineRoot: resolve(
      nonEmpty(process.env.TAKEKIT_PIPELINE_ROOT) ??
        nonEmpty(file.pipelineRoot) ??
        IN_REPO_PIPELINE,
    ),
    claudeBin: nonEmpty(process.env.CLAUDE_BIN) ?? nonEmpty(file.claudeBin) ?? "claude",
    skipPermissions:
      skipEnv !== undefined
        ? skipEnv === "1"
        : Boolean(file.skipPermissions ?? file.skipClaudePerms),
  };
}

/** TAKEKIT_SKIP_PERMS, falling back to the legacy TAKEKIT_CLAUDE_SKIP_PERMS. */
function skipPermsEnv(): string | undefined {
  return process.env.TAKEKIT_SKIP_PERMS ?? process.env.TAKEKIT_CLAUDE_SKIP_PERMS;
}

/** Merge a patch into config.json (atomic write). Throws on invalid values. */
export function saveFileConfig(patch: Record<string, unknown>): FileConfig {
  const next: FileConfig = { ...readFileConfig() };

  if ("executorId" in patch) {
    const v = patch.executorId;
    if (v !== null && !isExecutorId(v)) {
      throw new Error(`executorId must be one of: ${EXECUTOR_IDS.join(", ")}`);
    }
    next.executorId = v;
  }
  for (const key of ["model", "effort", "pipelineRoot", "claudeBin"] as const) {
    if (key in patch) {
      const v = patch[key];
      if (v !== null && typeof v !== "string") throw new Error(`${key} must be a string or null`);
      next[key] = nonEmpty(v as string | null) ?? null;
    }
  }
  for (const key of ["skipPermissions", "skipClaudePerms"] as const) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (v !== null && typeof v !== "boolean") throw new Error(`${key} must be a boolean`);
    // One flag for every executor; drop the legacy key so the two can't disagree.
    next.skipPermissions = v;
    delete next.skipClaudePerms;
  }

  writeJsonAtomic(CONFIG_PATH, next);
  return next;
}

/** Pipeline root for Claude Code cwd / --add-dir (effective config). */
export function pipelineRoot(): string {
  return getConfig().pipelineRoot;
}

/** Default guinea-pig project (style 09-jev). */
export function defaultProjectPath(): string {
  return resolve(
    process.env.TAKEKIT_DEFAULT_PROJECT ?? `${pipelineRoot()}/video/projects/09-jev`,
  );
}

/** Write temp + rename so a crash never leaves a half-written JSON file. */
export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}
