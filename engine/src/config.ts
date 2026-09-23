import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** In-repo copy of the 09-jev / editor-reels pipeline (skill + video/resolve). */
const IN_REPO_PIPELINE = resolve(HERE, "../../pipeline");

/**
 * Pipeline root for Claude Code cwd / --add-dir.
 * Must contain `.agents/skills/editor-reels` and `video/resolve/` (skill relative
 * paths are rooted here). Override with TAKEKIT_PIPELINE_ROOT if needed.
 */
export const PIPELINE_ROOT = resolve(
  process.env.TAKEKIT_PIPELINE_ROOT ?? IN_REPO_PIPELINE,
);

/** Default guinea-pig project (style 09-jev). */
export const DEFAULT_PROJECT_PATH = resolve(
  process.env.TAKEKIT_DEFAULT_PROJECT ??
    `${PIPELINE_ROOT}/video/projects/09-jev`,
);

export const DEFAULT_STYLE_ID = "09-jev";

export const PORT = Number(process.env.TAKEKIT_ENGINE_PORT ?? 8787);

export const HOST = process.env.TAKEKIT_ENGINE_HOST ?? "127.0.0.1";
