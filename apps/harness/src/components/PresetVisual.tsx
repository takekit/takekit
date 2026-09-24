import { useEffect, useId, useState } from "react";
import { Check, LoaderCircle, Play, Square } from "lucide-react";
import { MODULE_LABEL, cameraClipUrl, captionPresetUrl, soundDemoUrl, type ModuleKey, type PresetSummary } from "../api/client";

/**
 * What a preset looks like, not what it's called: captions animate (real renderer, a few
 * sample phrases), stages are drawn, transitions play their cut, cuts and sound show their
 * rhythm. Every preset picker in the app is built from these cards.
 */

/** Caption animation, cropped around where the caption sits on the frame. */
export function CaptionClip({
  preset,
  background = "auto",
  styleId,
  play = true,
}: {
  preset: PresetSummary;
  background?: string;
  styleId?: string;
  play?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const y = Math.min(88, Math.max(12, ((preset.visual.y ?? 1180) / 1920) * 100));
  const opts = { background, styleId };
  return (
    <span className="pv-media pv-caption">
      {failed ? (
        <span className="pv-fallback">{preset.name}</span>
      ) : play ? (
        <video
          src={captionPresetUrl(preset.id, "clip", opts)}
          poster={captionPresetUrl(preset.id, "still", opts)}
          style={{ objectPosition: `50% ${y}%` }}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setFailed(true)}
        />
      ) : (
        <img src={captionPresetUrl(preset.id, "still", opts)} alt="" style={{ objectPosition: `50% ${y}%` }} onError={() => setFailed(true)} />
      )}
    </span>
  );
}

const CREAM = "#F4EFE6";
const INK = "#1C1A18";
const GOLD = "#F4B400";

/** Where host, graphic, B-roll and caption sit in each palco, on a 90×160 frame. */
export function StageDiagram({ layout, palco }: { layout?: string; palco?: string }) {
  const kind = layout ?? { A: "host", B: "host-canvas", C: "canvas", D: "split" }[palco ?? "A"] ?? "host";
  const clipId = `split-${useId().replace(/:/g, "")}`;
  const host = (cx: number, top: number, scale = 1) => (
    <g>
      <circle cx={cx} cy={top + 18 * scale} r={11 * scale} fill="#9A9AA2" />
      <rect x={cx - 22 * scale} y={top + 30 * scale} width={44 * scale} height={60 * scale} rx={16 * scale} fill="#9A9AA2" />
    </g>
  );
  const caption = (y: number, dark = false) => <rect x={27} y={y - 3} width={36} height={6} rx={3} fill={dark ? INK : "#FFFFFF"} />;
  return (
    <span className="pv-media pv-stage">
      <svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {kind === "host" ? (
          <>
            <rect width="90" height="160" fill="#2B2B31" />
            {host(45, 34, 1.15)}
            {caption(98)}
          </>
        ) : kind === "host-canvas" ? (
          <>
            <rect width="90" height="160" fill={CREAM} />
            <rect x="16" y="15" width="58" height="36" rx="4" fill={INK} />
            <rect x="22" y="37" width="20" height="8" rx="2" fill={GOLD} />
            <rect x="6" y="84" width="78" height="76" rx="9" fill="#2B2B31" />
            {host(45, 70, 0.95)}
            {caption(62, true)}
          </>
        ) : kind === "canvas" ? (
          <>
            <rect width="90" height="160" fill={CREAM} />
            <rect x="12" y="20" width="66" height="96" rx="6" fill={INK} opacity="0.9" />
            <circle cx="45" cy="60" r="16" fill={GOLD} />
            <rect x="26" y="86" width="38" height="6" rx="3" fill={CREAM} opacity="0.8" />
            {caption(132, true)}
          </>
        ) : (
          <>
            <rect width="90" height="80" fill="#3E5670" />
            <path d="M8 70 L30 42 L44 58 L58 38 L82 70 Z" fill="#6F8AA6" />
            <circle cx="68" cy="22" r="7" fill="#C9D6E3" />
            <rect y="80" width="90" height="80" fill="#2B2B31" />
            <clipPath id={clipId}>
              <rect y="81" width="90" height="79" />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>{host(45, 88, 1.05)}</g>
            <rect y="79" width="90" height="2" fill="#FFFFFF" />
            {caption(80)}
          </>
        )}
      </svg>
    </span>
  );
}

/** Two shots cutting back and forth; the filmburn flashes where the preset puts it. */
export function TransitionAnim({ burn = "none" }: { burn?: "none" | "hook" | "marked" | "all" }) {
  return (
    <span className={`pv-media pv-transition is-${burn}`} aria-hidden="true">
      <span className="pv-shot is-a">
        <span className="pv-shot-head" />
      </span>
      <span className="pv-shot is-b">
        <span className="pv-shot-block" />
      </span>
      {burn !== "none" ? <span className="pv-burn" /> : null}
    </span>
  );
}

/** Speech blocks on a waveform: how much air each cut keeps. */
export function CutsDiagram({ pad = 1 }: { pad?: number }) {
  const gap = Math.min(10, 2 + pad * 1.6);
  const blocks = [18, 12, 22, 9, 16];
  let x = 4;
  const rects = blocks.map((w, i) => {
    const r = { x, w, i };
    x += w + gap;
    return r;
  });
  const bars = (x0: number, w: number, seed: number) =>
    Array.from({ length: Math.max(2, Math.floor(w / 2.4)) }, (_, k) => {
      const h = 8 + (((seed * 7 + k * 13) % 11) / 11) * 22;
      return <rect key={k} x={x0 + 1 + k * 2.4} y={40 - h / 2} width={1.4} height={h} rx={0.7} fill="currentColor" />;
    });
  return (
    <span className="pv-media pv-cuts" aria-hidden="true">
      <svg viewBox={`0 0 ${Math.max(90, x)} 80`} preserveAspectRatio="xMidYMid meet">
        {rects.map((r) => (
          <g key={r.i}>{bars(r.x, r.w, r.i)}</g>
        ))}
        {rects.slice(1).map((r) => (
          <rect key={r.i} x={r.x - gap / 2 - 0.5} y={12} width={1} height={56} fill={GOLD} opacity="0.85" />
        ))}
        <rect className="pv-cuts-head" x="0" y="8" width="1.2" height="64" fill="#FFFFFF" />
      </svg>
    </span>
  );
}

/**
 * What plays with your voice, as three labeled lanes: your voice, sound effects on the
 * on-screen motion, background music (dipping while you talk). A lane that's off says so.
 */
export function SoundVisual({ sfx = true, music = true, compact = false }: { sfx?: boolean; music?: boolean; compact?: boolean }) {
  const voice = [3, 6, 4, 8, 5, 2, 7, 5, 3, 6, 8, 4, 2, 5, 7, 3];
  return (
    <span className={`pv-media pv-sound${compact ? " is-compact" : ""}`} aria-hidden="true">
      <span className="pv-lane is-voice">
        <span className="pv-lane-label">Voz</span>
        <span className="pv-lane-track">
          {voice.map((h, i) => (
            <i key={i} style={{ height: `${h * 11}%`, animationDelay: `${(i * 83) % 700}ms` }} />
          ))}
        </span>
      </span>
      <span className={`pv-lane is-sfx${sfx ? "" : " is-off"}`}>
        <span className="pv-lane-label">Efeitos</span>
        <span className="pv-lane-track">
          {sfx ? (
            [18, 50, 80].map((x, i) => <b key={x} style={{ left: `${x}%`, animationDelay: `${i * 0.6}s` }} />)
          ) : (
            <em>sem efeitos</em>
          )}
        </span>
      </span>
      <span className={`pv-lane is-music${music ? "" : " is-off"}`}>
        <span className="pv-lane-label">Música</span>
        <span className="pv-lane-track">
          {music ? (
            <svg viewBox="0 0 120 12" preserveAspectRatio="none">
              <path d="M0 6 Q5 1 10 6 T20 6 T30 6 T40 6 T50 6 T60 6 T70 6 T80 6 T90 6 T100 6 T110 6 T120 6 T130 6 T140 6" />
            </svg>
          ) : (
            <em>sem música</em>
          )}
        </span>
      </span>
    </span>
  );
}

/** Plays a short audio sample; only one sample plays at a time across the app. */
let current: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

export function ListenButton({ url, label = "Ouvir" }: { url: string; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const sync = () => setPlaying(Boolean(current && !current.paused && current.dataset.url === url));
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [url]);
  const notify = () => listeners.forEach((fn) => fn());
  const toggle = () => {
    if (current && current.dataset.url === url && !current.paused) {
      current.pause();
      notify();
      return;
    }
    current?.pause();
    const audio = new Audio(url);
    audio.dataset.url = url;
    current = audio;
    setLoading(true);
    audio.onplaying = () => {
      setLoading(false);
      notify();
    };
    audio.onended = audio.onpause = notify;
    audio.onerror = () => {
      setLoading(false);
      notify();
    };
    void audio.play().catch(() => setLoading(false));
  };
  return (
    <button type="button" className={`pv-listen${playing ? " is-playing" : ""}`} onClick={toggle} aria-label={playing ? "Parar" : label}>
      {loading ? <LoaderCircle size={12} strokeWidth={2.25} className="spin" /> : playing ? <Square size={10} strokeWidth={0} fill="currentColor" /> : <Play size={11} strokeWidth={0} fill="currentColor" />}
      <span>{playing ? "Parar" : label}</span>
    </button>
  );
}

const FREQUENCY: Record<string, string> = {
  marcado: "Só na ênfase",
  poucos: "Poucas vezes",
  medio: "Às vezes",
  muitos: "Muitas vezes",
};

/** "Forte · Muitas vezes · Segue o rosto": the camera preset in three plain words. */
export function cameraTags(v: PresetSummary["visual"]): string[] {
  const moves = v.moves ?? [];
  const tags: string[] = [];
  if (!moves.length) tags.push(v.tracking ? "Sem movimento" : "Parada");
  else {
    const i = v.intensity ?? 1;
    tags.push(i >= 1.18 ? "Forte" : i >= 1.1 ? "Médio" : "Sutil");
    tags.push(FREQUENCY[v.frequency ?? ""] ?? "Às vezes");
  }
  if (v.tracking) tags.push("Segue o rosto");
  return tags;
}

/**
 * The camera preset on your own footage (punches, zooms, face tracking), from the engine.
 * Until it loads (or with no footage yet) a drawn face does the same moves.
 */
export function CameraClip({ preset, threadId, styleId, play = true }: {
  preset: PresetSummary;
  threadId?: string;
  styleId?: string;
  play?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const moves = preset.visual.moves ?? [];
  const kind = moves.includes("punch") ? "punch" : moves.includes("zoomIn") ? "zoom-in" : moves.includes("zoomOut") ? "zoom-out" : "none";
  return (
    <span className={`pv-media pv-camera is-${kind}${ready ? " is-ready" : ""}`}>
      <span className="pv-camera-anim" aria-hidden="true">
        <svg viewBox="0 0 80 100" preserveAspectRatio="xMidYMax slice">
          <g className="pv-camera-person">
            <circle cx="40" cy="40" r="12" fill="#A3A3AB" />
            <path d="M14 104 C14 76 25 62 40 62 C55 62 66 76 66 104 Z" fill="#A3A3AB" />
            {preset.visual.tracking ? (
              <rect className="pv-camera-track" x="25" y="23" width="30" height="34" rx="4" fill="none" />
            ) : null}
          </g>
        </svg>
      </span>
      {play && !failed ? (
        <video
          src={cameraClipUrl(preset.id, { threadId, styleId })}
          autoPlay
          loop
          muted
          playsInline
          onPlaying={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}

/** The right visual for a module's preset. */
export function PresetMedia({ module, preset, background, styleId, play, compact }: {
  module: ModuleKey;
  preset: PresetSummary;
  background?: string;
  styleId?: string;
  play?: boolean;
  /** Thumbnail size: drop the lane labels. */
  compact?: boolean;
}) {
  switch (module) {
    case "caption":
      return <CaptionClip preset={preset} background={background} styleId={styleId} play={play} />;
    case "stage":
      return <StageDiagram layout={preset.visual.layout} palco={preset.palco} />;
    case "transitions":
      return <TransitionAnim burn={preset.visual.burn} />;
    case "cuts":
      return <CutsDiagram pad={preset.visual.pad} />;
    case "soundEffects":
      return <SoundVisual sfx={preset.visual.sfx} music={preset.visual.music} compact={compact} />;
    case "camera":
      return (
        <CameraClip
          preset={preset}
          threadId={background?.startsWith("thread:") ? background.slice(7) : undefined}
          styleId={styleId}
          play={play !== false && !compact}
        />
      );
  }
}

/** One preset: its visual, its name, a check when picked. */
export function PresetCard({
  module,
  preset,
  selected,
  fromStyle,
  onClick,
  background,
  styleId,
  disabled,
}: {
  module: ModuleKey;
  preset: PresetSummary;
  selected: boolean;
  fromStyle?: boolean;
  onClick: () => void;
  background?: string;
  styleId?: string;
  disabled?: boolean;
}) {
  const card = (
    <button
      type="button"
      className={`pv-card is-${module}${selected ? " is-selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={preset.description || preset.name}
    >
      <PresetMedia module={module} preset={preset} background={background} styleId={styleId} />
      <span className="pv-card-name">
        {preset.name}
        {fromStyle ? <span className="preset-tag">estilo</span> : null}
      </span>
      {module === "soundEffects" && preset.description ? <span className="pv-card-desc">{preset.description}</span> : null}
      {module === "camera" ? (
        <span className="pv-card-tags">
          {cameraTags(preset.visual).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </span>
      ) : null}
      {selected ? (
        <span className="pv-card-check" aria-hidden="true">
          <Check size={12} strokeWidth={2.5} />
        </span>
      ) : null}
    </button>
  );
  if (module !== "soundEffects") return card;
  // Sound is heard: a sample of your voice with this preset's effects and music.
  const threadId = background?.startsWith("thread:") ? background.slice(7) : undefined;
  return (
    <div className="pv-card-wrap">
      {card}
      <ListenButton url={soundDemoUrl(preset.id, { threadId, styleId })} />
    </div>
  );
}

/** Every preset of a module as cards. Stage is multi-pick (at least one). */
export function PresetGrid({
  module,
  list,
  value,
  styleValue,
  onPick,
  background,
  styleId,
  compact,
}: {
  module: ModuleKey;
  list: PresetSummary[];
  value: string | string[] | null | undefined;
  styleValue?: string | string[] | null;
  onPick: (value: string | string[]) => void;
  background?: string;
  styleId?: string;
  compact?: boolean;
}) {
  const multi = module === "stage";
  const picked = multi ? ((value as string[] | undefined) ?? []) : [];
  const inStyle = (id: string) => (Array.isArray(styleValue) ? styleValue.includes(id) : styleValue === id);
  return (
    <div className={`pv-grid is-${module}${compact ? " is-compact" : ""}`} role="group" aria-label={MODULE_LABEL[module]}>
      {list.map((preset) => {
        const selected = multi ? picked.includes(preset.id) : value === preset.id;
        return (
          <PresetCard
            key={preset.id}
            module={module}
            preset={preset}
            selected={selected}
            fromStyle={inStyle(preset.id)}
            background={background}
            styleId={styleId}
            disabled={multi && selected && picked.length === 1}
            onClick={() => {
              if (!multi) onPick(preset.id);
              else {
                const order = new Map(list.map((p, i) => [p.id, i]));
                const next = selected ? picked.filter((id) => id !== preset.id) : [...picked, preset.id];
                onPick(next.sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99)));
              }
            }}
          />
        );
      })}
    </div>
  );
}
