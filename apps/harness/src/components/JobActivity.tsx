import { useLayoutEffect, useMemo, useState, type ComponentType } from "react";
import {
  Bot,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  FilePenLine,
  FileText,
  Globe,
  ListChecks,
  LoaderCircle,
  Search,
  Square,
  SquareTerminal,
  Wrench,
  type LucideProps,
} from "lucide-react";
import { cancelJob, type ActivityItem, type ActivityKind, type JobStatus, type StepState } from "../api/client";
import { elapsed } from "../lib/format";
import { useNow } from "../lib/hooks";
import { useJobActivity } from "../lib/useJobActivity";
import { PIPELINE_STEPS } from "../lib/pipeline";
import { RichText } from "./RichText";

type RowStatus = JobStatus | "unknown";

const KIND_ICON: Record<ActivityKind, ComponentType<LucideProps>> = {
  message: Bot,
  command: SquareTerminal,
  read: FileText,
  edit: FilePenLine,
  search: Search,
  web: Globe,
  agent: Bot,
  plan: ListChecks,
  tool: Wrench,
  error: CircleAlert,
};

/** Rows shown before "show earlier" (the feed of a long run can have hundreds). */
const VISIBLE = 60;

/**
 * One agent run in the chat: header (status, time, stop), then, while it runs,
 * the pipeline steps it reached, its plan, and every tool call as it happens.
 */
export function JobBlock({
  jobId,
  executor,
  status,
  since,
  onGrow,
}: {
  jobId: string;
  executor: string;
  status: RowStatus;
  since: string;
  /** Called when the feed grows, so the chat can keep following the bottom. */
  onGrow: () => void;
}) {
  const live = status === "queued" || status === "running";
  const [open, setOpen] = useState<boolean | null>(null); // null = follow the job (open while live)
  const expanded = open ?? live;
  // Finished jobs fetch once (for duration and step count); live ones poll.
  const activity = useJobActivity(jobId, live, true);
  const now = useNow(1000, live);
  const [stopping, setStopping] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { rows, plan, steps, tools } = useMemo(() => {
    const plan = activity.items.find((it) => it.kind === "plan");
    let rows = activity.items.filter((it) => it.kind !== "plan");
    // The final answer is posted as the chat message right below; don't repeat it.
    if (!live && rows.at(-1)?.kind === "message") rows = rows.slice(0, -1);
    return { rows, plan, steps: pipelineOf(activity.items), tools: rows.filter((r) => r.kind !== "message").length };
  }, [activity.items, live]);

  useLayoutEffect(() => {
    if (expanded) onGrow();
  }, [expanded, activity.items, onGrow]);

  const started = activity.startedAt ?? since;
  const took = activity.finishedAt ? elapsed(started, new Date(activity.finishedAt).getTime()) : null;
  const passos = tools ? ` · ${tools} ${tools === 1 ? "passo" : "passos"}` : "";
  // The agent decides: answering a question ("chat") or changing the video ("edit").
  const mode = activity.mode;
  const label =
    status === "queued"
      ? `Na fila · ${executor}`
      : status === "running"
        ? `${executor} ${mode === "edit" ? "editando" : "trabalhando"}`
        : status === "failed"
          ? `Falhou${took ? ` após ${took}` : ""} · ${executor}${passos}`
          : status === "succeeded"
            ? `${mode === "chat" ? "Respondido" : "Concluído"}${took ? ` em ${took}` : ""} · ${executor}${passos}`
            : `Job · ${executor}`;

  const running = rows.filter((r) => r.status === "running");
  const hidden = showAll ? 0 : Math.max(0, rows.length - VISIBLE);

  return (
    <div className={`activity job is-${status}`}>
      <div className="job-head">
        <button type="button" className="activity-toggle" onClick={() => setOpen(!expanded)} aria-expanded={expanded}>
          <StatusIcon status={status} />
          <span className={live ? "breathe" : undefined}>{label}</span>
          {live ? <span className="activity-time">{elapsed(started, now)}</span> : null}
          <ChevronRight size={13} strokeWidth={2} className={`activity-chevron${expanded ? " is-open" : ""}`} />
        </button>
        {live ? (
          <button
            type="button"
            className="btn is-ghost btn-small job-stop"
            disabled={stopping}
            onClick={() => {
              setStopping(true);
              cancelJob(jobId).catch(() => setStopping(false));
            }}
            title="Interrompe o agente (o que já foi gerado fica no projeto)"
          >
            <Square size={10} strokeWidth={0} fill="currentColor" />
            {stopping ? "Parando…" : "Parar"}
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="job-body">
          {steps.length ? <PipelineStrip steps={steps} now={now} /> : null}
          {plan?.plan?.length ? <PlanCard entries={plan.plan} /> : null}

          {activity.loaded && !rows.length && !live ? <p className="feed-empty">Sem registro de atividade.</p> : null}
          {hidden ? (
            <button type="button" className="feed-more" onClick={() => setShowAll(true)}>
              Mostrar {hidden} {hidden === 1 ? "passo anterior" : "passos anteriores"}
            </button>
          ) : null}
          <ol className="feed">
            {rows.slice(hidden).map((item) => (
              <ActivityRow key={item.id} item={item} now={now} />
            ))}
          </ol>

          {live && !running.length ? (
            <div className="feed-thinking">
              <LoaderCircle size={13} strokeWidth={2} className="spin" />
              <span className="breathe">{status === "queued" ? "Iniciando" : "Pensando"}</span>
              <span className="activity-time">{elapsed(new Date(activity.lastChange).toISOString(), now)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActivityRow({ item, now }: { item: ActivityItem; now: number }) {
  const [open, setOpen] = useState(false);

  if (item.kind === "message") {
    return (
      <li className={`feed-msg${open ? " is-open" : ""}`} onClick={() => setOpen((v) => !v)}>
        <RichText text={item.title} />
      </li>
    );
  }

  const Icon = KIND_ICON[item.kind] ?? Wrench;
  const running = item.status === "running";
  const failed = item.status === "failed";
  const detail = item.detail && item.detail !== item.title ? item.detail : "";
  const expandable = Boolean(item.output?.trim() || detail);
  const took = running ? elapsed(item.startedAt, now) : spent(item);

  return (
    <li className={`feed-row is-${item.status ?? "done"} kind-${item.kind}${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="feed-head"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
      >
        <span className="feed-icon">
          {running ? (
            <LoaderCircle size={14} strokeWidth={2} className="spin" />
          ) : failed ? (
            <CircleX size={14} strokeWidth={2} />
          ) : (
            <Icon size={14} strokeWidth={1.75} />
          )}
        </span>
        <span className="feed-title">{item.title}</span>
        {detail && item.kind === "command" ? <code className="feed-detail">{detail}</code> : null}
        {took ? <span className="feed-time">{took}</span> : null}
      </button>
      {open ? (
        <div className="feed-body">
          {detail ? <code className="feed-cmd">{item.kind === "command" ? `$ ${detail}` : detail}</code> : null}
          {item.output?.trim() ? <pre className="feed-output">{item.output.trim()}</pre> : null}
        </div>
      ) : null}
    </li>
  );
}

function PipelineStrip({ steps, now }: { steps: PipelineStepView[]; now: number }) {
  return (
    <ol className="pipe" aria-label="Etapas do pipeline">
      {steps.map((s, i) => (
        <li key={s.key} className={`pipe-step is-${s.state}`}>
          {i ? <ChevronRight size={12} strokeWidth={2} className="pipe-sep" aria-hidden="true" /> : null}
          <StepIcon state={s.state} />
          <span>{s.label}</span>
          {s.state === "running" && s.since ? <span className="pipe-time">{elapsed(s.since, now)}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function PlanCard({ entries }: { entries: NonNullable<ActivityItem["plan"]> }) {
  const done = entries.filter((e) => e.status === "done").length;
  return (
    <div className="plan">
      <div className="plan-head">
        <ListChecks size={13} strokeWidth={1.75} />
        <span>Plano</span>
        <span className="plan-count">
          {done}/{entries.length}
        </span>
      </div>
      <ol className="plan-list">
        {entries.map((e, i) => (
          <li key={i} className={`plan-item is-${e.status}`}>
            {e.status === "done" ? (
              <CircleCheck size={13} strokeWidth={2} />
            ) : e.status === "active" ? (
              <LoaderCircle size={13} strokeWidth={2} className="spin" />
            ) : (
              <Circle size={13} strokeWidth={1.75} />
            )}
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface PipelineStepView {
  key: string;
  label: string;
  state: StepState;
  since?: string;
}

/** Latest state of each pipeline step the run touched, in pipeline order. */
function pipelineOf(items: ActivityItem[]): PipelineStepView[] {
  const last = new Map<string, ActivityItem>();
  for (const it of items) if (it.kind === "command" && it.step) last.set(it.step, it);
  return PIPELINE_STEPS.filter((s) => last.has(s.key)).map((s) => {
    const it = last.get(s.key)!;
    const state: StepState = it.status === "running" ? "running" : it.status === "failed" ? "failed" : "done";
    return { key: s.key, label: s.label, state, since: it.startedAt };
  });
}

function spent(item: ActivityItem): string {
  if (!item.endedAt) return "";
  const s = (new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()) / 1000;
  return s >= 1 ? elapsed(item.startedAt, new Date(item.endedAt).getTime()) : "";
}

function StepIcon({ state }: { state: StepState }) {
  const props = { size: 13, strokeWidth: 2 };
  if (state === "running") return <LoaderCircle {...props} className="spin" />;
  if (state === "done") return <CircleCheck {...props} />;
  if (state === "failed") return <CircleX {...props} />;
  return <Circle {...props} />;
}

function StatusIcon({ status }: { status: RowStatus }) {
  const props = { size: 14, strokeWidth: 2, className: "activity-icon" };
  switch (status) {
    case "queued":
    case "running":
      return <LoaderCircle {...props} className="activity-icon spin" />;
    case "succeeded":
      return <CircleCheck {...props} />;
    case "failed":
      return <CircleX {...props} />;
    default:
      return <CircleDashed {...props} />;
  }
}
