import { useEffect, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Plus, X } from "lucide-react";
import {
  MODULE_LABEL,
  getStyleDraft,
  isThreadBusy,
  publishStyleDraft,
  type StyleDraft,
  type Thread,
} from "../api/client";
import { CaptionStill } from "./CaptionStill";
import { StageDiagram } from "./PresetVisual";
import { RefPlayer, markLabel } from "./RefPlayer";
import { IconButton } from "./ui";

/**
 * Right panel of a "style" thread: the package the agent proposes from the references,
 * what still blocks it, and Salvar na galeria (docs/style-kit/SPEC-EXPANSION.md, fluxo).
 */
export function StyleDraftPanel({
  thread,
  onClose,
  resizeHandle,
  onPublished,
  onNewThread,
}: {
  thread: Thread;
  onClose: () => void;
  resizeHandle?: ReactNode;
  onPublished: (thread: Thread | null) => void;
  onNewThread: (styleId: string) => void;
}) {
  const draftId = thread.styleDraft?.id ?? "";
  const published = Boolean(thread.styleDraft?.publishedAt);
  const busy = isThreadBusy(thread);
  const [draft, setDraft] = useState<StyleDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Refetch when the agent settles (or the thread changes), and every few seconds while it
  // works, so the package fills in as it writes.
  const version = `${thread.lastJobStatus ?? ""}:${thread.messages.length}`;
  useEffect(() => {
    if (!draftId || published) return;
    let cancelled = false;
    const load = () =>
      getStyleDraft(draftId)
        .then((res) => !cancelled && (setDraft(res.draft), setError(null)))
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message.replace(/^\d+: /, "") : String(err)));
    void load();
    const timer = busy ? setInterval(() => void load(), 5000) : undefined;
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [draftId, published, version, busy]);

  async function publish() {
    setSaving(true);
    setError(null);
    try {
      const res = await publishStyleDraft(draftId);
      onPublished(res.thread);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+: /, "") : String(err));
    } finally {
      setSaving(false);
    }
  }

  const modules = draft?.modules;
  const name = draft?.style?.name ?? thread.title.replace(/^Estilo:\s*/, "");

  return (
    <aside className="panel" aria-label="Estilo proposto">
      {resizeHandle}
      <header className="panel-head drag" data-tauri-drag-region>
        <span className="panel-title" data-tauri-drag-region>
          {published ? "Estilo" : "Pacote proposto"}
        </span>
        <IconButton label="Fechar painel" shortcut="⌥⌘B" onClick={onClose}>
          <X size={15} strokeWidth={1.75} />
        </IconButton>
      </header>

      <div className="panel-body">
        <ol className="draft-flow" aria-label="Etapas">
          {["Vídeos de exemplo", "Agente analisa", "Revisar assistindo", "Salvar na galeria"].map((label, i) => {
            const step = published ? 4 : busy ? 1 : draft?.style?.promptMarkdown ? 2 : 1;
            const state = i < step ? "is-done" : i === step ? "is-current" : "";
            return (
              <li key={label} className={`draft-step ${state}`}>
                <span className="draft-step-n">{i + 1}</span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>

        {published ? (
          <section className="panel-section draft-done">
            <p>
              <CircleCheck size={15} strokeWidth={1.75} /> <strong>{name}</strong> está na galeria.
            </p>
            <p className="panel-note">
              Refinos que você pedir aqui vão direto no pacote (styles/{draftId}/); o id não muda.
            </p>
            <button type="button" className="btn btn-small" onClick={() => onNewThread(draftId)}>
              <Plus size={13} strokeWidth={2} />
              Nova thread com este estilo
            </button>
          </section>
        ) : null}

        {!published ? (
          <section className="panel-section">
            <h3>Vídeos de exemplo</h3>
            {draft?.evidence.length ? <p className="panel-note">Clique num momento para ver o que o agente usou.</p> : null}
            <div className="draft-refs">
              {(draft?.references.length ? draft.references : (thread.inputVideoPaths ?? [])).map((path) => (
                <RefPlayer
                  key={path}
                  path={path}
                  segments={draft?.segments}
                  marks={[
                    ...(draft?.segments ?? [])
                      .filter((seg) => seg.path === path)
                      .map((seg) => ({ at: seg.start, end: seg.end, label: "Seu trecho", note: seg.note })),
                    ...(draft?.evidence ?? [])
                      .filter((e) => e.path === path)
                      .map((e) => ({ at: e.at, end: e.end, label: markLabel(e.module), note: e.note })),
                  ]}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!published && modules ? (
          <section className="panel-section">
            <h3>O estilo proposto</h3>
            {modules.caption ? (
              <div className="draft-caption">
                <CaptionStill
                  preset={modules.caption}
                  text={"Isso *muda* tudo\nno seu próximo vídeo\ne quase ninguém percebe"}
                  background={`thread:${thread.id}`}
                  animate
                />
                <span className="draft-caption-name">Legenda · {modules.caption.name}</span>
              </div>
            ) : null}
            {modules.stage?.length ? (
              <div className="draft-stages">
                {modules.stage.map((st) => (
                  <span key={st.id} className="draft-stage">
                    <StageDiagram palco={st.palco} layout={(st as { layout?: string }).layout} />
                    <span>{st.name}</span>
                  </span>
                ))}
              </div>
            ) : null}
            <dl className="props">
              <Row label={MODULE_LABEL.camera} value={modules.camera?.name} />
              <Row label={MODULE_LABEL.cuts} value={modules.cuts?.name} />
              <Row label={MODULE_LABEL.soundEffects} value={modules.soundEffects?.name} />
              <Row label={MODULE_LABEL.transitions} value={modules.transitions?.name} />
            </dl>
          </section>
        ) : null}

        {!published && draft?.style?.storyboard ? (
          <details className="panel-section draft-doc">
            <summary>Descrição do estilo</summary>
            <pre>{draft.style.storyboard}</pre>
          </details>
        ) : null}
        {!published && draft?.style?.promptMarkdown ? (
          <details className="panel-section draft-doc">
            <summary>Briefing do agente</summary>
            <pre>{draft.style.promptMarkdown}</pre>
          </details>
        ) : null}

        {!published ? (
          <section className="panel-section">
            {busy ? (
              <p className="panel-note draft-wait">
                <LoaderCircle size={13} strokeWidth={2} className="spin" /> O agente está montando o pacote…
              </p>
            ) : draft?.problems.length ? (
              <ul className="draft-problems">
                {draft.problems.map((p) => (
                  <li key={p}>
                    <CircleAlert size={13} strokeWidth={1.75} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            ) : draft ? (
              <p className="panel-note">Tudo certo. Peça ajustes na conversa ou salve.</p>
            ) : null}
            {error ? <p className="export-error">{error}</p> : null}
            <button
              type="button"
              className="btn btn-primary btn-export"
              disabled={busy || saving || !draft || draft.problems.length > 0}
              onClick={() => void publish()}
            >
              {saving ? <LoaderCircle size={14} strokeWidth={2} className="spin" /> : null}
              Salvar na galeria
            </button>
            {draft ? <p className="export-note">styles/{draft.id}/ · {draft.files.length} arquivos</p> : null}
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="prop">
      <dt>{label}</dt>
      <dd>
        <span className="prop-value">{value || "Nenhum"}</span>
      </dd>
    </div>
  );
}
