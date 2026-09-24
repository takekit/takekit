import { Check, CircleAlert, Download, FolderSearch, X } from "lucide-react";
import { exportFileUrl, isThreadBusy, qualityLabel, type Quality, type RenderState, type Thread } from "../api/client";
import { basename, relativeTime } from "../lib/format";
import { useNow } from "../lib/hooks";
import { IS_TAURI } from "../lib/platform";
import { IconButton } from "./ui";

/**
 * Exportar vídeo final (docs/preview-export/SPEC-BUTTON.md): the creator's action, next to
 * the preview. Runs the final render of the last preview's spec on the engine, no agent.
 * Disabled without a preview, while the agent edits or while the preview re-renders.
 */
export function ExportBar({
  thread,
  render,
  quality,
  onExport,
  onCancel,
  onReveal,
  onSettle,
}: {
  thread: Thread;
  render: RenderState | undefined;
  quality: Quality | null;
  onExport: () => void;
  onCancel: () => void;
  onReveal: () => void;
  /** "Concluir thread": the video is out, take the thread off the list. */
  onSettle?: () => void;
}) {
  const now = useNow(30_000);
  const running = render?.running ?? null;
  const exporting = running?.kind === "export" ? running : null;
  const last = render?.lastExport ?? thread.lastExport ?? null;
  const reason = !thread.previewPath
    ? "Gere um preview primeiro."
    : isThreadBusy(thread)
      ? "Esperando a edição terminar."
      : running?.kind === "preview"
        ? "O preview está renderizando."
        : null;

  return (
    <section className="export-bar" aria-label="Export final">
      {exporting ? (
        <div
          className="export-progress"
          role="progressbar"
          aria-label="Exportando"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(exporting.progress * 100)}
        >
          <span className="export-progress-fill" style={{ transform: `scaleX(${Math.max(0.02, exporting.progress)})` }} />
          <span className="export-progress-label">
            Exportando <strong>{Math.round(exporting.progress * 100)}%</strong>
          </span>
          <IconButton label="Cancelar export" className="export-cancel" onClick={onCancel}>
            <X size={13} strokeWidth={2} />
          </IconButton>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-export" disabled={Boolean(reason)} onClick={onExport}>
          <Download size={15} strokeWidth={2} />
          Exportar vídeo final
        </button>
      )}
      <p className="export-note">{reason ?? qualityLabel(quality)}</p>

      {!exporting && last?.status === "succeeded" && last.path ? (
        <div className="export-last">
          <Check size={13} strokeWidth={2.25} className="export-last-icon" />
          <span className="export-last-name" title={last.path}>
            {basename(last.path)}
          </span>
          <span className="export-last-age">{relativeTime(last.finishedAt ?? last.startedAt, now)}</span>
          <IconButton label="Mostrar no Finder" onClick={onReveal}>
            <FolderSearch size={14} strokeWidth={1.75} />
          </IconButton>
          {IS_TAURI ? null : (
            <a className="icon-btn" href={exportFileUrl(thread.id, last.finishedAt)} download aria-label="Baixar" title="Baixar">
              <Download size={14} strokeWidth={1.75} />
            </a>
          )}
        </div>
      ) : null}
      {!exporting && last?.status === "succeeded" && onSettle && !thread.archivedAt ? (
        <div className="export-settle">
          <span>Terminou este vídeo?</span>
          <button type="button" className="btn btn-small" onClick={onSettle}>
            <Check size={12} strokeWidth={2.25} />
            Concluir thread
          </button>
        </div>
      ) : null}
      {!exporting && last?.status === "failed" && last.error !== "Cancelado." ? (
        <p className="export-error" title={last.error ?? undefined}>
          <CircleAlert size={13} strokeWidth={1.75} />
          <span>{last.error ?? "O export falhou."}</span>
        </p>
      ) : null}
    </section>
  );
}
