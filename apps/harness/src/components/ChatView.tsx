import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Film,
  Info,
  LoaderCircle,
} from "lucide-react";
import type { JobStatus, Message, Thread } from "../api/client";
import { basename, tildify, timestamp } from "../lib/format";
import { useCopy } from "../lib/hooks";
import { parseAnnotatedMessage } from "../lib/annotations";
import { RichText } from "./RichText";
import { JobBlock } from "./JobActivity";

interface Props {
  thread: Thread;
  /** Optimistic user message while the POST is in flight. */
  pending: string | null;
  executorName: (id: string) => string;
  onOpenPreview: () => void;
  composer: ReactNode;
}

type Item =
  | { kind: "user"; msg: Message }
  | { kind: "job"; msg: Message; jobId: string; executorId: string }
  | { kind: "failure"; msg: Message; headline: string; detail: string }
  | { kind: "result"; msg: Message; body: string; previewPath: string | null }
  | { kind: "assistant"; msg: Message }
  | { kind: "system"; msg: Message };

const QUEUED = /^Job \S+ queued on executor ([^\s…]+)/;
const FAILED = /^(Job failed:|Executor \S+ falhou)/;
const PREVIEW_LINE = /\n*Preview: (\S[^\n]*)\s*$/;

function classify(msg: Message): Item {
  if (msg.role === "user") return { kind: "user", msg };
  // Failures arrive as assistant (runner) or system (engine restart) messages.
  if (FAILED.test(msg.content)) {
    const [headline, ...rest] = msg.content.split(/\n{2,}/);
    return { kind: "failure", msg, headline, detail: rest.join("\n\n").trim() };
  }
  if (msg.role === "system") return { kind: "system", msg };
  const queued = msg.jobId ? QUEUED.exec(msg.content) : null;
  if (queued && msg.jobId) return { kind: "job", msg, jobId: msg.jobId, executorId: queued[1] };
  if (msg.jobId) {
    const preview = PREVIEW_LINE.exec(msg.content);
    return {
      kind: "result",
      msg,
      body: preview ? msg.content.slice(0, preview.index) : msg.content,
      previewPath: preview ? preview[1].trim() : null,
    };
  }
  return { kind: "assistant", msg };
}

type RowStatus = JobStatus | "unknown";

function jobStatus(thread: Thread, jobId: string, queuedId: string): RowStatus {
  if (thread.lastJobId === jobId && thread.lastJobStatus) return thread.lastJobStatus;
  const outcome = thread.messages.find((m) => m.jobId === jobId && m.id !== queuedId);
  if (!outcome) return "unknown";
  return FAILED.test(outcome.content) ? "failed" : "succeeded";
}

export function ChatView({ thread, pending, executorName, onOpenPreview, composer }: Props) {
  const items = useMemo(() => thread.messages.map(classify), [thread.messages]);
  const chatRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  // The composer floats over the messages; keep enough bottom room for its real height.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    const chat = chatRef.current;
    if (!dock || !chat) return;
    const sync = () => chat.style.setProperty("--dock-h", `${dock.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(dock);
    return () => ro.disconnect();
  }, []);

  // Live job feeds grow without new messages; they call this to keep the bottom in view.
  const follow = useCallback(() => {
    const el = scrollRef.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, []);

  // Follow new output only while the user is already at the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length, thread.lastJobStatus, pending]);

  useLayoutEffect(() => {
    stuck.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.id]);

  return (
    <div className="chat" ref={chatRef}>
      <div
        className="chat-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="chat-column">
          {items.map((item) => (
            <ChatItem
              key={item.msg.id}
              item={item}
              thread={thread}
              executorName={executorName}
              onOpenPreview={onOpenPreview}
              onGrow={follow}
            />
          ))}
          {pending ? (
            <>
              <div className="msg-user">
                <UserBubble content={pending} />
              </div>
              <div className="activity is-queued">
                <span className="activity-toggle is-static">
                  <LoaderCircle size={14} strokeWidth={2} className="spin activity-icon" />
                  <span className="breathe">Enviando</span>
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="chat-dock" ref={dockRef}>
        {composer}
      </div>
    </div>
  );
}

function ChatItem({
  item,
  thread,
  executorName,
  onOpenPreview,
  onGrow,
}: {
  item: Item;
  thread: Thread;
  executorName: (id: string) => string;
  onOpenPreview: () => void;
  onGrow: () => void;
}) {
  switch (item.kind) {
    case "user":
      return (
        <div className="msg-user">
          <UserBubble content={item.msg.content} />
          {item.msg.delivery ? <p className="msg-delivery">{DELIVERY_LABEL[item.msg.delivery]}</p> : null}
          <MessageMeta text={item.msg.content} createdAt={item.msg.createdAt} align="end" />
        </div>
      );
    case "job":
      return (
        <JobBlock
          jobId={item.jobId}
          executor={executorName(item.executorId)}
          status={jobStatus(thread, item.jobId, item.msg.id)}
          since={item.msg.createdAt}
          onGrow={onGrow}
        />
      );
    case "failure":
      return <FailureBlock headline={item.headline} detail={item.detail} />;
    case "result":
      return (
        <div className="msg-assistant">
          <RichText text={item.body} />
          {item.previewPath ? (
            <button type="button" className="preview-card" onClick={onOpenPreview}>
              <span className="preview-card-icon">
                <Film size={15} strokeWidth={1.75} />
              </span>
              <span className="preview-card-text">
                <strong>{basename(item.previewPath)}</strong>
                <small>{tildify(item.previewPath)}</small>
              </span>
              <span className="preview-card-cta">Abrir preview</span>
            </button>
          ) : null}
          <MessageMeta text={item.msg.content} createdAt={item.msg.createdAt} />
        </div>
      );
    case "assistant":
      return (
        <div className="msg-assistant">
          <RichText text={item.msg.content} />
          <MessageMeta text={item.msg.content} createdAt={item.msg.createdAt} />
        </div>
      );
    case "system":
      return (
        <div className="msg-system">
          <Info size={13} strokeWidth={1.75} />
          <span>{item.msg.content}</span>
        </div>
      );
  }
}

/** Messages sent while the agent worked: how they reached it. */
const DELIVERY_LABEL: Record<NonNullable<Message["delivery"]>, string> = {
  live: "Entregue ao agente no meio do trabalho",
  interrupt: "Interrompeu o passo atual; o agente retoma com ela",
  next: "Entra quando o passo atual terminar",
};

/** User text plus any timeline annotations it carried, shown as a numbered list. */
function UserBubble({ content }: { content: string }) {
  const { text, items } = parseAnnotatedMessage(content);
  return (
    <div className="bubble">
      {text ? <RichText text={text} /> : null}
      {items.length ? (
        <ol className="bubble-annotations">
          {items.map((a) => (
            <li key={a.n}>
              <span className="attach-n">{a.n}</span>
              <span className="bubble-annotation-text">
                <span className="bubble-annotation-summary">{a.summary}</span>
                {a.note ? <span className="bubble-annotation-note">{a.note}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function MessageMeta({
  text,
  createdAt,
  align = "start",
}: {
  text: string;
  createdAt: string;
  align?: "start" | "end";
}) {
  const { copied, copy } = useCopy();
  return (
    <div className={`msg-meta is-${align}`}>
      <span>{timestamp(createdAt)}</span>
      <button
        type="button"
        className="meta-btn"
        onClick={() => void copy(text)}
        aria-label="Copiar mensagem"
        title="Copiar"
      >
        {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
      </button>
    </div>
  );
}

function FailureBlock({ headline, detail }: { headline: string; detail: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="msg-failure">
      <div className="failure-head">
        <CircleAlert size={15} strokeWidth={1.75} />
        <span>{headline}</span>
      </div>
      {detail ? (
        <>
          <button
            type="button"
            className="activity-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span>Saída do executor</span>
            <ChevronRight size={13} strokeWidth={2} className={`activity-chevron${open ? " is-open" : ""}`} />
          </button>
          {open ? <pre className="failure-log">{detail}</pre> : null}
        </>
      ) : null}
    </div>
  );
}
