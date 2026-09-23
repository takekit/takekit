import { TimelinePreview } from "./TimelinePreview";
import type { Thread } from "../api/client";

interface Props {
  open: boolean;
  onToggle: () => void;
  thread: Thread | null;
}

export function RightSidebar({ open, onToggle, thread }: Props) {
  return (
    <>
      <button
        type="button"
        className={`right-toggle ${open ? "open" : ""}`}
        onClick={onToggle}
        title="Toggle timeline / preview"
      >
        {open ? "⟩" : "⟨"}
      </button>
      {open ? (
        <aside className="sidebar right">
          <TimelinePreview thread={thread} />
        </aside>
      ) : null}
    </>
  );
}
