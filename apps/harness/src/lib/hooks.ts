import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** UI preference that survives reloads. Storage can be missing or blocked; never throws. */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / blocked storage */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Re-render every `ms` so relative times and timers stay fresh. */
export function useNow(ms: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms, enabled]);
  return now;
}

/** Close-on-outside-click + Escape for popovers. */
export function useDismiss<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  /** Also "inside": e.g. a panel portaled out of the anchor. */
  also?: RefObject<HTMLElement | null>,
) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (!ref.current || ref.current.contains(target) || also?.current?.contains(target)) return;
      close.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return ref;
}

export function useCopy(resetMs = 1400) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), resetMs);
      } catch {
        /* clipboard unavailable */
      }
    },
    [resetMs],
  );
  return { copied, copy };
}
