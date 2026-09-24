import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Read-only view of a project's edit timeline for the UI (no editing).
 *
 * Sources, first match wins:
 *   1. <project>/edit/compose.json or compose.resolved.json (newest)  what the
 *      headless compose.py rendered
 *   2. <project>/edit/cuts.json   provisional cuts (+ motion-v2/sfx-cues.json)
 * Times are seconds on the edited (record) timeline, which is what the export plays.
 */
export type TrackKind = "video" | "broll" | "title" | "caption" | "fx" | "voice" | "music" | "sfx";

export interface TimelineClip {
  start: number;
  end: number;
  label: string;
  /** Where the item lives in the source file, e.g. "cuts[4]" or "audio.sfx[3]". */
  ref?: string;
}

export interface TimelineTrack {
  id: string;
  /** "V1", "A2"… as in the NLE. */
  slot: string;
  name: string;
  kind: TrackKind;
  muted?: boolean;
  clips: TimelineClip[];
}

export interface TimelineMarker {
  at: number;
  label: string;
}

export interface Timeline {
  source: "compose" | "cuts.json";
  /** Source file relative to the project, e.g. "edit/compose.resolved.json". */
  sourcePath: string;
  fps: number;
  duration: number;
  tracks: TimelineTrack[];
  markers: TimelineMarker[];
}

type Json = Record<string, unknown>;

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const fileLabel = (file: unknown) => basename(str(file)).replace(/\.[^.]+$/, "") || "clip";

export function readTimeline(projectPath: string): Timeline | null {
  const spec = newest(projectPath, ["edit/compose.json", "edit/compose.resolved.json"]);
  if (spec) {
    const raw = readJson(join(projectPath, spec));
    if (raw && typeof raw === "object") return fromCompose(obj(raw), spec);
  }
  const cuts = readJson(join(projectPath, "edit", "cuts.json"));
  if (cuts && typeof cuts === "object") {
    return fromCuts(obj(cuts), readJson(join(projectPath, "edit", "motion-v2", "sfx-cues.json")));
  }
  return null;
}

/** Newest existing file among `rels` (relative to the project), by mtime. */
function newest(projectPath: string, rels: string[]): string | null {
  let best: { rel: string; mtime: number } | null = null;
  for (const rel of rels) {
    try {
      const mtime = statSync(join(projectPath, rel)).mtimeMs;
      if (!best || mtime > best.mtime) best = { rel, mtime };
    } catch {
      /* missing */
    }
  }
  return best?.rel ?? null;
}

/**
 * Spec that compose.py renders: palco per unit (base + canvas layers), full-length
 * caption overlays, screen FX (filmburn), voice/SFX/music. Frames at spec fps.
 */
function fromCompose(c: Json, sourcePath: string): Timeline {
  const fps = num(c.fps, 30);
  const s = (frames: number) => frames / fps;
  const units = arr(c.units).map(obj);
  const total = num(c.frames, num(units.at(-1)?.end));

  const palcos: TimelineClip[] = [];
  const canvas: TimelineClip[] = [];
  const voice: TimelineClip[] = [];
  units.forEach((u, i) => {
    const start = s(num(u.start));
    const end = s(num(u.end));
    const id = str(u.id, `u${i + 1}`);
    palcos.push({ start, end, label: `${id} · palco ${str(u.palco, "A")}`, ref: `units[${i}]` });
    voice.push({ start, end, label: id, ref: `units[${i}]` });
    arr(u.layers).forEach((layer, j) => {
      canvas.push({ start, end, label: fileLabel(layer), ref: `units[${i}].layers[${j}]` });
    });
  });
  const captions = arr(c.overlays)
    .map(obj)
    .map((ov, i) => ({ start: s(num(ov.at)), end: s(total), label: fileLabel(ov.file), ref: `overlays[${i}]` }));
  const fx = arr(c.fx)
    .map(obj)
    .map((f, i) => {
      const at = num(f.at);
      return { start: s(at), end: s(at + num(f.frames, 12)), label: fileLabel(f.file), ref: `fx[${i}]` };
    });
  const audio = obj(c.audio);
  const sfx = arr(audio.sfx)
    .map(obj)
    .map((fx, i) => {
      const at = num(fx.at);
      return {
        start: s(at),
        end: s(at + 12),
        label: fileLabel(fx.file).replace(/_prep$/, ""),
        ref: `audio.sfx[${i}]`,
      };
    });
  const music = obj(audio.music);
  const musicClips = music.file ? [{ start: 0, end: s(total), label: fileLabel(music.file), ref: "audio.music" }] : [];
  // Camera moves (punch / zoom) compose.py applied over the a-roll, from the camera preset.
  const MOVE_LABEL: Record<string, string> = { punch: "punch", zoomIn: "zoom in", zoom_in: "zoom in", zoomOut: "zoom out", zoom_out: "zoom out" };
  const camera = arr(c.camera)
    .map(obj)
    .filter((m) => str(m.move) && str(m.move) !== "none")
    .map((m, i) => ({
      start: s(num(m.startFrame, num(m.start))),
      end: s(num(m.endFrame, num(m.end))),
      label: MOVE_LABEL[str(m.move)] ?? str(m.move),
      ref: `camera[${i}]`,
    }));

  const tracks: TimelineTrack[] = [
    { id: "V5", slot: "V5", name: "CÂMERA", kind: "fx" as const, clips: camera },
    { id: "V4", slot: "V4", name: "FX", kind: "fx" as const, clips: fx },
    { id: "V3", slot: "V3", name: "LEGENDAS", kind: "caption" as const, clips: captions },
    { id: "V2", slot: "V2", name: "CANVAS", kind: "title" as const, clips: canvas },
    { id: "V1", slot: "V1", name: "PALCOS", kind: "video" as const, clips: palcos },
    { id: "A1", slot: "A1", name: "VOZ", kind: "voice" as const, clips: voice },
    { id: "A2", slot: "A2", name: "SFX", kind: "sfx" as const, clips: sfx.sort((x, y) => x.start - y.start) },
    { id: "A3", slot: "A3", name: "MÚSICA", kind: "music" as const, clips: musicClips },
  ].filter((t) => t.clips.some((clip) => clip.end > clip.start));
  return { source: "compose", sourcePath, fps, duration: s(total), tracks, markers: [] };
}

function fromCuts(c: Json, cuesRaw: unknown): Timeline {
  const fps = num(c.fps, 30);
  const s = (frames: number) => frames / fps;
  const video: TimelineClip[] = [];
  const captions: TimelineClip[] = [];
  const startOf = new Map<string, number>();
  let cursor = 0;
  arr(c.cuts)
    .map(obj)
    .forEach((cut, i) => {
      const [a, z] = arr(cut.src).map((v) => num(v));
      // `src` is already the tight range (drop_head_f/drop_tail_f are applied to src_asr), as trim.py cuts it.
      const len = Math.max(0, z - a);
      if (!len) return;
      const ref = `cuts[${i}]`;
      startOf.set(str(cut.id), cursor);
      video.push({ start: s(cursor), end: s(cursor + len), label: str(cut.id, `Clip ${video.length + 1}`), ref });
      if (cut.texto) captions.push({ start: s(cursor), end: s(cursor + len), label: str(cut.texto), ref });
      cursor += len;
    });
  const sfx: TimelineClip[] = [];
  arr(cuesRaw)
    .map(obj)
    .forEach((cue, i) => {
      const base = startOf.get(str(cue.uid));
      if (base === undefined) return;
      const at = base + num(cue.t_local_f);
      sfx.push({ start: s(at), end: s(at + 12), label: str(cue.kind, "sfx"), ref: `motion-v2/sfx-cues.json[${i}]` });
    });
  const tracks: TimelineTrack[] = [
    { id: "V2", slot: "V2", name: "LEGENDAS", kind: "caption" as const, clips: captions },
    { id: "V1", slot: "V1", name: "A-ROLL", kind: "video" as const, clips: video },
    { id: "A1", slot: "A1", name: "VOZ", kind: "voice" as const, clips: video.map((v) => ({ ...v })) },
    { id: "A2", slot: "A2", name: "SFX", kind: "sfx" as const, clips: sfx.sort((x, y) => x.start - y.start) },
  ].filter((t) => t.clips.length);
  return { source: "cuts.json", sourcePath: "edit/cuts.json", fps, duration: s(cursor), tracks, markers: [] };
}
