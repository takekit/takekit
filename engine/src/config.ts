import { resolve } from "node:path";

/**
 * External pipeline root — do NOT copy ai-content-agent into this repo.
 * Default points at the local personal_repositories checkout used as guinea pig.
 */
export const PIPELINE_ROOT = resolve(
  process.env.TAKEKIT_PIPELINE_ROOT ??
    "/Users/oldaquerios/dev/myGitHub/personal_repositories/ai-content-agent",
);

/** Default guinea-pig project (style 09-jev). */
export const DEFAULT_PROJECT_PATH = resolve(
  process.env.TAKEKIT_DEFAULT_PROJECT ??
    `${PIPELINE_ROOT}/video/projects/09-jev`,
);

export const DEFAULT_STYLE_ID = "09-jev";

export const PORT = Number(process.env.TAKEKIT_ENGINE_PORT ?? 8787);

export const HOST = process.env.TAKEKIT_ENGINE_HOST ?? "127.0.0.1";
