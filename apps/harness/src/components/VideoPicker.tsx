import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Film, Laptop } from "lucide-react";
import { listVideos, thumbUrl, videoFileUrl, type VideoFile } from "../api/client";
import { basename, tildify } from "../lib/format";
import { IS_TAURI } from "../lib/platform";
import { Palette, PaletteFooter, PaletteSearch } from "./Palette";

const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "mkv", "webm", "avi", "mts", "mxf"];

/**
 * Footage picker: every video inside the project folder as a thumbnail grid.
 * Hover plays a muted preview; click (or Space) toggles, and the order of the
 * picks is the order the agent gets them in.
 */
export function VideoPicker({
  projectPath,
  selected,
  onConfirm,
  onClose,
}: {
  projectPath: string;
  selected: string[];
  onConfirm: (paths: string[]) => void;
  onClose: () => void;
}) {
  const [videos, setVideos] = useState<VideoFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showRenders, setShowRenders] = useState(false);
  const [order, setOrder] = useState<string[]>(selected);
  const [cursor, setCursor] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    let cancelled = false;
    listVideos(projectPath)
      .then((res) => !cancelled && setVideos(res.videos))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message.replace(/^\d+: /, "") : String(err)));
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  // Column count drives ↑/↓ in the grid.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => setColumns(Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [videos]);

  const renders = videos?.filter((v) => v.generated).length ?? 0;
  const q = norm(query);
  const shown = useMemo(() => {
    const list = (videos ?? []).filter((v) => (showRenders || !v.generated || order.includes(v.path)) && (!q || norm(v.rel).includes(q)));
    // Footage first, renders after; newest first inside each group (engine order).
    return [...list.filter((v) => !v.generated), ...list.filter((v) => v.generated)];
  }, [videos, showRenders, q, order]);
  const active = Math.min(cursor, Math.max(0, shown.length - 1));

  const toggle = (path: string) =>
    setOrder((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));

  function confirm(paths = order) {
    onConfirm(paths);
    onClose();
  }

  async function finder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const chosen = await open({
        multiple: true,
        directory: false,
        defaultPath: projectPath,
        filters: [{ name: "Vídeo", extensions: VIDEO_EXTENSIONS }],
      });
      const picked = Array.isArray(chosen) ? chosen : typeof chosen === "string" ? [chosen] : [];
      if (picked.length) confirm([...order, ...picked.filter((p) => !order.includes(p))]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const n = shown.length;
    const move = (delta: number) => {
      e.preventDefault();
      if (n) setCursor(Math.max(0, Math.min(n - 1, active + delta)));
    };
    if (e.key === "ArrowDown") move(columns);
    else if (e.key === "ArrowUp") move(-columns);
    else if (e.key === "ArrowRight" && !query) move(1);
    else if (e.key === "ArrowLeft" && !query) move(-1);
    else if (e.key === " " && !query) {
      e.preventDefault();
      if (shown[active]) toggle(shown[active].path);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (order.length) confirm();
      else if (shown[active]) confirm([shown[active].path]);
    }
  }

  const count = order.length;
  return (
    <Palette label="Escolher vídeos de entrada" onClose={onClose} className="palette-wide">
      <PaletteSearch
        value={query}
        onChange={(v) => {
          setQuery(v);
          setCursor(0);
        }}
        placeholder={`Buscar vídeo em ${basename(projectPath)}…`}
        onKeyDown={onKeyDown}
        trailing={
          renders ? (
            <button
              type="button"
              className={`palette-toggle${showRenders ? " is-on" : ""}`}
              aria-pressed={showRenders}
              onClick={() => setShowRenders((v) => !v)}
              title="Vídeos em edit/ e exports/, gerados pelo pipeline"
            >
              Renders <span className="palette-toggle-n">{renders}</span>
            </button>
          ) : null
        }
      />
      <div className="palette-crumbs is-static" title={projectPath}>
        <Film size={12} strokeWidth={2} />
        <span>{tildify(projectPath)}</span>
      </div>

      <div className="video-grid-wrap">
        {error ? <p className="palette-empty is-error">{error}</p> : null}
        {!videos && !error ? <p className="palette-empty">Procurando vídeos…</p> : null}
        {videos && !shown.length ? (
          <div className="video-empty">
            <Film size={22} strokeWidth={1.5} />
            <p>
              {query
                ? `Nada com “${query}”.`
                : videos.length
                  ? "Só tem renders nesta pasta. Ligue “Renders” para vê-los."
                  : "Nenhum vídeo nesta pasta de projeto."}
            </p>
            {!query && !videos.length ? (
              <small>Coloque os brutos em input/{IS_TAURI ? " ou escolha no Finder." : "."}</small>
            ) : null}
          </div>
        ) : null}
        <div className="video-grid" ref={gridRef} role="listbox" aria-multiselectable="true" aria-label="Vídeos">
          {shown.map((v, i) => (
            <VideoCard
              key={v.path}
              video={v}
              rank={order.indexOf(v.path) + 1}
              active={i === active}
              onToggle={() => {
                setCursor(i);
                toggle(v.path);
              }}
              onOpen={() => confirm(order.includes(v.path) ? order : [...order, v.path])}
            />
          ))}
        </div>
      </div>

      <PaletteFooter
        hints={[
          [["←", "→", "↑", "↓"], "Navegar"],
          [["espaço"], "Marcar"],
          [["↵"], "Usar"],
          [["esc"], "Fechar"],
        ]}
      >
        {IS_TAURI ? (
          <button type="button" className="btn is-ghost btn-small" onClick={() => void finder()}>
            <Laptop size={13} strokeWidth={1.75} />
            Finder…
          </button>
        ) : null}
        {count ? (
          <button type="button" className="btn is-ghost btn-small" onClick={() => setOrder([])}>
            Limpar
          </button>
        ) : null}
        <button type="button" className="btn is-primary btn-small" disabled={!count} onClick={() => confirm()}>
          {count > 1 ? `Usar ${count} vídeos` : "Usar vídeo"}
        </button>
      </PaletteFooter>
    </Palette>
  );
}

function VideoCard({
  video,
  rank,
  active,
  onToggle,
  onOpen,
}: {
  video: VideoFile;
  rank: number;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [playable, setPlayable] = useState(true);
  const [thumbOk, setThumbOk] = useState(true);
  // Only start streaming after a short dwell, so sweeping the grid doesn't open 20 videos.
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (!hover || !playable) {
      setPreview(false);
      return;
    }
    const t = setTimeout(() => setPreview(true), 350);
    return () => clearTimeout(t);
  }, [hover, playable]);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const folder = video.rel.includes("/") ? video.rel.slice(0, video.rel.lastIndexOf("/")) : "raiz";
  const res = video.width && video.height ? `${video.width}×${video.height}` : null;
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={rank > 0}
      className={`video-card${rank ? " is-selected" : ""}${active ? " is-active" : ""}`}
      onClick={onToggle}
      onDoubleClick={onOpen}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      title={video.path}
    >
      <div className="video-thumb">
        {thumbOk ? (
          <img src={thumbUrl(video.path)} alt="" loading="lazy" draggable={false} onError={() => setThumbOk(false)} />
        ) : (
          <Film size={20} strokeWidth={1.5} className="video-thumb-fallback" />
        )}
        {preview ? (
          <video
            src={videoFileUrl(video.path)}
            muted
            autoPlay
            loop
            playsInline
            preload="auto"
            onError={() => setPlayable(false)}
          />
        ) : null}
        <span className={`video-check${rank ? " is-on" : ""}`} aria-hidden="true">
          {rank || null}
        </span>
        {video.duration ? <span className="video-duration">{duration(video.duration)}</span> : null}
      </div>
      <div className="video-meta">
        <span className="video-name">{video.name}</span>
        <span className="video-sub">
          {[folder, res, size(video.size)].filter(Boolean).join(" · ")}
        </span>
      </div>
    </div>
  );
}

function duration(s: number): string {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function size(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace(".", ",")} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function norm(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
