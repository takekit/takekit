import { useEffect, useState } from "react";

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error(`${event} failed`));
    };
    const cleanup = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener("error", fail);
    };
    target.addEventListener(event, ok);
    target.addEventListener("error", fail);
  });
}

/**
 * Evenly spaced JPEG thumbnails of a video, grabbed from an offscreen
 * <video>. Frames stream in as they're decoded.
 */
export function useFilmstrip(src: string | null, count: number, height = 72): string[] {
  const [frames, setFrames] = useState<string[]>([]);

  useEffect(() => {
    setFrames([]);
    if (!src || count < 1) return;
    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = src;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    (async () => {
      await once(video, "loadedmetadata");
      if (!ctx || !video.videoWidth) return;
      canvas.height = height;
      canvas.width = Math.round((height * video.videoWidth) / video.videoHeight);
      const out: string[] = [];
      for (let i = 0; i < count && !cancelled; i++) {
        video.currentTime = ((i + 0.5) / count) * video.duration;
        await once(video, "seeked");
        if (cancelled) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        out.push(canvas.toDataURL("image/jpeg", 0.72));
        setFrames([...out]);
      }
    })().catch(() => {
      /* thumbnails are decoration; the timeline still works without them */
    });

    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
    };
  }, [src, count, height]);

  return frames;
}

export type WaveState =
  | { status: "idle" | "loading" | "none" }
  | { status: "ready"; peaks: Float32Array };

/** Peak envelope (0..1) of a media file's audio, decoded in the browser. */
export function useWaveform(src: string | null, buckets = 1600): WaveState {
  const [state, setState] = useState<WaveState>({ status: "idle" });

  useEffect(() => {
    if (!src) {
      setState({ status: "idle" });
      return;
    }
    const abort = new AbortController();
    setState({ status: "loading" });

    (async () => {
      const res = await fetch(src, { signal: abort.signal });
      const size = Number(res.headers.get("content-length") ?? 0);
      // Past ~300 MB decoding costs more than a preview waveform is worth.
      if (!res.ok || size > 300 * 1024 * 1024) throw new Error("skip");
      const data = await res.arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 44100);
      const audio = await ctx.decodeAudioData(data);
      const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
      const per = Math.max(1, Math.floor(audio.length / buckets));
      const peaks = new Float32Array(buckets);
      let max = 0;
      for (let b = 0; b < buckets; b++) {
        let peak = 0;
        const start = b * per;
        const end = Math.min(audio.length, start + per);
        for (const ch of channels) {
          for (let i = start; i < end; i += 4) {
            const v = Math.abs(ch[i]);
            if (v > peak) peak = v;
          }
        }
        peaks[b] = peak;
        if (peak > max) max = peak;
      }
      if (max > 0) for (let b = 0; b < buckets; b++) peaks[b] /= max;
      if (!abort.signal.aborted) setState({ status: "ready", peaks });
    })().catch(() => {
      if (!abort.signal.aborted) setState({ status: "none" });
    });

    return () => abort.abort();
  }, [src, buckets]);

  return state;
}
