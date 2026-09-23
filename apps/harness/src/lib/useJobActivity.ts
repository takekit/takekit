import { useEffect, useRef, useState } from "react";
import { getActivity, type ActivityItem, type ActivityPage, type JobMode } from "../api/client";

const POLL_MS = 1000;

export interface JobActivity {
  items: ActivityItem[];
  mode: JobMode | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** When the feed last changed (for "Pensando · 12s"). */
  lastChange: number;
  loaded: boolean;
}

/**
 * Live feed of a job: polls only the rows changed since the last seq, once a
 * second while the job runs, and fetches once more when it settles.
 */
export function useJobActivity(jobId: string, live: boolean, enabled: boolean): JobActivity {
  const [state, setState] = useState<JobActivity>({
    items: [],
    mode: null,
    startedAt: null,
    finishedAt: null,
    lastChange: Date.now(),
    loaded: false,
  });
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const apply = (page: ActivityPage) =>
      setState((prev) => {
        if (!page.items.length && prev.loaded && prev.finishedAt === page.finishedAt && prev.mode === page.mode) return prev;
        const byId = new Map(prev.items.map((it) => [it.id, it] as const));
        const order = prev.items.map((it) => it.id);
        for (const it of page.items) {
          if (!byId.has(it.id)) order.push(it.id);
          byId.set(it.id, it);
        }
        return {
          items: order.map((id) => byId.get(id)!),
          mode: page.mode,
          startedAt: page.startedAt,
          finishedAt: page.finishedAt,
          lastChange: page.items.length ? Date.now() : prev.lastChange,
          loaded: true,
        };
      });

    const tick = async () => {
      try {
        const page = await getActivity(jobId, seq.current);
        if (stopped) return;
        seq.current = page.seq;
        apply(page);
      } catch {
        /* engine hiccup: the next tick retries */
      }
      if (!stopped && live) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, live, enabled]);

  return state;
}
