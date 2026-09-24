import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { captionPreview } from "../api/client";

const STILL_DEBOUNCE_MS = 220;
const CLIP_DEBOUNCE_MS = 650;

/**
 * A caption preset drawn by the engine's real renderer, over footage or a plain card.
 * With `animate`, it plays the sample phrases in a loop (entrance, hold, exit, next); the
 * still shows first so a tweak has instant feedback while the animation renders.
 */
export function CaptionStill({
  preset,
  text,
  background,
  layout = "face",
  animate = false,
  className = "",
}: {
  preset: object;
  /** Phrases separated by "|" (or newlines); *word* marks the emphasis. */
  text: string;
  /** "auto" | "dark" | "cream" | "thread:<id>" */
  background: string;
  layout?: "face" | "canvas";
  animate?: boolean;
  className?: string;
}) {
  const [still, setStill] = useState<string | null>(null);
  const [clip, setClip] = useState<string | null>(null);
  const [clipReady, setClipReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  const phrases = text
    .split(/[|\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const first = phrases[0] ?? "Isso *muda* tudo";
  const key = JSON.stringify([preset, phrases, background, layout]);

  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const keep = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    // Old images go once a few newer ones exist (the element may still show the previous one).
    while (urls.current.length > 8) URL.revokeObjectURL(urls.current.shift()!);
    return url;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setClipReady(false);
    const stillTimer = setTimeout(() => {
      captionPreview({ preset, text: first, layout, background })
        .then((blob) => {
          if (cancelled) return;
          setStill(keep(blob));
          setError(null);
        })
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
        .finally(() => !cancelled && !animate && setLoading(false));
    }, STILL_DEBOUNCE_MS);
    const clipTimer = animate
      ? setTimeout(() => {
          captionPreview({ preset, text: phrases.join("|"), layout, background }, true)
            .then((blob) => !cancelled && setClip(keep(blob)))
            .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
            .finally(() => !cancelled && setLoading(false));
        }, CLIP_DEBOUNCE_MS)
      : undefined;
    return () => {
      cancelled = true;
      clearTimeout(stillTimer);
      clearTimeout(clipTimer);
    };
    // `key` covers preset/phrases/background/layout by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, animate]);

  return (
    <div className={`caption-still ${className}`} aria-busy={loading}>
      {still ? <img src={still} alt={`Legenda: ${first.replace(/\*/g, "")}`} /> : null}
      {animate && clip ? (
        <video
          key={clip}
          src={clip}
          className={clipReady ? "is-ready" : ""}
          autoPlay
          loop
          muted
          playsInline
          onPlaying={() => setClipReady(true)}
        />
      ) : null}
      {loading ? <LoaderCircle size={16} strokeWidth={2} className="caption-still-spin spin" aria-label="Desenhando" /> : null}
      {error && !still ? <p className="caption-still-error">{error}</p> : null}
    </div>
  );
}
