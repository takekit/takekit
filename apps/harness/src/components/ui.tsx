import { useCallback, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "../lib/hooks";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  children: ReactNode;
}

/** Square ghost button; `label` doubles as tooltip and accessible name. */
export function IconButton({ label, shortcut, pressed, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn${className ? ` ${className}` : ""}`}
      aria-label={label}
      aria-pressed={pressed}
      title={shortcut ? `${label}  ${shortcut}` : label}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

interface PopoverProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  /** Preferred side; flips (or shrinks) to whatever fits in the window. */
  side?: "top" | "bottom";
  align?: "start" | "end";
  className?: string;
  /** Selector of an ancestor the panel must not cover (opens past its edge instead). */
  clear?: string;
}

const EDGE = 10; // min distance from the window edge
const GAP = 8; // between the panel and what it opens from
const MIN_H = 220; // below this, shrinking to one side is worse than floating over the anchor

/**
 * Menu panel rendered at the window level (portal + fixed), so it sits in front
 * of everything and is bounded by the window, not by the thread column. Opens on
 * `side` when it fits, else on the other side, else on the roomier side with a
 * shorter scrolling panel, else floats centered on the anchor inside the window.
 */
export function Popover({ trigger, children, side = "bottom", align = "start", className, clear }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState(side);
  const close = useCallback(() => setOpen(false), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const ref = useDismiss<HTMLDivElement>(open, close, panelRef);

  useLayoutEffect(() => {
    const anchor = ref.current;
    const panel = panelRef.current;
    if (!open || !anchor || !panel) return;
    const place = () => setPlaced(placePanel(anchor, panel, side, align, clear));
    place();
    // Reposition when the window or anything around the anchor scrolls (not the menu's own list).
    const onScroll = (e: Event) => {
      if (!panel.contains(e.target as Node)) place();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, side, align, clear, ref]);

  return (
    <div className="popover-anchor" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className={`popover popover-${placed}${className ? ` ${className}` : ""}`}
              role="dialog"
            >
              {children(close)}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function placePanel(
  anchor: HTMLElement,
  panel: HTMLElement,
  side: "top" | "bottom",
  align: "start" | "end",
  clear?: string,
): "top" | "bottom" {
  const a = anchor.getBoundingClientRect();
  const avoid = clear ? anchor.closest(clear)?.getBoundingClientRect() : undefined;
  const top = Math.min(a.top, avoid?.top ?? a.top);
  const bottom = Math.max(a.bottom, avoid?.bottom ?? a.bottom);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Natural size, capped only by the window.
  panel.style.setProperty("--popover-max-h", `${vh - EDGE * 2}px`);
  const h = panel.offsetHeight;
  const w = panel.offsetWidth;
  const room = { top: top - GAP - EDGE, bottom: vh - bottom - GAP - EDGE };
  const other = side === "top" ? "bottom" : "top";

  let placed: "top" | "bottom" | null;
  let height = h;
  if (room[side] >= h) placed = side;
  else if (room[other] >= h) placed = other;
  else {
    const roomier = room[side] >= room[other] ? side : other;
    placed = room[roomier] >= MIN_H ? roomier : null;
    if (placed) height = room[placed];
  }
  if (height !== h) panel.style.setProperty("--popover-max-h", `${height}px`);

  const y =
    placed === "top"
      ? top - GAP - height
      : placed === "bottom"
        ? bottom + GAP
        : clamp(a.top + a.height / 2 - height / 2, EDGE, vh - EDGE - height);
  const x = clamp(align === "end" ? a.right - w : a.left, EDGE, vw - EDGE - w);
  panel.style.left = `${Math.round(x)}px`;
  panel.style.top = `${Math.round(y)}px`;
  return placed ?? side;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
