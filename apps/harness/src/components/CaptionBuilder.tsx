import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Save, SlidersHorizontal } from "lucide-react";
import {
  getPreset,
  listFonts,
  projectSlug,
  savePreset,
  type CaptionPreset,
  type PresetSummary,
} from "../api/client";
import { invalidatePresets } from "../lib/usePresets";
import { CaptionStill } from "./CaptionStill";
import { PresetGrid } from "./PresetVisual";

type Anim = CaptionPreset["animation"];

const CASES: Array<[CaptionPreset["font"]["case"], string]> = [
  ["sentence", "Frase"],
  ["upper", "MAIÚSCULA"],
  ["lower", "minúscula"],
  ["preserve", "Como falado"],
];
const ANIM_IN: Array<[Anim["in"], string]> = [
  ["rise", "Subir"],
  ["pop", "Pop"],
  ["fade", "Fade"],
  ["blur", "Foco"],
  ["cut", "Corte"],
];
const ANIM_OUT: Array<[Anim["out"], string]> = [
  ["fade", "Fade"],
  ["cut", "Corte"],
];

/** Sample phrases: enough text to judge entrance, hold, exit and pacing. */
const SAMPLE = ["Isso *muda* tudo", "no seu próximo vídeo", "e quase ninguém percebe", "comenta *EU QUERO*"].join("\n");

/**
 * Caption builder (docs/style-kit/SPEC-EXPANSION.md). Simple first: pick one of the ready
 * caption types by watching them; use it as is, or name a copy. "Configuração avançada"
 * opens every field of the picked type (fonts, colors, outline, box, animation, rhythm),
 * drawn live by the same renderer the pipeline uses.
 */
export function CaptionBuilder({
  captions,
  baseId,
  threadId,
  onClose,
  onSaved,
  onUse,
}: {
  /** Library captions, the ready-made types. */
  captions: PresetSummary[];
  baseId: string;
  /** Opened from a thread: its footage is the background. */
  threadId: string | null;
  onClose: () => void;
  onSaved: (preset: { id: string; name: string }) => void;
  /** Opened for a thread / new thread: use a ready type as is (no copy). */
  onUse?: (preset: { id: string; name: string }) => void;
}) {
  const [base, setBase] = useState(baseId || captions[0]?.id || "");
  const [preset, setPreset] = useState<CaptionPreset | null>(null);
  const [dirty, setDirty] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [name, setName] = useState("");
  const [fonts, setFonts] = useState<string[]>([]);
  const [text, setText] = useState(SAMPLE);
  const [layout, setLayout] = useState<"face" | "canvas">("face");
  const [background, setBackground] = useState(threadId ? `thread:${threadId}` : "auto");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (!base && captions[0]) setBase(captions[0].id);
  }, [base, captions]);

  useEffect(() => {
    if (!advanced || fonts.length) return;
    listFonts()
      .then((res) => setFonts(res.fonts))
      .catch(() => setFonts([]));
  }, [advanced, fonts.length]);

  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    getPreset<CaptionPreset>("caption", base)
      .then(({ preset: p }) => {
        if (cancelled) return;
        setPreset(withDefaults(p));
        setDirty(false);
        setName(`${p.name} (minha)`);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [base]);

  const id = useMemo(() => projectSlug(name), [name]);
  const baseName = captions.find((c) => c.id === base)?.name ?? "";
  const set = <K extends keyof CaptionPreset>(key: K, value: CaptionPreset[K]) => {
    setDirty(true);
    setPreset((p) => (p ? { ...p, [key]: value } : p));
  };

  async function save(overwrite: boolean) {
    if (!preset || !id) return;
    setSaving(true);
    setError(null);
    try {
      const { preset: saved } = await savePreset("caption", { ...preset, id, name: name.trim() }, overwrite);
      invalidatePresets();
      onSaved(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message.replace(/^\d+: /, "") : String(err);
      setConflict(/Já existe/.test(msg));
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const fontOptions = (current: string) => (fonts.includes(current) || !current ? fonts : [current, ...fonts]);
  const canUse = Boolean(onUse) && !dirty && Boolean(base);

  return (
    <div className="builder">
      <div className="builder-inner">
        <header className="builder-head is-sticky">
          <div>
            <h1>Legenda</h1>
            <p>Escolha um tipo pronto olhando a animação. Quer mudar alguma coisa? Abra a configuração avançada.</p>
          </div>
          <div className="builder-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            {canUse ? (
              <button type="button" className="btn btn-primary" onClick={() => onUse?.({ id: base, name: baseName })}>
                <Check size={14} strokeWidth={2.25} />
                Usar {baseName}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!preset || !id || saving || !dirty} onClick={() => void save(false)}>
                <Save size={14} strokeWidth={2} />
                Salvar legenda
              </button>
            )}
          </div>
        </header>
        {error ? (
          <p className="export-error builder-error">
            <span>{error}</span>
            {conflict ? (
              <button type="button" className="btn btn-small" onClick={() => void save(true)}>
                Substituir
              </button>
            ) : null}
          </p>
        ) : null}

        <div className="builder-grid">
          <div className="builder-form">
            <section className="builder-types" aria-label="Tipos de legenda">
              <h2 className="builder-step">Tipos prontos</h2>
              <PresetGrid
                module="caption"
                list={captions}
                value={base}
                background={background}
                onPick={(v) => {
                  if (v !== base) setBase(String(v));
                }}
              />
            </section>

            <button
              type="button"
              className={`builder-advanced-toggle${advanced ? " is-open" : ""}`}
              onClick={() => setAdvanced((v) => !v)}
              aria-expanded={advanced}
            >
              <SlidersHorizontal size={14} strokeWidth={1.75} />
              <span>
                Configuração avançada
                <small>{advanced ? "Fonte, cor, contorno, caixa, animação e ritmo" : `Ajustar ${baseName || "este tipo"} campo a campo`}</small>
              </span>
              <ChevronDown size={14} strokeWidth={2} className="builder-advanced-caret" />
            </button>

            {advanced && preset ? (
              <>
                {dirty ? (
                  <Field label="Nome da sua legenda" hint={id ? `id ${id}` : undefined}>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Contorno amarelo" />
                  </Field>
                ) : null}
                <Group title="Animação">
                  <Field label="Entrada">
                    <Segmented value={preset.animation.in} options={ANIM_IN} onChange={(v) => set("animation", { ...preset.animation, in: v })} />
                  </Field>
                  <Slider label="Duração da entrada" unit="f" value={preset.animation.inFrames} min={1} max={15} onChange={(v) => set("animation", { ...preset.animation, inFrames: v })} />
                  <Field label="Saída">
                    <Segmented value={preset.animation.out} options={ANIM_OUT} onChange={(v) => set("animation", { ...preset.animation, out: v })} />
                  </Field>
                </Group>

                <Group title="Fonte">
                  <Field label="Texto">
                    <FontSelect value={preset.font.sans} fonts={fontOptions(preset.font.sans)} onChange={(v) => set("font", { ...preset.font, sans: v })} />
                  </Field>
                  <Field label="Ênfase">
                    <FontSelect value={preset.font.accent} fonts={fontOptions(preset.font.accent)} onChange={(v) => set("font", { ...preset.font, accent: v })} />
                  </Field>
                  <Field label="Caixa">
                    <Segmented value={preset.font.case} options={CASES} onChange={(v) => set("font", { ...preset.font, case: v })} />
                  </Field>
                  <Slider label="Espaçamento" value={preset.font.tracking ?? 0} min={-6} max={8} onChange={(v) => set("font", { ...preset.font, tracking: v })} />
                </Group>

                <Group title="Tamanho e posição">
                  <Slider label="Texto" unit="px" value={preset.size.sans} min={36} max={140} onChange={(v) => set("size", { ...preset.size, sans: v })} />
                  <Slider label="Ênfase" unit="px" value={preset.size.accent} min={36} max={160} onChange={(v) => set("size", { ...preset.size, accent: v })} />
                  <Slider
                    label="Altura na tela"
                    unit="px"
                    value={preset.position.y}
                    min={260}
                    max={1760}
                    step={10}
                    onChange={(v) => set("position", { y: v })}
                    hint="Onde a legenda fica quando é só você na tela. Com gráfico ou split, ela segue a faixa do palco."
                  />
                </Group>

                <Group title="Cor">
                  <Color label="Texto" value={preset.color.fill} onChange={(v) => set("color", { ...preset.color, fill: v })} />
                  <Color label="Ênfase" value={preset.color.accent} onChange={(v) => set("color", { ...preset.color, accent: v })} />
                  <Color label="Texto no fundo claro" value={preset.color.canvasFill ?? preset.color.fill} onChange={(v) => set("color", { ...preset.color, canvasFill: v })} />
                  <Color label="Ênfase no fundo claro" value={preset.color.canvasAccent ?? preset.color.accent} onChange={(v) => set("color", { ...preset.color, canvasAccent: v })} />
                </Group>

                <Group title="Contorno" on={Boolean(preset.outline)} onToggle={(on) => set("outline", on ? { width: 8, color: "#000000" } : null)}>
                  {preset.outline ? (
                    <>
                      <Slider label="Espessura" unit="px" value={preset.outline.width} min={1} max={20} onChange={(v) => set("outline", { ...preset.outline!, width: v })} />
                      <Color label="Cor" value={preset.outline.color} onChange={(v) => set("outline", { ...preset.outline!, color: v })} />
                    </>
                  ) : null}
                </Group>

                <Group title="Sombra" on={Boolean(preset.shadow)} onToggle={(on) => set("shadow", on ? { dx: 0, dy: 4, blur: 6, alpha: 150 } : null)}>
                  {preset.shadow ? (
                    <>
                      <Slider label="Desfoque" unit="px" value={preset.shadow.blur} min={0} max={24} onChange={(v) => set("shadow", { ...preset.shadow!, blur: v })} />
                      <Slider label="Distância" unit="px" value={preset.shadow.dy} min={0} max={20} onChange={(v) => set("shadow", { ...preset.shadow!, dy: v })} />
                      <Slider label="Opacidade" value={preset.shadow.alpha} min={0} max={255} onChange={(v) => set("shadow", { ...preset.shadow!, alpha: v })} />
                    </>
                  ) : null}
                </Group>

                <Group
                  title="Caixa atrás do texto"
                  on={Boolean(preset.box)}
                  onToggle={(on) => set("box", on ? { color: "#111111", alpha: 210, padX: 24, padY: 14, radius: 14 } : null)}
                >
                  {preset.box ? (
                    <>
                      <Color label="Cor" value={preset.box.color} onChange={(v) => set("box", { ...preset.box!, color: v })} />
                      <Slider label="Opacidade" value={preset.box.alpha} min={40} max={255} onChange={(v) => set("box", { ...preset.box!, alpha: v })} />
                      <Slider label="Cantos" unit="px" value={preset.box.radius} min={0} max={40} onChange={(v) => set("box", { ...preset.box!, radius: v })} />
                      <Slider label="Folga" unit="px" value={preset.box.padX} min={6} max={60} onChange={(v) => set("box", { ...preset.box!, padX: v, padY: Math.round(v * 0.6) })} />
                    </>
                  ) : null}
                </Group>

                <Group title="Ritmo">
                  <Slider label="Palavras por legenda" value={preset.timing.maxWords} min={1} max={8} onChange={(v) => set("timing", { ...preset.timing, maxWords: v })} />
                  <Slider label="Letras por legenda" value={preset.timing.maxChars} min={8} max={48} onChange={(v) => set("timing", { ...preset.timing, maxChars: v })} />
                  <Slider
                    label="Antecipação"
                    unit="f"
                    value={preset.timing.leadFrames}
                    min={0}
                    max={6}
                    onChange={(v) => set("timing", { ...preset.timing, leadFrames: v })}
                    hint="Quantos frames a legenda entra antes da fala."
                  />
                </Group>
              </>
            ) : null}
          </div>

          <aside className="builder-stage">
            {preset ? (
              <CaptionStill preset={preset} text={text} layout={layout} background={background} animate className="is-large" />
            ) : (
              <div className="caption-still is-large" />
            )}
            <div className="builder-stage-controls">
              <Segmented
                value={background.startsWith("thread:") || background === "auto" ? "video" : background}
                options={[
                  ["video", "No vídeo"],
                  ["dark", "Escuro"],
                  ["cream", "Claro"],
                ]}
                onChange={(v) => {
                  setBackground(v === "video" ? (threadId ? `thread:${threadId}` : "auto") : v);
                  setLayout(v === "cream" ? "canvas" : "face");
                }}
              />
              <label className="builder-field">
                <span className="builder-label">
                  Frases de exemplo
                  <small>uma por linha · *ênfase*</small>
                </span>
                <textarea className="input builder-sample" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Older presets may miss a field; the form needs all of them. */
function withDefaults(p: Partial<CaptionPreset> & { id: string; name: string }): CaptionPreset {
  const font: Partial<CaptionPreset["font"]> = p.font ?? {};
  const color: Partial<CaptionPreset["color"]> = p.color ?? {};
  const animation: Partial<Anim> = p.animation ?? {};
  const timing: Partial<CaptionPreset["timing"]> = p.timing ?? {};
  return {
    ...p,
    font: { sans: font.sans ?? "", accent: font.accent ?? font.sans ?? "", case: font.case ?? "sentence", tracking: font.tracking ?? 0 },
    size: p.size ?? { sans: 72, accent: 84 },
    position: p.position ?? { y: 1180 },
    color: { ...color, fill: color.fill ?? "#FFFFFF", accent: color.accent ?? "#FFFFFF" },
    outline: p.outline ?? null,
    shadow: p.shadow ?? null,
    box: p.box ?? null,
    animation: {
      in: animation.in ?? "rise",
      out: animation.out ?? "fade",
      inFrames: animation.inFrames ?? 4,
      outFrames: animation.outFrames ?? 3,
    },
    timing: { maxWords: timing.maxWords ?? 3, maxChars: timing.maxChars ?? 18, leadFrames: timing.leadFrames ?? 2 },
  };
}

function Group({ title, children, on, onToggle }: { title: string; children: ReactNode; on?: boolean; onToggle?: (on: boolean) => void }) {
  return (
    <section className={`builder-group${onToggle && !on ? " is-off" : ""}`} aria-label={title}>
      <header className="builder-group-head">
        <h2>{title}</h2>
        {onToggle ? (
          <label className="builder-toggle">
            <input type="checkbox" checked={Boolean(on)} onChange={(e) => onToggle(e.target.checked)} />
            <span>{on ? "Ligado" : "Desligado"}</span>
          </label>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="builder-field">
      <span className="builder-label">
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="builder-field" title={hint}>
      <span className="builder-label">
        {label}
        <small>
          {value}
          {unit}
        </small>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="builder-field builder-color">
      <span className="builder-label">{label}</span>
      <span className="builder-color-control">
        <input type="color" value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <span className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} className={`segment${v === value ? " is-selected" : ""}`} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </span>
  );
}

function FontSelect({ value, fonts, onChange }: { value: string; fonts: string[]; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {fonts.map((f) => (
        <option key={f} value={f}>
          {fontName(f)}
        </option>
      ))}
    </select>
  );
}

/** "assets/fonts/brainstorm-academy/GothamBold.ttf" → "GothamBold" */
function fontName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.(otf|ttf)$/i, "").replace(/-[A-Za-z0-9]{4}$/, "");
}
