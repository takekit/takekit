import type { ExecutorInfo, ModelOption } from "../api/client";

export const EFFORT_LABEL: Record<string, string> = {
  minimal: "Mínimo",
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  xhigh: "Extra alto",
  max: "Máximo",
  ultra: "Ultra",
};

export function effortLabel(effort: string): string {
  return EFFORT_LABEL[effort] ?? effort;
}

/** Matches by id or CLI alias ("opus" -> claude-opus-5). */
export function findModel(executor: ExecutorInfo | undefined, modelId: string): ModelOption | undefined {
  return executor?.models?.find((m) => m.id === modelId || m.aliases?.includes(modelId));
}

export function modelLabel(executor: ExecutorInfo | undefined, modelId: string): string {
  return findModel(executor, modelId)?.label ?? modelId;
}

/** Effort to use for `model`: keep `preferred` when the model supports it. */
export function effortFor(model: ModelOption | undefined, preferred: string | undefined): string {
  const efforts = model?.efforts ?? [];
  if (!efforts.length) return "";
  if (preferred && efforts.includes(preferred)) return preferred;
  return model?.defaultEffort ?? "";
}

export interface HarnessPref {
  model: string;
  effort: string;
}

/** Stable key for favorites: "<executorId>::<modelId>". */
export const favKey = (executorId: string, modelId: string) => `${executorId}::${modelId}`;
