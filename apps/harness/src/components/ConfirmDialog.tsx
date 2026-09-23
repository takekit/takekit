import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Confirmation for destructive actions. Focus starts on "Cancelar" so Enter never
 * destroys by accident; Esc and a click outside cancel.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      cancel.current();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  return createPortal(
    <div
      className="palette-backdrop is-centered"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <div className="confirm-body">{children}</div>
        {error ? <p className="confirm-error">{error}</p> : null}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn is-ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn is-danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Excluindo…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
