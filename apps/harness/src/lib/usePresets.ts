import { useEffect, useState } from "react";
import { listPresets, type PresetLibrary } from "../api/client";

// One fetch per style (library + that style's own presets), shared by every picker.
const cache = new Map<string, Promise<PresetLibrary>>();
const listeners = new Set<() => void>();

function load(styleId: string): Promise<PresetLibrary> {
  let pending = cache.get(styleId);
  if (!pending) {
    pending = listPresets(styleId || undefined).then((res) => res.presets);
    pending.catch(() => cache.delete(styleId));
    cache.set(styleId, pending);
  }
  return pending;
}

/** Drop the cached lists (a preset was saved) and refetch in every mounted picker. */
export function invalidatePresets(): void {
  cache.clear();
  for (const fn of listeners) fn();
}

/** Presets of every module for a style; null while loading or offline. */
export function usePresets(styleId: string, enabled = true): PresetLibrary | null {
  const [library, setLibrary] = useState<PresetLibrary | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load(styleId)
      .then((lib) => !cancelled && setLibrary(lib))
      .catch(() => !cancelled && setLibrary(null));
    return () => {
      cancelled = true;
    };
  }, [styleId, enabled, version]);

  return library;
}
