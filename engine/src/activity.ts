import { readFileSync } from "node:fs";
import { basename } from "node:path";

/**
 * Live activity of an agent run, normalized across CLIs.
 *
 * Each adapter runs its CLI in a streaming JSON mode and feeds the lines to one
 * of the parsers below, which emit `ActivityUpdate`s keyed by a stable id (the
 * tool call id), so "running" and "done" land on the same row in the UI.
 *
 *   Claude Code  --output-format stream-json --verbose   (Anthropic messages)
 *   Grok Build   --output-format streaming-messages-json (Anthropic messages)
 *   Codex        exec --json                             (thread/turn/item events)
 *   OpenCode     run --format json                       (step/tool_use/text parts)
 */

/** "user" = a message the user sent while the run was going (see steerJob). */
export type ActivityKind = "message" | "user" | "command" | "read" | "edit" | "search" | "web" | "agent" | "plan" | "tool" | "error";
export type ActivityStatus = "running" | "done" | "failed";
export type StepState = "pending" | "running" | "done" | "failed";

export interface PlanEntry {
  text: string;
  status: "pending" | "active" | "done";
}

export interface ActivityItem {
  id: string;
  /** Bumped on every change; clients poll with `after=<seq>`. */
  seq: number;
  kind: ActivityKind;
  title: string;
  /** Command line, file path, pattern… */
  detail?: string;
  /** Tail of the tool output. */
  output?: string;
  status?: ActivityStatus;
  startedAt: string;
  endedAt?: string;
  /** Pipeline step this command runs (trim, palco_b, compose…). */
  step?: string;
  plan?: PlanEntry[];
}

export type ActivityUpdate = Partial<Omit<ActivityItem, "seq" | "startedAt">> & { id: string };
export type Emit = (update: ActivityUpdate) => void;

export interface StreamParser {
  line(text: string): void;
  /** Final answer of the run (what `-p` text mode would have printed). */
  finalText(): string;
  /** The CLI's session / thread id, once the stream has shown it (for resume). */
  sessionId(): string | undefined;
}

/** Pipeline scripts → step key + what the step does, in pipeline order. */
export const PIPELINE_STEPS: Array<{ key: string; label: string; doing: string; match: RegExp }> = [
  { key: "transcribe", label: "Transcrição", doing: "transcrevendo a fala", match: /whisper|transcri/i },
  { key: "cuts", label: "Cortes", doing: "ajustando os cortes", match: /tighten_cuts\.py/ },
  { key: "trim", label: "Trim", doing: "cortando a fala", match: /headless\/trim\.py|\btrim\.py/ },
  { key: "sfx", label: "SFX", doing: "preparando os efeitos sonoros", match: /map_sfx_cues\.py|sfx_prep\.py/ },
  { key: "captions", label: "Legendas", doing: "renderizando as legendas", match: /captions_palco\.py|render_overlays\.py/ },
  { key: "motion", label: "Motion", doing: "renderizando os canvases", match: /motion\/render\.py|remotion\s+render/i },
  { key: "palco_b", label: "Palco B", doing: "recortando o fundo (RVM)", match: /palco_b\.py|matte\.py/ },
  { key: "compose", label: "Export", doing: "montando o vídeo final", match: /compose\.py|batch\.py/ },
  { key: "review", label: "Revisão", doing: "capturando frames", match: /headless\/frame\.py|\bframe\.py/ },
];

export function pipelineStep(command: string) {
  return PIPELINE_STEPS.find((s) => s.match.test(command));
}

const OUTPUT_TAIL = 2000;
export const tailText = (text: string, max = OUTPUT_TAIL) =>
  text.length <= max ? text : `…${text.slice(-max)}`;

/** Codex wraps commands as `/bin/zsh -lc '…'`; show what the agent actually ran. */
export function unwrapShell(command: string): string {
  const m = /^\S*\/(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1\s*$/.exec(command.trim());
  return m ? m[2].replace(/'\\''/g, "'") : command.trim();
}

function oneLine(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function pathOf(input: Json): string {
  return str(input.file_path) || str(input.filePath) || str(input.path) || str(input.target_file) || str(input.absolute_path) || str(input.notebook_path);
}

/** Plumbing the user doesn't need to see (tool discovery, task bookkeeping). */
const HIDDEN_TOOLS = new Set(["toolsearch", "tasklist", "taskget", "enterplanmode", "exitplanmode", "listmcpresourcestool"]);

/** A tool call (any CLI's naming) → the row the user sees; null = don't show. */
export function describeTool(name: string, input: Json): Omit<ActivityUpdate, "id"> | null {
  const n = name.toLowerCase();
  if (HIDDEN_TOOLS.has(n)) return null;
  const command = str(input.command) || str(input.cmd) || (Array.isArray(input.command) ? (input.command as string[]).join(" ") : "");
  if (command || /bash|shell|terminal|exec_command|command/.test(n)) {
    const cmd = unwrapShell(command);
    const step = pipelineStep(cmd);
    const description = str(input.description);
    return {
      kind: "command",
      title: step ? `${step.label}: ${step.doing}` : description || oneLine(cmd, 90) || "Comando",
      detail: cmd,
      step: step?.key,
    };
  }
  const path = pathOf(input);
  if (/todo|plan/.test(n)) return { kind: "plan", title: "Plano", plan: planFrom(input) };
  if (/^(read|view|cat|open)|read_?file|readfile|taskoutput|bashoutput/.test(n)) {
    // Claude's background commands write to <tmp>/tasks/<id>.output; reading it = checking on the command.
    if (/taskoutput|bashoutput/.test(n) || /\/tasks\/[^/]+\.output$/.test(path)) {
      return { kind: "read", title: "Conferiu a saída do comando", detail: path || undefined };
    }
    return { kind: "read", title: `Leu ${basename(path) || "arquivo"}`, detail: path };
  }
  if (/edit|write|patch|replace|create_file|notebook/.test(n)) {
    return { kind: "edit", title: `Editou ${basename(path) || "arquivo"}`, detail: path };
  }
  if (/grep|glob|search|find|^ls$|list/.test(n) && !/web/.test(n)) {
    const pattern = str(input.pattern) || str(input.query) || str(input.glob) || path;
    return { kind: "search", title: `Buscou ${oneLine(pattern, 60) || "arquivos"}`, detail: str(input.path) || undefined };
  }
  if (/web|fetch|url/.test(n)) {
    const target = str(input.url) || str(input.query);
    return { kind: "web", title: `Pesquisou ${oneLine(target, 70)}`, detail: target };
  }
  if (n === "skill") return { kind: "tool", title: `Skill ${str(input.skill) || str(input.name)}`.trim() };
  if (/^(task|agent|subagent)$/.test(n)) {
    return { kind: "agent", title: `Subagente: ${oneLine(str(input.description) || str(input.prompt), 80)}` };
  }
  return { kind: "tool", title: `Usou ${name}`, detail: oneLine(JSON.stringify(input), 200) };
}

function planFrom(input: Json): PlanEntry[] {
  const list = arr(input.todos ?? input.items ?? input.plan);
  return list.map((raw) => {
    const t = obj(raw);
    const status = str(t.status);
    const done = t.completed === true || status === "completed" || status === "done";
    const active = status === "in_progress" || status === "active";
    return {
      text: str(t.content) || str(t.text) || str(t.step) || str(t.title),
      status: done ? "done" : active ? "active" : "pending",
    };
  });
}

/** Tool result content (string, text blocks, or Grok's JSON envelope) → plain text. */
function resultText(content: unknown): string {
  if (typeof content === "string") {
    const s = content.trim();
    if (s.startsWith("{")) {
      try {
        const env = obj(JSON.parse(s));
        const inner = str(env.output_for_prompt) || str(obj(env.FileContent).content_concise) || str(env.output);
        if (inner) return inner;
      } catch {
        /* plain text that happens to start with { */
      }
    }
    return content;
  }
  return arr(content)
    .map((b) => str(obj(b).text))
    .filter(Boolean)
    .join("\n");
}

/** Claude Code stream-json and Grok streaming-messages-json (both Anthropic message shape). */
export function anthropicStreamParser(emit: Emit): StreamParser {
  let final = "";
  let lastText = "";
  let session: string | undefined;
  let n = 0;
  const shown = new Set<string>(); // tool_use ids that have a row
  // Claude's task list (TaskCreate / TaskUpdate) becomes the plan card.
  const tasks = new Map<string, PlanEntry>();
  const creating = new Map<string, string>(); // tool_use id → subject, until the result says its #id
  const emitPlan = () => emit({ id: "plan", kind: "plan", title: "Plano", plan: [...tasks.values()], status: "done" });

  return {
    line(text) {
      const ev = parse(text);
      if (!ev) return;
      const type = str(ev.type);
      session = str(ev.session_id) || session;
      if (type === "assistant") {
        for (const block of arr(obj(ev.message).content).map(obj)) {
          if (block.type === "text" && str(block.text).trim()) {
            lastText = str(block.text).trim();
            emit({ id: `msg-${++n}`, kind: "message", title: lastText });
          } else if (block.type === "tool_use") {
            const id = str(block.id) || `tool-${++n}`;
            const name = str(block.name);
            const input = obj(block.input);
            if (name === "TaskCreate") {
              creating.set(id, str(input.subject) || str(input.description));
              continue;
            }
            if (name === "TaskUpdate") {
              const task = tasks.get(str(input.taskId));
              const status = str(input.status);
              if (task && status === "deleted") tasks.delete(str(input.taskId));
              else if (task) {
                if (status) task.status = status === "completed" ? "done" : status === "in_progress" ? "active" : "pending";
                if (str(input.subject)) task.text = str(input.subject);
              }
              if (task) emitPlan();
              continue;
            }
            const row = describeTool(name, input);
            if (!row) continue;
            if (row.kind === "plan") {
              emit({ ...row, id: "plan", status: "done" });
              continue;
            }
            shown.add(id);
            emit({ id, ...row, status: "running" });
          }
        }
      } else if (type === "user") {
        const meta = obj(ev.tool_use_result);
        for (const block of arr(obj(ev.message).content).map(obj)) {
          if (block.type !== "tool_result") continue;
          const id = str(block.tool_use_id);
          const content = resultText(block.content);
          if (creating.has(id)) {
            const taskId = str(obj(meta.task).id) || (/#(\d+)/.exec(content)?.[1] ?? "");
            if (taskId) {
              tasks.set(taskId, { text: creating.get(id) ?? "", status: "pending" });
              emitPlan();
            }
            creating.delete(id);
            continue;
          }
          if (!shown.has(id)) continue;
          // Backgrounded commands answer at once; they finish on the task_notification below.
          if (/running in background with ID/i.test(content) || meta.backgroundTaskId) continue;
          const failed = block.is_error === true;
          emit({ id, status: failed ? "failed" : "done", output: tailText(content), endedAt: now() });
        }
      } else if (type === "system" && str(ev.subtype) === "task_notification") {
        const id = str(ev.tool_use_id);
        if (!shown.has(id)) return;
        const ok = str(ev.status) === "completed";
        emit({ id, status: ok ? "done" : "failed", output: tailText(readTail(str(ev.output_file))), endedAt: now() });
      } else if (type === "result") {
        // A run with background commands can end several turns; the last result is the answer.
        final = str(ev.result) || lastText;
        if (ev.is_error === true) {
          emit({ id: "result-error", kind: "error", title: oneLine(final || str(ev.subtype) || "O agente terminou com erro", 200), status: "failed" });
        }
      }
    },
    finalText: () => final || lastText,
    sessionId: () => session,
  };
}

function readTail(path: string, max = 4000): string {
  if (!path) return "";
  try {
    const text = readFileSync(path, "utf8");
    return text.length > max ? text.slice(-max) : text;
  } catch {
    return "";
  }
}

/** `codex exec --json`: thread.started / turn.* / item.started|updated|completed. */
export function codexParser(emit: Emit): StreamParser {
  let lastText = "";
  let thread: string | undefined;
  return {
    line(text) {
      const ev = parse(text);
      if (!ev) return;
      const type = str(ev.type);
      if (type === "thread.started") thread = str(ev.thread_id) || thread;
      if (type === "error" || type === "turn.failed") {
        const message = str(ev.message) || str(obj(ev.error).message) || "Erro no Codex";
        emit({ id: `err-${Date.now()}`, kind: "error", title: oneLine(message, 200), status: "failed" });
        return;
      }
      if (!type.startsWith("item.")) return;
      const item = obj(ev.item);
      const id = str(item.id);
      const done = type === "item.completed";
      switch (str(item.type)) {
        case "agent_message":
          if (done && str(item.text).trim()) {
            lastText = str(item.text).trim();
            emit({ id, kind: "message", title: lastText });
          }
          break;
        case "command_execution": {
          const row = describeTool("command_execution", { command: str(item.command) })!;
          const exit = typeof item.exit_code === "number" ? item.exit_code : null;
          emit({
            id,
            ...row,
            status: !done ? "running" : exit === 0 || (exit === null && str(item.status) === "completed") ? "done" : "failed",
            ...(done ? { output: tailText(str(item.aggregated_output)), endedAt: now() } : {}),
          });
          break;
        }
        case "file_change": {
          const changes = arr(item.changes).map(obj);
          const first = str(changes[0]?.path);
          emit({
            id,
            kind: "edit",
            title: changes.length > 1 ? `Editou ${changes.length} arquivos` : `Editou ${basename(first) || "arquivo"}`,
            detail: changes.map((c) => str(c.path)).join("\n"),
            status: done ? (str(item.status) === "failed" ? "failed" : "done") : "running",
          });
          break;
        }
        case "todo_list":
          emit({ id: "plan", kind: "plan", title: "Plano", plan: planFrom(item), status: "done" });
          break;
        case "web_search":
          emit({ id, kind: "web", title: `Pesquisou ${oneLine(str(item.query), 70)}`, status: done ? "done" : "running" });
          break;
        case "mcp_tool_call":
          emit({ id, kind: "tool", title: `Usou ${str(item.tool) || "ferramenta"}`, detail: str(item.server), status: done ? "done" : "running" });
          break;
        case "error":
          emit({ id, kind: "error", title: oneLine(str(item.message), 200), status: "failed" });
          break;
      }
    },
    finalText: () => lastText,
    sessionId: () => thread,
  };
}

/** `opencode run --format json`: step_start / tool_use / text / step_finish / error. */
export function opencodeParser(emit: Emit): StreamParser {
  let lastText = "";
  let session: string | undefined;
  return {
    line(text) {
      const ev = parse(text);
      if (!ev) return;
      const type = str(ev.type);
      session = str(ev.sessionID) || session;
      const part = obj(ev.part);
      if (type === "text" && str(part.text).trim()) {
        lastText = str(part.text).trim();
        emit({ id: str(part.id) || `msg-${Date.now()}`, kind: "message", title: lastText });
      } else if (type === "tool_use") {
        const state = obj(part.state);
        const input = obj(state.input);
        const row = describeTool(str(part.tool), input);
        const status = str(state.status);
        const id = str(part.callID) || str(part.id);
        if (!row) return;
        if (row.kind === "plan") {
          emit({ ...row, id: "plan", status: "done" });
          return;
        }
        const exit = obj(state.metadata).exit;
        emit({
          id,
          ...row,
          status: status === "completed" ? (typeof exit === "number" && exit !== 0 ? "failed" : "done") : status === "error" ? "failed" : "running",
          ...(status === "completed" || status === "error"
            ? { output: tailText(str(state.output) || str(state.error)), endedAt: now() }
            : {}),
        });
      } else if (type === "error") {
        const message = str(obj(ev.error).message) || str(obj(obj(ev.error).data).message) || "Erro no OpenCode";
        emit({ id: `err-${Date.now()}`, kind: "error", title: oneLine(message, 200), status: "failed" });
      }
    },
    finalText: () => lastText,
    sessionId: () => session,
  };
}

function parse(line: string): Json | null {
  const t = line.trim();
  if (!t.startsWith("{")) return null;
  try {
    return obj(JSON.parse(t));
  } catch {
    return null;
  }
}

const now = () => new Date().toISOString();
