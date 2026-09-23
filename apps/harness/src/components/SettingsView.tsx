import { useEffect, useState, type ReactNode } from "react";
import { Blocks, Check, Copy, Keyboard, Lock, Palette, Server, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { engineBaseUrl, getHealth, type EngineHealth } from "../api/client";
import { tildify } from "../lib/format";
import { IS_TAURI } from "../lib/platform";
import { findModel } from "../lib/harness";
import { useCopy } from "../lib/hooks";
import { useHarnessSelection } from "../lib/useHarnessSelection";
import type { EngineConfigState } from "../lib/useEngineConfig";
import { HarnessMark } from "./HarnessIcon";
import { AccessPill, EffortPill, ModelPill } from "./ModelPicker";

export type SettingsSection = "general" | "agents" | "appearance" | "shortcuts" | "engine";

export const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string; icon: LucideIcon }> = [
  { id: "general", label: "Geral", icon: SlidersHorizontal },
  { id: "agents", label: "Agentes", icon: Blocks },
  { id: "appearance", label: "Aparência", icon: Palette },
  { id: "shortcuts", label: "Atalhos", icon: Keyboard },
  { id: "engine", label: "Engine", icon: Server },
];

export interface AppearancePrefs {
  glass: boolean;
  ambient: boolean;
  setGlass: (on: boolean) => void;
  setAmbient: (on: boolean) => void;
}

interface Props {
  section: SettingsSection;
  engine: EngineConfigState;
  engineOnline: boolean;
  onRetry: () => void;
  appearance: AppearancePrefs;
}

export function SettingsView({ section, engine, engineOnline, onRetry, appearance }: Props) {
  const needsEngine = section === "general" || section === "agents";
  return (
    <div className="settings">
      <div className="settings-inner">
        {needsEngine && (!engineOnline || !engine.data) ? (
          <Offline engineOnline={engineOnline} onRetry={onRetry} />
        ) : section === "general" ? (
          <General engine={engine} />
        ) : section === "agents" ? (
          <Agents engine={engine} />
        ) : section === "appearance" ? (
          <Appearance prefs={appearance} />
        ) : section === "shortcuts" ? (
          <Shortcuts />
        ) : (
          <Engine engine={engine} engineOnline={engineOnline} onRetry={onRetry} />
        )}
      </div>
    </div>
  );
}

/** Finder folder dialog → config.projectsRoot. */
async function chooseProjectsRoot(engine: EngineConfigState) {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const chosen = await open({ directory: true, multiple: false, defaultPath: engine.data?.config.projectsRoot });
  if (typeof chosen === "string") await engine.update({ projectsRoot: chosen });
}

/* ───────── Building blocks ───────── */

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="set-group">
      <header className="set-group-head">
        <h2>{title}</h2>
        {hint ? <p>{hint}</p> : null}
      </header>
      <div className="set-card">{children}</div>
    </section>
  );
}

function Row({
  title,
  description,
  locked,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  locked?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-title">
          {title}
          {locked ? <EnvTag /> : null}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="set-row-control">{children}</div> : null}
    </div>
  );
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch${on ? " is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="switch-thumb" />
    </button>
  );
}

function PathValue({ value }: { value: string }) {
  const { copied, copy } = useCopy();
  return (
    <span className="set-path">
      <code title={value}>{tildify(value)}</code>
      <button type="button" className="meta-btn" onClick={() => void copy(value)} aria-label="Copiar" title="Copiar">
        {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
      </button>
    </span>
  );
}

function EnvTag() {
  return (
    <span className="tag" title="Definido por variável de ambiente; tem prioridade sobre o config.json">
      <Lock size={10} strokeWidth={2} /> env
    </span>
  );
}

function Offline({ engineOnline, onRetry }: { engineOnline: boolean; onRetry: () => void }) {
  return (
    <div className="settings-offline">
      <p>
        {engineOnline
          ? "Carregando…"
          : "O engine está offline. Estas configurações ficam em ~/.takekit/config.json e são lidas por ele."}
      </p>
      {engineOnline ? null : (
        <button type="button" className="btn" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/* ───────── Sections ───────── */

function General({ engine }: { engine: EngineConfigState }) {
  const { data, locked } = engine;
  return (
    <>
      {data ? (
        <Group title="Projetos">
          <Row
            title="Pasta de projetos"
            description="Cada projeto novo nasce aqui como uma pasta numerada: 01-nome, 02-nome…"
            locked={locked.has("projectsRoot")}
          >
            <PathValue value={data.config.projectsRoot} />
            {IS_TAURI && !locked.has("projectsRoot") ? (
              <button type="button" className="btn btn-small" disabled={engine.saving} onClick={() => void chooseProjectsRoot(engine)}>
                Selecionar…
              </button>
            ) : null}
          </Row>
        </Group>
      ) : null}
      <Group title="Novas mensagens">
        <Row
          title="Modelo"
          description="Harness e modelo que executam o pipeline. Vale a partir do próximo job."
          locked={locked.has("executorId") || locked.has("model")}
        >
          <ModelPill engine={engine} side="bottom" align="end" variant="field" />
          <EffortPill engine={engine} side="bottom" align="end" variant="field" />
        </Row>
        <Row
          title="Permissões"
          description="Acesso total roda Claude, Codex, Grok Build e OpenCode sem pedir aprovação."
          locked={locked.has("skipPermissions")}
        >
          <AccessPill engine={engine} side="bottom" align="end" variant="field" />
        </Row>
      </Group>
    </>
  );
}

function Agents({ engine }: { engine: EngineConfigState }) {
  const { data, executors, locked, saving } = engine;
  const { selectHarness } = useHarnessSelection(engine);
  const current = data?.config.executorId;
  const bins: Record<string, string> = {
    "claude-code": data?.config.claudeBin ?? "claude",
    codex: "codex",
    "grok-build": "grok",
    opencode: "opencode",
  };

  return (
    <Group title="Harnesses" hint="CLIs de agente que o engine sabe rodar em modo headless.">
      {executors.map((e) => {
        const inUse = e.id === current;
        const def = findModel(e, e.defaultModel ?? "");
        return (
          <Row
            key={e.id}
            title={
              <span className="set-agent">
                <HarnessMark executorId={e.id} size={16} />
                {e.label}
              </span>
            }
            description={
              <>
                {e.models?.length ?? 0} modelos · padrão {def?.label ?? e.defaultModel ?? "?"} · binário{" "}
                <code>{bins[e.id] ?? e.id}</code>
              </>
            }
          >
            {inUse ? (
              <span className="set-badge">Em uso</span>
            ) : (
              <button
                type="button"
                className="btn btn-small"
                disabled={locked.has("executorId") || saving}
                onClick={() => selectHarness(e.id)}
              >
                Usar
              </button>
            )}
          </Row>
        );
      })}
    </Group>
  );
}

function Appearance({ prefs }: { prefs: AppearancePrefs }) {
  return (
    <Group title="Janela">
      <Row title="Transparência" description="Vidro na topbar, no composer, nos menus e nos painéis laterais.">
        <Switch on={prefs.glass} onChange={prefs.setGlass} label="Transparência" />
      </Row>
      <Row
        title="Luz ambiente"
        description="Brilho suave atrás da sidebar e do preview. No app desktop do macOS o vidro nativo substitui."
      >
        <Switch on={prefs.ambient} onChange={prefs.setAmbient} label="Luz ambiente" disabled={!prefs.glass} />
      </Row>
    </Group>
  );
}

const SHORTCUTS: Array<{ group: string; items: Array<[string, string[]]> }> = [
  {
    group: "Geral",
    items: [
      ["Nova thread", ["⌘", "N"]],
      ["Buscar threads", ["⌘", "K"]],
      ["Mostrar ou ocultar a sidebar", ["⌘", "B"]],
      ["Mostrar ou ocultar o preview", ["⌥", "⌘", "B"]],
      ["Configurações", ["⌘", ","]],
    ],
  },
  {
    group: "Composer",
    items: [
      ["Enviar", ["↵"]],
      ["Nova linha", ["⇧", "↵"]],
      ["Escolher modelo no menu", ["⌘", "1–9"]],
    ],
  },
  {
    group: "Player",
    items: [
      ["Reproduzir ou pausar", ["Espaço"]],
      ["Quadro anterior ou próximo", ["←", "→"]],
      ["Voltar ou avançar 1 segundo", ["⇧", "← →"]],
      ["Tela cheia", ["F"]],
      ["Mudo", ["M"]],
    ],
  },
  {
    group: "Timeline",
    items: [
      ["Anotar um intervalo", ["⇧", "arrastar"]],
      ["Zoom", ["⌘", "scroll"]],
      ["Cancelar seleção ou sair do seletor", ["Esc"]],
      ["Anexar anotação ao chat", ["↵"]],
    ],
  },
];

function Shortcuts() {
  return (
    <>
      {SHORTCUTS.map((g) => (
        <Group key={g.group} title={g.group}>
          {g.items.map(([label, keys]) => (
            <Row key={label} title={label}>
              <span className="set-keys">
                {keys.map((k) => (
                  <kbd key={k} className="keycap">
                    {k}
                  </kbd>
                ))}
              </span>
            </Row>
          ))}
        </Group>
      ))}
    </>
  );
}

function Engine({
  engine,
  engineOnline,
  onRetry,
}: {
  engine: EngineConfigState;
  engineOnline: boolean;
  onRetry: () => void;
}) {
  const [health, setHealth] = useState<EngineHealth | null>(null);
  useEffect(() => {
    if (!engineOnline) return;
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, [engineOnline]);
  const { data, locked } = engine;

  return (
    <>
      <Group title="Conexão">
        <Row title="Status" description={engineBaseUrl()}>
          {engineOnline ? (
            <span className="set-status is-online">
              <span className="engine-dot" /> Online
            </span>
          ) : (
            <button type="button" className="btn btn-small" onClick={onRetry}>
              Reconectar
            </button>
          )}
        </Row>
      </Group>
      {data ? (
        <Group title="Arquivos" hint="Somente leitura. Edite o config.json ou use variáveis de ambiente.">
          <Row title="Configuração">
            <PathValue value={data.configPath} />
          </Row>
          {health ? (
            <Row title="Dados (threads e jobs)">
              <PathValue value={health.dataDir} />
            </Row>
          ) : null}
          <Row title="Pipeline" locked={locked.has("pipelineRoot")}>
            <PathValue value={data.config.pipelineRoot} />
          </Row>
          <Row title="Claude CLI" locked={locked.has("claudeBin")}>
            <PathValue value={data.config.claudeBin} />
          </Row>
        </Group>
      ) : null}
    </>
  );
}
