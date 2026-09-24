import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { stylesDir, writeJsonAtomic } from "./config.js";
import { expandPath, isVideo, projectSlug } from "./files.js";
import {
  effectiveSelection,
  getStyle,
  loadPackage,
  resolveModules,
  type ModuleSelection,
  type ResolvedModules,
  type StyleKit,
} from "./styles.js";

const run = promisify(execFile);

/**
 * New styles from reference videos (docs/style-kit/SPEC-EXPANSION.md):
 * creator uploads videos → agent decomposes → proposes a package → creator reviews → saves.
 *
 * A draft is a package folder under styles/_drafts/<id>/ (gitignored, out of the gallery),
 * edited by the agent in a thread of kind "style". Publishing validates it and moves it to
 * styles/<id>/, where it shows up in the gallery and in the new-thread picker.
 */

export function draftsDir(): string {
  return join(stylesDir(), "_drafts");
}

export class DraftError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface StyleDraft {
  id: string;
  dir: string;
  /** The package as the gallery will load it (null until meta.json is readable). */
  style: StyleKit | null;
  /** Presets the proposal picked, resolved (library or the draft's own presets/). */
  modules: ResolvedModules | null;
  /** Package files present, relative to the draft folder. */
  files: string[];
  /** What still blocks saving to the gallery. */
  problems: string[];
  references: string[];
  /** Stretches of the references the creator marked before the agent started. */
  segments: RefSegment[];
  /** Where the agent saw each decision in the references (review/evidencias.json), to jump to. */
  evidence: Evidence[];
}

/** A stretch of a reference video the creator marked ("a legenda daqui"). */
export interface RefSegment {
  path: string;
  start: number;
  end: number;
  note: string;
}

export interface Evidence {
  /** Reference video (absolute path). */
  path: string;
  /** Seconds into it. */
  at: number;
  end?: number;
  /** caption | stage | cuts | soundEffects | transitions | outro */
  module: string;
  note: string;
}

/**
 * The simple way to a new style: start from one in the gallery, swap presets, name it.
 * Copies the package (brief, storyboard, preview) under a new id with the picked presets;
 * no agent involved. The brief gets a note that the presets win over its old wording.
 */
export function duplicateStyle(sourceId: string, input: { name: string; modules?: ModuleSelection | null }): StyleKit {
  const source = getStyle(sourceId);
  if (!source) throw new DraftError(404, "Estilo não encontrado");
  const name = input.name.trim();
  if (!name) throw new DraftError(400, "Dê um nome ao estilo.");
  const id = freeId(name);
  const selection = effectiveSelection(source, input.modules ?? null);
  const { missing } = resolveModules(source, selection);
  if (missing.length) throw new DraftError(400, `Preset não encontrado: ${missing.join(", ")}`);
  const dir = join(stylesDir(), id);
  cpSync(source.dir, dir, { recursive: true });
  rmSync(join(dir, ORIGINAL), { force: true });   // the copy starts unedited
  const now = new Date().toISOString();
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Record<string, unknown>;
  writeJsonAtomic(join(dir, "meta.json"), {
    ...meta,
    id,
    name,
    aliases: [],
    derivedFrom: { kind: "style", styleId: source.id, styleName: source.name, createdAt: now },
    createdAt: now,
    updatedAt: now,
  });
  writeJsonAtomic(join(dir, "modules.json"), {
    _doc: `Presets de ${name}, a partir de ${source.name}. Ids de styles/_presets/<módulo>/ ou de presets/<módulo>/ deste pacote.`,
    ...selection,
  });
  if (source.promptMarkdown) {
    writeFileSync(
      join(dir, "prompt.md"),
      `# ${name}\n\nBaseado em **${source.name}**. Os presets deste estilo (modules.json: legenda, palcos, cortes, ` +
        `SFX, transições) valem sobre o que o texto abaixo disser deles.\n\n${source.promptMarkdown}\n`,
      "utf8",
    );
  }
  const style = getStyle(id);
  if (!style) throw new DraftError(500, "O pacote foi copiado mas a galeria não o leu.");
  return style;
}

/** First edit of a gallery style: its name and modules.json as they were ("Restaurar o original"). */
const ORIGINAL = "original.json";

/**
 * Edit a gallery style in place ({ name?, modules? }): threads that use it (without their own
 * swaps) pick the new presets up on their next preview. The first edit keeps original.json.
 */
export function updateStyle(styleId: string, input: { name?: string; modules?: ModuleSelection | null }): StyleKit {
  const style = getStyle(styleId);
  if (!style) throw new DraftError(404, "Estilo não encontrado");
  const name = input.name === undefined ? style.name : input.name.trim();
  if (!name) throw new DraftError(400, "Dê um nome ao estilo.");
  const selection = effectiveSelection(style, input.modules ?? null);
  const { missing } = resolveModules(style, selection);
  if (missing.length) throw new DraftError(400, `Preset não encontrado: ${missing.join(", ")}`);

  const original = join(style.dir, ORIGINAL);
  if (!existsSync(original)) {
    writeJsonAtomic(original, {
      _doc: "Como o estilo era antes da primeira edição no Takekit. \"Restaurar o original\" volta a isto.",
      name: style.name,
      modules: readJsonFile(join(style.dir, "modules.json")),
      savedAt: new Date().toISOString(),
    });
  }
  const current = (readJsonFile(join(style.dir, "modules.json")) ?? {}) as Record<string, unknown>;
  writeJsonAtomic(join(style.dir, "modules.json"), {
    ...(typeof current._doc === "string" ? { _doc: current._doc } : {}),
    ...selection,
  });
  touchMeta(style.dir, { name });
  return getStyle(style.id)!;
}

/** Undo every edit: modules.json and the name back to original.json. */
export function restoreStyle(styleId: string): StyleKit {
  const style = getStyle(styleId);
  if (!style) throw new DraftError(404, "Estilo não encontrado");
  const path = join(style.dir, ORIGINAL);
  const original = readJsonFile(path) as { name?: string; modules?: unknown } | null;
  if (!original) throw new DraftError(409, "Este estilo não foi editado.");
  if (original.modules && typeof original.modules === "object") writeJsonAtomic(join(style.dir, "modules.json"), original.modules);
  else rmSync(join(style.dir, "modules.json"), { force: true });
  touchMeta(style.dir, { name: typeof original.name === "string" ? original.name : style.name });
  rmSync(path, { force: true });
  return getStyle(style.id)!;
}

function touchMeta(dir: string, patch: { name: string }): void {
  const meta = (readJsonFile(join(dir, "meta.json")) ?? {}) as Record<string, unknown>;
  writeJsonAtomic(join(dir, "meta.json"), { ...meta, name: patch.name, updatedAt: new Date().toISOString() });
}

function readJsonFile(path: string): object | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as object;
  } catch {
    return null;
  }
}

/** Id from the name, unused by the gallery and the drafts. */
function freeId(name: string): string {
  const base = projectSlug(name) || "estilo";
  let id = base;
  for (let n = 2; getStyle(id) || existsSync(join(draftsDir(), id)) || existsSync(join(stylesDir(), id)); n++) id = `${base}-${n}`;
  return id;
}

/** New draft folder + meta.json with the references in derivedFrom. */
export function createStyleDraft(input: { name: string; references: string[]; segments?: RefSegment[] }): { id: string; dir: string } {
  const name = input.name.trim();
  if (!name) throw new DraftError(400, "Dê um nome ao estilo.");
  const references = [...new Set(input.references.map((p) => expandPath(p.trim())).filter(Boolean))];
  if (!references.length) throw new DraftError(400, "Escolha pelo menos um vídeo de referência.");
  for (const path of references) {
    if (!isVideo(path) || !existsSync(path)) throw new DraftError(400, `Vídeo não encontrado: ${path}`);
  }
  const id = freeId(name);
  const dir = join(draftsDir(), id);
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  writeJsonAtomic(join(dir, "meta.json"), {
    id,
    name,
    aliases: [],
    previewVideoPath: null,
    derivedFrom: {
      kind: "references",
      references,
      segments: (input.segments ?? []).filter((seg) => references.includes(expandPath(seg.path))),
      createdAt: now,
    },
    createdAt: now,
    updatedAt: now,
  });
  return { id, dir };
}

export function getStyleDraft(id: string): StyleDraft {
  const dir = draftDir(id);
  const style = loadPackage(dir, id);
  const files = listFiles(dir);
  const problems: string[] = [];
  let modules: ResolvedModules | null = null;
  if (!style) problems.push("meta.json ausente ou inválido.");
  else {
    if (!style.promptMarkdown) problems.push("Falta o briefing do agente (prompt.md).");
    if (!style.storyboard) problems.push("Falta a descrição do estilo (storyboard.md).");
    if (!style.modules) problems.push("Falta a escolha de presets (modules.json).");
    else {
      const resolved = resolveModules(style, effectiveSelection(style, null));
      modules = resolved.modules;
      for (const m of resolved.missing) problems.push(`Preset não encontrado: ${m}`);
      if (!modules.caption) problems.push("modules.json sem preset de legenda.");
      if (!modules.stage?.length) problems.push("modules.json sem palcos.");
    }
    if (getStyle(id)) problems.push(`Já existe um estilo ${id} na galeria.`);
  }
  const derived = style?.derivedFrom as { references?: unknown; segments?: unknown } | null | undefined;
  const references = Array.isArray(derived?.references)
    ? derived.references.filter((p): p is string => typeof p === "string")
    : [];
  const segments = Array.isArray(derived?.segments) ? (derived.segments as RefSegment[]) : [];
  return { id, dir, style, modules, files, problems, references, segments, evidence: readEvidence(dir, references) };
}

/**
 * review/evidencias.json written by the agent: [{ ref: 1 | "<path>", at: 12.4, module, note }].
 * `ref` is the 1-based number of the reference in the prompt (or its path).
 */
function readEvidence(dir: string, references: string[]): Evidence[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(dir, "review", "evidencias.json"), "utf8"));
  } catch {
    return [];
  }
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
  const out: Evidence[] = [];
  for (const item of list as Array<Record<string, unknown>>) {
    const ref = item.ref;
    const path =
      typeof ref === "number" ? references[ref - 1] : typeof ref === "string" ? (references.find((p) => p === ref || p.endsWith(ref)) ?? null) : references[0];
    const at = Number(item.at);
    if (!path || !Number.isFinite(at)) continue;
    const end = Number(item.end);
    out.push({
      path,
      at,
      ...(Number.isFinite(end) && end > at ? { end } : {}),
      module: typeof item.module === "string" ? item.module : "outro",
      note: typeof item.note === "string" ? item.note : "",
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.at - b.at);
}

/** Validate, make the preview loop if the agent didn't, move into the gallery. */
export async function publishStyleDraft(id: string): Promise<StyleKit> {
  const draft = getStyleDraft(id);
  if (draft.problems.length) throw new DraftError(409, draft.problems.join(" "));
  const meta = JSON.parse(readFileSync(join(draft.dir, "meta.json"), "utf8")) as Record<string, unknown>;
  if (!draft.style?.previewVideoPath && draft.references[0]) {
    await makePreviewLoop(draft.references[0], join(draft.dir, "preview.mp4"));
    meta.previewVideoPath = "preview.mp4";
  }
  const now = new Date().toISOString();
  writeJsonAtomic(join(draft.dir, "meta.json"), { ...meta, id, updatedAt: now });
  const target = join(stylesDir(), id);
  if (existsSync(target)) throw new DraftError(409, `Já existe styles/${id}/.`);
  renameSync(draft.dir, target);
  const style = getStyle(id);
  if (!style) throw new DraftError(500, "O pacote foi movido mas a galeria não o leu.");
  return style;
}

/** 9 s portrait loop from a reference (muted), like the gallery's other previews. */
async function makePreviewLoop(source: string, out: string): Promise<void> {
  await run("ffmpeg", [
    "-v", "error", "-y", "-ss", "0", "-t", "9", "-i", source,
    "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1",
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", out,
  ]);
}

function draftDir(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new DraftError(400, "id inválido");
  const dir = join(draftsDir(), id);
  if (!existsSync(join(dir, "meta.json"))) throw new DraftError(404, "Rascunho de estilo não encontrado");
  return dir;
}

function listFiles(dir: string, prefix = ""): string[] {
  let entries;
  try {
    entries = readdirSync(join(dir, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, rel));
    else if (statSync(join(dir, rel)).isFile()) out.push(rel);
  }
  return out.sort();
}
