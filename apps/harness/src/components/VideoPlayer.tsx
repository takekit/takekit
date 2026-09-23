import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { timecode } from "../lib/format";

interface Props {
  src: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  fps: number;
  onDuration?: (seconds: number) => void;
}

type FullscreenTarget = HTMLElement & { webkitRequestFullscreen?: () => void };
type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };

/**
 * Program monitor: the stage takes the video's own aspect ratio (never
 * stretched), custom transport under it. Keys: Space/K play, ←/→ one frame
 * (Shift = 1s), F fullscreen, M mute.
 */
export function VideoPlayer({ src, videoRef, fps, onDuration }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [failed, setFailed] = useState(false);

  // Frame-accurate timecode while playing; events cover the paused case.
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setTime(v.currentTime);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, videoRef]);

  useEffect(() => {
    const doc = document as FullscreenDoc;
    const sync = () =>
      setFullscreen((doc.fullscreenElement ?? doc.webkitFullscreenElement) === frameRef.current);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setRatio(null);
    setFailed(false);
  }, [src]);

  const video = () => videoRef.current;

  function togglePlay() {
    const v = video();
    if (!v) return;
    if (v.paused || v.ended) void v.play().catch(() => setPlaying(false));
    else v.pause();
  }

  function seek(seconds: number) {
    const v = video();
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(seconds, 0), v.duration);
    setTime(v.currentTime);
  }

  function toggleFullscreen() {
    const doc = document as FullscreenDoc;
    const frame = frameRef.current as FullscreenTarget | null;
    if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    } else if (frame?.requestFullscreen) {
      void frame.requestFullscreen().catch(() => undefined);
    } else {
      frame?.webkitRequestFullscreen?.();
    }
  }

  const style = { "--ratio": ratio ?? 9 / 16 } as CSSProperties;

  return (
    <div
      ref={frameRef}
      className={`player${fullscreen ? " is-fullscreen" : ""}`}
      style={style}
      tabIndex={0}
      aria-label="Player do preview"
      onKeyDown={(e) => {
        const v = video();
        if (!v || e.metaKey || e.ctrlKey || e.altKey) return;
        const step = e.shiftKey ? 1 : 1 / fps;
        if (e.key === " " || e.key === "k") togglePlay();
        else if (e.key === "ArrowLeft") seek(v.currentTime - step);
        else if (e.key === "ArrowRight") seek(v.currentTime + step);
        else if (e.key === "f") toggleFullscreen();
        else if (e.key === "m") v.muted = !v.muted;
        else return;
        e.preventDefault();
      }}
    >
      <div className="player-stage" onClick={togglePlay} onDoubleClick={toggleFullscreen}>
        <video
          ref={videoRef}
          className="player-video"
          src={src}
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
            setDuration(v.duration);
            onDuration?.(v.duration);
          }}
          onDurationChange={(e) => {
            setDuration(e.currentTarget.duration);
            onDuration?.(e.currentTarget.duration);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => !playing && setTime(e.currentTarget.currentTime)}
          onSeeked={(e) => setTime(e.currentTarget.currentTime)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          onError={() => setFailed(true)}
        />
        {failed ? (
          <span className="player-note">Não consegui carregar o vídeo.</span>
        ) : !playing ? (
          <span className="player-bigplay" aria-hidden>
            <Play size={22} strokeWidth={1.75} fill="currentColor" />
          </span>
        ) : null}
      </div>

      <div className="player-bar">
        <button
          type="button"
          className="icon-btn"
          onClick={togglePlay}
          aria-label={playing ? "Pausar" : "Reproduzir"}
          title={playing ? "Pausar  Espaço" : "Reproduzir  Espaço"}
        >
          {playing ? (
            <Pause size={15} strokeWidth={1.75} fill="currentColor" />
          ) : (
            <Play size={15} strokeWidth={1.75} fill="currentColor" />
          )}
        </button>
        <span className="timecode">
          {timecode(time, fps)}
          <span className="timecode-total"> / {timecode(duration, fps)}</span>
        </span>
        <Scrubber time={time} duration={duration} onSeek={seek} />
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            const v = video();
            if (v) v.muted = !v.muted;
          }}
          aria-label={muted ? "Ativar som" : "Silenciar"}
          title={muted ? "Ativar som  M" : "Silenciar  M"}
        >
          {muted ? <VolumeX size={15} strokeWidth={1.75} /> : <Volume2 size={15} strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          title={fullscreen ? "Sair da tela cheia  F" : "Tela cheia  F"}
        >
          {fullscreen ? <Minimize size={15} strokeWidth={1.75} /> : <Maximize size={15} strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  );
}

function Scrubber({
  time,
  duration,
  onSeek,
}: {
  time: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const dragging = useRef(false);
  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;

  function at(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * duration;
  }

  return (
    <div
      className="scrubber"
      role="slider"
      aria-label="Posição"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      onPointerDown={(e) => {
        if (!duration) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onSeek(at(e));
      }}
      onPointerMove={(e) => dragging.current && onSeek(at(e))}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <div className="scrubber-track">
        <div className="scrubber-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="scrubber-knob" style={{ left: `${pct}%` }} />
    </div>
  );
}
