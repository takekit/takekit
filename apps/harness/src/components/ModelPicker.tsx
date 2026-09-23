import { useMemo, useState } from "react";
import { Check, ChevronDown, Lock, LockOpen, Search, Star } from "lucide-react";
import type { ExecutorInfo, ModelOption } from "../api/client";
import { usePersistentState } from "../lib/hooks";
import { effortLabel, favKey, findModel, modelLabel } from "../lib/harness";
import { useHarnessSelection } from "../lib/useHarnessSelection";
import { executorDisplay, type EngineConfigState } from "../lib/useEngineConfig";
import { HarnessMark } from "./HarnessIcon";
import { Popover } from "./ui";

interface PillProps {
  engine: EngineConfigState;
  side?: "top" | "bottom";
  align?: "start" | "end";
  /** Selector the menu must open past (the composer, so it never covers the text). */
  clear?: string;
  /** "field" = bordered dropdown for settings rows. */
  variant?: "ghost" | "field";
}

/** Composer controls: model (per harness), reasoning effort, access. Writes to the engine config. */
export function ModelPicker({ engine }: { engine: EngineConfigState }) {
  if (!engine.data) {
    return (
      <button type="button" className="pill" disabled>
        <span>Engine offline</span>
      </button>
    );
  }
  return (
    <>
      <ModelPill engine={engine} side="top" clear=".composer" />
      <EffortPill engine={engine} side="top" clear=".composer" />
      <AccessPill engine={engine} side="top" clear=".composer" />
    </>
  );
}

const pillClass = (open: boolean, variant: PillProps["variant"]) =>
  `pill${variant === "field" ? " is-field" : ""}${open ? " is-open" : ""}`;

export function ModelPill({ engine, side = "top", align = "start", clear, variant }: PillProps) {
  const { data, executors, locked, saving } = engine;
  const { selectModel } = useHarnessSelection(engine);
  const [favorites, setFavorites] = usePersistentState<string[]>("takekit.favoriteModels", []);
  if (!data) return null;

  const { executorId, model } = data.config;
  const executor = executors.find((e) => e.id === executorId);
  const modelLocked = locked.has("executorId") || locked.has("model");

  return (
    <Popover
      side={side}
      align={align}
      clear={clear}
      className="menu model-menu"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={pillClass(open, variant)}
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={`${executorDisplay(executor, executorId).name} · ${model}`}
        >
          <HarnessMark executorId={executorId} size={15} />
          <span className="pill-strong">{modelLabel(executor, model)}</span>
          <ChevronDown size={12} strokeWidth={2} className="pill-caret" />
        </button>
      )}
    >
      {(close) => (
        <ModelMenu
          executors={executors}
          executorId={executorId}
          model={model}
          favorites={favorites}
          disabled={modelLocked || saving}
          onToggleFavorite={(key) =>
            setFavorites((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
          }
          onSelect={(id, m) => {
            selectModel(id, m);
            close();
          }}
        />
      )}
    </Popover>
  );
}

export function EffortPill({ engine, side = "top", align = "start", clear, variant }: PillProps) {
  const { data, executors, locked, saving } = engine;
  const { selectEffort } = useHarnessSelection(engine);
  if (!data) return null;

  const { executorId, model, effort } = data.config;
  const current = findModel(
    executors.find((e) => e.id === executorId),
    model,
  );
  const efforts = current?.efforts ?? [];
  if (!efforts.length) return null;
  const shownEffort = effort || current?.defaultEffort || "";

  return (
    <Popover
      side={side}
      align={align}
      clear={clear}
      className="menu effort-menu"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={pillClass(open, variant)}
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Reasoning"
        >
          <span>{shownEffort ? effortLabel(shownEffort) : "Padrão"}</span>
          <ChevronDown size={12} strokeWidth={2} className="pill-caret" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-label">
            Reasoning
            {locked.has("effort") ? <EnvTag /> : null}
          </div>
          {efforts.map((level) => (
            <button
              key={level}
              type="button"
              className={`menu-item${level === shownEffort ? " is-selected" : ""}`}
              disabled={locked.has("effort") || saving}
              onClick={() => {
                selectEffort(level);
                close();
              }}
            >
              <span className="menu-item-text">{effortLabel(level)}</span>
              <Check size={14} strokeWidth={2} className="menu-check" />
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}

export function AccessPill({ engine, side = "top", align = "start", clear, variant }: PillProps) {
  const { data, locked, saving, update } = engine;
  if (!data) return null;
  const { skipPermissions } = data.config;

  return (
    <Popover
      side={side}
      align={align}
      clear={clear}
      className="menu access-menu"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={pillClass(open, variant)}
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {skipPermissions ? <LockOpen size={13} strokeWidth={1.75} /> : <Lock size={13} strokeWidth={1.75} />}
          <span>{skipPermissions ? "Acesso total" : "Supervisionado"}</span>
          <ChevronDown size={12} strokeWidth={2} className="pill-caret" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-label">
            Permissões do agente
            {locked.has("skipPermissions") ? <EnvTag /> : null}
          </div>
          {[
            {
              value: true,
              icon: <LockOpen size={14} strokeWidth={1.75} />,
              title: "Acesso total",
              hint: "Roda sem pedir aprovação. Vale para todos os harnesses.",
            },
            {
              value: false,
              icon: <Lock size={14} strokeWidth={1.75} />,
              title: "Supervisionado",
              hint: "Pede aprovação. Rodando em segundo plano, ações sensíveis ficam bloqueadas.",
            },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              className={`menu-item menu-item-2line${opt.value === skipPermissions ? " is-selected" : ""}`}
              disabled={locked.has("skipPermissions") || saving}
              onClick={() => {
                if (opt.value !== skipPermissions) void update({ skipPermissions: opt.value });
                close();
              }}
            >
              <span className="menu-item-icon">{opt.icon}</span>
              <span className="menu-item-text">
                {opt.title}
                <small className="wrap">{opt.hint}</small>
              </span>
              <Check size={14} strokeWidth={2} className="menu-check" />
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}

function EnvTag() {
  return (
    <span className="tag" title="Definido por variável de ambiente">
      <Lock size={10} strokeWidth={2} /> env
    </span>
  );
}

interface Row {
  executor: ExecutorInfo;
  model: ModelOption;
  custom?: boolean;
}

function ModelMenu({
  executors,
  executorId,
  model,
  favorites,
  disabled,
  onToggleFavorite,
  onSelect,
}: {
  executors: ExecutorInfo[];
  executorId: string;
  model: string;
  favorites: string[];
  disabled: boolean;
  onToggleFavorite: (key: string) => void;
  onSelect: (executorId: string, modelId: string) => void;
}) {
  const [tab, setTab] = useState<string>(() => executorId);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const rows = useMemo<Row[]>(() => {
    const all: Row[] = executors.flatMap((executor) => (executor.models ?? []).map((m) => ({ executor, model: m })));
    const q = query.trim().toLowerCase();
    if (q) {
      const hits = all.filter(
        ({ executor, model: m }) =>
          m.label.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          executor.label.toLowerCase().includes(q),
      );
      // Unknown id: offer it as a custom model for the harness in view.
      const target = executors.find((e) => e.id === (tab === "fav" ? executorId : tab));
      if (target && !all.some(({ model: m }) => m.id.toLowerCase() === q)) {
        hits.push({ executor: target, model: { id: query.trim(), label: query.trim() }, custom: true });
      }
      return hits;
    }
    if (tab === "fav") {
      return all.filter(({ executor, model: m }) => favorites.includes(favKey(executor.id, m.id)));
    }
    return all.filter(({ executor }) => executor.id === tab);
  }, [executors, query, tab, favorites, executorId]);

  const active = Math.min(cursor, Math.max(0, rows.length - 1));
  const pick = (row: Row | undefined) => row && !disabled && onSelect(row.executor.id, row.model.id);

  return (
    <div className="model-picker">
      <nav className="model-rail" aria-label="Harnesses">
        <button
          type="button"
          className={`rail-btn${tab === "fav" && !query ? " is-active" : ""}`}
          onClick={() => {
            setTab("fav");
            setQuery("");
            setCursor(0);
          }}
          title="Favoritos"
          aria-label="Favoritos"
        >
          <Star size={15} strokeWidth={1.75} />
        </button>
        {executors.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`rail-btn${tab === e.id && !query ? " is-active" : ""}`}
            onClick={() => {
              setTab(e.id);
              setQuery("");
              setCursor(0);
            }}
            title={e.label}
            aria-label={e.label}
          >
            <HarnessMark executorId={e.id} size={18} />
          </button>
        ))}
      </nav>

      <div className="model-main">
        <label className="model-search">
          <Search size={14} strokeWidth={1.75} />
          <input
            autoFocus
            value={query}
            placeholder="Buscar modelos…"
            spellCheck={false}
            aria-label="Buscar modelos"
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor(Math.min(active + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor(Math.max(active - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(rows[active]);
              } else if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
                e.preventDefault();
                pick(rows[Number(e.key) - 1]);
              }
            }}
          />
        </label>

        <div className="model-list" role="listbox" aria-label="Modelos">
          {!query ? (
            <div className="model-list-title">
              {tab === "fav" ? "Favoritos" : executors.find((e) => e.id === tab)?.label}
            </div>
          ) : null}
          {rows.map((row, i) => {
            const key = favKey(row.executor.id, row.model.id);
            const selected =
              row.executor.id === executorId &&
              (row.model.id === model || Boolean(row.model.aliases?.includes(model)));
            const fav = favorites.includes(key);
            return (
              <div
                key={`${key}${row.custom ? ":custom" : ""}`}
                role="option"
                aria-selected={selected}
                className={`model-row${i === active ? " is-cursor" : ""}${selected ? " is-selected" : ""}`}
                onMouseEnter={() => setCursor(i)}
              >
                <button type="button" className="model-row-main" disabled={disabled} onClick={() => pick(row)}>
                  <span className="model-row-name">
                    {row.custom ? `Usar “${row.model.id}”` : row.model.label}
                    {selected ? <Check size={13} strokeWidth={2.25} className="model-row-check" /> : null}
                  </span>
                  <span className="model-row-sub">
                    <HarnessMark executorId={row.executor.id} size={12} />
                    {row.executor.label}
                    {row.custom ? " · ID personalizado" : ""}
                  </span>
                </button>
                {i < 9 ? <kbd className="kbd model-row-kbd">⌘{i + 1}</kbd> : null}
                {row.custom ? null : (
                  <button
                    type="button"
                    className={`star-btn${fav ? " is-fav" : ""}`}
                    aria-label={fav ? "Remover dos favoritos" : "Favoritar"}
                    aria-pressed={fav}
                    onClick={() => onToggleFavorite(key)}
                  >
                    <Star size={13} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            );
          })}
          {!rows.length ? (
            <p className="model-empty">
              {tab === "fav" && !query ? "Marque modelos com ★ para vê-los aqui." : "Nenhum modelo encontrado."}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
