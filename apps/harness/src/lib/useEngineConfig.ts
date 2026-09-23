import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getConfig,
  putConfig,
  type ConfigResponse,
  type EngineConfig,
  type ExecutorInfo,
} from "../api/client";

export interface EngineConfigState {
  data: ConfigResponse | null;
  executors: ExecutorInfo[];
  locked: Set<keyof EngineConfig>;
  saving: boolean;
  update: (patch: Partial<EngineConfig>) => Promise<void>;
}

/** Loads ~/.takekit/config.json via the engine; env-forced fields are never written. */
export function useEngineConfig(
  enabled: boolean,
  onError: (message: string) => void,
): EngineConfigState {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    let cancelled = false;
    getConfig()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => onError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [enabled, onError]);

  const locked = useMemo(() => new Set(data?.envOverrides ?? []), [data]);

  const executors = useMemo<ExecutorInfo[]>(
    () => data?.executors ?? (data?.executorIds ?? []).map((id) => ({ id, label: id })),
    [data],
  );

  const update = useCallback(
    async (patch: Partial<EngineConfig>) => {
      const allowed = Object.fromEntries(
        Object.entries(patch).filter(([key]) => !locked.has(key as keyof EngineConfig)),
      ) as Partial<EngineConfig>;
      if (!Object.keys(allowed).length) return;
      setSaving(true);
      try {
        setData(await putConfig(allowed));
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [locked, onError],
  );

  return { data, executors, locked, saving, update };
}

/** "Codex (stub)" -> { name: "Codex", stub: true } */
export function executorDisplay(executor: ExecutorInfo | undefined, fallbackId: string) {
  const label = executor?.label ?? fallbackId;
  const stub = /\(stub\)/i.test(label);
  return { name: label.replace(/\s*\(stub\)\s*/i, "").trim() || fallbackId, stub };
}
