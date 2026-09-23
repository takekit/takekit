import type { Timeline, TimelineTrack } from "../api/client";
import { timecode } from "./format";

/** A clip or time range picked on the timeline, with what to change there. */
export interface TimelineAnnotation {
  id: string;
  kind: "clip" | "range";
  start: number;
  end: number;
  fps: number;
  sourcePath: string | null;
  note: string;
  /** kind === "clip" */
  track?: Pick<TimelineTrack, "id" | "slot" | "name" | "kind">;
  clip?: { index: number; label: string; ref?: string };
  /** kind === "range": what sits inside it, per track. */
  overlaps?: Array<{ slot: string; name: string; label: string; ref?: string }>;
}

export type AnnotationDraft =
  | { kind: "clip"; trackId: string; index: number }
  | { kind: "range"; start: number; end: number };

const MAX_OVERLAPS = 40;

export function buildAnnotation(
  draft: AnnotationDraft,
  timeline: Timeline | null,
  fps: number,
  note: string,
): TimelineAnnotation | null {
  const base = { id: crypto.randomUUID(), fps, sourcePath: timeline?.sourcePath ?? null, note: note.trim() };
  if (draft.kind === "clip") {
    const track = timeline?.tracks.find((t) => t.id === draft.trackId);
    const clip = track?.clips[draft.index];
    if (!track || !clip) return null;
    return {
      ...base,
      kind: "clip",
      start: clip.start,
      end: clip.end,
      track: { id: track.id, slot: track.slot, name: track.name, kind: track.kind },
      clip: { index: draft.index, label: clip.label, ref: clip.ref },
    };
  }
  const overlaps = (timeline?.tracks ?? [])
    .flatMap((t) =>
      t.clips
        .filter((c) => c.start < draft.end && c.end > draft.start)
        .map((c) => ({ slot: t.slot, name: t.name, label: c.label, ref: c.ref })),
    )
    .slice(0, MAX_OVERLAPS);
  return { ...base, kind: "range", start: draft.start, end: draft.end, overlaps };
}

const secs = (t: number) => `${t.toFixed(3)}s`;

/** One-line human summary (composer chip, card header). */
export function annotationSummary(a: TimelineAnnotation): string {
  const span = `${timecode(a.start, a.fps)} → ${timecode(a.end, a.fps)}`;
  return a.kind === "clip" && a.track && a.clip
    ? `${a.track.slot} ${a.track.name} · ${a.clip.label} · ${span}`
    : `Intervalo · ${span}`;
}

/**
 * Plain-text block appended to the chat message. The agent reads it (see
 * composeAgentPrompt in the engine); the chat UI parses it back into chips.
 */
export function serializeAnnotations(list: TimelineAnnotation[]): string {
  if (!list.length) return "";
  const first = list[0];
  const attrs = [first.sourcePath ? `fonte="${first.sourcePath}"` : "", `fps="${first.fps}"`].filter(Boolean).join(" ");
  const lines = list.flatMap((a, i) => {
    const span = `${timecode(a.start, a.fps)} → ${timecode(a.end, a.fps)} (${secs(a.start)} → ${secs(a.end)})`;
    const head =
      a.kind === "clip" && a.track && a.clip
        ? `[${i + 1}] clip · ${a.track.slot} ${a.track.name} · "${a.clip.label}" · ${span}${a.clip.ref ? ` · ref ${a.clip.ref}` : ""}`
        : `[${i + 1}] intervalo · ${span}`;
    const out = [head];
    if (a.kind === "range" && a.overlaps?.length) {
      const byTrack = new Map<string, string[]>();
      for (const o of a.overlaps) {
        const key = `${o.slot} ${o.name}`;
        byTrack.set(key, [...(byTrack.get(key) ?? []), `"${o.label}"${o.ref ? ` [${o.ref}]` : ""}`]);
      }
      out.push(`    faixas: ${[...byTrack].map(([k, v]) => `${k} ${v.join(", ")}`).join("; ")}`);
    }
    out.push(`    nota: ${a.note || "(sem nota: revise este trecho)"}`);
    return out;
  });
  return [`<timeline-context ${attrs}>`, ...lines, "</timeline-context>"].join("\n");
}

export interface ParsedAnnotation {
  n: number;
  kind: "clip" | "intervalo";
  summary: string;
  note: string;
}

const BLOCK = /\n*<timeline-context[^>]*>([\s\S]*?)<\/timeline-context>\s*$/;

/** Split a sent message back into the typed text and its timeline annotations. */
export function parseAnnotatedMessage(content: string): { text: string; items: ParsedAnnotation[] } {
  const match = BLOCK.exec(content);
  if (!match) return { text: content, items: [] };
  const items: ParsedAnnotation[] = [];
  for (const line of match[1].split("\n")) {
    const head = /^\[(\d+)\] (clip|intervalo) · (.+)$/.exec(line);
    if (head) {
      const kind = head[2] as ParsedAnnotation["kind"];
      const span = head[3].replace(/ \([\d.s →]+\)/, "").replace(/ · ref .+$/, "");
      const summary = kind === "intervalo" ? `Intervalo · ${span}` : span.replace(/"/g, "");
      items.push({ n: Number(head[1]), kind, summary, note: "" });
      continue;
    }
    const note = /^\s+nota: (.*)$/.exec(line);
    if (note && items.length) items[items.length - 1].note = note[1];
  }
  return { text: content.slice(0, match.index).trim(), items };
}
