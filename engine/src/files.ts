import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { mkdir, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import type { Request, Response } from "express";
import { DATA_DIR, projectsRoot } from "./config.js";

/**
 * Disk access for the pickers: browse folders (project picker), list the videos
 * inside a project with probe data + a poster frame (video picker), and stream
 * a video for hover previews. Writes only in `createProject` and `trashProjectFolder`.
 */

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts", ".mxf"]);
/** Never worth walking into. */
const SKIP_DIRS = new Set(["node_modules", "__pycache__", ".git", ".work", "target", "dist"]);
/** Folders the pipeline writes to; their videos are renders, not footage. */
const GENERATED_DIRS = new Set(["edit", "exports"]);
const MAX_ENTRIES = 600;
const MAX_VIDEOS = 300;

export const isVideo = (path: string) => VIDEO_EXT.has(extname(path).toLowerCase());

/** `~` and relative paths → absolute. */
export function expandPath(raw: string): string {
  const p = raw.trim();
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return resolve(p);
}

/** Where the project browser opens when nothing is picked yet. */
export function defaultBrowseRoot(): string {
  const projects = projectsRoot();
  return existsSync(projects) ? projects : homedir();
}

export interface DirEntry {
  name: string;
  path: string;
  /** Has the project layout (input/, edit/ or briefing.md). */
  project: boolean;
  /** Videos directly inside it or its input/. */
  videos: number;
}

export interface DirListing {
  path: string;
  parent: string | null;
  home: string;
  entries: DirEntry[];
  truncated: boolean;
}

export async function listDir(raw?: string): Promise<DirListing> {
  const path = raw?.trim() ? expandPath(raw) : defaultBrowseRoot();
  const info = await stat(path);
  if (!info.isDirectory()) throw new FsError(400, `Não é uma pasta: ${path}`);

  const dirents = await readdir(path, { withFileTypes: true });
  const dirs: string[] = [];
  for (const d of dirents) {
    if (d.name.startsWith(".") || SKIP_DIRS.has(d.name)) continue;
    // Symlinked folders count as folders (a project can link its footage in).
    if (d.isDirectory() || (d.isSymbolicLink() && (await isDir(join(path, d.name))))) dirs.push(d.name);
  }
  dirs.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }));
  const shown = dirs.slice(0, MAX_ENTRIES);
  const entries = await Promise.all(
    shown.map(async (name): Promise<DirEntry> => {
      const full = join(path, name);
      const names = await safeReaddir(full);
      const project = names.includes("input") || names.includes("edit") || names.includes("briefing.md");
      const inputNames = names.includes("input") ? await safeReaddir(join(full, "input")) : [];
      const videos = [...names, ...inputNames].filter(isVideo).length;
      return { name, path: full, project, videos };
    }),
  );
  const parent = dirname(path);
  return {
    path,
    parent: parent === path ? null : parent,
    home: homedir(),
    entries,
    truncated: dirs.length > shown.length,
  };
}

/** Folder name part of a project: "Review do Grok 5!" → "review-do-grok-5". */
export function projectSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** Number the next project gets: one past the highest `NN-` prefix in the folder. */
export function nextProjectNumber(names: string[]): number {
  let max = 0;
  for (const name of names) {
    const n = /^(\d+)-/.exec(name)?.[1];
    if (n) max = Math.max(max, Number(n));
  }
  return max + 1;
}

export const projectFolderName = (n: number, slug: string) => `${String(n).padStart(2, "0")}-${slug}`;

export interface ProjectInfo {
  path: string;
  name: string;
}

/** Project folders in the projects root (numbered or with the project layout), newest number first. */
export async function listProjects(): Promise<{ root: string; nextNumber: number; projects: ProjectInfo[] }> {
  const root = projectsRoot();
  const listing = await listDir(root).catch(() => null);
  const entries = listing?.entries ?? [];
  const projects = entries
    .filter((e) => e.project || /^\d+-/.test(e.name))
    .map((e) => ({ path: e.path, name: e.name }))
    .sort((a, b) => b.name.localeCompare(a.name, "pt-BR", { numeric: true }));
  return { root, nextNumber: nextProjectNumber(entries.map((e) => e.name)), projects };
}

/**
 * New project `<projects root>/<NN>-<slug>` with the layout the pipeline expects
 * (input/, edit/, exports/, briefing.md). NN = next number in the root, so the folder
 * order is the creation order.
 */
export async function createProject(nameRaw: string): Promise<string> {
  const slug = projectSlug(nameRaw);
  if (!slug) throw new FsError(400, "Dê um nome ao projeto (letras ou números).");
  const root = projectsRoot();
  await mkdir(root, { recursive: true });
  const first = nextProjectNumber(await safeReaddir(root));
  for (let n = first; n < first + 50; n++) {
    const path = join(root, projectFolderName(n, slug));
    try {
      await mkdir(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") continue; // taken meanwhile: next number
      throw err;
    }
    for (const sub of ["input", "edit", "exports"]) await mkdir(join(path, sub), { recursive: true });
    await writeFile(join(path, "briefing.md"), "", { flag: "wx" }).catch(() => undefined);
    return path;
  }
  throw new FsError(409, "Não achei um número livre para o projeto.");
}

export interface VideoInfo {
  path: string;
  /** Relative to the project root ("input/IMG_8187.mov"). */
  rel: string;
  name: string;
  size: number;
  mtime: string;
  /** Lives under edit/ or exports/ (a render, not footage). */
  generated: boolean;
  duration: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
}

/** Videos under `root` (4 levels deep), newest first, with probe data. */
export async function listVideos(rootRaw: string): Promise<{ root: string; videos: VideoInfo[]; truncated: boolean }> {
  const root = expandPath(rootRaw);
  if (!(await isDir(root))) throw new FsError(404, `Pasta do projeto não encontrada: ${root}`);

  const found: { path: string; size: number; mtimeMs: number }[] = [];
  let truncated = false;
  async function walk(dir: string, depth: number): Promise<void> {
    if (found.length >= MAX_VIDEOS) {
      truncated = true;
      return;
    }
    const dirents = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const d of dirents) {
      if (d.name.startsWith(".")) continue;
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        if (depth < 4 && !SKIP_DIRS.has(d.name)) await walk(full, depth + 1);
      } else if ((d.isFile() || d.isSymbolicLink()) && isVideo(d.name)) {
        const info = await stat(full).catch(() => null); // follows links; broken ones drop out
        if (info?.isFile()) found.push({ path: full, size: info.size, mtimeMs: info.mtimeMs });
      }
    }
  }
  await walk(root, 0);
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const videos = await mapLimit(found.slice(0, MAX_VIDEOS), 4, async (f): Promise<VideoInfo> => {
    const rel = relative(root, f.path);
    const meta = await probe(f.path, f.size, f.mtimeMs);
    return {
      path: f.path,
      rel,
      name: basename(f.path),
      size: f.size,
      mtime: new Date(f.mtimeMs).toISOString(),
      generated: GENERATED_DIRS.has(rel.split(sep)[0] ?? ""),
      ...meta,
    };
  });
  return { root, videos, truncated };
}

type Probe = Pick<VideoInfo, "duration" | "width" | "height" | "codec">;
const probeCache = new Map<string, Probe>();

async function probe(path: string, size: number, mtimeMs: number): Promise<Probe> {
  const key = `${path}|${size}|${mtimeMs}`;
  const hit = probeCache.get(key);
  if (hit) return hit;
  const empty: Probe = { duration: null, width: null, height: null, codec: null };
  try {
    const out = await run("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,width,height:stream_side_data=rotation:format=duration",
      "-of", "json", path,
    ]);
    const json = JSON.parse(out) as {
      streams?: { codec_name?: string; width?: number; height?: number; side_data_list?: { rotation?: number }[] }[];
      format?: { duration?: string };
    };
    const s = json.streams?.[0];
    const rotated = Math.abs(s?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0) % 180 === 90;
    const result: Probe = {
      duration: json.format?.duration ? Number(json.format.duration) : null,
      width: (rotated ? s?.height : s?.width) ?? null,
      height: (rotated ? s?.width : s?.height) ?? null,
      codec: s?.codec_name ?? null,
    };
    probeCache.set(key, result);
    return result;
  } catch {
    return empty;
  }
}

const THUMB_DIR = join(DATA_DIR, "cache", "thumbs");
const thumbsInFlight = new Map<string, Promise<string>>();

/**
 * Poster frame (360 px wide), cached by path + size + mtime. PNG keeps the alpha
 * of overlay renders (ProRes 4444 canvases), which a JPEG would flatten to black.
 */
export async function thumbnail(raw: string): Promise<string> {
  const path = expandPath(raw);
  if (!isVideo(path)) throw new FsError(400, "Não é um vídeo");
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new FsError(404, "Vídeo não encontrado");
  const key = createHash("sha1").update(`${path}|${info.size}|${info.mtimeMs}`).digest("hex");
  const out = join(THUMB_DIR, `${key}.png`);
  if (existsSync(out)) return out;

  const pending = thumbsInFlight.get(out);
  if (pending) return pending;
  const job = (async () => {
    mkdirSync(THUMB_DIR, { recursive: true });
    const tmp = `${out}.${process.pid}.tmp.png`;
    const grab = (at: number) =>
      run("ffmpeg", ["-v", "error", "-y", "-ss", at.toFixed(3), "-i", path, "-frames:v", "1", "-vf", "scale=360:-2", tmp]);
    // Footage: 1 s in skips black first frames. Short clips (motion renders): the middle,
    // past the entrance animation.
    const { duration } = await probe(path, info.size, info.mtimeMs);
    const at = duration && duration < 4 ? duration / 2 : 1;
    await grab(at).catch(() => grab(0));
    if (!existsSync(tmp)) await grab(0);
    await rename(tmp, out);
    return out;
  })().finally(() => thumbsInFlight.delete(out));
  thumbsInFlight.set(out, job);
  return job;
}

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

/**
 * Send a file with single-range support. WebKit (Safari / Tauri on macOS)
 * refuses to play <video> without Range.
 */
export function sendFile(req: Request, res: Response, path: string, cache = "no-cache"): void {
  const size = statSync(path).size;
  res.setHeader("Content-Type", MIME[extname(path).toLowerCase()] ?? "application/octet-stream");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", cache);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(basename(path))}"`);

  const range = parseRange(req.headers.range, size);
  if (range === "invalid") {
    res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
    return;
  }
  if (range) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader("Content-Length", range.end - range.start + 1);
    createReadStream(path, range).pipe(res);
    return;
  }
  res.setHeader("Content-Length", size);
  createReadStream(path).pipe(res);
}

/** Single `bytes=start-end` range; null = no/unsupported header (send full file). */
function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | "invalid" {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;
  if (rawStart === "") {
    if (rawEnd === "") return null;
    start = Math.max(0, size - Number(rawEnd));
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

export class FsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function isDir(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isDirectory() ?? false;
}

async function safeReaddir(path: string): Promise<string[]> {
  return readdir(path).catch(() => []);
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((ok, fail) => {
    execFile(bin, args, { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) fail(new Error(`${bin}: ${stderr.trim() || err.message}`));
      else ok(stdout);
    });
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Send a project folder to the macOS Trash (restorable with "Put Back").
 * Refuses the obvious foot-guns and folders with files tracked by git (the in-repo
 * projects): those go through git, not the Trash.
 */
export async function trashProjectFolder(raw: string, protectedPaths: string[]): Promise<void> {
  const path = expandPath(raw);
  if (!(await isDir(path))) throw new FsError(404, `Pasta não encontrada: ${path}`);
  const home = homedir();
  const covers = (p: string) => p === path || p.startsWith(`${path}${sep}`);
  if (path === "/" || path === home || protectedPaths.some((p) => covers(resolve(p)))) {
    throw new FsError(400, "Essa pasta é protegida (contém o pipeline, os dados do engine ou é a pasta de projetos).");
  }
  const tracked = await run("git", ["-C", path, "ls-files", "--", "."]).catch(() => "");
  if (tracked.trim()) {
    const n = tracked.trim().split("\n").length;
    throw new FsError(409, `A pasta tem ${n} arquivo(s) versionado(s) no git. Remova pelo git, não pela Lixeira.`);
  }
  try {
    await run("trash", [path]);
  } catch {
    // Older macOS without /usr/bin/trash: plain move into ~/.Trash (no "Put Back").
    const target = join(home, ".Trash", `${basename(path)} ${new Date().toISOString().replace(/[:.]/g, "-")}`);
    await rename(path, target);
  }
  if (existsSync(path)) throw new FsError(500, `Não consegui mover ${path} para a Lixeira`);
}
