import { useEffect, useState } from "react";
import { ChevronDown, Film, Folder, Palette as PaletteIcon, X } from "lucide-react";
import { styleName, threadInputs, type ModuleSelection, type StyleSummary, type Thread } from "../api/client";
import { basename } from "../lib/format";
import { usePresets } from "../lib/usePresets";
import { DraftPresetsChip } from "./Presets";
import { ProjectPicker } from "./ProjectPicker";
import { StylePicker } from "./StyleGallery";
import { VideoPicker } from "./VideoPicker";

export interface Draft {
  /** "" = no project yet (the thread can't start without one). */
  projectPath: string;
  /** Footage for the new thread, in pick order. */
  inputVideoPaths: string[];
  /** Style Kit id; "" = the gallery default. */
  styleId: string;
  /** Presets swapped from the style's for this thread. */
  modules: ModuleSelection;
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
  projectsRoot,
  nextNumber,
  askProject,
  styles,
  defaultStyleId,
  onChange,
  onChangeRoot,
  onCreateCaption,
}: {
  draft: Draft;
  projects: ProjectOption[];
  projectsRoot: string;
  nextNumber: number;
  /** Bumped when a send needs a project first: opens the project picker. */
  askProject: number;
  styles: StyleSummary[];
  defaultStyleId: string;
  onChange: (draft: Draft) => void;
  onChangeRoot: (path: string) => Promise<void>;
  onCreateCaption: () => void;
}) {
  const [picker, setPicker] = useState<"project" | "videos" | null>(null);
  const styleId = draft.styleId || defaultStyleId;
  const library = usePresets(styleId, Boolean(styleId));
  const projectPath = draft.projectPath;
  const videos = draft.inputVideoPaths;
  useEffect(() => {
    if (askProject) setPicker("project");
  }, [askProject]);

  return (
    <>
      <button
        type="button"
        className={`chip${picker === "project" ? " is-open" : ""}${projectPath ? "" : " is-empty"}`}
        onClick={() => setPicker("project")}
        title={projectPath || "Escolha ou crie o projeto da thread"}
        aria-haspopup="dialog"
      >
        <Folder size={13} strokeWidth={1.75} />
        <span>{basename(projectPath) || "Escolher projeto"}</span>
        <ChevronDown size={11} strokeWidth={2} className="chip-caret" />
      </button>

      <span className="chip-group">
        <button
          type="button"
          className={`chip${picker === "videos" ? " is-open" : ""}${videos.length ? "" : " is-empty"}`}
          onClick={() => setPicker("videos")}
          disabled={!projectPath}
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

      <StylePicker
        styles={styles}
        value={styleId}
        // Another style has other presets: swaps don't carry over.
        onChange={(id) => onChange({ ...draft, styleId: id === defaultStyleId ? "" : id, modules: {} })}
      />

      <DraftPresetsChip
        styleModules={styles.find((s) => s.id === styleId)?.modules ?? null}
        override={draft.modules}
        library={library}
        styleId={styleId}
        onChange={(modules) => onChange({ ...draft, modules })}
        onCreateCaption={onCreateCaption}
      />

      {picker === "project" ? (
        <ProjectPicker
          current={projectPath}
          projects={projects}
          projectsRoot={projectsRoot}
          nextNumber={nextNumber}
          onChangeRoot={onChangeRoot}
          onSelect={(path) => {
            if (path === projectPath) return;
            // Footage belongs to a project: a new folder starts with none picked.
            onChange({ ...draft, projectPath: path, inputVideoPaths: [] });
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
      {picker === "videos" && projectPath ? (
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
export function ThreadTray({ thread, styles }: { thread: Thread; styles: StyleSummary[] }) {
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
      <span className="chip is-static" title="Estilo da thread">
        <PaletteIcon size={13} strokeWidth={1.75} />
        <span>{styleName(styles, thread.styleId)}</span>
      </span>
    </>
  );
}
