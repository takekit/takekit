import { previewUrl } from "../api/client";
import type { Thread } from "../api/client";

interface Props {
  thread: Thread | null;
}

/** Play-only preview — not a frame editor */
export function TimelinePreview({ thread }: Props) {
  if (!thread) {
    return <p className="muted">Sem thread ativa.</p>;
  }

  const hasPreview = Boolean(thread.previewPath);

  return (
    <div className="preview-panel">
      <h2>Timeline / Preview</h2>
      <p className="muted small">
        View detalhada: só play. Sem edição frame a frame neste scaffold.
      </p>
      <div className="timeline-mock" aria-hidden>
        <div className="track label">V1 fala</div>
        <div className="track bar" />
        <div className="track label">LEGENDAS</div>
        <div className="track bar short" />
        <div className="track label">SFX</div>
        <div className="track bar shorter" />
      </div>
      {hasPreview ? (
        <video
          className="preview-video"
          controls
          src={previewUrl(thread.id)}
          key={thread.previewPath ?? thread.id}
        />
      ) : (
        <div className="preview-placeholder">
          <p>Nenhum preview ainda.</p>
          <p className="muted small">
            O engine serve <code>/api/threads/:id/preview</code> quando{" "}
            <code>previewPath</code> existir (ex. export do 09-jev).
          </p>
        </div>
      )}
    </div>
  );
}
