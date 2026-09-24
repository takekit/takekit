import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStyle, writeResolvedStyle } from "./styles.js";
import { getThread, setThreadPreview, setThreadRender, setThreadStage, threadHasActiveJob } from "./store.js";
import { lastMarker, runScript } from "./pipeline.js";
import type { RenderTask, Thread } from "./types.js";

/**
 * Renders the engine runs itself, no agent (docs/preview-export/SPEC-BUTTON.md):
 *
 *   export   the Exportar button. compose.py --quality final --from-preview: the exact
 *            spec of the last preview, at the style's final quality, into exports/.
 *   preview  after a preset swap (caption, transitions, SFX): re-renders the caption
 *            layers with the new preset and recomposes the preview. The agent isn't
 *            needed to change a look the scripts already know how to draw.
 *
 * One render per thread at a time. Progress lives in memory (polled by the UI); the thread
 * file gets the task when it starts and ends.
 */

const running = new Map<string, { task: RenderTask; controller: AbortController }>();
const COMPOSE = "video/headless/compose.py";
const CAPTIONS = "video/kit/engine/captions_palco.py";
/** Caption layers compose picks up (edit/overlay/captions_<layer>.mov) and their styles. */
const CAPTION_LAYERS = ["face", "canvas", "hold"] as const;

export class RenderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Current render of the thread (running, else the last one of each kind). */
export function renderState(threadId: string): { running: RenderTask | null; lastExport: RenderTask | null; lastRender: RenderTask | null } {
  const thread = getThread(threadId);
  return {
    running: running.get(threadId)?.task ?? null,
    lastExport: thread?.lastExport ?? null,
    lastRender: thread?.lastRender ?? null,
  };
}

export function renderRunning(threadId: string): boolean {
  return running.has(threadId);
}

/** Why the thread can't render now, or null. */
function blocker(thread: Thread): string | null {
  if (thread.kind === "style") return "Thread de criação de estilo não tem vídeo para renderizar.";
  if (running.has(thread.id)) return "Já tem um render rodando nesta thread.";
  if (threadHasActiveJob(thread.id)) return "O agente está editando; espere o preview ficar pronto.";
  if (!thread.previewPath || !existsSync(thread.previewPath)) return "Ainda não há preview para exportar.";
  return null;
}

/** Final export at the style's quality. Throws RenderError when it can't start. */
export function startExport(threadId: string): RenderTask {
  const thread = getThread(threadId);
  if (!thread) throw new RenderError(404, "Thread não encontrada");
  const why = blocker(thread);
  if (why) throw new RenderError(409, why);
  prepareStyle(thread);
  return launch(thread, "export", async (_task, signal, report) => {
    setThreadStage(thread.id, { export: "running" });
    const result = await runScript(
      COMPOSE,
      ["--project", thread.projectPath, "--quality", "final", "--from-preview", "--progress"],
      { signal, onLine: progressLine(report, 0, 1, "Exportando") },
    );
    const path = lastMarker(result.stdout, "TAKEKIT_EXPORT");
    if (result.code !== 0 || !path) throw new Error(scriptError("O export falhou", result.tail));
    setThreadStage(thread.id, { export: "done" });
    return path;
  });
}

/**
 * Re-render the preview with the thread's current presets: caption layers the project
 * already has (only when the caption changed), then the preview. Uses the last preview's spec
 * unless it was derived (then it derives again, so a transitions / SFX / camera swap applies;
 * compose.py redoes the camera render when its preset changed).
 */
export function startPreviewRender(threadId: string, opts: { captions: boolean }): RenderTask {
  const thread = getThread(threadId);
  if (!thread) throw new RenderError(404, "Thread não encontrada");
  const why = blocker(thread);
  if (why) throw new RenderError(409, why.replace("para exportar", "para refazer"));
  prepareStyle(thread);
  const edit = join(thread.projectPath, "edit");
  const layers = opts.captions
    ? CAPTION_LAYERS.filter(
        (layer) => existsSync(join(edit, `job_${layer}.json`)) && existsSync(join(edit, "overlay", `captions_${layer}.mov`)),
      )
    : [];
  return launch(thread, "preview", async (_task, signal, report) => {
    setThreadStage(thread.id, { preview: "running" });
    // Caption layers take most of the time; they run side by side, each reporting its frames.
    const share = layers.length ? 0.7 : 0;
    const done = new Array(layers.length).fill(0);
    const bump = () =>
      report(
        share * (done.reduce((a, b) => a + b, 0) / Math.max(1, layers.length)),
        `Legendas ${done.filter((d) => d >= 1).length}/${layers.length}`,
      );
    if (layers.length) report(0, `Legendas 0/${layers.length}`);
    const results = await Promise.all(
      layers.map(async (layer, i) => {
        const result = await runScript(
          CAPTIONS,
          [
            "--job", join(edit, `job_${layer}.json`),
            "--style", `video/kit/styles/palco-${layer}.json`,
            "--out", join(edit, "overlay", `captions_${layer}.mov`),
            "--progress",
          ],
          {
            signal,
            onLine: (line) => {
              const m = /^TAKEKIT_PROGRESS=([\d.]+)/.exec(line.trim());
              if (m) {
                done[i] = Math.min(0.99, Number(m[1]) || 0);
                bump();
              }
            },
          },
        );
        done[i] = 1;
        bump();
        return { layer, result };
      }),
    );
    const failed = results.find((r) => r.result.code !== 0);
    if (failed) throw new Error(scriptError(`A legenda ${failed.layer} falhou`, failed.result.tail));

    const spec = previewSpecArgs(thread.projectPath);
    const result = await runScript(
      COMPOSE,
      ["--project", thread.projectPath, "--quality", "preview", ...spec, "--progress"],
      { signal, onLine: progressLine(report, share, 1, "Montando o preview") },
    );
    const path = lastMarker(result.stdout, "TAKEKIT_PREVIEW");
    if (result.code !== 0 || !path) throw new Error(scriptError("O preview falhou", result.tail));
    setThreadPreview(thread.id, path);
    setThreadStage(thread.id, { preview: "done" });
    return path;
  });
}

/** Stop the thread's running render (SIGTERM). False when nothing runs. */
export function cancelRender(threadId: string): boolean {
  const entry = running.get(threadId);
  if (!entry) return false;
  entry.controller.abort();
  return true;
}

/** The scripts read the thread's presets and quality from edit/style.resolved.json. */
function prepareStyle(thread: Thread): void {
  const style = getStyle(thread.styleId);
  if (!style) throw new RenderError(409, `Estilo "${thread.styleId}" não está na galeria.`);
  const { missing } = writeResolvedStyle(thread.projectPath, { style, override: thread.modules, threadId: thread.id });
  if (missing.length) throw new RenderError(409, `Preset não encontrado: ${missing.join(", ")}`);
}

/**
 * compose.py args that keep the last preview's composition: a hand-written spec (the
 * agent passed --spec) is reused as is; a derived one is derived again with the new presets.
 */
function previewSpecArgs(projectPath: string): string[] {
  const handWritten = existsSync(join(projectPath, "edit", "compose.json")) ? ["--spec", "edit/compose.json"] : [];
  try {
    const resolved = JSON.parse(readFileSync(join(projectPath, "edit", "compose.resolved.json"), "utf8")) as {
      _source?: unknown;
      _quality?: unknown;
    };
    const source = typeof resolved._source === "string" ? resolved._source.trim() : "";
    if (source) return ["--spec", source];
    // Written before compose.py recorded its source: a hand-written spec, if any, was the last one used.
    if (!resolved._quality) return handWritten;
  } catch {
    return handWritten;
  }
  return [];
}

type Report = (progress: number, phase?: string) => void;

function launch(
  thread: Thread,
  kind: RenderTask["kind"],
  work: (task: RenderTask, signal: AbortSignal, report: Report) => Promise<string>,
): RenderTask {
  const controller = new AbortController();
  const task: RenderTask = {
    id: randomUUID(),
    threadId: thread.id,
    kind,
    status: "running",
    progress: 0,
    phase: kind === "export" ? "Preparando o export" : "Preparando",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    path: null,
    error: null,
  };
  // A cancelled render leaves the previous result (e.g. the last good export) in place.
  const previous = kind === "export" ? thread.lastExport : thread.lastRender;
  running.set(thread.id, { task, controller });
  setThreadRender(thread.id, task);
  const report: Report = (progress, phase) => {
    task.progress = Math.max(task.progress, Math.min(1, progress));
    if (phase) task.phase = phase;
  };
  void work(task, controller.signal, report)
    .then((path) => {
      Object.assign(task, { status: "succeeded", progress: 1, phase: "Pronto", path });
    })
    .catch((err: unknown) => {
      const cancelled = controller.signal.aborted;
      Object.assign(task, {
        status: "failed",
        phase: cancelled ? "Cancelado" : "Falhou",
        error: cancelled ? "Cancelado." : err instanceof Error ? err.message : String(err),
      });
      // Cancelled: the stage goes back to what the previous result left.
      const back = previous?.status === "succeeded" ? "done" : kind === "export" ? "pending" : "done";
      const state = cancelled ? back : "failed";
      setThreadStage(thread.id, kind === "export" ? { export: state } : { preview: state });
    })
    .finally(() => {
      task.finishedAt = new Date().toISOString();
      running.delete(thread.id);
      const cancelled = controller.signal.aborted;
      setThreadRender(thread.id, cancelled && previous ? previous : { ...task });
    });
  return task;
}

/** compose.py --progress prints TAKEKIT_PROGRESS=<0..1>; map it into [from, to]. */
function progressLine(report: Report, from: number, to: number, phase: string) {
  return (line: string) => {
    const m = /^TAKEKIT_PROGRESS=([\d.]+)/.exec(line.trim());
    if (m) report(from + (to - from) * Math.min(1, Number(m[1]) || 0), phase);
  };
}

function scriptError(what: string, tail: string): string {
  const lines = tail
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("TAKEKIT_PROGRESS="));
  const error = [...lines].reverse().find((l) => /^erro:|error|Traceback|falhou/i.test(l)) ?? lines.at(-1);
  return error ? `${what}: ${error.replace(/^erro:\s*/, "")}` : what;
}

/**
 * Resolves once the thread has no render running (right away when none). `onWait` runs
 * only when the caller actually has to wait.
 */
export async function waitForRender(threadId: string, onWait?: () => void): Promise<void> {
  if (!running.has(threadId)) return;
  onWait?.();
  while (running.has(threadId)) await new Promise((r) => setTimeout(r, 1000));
}
