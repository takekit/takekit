import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Captions,
  Clapperboard,
  Copy,
  LoaderCircle,
  Palette as PaletteIcon,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  MODULE_KEYS,
  MODULE_LABEL,
  duplicateStyle,
  restoreStyle,
  soundDemoUrl,
  stylePreviewUrl,
  styleThumbUrl,
  updateStyle,
  type ModuleKey,
  type ModuleSelection,
  type StyleSummary,
} from "../api/client";
import { usePresets } from "../lib/usePresets";
import { effectiveModules, patchFor } from "./Presets";
import { ListenButton, PresetGrid, PresetMedia, cameraTags } from "./PresetVisual";

/** view: watch and use · copy: a new style from this one · edit: change this one in place. */
type DetailMode = "view" | "copy" | "edit";
type Mode = { kind: "gallery" } | { kind: "new" } | { kind: "style"; id: string; detail: DetailMode };

/**
 * Estúdio (docs/style-kit): the styles as videos. Simple path first: watch a ready style,
 * use it. Then: make your own from a ready one (swap presets by looking at them, name it),
 * or from example videos (the agent decomposes them). Caption types live here too.
 */
export function Studio({
  styles,
  defaultStyleId,
  initial,
  onUseStyle,
  onOpenCaption,
  onFromVideos,
  onStyleCreated,
  onStyleUpdated,
}: {
  styles: StyleSummary[];
  defaultStyleId: string | null;
  initial?: "gallery" | "new";
  onUseStyle: (styleId: string) => void;
  /** Caption builder, starting from this type. */
  onOpenCaption: (baseId: string) => void;
  onFromVideos: () => void;
  onStyleCreated: (style: { id: string; name: string }) => void;
  /** Edited in place, or back to the original. */
  onStyleUpdated: (style: { id: string; name: string }, restored: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>({ kind: initial === "new" ? "new" : "gallery" });
  const library = usePresets("");

  if (mode.kind === "style") {
    const style = styles.find((s) => s.id === mode.id);
    if (style) {
      return (
        <StyleDetail
          key={`${style.id}:${mode.detail}`}
          style={style}
          mode={mode.detail}
          onBack={() => setMode({ kind: "gallery" })}
          onUse={() => onUseStyle(style.id)}
          onMode={(detail) => setMode({ kind: "style", id: style.id, detail })}
          onCreated={(created) => {
            onStyleCreated(created);
            setMode({ kind: "style", id: created.id, detail: "view" });
          }}
          onUpdated={(updated, restored) => {
            onStyleUpdated(updated, restored);
            setMode({ kind: "style", id: updated.id, detail: "view" });
          }}
        />
      );
    }
  }

  if (mode.kind === "new") {
    return (
      <div className="builder studio">
        <div className="builder-inner">
          <button type="button" className="link-btn studio-back" onClick={() => setMode({ kind: "gallery" })}>
            <ArrowLeft size={13} strokeWidth={2} />
            Estilos
          </button>
          <header className="builder-head">
            <div>
              <h1>Novo estilo</h1>
              <p>Comece de um estilo pronto e troque o que quiser, ou mostre vídeos de exemplo e deixe o agente montar.</p>
            </div>
          </header>
          <div className="studio-paths">
            <section className="studio-path is-simple">
              <span className="studio-path-icon">
                <Wand2 size={18} strokeWidth={1.75} />
              </span>
              <h2>Partir de um estilo pronto</h2>
              <p>Escolha um estilo, troque legenda, palcos, ritmo e som vendo cada opção, dê um nome.</p>
              <div className="studio-pick">
                {styles.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    className="studio-pick-card"
                    onClick={() => setMode({ kind: "style", id: style.id, detail: "copy" })}
                  >
                    <StyleVideo style={style} />
                    <span>{style.name}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="studio-path">
              <span className="studio-path-icon">
                <Clapperboard size={18} strokeWidth={1.75} />
              </span>
              <h2>A partir de vídeos de exemplo</h2>
              <p>Suba vídeos no estilo que você quer e marque os trechos que importam. O agente analisa e monta o estilo pra você revisar.</p>
              <button type="button" className="btn" onClick={onFromVideos}>
                <Sparkles size={14} strokeWidth={1.75} />
                Escolher vídeos
              </button>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="builder studio">
      <div className="builder-inner">
        <header className="builder-head">
          <div>
            <h1>Estilos</h1>
            <p>Passe o mouse para ver cada estilo em movimento. Clique para ver o que ele usa e começar um vídeo.</p>
          </div>
          <div className="builder-actions">
            <button type="button" className="btn btn-primary" onClick={() => setMode({ kind: "new" })}>
              <Plus size={14} strokeWidth={2} />
              Novo estilo
            </button>
          </div>
        </header>

        <div className="studio-styles">
          {styles.map((style) => (
            <button key={style.id} type="button" className="studio-style" onClick={() => setMode({ kind: "style", id: style.id, detail: "view" })}>
              <StyleVideo style={style} hoverPlay />
              <span className="studio-style-name">
                {style.name}
                {style.id === defaultStyleId ? <span className="preset-tag">padrão</span> : null}
                {style.edited ? <span className="preset-tag">editado</span> : null}
              </span>
              <StyleChips style={style} library={library} />
            </button>
          ))}
        </div>

        <section className="studio-captions">
          <header className="studio-section-head">
            <h2>
              <Captions size={15} strokeWidth={1.75} />
              Legendas prontas
            </h2>
            <button type="button" className="link-btn" onClick={() => onOpenCaption("")}>
              <Plus size={12} strokeWidth={2} />
              Criar legenda
            </button>
          </header>
          {library?.caption ? (
            <PresetGrid module="caption" list={library.caption} value={null} onPick={(id) => onOpenCaption(String(id))} />
          ) : (
            <p className="panel-note">Carregando…</p>
          )}
        </section>
      </div>
    </div>
  );
}

/** The style's preview loop (poster until it plays). */
function StyleVideo({ style, hoverPlay = false, large = false }: { style: StyleSummary; hoverPlay?: boolean; large?: boolean }) {
  if (!style.hasPreview) {
    return (
      <span className={`studio-video is-empty${large ? " is-large" : ""}`}>
        <PaletteIcon size={22} strokeWidth={1.25} />
      </span>
    );
  }
  return (
    <span className={`studio-video${large ? " is-large" : ""}`}>
      <video
        src={stylePreviewUrl(style)}
        poster={styleThumbUrl(style)}
        muted
        loop
        playsInline
        autoPlay={!hoverPlay}
        preload={hoverPlay ? "metadata" : "auto"}
        onPointerEnter={hoverPlay ? (e) => void e.currentTarget.play().catch(() => undefined) : undefined}
        onPointerLeave={
          hoverPlay
            ? (e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }
            : undefined
        }
      />
    </span>
  );
}

/** One line under a style card: its caption and palcos. */
function StyleChips({ style, library }: { style: StyleSummary; library: ReturnType<typeof usePresets> }) {
  const m = style.modules;
  if (!m || !library) return null;
  const caption = library.caption.find((p) => p.id === m.caption)?.name;
  const palcos = (m.stage ?? []).map((id) => library.stage.find((p) => p.id === id)?.palco ?? "").join(" ");
  return (
    <span className="studio-style-meta">
      {caption ? <span>{caption}</span> : null}
      {palcos ? <span>Palcos {palcos}</span> : null}
    </span>
  );
}

/**
 * One style: its video, what each module uses (as visuals), and the ways forward: use it now,
 * edit it (in place; the first edit keeps the original to restore), or make your own from it.
 */
function StyleDetail({
  style,
  mode,
  onBack,
  onUse,
  onMode,
  onCreated,
  onUpdated,
}: {
  style: StyleSummary;
  mode: DetailMode;
  onBack: () => void;
  onUse: () => void;
  onMode: (mode: DetailMode) => void;
  onCreated: (style: { id: string; name: string }) => void;
  onUpdated: (style: { id: string; name: string }, restored: boolean) => void;
}) {
  const library = usePresets(style.id);
  const customize = mode !== "view";
  const [override, setOverride] = useState<ModuleSelection>({});
  const [open, setOpen] = useState<ModuleKey | null>(customize ? "caption" : null);
  const [name, setName] = useState(mode === "copy" ? `${style.name} (meu)` : style.name);
  const [saving, setSaving] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = style.modules ?? {};
  const value = effectiveModules(base, override);
  const changed = MODULE_KEYS.filter((k) => override[k] !== undefined && override[k] !== null).length;
  const dirty = changed > 0 || name.trim() !== style.name;

  useEffect(() => setError(null), [override, name]);

  async function save() {
    setSaving(true);
    try {
      if (mode === "edit") {
        const { style: updated } = await updateStyle(style.id, { name: name.trim(), modules: value });
        onUpdated(updated, false);
      } else {
        const { style: created } = await duplicateStyle(style.id, { name: name.trim(), modules: value });
        onCreated(created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+: /, "") : String(err));
      setSaving(false);
    }
  }

  async function restore() {
    setSaving(true);
    try {
      const { style: restored } = await restoreStyle(style.id);
      onUpdated(restored, true);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+: /, "") : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="builder studio">
      <div className="builder-inner">
        <button type="button" className="link-btn studio-back" onClick={onBack}>
          <ArrowLeft size={13} strokeWidth={2} />
          Estilos
        </button>
        <div className="studio-detail">
          <div className="studio-detail-media">
            <StyleVideo style={style} large />
          </div>
          <div className="studio-detail-body">
            {customize ? (
              <label className="builder-field studio-name">
                <span className="builder-label">{mode === "edit" ? "Nome do estilo" : "Nome do seu estilo"}</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
            ) : (
              <h1 className="studio-title">{style.name}</h1>
            )}
            <p className="studio-sub">
              {mode === "edit"
                ? "Clique num módulo e troque pelo que você vê. Vale para os próximos vídeos e, no próximo preview, para as threads que usam este estilo."
                : mode === "copy"
                  ? `A partir de ${style.name}. Clique num módulo e escolha pelo que você vê.`
                  : "Legenda, palcos, câmera, ritmo e som deste estilo. Use como está, edite ou faça o seu a partir dele."}
            </p>
            <div className="builder-actions studio-detail-actions">
              {customize ? (
                <>
                  <button type="button" className="btn" onClick={() => onMode("view")}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving || !name.trim() || (mode === "edit" && !dirty)}
                    onClick={() => void save()}
                  >
                    {saving ? <LoaderCircle size={14} strokeWidth={2} className="spin" /> : null}
                    {mode === "edit" ? "Salvar alterações" : "Salvar estilo"}
                    {changed ? ` · ${changed} troca${changed > 1 ? "s" : ""}` : ""}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" onClick={onUse}>
                    Usar em um vídeo novo
                  </button>
                  <button type="button" className="btn" onClick={() => onMode("edit")}>
                    <Pencil size={13} strokeWidth={1.75} />
                    Editar
                  </button>
                  <button type="button" className="btn" onClick={() => onMode("copy")}>
                    <Copy size={13} strokeWidth={1.75} />
                    Fazer o meu a partir deste
                  </button>
                </>
              )}
            </div>
            {!customize && style.edited ? (
              <p className="studio-edited">
                {confirmRestore ? (
                  <>
                    <span>Desfazer todas as edições deste estilo?</span>
                    <button type="button" className="link-btn is-danger" disabled={saving} onClick={() => void restore()}>
                      Restaurar
                    </button>
                    <button type="button" className="link-btn" onClick={() => setConfirmRestore(false)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span>Editado por você.</span>
                    <button type="button" className="link-btn" onClick={() => setConfirmRestore(true)}>
                      <RotateCcw size={12} strokeWidth={1.75} />
                      Restaurar o original
                    </button>
                  </>
                )}
              </p>
            ) : null}
            {error ? <p className="export-error">{error}</p> : null}

            <div className="studio-modules">
              {MODULE_KEYS.map((key) => {
                const list = library?.[key] ?? [];
                const v = value[key];
                const ids = Array.isArray(v) ? v : v ? [v] : [];
                const isOpen = customize && open === key;
                const swapped = override[key] !== undefined && override[key] !== null;
                return (
                  <section key={key} className={`studio-module${isOpen ? " is-open" : ""}`}>
                    <button
                      type="button"
                      className="studio-module-head"
                      onClick={() => customize && setOpen(isOpen ? null : key)}
                      disabled={!customize}
                      aria-expanded={customize ? isOpen : undefined}
                    >
                      <span className="studio-module-label">
                        {MODULE_LABEL[key]}
                        {swapped ? <span className="preset-dot" aria-label="trocado" /> : null}
                      </span>
                      <span className="studio-module-current">
                        {ids.map((id) => {
                          const p = list.find((x) => x.id === id);
                          return p ? (
                            <span key={id} className={`studio-module-item is-${key}`}>
                              <PresetMedia module={key} preset={p} />
                              <span className="studio-module-name">
                                {p.name}
                                {key === "soundEffects" && p.description ? <small>{p.description}</small> : null}
                                {key === "camera" ? <small>{cameraTags(p.visual).join(" · ")}</small> : null}
                              </span>
                            </span>
                          ) : null;
                        })}
                      </span>
                      {customize ? <span className="studio-module-cta">{isOpen ? "Fechar" : "Trocar"}</span> : null}
                    </button>
                    {key === "soundEffects" && !isOpen && typeof v === "string" ? (
                      <div className="studio-module-listen">
                        <ListenButton url={soundDemoUrl(v, { styleId: style.id })} label="Ouvir com sua voz" />
                      </div>
                    ) : null}
                    {isOpen ? (
                      <PresetGrid
                        module={key}
                        list={list}
                        value={v}
                        styleValue={base[key]}
                        styleId={style.id}
                        onPick={(picked) => setOverride((prev) => ({ ...prev, ...patchFor(key, picked, base[key]) }))}
                      />
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
