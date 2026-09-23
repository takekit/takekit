import { useRef, type RefObject } from "react";

interface Props {
  label: string;
  /** Which edge of the panel the handle sits on. Dragging away from the panel grows it. */
  edge: "left" | "right";
  /** CSS custom property on `rootRef` that holds the width, e.g. "--sidebar-w". */
  cssVar: string;
  rootRef: RefObject<HTMLElement | null>;
  width: number;
  min: number;
  /** Evaluated at drag start, so it can depend on the window and the other panel. */
  max: () => number;
  defaultWidth: number;
  onCommit: (width: number) => void;
}

const KEY_STEP = 16;

/**
 * Vertical splitter. While dragging it writes the CSS variable straight to the
 * root element (no React re-render per frame) and commits once on release.
 */
export function ResizeHandle({
  label,
  edge,
  cssVar,
  rootRef,
  width,
  min,
  max,
  defaultWidth,
  onCommit,
}: Props) {
  const drag = useRef<{ startX: number; startWidth: number; max: number; last: number } | null>(null);
  const sign = edge === "right" ? 1 : -1;
  const clamp = (value: number, upper = max()) => Math.round(Math.min(Math.max(value, min), Math.max(min, upper)));

  function apply(value: number) {
    rootRef.current?.style.setProperty(cssVar, `${value}px`);
  }

  function end(e: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    e.currentTarget.classList.remove("is-dragging");
    document.body.classList.remove("is-resizing");
    onCommit(state.last);
  }

  return (
    <div
      className={`resize-handle is-${edge}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={Math.round(max())}
      tabIndex={0}
      title={`${label} (duplo clique volta ao padrão)`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add("is-dragging");
        // Rendered width, not state: CSS max-width may be capping the stored value.
        const start = Math.round(e.currentTarget.parentElement?.getBoundingClientRect().width ?? width);
        drag.current = { startX: e.clientX, startWidth: start, max: max(), last: start };
        document.body.classList.add("is-resizing");
      }}
      onPointerMove={(e) => {
        const state = drag.current;
        if (!state) return;
        state.last = clamp(state.startWidth + sign * (e.clientX - state.startX), state.max);
        apply(state.last);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onCommit(clamp(defaultWidth))}
      onKeyDown={(e) => {
        const step = e.shiftKey ? KEY_STEP * 3 : KEY_STEP;
        let next: number | null = null;
        if (e.key === "ArrowRight") next = width + sign * step;
        else if (e.key === "ArrowLeft") next = width - sign * step;
        else if (e.key === "Home") next = min;
        else if (e.key === "End") next = max();
        else if (e.key === "Enter") next = defaultWidth;
        if (next === null) return;
        e.preventDefault();
        onCommit(clamp(next));
      }}
    />
  );
}
