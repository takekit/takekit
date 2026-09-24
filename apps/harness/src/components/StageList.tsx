import { Circle, CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { stepLabel } from "../lib/pipeline";

type StageState = "pending" | "running" | "done" | "failed";

const STAGE_LABELS: Record<string, string> = {
  ingest: "Ingestão",
  edit: "Edição",
  preview: "Preview",
  export: "Export final",
};

const STATE_LABELS: Record<StageState, string> = {
  pending: "pendente",
  running: "rodando",
  done: "ok",
  failed: "falhou",
};

/** `sub` = a pipeline step inside the stage above it (e.g. Trim under Edição). */
export function StageList({
  stages,
  compact,
}: {
  stages: Array<[string, StageState] | [string, StageState, "sub"]>;
  compact?: boolean;
}) {
  return (
    <ol className={`stages${compact ? " is-compact" : ""}`}>
      {stages.map(([name, state, sub]) => (
        <li key={name} className={`stage is-${state}${sub ? " is-sub" : ""}`}>
          <StageIcon state={state} />
          <span className="stage-name">{STAGE_LABELS[name] ?? stepLabel(name)}</span>
          <span className="stage-state">{STATE_LABELS[state] ?? state}</span>
        </li>
      ))}
    </ol>
  );
}

function StageIcon({ state }: { state: StageState }) {
  const props = { size: 14, strokeWidth: 2, className: "stage-icon" };
  switch (state) {
    case "running":
      return <LoaderCircle {...props} className="stage-icon spin" />;
    case "done":
      return <CircleCheck {...props} />;
    case "failed":
      return <CircleX {...props} />;
    default:
      return <Circle {...props} />;
  }
}
