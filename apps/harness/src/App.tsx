import { useCallback, useEffect, useState } from "react";
import {
  createThread,
  getJob,
  getThread,
  listThreads,
  postMessage,
  type Thread,
} from "./api/client";
import { MOCK_THREADS } from "./mocks/threads";
import { ThreadsSidebar } from "./components/ThreadsSidebar";
import { ChatPanel } from "./components/ChatPanel";
import { RightSidebar } from "./components/RightSidebar";
import "./App.css";

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rightOpen, setRightOpen] = useState(true);
  const [engineOnline, setEngineOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = threads.find((t) => t.id === activeId) ?? null;

  const refresh = useCallback(async () => {
    try {
      const { threads: remote } = await listThreads();
      setThreads(remote);
      setEngineOnline(true);
      setError(null);
      setActiveId((prev) => prev ?? remote[0]?.id ?? null);
    } catch (err) {
      setEngineOnline(false);
      setThreads(MOCK_THREADS);
      setActiveId((prev) => prev ?? MOCK_THREADS[0]?.id ?? null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    if (!engineOnline) {
      setError("Engine offline — cannot create thread");
      return;
    }
    const title = window.prompt("Título da thread / projeto", "Novo projeto");
    if (title == null) return;
    try {
      const { thread } = await createThread({ title: title.trim() || undefined });
      await refresh();
      setActiveId(thread.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSend(content: string) {
    if (!active || !engineOnline) {
      setError("Engine offline — chat API unavailable");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { job } = await postMessage(active.id, content, true);
      const { thread } = await getThread(active.id);
      setThreads((prev) => prev.map((t) => (t.id === thread.id ? thread : t)));

      if (job) {
        await pollJob(job.id, active.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function pollJob(jobId: string, threadId: string) {
    for (let i = 0; i < 120; i++) {
      await sleep(1500);
      const { job } = await getJob(jobId);
      if (job.status === "succeeded" || job.status === "failed") {
        const { thread } = await getThread(threadId);
        setThreads((prev) => prev.map((t) => (t.id === thread.id ? thread : t)));
        return;
      }
    }
  }

  return (
    <div className="app-shell">
      <ThreadsSidebar
        threads={threads}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={() => void handleCreate()}
        engineOnline={engineOnline}
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {error && !engineOnline ? (
          <div
            style={{
              padding: "8px 16px",
              background: "#2a1a1a",
              borderBottom: "1px solid var(--border)",
              color: "var(--danger)",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        ) : null}
        <ChatPanel
          thread={active}
          busy={busy}
          onSend={handleSend}
        />
      </div>
      <RightSidebar
        open={rightOpen}
        onToggle={() => setRightOpen((v) => !v)}
        thread={active}
      />
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
