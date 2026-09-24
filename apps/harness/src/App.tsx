import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CircleAlert, CircleCheck, FolderSearch, RotateCw, X } from "lucide-react";
import {
  cancelRender,
  createThread,
  getThread,
  isThreadBusy,
  listProjects,
  listStyles,
  listThreads,
  postMessage,
  deleteProject,
  revealExport,
  setThreadArchived,
  snoozeState,
  snoozeThread,
  setThreadModules,
  startExport,
  startPreviewRender,
  styleName,
  type ModuleSelection,
  type ProjectSummary,
  type RenderTask,
  type StyleSummary,
  type Thread,
} from "./api/client";
import { basename, tildify, titleFromPrompt } from "./lib/format";
import { usePersistentState } from "./lib/hooks";
import { executorDisplay, useEngineConfig } from "./lib/useEngineConfig";
import { annotationSummary, serializeAnnotations, type TimelineAnnotation } from "./lib/annotations";
import { IS_MAC_TAURI } from "./lib/platform";
import { useRenders } from "./lib/useRenders";
import { usePresets } from "./lib/usePresets";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ChatView } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { ModelPicker } from "./components/ModelPicker";
import { DraftTray, ThreadTray, type Draft, type ProjectOption } from "./components/ContextTray";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Hero } from "./components/Hero";
import { PreviewPanel } from "./components/PreviewPanel";
import { StyleDraftPanel } from "./components/StyleDraftPanel";
import { CaptionBuilder } from "./components/CaptionBuilder";
import { StyleCreator } from "./components/StyleCreator";
import { Studio } from "./components/Studio";
import { SETTINGS_SECTIONS, SettingsView, type SettingsSection } from "./components/SettingsView";
import { ResizeHandle } from "./components/ResizeHandle";
import "./App.css";

const POLL_MS = 1500;
const SIDEBAR_W = { min: 200, initial: 264, max: 560 };
// No fixed cap on wide monitors: the live limit is "keep MIN_MAIN_W for the chat".
const PANEL_W = { min: 300, initial: 380, max: 4000 };
/** Chat column never gets squeezed below this by the side panels. */
const MIN_MAIN_W = 380;
const OFFLINE_RETRY_MS = 5000;
const EMPTY_DRAFT: Draft = { projectPath: "", inputVideoPaths: [], styleId: "", modules: {} };
// The agent tells a question from an edit request on its own; starters show both.
const SUGGESTIONS = [
  "Edita esse Short do bruto ao export",
  "Corta os silêncios e deixa o ritmo mais rápido",
  "O que dá pra melhorar no ritmo desse vídeo?",
];

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = usePersistentState<string | null>("takekit.activeThread", null);
  const [view, setView] = useState<"chat" | "settings" | "captions" | "style-new" | "studio">("chat");
  // Estúdio opens on the gallery, or straight on "Novo estilo".
  const [studioStart, setStudioStart] = useState<"gallery" | "new">("gallery");
  // Caption builder: where it was opened from (a thread or the new-thread tray get the pick).
  const [builder, setBuilder] = useState<{ origin: "thread" | "draft" | "studio"; threadId: string | null; baseId: string }>({
    origin: "studio",
    threadId: null,
    baseId: "",
  });
  // Non-error notices (export ready…), with actions.
  const [notice, setNotice] = useState<{ text: string; threadId: string; reveal: boolean } | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [glass, setGlass] = usePersistentState("takekit.glass", true);
  const [ambient, setAmbient] = usePersistentState("takekit.ambient", true);
  // A new thread starts in the last project used (no fixed "default project").
  const [lastProject, setLastProject] = usePersistentState("takekit.lastProject", "");
  const [draft, setDraft] = useState<Draft>(() => ({ ...EMPTY_DRAFT, projectPath: lastProject }));
  // Bumped when sending needs a project first; the draft tray opens the picker.
  const [askProject, setAskProject] = useState(0);
  const [sidebarOpen, setSidebarOpen] = usePersistentState("takekit.sidebarOpen", true);
  const [panelOpen, setPanelOpen] = usePersistentState("takekit.previewOpen", true);
  const [sidebarWidth, setSidebarWidth] = usePersistentState("takekit.sidebarWidth", SIDEBAR_W.initial);
  const [panelWidth, setPanelWidth] = usePersistentState("takekit.previewWidth", PANEL_W.initial);
  const appRef = useRef<HTMLDivElement>(null);
  const [engineOnline, setEngineOnline] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [sending, setSending] = useState(false);
  // Shown as a user bubble until the refetched thread contains it.
  const [pending, setPending] = useState<{ threadId: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Excluir projeto" confirmation (path + whether the folder also goes to the Trash).
  const [deleting, setDeleting] = useState<{
    path: string;
    name: string;
    trash: boolean;
    busy: boolean;
    error: string | null;
  } | null>(null);
  // Projects in the projects root (config.projectsRoot) + the number the next one gets.
  const [projects, setProjects] = useState<{ root: string; nextNumber: number; list: ProjectSummary[] }>({
    root: "",
    nextNumber: 1,
    list: [],
  });
  // Style Kit gallery (styles/<id>/ on the engine).
  const [styles, setStyles] = useState<{ list: StyleSummary[]; defaultId: string | null }>({ list: [], defaultId: null });
  // Timeline annotations waiting in each thread's composer.
  const [annotationsBy, setAnnotationsBy] = useState<Record<string, TimelineAnnotation[]>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const reportError = useCallback((text: string) => setError(text), []);

  // Appearance prefs live on <html> so the glass tokens in index.css can react.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("no-glass", !glass);
    root.classList.toggle("no-ambient", !glass || !ambient);
  }, [glass, ambient]);
  const engine = useEngineConfig(engineOnline, reportError);

  const active = view === "chat" ? (threads.find((t) => t.id === activeId) ?? null) : null;
  // Library for the builder's "start from" list (captions).
  const library = usePresets("", engineOnline);
  // Busy only while the active thread's job is queued/running (or the POST is in flight).
  const busy = sending || isThreadBusy(active);

  const upsertThread = useCallback((thread: Thread) => {
    setThreads((prev) =>
      prev.some((t) => t.id === thread.id)
        ? prev.map((t) => (t.id === thread.id ? thread : t))
        : [thread, ...prev],
    );
  }, []);

  const reloadProjects = useCallback(async () => {
    try {
      const res = await listProjects();
      setProjects({ root: res.root, nextNumber: res.nextNumber, list: res.projects });
    } catch {
      setProjects((prev) => ({ ...prev, list: [] }));
    }
  }, []);

  const changeProjectsRoot = useCallback(
    async (path: string) => {
      await engine.update({ projectsRoot: path });
      await reloadProjects();
    },
    [engine, reloadProjects],
  );

  const refresh = useCallback(async () => {
    try {
      const { threads: remote } = await listThreads();
      setThreads(remote);
      setEngineOnline(true);
      setError(null);
      setActiveId((prev) => (prev && remote.some((t) => t.id === prev) ? prev : null));
      void reloadProjects();
      listStyles()
        .then((res) => setStyles({ list: res.styles, defaultId: res.defaultStyleId }))
        .catch(() => setStyles({ list: [], defaultId: null }));
    } catch (err) {
      // Keep whatever was loaded last; the sidebar and toast show the engine is down.
      setEngineOnline(false);
      setError(message(err));
    } finally {
      setConnecting(false);
    }
  }, [setActiveId, reloadProjects]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Reconnect on its own once the engine comes back.
  useEffect(() => {
    if (engineOnline || connecting) return;
    const timer = setInterval(() => void refresh(), OFFLINE_RETRY_MS);
    return () => clearInterval(timer);
  }, [engineOnline, connecting, refresh]);

  // Poll every thread with a queued/running job until it settles. The refetched
  // thread carries the final chat message, previewPath and stageStatus.
  const busyIds = threads.filter(isThreadBusy).map((t) => t.id).join(",");
  useEffect(() => {
    if (!engineOnline || !busyIds) return;
    const ids = busyIds.split(",");
    const timer = setInterval(() => {
      for (const id of ids) {
        getThread(id)
          .then(({ thread }) => upsertThread(thread))
          .catch((err) => setError(message(err)));
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [busyIds, engineOnline, upsertThread]);

  // A fresh export pops the preview panel open.
  const lastPreview = useRef<{ id: string | null; version: string | null }>({ id: null, version: null });
  useEffect(() => {
    const version = active?.previewUpdatedAt ?? null;
    const prev = lastPreview.current;
    if (active && prev.id === active.id && version && version !== prev.version) setPanelOpen(true);
    lastPreview.current = { id: active?.id ?? null, version };
  }, [active, setPanelOpen]);

  const startThread = useCallback(
    (projectPath?: string, styleId = "") => {
      setView("chat");
      setActiveId(null);
      setDraft({ projectPath: projectPath ?? lastProject, inputVideoPaths: [], styleId, modules: {} });
    },
    [lastProject, setActiveId],
  );

  // Notices step aside on their own; an export notice stays longer (it has an action).
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.reveal ? 20_000 : 6_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const refreshThread = useCallback(
    (id: string) => {
      getThread(id)
        .then(({ thread }) => upsertThread(thread))
        .catch(() => undefined);
    },
    [upsertThread],
  );

  // Exports and preview re-renders run on the engine; a finished one refreshes its thread.
  const renders = useRenders(threads, engineOnline, (task: RenderTask) => {
    refreshThread(task.threadId);
    const title = threads.find((t) => t.id === task.threadId)?.title ?? "";
    if (task.status === "succeeded" && task.kind === "export") {
      setNotice({ text: `Export pronto${title ? ` · ${title}` : ""}: ${basename(task.path)}`, threadId: task.threadId, reveal: true });
    } else if (task.status === "failed" && task.error !== "Cancelado.") {
      setError(task.error ?? (task.kind === "export" ? "O export falhou." : "O preview falhou."));
    }
  });

  const runRender = useCallback(
    async (start: () => Promise<{ task: RenderTask }>) => {
      try {
        const { task } = await start();
        renders.begin(task);
        refreshThread(task.threadId);
      } catch (err) {
        setError(message(err).replace(/^\d+: /, ""));
      }
    },
    [renders, refreshThread],
  );

  const changeModules = useCallback(
    async (threadId: string, patch: ModuleSelection): Promise<boolean> => {
      try {
        const { thread } = await setThreadModules(threadId, patch);
        upsertThread(thread);
        return true;
      } catch (err) {
        setError(message(err).replace(/^\d+: /, ""));
        return false;
      }
    },
    [upsertThread],
  );

  const openCaptionBuilder = useCallback(
    (origin: "thread" | "draft" | "studio", threadId: string | null, baseId: string) => {
      setBuilder({ origin, threadId, baseId });
      setView("captions");
    },
    [],
  );

  const openStudio = useCallback((start: "gallery" | "new") => {
    setStudioStart(start);
    setView("studio");
  }, []);

  /** A caption picked or made in the builder goes where the builder was opened from. */
  const takeCaption = useCallback(
    (preset: { id: string; name: string }) => {
      if (builder.origin === "thread" && builder.threadId) {
        setView("chat");
        setActiveId(builder.threadId);
        void changeModules(builder.threadId, { caption: preset.id });
      } else if (builder.origin === "draft") {
        setView("chat");
        setDraft((d) => ({ ...d, modules: { ...d.modules, caption: preset.id } }));
      } else {
        openStudio("gallery");
      }
    },
    [builder, changeModules, openStudio, setActiveId],
  );

  const settle = useCallback(
    async (id: string, settled: boolean) => {
      try {
        const { thread } = await setThreadArchived(id, settled);
        upsertThread(thread);
        // Concluding the open thread leaves a fresh draft in the same project.
        if (settled && id === activeId) startThread(thread.projectPath);
      } catch (err) {
        setError(message(err));
      }
    },
    [activeId, startThread, upsertThread],
  );

  const snooze = useCallback(
    async (id: string, until: string | null) => {
      try {
        const { thread } = await snoozeThread(id, until);
        upsertThread(thread);
        if (until && id === activeId) startThread(thread.projectPath);
      } catch (err) {
        setError(message(err));
      }
    },
    [activeId, startThread, upsertThread],
  );

  async function confirmDeleteProject() {
    if (!deleting) return;
    const { path, trash } = deleting;
    setDeleting({ ...deleting, busy: true, error: null });
    try {
      await deleteProject(path, trash);
      setThreads((prev) => prev.filter((t) => t.projectPath !== path));
      if (active?.projectPath === path) setActiveId(null);
      setDraft((d) => (d.projectPath === path ? { ...d, projectPath: "", inputVideoPaths: [] } : d));
      if (lastProject === path) setLastProject("");
      void reloadProjects();
      setDeleting(null);
    } catch (err) {
      setDeleting({ ...deleting, busy: false, error: message(err).replace(/^\d+: /, "") });
    }
  }

  const selectThread = useCallback(
    (id: string) => {
      setView("chat");
      setActiveId(id);
      // Opening a thread back from a snooze is what clears its "voltou".
      const thread = threads.find((t) => t.id === id);
      if (thread && snoozeState(thread) === "returned") void snooze(id, null);
    },
    [setActiveId, threads, snooze],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Esc leaves settings unless something inside (menu, field) handled it first.
      if (e.key === "Escape" && view === "settings" && !e.defaultPrevented) {
        const target = e.target as HTMLElement | null;
        if (!target?.closest("input, textarea, select, .popover")) setView("chat");
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      // e.code, not e.key: Option changes the produced character on macOS.
      if (e.code === "KeyN" && !e.altKey) {
        e.preventDefault();
        startThread();
      } else if (e.code === "KeyB" && e.altKey) {
        e.preventDefault();
        setPanelOpen((v) => !v);
      } else if (e.code === "KeyB") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (e.code === "KeyK") {
        e.preventDefault();
        setSidebarOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.code === "Comma" && view === "settings") {
        e.preventDefault();
        setView("chat");
      } else if (e.code === "Comma") {
        e.preventDefault();
        setView("settings");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startThread, setPanelOpen, setSidebarOpen, view]);

  const activeAnnotations = active ? (annotationsBy[active.id] ?? []) : [];

  const addAnnotation = useCallback((threadId: string, annotation: TimelineAnnotation) => {
    setAnnotationsBy((prev) => ({ ...prev, [threadId]: [...(prev[threadId] ?? []), annotation] }));
  }, []);

  const removeAnnotation = useCallback((threadId: string, id: string) => {
    setAnnotationsBy((prev) => ({ ...prev, [threadId]: (prev[threadId] ?? []).filter((a) => a.id !== id) }));
  }, []);

  async function handleSend(typed: string): Promise<boolean> {
    if (!engineOnline) {
      setError("Engine offline. Não dá pra enviar agora.");
      return false;
    }
    const attached = activeAnnotations;
    const block = serializeAnnotations(attached);
    const text = typed || (attached.length ? "Aplique as anotações da timeline." : "");
    const content = block ? `${text}\n\n${block}` : text;
    if (!active && !draft.projectPath) {
      setAskProject((n) => n + 1);
      return false;
    }
    let target = active;
    setSending(true);
    setError(null);
    try {
      if (!target) {
        const { thread } = await createThread({
          title: titleFromPrompt(content),
          projectPath: draft.projectPath,
          inputVideoPaths: draft.inputVideoPaths.length ? draft.inputVideoPaths : undefined,
          styleId: draft.styleId || undefined,
          modules: Object.keys(draft.modules).length ? draft.modules : undefined,
        });
        target = thread;
        upsertThread(thread);
        setActiveId(thread.id);
        setLastProject(thread.projectPath);
        setDraft(EMPTY_DRAFT);
      }
      setPending({ threadId: target.id, content });
      await postMessage(target.id, content, true);
      if (attached.length) {
        const sentIds = new Set(attached.map((a) => a.id));
        const threadId = target.id;
        setAnnotationsBy((prev) => ({
          ...prev,
          [threadId]: (prev[threadId] ?? []).filter((a) => !sentIds.has(a.id)),
        }));
      }
      return true;
    } catch (err) {
      setError(message(err));
      return false;
    } finally {
      // Refetch even on error so the chat shows whatever the engine recorded.
      if (target) {
        try {
          const { thread } = await getThread(target.id);
          upsertThread(thread);
        } catch {
          /* error already surfaced */
        }
      }
      setPending(null);
      setSending(false);
    }
  }

  const executorName = useCallback(
    (id: string) => executorDisplay(engine.executors.find((e) => e.id === id), id).name,
    [engine.executors],
  );

  const projectOptions = useMemo<ProjectOption[]>(() => {
    const seen = new Map<string, ProjectOption>();
    for (const p of projects.list) seen.set(p.path, { path: p.path, name: p.name });
    for (const t of threads) {
      if (!seen.has(t.projectPath)) {
        seen.set(t.projectPath, { path: t.projectPath, name: basename(t.projectPath) });
      }
    }
    return [...seen.values()];
  }, [projects, threads]);

  const defaultStyle = styles.defaultId ?? styles.list[0]?.id ?? "";

  const composer = (hero: boolean) => (
    <Composer
      key={active?.id ?? "draft"}
      onSubmit={handleSend}
      busy={busy}
      disabled={!engineOnline}
      autoFocus
      placeholder={
        engineOnline
          ? hero
            ? "Peça uma edição ou pergunte sobre o vídeo…"
            : "Peça um ajuste ou tire uma dúvida…"
          : "Engine offline"
      }
      controls={<ModelPicker engine={engine} />}
      attachments={activeAnnotations.map((a, i) => ({
        id: a.id,
        n: i + 1,
        summary: annotationSummary(a),
        note: a.note,
      }))}
      onRemoveAttachment={active ? (id) => removeAnnotation(active.id, id) : undefined}
      tray={
        hero ? (
          active ? (
            <ThreadTray thread={active} styles={styles.list} />
          ) : (
            <DraftTray
              draft={draft}
              projects={projectOptions}
              projectsRoot={projects.root}
              nextNumber={projects.nextNumber}
              askProject={askProject}
              styles={styles.list}
              defaultStyleId={defaultStyle}
              onChange={(next) => {
                // A project picked (or just created) refreshes the list and the next number.
                if (next.projectPath !== draft.projectPath) void reloadProjects();
                setDraft(next);
              }}
              onChangeRoot={changeProjectsRoot}
              onCreateCaption={() => {
                const style = styles.list.find((st) => st.id === (draft.styleId || defaultStyle));
                openCaptionBuilder("draft", null, draft.modules.caption ?? style?.modules?.caption ?? "");
              }}
            />
          )
        ) : undefined
      }
      suggestions={hero && engineOnline ? SUGGESTIONS : undefined}
    />
  );

  const captionList = library?.caption ?? [];
  let body;
  if (view === "captions") {
    body = (
      <CaptionBuilder
        key={`${builder.origin}:${builder.threadId ?? ""}:${builder.baseId}`}
        captions={captionList}
        baseId={builder.baseId || captionList[0]?.id || ""}
        threadId={builder.threadId}
        onClose={() => (builder.origin === "studio" ? openStudio("gallery") : setView("chat"))}
        onUse={builder.origin === "studio" ? undefined : takeCaption}
        onSaved={(preset) => {
          takeCaption(preset);
          setNotice({ text: `Legenda ${preset.name} salva.`, threadId: builder.threadId ?? "", reveal: false });
        }}
      />
    );
  } else if (view === "studio") {
    body = (
      <Studio
        key={studioStart}
        styles={styles.list}
        defaultStyleId={styles.defaultId}
        initial={studioStart}
        onUseStyle={(styleId) => startThread(undefined, styleId === defaultStyle ? "" : styleId)}
        onOpenCaption={(baseId) => openCaptionBuilder("studio", null, baseId)}
        onFromVideos={() => setView("style-new")}
        onStyleCreated={(style) => {
          void refresh();
          setNotice({ text: `Estilo ${style.name} salvo na galeria.`, threadId: "", reveal: false });
        }}
        onStyleUpdated={(style, restored) => {
          void refresh();
          setNotice({
            text: restored ? `${style.name} voltou ao original.` : `Estilo ${style.name} atualizado.`,
            threadId: "",
            reveal: false,
          });
        }}
      />
    );
  } else if (view === "style-new") {
    body = (
      <StyleCreator
        projectsRoot={projects.root}
        onCancel={() => openStudio("new")}
        onCreated={(thread) => {
          upsertThread(thread);
          setActiveId(thread.id);
          setView("chat");
          setPanelOpen(true);
          refreshThread(thread.id);
        }}
      />
    );
  } else if (view === "settings") {
    body = (
      <SettingsView
        section={settingsSection}
        engine={engine}
        engineOnline={engineOnline}
        onRetry={() => void refresh()}
        appearance={{ glass, ambient, setGlass, setAmbient }}
      />
    );
  } else if (active && (active.messages.length || pending?.threadId === active.id)) {
    body = (
      <ChatView
        thread={active}
        pending={pending?.threadId === active.id ? pending.content : null}
        executorName={executorName}
        onOpenPreview={() => setPanelOpen(true)}
        composer={composer(false)}
      />
    );
  } else {
    const project = basename(active?.projectPath ?? draft.projectPath) || null;
    body = <Hero project={project}>{composer(true)}</Hero>;
  }

  const sectionLabel = SETTINGS_SECTIONS.find((sct) => sct.id === settingsSection)?.label ?? "";
  const topTitle =
    view === "settings"
      ? sectionLabel
      : view === "captions"
        ? "Legenda"
        : view === "style-new"
          ? "Novo estilo"
          : view === "studio"
            ? "Estúdio"
            : active
            ? active.title
            : "Nova thread";
  const topProject =
    view === "settings"
      ? "Configurações"
      : view === "captions" || view === "style-new" || view === "studio"
        ? "Estilos"
        : active
          ? active.kind === "style"
            ? "Estilos"
            : basename(active.projectPath)
          : null;
  const showPanel = panelOpen && Boolean(active);

  const sidebarW = widthOr(sidebarWidth, SIDEBAR_W);
  const panelW = widthOr(panelWidth, PANEL_W);
  const layoutStyle = { "--sidebar-w": `${sidebarW}px`, "--panel-w": `${panelW}px` } as CSSProperties;
  const panelResize = (
    <ResizeHandle
      label="Redimensionar painel"
      edge="left"
      cssVar="--panel-w"
      rootRef={appRef}
      width={panelW}
      min={PANEL_W.min}
      max={() => Math.min(PANEL_W.max, window.innerWidth - MIN_MAIN_W - (sidebarOpen ? sidebarW : 0))}
      defaultWidth={PANEL_W.initial}
      onCommit={setPanelWidth}
    />
  );

  return (
    <div ref={appRef} className={`app${IS_MAC_TAURI ? " is-mac-tauri" : ""}`} style={layoutStyle}>
      {sidebarOpen ? (
        <Sidebar
          ref={searchRef}
          threads={threads}
          styles={styles.list}
          defaultStyleId={styles.defaultId}
          activeId={active?.id ?? null}
          drafting={view === "chat" && !active}
          settingsOpen={view === "settings"}
          settingsSection={settingsSection}
          onSettingsSection={setSettingsSection}
          onCloseSettings={() => setView("chat")}
          engineOnline={engineOnline}
          onSelect={selectThread}
          onNewThread={startThread}
          onPickStyle={(styleId) => startThread(draft.projectPath || undefined, styleId === defaultStyle ? "" : styleId)}
          onNewStyle={() => openStudio("new")}
          onNewCaption={() => openCaptionBuilder("studio", null, "")}
          onOpenStudio={() => openStudio("gallery")}
          studioOpen={view === "studio" || view === "captions" || view === "style-new"}
          onOpenSettings={() => setView((v) => (v === "settings" ? "chat" : "settings"))}
          onRetry={() => void refresh()}
          onCollapse={() => setSidebarOpen(false)}
          onSettle={(id, settled) => void settle(id, settled)}
          onSnooze={(id, until) => void snooze(id, until)}
          onDeleteProject={(project) => setDeleting({ ...project, trash: false, busy: false, error: null })}
          resizeHandle={
            <ResizeHandle
              label="Redimensionar sidebar"
              edge="right"
              cssVar="--sidebar-w"
              rootRef={appRef}
              width={sidebarW}
              min={SIDEBAR_W.min}
              max={() =>
                Math.min(SIDEBAR_W.max, window.innerWidth - MIN_MAIN_W - (showPanel ? panelW : 0))
              }
              defaultWidth={SIDEBAR_W.initial}
              onCommit={setSidebarWidth}
            />
          }
        />
      ) : null}

      <main className="main">
        <TopBar
          sidebarOpen={sidebarOpen}
          panelOpen={showPanel}
          project={topProject}
          title={topTitle}
          status={active ? <ThreadBadge thread={active} sending={sending} /> : null}
          onToggleSidebar={() => setSidebarOpen(true)}
          onTogglePanel={active ? () => setPanelOpen((v) => !v) : null}
          onNewThread={() => startThread()}
        />
        <div className="main-body">
          {connecting ? null : body}
          {notice && !error ? (
            <div className="toast is-notice" role="status">
              <CircleCheck size={15} strokeWidth={1.75} className="toast-icon" />
              <span className="toast-text" title={notice.text}>
                {notice.text}
              </span>
              {notice.reveal ? (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => void revealExport(notice.threadId).catch((err) => setError(message(err)))}
                >
                  <FolderSearch size={12} strokeWidth={2} />
                  Mostrar no Finder
                </button>
              ) : null}
              <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setNotice(null)}>
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="toast" role="alert">
              <CircleAlert size={15} strokeWidth={1.75} className="toast-icon" />
              <span className="toast-text" title={error}>
                {engineOnline ? error : "Engine offline. Rode npm run dev em engine/ (porta 8787)."}
              </span>
              {engineOnline ? (
                <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setError(null)}>
                  <X size={14} strokeWidth={1.75} />
                </button>
              ) : (
                <button type="button" className="btn btn-small" onClick={() => void refresh()}>
                  <RotateCw size={12} strokeWidth={2} />
                  Reconectar
                </button>
              )}
            </div>
          ) : null}
        </div>
      </main>

      {deleting ? (
        <ConfirmDialog
          title={`Excluir o projeto ${deleting.name}?`}
          confirmLabel={deleting.trash ? "Excluir e mover para a Lixeira" : "Excluir do Takekit"}
          busy={deleting.busy}
          error={deleting.error}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDeleteProject()}
        >
          <DeleteProjectBody
            deleting={deleting}
            threadCount={threads.filter((t) => t.projectPath === deleting.path).length}
            onTrash={(trash) => setDeleting({ ...deleting, trash, error: null })}
          />
        </ConfirmDialog>
      ) : null}

      {showPanel && active ? (
        active.kind === "style" ? (
          <StyleDraftPanel
            thread={active}
            onClose={() => setPanelOpen(false)}
            resizeHandle={panelResize}
            onPublished={(thread) => {
              if (thread) upsertThread(thread);
              void refresh();
              setNotice({ text: `Estilo salvo na galeria.`, threadId: active.id, reveal: false });
            }}
            onNewThread={(styleId) => startThread(undefined, styleId === defaultStyle ? "" : styleId)}
          />
        ) : (
          <PreviewPanel
            thread={active}
            style={styles.list.find((st) => st.id === active.styleId) ?? null}
            styleName={styleName(styles.list, active.styleId)}
            onClose={() => setPanelOpen(false)}
            annotations={activeAnnotations}
            onAnnotate={engineOnline ? (annotation) => addAnnotation(active.id, annotation) : undefined}
            render={renders.states[active.id] ?? { running: null, lastExport: active.lastExport ?? null, lastRender: active.lastRender ?? null }}
            engineOnline={engineOnline}
            onExport={() => void runRender(() => startExport(active.id))}
            onCancelRender={() => void cancelRender(active.id).catch((err) => setError(message(err)))}
            onRevealExport={() => void revealExport(active.id).catch((err) => setError(message(err)))}
            onSettle={() => void settle(active.id, true)}
            onChangeModules={(patch) => changeModules(active.id, patch)}
            onRerender={(captions) => void runRender(() => startPreviewRender(active.id, captions))}
            onCreateCaption={() => {
              const style = styles.list.find((st) => st.id === active.styleId);
              openCaptionBuilder("thread", active.id, active.modules?.caption ?? style?.modules?.caption ?? "");
            }}
            resizeHandle={panelResize}
          />
        )
      ) : null}
    </div>
  );
}

/** Stored widths come from localStorage; never trust them blindly. */
function widthOr(value: unknown, range: { min: number; initial: number; max: number }): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return range.initial;
  return Math.min(Math.max(Math.round(value), range.min), range.max);
}

function ThreadBadge({ thread, sending }: { thread: Thread; sending: boolean }) {
  if (sending || isThreadBusy(thread)) {
    return (
      <span className="badge is-running">
        <span className="badge-dot" />
        {thread.lastJobStatus === "queued" ? "Na fila" : thread.lastJobMode === "edit" ? "Editando" : "Rodando"}
      </span>
    );
  }
  if (thread.lastJobStatus === "failed") {
    return (
      <span className="badge is-failed">
        <span className="badge-dot" />
        Falhou
      </span>
    );
  }
  return null;
}

function DeleteProjectBody({
  deleting,
  threadCount,
  onTrash,
}: {
  deleting: { path: string; trash: boolean; busy: boolean };
  threadCount: number;
  onTrash: (trash: boolean) => void;
}) {
  return (
    <>
      <p>
        {threadCount === 1 ? "A thread" : `As ${threadCount} threads`} deste projeto (arquivadas inclusive){" "}
        {threadCount === 1 ? "sai" : "saem"} do Takekit, com o histórico dos jobs.
        {deleting.trash ? null : " Os arquivos continuam na pasta."}
      </p>
      <label className="confirm-check">
        <input
          type="checkbox"
          checked={deleting.trash}
          disabled={deleting.busy}
          onChange={(e) => onTrash(e.target.checked)}
        />
        <span>
          Também mover a pasta para a Lixeira
          <small>Vídeos, renders e exports vão juntos. Dá pra recuperar pela Lixeira do macOS.</small>
        </span>
      </label>
      <code className="confirm-path">{tildify(deleting.path)}</code>
    </>
  );
}
