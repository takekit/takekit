import { useState, type ReactNode } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal, Wand2 } from "lucide-react";
import {
  MODULE_KEYS,
  MODULE_LABEL,
  type ModuleKey,
  type ModuleSelection,
  type PresetLibrary,
  type PresetSummary,
} from "../api/client";
import { PresetGrid, PresetMedia } from "./PresetVisual";
import { Popover } from "./ui";

/** The thread's (or draft's) swap over the style's pick, per module. */
export function effectiveModules(style: ModuleSelection | null | undefined, override: ModuleSelection | null | undefined): ModuleSelection {
  const out: ModuleSelection = {};
  for (const key of MODULE_KEYS) {
    const value = override?.[key] ?? style?.[key];
    if (value !== undefined && value !== null) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

const swappedCount = (override: ModuleSelection | null | undefined) =>
  MODULE_KEYS.filter((k) => override?.[k] !== undefined && override?.[k] !== null).length;

/** "Hetrixo + Alvito", or "A · B · C" for the stage list. */
export function valueLabel(key: ModuleKey, value: ModuleSelection[ModuleKey], list: PresetSummary[] | undefined): string {
  if (value === undefined || value === null) return "Do estilo";
  if (key === "stage") {
    const ids = value as string[];
    return ids.map((id) => list?.find((p) => p.id === id)?.palco ?? id).join(" · ") || "Nenhum";
  }
  return list?.find((p) => p.id === value)?.name ?? String(value);
}

/** Pick → override patch: the style's own pick clears the swap instead of pinning it. */
export function patchFor(key: ModuleKey, value: string | string[], styleValue: ModuleSelection[ModuleKey]): ModuleSelection {
  const same = Array.isArray(value) ? JSON.stringify(value) === JSON.stringify(styleValue ?? []) : value === styleValue;
  return { [key]: same ? null : value };
}

/** Small visual of the current pick (first stage for the stage list). */
function CurrentThumb({ module, value, list, background, styleId }: {
  module: ModuleKey;
  value: ModuleSelection[ModuleKey];
  list: PresetSummary[];
  background?: string;
  styleId?: string;
}) {
  const id = Array.isArray(value) ? value[0] : value;
  const preset = list.find((p) => p.id === id);
  if (!preset) return <span className="pv-thumb is-empty" />;
  if (module === "stage" && Array.isArray(value)) {
    return (
      <span className="pv-thumb-stack">
        {value.map((v) => {
          const p = list.find((x) => x.id === v);
          return p ? (
            <span key={v} className="pv-thumb is-stage">
              <PresetMedia module="stage" preset={p} compact />
            </span>
          ) : null;
        })}
      </span>
    );
  }
  return (
    <span className={`pv-thumb is-${module}`}>
      <PresetMedia module={module} preset={preset} background={background} styleId={styleId} compact />
    </span>
  );
}

/**
 * "Presets" of the preview panel. Each module shows what it looks like; clicking opens its
 * cards right below. Caption, transitions and SFX can be redrawn on the preview right away;
 * stages and cuts need the agent's next edit.
 */
export function ThreadPresets({
  styleModules,
  override,
  library,
  disabled,
  background,
  styleId,
  onChange,
  onCreateCaption,
  apply,
}: {
  styleModules: ModuleSelection | null;
  override: ModuleSelection | null | undefined;
  library: PresetLibrary | null;
  disabled?: boolean;
  /** Caption previews over this footage ("thread:<id>"). */
  background?: string;
  styleId?: string;
  onChange: (patch: ModuleSelection) => void;
  onCreateCaption: () => void;
  apply: ReactNode;
}) {
  const [open, setOpen] = useState<ModuleKey | null>(null);
  if (!styleModules) {
    return (
      <section className="panel-section">
        <h3>Presets</h3>
        <p className="panel-note">Este estilo ainda não tem presets.</p>
      </section>
    );
  }
  const value = effectiveModules(styleModules, override);
  return (
    <section className="panel-section">
      <h3>Presets</h3>
      <div className="presets-rows">
        {MODULE_KEYS.map((key) => {
          const swapped = override?.[key] !== undefined && override?.[key] !== null;
          const list = library?.[key] ?? [];
          const isOpen = open === key;
          return (
            <div key={key} className={`preset-row${isOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="preset-row-head"
                onClick={() => setOpen(isOpen ? null : key)}
                disabled={disabled || !library}
                aria-expanded={isOpen}
              >
                <CurrentThumb module={key} value={value[key]} list={list} background={background} styleId={styleId} />
                <span className="preset-row-text">
                  <span className="preset-row-label">{MODULE_LABEL[key]}</span>
                  <span className="preset-row-value">
                    {key === "stage" ? stageNames(value.stage, list) : valueLabel(key, value[key], list)}
                    {swapped ? <span className="preset-dot" aria-label="trocado" /> : null}
                  </span>
                </span>
                <ChevronDown size={13} strokeWidth={2} className={`preset-row-caret${isOpen ? " is-open" : ""}`} />
              </button>
              {isOpen ? (
                <div className="preset-row-body">
                  <PresetGrid
                    module={key}
                    list={list}
                    value={value[key]}
                    styleValue={styleModules[key]}
                    background={background}
                    styleId={styleId}
                    compact
                    onPick={(v) => onChange(patchFor(key, v, styleModules[key]))}
                  />
                  <div className="preset-row-actions">
                    {swapped ? (
                      <button type="button" className="link-btn" onClick={() => onChange({ [key]: null })}>
                        <RotateCcw size={12} strokeWidth={1.75} />
                        Voltar ao do estilo
                      </button>
                    ) : null}
                    {key === "caption" ? (
                      <button type="button" className="link-btn" onClick={onCreateCaption}>
                        <Wand2 size={12} strokeWidth={1.75} />
                        Ajustar ou criar legenda
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {apply}
    </section>
  );
}

function stageNames(ids: string[] | null | undefined, list: PresetSummary[]): string {
  return (ids ?? []).map((id) => list.find((p) => p.id === id)?.name.replace(/^[A-D] · /, "") ?? id).join(", ") || "Nenhum";
}

/** Tray chip of a new thread: the presets it starts with, picked by looking at them. */
export function DraftPresetsChip({
  styleModules,
  override,
  library,
  styleId,
  onChange,
  onCreateCaption,
}: {
  styleModules: ModuleSelection | null;
  override: ModuleSelection;
  library: PresetLibrary | null;
  styleId?: string;
  onChange: (next: ModuleSelection) => void;
  onCreateCaption: () => void;
}) {
  const [module, setModule] = useState<ModuleKey>("caption");
  if (!styleModules) return null;
  const count = swappedCount(override);
  const value = effectiveModules(styleModules, override);
  const set = (patch: ModuleSelection) => {
    const next: Record<string, unknown> = { ...override };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    onChange(next as ModuleSelection);
  };
  const swapped = override[module] !== undefined && override[module] !== null;
  return (
    <Popover
      side="bottom"
      align="start"
      className="menu presets-menu"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={`chip${open ? " is-open" : ""}`}
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Legenda, palcos, cortes, som e transições"
          disabled={!library}
        >
          <SlidersHorizontal size={13} strokeWidth={1.75} />
          <span>{count ? `Presets · ${count} trocado${count > 1 ? "s" : ""}` : "Presets do estilo"}</span>
          <ChevronDown size={11} strokeWidth={2} className="chip-caret" />
        </button>
      )}
    >
      {() => (
        <div className="presets-picker">
          <nav className="presets-tabs" aria-label="Módulos">
            {MODULE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`presets-tab${module === key ? " is-active" : ""}`}
                onClick={() => setModule(key)}
              >
                <span>{MODULE_LABEL[key]}</span>
                <small>{valueLabel(key, value[key], library?.[key])}</small>
                {override[key] ? <span className="preset-dot" aria-label="trocado" /> : null}
              </button>
            ))}
          </nav>
          <div className="presets-options">
            <PresetGrid
              module={module}
              list={library?.[module] ?? []}
              value={value[module]}
              styleValue={styleModules[module]}
              styleId={styleId}
              onPick={(v) => set(patchFor(module, v, styleModules[module]))}
            />
            <div className="preset-row-actions">
              {swapped ? (
                <button type="button" className="link-btn" onClick={() => set({ [module]: null })}>
                  <RotateCcw size={12} strokeWidth={1.75} />
                  Voltar ao do estilo
                </button>
              ) : null}
              {module === "caption" ? (
                <button type="button" className="link-btn" onClick={onCreateCaption}>
                  <Wand2 size={12} strokeWidth={1.75} />
                  Ajustar ou criar legenda
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Popover>
  );
}
