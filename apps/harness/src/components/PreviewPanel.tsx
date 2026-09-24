import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Film, RefreshCw, X } from "lucide-react";
import {
  getTimeline,
  isThreadBusy,
  previewUrl,
  threadInputs,
  type ModuleKey,
  type ModuleSelection,
  type RenderState,
  type StepState,
  type StyleSummary,
  type Thread,
  type Timeline,
} from "../api/client";
import { usePresets } from "../lib/usePresets";
import { ExportBar } from "./ExportBar";
import { ThreadPresets } from "./Presets";
import type { TimelineAnnotation } from "../lib/annotations";
import { basename, shortId, tildify, timestamp } from "../lib/format";
import { useCopy } from "../lib/hooks";
import { StageList } from "./StageList";
import { TimelineView } from "./TimelineView";
import { VideoPlayer } from "./VideoPlayer";
import { IconButton } from "./ui";

interface Props {
  thread: Thread | null;
  onClose: () => void;
  /** Display name of the thread's style. */
  styleName: string;
  /** The thread's style (its presets and export quality). */
  style: StyleSummary | null;
  resizeHandle?: ReactNode;
  annotations: TimelineAnnotation[];
  onAnnotate?: (annotation: TimelineAnnotation) => void;
  render: RenderState | undefined;
  engineOnline: boolean;
  onExport: () => void;
  onCancelRender: () => void;
  onRevealExport: () => void;
  onSettle: () => void;
  onChangeModules: (patch: ModuleSelection) => Promise<boolean>;
  /** Redraw the preview; `captions` = the caption layers changed too. */
  onRerender: (captions: boolean) => void;
  onCreateCaption: () => void;
}

/** Modules the engine can redraw on its own; the others need the agent's next edit. */
const REDRAWABLE: ModuleKey[] = ["caption", "camera", "transitions", "soundEffects"];

/** Edit timeline for the thread's project; refetched when a job settles or the export changes. */
function useTimeline(thread: Thread | null): Timeline | null {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const id = thread?.id;
  const version = `${thread?.previewUpdatedAt ?? ""}:${thread?.lastJobStatus ?? ""}`;

  useEffect(() => {
    setTimeline(null);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getTimeline(id)
      .then((res) => !cancelled && setTimeline(res.timeline))
      .catch(() => !cancelled && setTimeline(null));
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  return timeline;
}

/** Program monitor + read-only timeline of the latest export, plus pipeline state. */
export function PreviewPanel({
  thread,
  onClose,
  styleName,
  style,
  resizeHandle,
  annotations,
  onAnnotate,
  render,
  engineOnline,
  onExport,
  onCancelRender,
  onRevealExport,
  onSettle,
  onChangeModules,
  onRerender,
  onCreateCaption,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const library = usePresets(thread?.styleId ?? "", engineOnline && Boolean(thread));
  // Presets swapped since the preview was last drawn, per thread (this window only).
  const [changed, setChanged] = useState<Record<string, ModuleKey[]>>({});
  const pending = thread ? (changed[thread.id] ?? []) : [];
  const previewRender = render?.running?.kind === "preview" ? render.running : null;
  const renderStarted = render?.lastRender?.startedAt ?? "";
  useEffect(() => {
    // A new preview (agent or re-render) has every swap in it.
    if (thread) setChanged((prev) => (prev[thread.id]?.length ? { ...prev, [thread.id]: [] } : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, thread?.previewUpdatedAt, renderStarted]);
  const [duration, setDuration] = useState(0);
  const timeline = useTimeline(thread);
  const version = thread ? (thread.previewUpdatedAt ?? thread.updatedAt) : null;
  const src = thread?.previewPath ? previewUrl(thread.id, version) : null;
  // Coarse stages, with the pipeline steps the last job ran nested under "edit".
  const stages = Object.entries(thread?.stageStatus ?? {})
    .sort(([a], [b]) => stageOrder(a) - stageOrder(b))
    .flatMap(([name, state]) =>
    name === "edit"
      ? [[name, state] as [string, StepState], ...Object.entries(thread?.pipeline ?? {}).map(([k, v]) => [k, v, "sub"] as [string, StepState, "sub"])]
      : [[name, state] as [string, StepState]],
  );
  // Only a job the agent turned into an edit means a new export is on its way.
  const busy = isThreadBusy(thread) && thread?.lastJobMode === "edit";
  const fps = timeline?.fps ?? 30;

  useEffect(() => setDuration(0), [src]);

  return (
    <aside className="panel" aria-label="Preview">
      {resizeHandle}
      <header className="panel-head drag" data-tauri-drag-region>
        <span className="panel-title" data-tauri-drag-region>
          Preview
        </span>
        <IconButton label="Fechar preview" shortcut="⌥⌘B" onClick={onClose}>
          <X size={15} strokeWidth={1.75} />
        </IconButton>
      </header>

      <div className="panel-body">
        {src && thread ? (
          <div className="monitor">
            <VideoPlayer key={src} src={src} videoRef={videoRef} fps={fps} onDuration={setDuration} />
            <p className="player-caption" title={thread.previewPath ?? undefined}>
              {basename(thread.previewPath)}
              {thread.previewUpdatedAt ? <span> · {timestamp(thread.previewUpdatedAt)}</span> : null}
            </p>
          </div>
        ) : (
          <div className="player-empty">
            <Film size={22} strokeWidth={1.25} />
            <p>{busy ? "Renderizando…" : "Sem preview ainda"}</p>
            <small>
              {thread
                ? "O preview aparece aqui quando o agente terminar a edição."
                : "Escolha uma thread para ver o export."}
            </small>
          </div>
        )}

        {thread ? (
          <ExportBar
            thread={thread}
            render={render}
            quality={style?.exportQuality ?? null}
            onExport={onExport}
            onCancel={onCancelRender}
            onReveal={onRevealExport}
            onSettle={onSettle}
          />
        ) : null}

        {thread ? (
          <TimelineView
            timeline={timeline}
            src={src}
            videoRef={videoRef}
            duration={duration}
            fps={fps}
            annotations={annotations}
            onAnnotate={onAnnotate}
          />
        ) : null}

        {thread ? (
          <ThreadPresets
            styleModules={style?.modules ?? null}
            override={thread.modules}
            library={library}
            disabled={!engineOnline}
            background={`thread:${thread.id}`}
            styleId={thread.styleId}
            onChange={(patch) => {
              void onChangeModules(patch).then((ok) => {
                if (!ok) return;
                const keys = Object.keys(patch) as ModuleKey[];
                setChanged((prev) => ({ ...prev, [thread.id]: [...new Set([...(prev[thread.id] ?? []), ...keys])] }));
              });
            }}
            onCreateCaption={onCreateCaption}
            apply={
              previewRender ? (
                <div className="presets-apply is-running">
                  <span className="presets-apply-bar" style={{ transform: `scaleX(${Math.max(0.03, previewRender.progress)})` }} />
                  <span className="presets-apply-text">
                    {previewRender.phase} · {Math.round(previewRender.progress * 100)}%
                  </span>
                  <button type="button" className="icon-btn" aria-label="Cancelar" title="Cancelar" onClick={onCancelRender}>
                    <X size={13} strokeWidth={2} />
                  </button>
                </div>
              ) : pending.some((k) => REDRAWABLE.includes(k)) && thread.previewPath ? (
                <div className="presets-apply">
                  <span className="presets-apply-text">O preview ainda mostra os presets anteriores.</span>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={isThreadBusy(thread) || Boolean(render?.running)}
                    onClick={() => onRerender(pending.includes("caption"))}
                  >
                    <RefreshCw size={12} strokeWidth={2} />
                    Aplicar no preview
                  </button>
                </div>
              ) : pending.some((k) => !REDRAWABLE.includes(k)) ? (
                <p className="panel-note">Palcos e cortes valem a partir da próxima edição do agente.</p>
              ) : render?.lastRender?.status === "failed" ? (
                <p className="export-error">{render.lastRender.error ?? "O preview falhou."}</p>
              ) : null
            }
          />
        ) : null}

        {thread ? (
          <details className="panel-section panel-tech">
            <summary>Detalhes técnicos</summary>
            {stages.length ? (
              <>
                <h3>Pipeline</h3>
                <StageList stages={stages} />
              </>
            ) : null}
            <h3>Arquivos</h3>
            <dl className="props">
              <Prop label="Projeto" value={thread.projectPath} copy />
              {threadInputs(thread).map((path, i, all) => (
                <Prop key={path} label={all.length > 1 ? `Entrada ${i + 1}` : "Entrada"} value={path} copy />
              ))}
              <Prop label="Estilo" value={styleName} />
              {thread.previewPath ? <Prop label="Preview" value={thread.previewPath} copy /> : null}
              {thread.lastExport?.status === "succeeded" && thread.lastExport.path ? (
                <Prop label="Export" value={thread.lastExport.path} copy />
              ) : null}
              {thread.lastJobId ? (
                <Prop
                  label="Último job"
                  value={`${shortId(thread.lastJobId)} · ${thread.lastJobStatus ?? "?"}`}
                />
              ) : null}
            </dl>
          </details>
        ) : null}
      </div>
    </aside>
  );
}

const STAGE_ORDER = ["ingest", "edit", "preview", "export"];
const stageOrder = (name: string) => (STAGE_ORDER.includes(name) ? STAGE_ORDER.indexOf(name) : STAGE_ORDER.length);

function Prop({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  const clip = useCopy();
  return (
    <div className="prop">
      <dt>{label}</dt>
      <dd title={value}>
        <span className="prop-value">{copy ? tildify(value) : value}</span>
        {copy ? (
          <button
            type="button"
            className="meta-btn"
            onClick={() => void clip.copy(value)}
            aria-label={`Copiar ${label}`}
            title="Copiar"
          >
            {clip.copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
          </button>
        ) : null}
      </dd>
    </div>
  );
}
