import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Search } from "lucide-react";

/**
 * Command-palette modal (T3 Code style): dimmed window, panel near the top,
 * search on top, list in the middle, key hints at the bottom. Esc closes.
 */
export function Palette({
  label,
  onClose,
  className,
  children,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Capture phase: the app's own Esc handlers (leave settings, dismiss menus) must not also fire.
      e.stopPropagation();
      e.preventDefault();
      closeRef.current();
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, []);

  return createPortal(
    <div
      className="palette-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`palette${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function PaletteSearch({
  value,
  onChange,
  placeholder,
  onBack,
  onKeyDown,
  inputRef,
  trailing,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onBack?: () => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
  trailing?: ReactNode;
}) {
  return (
    <div className="palette-search">
      {onBack ? (
        <button type="button" className="palette-back" aria-label="Voltar" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
      ) : (
        <Search size={15} strokeWidth={1.75} className="palette-search-icon" />
      )}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus
        spellCheck={false}
        autoComplete="off"
      />
      {trailing}
    </div>
  );
}

/** Row in a palette list: icon, title, optional subtitle and trailing content. */
export function PaletteRow({
  id,
  icon,
  title,
  subtitle,
  trailing,
  active,
  selected,
  onClick,
  onHover,
}: {
  id: string;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  active: boolean;
  selected?: boolean;
  onClick: () => void;
  onHover: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <div
      ref={ref}
      id={id}
      role="option"
      aria-selected={selected ?? active}
      className={`palette-row${active ? " is-active" : ""}`}
      onClick={onClick}
      onPointerMove={onHover}
    >
      <span className="palette-row-icon">{icon}</span>
      <span className="palette-row-text">
        <span className="palette-row-title">{title}</span>
        {subtitle ? <span className="palette-row-sub">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="palette-row-trail">{trailing}</span> : null}
    </div>
  );
}

export function PaletteFooter({ hints, children }: { hints: Array<[string[], string]>; children?: ReactNode }) {
  return (
    <div className="palette-footer">
      <div className="palette-hints">
        {hints.map(([keys, label]) => (
          <span key={label} className="palette-hint">
            {keys.map((k) => (
              <kbd key={k} className="key">
                {k}
              </kbd>
            ))}
            <span>{label}</span>
          </span>
        ))}
      </div>
      {children ? <div className="palette-actions">{children}</div> : null}
    </div>
  );
}
