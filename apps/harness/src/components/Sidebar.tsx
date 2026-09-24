import { forwardRef, useMemo, useState, type ReactNode } from "react";
import {
  AlarmClock,
  Check,
  ChevronDown,
  ChevronLeft,
  Ellipsis,
  LoaderCircle,
  PanelLeft,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  SquarePen,
  Trash2,
} from "lucide-react";
import { isRendering, isThreadBusy, snoozeState, type StyleSummary, type Thread } from "../api/client";
import { basename, relativeTime } from "../lib/format";
import { useNow, usePersistentState } from "../lib/hooks";
import { SETTINGS_SECTIONS, type SettingsSection } from "./SettingsView";
import { SnoozeMenu, whenLabel } from "./Snooze";
import { StyleGallery } from "./StyleGallery";
import { IconButton, Kbd, Popover } from "./ui";

interface Props {
  threads: Thread[];
  styles: StyleSummary[];
  defaultStyleId: string | null;
  activeId: string | null;
  drafting: boolean;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  engineOnline: boolean;
  onSelect: (id: string) => void;
  onNewThread: (projectPath?: string) => void;
  /** New thread with this style picked. */
  onPickStyle: (styleId: string) => void;
  onNewStyle: () => void;
  onNewCaption: () => void;
  onOpenStudio: () => void;
  studioOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onSettingsSection: (section: SettingsSection) => void;
  onRetry: () => void;
  onCollapse: () => void;
  /** Concluir (true) / Reabrir (false). */
  onSettle: (id: string, settled: boolean) => void;
  /** Adiar até (ISO) / trazer de volta agora (null). */
  onSnooze: (id: string, until: string | null) => void;
  onDeleteProject: (project: { path: string; name: string }) => void;
  resizeHandle?: ReactNode;
}

interface Group {
  path: string;
  name: string;
  threads: Thread[];
}

/** A thread back from a snooze counts as touched when it came back. */
function activityAt(thread: Thread, now: number): string {
  return snoozeState(thread, now) === "returned" && thread.snoozedUntil! > thread.updatedAt
    ? thread.snoozedUntil!
    : thread.updatedAt;
}

const isWorking = (t: Thread) => isThreadBusy(t) || isRendering(t);

function groupByProject(threads: Thread[], now: number): Group[] {
  const groups = new Map<string, Group>();
  const sorted = [...threads].sort((a, b) => activityAt(b, now).localeCompare(activityAt(a, now)));
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
    styles,
    defaultStyleId,
    activeId,
    drafting,
    settingsOpen,
    settingsSection,
    engineOnline,
    onSelect,
    onNewThread,
    onPickStyle,
    onNewStyle,
    onNewCaption,
    onOpenStudio,
    studioOpen,
    onOpenSettings,
    onCloseSettings,
    onSettingsSection,
    onRetry,
    onCollapse,
    onSettle,
    onSnooze,
    onDeleteProject,
    resizeHandle,
  },
  searchRef,
) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = usePersistentState<string[]>("takekit.collapsedGroups", []);
  const [shelf, setShelf] = usePersistentState<"snoozed" | "settled" | null>("takekit.shelf", null);
  // Minute ticks: ages, and snoozed threads coming back on time.
  const now = useNow(30_000);

  const { groups, drafts, snoozed, settled } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q
      ? threads.filter(
          (t) => t.title.toLowerCase().includes(q) || t.projectPath.toLowerCase().includes(q),
        )
      : threads;
    const hidden = (t: Thread) => Boolean(t.archivedAt) || snoozeState(t, now) === "snoozed";
    return {
      // Style threads live in the gallery, not under a project.
      groups: groupByProject(visible.filter((t) => !hidden(t) && t.kind !== "style"), now),
      drafts: threads.filter((t) => t.kind === "style" && !hidden(t)),
      snoozed: visible
        .filter((t) => !t.archivedAt && snoozeState(t, now) === "snoozed")
        .sort((a, b) => (a.snoozedUntil ?? "").localeCompare(b.snoozedUntil ?? "")),
      settled: visible
        .filter((t) => t.archivedAt)
        .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")),
    };
  }, [threads, query, now]);

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
        {query ? null : (
          <StyleGallery
            styles={styles}
            defaultStyleId={defaultStyleId}
            onPick={onPickStyle}
            drafts={drafts}
            activeId={settingsOpen ? null : activeId}
            onSelectThread={onSelect}
            onNewStyle={onNewStyle}
            onNewCaption={onNewCaption}
            onOpenStudio={onOpenStudio}
            studioOpen={studioOpen && !settingsOpen}
            canCreate={engineOnline}
          />
        )}
        {groups.map((group) => {
          // A thread back from a snooze opens its group, or it would come back unseen.
          const isCollapsed =
            !query && collapsed.includes(group.path) && !group.threads.some((t) => snoozeState(t, now) === "returned");
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
                            disabled={group.threads.some(isWorking)}
                            onClick={() => {
                              close();
                              for (const t of group.threads) onSettle(t.id, true);
                            }}
                          >
                            <span className="menu-item-icon">
                              <Check size={14} strokeWidth={1.75} />
                            </span>
                            <span className="menu-item-text">Concluir todas as threads</span>
                          </button>
                          <div className="menu-sep" />
                          <button
                            type="button"
                            className="menu-item is-danger"
                            disabled={group.threads.some(isWorking)}
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
                  {group.threads.map((t) => {
                    const returned = snoozeState(t, now) === "returned";
                    return (
                      <li key={t.id} className="thread-item">
                        <button
                          type="button"
                          className={`thread-row${returned ? " is-returned" : ""}${t.id === activeId && !settingsOpen ? " is-active" : ""}`}
                          onClick={() => onSelect(t.id)}
                        >
                          <ThreadStatus thread={t} />
                          <span className="thread-title">{t.title}</span>
                          {returned ? (
                            <span className="thread-age is-returned" title="Voltou do adiamento">
                              <AlarmClock size={11} strokeWidth={2} />
                              voltou
                            </span>
                          ) : (
                            <span className="thread-age">{relativeTime(t.updatedAt, now)}</span>
                          )}
                        </button>
                        {engineOnline && !isWorking(t) ? (
                          <span className="thread-actions">
                            <SnoozeMenu onSnooze={(until) => onSnooze(t.id, until)} />
                            <button
                              type="button"
                              className="thread-settle"
                              title="Tira da lista. Fica em Concluídas e dá para reabrir."
                              onClick={() => onSettle(t.id, true)}
                            >
                              <Check size={12} strokeWidth={2.25} />
                              Concluir
                            </button>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {query && !groups.length && !snoozed.length && !settled.length ? (
          <p className="sidebar-empty">Nada encontrado para “{query}”.</p>
        ) : null}
        {!query && !groups.length ? (
          <p className="sidebar-empty">
            {snoozed.length || settled.length
              ? "Tudo em dia. As threads concluídas e adiadas estão aqui embaixo."
              : "Nenhuma thread ainda. Descreva uma edição para começar."}
          </p>
        ) : null}
      </div>

      {snoozed.length || settled.length ? (
        <div className="sidebar-shelf">
          {snoozed.length ? (
            <ShelfSection
              label="Adiadas"
              count={snoozed.length}
              open={shelf === "snoozed" || Boolean(query)}
              onToggle={() => setShelf((v) => (v === "snoozed" ? null : "snoozed"))}
            >
              {snoozed.map((t) => (
                <li key={t.id} className="thread-item">
                  <button
                    type="button"
                    className={`thread-row is-shelved${t.id === activeId && !settingsOpen ? " is-active" : ""}`}
                    onClick={() => onSelect(t.id)}
                    title={t.projectPath}
                  >
                    <span className="thread-title">{t.title}</span>
                    <span className="thread-age">volta {whenLabel(t.snoozedUntil!, now)}</span>
                  </button>
                  {engineOnline ? (
                    <span className="thread-actions">
                      <SnoozeMenu label="Mudar horário" onSnooze={(until) => onSnooze(t.id, until)} />
                      <button type="button" className="thread-settle" onClick={() => onSnooze(t.id, null)}>
                        <RotateCcw size={12} strokeWidth={2} />
                        Trazer agora
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ShelfSection>
          ) : null}
          {settled.length ? (
            <ShelfSection
              label="Concluídas"
              count={settled.length}
              open={shelf === "settled" || Boolean(query)}
              onToggle={() => setShelf((v) => (v === "settled" ? null : "settled"))}
            >
              {settled.map((t) => (
                <li key={t.id} className="thread-item">
                  <button
                    type="button"
                    className={`thread-row is-shelved${t.id === activeId && !settingsOpen ? " is-active" : ""}`}
                    onClick={() => onSelect(t.id)}
                    title={t.projectPath}
                  >
                    <span className="thread-title">{t.title}</span>
                    <span className="thread-age">{basename(t.projectPath)}</span>
                  </button>
                  {engineOnline ? (
                    <span className="thread-actions">
                      <button type="button" className="thread-settle" onClick={() => onSettle(t.id, false)}>
                        <RotateCcw size={12} strokeWidth={2} />
                        Reabrir
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ShelfSection>
          ) : null}
        </div>
      ) : null}

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

/** Collapsible "Adiadas (2) ───── ⌄" at the bottom of the sidebar, like T3's Settled. */
function ShelfSection({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`shelf${open ? " is-open" : ""}`}>
      <button type="button" className="shelf-head" onClick={onToggle} aria-expanded={open}>
        <span>{label}</span>
        <span className="shelf-count">{count}</span>
        <span className="shelf-rule" aria-hidden />
        <ChevronDown size={13} strokeWidth={2} className={`group-chevron${open ? "" : " is-collapsed"}`} />
      </button>
      {open ? <ul className="thread-list shelf-list">{children}</ul> : null}
    </section>
  );
}

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
