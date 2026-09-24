import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { DATA_DIR, getConfig } from "./config.js";
import type { Preset } from "./styles.js";

const run = promisify(execFile);
const CACHE = join(DATA_DIR, "cache", "sound");
const SECONDS = 7;
/** Where the demo's effects land, like motion hits under a sentence. */
const HITS: Array<{ kind: string; at: number }> = [
  { kind: "whoosh", at: 1.1 },
  { kind: "click", at: 2.9 },
  { kind: "reveal", at: 4.7 },
];

/**
 * "Ouvir" of a sound preset: a few seconds of your own voice (recent footage) with the
 * preset's effects and music bed mixed the way compose.py does (bed gain, ducking under the
 * voice), so the choice is heard, not read. Cached by preset content + footage.
 */
export async function soundPreview(preset: Preset, footage: string | null): Promise<string> {
  const voice = footage && existsSync(footage) ? footage : null;
  const key = createHash("sha1")
    .update(JSON.stringify([preset, voice, voice ? statSync(voice).mtimeMs : 0]))
    .digest("hex");
  const out = join(CACHE, `${key}.m4a`);
  if (existsSync(out)) return out;
  mkdirSync(CACHE, { recursive: true });

  const args: string[] = ["-v", "error", "-y"];
  const filters: string[] = [];
  const mix: string[] = [];
  let n = 0;
  const st = "aformat=sample_rates=48000:channel_layouts=stereo";

  if (voice) {
    args.push("-ss", "2", "-t", String(SECONDS), "-i", voice);
    filters.push(`[${n}:a]${st},asetpts=PTS-STARTPTS[voice]`);
    n++;
  } else {
    args.push("-f", "lavfi", "-t", String(SECONDS), "-i", "anullsrc=r=48000:cl=stereo");
    filters.push(`[${n}:a]${st}[voice]`);
    n++;
  }

  const music = preset.music as { file?: string; gainDb?: number; duck?: boolean } | null | undefined;
  const musicFile = music?.file ? asset(music.file) : null;
  filters.push(musicFile && music?.duck !== false ? "[voice]asplit=2[vmix][vsc]" : "[voice]anull[vmix]");
  mix.push("[vmix]");

  if (preset.sfx !== false) {
    const kinds = (preset.kindToCatalogId ?? {}) as Record<string, string>;
    for (const hit of HITS) {
      const file = catalogFile(kinds[hit.kind]);
      if (!file) continue;
      args.push("-i", file);
      const ms = Math.round(hit.at * 1000);
      filters.push(`[${n}:a]${st},volume=-6dB,adelay=${ms}:all=1[h${n}]`);
      mix.push(`[h${n}]`);
      n++;
    }
  }

  if (musicFile) {
    args.push("-stream_loop", "-1", "-t", String(SECONDS), "-i", musicFile);
    const gain = typeof music?.gainDb === "number" ? music.gainDb : -25;
    filters.push(`[${n}:a]${st},asetpts=PTS-STARTPTS,volume=${gain}dB[bed]`);
    if (music?.duck !== false) {
      filters.push("[bed][vsc]sidechaincompress=threshold=0.03:ratio=4:attack=15:release=250[bedd]");
      mix.push("[bedd]");
    } else mix.push("[bed]");
    n++;
  }

  const fade = SECONDS - 0.6;
  filters.push(
    `${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=first,` +
      `loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.15,afade=t=out:st=${fade}:d=0.6,atrim=end=${SECONDS}[out]`,
  );
  const tmp = `${out}.${process.pid}.tmp.m4a`;
  await run("ffmpeg", [...args, "-filter_complex", filters.join(";"), "-map", "[out]", "-c:a", "aac", "-b:a", "128k", tmp]);
  renameSync(tmp, out);
  return out;
}

/** Asset paths in presets are relative to video/resolve/ ("assets/music/…"), else $TAKEKIT_ASSETS. */
function asset(rel: string): string | null {
  const inner = rel.replace(/^assets\//, "");
  const roots = [join(getConfig().pipelineRoot, "video", "resolve", "assets")];
  if (process.env.TAKEKIT_ASSETS) roots.push(process.env.TAKEKIT_ASSETS);
  for (const root of roots) {
    const p = join(root, inner);
    if (existsSync(p)) return p;
  }
  return null;
}

let catalog: Map<string, string> | null = null;

/** SFX catalog id → wav (assets/sfx/catalog.json). */
function catalogFile(id: string | undefined): string | null {
  if (!id) return null;
  if (!catalog) {
    catalog = new Map();
    try {
      const path = join(getConfig().pipelineRoot, "video", "resolve", "assets", "sfx", "catalog.json");
      const items = (JSON.parse(readFileSync(path, "utf8")) as { items?: Array<{ id: string; file: string }> }).items ?? [];
      for (const item of items) catalog.set(item.id, item.file);
    } catch {
      /* no catalog: the demo plays without effects */
    }
  }
  const file = catalog.get(id);
  return file ? asset(file) : null;
}
