import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Captions, Check, ChevronDown, LayoutGrid, LoaderCircle, Palette as PaletteIcon, Plus, Sparkles } from "lucide-react";
import { isThreadBusy, stylePreviewUrl, styleThumbUrl, type StyleSummary, type Thread } from "../api/client";
import { usePersistentState } from "../lib/hooks";
import { IconButton, Popover } from "./ui";

/** Portrait frame of the style's preview loop (or its initial when it has none). */
function StyleThumb({ style, className = "" }: { style: StyleSummary; className?: string }) {
  const [ok, setOk] = useState(style.hasPreview);
  return (
    <span className={`style-thumb ${className}`} aria-hidden="true">
      {ok ? (
        <img src={styleThumbUrl(style)} alt="" loading="lazy" draggable={false} onError={() => setOk(false)} />
      ) : (
        <span className="style-thumb-initial">{style.name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}

/**
 * Sidebar gallery, right under "Nova thread". Clicking a style starts a new thread with
 * it; hovering shows the preview loop next to the sidebar.
 */
export function StyleGallery({
  styles,
  defaultStyleId,
  onPick,
  drafts,
  activeId,
  onSelectThread,
  onNewStyle,
  onNewCaption,
  onOpenStudio,
  studioOpen,
  canCreate,
}: {
  styles: StyleSummary[];
  defaultStyleId: string | null;
  onPick: (styleId: string) => void;
  /** Threads creating a style from references (kind "style"). */
  drafts: Thread[];
  activeId: string | null;
  onSelectThread: (id: string) => void;
  onNewStyle: () => void;
  onNewCaption: () => void;
  onOpenStudio: () => void;
  studioOpen: boolean;
  canCreate: boolean;
}) {
  const [open, setOpen] = usePersistentState("takekit.stylesOpen", true);
  const [peek, setPeek] = useState<{ style: StyleSummary; rect: DOMRect } | null>(null);
  const dwell = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(dwell.current), []);

  if (!styles.length && !drafts.length) return null;

  const enter = (style: StyleSummary, el: HTMLElement) => {
    clearTimeout(dwell.current);
    if (!style.hasPreview) return;
    // Only after a short dwell, so moving the pointer down the sidebar doesn't flash videos.
    dwell.current = setTimeout(() => setPeek({ style, rect: el.getBoundingClientRect() }), 300);
  };
  const leave = () => {
    clearTimeout(dwell.current);
    setPeek(null);
  };

  return (
    <section className="group style-gallery" aria-label="Estilos">
      <div className="group-head">
        <button type="button" className="group-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="group-name">Estilos</span>
          <span className="group-count">{styles.length}</span>
          <ChevronDown size={13} strokeWidth={2} className={`group-chevron${open ? "" : " is-collapsed"}`} />
        </button>
        {canCreate ? (
          <Popover
            side="bottom"
            align="end"
            className="menu group-menu"
            trigger={({ open: menuOpen, toggle }) => (
              <IconButton
                label="Criar estilo ou legenda"
                className={`group-add is-visible${menuOpen ? " is-open" : ""}`}
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Plus size={14} strokeWidth={1.75} />
              </IconButton>
            )}
          >
            {(close) => (
              <>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    close();
                    onNewStyle();
                  }}
                >
                  <span className="menu-item-icon">
                    <Sparkles size={14} strokeWidth={1.75} />
                  </span>
                  <span className="menu-item-text">
                    Novo estilo
                    <small>A partir de vídeos de referência</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    close();
                    onNewCaption();
                  }}
                >
                  <span className="menu-item-icon">
                    <Captions size={14} strokeWidth={1.75} />
                  </span>
                  <span className="menu-item-text">
                    Nova legenda
                    <small>Monte um preset no builder</small>
                  </span>
                </button>
              </>
            )}
          </Popover>
        ) : null}
      </div>
      {open ? (
        <ul className="thread-list">
          {styles.map((style) => (
            <li key={style.id}>
              <button
                type="button"
                className="thread-row style-row"
                onClick={() => {
                  leave();
                  onPick(style.id);
                }}
                onPointerEnter={(e) => enter(style, e.currentTarget)}
                onPointerLeave={leave}
                title={`Nova thread com ${style.name}`}
              >
                <StyleThumb style={style} />
                <span className="thread-title">{style.name}</span>
                {style.id === defaultStyleId ? <span className="thread-age">padrão</span> : null}
              </button>
            </li>
          ))}
          {drafts.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className={`thread-row style-row${thread.id === activeId ? " is-active" : ""}`}
                onClick={() => onSelectThread(thread.id)}
                title={thread.styleDraft?.publishedAt ? "Conversa de criação do estilo" : "Estilo em criação"}
              >
                <span className="style-thumb is-draft" aria-hidden="true">
                  {isThreadBusy(thread) ? (
                    <LoaderCircle size={13} strokeWidth={2.25} className="spin" />
                  ) : (
                    <Sparkles size={13} strokeWidth={1.75} />
                  )}
                </span>
                <span className="thread-title">{thread.title.replace(/^Estilo:\s*/, "")}</span>
                <span className="thread-age">{thread.styleDraft?.publishedAt ? "criação" : "rascunho"}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={`thread-row style-row studio-row${studioOpen ? " is-active" : ""}`}
              onClick={onOpenStudio}
            >
              <span className="style-thumb is-draft" aria-hidden="true">
                <LayoutGrid size={13} strokeWidth={1.75} />
              </span>
              <span className="thread-title">Ver estilos e criar</span>
            </button>
          </li>
        </ul>
      ) : null}
      {peek ? <StylePeek style={peek.style} rect={peek.rect} /> : null}
    </section>
  );
}

const PEEK_W = 200;
const PEEK_H = Math.round((PEEK_W * 16) / 9) + 34; // video + caption

/** Floating preview card beside the hovered row, kept inside the window. */
function StylePeek({ style, rect }: { style: StyleSummary; rect: DOMRect }) {
  const top = Math.max(10, Math.min(rect.top + rect.height / 2 - PEEK_H / 2, window.innerHeight - PEEK_H - 10));
  const left = Math.min(rect.right + 12, window.innerWidth - PEEK_W - 10);
  return createPortal(
    <div className="style-peek" style={{ top, left, width: PEEK_W }} role="tooltip">
      <video src={stylePreviewUrl(style)} poster={styleThumbUrl(style)} muted autoPlay loop playsInline />
      <span className="style-peek-name">{style.name}</span>
    </div>,
    document.body,
  );
}

/** Style chip of the new-thread tray: the gallery as videos, the pick goes to the thread. */
export function StylePicker({
  styles,
  value,
  onChange,
}: {
  styles: StyleSummary[];
  value: string;
  onChange: (styleId: string) => void;
}) {
  const current = styles.find((s) => s.id === value);
  return (
    <Popover
      side="bottom"
      align="start"
      className="menu style-menu"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={`chip${open ? " is-open" : ""}`}
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Estilo do vídeo"
          disabled={!styles.length}
        >
          <PaletteIcon size={13} strokeWidth={1.75} />
          <span>{current?.name ?? (value || "Sem estilo")}</span>
          <ChevronDown size={11} strokeWidth={2} className="chip-caret" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-label">Estilo do vídeo · passe o mouse para ver</div>
          <div className="style-pick-grid">
            {styles.map((style) => (
              <button
                key={style.id}
                type="button"
                aria-pressed={style.id === value}
                className={`style-pick${style.id === value ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(style.id);
                  close();
                }}
              >
                <span className="style-pick-video">
                  {style.hasPreview ? (
                    <video
                      src={stylePreviewUrl(style)}
                      poster={styleThumbUrl(style)}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onPointerEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
                      onPointerLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                  ) : (
                    <span className="style-thumb-initial">{style.name.slice(0, 1).toUpperCase()}</span>
                  )}
                  {style.id === value ? (
                    <span className="pv-card-check" aria-hidden="true">
                      <Check size={12} strokeWidth={2.5} />
                    </span>
                  ) : null}
                </span>
                <span className="style-pick-name">{style.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Popover>
  );
}
