import type { Thread } from "../api/client";

interface Props {
  threads: Thread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  engineOnline: boolean;
}

export function ThreadsSidebar({
  threads,
  activeId,
  onSelect,
  onCreate,
  engineOnline,
}: Props) {
  return (
    <aside className="sidebar left">
      <header className="sidebar-header">
        <div>
          <strong>Takekit</strong>
          <div className="muted small">
            {engineOnline ? "engine online" : "engine offline (mock)"}
          </div>
        </div>
        <button type="button" className="btn primary" onClick={onCreate}>
          +
        </button>
      </header>
      <ul className="thread-list">
        {threads.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`thread-item ${t.id === activeId ? "active" : ""}`}
              onClick={() => onSelect(t.id)}
            >
              <span className="thread-title">{t.title}</span>
              <span className="muted small">{t.styleId}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
