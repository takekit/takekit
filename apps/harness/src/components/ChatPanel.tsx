import { useEffect, useRef, useState } from "react";
import type { Thread } from "../api/client";

interface Props {
  thread: Thread | null;
  busy: boolean;
  onSend: (content: string) => Promise<void>;
}

export function ChatPanel({ thread, busy, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, thread?.id]);

  if (!thread) {
    return (
      <main className="chat empty">
        <p className="muted">Selecione ou crie uma thread.</p>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    await onSend(text);
  }

  return (
    <main className="chat">
      <header className="chat-header">
        <div>
          <h1>{thread.title}</h1>
          <p className="muted small path">{thread.projectPath}</p>
        </div>
      </header>
      <div className="messages">
        {thread.messages.map((m) => (
          <article key={m.id} className={`bubble ${m.role}`}>
            <div className="meta">
              <span>{m.role}</span>
              {m.jobId ? <span className="muted">job {m.jobId.slice(0, 8)}</span> : null}
            </div>
            <pre>{m.content}</pre>
          </article>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Briefing ou correção… (dispara Claude Code via engine)"
          rows={3}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(e);
            }
          }}
        />
        <button type="submit" className="btn primary" disabled={busy || !draft.trim()}>
          {busy ? "Running…" : "Send"}
        </button>
      </form>
    </main>
  );
}
