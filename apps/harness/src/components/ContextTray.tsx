import { useState } from "react";
import { ChevronDown, Film, Folder, Palette as PaletteIcon, X } from "lucide-react";
import { threadInputs, type Thread } from "../api/client";
import { basename } from "../lib/format";
import { ProjectPicker } from "./ProjectPicker";
import { VideoPicker } from "./VideoPicker";

export interface Draft {
  projectPath: string;
  /** Footage for the new thread, in pick order. */
  inputVideoPaths: string[];
}

export interface ProjectOption {
  path: string;
  name: string;
}

const videosLabel = (paths: string[]) =>
  paths.length === 1 ? basename(paths[0]) : `${paths.length} vídeos`;

/** Editable context for a thread that doesn't exist yet. */
export function DraftTray({
  draft,
  projects,
  defaultPath,
  styleId,
  onChange,
}: {
  draft: Draft;
  projects: ProjectOption[];
  defaultPath: string;
  styleId: string;
  onChange: (draft: Draft) => void;
}) {
  const [picker, setPicker] = useState<"project" | "videos" | null>(null);
  const projectPath = draft.projectPath || defaultPath;
  const videos = draft.inputVideoPaths;
  const projectsRoot = parentOf(defaultPath || projectPath);

  return (
    <>
      <button
        type="button"
        className={`chip${picker === "project" ? " is-open" : ""}`}
        onClick={() => setPicker("project")}
        title={projectPath || "Projeto padrão do engine"}
        aria-haspopup="dialog"
      >
        <Folder size={13} strokeWidth={1.75} />
        <span>{basename(projectPath) || "Projeto padrão"}</span>
        <ChevronDown size={11} strokeWidth={2} className="chip-caret" />
      </button>

      <span className="chip-group">
        <button
          type="button"
          className={`chip${picker === "videos" ? " is-open" : ""}${videos.length ? "" : " is-empty"}`}
          onClick={() => setPicker("videos")}
          title={videos.length ? videos.join("\n") : "Vídeos brutos de entrada (opcional)"}
          aria-haspopup="dialog"
        >
          <Film size={13} strokeWidth={1.75} />
          <span>{videos.length ? videosLabel(videos) : "Vídeo de entrada"}</span>
          {videos.length ? null : <ChevronDown size={11} strokeWidth={2} className="chip-caret" />}
        </button>
        {videos.length ? (
          <button
            type="button"
            className="chip-clear"
            aria-label="Remover vídeos de entrada"
            onClick={() => onChange({ ...draft, inputVideoPaths: [] })}
          >
            <X size={12} strokeWidth={2} />
          </button>
        ) : null}
      </span>

      <span className="chip is-static" title="Estilo aplicado pelo pipeline">
        <PaletteIcon size={13} strokeWidth={1.75} />
        <span>{styleId}</span>
      </span>

      {picker === "project" ? (
        <ProjectPicker
          current={projectPath}
          projects={projects}
          projectsRoot={projectsRoot}
          onSelect={(path) => {
            if (path === projectPath) return;
            // Footage belongs to a project: a new folder starts with none picked.
            onChange({ projectPath: path === defaultPath ? "" : path, inputVideoPaths: [] });
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
      {picker === "videos" ? (
        <VideoPicker
          projectPath={projectPath}
          selected={videos}
          onConfirm={(paths) => onChange({ ...draft, inputVideoPaths: paths })}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </>
  );
}

/** Read-only context for an existing thread. */
export function ThreadTray({ thread }: { thread: Thread }) {
  const inputs = threadInputs(thread);
  return (
    <>
      <span className="chip is-static" title={thread.projectPath}>
        <Folder size={13} strokeWidth={1.75} />
        <span>{basename(thread.projectPath)}</span>
      </span>
      {inputs.length ? (
        <span className="chip is-static" title={inputs.join("\n")}>
          <Film size={13} strokeWidth={1.75} />
          <span>{videosLabel(inputs)}</span>
        </span>
      ) : null}
      <span className="chip is-static" title="Estilo aplicado pelo pipeline">
        <PaletteIcon size={13} strokeWidth={1.75} />
        <span>{thread.styleId}</span>
      </span>
    </>
  );
}

function parentOf(path: string): string {
  const cut = path.replace(/\/+$/, "").lastIndexOf("/");
  return cut > 0 ? path.slice(0, cut) : "/";
}
