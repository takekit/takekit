import { forwardRef, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  Ellipsis,
  LoaderCircle,
  PanelLeft,
  Plus,
  RotateCw,
  Search,
  Settings,
  SquarePen,
  Trash2,
} from "lucide-react";
import { isThreadBusy, type Thread } from "../api/client";
import { basename, relativeTime } from "../lib/format";
import { useNow, usePersistentState } from "../lib/hooks";
import { SETTINGS_SECTIONS, type SettingsSection } from "./SettingsView";
import { IconButton, Kbd, Popover } from "./ui";

interface Props {
  threads: Thread[];
  activeId: string | null;
  drafting: boolean;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  engineOnline: boolean;
  onSelect: (id: string) => void;
  onNewThread: (projectPath?: string) => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onSettingsSection: (section: SettingsSection) => void;
  onRetry: () => void;
  onCollapse: () => void;
  onArchive: (id: string, archived: boolean) => void;
  onDeleteProject: (project: { path: string; name: string }) => void;
  resizeHandle?: ReactNode;
}

interface Group {
  path: string;
  name: string;
  threads: Thread[];
}

function groupByProject(threads: Thread[]): Group[] {
  const groups = new Map<string, Group>();
  const sorted = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const thread of sorted) {
    const group = groups.get(thread.projectPath);
    if (group) group.threads.push(thread);
    else
      groups.set(thread.projectPath, {
        path: thread.projectPath,
        name: basename(thread.projectPath) || "projeto",
        threads: [thread],
      });
  }
  return [...groups.values()];
}

export const Sidebar = forwardRef<HTMLInputElement, Props>(function Sidebar(
  {
    threads,
    activeId,
    drafting,
    settingsOpen,
    settingsSection,
    engineOnline,
    onSelect,
    onNewThread,
    onOpenSettings,
    onCloseSettings,
    onSettingsSection,
    onRetry,
    onCollapse,
    onArchive,
    onDeleteProject,
    resizeHandle,
  },
  searchRef,
) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = usePersistentState<string[]>("takekit.collapsedGroups", []);
  const [showArchived, setShowArchived] = usePersistentState("takekit.showArchived", false);
  const now = useNow(60_000);

  const { groups, archived } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q
      ? threads.filter(
          (t) => t.title.toLowerCase().includes(q) || t.projectPath.toLowerCase().includes(q),
        )
      : threads;
    return {
      groups: groupByProject(visible.filter((t) => !t.archivedAt)),
      archived: visible
        .filter((t) => t.archivedAt)
        .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")),
    };
  }, [threads, query]);

  function toggleGroup(path: string) {
    setCollapsed((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head drag" data-tauri-drag-region>
        <IconButton label="Ocultar sidebar" shortcut="⌘B" onClick={onCollapse}>
          <PanelLeft size={16} strokeWidth={1.75} />
        </IconButton>
        <span className="brand" data-tauri-drag-region>
          Takekit
        </span>
      </div>

      {settingsOpen ? (
        <>
          <nav className="sidebar-nav" aria-label="Configurações">
            <div className="sidebar-label">Configurações</div>
            {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`nav-item${settingsSection === id ? " is-active" : ""}`}
                aria-current={settingsSection === id ? "page" : undefined}
                onClick={() => onSettingsSection(id)}
              >
                <Icon size={15} strokeWidth={1.75} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-spacer" />
          <footer className="sidebar-foot">
            <button type="button" className="nav-item" onClick={onCloseSettings}>
              <ChevronLeft size={15} strokeWidth={1.75} />
              <span>Voltar</span>
              <Kbd>Esc</Kbd>
            </button>
          </footer>
        </>
      ) : (
        <>
      <nav className="sidebar-nav">
        <button
          type="button"
          className={`nav-item${drafting ? " is-active" : ""}`}
          onClick={() => onNewThread()}
        >
          <SquarePen size={15} strokeWidth={1.75} />
          <span>Nova thread</span>
          <Kbd>⌘N</Kbd>
        </button>
        <label className="nav-item nav-search">
          <Search size={15} strokeWidth={1.75} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Buscar"
            aria-label="Buscar threads"
          />
          {query ? null : <Kbd>⌘K</Kbd>}
        </label>
      </nav>

      <div className="sidebar-scroll">
        {groups.map((group) => {
          const isCollapsed = !query && collapsed.includes(group.path);
          return (
            <section key={group.path} className="group">
              <div className="group-head">
                <button
                  type="button"
                  className="group-toggle"
                  onClick={() => toggleGroup(group.path)}
                  aria-expanded={!isCollapsed}
                  title={group.path}
                >
                  <span className="group-name">{group.name}</span>
                  <ChevronDown
                    size={13}
                    strokeWidth={2}
                    className={`group-chevron${isCollapsed ? " is-collapsed" : ""}`}
                  />
                </button>
                {engineOnline ? (
                  <>
                    <Popover
                      side="bottom"
                      align="end"
                      className="menu group-menu"
                      trigger={({ open, toggle }) => (
                        <IconButton
                          label={`Opções de ${group.name}`}
                          className={`group-add${open ? " is-open" : ""}`}
                          onClick={toggle}
                          aria-haspopup="menu"
                          aria-expanded={open}
                        >
                          <Ellipsis size={14} strokeWidth={1.75} />
                        </IconButton>
                      )}
                    >
                      {(close) => (
                        <>
                          <button
                            type="button"
                            className="menu-item"
                            onClick={() => {
                              close();
                              onNewThread(group.path);
                            }}
                          >
                            <span className="menu-item-icon">
                              <SquarePen size={14} strokeWidth={1.75} />
                            </span>
                            <span className="menu-item-text">Nova thread</span>
                          </button>
                          <button
                            type="button"
                            className="menu-item"
                            disabled={group.threads.some(isThreadBusy)}
                            onClick={() => {
                              close();
                              for (const t of group.threads) onArchive(t.id, true);
                            }}
                          >
                            <span className="menu-item-icon">
                              <Archive size={14} strokeWidth={1.75} />
                            </span>
                            <span className="menu-item-text">Arquivar todas as threads</span>
                          </button>
                          <div className="menu-sep" />
                          <button
                            type="button"
                            className="menu-item is-danger"
                            disabled={group.threads.some(isThreadBusy)}
                            onClick={() => {
                              close();
                              onDeleteProject({ path: group.path, name: group.name });
                            }}
                          >
                            <span className="menu-item-icon">
                              <Trash2 size={14} strokeWidth={1.75} />
                            </span>
                            <span className="menu-item-text">Excluir projeto…</span>
                          </button>
                        </>
                      )}
                    </Popover>
                    <IconButton
                      label={`Nova thread em ${group.name}`}
                      className="group-add"
                      onClick={() => onNewThread(group.path)}
                    >
                      <Plus size={14} strokeWidth={1.75} />
                    </IconButton>
                  </>
                ) : null}
              </div>
              {isCollapsed ? null : (
                <ul className="thread-list">
                  {group.threads.map((t) => (
                    <li key={t.id} className="thread-item">
                      <button
                        type="button"
                        className={`thread-row${t.id === activeId && !settingsOpen ? " is-active" : ""}`}
                        onClick={() => onSelect(t.id)}
                      >
                        <ThreadStatus thread={t} />
                        <span className="thread-title">{t.title}</span>
                        <span className="thread-age">{relativeTime(t.updatedAt, now)}</span>
                      </button>
                      {engineOnline && !isThreadBusy(t) ? (
                        <IconButton label="Arquivar" className="thread-action" onClick={() => onArchive(t.id, true)}>
                          <Archive size={13} strokeWidth={1.75} />
                        </IconButton>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {query && !groups.length && !archived.length ? (
          <p className="sidebar-empty">Nada encontrado para “{query}”.</p>
        ) : null}
        {!query && !groups.length ? (
          <p className="sidebar-empty">Nenhuma thread ainda. Descreva uma edição para começar.</p>
        ) : null}

        {archived.length ? (
          <section className="group group-archived">
            <div className="group-head">
              <button
                type="button"
                className="group-toggle"
                onClick={() => setShowArchived((v) => !v)}
                aria-expanded={showArchived || Boolean(query)}
              >
                <Archive size={12} strokeWidth={1.75} />
                <span className="group-name">Arquivadas</span>
                <span className="group-count">{archived.length}</span>
                <ChevronDown
                  size={13}
                  strokeWidth={2}
                  className={`group-chevron${showArchived || query ? "" : " is-collapsed"}`}
                />
              </button>
            </div>
            {showArchived || query ? (
              <ul className="thread-list">
                {archived.map((t) => (
                  <li key={t.id} className="thread-item">
                    <button
                      type="button"
                      className={`thread-row is-archived${t.id === activeId && !settingsOpen ? " is-active" : ""}`}
                      onClick={() => onSelect(t.id)}
                      title={t.projectPath}
                    >
                      <span className="thread-title">{t.title}</span>
                      <span className="thread-age">{basename(t.projectPath)}</span>
                    </button>
                    {engineOnline ? (
                      <IconButton label="Desarquivar" className="thread-action" onClick={() => onArchive(t.id, false)}>
                        <ArchiveRestore size={13} strokeWidth={1.75} />
                      </IconButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>

      <footer className="sidebar-foot">
        <button type="button" className="nav-item" onClick={onOpenSettings}>
          <Settings size={15} strokeWidth={1.75} />
          <span>Configurações</span>
          <Kbd>⌘,</Kbd>
        </button>
        {engineOnline ? (
          <span className="engine-status is-online" title="Engine online" aria-label="Engine online">
            <span className="engine-dot" aria-hidden />
          </span>
        ) : (
          <button
            type="button"
            className="engine-status is-offline"
            onClick={onRetry}
            title="Engine offline. Clique para reconectar."
          >
            <span className="engine-dot" aria-hidden />
            <span className="engine-label">Offline</span>
            <RotateCw size={12} strokeWidth={1.75} />
          </button>
        )}
      </footer>
        </>
      )}
      {resizeHandle}
    </aside>
  );
});

function ThreadStatus({ thread }: { thread: Thread }) {
  if (isThreadBusy(thread)) {
    return <LoaderCircle size={12} strokeWidth={2.25} className="thread-spinner spin" aria-label="Rodando" />;
  }
  if (thread.lastJobStatus === "failed") {
    return <span className="thread-status is-failed" title="Último job falhou" aria-label="Falhou" />;
  }
  if (thread.previewPath) {
    return <span className="thread-status is-ready" title="Preview pronto" aria-label="Preview pronto" />;
  }
  return <span className="thread-status" aria-hidden />;
}
