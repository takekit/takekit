import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronRight, Folder, FolderCheck, FolderCog, FolderOpen, FolderPlus, FolderSearch, Laptop } from "lucide-react";
import { createProject, listDir, projectFolderName, projectSlug, type DirListing } from "../api/client";
import { basename, tildify } from "../lib/format";
import { IS_TAURI } from "../lib/platform";
import { Palette, PaletteFooter, PaletteRow, PaletteSearch } from "./Palette";
import type { ProjectOption } from "./ContextTray";

type View = { kind: "root" } | { kind: "browse"; path?: string } | { kind: "create" };

interface Item {
  id: string;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  /** Enter / click. */
  run: () => void;
  /** ⌘Enter: use this folder without opening it. */
  use?: () => void;
  section?: string;
}

/**
 * Folder picker for the thread's project: known projects, a disk browser, "new project"
 * (always <projects root>/<NN>-name) and the choice of that projects root.
 */
export function ProjectPicker({
  current,
  projects,
  projectsRoot,
  nextNumber,
  onSelect,
  onChangeRoot,
  onClose,
}: {
  current: string;
  projects: ProjectOption[];
  /** Where "Novo projeto" creates folders (config.projectsRoot). */
  projectsRoot: string;
  /** Number the next project folder gets. */
  nextNumber: number;
  onSelect: (path: string) => void;
  /** Makes `path` the projects root (engine config). */
  onChangeRoot: (path: string) => Promise<void>;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>({ kind: "root" });
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const browsePath = view.kind === "browse" ? view.path : undefined;
  useEffect(() => {
    if (view.kind !== "browse") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listDir(browsePath)
      .then((res) => !cancelled && setListing(res))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [view.kind, browsePath]);

  function go(next: View) {
    setView(next);
    setQuery("");
    setCursor(0);
    inputRef.current?.focus();
  }
  const browse = (path?: string) => go({ kind: "browse", path });
  const pick = (path: string) => {
    onSelect(path);
    onClose();
  };

  async function create(name: string) {
    try {
      const { path } = await createProject(name);
      pick(path);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+: /, "") : String(err));
    }
  }

  async function chooseRoot() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const chosen = await open({ directory: true, multiple: false, defaultPath: projectsRoot });
      if (typeof chosen === "string") await onChangeRoot(chosen);
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function finder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const chosen = await open({ directory: true, multiple: false, defaultPath: current || projectsRoot });
      if (typeof chosen === "string") pick(chosen);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const q = norm(query);
  const items = useMemo<Item[]>(() => {
    if (view.kind === "root") {
      const out: Item[] = [];
      const looksLikePath = /^(~|\/)/.test(query.trim());
      if (looksLikePath) {
        out.push({
          id: "path",
          icon: <FolderOpen size={16} strokeWidth={1.75} />,
          title: `Abrir ${query.trim()}`,
          subtitle: "Navegar a partir deste caminho",
          run: () => browse(query.trim()),
          section: "Caminho",
        });
      }
      for (const p of projects) {
        if (q && !norm(p.name).includes(q) && !norm(p.path).includes(q)) continue;
        const selected = p.path === current;
        out.push({
          id: `p:${p.path}`,
          icon: selected ? <FolderCheck size={16} strokeWidth={1.75} /> : <Folder size={16} strokeWidth={1.75} />,
          title: p.name,
          subtitle: tildify(p.path),
          trailing: selected ? <Check size={14} strokeWidth={2} /> : null,
          selected,
          run: () => pick(p.path),
          section: "Projetos",
        });
      }
      const sources: Item[] = [
        {
          id: "browse",
          icon: <FolderSearch size={16} strokeWidth={1.75} />,
          title: "Pasta local",
          subtitle: "Navegar pelas pastas do disco",
          run: () => browse(current ? parentOf(current) : undefined),
          section: "Origens",
        },
        {
          id: "create",
          icon: <FolderPlus size={16} strokeWidth={1.75} />,
          title: "Novo projeto",
          subtitle: `Cria ${projectFolderName(nextNumber, "nome")} em ${tildify(projectsRoot)}`,
          run: () => go({ kind: "create" }),
          section: "Origens",
        },
      ];
      if (IS_TAURI) {
        sources.push({
          id: "root",
          icon: <FolderCog size={16} strokeWidth={1.75} />,
          title: "Selecionar pasta de projetos…",
          subtitle: `Onde os projetos novos nascem. Atual: ${tildify(projectsRoot)}`,
          run: () => void chooseRoot(),
          section: "Origens",
        });
        sources.push({
          id: "finder",
          icon: <Laptop size={16} strokeWidth={1.75} />,
          title: "Escolher no Finder…",
          subtitle: "Abre o seletor de pastas do macOS",
          run: () => void finder(),
          section: "Origens",
        });
      }
      return [...out, ...sources.filter((s) => !q || norm(`${s.title} ${s.subtitle}`).includes(q))];
    }

    if (view.kind === "create") {
      const slug = projectSlug(query);
      if (!slug) return [];
      const folder = projectFolderName(nextNumber, slug);
      return [
        {
          id: "create-go",
          icon: <FolderPlus size={16} strokeWidth={1.75} />,
          title: `Criar ${folder}`,
          subtitle: `em ${tildify(projectsRoot)}`,
          run: () => void create(query),
        },
      ];
    }

    if (!listing) return [];
    const here = listing.path;
    const useHere: Item = {
      id: "use-here",
      icon: <FolderCheck size={16} strokeWidth={1.75} />,
      title: "Usar esta pasta",
      subtitle: tildify(here),
      run: () => pick(here),
      use: () => pick(here),
    };
    // Empty filter: "use this folder" leads. Typing: matches (or "create") lead, so Enter acts on them.
    const out: Item[] = q ? [] : [useHere];
    const dirs = listing.entries.filter((e) => !q || norm(e.name).includes(q));
    for (const e of dirs) {
      out.push({
        id: `d:${e.path}`,
        icon: <Folder size={16} strokeWidth={1.75} />,
        title: (
          <>
            {e.name}
            {e.path === current ? <span className="tag">atual</span> : e.project ? <span className="tag">projeto</span> : null}
          </>
        ),
        subtitle: e.videos ? `${e.videos} ${e.videos === 1 ? "vídeo" : "vídeos"}` : undefined,
        trailing: <ChevronRight size={14} strokeWidth={2} />,
        selected: e.path === current,
        run: () => browse(e.path),
        use: () => pick(e.path),
      });
    }
    const name = query.trim();
    if (q) out.push(useHere);
    if (/^(~|\/)/.test(name)) {
      out.unshift({
        id: "jump",
        icon: <FolderOpen size={16} strokeWidth={1.75} />,
        title: `Ir para ${name}`,
        run: () => browse(name),
      });
    }
    return out;
  }, [view, listing, query, projects, current, projectsRoot, nextNumber]);

  const active = Math.min(cursor, Math.max(0, items.length - 1));

  function up() {
    if (view.kind !== "browse") {
      if (view.kind !== "root") go({ kind: "root" });
      return;
    }
    // From the requested path, not the last listing: a fast double ⌫ climbs twice.
    const here = view.path ?? listing?.path;
    if (here && here !== "/") browse(parentOf(here));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((active + 1) % Math.max(1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((active - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (!item) return;
      if ((e.metaKey || e.ctrlKey) && item.use) item.use();
      else item.run();
    } else if (e.key === "ArrowRight" && view.kind === "browse" && !query) {
      const item = items[active];
      if (item?.id.startsWith("d:")) {
        e.preventDefault();
        item.run();
      }
    } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && !query) {
      e.preventDefault();
      up();
    }
  }

  const placeholder =
    view.kind === "root"
      ? "Buscar projeto ou colar um caminho…"
      : view.kind === "create"
        ? "Nome do novo projeto"
        : `Filtrar pastas em ${basename(listing?.path ?? "") || "…"}`;

  let section: string | undefined;
  return (
    <Palette label="Escolher projeto" onClose={onClose}>
      <PaletteSearch
        inputRef={inputRef}
        value={query}
        onChange={(v) => {
          setQuery(v);
          setCursor(0);
          setError(null);
        }}
        placeholder={placeholder}
        onBack={view.kind === "root" ? undefined : () => go({ kind: "root" })}
        onKeyDown={onKeyDown}
      />

      {view.kind === "browse" && listing ? <Breadcrumb path={listing.path} home={listing.home} onGo={browse} /> : null}

      <div className="palette-list" role="listbox" aria-label="Pastas" aria-activedescendant={items[active]?.id}>
        {items.map((item, i) => {
          const header = item.section && item.section !== section ? item.section : null;
          section = item.section;
          return (
            <div key={item.id}>
              {header ? <div className="palette-section">{header}</div> : null}
              <PaletteRow
                id={item.id}
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
                trailing={item.trailing}
                selected={item.selected}
                active={i === active}
                onClick={() => item.run()}
                onHover={() => setCursor(i)}
              />
            </div>
          );
        })}
        {view.kind === "browse" && loading && !listing ? <p className="palette-empty">Carregando…</p> : null}
        {view.kind === "browse" && listing && !listing.entries.length && !query ? (
          <p className="palette-empty">Sem subpastas aqui.</p>
        ) : null}
        {view.kind === "create" && !projectSlug(query) ? (
          <p className="palette-empty">
            {query.trim()
              ? "Use letras ou números no nome."
              : `O projeto nasce em ${tildify(projectsRoot)} como ${projectFolderName(nextNumber, "nome")}, já com input/, edit/, exports/ e briefing.md.`}
          </p>
        ) : null}
        {error ? <p className="palette-empty is-error">{error}</p> : null}
      </div>

      <PaletteFooter
        hints={
          view.kind === "browse"
            ? [
                [["↑", "↓"], "Navegar"],
                [["↵"], "Abrir"],
                [["⌘", "↵"], "Usar pasta"],
                [["⌫"], "Voltar"],
                [["esc"], "Fechar"],
              ]
            : [
                [["↑", "↓"], "Navegar"],
                [["↵"], "Selecionar"],
                ...(view.kind === "root" ? [] : ([[["⌫"], "Voltar"]] as Array<[string[], string]>)),
                [["esc"], "Fechar"],
              ]
        }
      />
    </Palette>
  );
}

function Breadcrumb({ path, home, onGo }: { path: string; home: string; onGo: (path: string) => void }) {
  const inHome = path === home || path.startsWith(`${home}/`);
  const rest = inHome ? path.slice(home.length) : path;
  const parts = rest.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [{ label: inHome ? "~" : "/", path: inHome ? home : "/" }];
  let acc = inHome ? home : "";
  for (const part of parts) {
    acc = `${acc}/${part}`;
    crumbs.push({ label: part, path: acc });
  }
  return (
    <nav className="palette-crumbs" aria-label="Caminho">
      {crumbs.map((c, i) => (
        <span key={c.path} className="crumb">
          {i ? <ChevronRight size={12} strokeWidth={2} className="crumb-sep" /> : null}
          <button type="button" disabled={i === crumbs.length - 1} onClick={() => onGo(c.path)}>
            {c.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

/** Case- and accent-insensitive match key. */
function norm(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function parentOf(path: string): string {
  const cut = path.replace(/\/+$/, "").lastIndexOf("/");
  return cut > 0 ? path.slice(0, cut) : "/";
}
