import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, LoaderCircle, MessageSquareText, X } from "lucide-react";

interface Props {
  onSubmit: (text: string) => Promise<boolean>;
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  autoFocus?: boolean;
  /** Left side of the bottom bar (model picker). */
  controls?: ReactNode;
  /** Context strip under the box (project, input video, style). */
  tray?: ReactNode;
  /** One-click starters shown under the box (empty threads only). */
  suggestions?: string[];
  /** Timeline annotations that ride along with the next message. */
  attachments?: Array<{ id: string; n: number; summary: string; note: string }>;
  onRemoveAttachment?: (id: string) => void;
}

export function Composer({
  onSubmit,
  busy,
  disabled,
  placeholder,
  autoFocus,
  controls,
  tray,
  suggestions,
  attachments,
  onRemoveAttachment,
}: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasAttachments = Boolean(attachments?.length);
  // While a job runs the message still goes: the engine hands it to the working agent.
  const canSend = (Boolean(draft.trim()) || hasAttachments) && !disabled;

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  async function submit() {
    const text = draft.trim();
    if ((!text && !hasAttachments) || disabled) return;
    setDraft("");
    const ok = await onSubmit(text);
    // Give the text back if the engine refused it.
    if (!ok) setDraft((current) => current || text);
  }

  return (
    <div className="composer-wrap">
      <form
        className={`composer${disabled ? " is-disabled" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest("button, input, textarea, a, .popover")) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {hasAttachments ? (
          <ul className="attachments" aria-label="Anotações anexadas">
            {attachments!.map((a) => (
              <li key={a.id} className="attach-chip" title={a.note ? `${a.summary}\n${a.note}` : a.summary}>
                <span className="attach-n">{a.n}</span>
                <MessageSquareText size={12} strokeWidth={1.75} className="attach-icon" />
                <span className="attach-text">
                  <span className="attach-summary">{a.summary}</span>
                  {a.note ? <span className="attach-note">{a.note}</span> : null}
                </span>
                {onRemoveAttachment ? (
                  <button
                    type="button"
                    className="attach-remove"
                    aria-label={`Remover anotação ${a.n}`}
                    onClick={() => onRemoveAttachment(a.id)}
                  >
                    <X size={11} strokeWidth={2} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          ref={inputRef}
          className="composer-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            busy
              ? "Mande um ajuste; o agente recebe enquanto trabalha…"
              : hasAttachments
                ? "Algo mais? Enter envia as anotações."
                : placeholder
          }
          rows={1}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-label="Mensagem"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composer-bar">
          <div className="composer-controls">{controls}</div>
          <button
            type="submit"
            className="send-btn"
            disabled={!canSend}
            aria-label={busy && !canSend ? "Job em andamento" : "Enviar"}
            title={busy ? (canSend ? "Enviar ao agente que está trabalhando  ↵" : "Job em andamento") : "Enviar  ↵"}
          >
            {busy && !canSend ? (
              <LoaderCircle size={15} strokeWidth={2.25} className="spin" />
            ) : (
              <ArrowUp size={16} strokeWidth={2.25} />
            )}
          </button>
        </div>
      </form>
      {tray ? <div className="composer-tray">{tray}</div> : null}
      {suggestions?.length && !draft ? (
        <ul className="suggestions">
          {suggestions.map((text) => (
            <li key={text}>
              <button
                type="button"
                className="suggestion"
                disabled={disabled}
                onClick={() => {
                  setDraft(text);
                  inputRef.current?.focus();
                }}
              >
                {text}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
