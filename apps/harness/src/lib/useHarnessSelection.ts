import { usePersistentState } from "./hooks";
import { effortFor, findModel, type HarnessPref } from "./harness";
import type { EngineConfigState } from "./useEngineConfig";

/**
 * Switching harness/model/effort as one engine write. Remembers the last
 * model + effort per harness so flipping back restores it.
 */
export function useHarnessSelection(engine: EngineConfigState) {
  const [prefs, setPrefs] = usePersistentState<Record<string, HarnessPref>>("takekit.harnessPrefs", {});
  const config = engine.data?.config;

  function remember(executorId: string, pref: HarnessPref) {
    setPrefs((prev) => ({ ...prev, [executorId]: pref }));
  }

  function selectModel(executorId: string, modelId: string) {
    const executor = engine.executors.find((e) => e.id === executorId);
    const preferred = executorId === config?.executorId ? config.effort : prefs[executorId]?.effort;
    const effort = effortFor(findModel(executor, modelId), preferred);
    remember(executorId, { model: modelId, effort });
    void engine.update({ executorId, model: modelId, effort });
  }

  function selectHarness(executorId: string) {
    if (executorId === config?.executorId) return;
    const executor = engine.executors.find((e) => e.id === executorId);
    const modelId = prefs[executorId]?.model || executor?.defaultModel || executor?.models?.[0]?.id || "";
    selectModel(executorId, modelId);
  }

  function selectEffort(effort: string) {
    if (!config) return;
    remember(config.executorId, { model: config.model, effort });
    void engine.update({ effort });
  }

  return { selectModel, selectHarness, selectEffort };
}
