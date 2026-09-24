import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { DEFAULT_STYLE_ID, stylesDir, writeJsonAtomic } from "./config.js";

/**
 * Style Kit gallery (docs/style-kit/SPEC.md): one package per `styles/<id>/`.
 *
 * The folder is the id, which never changes; the name lives in meta.json and can.
 * Renaming a style is editing meta.json, so threads keep working on the id.
 * Ids a style had before (e.g. "09-jev") stay in meta.aliases and still resolve.
 *
 * Read from disk on every call: the gallery is a handful of small files, and edits
 * apply to the next request without restarting the engine.
 *
 * Modules (docs/style-kit/SPEC-EXPANSION.md): caption, stage, cuts, soundEffects and
 * transitions each pick a preset from styles/_presets/<module>/ (or the package's own
 * presets/<module>/). A thread can swap any of them without touching the package.
 */

/** Module keys of a style, in the order the UI lists them. */
export const MODULES = ["caption", "stage", "camera", "cuts", "soundEffects", "transitions"] as const;
export type ModuleKey = (typeof MODULES)[number];

/** Folder of each module under _presets/ (and a package's presets/). */
const MODULE_DIR: Record<ModuleKey, string> = {
  caption: "caption",
  stage: "stage",
  camera: "camera",
  cuts: "cuts",
  soundEffects: "sound-effects",
  transitions: "transitions",
};

/** Preset id per module; `stage` lists the palcos a video may use. */
export interface ModuleSelection {
  caption?: string | null;
  stage?: string[] | null;
  /** Camera dynamism: punch / zoom moves and face tracking. */
  camera?: string | null;
  cuts?: string | null;
  soundEffects?: string | null;
  transitions?: string | null;
}

/** One preset file. Shape per module in the spec (CaptionPreset, StagePreset…). */
export interface Preset {
  id: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

export interface PresetSummary {
  id: string;
  name: string;
  description: string;
  /** Stage presets: the palco letter (A, B, C, D). */
  palco?: string;
  /** "library" = styles/_presets, "style" = the package's own presets/. */
  source: "library" | "style";
  /** What the UI needs to draw the preset (caption y, stage layout, burn mode, bed…). */
  visual: PresetVisual;
}

export interface PresetVisual {
  /** caption: center y on the 1080×1920 frame (palco A). */
  y?: number;
  /** stage: host | host-canvas | canvas | split */
  layout?: string;
  /** transitions: where the filmburn goes. */
  burn?: "none" | "hook" | "marked" | "all";
  /** soundEffects */
  sfx?: boolean;
  music?: boolean;
  /** cuts: frames of air kept around speech. */
  pad?: number;
  /** camera: moves it uses, how strong (max scale), how often, and face tracking. */
  moves?: string[];
  intensity?: number;
  frequency?: string;
  tracking?: boolean;
}

function cameraEnergy(v: PresetVisual): number {
  const often = { marcado: 1, poucos: 2, medio: 3, muitos: 4 }[v.frequency ?? ""] ?? 2;
  return (v.moves?.length ? ((v.intensity ?? 1) - 1) * often : 0) + (v.tracking ? 0.001 : 0);
}

function visualOf(module: ModuleKey, p: Preset): PresetVisual {
  const o = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  switch (module) {
    case "caption":
      return { y: Number(o(p.position).y) || 1180 };
    case "stage":
      return { layout: typeof p.layout === "string" ? p.layout : undefined };
    case "transitions": {
      const burn = p.filmburn ? o(p.filmburn) : null;
      if (!burn) return { burn: "none" };
      return { burn: burn.onStageChange === "all" ? "all" : burn.onStageChange === "marked" ? "marked" : "hook" };
    }
    case "soundEffects":
      return { sfx: p.sfx !== false, music: Boolean(p.music) };
    case "cuts":
      return { pad: Number(o(p.tighten).padFrames) || 1 };
    case "camera":
      return {
        moves: Array.isArray(p.moves) ? p.moves.filter((m): m is string => typeof m === "string") : [],
        intensity: Number(p.intensity) || 1,
        frequency: typeof p.frequency === "string" ? p.frequency : "marcado",
        tracking: Boolean(o(p.faceTracking).enabled),
      };
  }
}

/** Encoding of the preview (while editing) or the final export (docs/preview-export). */
export interface Quality {
  resolution: string;
  fps?: number;
  codec: string;
  preset?: string;
  bitrate: string;
  maxrate?: string;
  bufsize?: string;
  audio: { codec: string; bitrate: string; loudness?: { I: number; TP: number; LRA: number } };
  container?: string;
}

/** Spec defaults when a style doesn't define its quality. */
export const DEFAULT_QUALITY: { preview: Quality; export: Quality } = {
  preview: {
    resolution: "720p",
    codec: "h264",
    preset: "veryfast",
    bitrate: "1.5M",
    audio: { codec: "aac", bitrate: "128k" },
    container: "mp4",
  },
  export: {
    resolution: "1080x1920",
    fps: 30,
    codec: "h264",
    preset: "medium",
    bitrate: "10M",
    maxrate: "12M",
    bufsize: "20M",
    audio: { codec: "aac", bitrate: "256k", loudness: { I: -14, TP: -1, LRA: 11 } },
    container: "mp4",
  },
};

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
  /** Preset per module (modules.json); null = the package predates modules. */
  modules: ModuleSelection | null;
  /** Where the style came from (reference videos, an approved video…), from meta.json. */
  derivedFrom: object | null;
  /** quality.json: the final export and the preview; null = spec defaults. */
  exportQuality: Quality | null;
  previewQuality: Quality | null;
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
  modules: ModuleSelection | null;
  /** What the Exportar button renders (the style's, else the spec default). */
  exportQuality: Quality;
  /** Edited in the Estúdio (original.json kept for "Restaurar o original"). */
  edited: boolean;
}

interface Meta {
  id?: string;
  name?: string;
  aliases?: string[];
  previewVideoPath?: string | null;
  derivedFrom?: object | null;
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
    .map((s) => ({
      id: s.id,
      name: s.name,
      hasPreview: Boolean(s.previewVideoPath),
      updatedAt: s.updatedAt,
      modules: s.modules,
      exportQuality: s.exportQuality ?? DEFAULT_QUALITY.export,
      edited: existsSync(join(s.dir, "original.json")),
    }))
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
  return loadPackage(join(stylesDir(), id), id);
}

/** A package folder (gallery style or draft) as a StyleKit; null without meta.json. */
export function loadPackage(dir: string, id: string): StyleKit | null {
  const meta = readJson(join(dir, "meta.json")) as Meta | null;
  if (!meta) return null;
  if (meta.id && meta.id !== id) {
    console.warn(`[takekit-engine] ${dir}/meta.json says id "${meta.id}"; the folder name wins`);
  }
  const preview = meta.previewVideoPath ? join(dir, meta.previewVideoPath) : null;
  const created = meta.createdAt ?? mtime(join(dir, "meta.json"));
  const quality = readJson(join(dir, "quality.json")) as { export?: Quality; preview?: Quality } | null;
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
    modules: normalizeSelection(readJson(join(dir, "modules.json"))),
    derivedFrom: meta.derivedFrom && typeof meta.derivedFrom === "object" ? meta.derivedFrom : null,
    exportQuality: quality?.export ?? null,
    previewQuality: quality?.preview ?? null,
    createdAt: created,
    updatedAt: meta.updatedAt ?? created,
    dir,
  };
}

// ── Modules / presets ──

function presetsRoot(): string {
  return join(stylesDir(), "_presets");
}

/** Presets of a module: the library plus the style's own (same id: the style's wins). */
export function listPresets(module: ModuleKey, style?: StyleKit | null): PresetSummary[] {
  const byId = new Map<string, PresetSummary>();
  const add = (dir: string, source: PresetSummary["source"]) => {
    for (const preset of readPresetDir(dir)) {
      byId.set(preset.id, {
        id: preset.id,
        name: preset.name,
        description: typeof preset.description === "string" ? preset.description : "",
        ...(typeof preset.palco === "string" ? { palco: preset.palco } : {}),
        source,
        visual: visualOf(module, preset),
      });
    }
  };
  add(join(presetsRoot(), MODULE_DIR[module]), "library");
  if (style) add(join(style.dir, "presets", MODULE_DIR[module]), "style");
  const list = [...byId.values()];
  if (module === "stage") return list.sort((a, b) => (a.palco ?? "").localeCompare(b.palco ?? "") || a.name.localeCompare(b.name));
  // Camera from calm to wild: how strong × how often.
  if (module === "camera") return list.sort((a, b) => cameraEnergy(a.visual) - cameraEnergy(b.visual) || a.name.localeCompare(b.name));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/** Full preset (the style's own first, then the library); null when no such id. */
export function getPreset(module: ModuleKey, id: string, style?: StyleKit | null): Preset | null {
  if (!ID.test(id)) return null;
  const dirs = [
    ...(style ? [join(style.dir, "presets", MODULE_DIR[module])] : []),
    join(presetsRoot(), MODULE_DIR[module]),
  ];
  for (const dir of dirs) {
    const preset = readPreset(join(dir, `${id}.json`), id);
    if (preset) return preset;
  }
  return null;
}

/** Save a preset in the library (styles/_presets/<module>/<id>.json). */
export function savePreset(module: ModuleKey, preset: Preset, overwrite: boolean): Preset {
  if (!ID.test(preset.id)) throw new Error(`id inválido: ${preset.id}`);
  if (!preset.name?.trim()) throw new Error("O preset precisa de um nome");
  const path = join(presetsRoot(), MODULE_DIR[module], `${preset.id}.json`);
  if (!overwrite && existsSync(path)) throw new Error(`Já existe um preset ${preset.id}`);
  const clean = { ...preset, name: preset.name.trim() };
  writeJsonAtomic(path, clean);
  return clean;
}

/** What a thread edits with: the style's modules, overridden per key by the thread's. */
export function effectiveSelection(style: StyleKit, override?: ModuleSelection | null): ModuleSelection {
  const base = style.modules ?? {};
  const out: ModuleSelection = {};
  for (const key of MODULES) {
    const picked = override?.[key];
    const value = picked !== undefined && picked !== null ? picked : base[key];
    if (value !== undefined && value !== null) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export interface ResolvedModules {
  caption: Preset | null;
  stage: Preset[] | null;
  camera: Preset | null;
  cuts: Preset | null;
  soundEffects: Preset | null;
  transitions: Preset | null;
}

/** Selection → full presets. Unknown ids are reported, never guessed. */
export function resolveModules(
  style: StyleKit,
  selection: ModuleSelection,
): { modules: ResolvedModules; missing: string[] } {
  const missing: string[] = [];
  const one = (key: Exclude<ModuleKey, "stage">) => {
    const id = selection[key];
    if (!id) return null;
    const preset = getPreset(key, id, style);
    if (!preset) missing.push(`${key}: ${id}`);
    return preset;
  };
  const stage = selection.stage?.length
    ? selection.stage
        .map((id) => {
          const preset = getPreset("stage", id, style);
          if (!preset) missing.push(`stage: ${id}`);
          return preset;
        })
        .filter((p): p is Preset => p !== null)
    : null;
  return {
    modules: {
      caption: one("caption"),
      stage,
      camera: one("camera"),
      cuts: one("cuts"),
      soundEffects: one("soundEffects"),
      transitions: one("transitions"),
    },
    missing,
  };
}

/** Keep only well-formed module keys (a thread override or modules.json). */
export function normalizeSelection(raw: unknown): ModuleSelection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: ModuleSelection = {};
  for (const key of MODULES) {
    const v = src[key];
    if (v === null) (out as Record<string, unknown>)[key] = null;
    else if (key === "stage" && Array.isArray(v)) out.stage = v.filter((x): x is string => typeof x === "string");
    else if (key !== "stage" && typeof v === "string" && v.trim()) (out as Record<string, unknown>)[key] = v.trim();
  }
  return out;
}

/**
 * <project>/edit/style.resolved.json: the thread's style with its presets and quality,
 * which the pipeline scripts read (compose, captions, caption_jobs, tighten_cuts).
 * Rewritten before every job and render, so a swapped preset applies to the next run.
 */
export function writeResolvedStyle(
  projectPath: string,
  input: { style: StyleKit; override?: ModuleSelection | null; threadId: string },
): { path: string; missing: string[]; selection: ModuleSelection } {
  const selection = effectiveSelection(input.style, input.override);
  const { modules, missing } = resolveModules(input.style, selection);
  const path = join(projectPath, "edit", "style.resolved.json");
  writeJsonAtomic(path, {
    _doc:
      "Gerado pelo Takekit a cada job e render: estilo da thread com os presets escolhidos. " +
      "Não edite; troque o preset na thread (ou no pacote styles/<id>/modules.json).",
    styleId: input.style.id,
    styleName: input.style.name,
    styleDir: input.style.dir,
    threadId: input.threadId,
    selection,
    modules,
    quality: {
      preview: input.style.previewQuality ?? DEFAULT_QUALITY.preview,
      export: input.style.exportQuality ?? DEFAULT_QUALITY.export,
    },
    updatedAt: new Date().toISOString(),
  });
  return { path, missing, selection };
}

function readPresetDir(dir: string): Preset[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  return names
    .map((name) => readPreset(join(dir, name), name.slice(0, -5)))
    .filter((p): p is Preset => p !== null);
}

/** The file name is the id (like the style folder); the name falls back to it. */
function readPreset(path: string, id: string): Preset | null {
  const raw = readJson(path) as Record<string, unknown> | null;
  if (!raw || Array.isArray(raw) || !ID.test(id)) return null;
  return { ...raw, id, name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id } as Preset;
}

/** Font files the caption renderer can use, relative to video/kit/ (assets/fonts/…). */
export function listFonts(pipelineRoot: string): string[] {
  const base = join(pipelineRoot, "video", "kit");
  const out: string[] = [];
  const walk = (rel: string, depth: number) => {
    let entries;
    try {
      entries = readdirSync(join(base, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory() && depth < 3) walk(child, depth + 1);
      else if (/\.(otf|ttf)$/i.test(e.name)) out.push(child);
    }
  };
  walk("assets/fonts", 0);
  return out.sort((a, b) => a.localeCompare(b));
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
