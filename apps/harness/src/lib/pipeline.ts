/** Pipeline steps in run order (mirror of engine/src/activity.ts PIPELINE_STEPS). */
export const PIPELINE_STEPS: Array<{ key: string; label: string }> = [
  { key: "transcribe", label: "Transcrição" },
  { key: "cuts", label: "Cortes" },
  { key: "trim", label: "Trim" },
  { key: "sfx", label: "SFX" },
  { key: "captions", label: "Legendas" },
  { key: "motion", label: "Motion" },
  { key: "palco_b", label: "Palco B" },
  { key: "compose", label: "Preview" },
  { key: "review", label: "Revisão" },
];

export const stepLabel = (key: string) => PIPELINE_STEPS.find((s) => s.key === key)?.label ?? key;
