import { useCallback, useEffect, useRef, useState } from "react";
import { getRender, type RenderState, type RenderTask, type Thread } from "../api/client";

const POLL_MS = 700;

/**
 * Engine renders (Exportar, preview re-render) of every thread, polled while they run.
 * Lives in App so a finished export still announces itself after switching threads.
 */
export function useRenders(
  threads: Thread[],
  engineOnline: boolean,
  onSettled: (task: RenderTask) => void,
) {
  const [states, setStates] = useState<Record<string, RenderState>>({});
  // Started from this window before the thread list shows it running.
  const [started, setStarted] = useState<string[]>([]);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const runningRef = useRef<Record<string, RenderTask>>({});

  const ids = [
    ...new Set([
      ...threads
        .filter((t) => t.lastExport?.status === "running" || t.lastRender?.status === "running")
        .map((t) => t.id),
      ...started,
    ]),
  ]
    .sort()
    .join(",");

  useEffect(() => {
    if (!engineOnline || !ids) return;
    const list = ids.split(",");
    let cancelled = false;
    const tick = () => {
      for (const id of list) {
        getRender(id)
          .then((state) => {
            if (cancelled) return;
            setStates((prev) => ({ ...prev, [id]: state }));
            const was = runningRef.current[id];
            if (state.running) runningRef.current[id] = state.running;
            else {
              delete runningRef.current[id];
              setStarted((prev) => prev.filter((x) => x !== id));
              const last = was?.kind === "export" ? state.lastExport : was ? state.lastRender : null;
              if (was && last && last.id === was.id) settledRef.current(last);
            }
          })
          .catch(() => undefined);
      }
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ids, engineOnline]);

  /** A render the UI just started: poll it right away. */
  const begin = useCallback((task: RenderTask) => {
    runningRef.current[task.threadId] = task;
    setStates((prev) => ({
      ...prev,
      [task.threadId]: { ...(prev[task.threadId] ?? { lastExport: null, lastRender: null }), running: task },
    }));
    setStarted((prev) => (prev.includes(task.threadId) ? prev : [...prev, task.threadId]));
  }, []);

  return { states, begin };
}
