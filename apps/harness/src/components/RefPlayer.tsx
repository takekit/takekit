import { useRef, useState } from "react";
import { Flag, Play, Scissors, X } from "lucide-react";
import { MODULE_LABEL, thumbUrl, videoFileUrl, type ModuleKey, type RefSegment } from "../api/client";
import { basename } from "../lib/format";

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** A moment in the video worth jumping to (what the agent saw, or a marked stretch). */
export interface RefMark {
  at: number;
  end?: number;
  label: string;
  note?: string;
}

/**
 * An example video you can watch, scrub and point at. With `onSegments`, "Marcar trecho"
 * records the stretch that shows the style ("a legenda daqui"). `marks` are moments to jump
 * to: clicking one seeks and plays from there.
 */
export function RefPlayer({
  path,
  segments,
  onSegments,
  marks = [],
  onRemove,
}: {
  path: string;
  segments?: RefSegment[];
  onSegments?: (segments: RefSegment[]) => void;
  marks?: RefMark[];
  onRemove?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const mine = segments?.filter((s) => s.path === path) ?? [];
  const others = segments?.filter((s) => s.path !== path) ?? [];

  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = t;
    void v.play().catch(() => undefined);
  };

  const mark = () => {
    const now = video.current?.currentTime ?? 0;
    if (pendingStart === null) {
      setPendingStart(now);
      return;
    }
    const [start, end] = now > pendingStart ? [pendingStart, now] : [now, pendingStart];
    setPendingStart(null);
    if (end - start < 0.3) return;
    onSegments?.([...others, ...mine, { path, start, end, note: "" }]);
  };

  const setNote = (i: number, note: string) =>
    onSegments?.([...others, ...mine.map((s, k) => (k === i ? { ...s, note } : s))]);
  const drop = (i: number) => onSegments?.([...others, ...mine.filter((_, k) => k !== i)]);

  return (
    <div className="ref-player">
      <div className="ref-video">
        <video
          ref={video}
          src={videoFileUrl(path)}
          poster={thumbUrl(path)}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        />
        {onRemove ? (
          <button type="button" className="ref-remove" aria-label={`Remover ${basename(path)}`} onClick={onRemove}>
            <X size={12} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      <span className="ref-name" title={path}>
        {basename(path)}
      </span>

      {duration > 0 && (mine.length || marks.length) ? (
        <span className="ref-track" aria-hidden="true">
          {mine.map((s, i) => (
            <i key={`s${i}`} className="is-segment" style={{ left: `${(s.start / duration) * 100}%`, width: `${((s.end - s.start) / duration) * 100}%` }} />
          ))}
          {marks.map((m, i) => (
            <i key={`m${i}`} className="is-mark" style={{ left: `${(m.at / duration) * 100}%` }} />
          ))}
        </span>
      ) : null}

      {onSegments ? (
        <button type="button" className={`btn btn-small ref-mark${pendingStart !== null ? " is-marking" : ""}`} onClick={mark}>
          <Scissors size={12} strokeWidth={2} />
          {pendingStart === null ? "Marcar trecho" : `Fim do trecho (desde ${clock(pendingStart)})`}
        </button>
      ) : null}

      {onSegments && mine.length ? (
        <ul className="ref-segments">
          {mine.map((s, i) => (
            <li key={`${s.start}-${i}`}>
              <button type="button" className="ref-chip" onClick={() => seek(s.start)} title="Ver o trecho">
                <Play size={10} strokeWidth={2.5} />
                {clock(s.start)}–{clock(s.end)}
              </button>
              <input
                className="input ref-note"
                value={s.note}
                placeholder="O que tem aqui? (ex.: a legenda)"
                onChange={(e) => setNote(i, e.target.value)}
              />
              <button type="button" className="chip-clear" aria-label="Remover trecho" onClick={() => drop(i)}>
                <X size={12} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {marks.length ? (
        <ul className="ref-marks">
          {marks.map((m, i) => (
            <li key={`${m.at}-${i}`}>
              <button type="button" className="ref-chip" onClick={() => seek(m.at)} title={m.note}>
                <Flag size={10} strokeWidth={2.25} />
                <strong>{m.label}</strong> {clock(m.at)}
              </button>
              {m.note ? <span className="ref-mark-note">{m.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Evidence module key → label for the chips ("Legenda", "Palcos"…). */
export function markLabel(module: string): string {
  return (MODULE_LABEL as Record<string, string>)[module as ModuleKey] ?? "Nota";
}
