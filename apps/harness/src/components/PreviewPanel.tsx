import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Film, X } from "lucide-react";
import { getTimeline, isThreadBusy, previewUrl, threadInputs, type StepState, type Thread, type Timeline } from "../api/client";
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
  resizeHandle?: ReactNode;
  annotations: TimelineAnnotation[];
  onAnnotate?: (annotation: TimelineAnnotation) => void;
}

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
export function PreviewPanel({ thread, onClose, resizeHandle, annotations, onAnnotate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const timeline = useTimeline(thread);
  const version = thread ? (thread.previewUpdatedAt ?? thread.updatedAt) : null;
  const src = thread?.previewPath ? previewUrl(thread.id, version) : null;
  // Coarse stages, with the pipeline steps the last job ran nested under "edit".
  const stages = Object.entries(thread?.stageStatus ?? {}).flatMap(([name, state]) =>
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
                ? "O mp4 exportado aparece aqui quando o job terminar."
                : "Escolha uma thread para ver o export."}
            </small>
          </div>
        )}

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

        {stages.length ? (
          <section className="panel-section">
            <h3>Pipeline</h3>
            <StageList stages={stages} />
          </section>
        ) : null}

        {thread ? (
          <section className="panel-section">
            <h3>Detalhes</h3>
            <dl className="props">
              <Prop label="Projeto" value={thread.projectPath} copy />
              {threadInputs(thread).map((path, i, all) => (
                <Prop key={path} label={all.length > 1 ? `Entrada ${i + 1}` : "Entrada"} value={path} copy />
              ))}
              <Prop label="Estilo" value={thread.styleId} />
              {thread.previewPath ? <Prop label="Export" value={thread.previewPath} copy /> : null}
              {thread.lastJobId ? (
                <Prop
                  label="Último job"
                  value={`${shortId(thread.lastJobId)} · ${thread.lastJobStatus ?? "?"}`}
                />
              ) : null}
            </dl>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

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
