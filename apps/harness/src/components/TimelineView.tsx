import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { MessageSquarePlus, SquareDashedMousePointer, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Timeline, TimelineTrack } from "../api/client";
import {
  annotationSummary,
  buildAnnotation,
  type AnnotationDraft,
  type TimelineAnnotation,
} from "../lib/annotations";
import { clockLabel, timecode } from "../lib/format";
import { useFilmstrip, useWaveform } from "../lib/media";

interface Props {
  timeline: Timeline | null;
  /** Export being previewed; drives the program filmstrip, the mix waveform and the playhead. */
  src: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Export duration from the player (0 until metadata loads). */
  duration: number;
  fps: number;
  /** Annotations already attached to the composer (drawn as numbered marks). */
  annotations: TimelineAnnotation[];
  /** Omit to disable picking (no thread / engine offline). */
  onAnnotate?: (annotation: TimelineAnnotation) => void;
}

type Gesture =
  | { mode: "seek" }
  | {
      mode: "select";
      startX: number;
      startT: number;
      clip: { trackId: string; index: number } | null;
      moved: boolean;
      /** Kept here, not only in state: pointerup can fire before React re-renders. */
      range: { start: number; end: number } | null;
    };

const ZOOM_MIN = 1;
const ZOOM_MAX = 16;
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

/** `key` re-attaches the observer when the element mounts later. */
function useWidth(ref: RefObject<HTMLElement | null>, key: unknown): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, key]);
  return width;
}

function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * Read-only NLE view: program filmstrip, the edit's video/audio tracks, the
 * export's mix waveform. Click or drag to move the playhead. With the picker
 * on (or Shift + drag), click a clip or drag a range to annotate it for the agent.
 */
export function TimelineView({ timeline, src, videoRef, duration, fps, annotations, onAnnotate }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const [liveRange, setLiveRange] = useState<{ start: number; end: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const total = Math.max(duration || 0, timeline?.duration ?? 0) || 1;

  const hasRows = Boolean(src) || Boolean(timeline?.tracks.length);
  const viewWidth = useWidth(scrollRef, hasRows);
  const laneWidth = viewWidth * zoom;
  const thumbCount = Math.min(48, Math.max(4, Math.round(laneWidth / 36 / 4) * 4));
  // Resizing the panel changes the count every frame; only re-grab once it settles.
  const settledCount = useSettled(thumbCount, 400);
  const frames = useFilmstrip(src, src ? settledCount : 0);
  const wave = useWaveform(src);

  const { videoTracks, audioTracks } = useMemo(() => {
    const tracks = timeline?.tracks ?? [];
    return {
      videoTracks: tracks.filter((t) => t.slot.startsWith("V")),
      audioTracks: tracks.filter((t) => !t.slot.startsWith("V")),
    };
  }, [timeline]);

  const ticks = useMemo(() => {
    const pxPerSec = laneWidth / total;
    const step = TICK_STEPS.find((s) => s * pxPerSec >= 64) ?? TICK_STEPS[TICK_STEPS.length - 1];
    const minor = step >= 5 ? step / 5 : step / 2;
    const out: Array<{ at: number; major: boolean }> = [];
    for (let t = 0; t <= total + 1e-6; t += minor) {
      out.push({ at: t, major: Math.abs(t / step - Math.round(t / step)) < 1e-6 });
    }
    return out;
  }, [laneWidth, total]);

  // Playhead follows the player without re-rendering React on every frame.
  useEffect(() => {
    const v = videoRef.current;
    const head = playheadRef.current;
    if (!v || !head || !src) return;
    let raf = 0;
    const place = () => {
      const pct = Math.min(1, v.currentTime / total);
      head.style.left = `${pct * 100}%`;
      const scroll = scrollRef.current;
      if (scroll && !v.paused && scroll.scrollWidth > scroll.clientWidth) {
        const x = pct * scroll.scrollWidth;
        if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 24) {
          scroll.scrollLeft = x - scroll.clientWidth * 0.2;
        }
      }
    };
    const loop = () => {
      place();
      raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const onStop = () => {
      cancelAnimationFrame(raf);
      place();
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onStop);
    v.addEventListener("ended", onStop);
    v.addEventListener("seeked", place);
    v.addEventListener("timeupdate", place);
    v.addEventListener("loadedmetadata", place);
    place();
    if (!v.paused) onPlay();
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("ended", onStop);
      v.removeEventListener("seeked", place);
      v.removeEventListener("timeupdate", place);
      v.removeEventListener("loadedmetadata", place);
    };
  }, [videoRef, src, total]);

  function timeAt(clientX: number): number {
    const lanes = lanesRef.current;
    if (!lanes) return 0;
    const rect = lanes.getBoundingClientRect();
    const t = ((clientX - rect.left) / rect.width) * total;
    // Snap to whole frames: the agent edits in frames.
    return Math.min(Math.max(Math.round(t * fps) / fps, 0), total);
  }

  function seekTime(t: number) {
    const v = videoRef.current;
    if (!v || !src) return;
    const max = Number.isFinite(v.duration) ? v.duration : total;
    v.currentTime = Math.min(Math.max(t, 0), max);
  }

  const seekTo = (clientX: number) => seekTime(timeAt(clientX));

  function pick(next: AnnotationDraft | null) {
    setDraft(next);
    if (!next) return;
    if (next.kind === "range") seekTime(next.start);
    else seekTime(timeline?.tracks.find((t) => t.id === next.trackId)?.clips[next.index]?.start ?? 0);
  }

  function capture(e: React.PointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer: dragging still works inside the lanes */
    }
  }

  function onLanesDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const onRuler = Boolean(target.closest(".tl-ruler"));
    if (onAnnotate && !onRuler && (picking || e.shiftKey)) {
      const clipEl = target.closest<HTMLElement>(".tl-clip");
      capture(e);
      gesture.current = {
        mode: "select",
        startX: e.clientX,
        startT: timeAt(e.clientX),
        clip: clipEl?.dataset.track
          ? { trackId: clipEl.dataset.track, index: Number(clipEl.dataset.index) }
          : null,
        moved: false,
        range: null,
      };
      return;
    }
    if (!src) return;
    capture(e);
    gesture.current = { mode: "seek" };
    seekTo(e.clientX);
  }

  function onLanesMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    if (g.mode === "seek") {
      seekTo(e.clientX);
      return;
    }
    if (!g.moved && Math.abs(e.clientX - g.startX) < 4) return;
    g.moved = true;
    const t = timeAt(e.clientX);
    g.range = { start: Math.min(g.startT, t), end: Math.max(g.startT, t) };
    setLiveRange(g.range);
  }

  function onLanesUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.mode !== "select") return;
    const range = g.range;
    setLiveRange(null);
    if (g.moved && range && range.end - range.start >= 1 / fps) pick({ kind: "range", ...range });
    else if (g.clip) pick({ kind: "clip", ...g.clip });
    else pick(null);
  }

  function applyZoom(next: number, anchorClientX?: number) {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    const scroll = scrollRef.current;
    if (!scroll || clamped === zoom) return;
    const rect = scroll.getBoundingClientRect();
    const anchorX = (anchorClientX ?? rect.left + rect.width / 2) - rect.left;
    const frac = (scroll.scrollLeft + anchorX) / (viewWidth * zoom);
    setZoom(clamped);
    requestAnimationFrame(() => {
      scroll.scrollLeft = frac * viewWidth * clamped - anchorX;
    });
  }

  // ⌘/Ctrl + wheel (or trackpad pinch) zooms around the cursor. Native listener:
  // React's wheel handlers are passive and can't stop the page zoom.
  const zoomRef = useRef(applyZoom);
  zoomRef.current = applyZoom;
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      zoomRef.current(zoom * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX);
    };
    scroll.addEventListener("wheel", onWheel, { passive: false });
    return () => scroll.removeEventListener("wheel", onWheel);
  }, [zoom, hasRows]);

  const pct = (t: number) => `${(Math.min(Math.max(t, 0), total) / total) * 100}%`;
  const span = (start: number, end: number) => ({
    left: pct(start),
    width: `${((Math.min(end, total) - Math.max(start, 0)) / total) * 100}%`,
  });

  // Numbered marks for what's already attached, keyed for the clip rows.
  const clipMarks = useMemo(() => {
    const marks = new Map<string, number>();
    annotations.forEach((a, i) => {
      if (a.kind === "clip" && a.track && a.clip) marks.set(`${a.track.id}:${a.clip.index}`, i + 1);
    });
    return marks;
  }, [annotations]);

  const draftAnnotation = draft ? buildAnnotation(draft, timeline, fps, "") : null;
  const selectedClip = draft?.kind === "clip" ? `${draft.trackId}:${draft.index}` : null;
  const shownRange = liveRange ?? (draft?.kind === "range" ? draft : null);
  const canPick = Boolean(onAnnotate) && hasRows;

  return (
    <section
      className="tl"
      aria-label="Timeline"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !(draft || picking)) return;
        e.stopPropagation();
        if (draft) setDraft(null);
        else setPicking(false);
      }}
    >
      <header className="tl-head">
        <h3>Timeline</h3>
        {timeline ? (
          <span className="tag" title={`Fonte das faixas: ${timeline.sourcePath ?? timeline.source}`}>
            {timeline.source}
          </span>
        ) : null}
        {canPick ? (
          <button
            type="button"
            className={`tl-pick${picking ? " is-on" : ""}`}
            aria-pressed={picking}
            onClick={() => {
              setPicking((v) => !v);
              setDraft(null);
            }}
            title="Clique num clipe ou arraste um intervalo para anotar. Atalho: Shift + arrastar."
          >
            <SquareDashedMousePointer size={13} strokeWidth={1.75} />
            {picking ? "Selecionando" : "Anotar"}
          </button>
        ) : null}
        <div className="tl-zoom">
          <button
            type="button"
            className="icon-btn"
            onClick={() => applyZoom(zoom / 2)}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Diminuir zoom"
            title="Diminuir zoom  ⌘ + scroll"
          >
            <ZoomOut size={14} strokeWidth={1.75} />
          </button>
          <span className="tl-zoom-value">{zoom < 10 ? zoom.toFixed(1).replace(/\.0$/, "") : Math.round(zoom)}×</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => applyZoom(zoom * 2)}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Aumentar zoom"
            title="Aumentar zoom  ⌘ + scroll"
          >
            <ZoomIn size={14} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {hasRows ? (
        <div className="tl-body">
          <div className="tl-gutter" aria-hidden>
            <div className="tl-ruler-spacer" />
            {src ? <div className="tl-label tl-h-program">Programa</div> : null}
            {videoTracks.map((t) => (
              <TrackLabel key={t.id} track={t} />
            ))}
            {audioTracks.map((t, i) => (
              <TrackLabel key={t.id} track={t} first={i === 0} />
            ))}
            {src ? <div className={`tl-label tl-h-mix${audioTracks.length ? "" : " is-first-audio"}`}>Mix</div> : null}
          </div>

          <div className="tl-scroll" ref={scrollRef}>
            <div
              className={`tl-lanes${src ? " is-seekable" : ""}${picking ? " is-picking" : ""}`}
              ref={lanesRef}
              style={{ width: `${zoom * 100}%` }}
              onPointerDown={onLanesDown}
              onPointerMove={onLanesMove}
              onPointerUp={onLanesUp}
              onPointerCancel={() => {
                gesture.current = null;
                setLiveRange(null);
              }}
            >
              <div className="tl-ruler">
                {ticks.map((tick) => (
                  <span
                    key={tick.at}
                    className={`tl-tick${tick.major ? " is-major" : ""}`}
                    style={{ left: pct(tick.at) }}
                  >
                    {tick.major ? <span className="tl-tick-label">{clockLabel(tick.at)}</span> : null}
                  </span>
                ))}
                {timeline?.markers.map((m, i, all) => {
                  // A flag never runs into the next one.
                  const next = all[i + 1]?.at ?? total;
                  return (
                    <span
                      key={`${m.at}-${m.label}`}
                      className="tl-marker"
                      style={{ left: pct(m.at), maxWidth: `calc(${((next - m.at) / total) * 100}% - 2px)` }}
                      title={`${m.label} · ${timecode(m.at, fps)}`}
                    >
                      <span>{m.label}</span>
                    </span>
                  );
                })}
              </div>

              {src ? (
                <div className="tl-row tl-h-program">
                  <div className="tl-filmstrip">
                    {Array.from({ length: settledCount }, (_, i) => (
                      <span
                        key={i}
                        className="tl-thumb"
                        style={frames[i] ? { backgroundImage: `url(${frames[i]})` } : undefined}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {videoTracks.map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  pct={pct}
                  fps={fps}
                  total={total}
                  selected={selectedClip}
                  marks={clipMarks}
                />
              ))}
              {audioTracks.map((t, i) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  pct={pct}
                  fps={fps}
                  total={total}
                  first={i === 0}
                  selected={selectedClip}
                  marks={clipMarks}
                />
              ))}

              {src ? (
                <div className={`tl-row tl-h-mix${audioTracks.length ? "" : " is-first-audio"}`}>
                  {wave.status === "ready" ? (
                    <WaveCanvas peaks={wave.peaks} />
                  ) : (
                    <span className="tl-row-note">
                      {wave.status === "none" ? "Sem áudio" : "Lendo áudio…"}
                    </span>
                  )}
                </div>
              ) : null}

              {annotations.map((a, i) =>
                a.kind === "range" ? (
                  <div key={a.id} className="tl-range is-attached" style={span(a.start, a.end)}>
                    <span className="tl-range-badge">{i + 1}</span>
                  </div>
                ) : null,
              )}
              {shownRange ? (
                <div className="tl-range is-draft" style={span(shownRange.start, shownRange.end)}>
                  <span className="tl-range-len">{(shownRange.end - shownRange.start).toFixed(2)}s</span>
                </div>
              ) : null}

              {src ? <div className="tl-playhead" ref={playheadRef} /> : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="tl-empty">
          As faixas aparecem quando o projeto tiver <code>edit/compose.resolved.json</code> (ou <code>cuts.json</code>)
          ou um export.
        </p>
      )}

      {draftAnnotation && onAnnotate ? (
        <AnnotateCard
          key={JSON.stringify(draft)}
          summary={annotationSummary(draftAnnotation)}
          detail={
            draftAnnotation.kind === "range" && draftAnnotation.overlaps?.length
              ? `${draftAnnotation.overlaps.length} ${draftAnnotation.overlaps.length === 1 ? "item" : "itens"} dentro do intervalo`
              : draftAnnotation.clip?.ref
                ? `${draftAnnotation.sourcePath ?? ""} → ${draftAnnotation.clip.ref}`
                : null
          }
          onCancel={() => setDraft(null)}
          onSubmit={(note) => {
            if (!draft) return;
            const annotation = buildAnnotation(draft, timeline, fps, note);
            if (annotation) onAnnotate(annotation);
            setDraft(null);
          }}
        />
      ) : picking ? (
        <p className="tl-hint">Clique num clipe ou arraste para marcar um intervalo. Esc sai.</p>
      ) : null}
    </section>
  );
}

function AnnotateCard({
  summary,
  detail,
  onSubmit,
  onCancel,
}: {
  summary: string;
  detail: string | null;
  onSubmit: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <form
      className="tl-annotate"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(note);
      }}
    >
      <div className="tl-annotate-head">
        <MessageSquarePlus size={14} strokeWidth={1.75} />
        <span className="tl-annotate-title">{summary}</span>
        <button type="button" className="icon-btn" aria-label="Cancelar anotação" onClick={onCancel}>
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      {detail ? <p className="tl-annotate-detail">{detail}</p> : null}
      <textarea
        className="tl-annotate-input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="O que mudar aqui? Ex.: corta o respiro, troca o b-roll, sobe o SFX…"
        rows={2}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit(note);
          }
        }}
      />
      <div className="tl-annotate-actions">
        <button type="button" className="btn btn-small is-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-small is-primary">
          Anexar ao chat <kbd className="kbd">↵</kbd>
        </button>
      </div>
    </form>
  );
}

function TrackLabel({ track, first }: { track: TimelineTrack; first?: boolean }) {
  return (
    <div className={`tl-label tl-h-track${first ? " is-first-audio" : ""}`} title={track.name}>
      <span className="tl-slot">{track.slot}</span>
      <span className="tl-name">{track.name}</span>
      {track.muted ? <VolumeX size={11} strokeWidth={1.75} className="tl-muted" aria-label="Mudo" /> : null}
    </div>
  );
}

function TrackRow({
  track,
  pct,
  fps,
  total,
  first,
  selected,
  marks,
}: {
  track: TimelineTrack;
  pct: (t: number) => string;
  fps: number;
  total: number;
  first?: boolean;
  selected: string | null;
  marks: Map<string, number>;
}) {
  return (
    <div className={`tl-row tl-h-track${first ? " is-first-audio" : ""}${track.muted ? " is-muted" : ""}`}>
      {track.clips.map((clip, i) => {
        const key = `${track.id}:${i}`;
        const mark = marks.get(key);
        return (
          <span
            key={i}
            data-track={track.id}
            data-index={i}
            className={`tl-clip is-${track.kind}${selected === key ? " is-selected" : ""}${mark ? " is-annotated" : ""}`}
            style={{
              left: pct(clip.start),
              width: `calc(${((Math.min(clip.end, total) - clip.start) / total) * 100}% - 1px)`,
            }}
            title={`${clip.label} · ${timecode(clip.start, fps)} → ${timecode(clip.end, fps)}${clip.ref ? ` · ${clip.ref}` : ""}`}
          >
            {mark ? <span className="tl-clip-badge">{mark}</span> : null}
            <span className="tl-clip-label">{clip.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function WaveCanvas({ peaks }: { peaks: Float32Array }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "oklch(0.76 0.11 155 / 0.85)";
      const mid = h / 2;
      const per = peaks.length / w;
      for (let x = 0; x < w; x++) {
        let p = 0;
        const from = Math.floor(x * per);
        const to = Math.max(from + 1, Math.floor((x + 1) * per));
        for (let i = from; i < to && i < peaks.length; i++) if (peaks[i] > p) p = peaks[i];
        const bar = Math.max(dpr * 0.5, p * (mid - dpr));
        ctx.fillRect(x, mid - bar, 1, bar * 2);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [peaks]);

  return <canvas ref={ref} className="tl-wave" />;
}
