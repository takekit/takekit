import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { DEFAULT_STYLE_ID, stylesDir } from "./config.js";

/**
 * Style Kit gallery (docs/style-kit/SPEC.md): one package per `styles/<id>/`.
 *
 * The folder is the id, which never changes; the name lives in meta.json and can.
 * Renaming a style is editing meta.json, so threads keep working on the id.
 * Ids a style had before (e.g. "09-jev") stay in meta.aliases and still resolve.
 *
 * Read from disk on every call: the gallery is a handful of small files, and edits
 * apply to the next request without restarting the engine.
 */

export interface StyleKit {
  /** Stable id, immutable (= folder name). */
  id: string;
  /** Display name, mutable. */
  name: string;
  /** Former ids that still resolve to this style. */
  aliases: string[];
  /** Absolute path of the short preview loop, if any. */
  previewVideoPath: string | null;
  /** Style briefing injected into the agent prompt (prompt.md). */
  promptMarkdown: string | null;
  storyboard: string | null;
  soundEffects: object | null;
  transitions: object | null;
  stageScheme: object | null;
  cuts: object | null;
  caption: object | null;
  /** Absolute paths of the .cube / .3dl files in lut/. */
  lutPaths: string[];
  engineScripts: { entries: string[]; byName?: Record<string, string> } | null;
  createdAt: string;
  updatedAt: string;
  /** Package folder (absolute). */
  dir: string;
}

export interface StyleSummary {
  id: string;
  name: string;
  hasPreview: boolean;
  updatedAt: string;
}

interface Meta {
  id?: string;
  name?: string;
  aliases?: string[];
  previewVideoPath?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;
const LUT_EXT = new Set([".cube", ".3dl"]);

/** Every style in the gallery, the default first, then by name. */
export function listStyles(): StyleSummary[] {
  const preferred = defaultStyleId();
  return packageIds()
    .map((id) => loadStyle(id))
    .filter((s): s is StyleKit => s !== null)
    .map((s) => ({ id: s.id, name: s.name, hasPreview: Boolean(s.previewVideoPath), updatedAt: s.updatedAt }))
    .sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred) || a.name.localeCompare(b.name));
}

/** Full package for an id or a former id (alias); null when it isn't in the gallery. */
export function getStyle(idOrAlias: string | null | undefined): StyleKit | null {
  const id = resolveStyleId(idOrAlias);
  return id ? loadStyle(id) : null;
}

/** Current id for `idOrAlias`, or null when no package has it. */
export function resolveStyleId(idOrAlias: string | null | undefined): string | null {
  const wanted = idOrAlias?.trim();
  if (!wanted) return null;
  const ids = packageIds();
  if (ids.includes(wanted)) return wanted;
  for (const id of ids) if (readMeta(id)?.aliases?.includes(wanted)) return id;
  return null;
}

/** Style a new thread gets when none is picked: DEFAULT_STYLE_ID if present, else the first. */
export function defaultStyleId(): string | null {
  const ids = packageIds();
  return ids.includes(DEFAULT_STYLE_ID) ? DEFAULT_STYLE_ID : (ids.sort()[0] ?? null);
}

/** Folders of styles/ that are packages (valid id + meta.json). */
function packageIds(): string[] {
  const root = stylesDir();
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && ID.test(e.name) && existsSync(join(root, e.name, "meta.json")))
    .map((e) => e.name);
}

function readMeta(id: string): Meta | null {
  return readJson(join(stylesDir(), id, "meta.json")) as Meta | null;
}

function loadStyle(id: string): StyleKit | null {
  if (!ID.test(id)) return null;
  const dir = join(stylesDir(), id);
  const meta = readMeta(id);
  if (!meta) return null;
  if (meta.id && meta.id !== id) {
    console.warn(`[takekit-engine] ${dir}/meta.json says id "${meta.id}"; the folder name wins`);
  }
  const preview = meta.previewVideoPath ? join(dir, meta.previewVideoPath) : null;
  const created = meta.createdAt ?? mtime(join(dir, "meta.json"));
  return {
    id,
    name: meta.name?.trim() || id,
    aliases: Array.isArray(meta.aliases) ? meta.aliases.filter((a) => typeof a === "string") : [],
    previewVideoPath: preview && existsSync(preview) ? preview : null,
    promptMarkdown: readText(join(dir, "prompt.md")),
    storyboard: readText(join(dir, "storyboard.md")),
    soundEffects: readJson(join(dir, "sound-effects.json")),
    transitions: readJson(join(dir, "transitions.json")),
    stageScheme: readJson(join(dir, "stage-scheme.json")),
    cuts: readJson(join(dir, "cuts.json")),
    caption: readJson(join(dir, "caption.json")),
    lutPaths: luts(join(dir, "lut")),
    engineScripts: readJson(join(dir, "engine-scripts.json")) as StyleKit["engineScripts"],
    createdAt: created,
    updatedAt: meta.updatedAt ?? created,
    dir,
  };
}

function luts(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => LUT_EXT.has(extname(name).toLowerCase()))
      .sort()
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

/** Parsed JSON object, or null when missing / invalid (fields may be empty in v1). */
function readJson(path: string): object | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    console.warn(`[takekit-engine] ignoring invalid ${path}:`, err);
    return null;
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function mtime(path: string): string {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}
