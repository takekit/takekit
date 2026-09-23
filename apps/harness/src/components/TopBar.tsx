import type { ReactNode } from "react";
import { PanelLeft, PanelRight, SquarePen } from "lucide-react";
import { IconButton } from "./ui";

interface Props {
  sidebarOpen: boolean;
  panelOpen: boolean;
  project: string | null;
  title: string;
  status?: ReactNode;
  onToggleSidebar: () => void;
  onTogglePanel: (() => void) | null;
  onNewThread: () => void;
}

export function TopBar({
  sidebarOpen,
  panelOpen,
  project,
  title,
  status,
  onToggleSidebar,
  onTogglePanel,
  onNewThread,
}: Props) {
  return (
    <header className={`topbar drag${sidebarOpen ? "" : " is-sidebar-hidden"}`} data-tauri-drag-region>
      {sidebarOpen ? null : (
        <div className="topbar-lead">
          <IconButton label="Mostrar sidebar" shortcut="⌘B" onClick={onToggleSidebar}>
            <PanelLeft size={16} strokeWidth={1.75} />
          </IconButton>
          <IconButton label="Nova thread" shortcut="⌘N" onClick={onNewThread}>
            <SquarePen size={15} strokeWidth={1.75} />
          </IconButton>
        </div>
      )}
      <div className="crumbs" data-tauri-drag-region>
        {project ? (
          <>
            <span className="crumb-project">{project}</span>
            <span className="crumb-sep" aria-hidden>
              /
            </span>
          </>
        ) : null}
        <span className="crumb-title">{title}</span>
      </div>
      <div className="topbar-actions">
        {status}
        {onTogglePanel ? (
          <IconButton
            label={panelOpen ? "Fechar preview" : "Abrir preview"}
            shortcut="⌥⌘B"
            pressed={panelOpen}
            onClick={onTogglePanel}
          >
            <PanelRight size={16} strokeWidth={1.75} />
          </IconButton>
        ) : null}
      </div>
    </header>
  );
}
