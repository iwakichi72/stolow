import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  FilePlus,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCcw,
  Save,
  Search,
  Settings,
  StickyNote
} from "lucide-react";
import type { ProjectFile, ProjectFileKind, ProjectSnapshot } from "../../shared/types";

export type SidebarTab = "files" | "search";

export interface ProjectSidebarProps {
  activeFile: ProjectFile | null;
  groupedFiles: Record<ProjectFile["kind"], ProjectFile[]>;
  isDirty: boolean;
  isOpening: boolean;
  isSaving: boolean;
  onCreateMarkdown: (folder: "manuscript" | "context") => void;
  onDeleteFile: (file: ProjectFile) => void;
  onDuplicateFile: (file: ProjectFile) => void;
  onFileSelect: (file: ProjectFile) => void;
  onOpenProject: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onSave: () => void;
  project: ProjectSnapshot | null;
  searchPanel: JSX.Element;
  sidebarTab: SidebarTab;
  sidebarWidth: number;
}

export function ProjectSidebar({
  activeFile,
  groupedFiles,
  isDirty,
  isOpening,
  isSaving,
  onCreateMarkdown,
  onDeleteFile,
  onDuplicateFile,
  onFileSelect,
  onOpenProject,
  onOpenSearch,
  onOpenSettings,
  onRefresh,
  onSave,
  project,
  searchPanel,
  sidebarTab,
  sidebarWidth
}: ProjectSidebarProps): JSX.Element {
  const [expandedGroups, setExpandedGroups] = useState<Record<ProjectFileKind, boolean>>({
    manuscript: true,
    context: true,
    other: true
  });

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: ProjectFile;
  } | null>(null);

  const toggleGroup = useCallback((kind: ProjectFileKind): void => {
    setExpandedGroups((current) => ({ ...current, [kind]: !current[kind] }));
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".sidebar-context-menu")) return;
      setContextMenu(null);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [contextMenu]);

  return (
    <aside
      className="sidebar"
      aria-label="Project files"
      style={{ width: sidebarWidth, maxWidth: "100%" }}
    >
      <div className="sidebar-brand">
        <button
          aria-label={project ? "別のプロジェクトを開く" : "プロジェクトを開く"}
          aria-busy={isOpening}
          className="project-header"
          disabled={isOpening}
          onClick={onOpenProject}
          title={project ? `${project.name} — ${project.rootPath}\nクリックで別プロジェクトを開く` : "プロジェクトを開く"}
          type="button"
        >
          {isOpening ? (
            <Loader2 aria-hidden className="spin" size={14} />
          ) : (
            <FolderOpen aria-hidden size={14} />
          )}
          <span className="project-header-name">{project ? project.name : "プロジェクトを開く"}</span>
        </button>
        <div className="sidebar-brand-actions">
          <button
            aria-label="設定を開く"
            className="brand-icon-button"
            onClick={onOpenSettings}
            title="設定"
            type="button"
          >
            <Settings aria-hidden size={15} />
          </button>
        </div>
      </div>

      <div className="toolbar">
        <button
          aria-label="保存"
          className="icon-button"
          disabled={!activeFile || isSaving}
          onClick={onSave}
          title="保存"
          type="button"
        >
          {isSaving ? (
            <Loader2 aria-hidden className="spin" size={15} />
          ) : isDirty ? (
            <Save aria-hidden size={15} />
          ) : (
            <Check aria-hidden size={15} />
          )}
        </button>
        <button
          aria-label="ファイル一覧を更新"
          className="icon-button"
          disabled={!project}
          onClick={onRefresh}
          title="ファイル一覧を更新"
          type="button"
        >
          <RefreshCcw aria-hidden size={15} />
        </button>
        <button
          aria-label="検索"
          className={`icon-button${sidebarTab === "search" ? " is-active" : ""}`}
          disabled={!project}
          onClick={onOpenSearch}
          title={project ? "検索" : "先にプロジェクトを開いてください"}
          type="button"
        >
          <Search aria-hidden size={15} />
        </button>
        <span className="toolbar-spacer" aria-hidden />
        <button
          aria-label="manuscript に新規 Markdown"
          className="icon-button"
          disabled={!project}
          onClick={() => {
            if (!project) {
              onOpenProject();
              return;
            }
            onCreateMarkdown("manuscript");
          }}
          title={project ? "原稿（manuscript）に新規 .md" : "先にプロジェクトを開いてください"}
          type="button"
        >
          <FilePlus aria-hidden size={15} />
        </button>
        <button
          aria-label="context に新規 Markdown"
          className="icon-button"
          disabled={!project}
          onClick={() => {
            if (!project) {
              onOpenProject();
              return;
            }
            onCreateMarkdown("context");
          }}
          title={project ? "Context に新規 .md" : "先にプロジェクトを開いてください"}
          type="button"
        >
          <StickyNote aria-hidden size={15} />
        </button>
      </div>

      {sidebarTab === "search" ? (
        <div className="sidebar-search" aria-label="検索">
          {searchPanel}
        </div>
      ) : (
        <div className="sidebar-files">
          <FileGroup
            activePath={activeFile?.relativePath}
            expanded={expandedGroups.manuscript}
            files={groupedFiles.manuscript}
            kind="manuscript"
            label="Manuscript"
            onContextMenu={(spec) => setContextMenu(spec)}
            onFileSelect={onFileSelect}
            onToggle={() => toggleGroup("manuscript")}
          />
          <FileGroup
            activePath={activeFile?.relativePath}
            expanded={expandedGroups.context}
            files={groupedFiles.context}
            kind="context"
            label="Context"
            onContextMenu={(spec) => setContextMenu(spec)}
            onFileSelect={onFileSelect}
            onToggle={() => toggleGroup("context")}
          />
          {groupedFiles.other.length > 0 ? (
            <FileGroup
              activePath={activeFile?.relativePath}
              expanded={expandedGroups.other}
              files={groupedFiles.other}
              kind="other"
              label="Other"
              onContextMenu={(spec) => setContextMenu(spec)}
              onFileSelect={onFileSelect}
              onToggle={() => toggleGroup("other")}
            />
          ) : null}
        </div>
      )}

      {contextMenu ? (
        <div
          aria-label="ファイル操作"
          className="sidebar-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="sidebar-context-menu-item"
            onClick={() => {
              const file = contextMenu.file;
              setContextMenu(null);
              onDuplicateFile(file);
            }}
            role="menuitem"
            type="button"
          >
            複製
          </button>
          <button
            className="sidebar-context-menu-item is-danger"
            onClick={() => {
              const file = contextMenu.file;
              setContextMenu(null);
              onDeleteFile(file);
            }}
            role="menuitem"
            type="button"
          >
            削除
          </button>
        </div>
      ) : null}
    </aside>
  );
}

interface FileGroupProps {
  activePath?: string;
  expanded: boolean;
  files: ProjectFile[];
  kind: ProjectFileKind;
  label: string;
  onContextMenu: (spec: { x: number; y: number; file: ProjectFile }) => void;
  onFileSelect: (file: ProjectFile) => void;
  onToggle: () => void;
}

function FileGroup({
  activePath,
  expanded,
  files,
  kind,
  label,
  onContextMenu,
  onFileSelect,
  onToggle
}: FileGroupProps): JSX.Element {
  return (
    <div className={`file-group${expanded ? "" : " is-collapsed"}`} data-kind={kind}>
      <button
        aria-controls={`file-group-${label}`}
        aria-expanded={expanded}
        className="group-label"
        onClick={onToggle}
        type="button"
      >
        <ChevronRight aria-hidden className="folder-chevron" size={14} />
        {label}
      </button>
      <div className="file-list" id={`file-group-${label}`} role="list">
        {files.length > 0 ? (
          files.map((file) => (
            <button
              className={`file-row${file.relativePath === activePath ? " active" : ""}`}
              key={file.relativePath}
              onClick={() => onFileSelect(file)}
              onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu({ x: event.clientX, y: event.clientY, file });
              }}
              type="button"
            >
              <FileText aria-hidden size={15} />
              <span>{file.name}</span>
            </button>
          ))
        ) : (
          <div className="empty-list">（空）</div>
        )}
      </div>
    </div>
  );
}

