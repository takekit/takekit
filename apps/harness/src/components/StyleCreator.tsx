import { useState } from "react";
import { FilePlus2, Film, FolderOpen, LoaderCircle, Sparkles } from "lucide-react";
import { createStyleDraft, type RefSegment, type Thread } from "../api/client";
import { basename, tildify } from "../lib/format";
import { IS_TAURI } from "../lib/platform";
import { RefPlayer } from "./RefPlayer";
import { VideoPicker } from "./VideoPicker";

const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "mkv", "webm"];
const STEPS = ["Vídeos de exemplo", "Agente analisa", "Revisar assistindo", "Salvar na galeria"];

/**
 * New style from reference videos, step 1 of the flow (docs/style-kit/SPEC-EXPANSION.md):
 * the creator names it and picks the videos; the agent decomposes them in a "style"
 * thread and the right panel shows the proposed package for review.
 */
export function StyleCreator({
  projectsRoot,
  onCancel,
  onCreated,
}: {
  projectsRoot: string;
  onCancel: () => void;
  onCreated: (thread: Thread) => void;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [segments, setSegments] = useState<RefSegment[]>([]);
  const [root, setRoot] = useState(projectsRoot);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickFiles() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const chosen = await open({ multiple: true, directory: false, defaultPath: root || undefined, filters: [{ name: "Vídeos", extensions: VIDEO_EXTENSIONS }] });
    const list = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
    if (list.length) setRefs((prev) => [...prev, ...list.filter((p) => !prev.includes(p))]);
  }

  async function pickFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const chosen = await open({ directory: true, multiple: false, defaultPath: root || undefined });
    if (typeof chosen === "string") {
      setRoot(chosen);
      setPicking(true);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { thread } = await createStyleDraft({
        name: name.trim(),
        references: refs,
        segments: segments.filter((seg) => refs.includes(seg.path)),
        note: note.trim() || undefined,
      });
      onCreated(thread);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+: /, "") : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="builder">
      <div className="builder-inner creator">
        <ol className="draft-flow is-wide" aria-label="Etapas">
          {STEPS.map((label, i) => (
            <li key={label} className={`draft-step${i === 0 ? " is-current" : ""}`}>
              <span className="draft-step-n">{i + 1}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>

        <header className="builder-head">
          <div>
            <h1>Estilo a partir de vídeos de exemplo</h1>
            <p>
              Escolha vídeos no estilo que você quer e marque os trechos que importam. O agente analisa e monta o estilo; você
              revisa assistindo e salva na galeria.
            </p>
          </div>
        </header>

        <div className="creator-form">
          <label className="builder-field">
            <span className="builder-label">Nome do estilo</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Split notícia rápida" autoFocus />
          </label>

          <div className="builder-field">
            <span className="builder-label">
              Vídeos de exemplo
              <small>
                {refs.length
                  ? "Dê play e use Marcar trecho no pedaço que mostra o estilo"
                  : "2 ou mais dão um estilo mais fiel"}
              </small>
            </span>
            {refs.length ? (
              <div className="creator-refs">
                {refs.map((path) => (
                  <RefPlayer
                    key={path}
                    path={path}
                    segments={segments}
                    onSegments={setSegments}
                    onRemove={() => {
                      setRefs((prev) => prev.filter((p) => p !== path));
                      setSegments((prev) => prev.filter((seg) => seg.path !== path));
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="creator-empty">
                <Film size={20} strokeWidth={1.25} />
                <span>Nenhum vídeo ainda</span>
              </div>
            )}
            <div className="creator-pick">
              <button type="button" className="btn btn-small" onClick={() => setPicking(true)} disabled={!root}>
                <Film size={13} strokeWidth={1.75} />
                Escolher em {basename(root) || "pasta"}
              </button>
              {IS_TAURI ? (
                <>
                  <button type="button" className="btn btn-small" onClick={() => void pickFolder()}>
                    <FolderOpen size={13} strokeWidth={1.75} />
                    Outra pasta…
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => void pickFiles()}>
                    <FilePlus2 size={13} strokeWidth={1.75} />
                    Arquivos…
                  </button>
                </>
              ) : (
                <input
                  className="input creator-root"
                  value={root}
                  onChange={(e) => setRoot(e.target.value)}
                  aria-label="Pasta dos vídeos"
                  title={tildify(root)}
                />
              )}
            </div>
          </div>

          <label className="builder-field">
            <span className="builder-label">
              O que copiar delas
              <small>opcional</small>
            </span>
            <textarea
              className="input creator-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: o split com o print em cima e a legenda amarela; ignore a vinheta do início."
            />
          </label>

          {error ? <p className="export-error">{error}</p> : null}
          <div className="builder-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !name.trim() || !refs.length} onClick={() => void submit()}>
              {busy ? <LoaderCircle size={14} strokeWidth={2} className="spin" /> : <Sparkles size={14} strokeWidth={2} />}
              Analisar com o agente
            </button>
          </div>
        </div>
      </div>

      {picking && root ? (
        <VideoPicker
          projectPath={root}
          selected={refs}
          onConfirm={(paths) => setRefs(paths)}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
