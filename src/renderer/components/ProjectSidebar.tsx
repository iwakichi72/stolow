import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronsUpDown,
  Check,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Settings
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
  /** Electron 上ではネイティブメニューを表示し、結果に応じてアクションを実行する */
  onRequestNativeMenu?: (file: ProjectFile) => void;
  onFileSelect: (file: ProjectFile) => void;
  onOpenProject: () => void;
  onOpenProjectAtPath?: (path: string) => void;
  onRevealProject?: (path: string) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onSave: () => void;
  project: ProjectSnapshot | null;
  recentProjectPaths?: string[];
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
  onRequestNativeMenu,
  onFileSelect,
  onOpenProject,
  onOpenProjectAtPath,
  onRevealProject,
  onOpenSearch,
  onOpenSettings,
  onRefresh,
  onSave,
  project,
  recentProjectPaths,
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

  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const projectTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!projectMenuOpen) return;

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (projectMenuRef.current?.contains(target)) return;
      if (projectTriggerRef.current?.contains(target)) return;
      setProjectMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setProjectMenuOpen(false);
        projectTriggerRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [projectMenuOpen]);

  const toggleGroup = useCallback((kind: ProjectFileKind): void => {
    setExpandedGroups((current) => ({ ...current, [kind]: !current[kind] }));
  }, []);

  const treeRef = useRef<HTMLDivElement | null>(null);

  const handleTreeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const isArrow = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key);
      if (!isArrow) return;

      const root = treeRef.current;
      if (!root) return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>("[data-tree-key]")
      ).filter((el) => el.offsetParent !== null); // visible only
      if (items.length === 0) return;

      const current = (event.target as HTMLElement).closest<HTMLElement>("[data-tree-key]");
      const currentIndex = current ? items.indexOf(current) : -1;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = items[Math.min(currentIndex + 1, items.length - 1)] ?? items[0];
        next?.focus();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        const next = items[Math.max(currentIndex - 1, 0)] ?? items[0];
        next?.focus();
        return;
      }
      if (event.key === "ArrowRight") {
        if (!current) return;
        const kind = current.dataset.treeKind;
        if (kind === "group") {
          const groupKind = current.dataset.treeGroup as ProjectFileKind | undefined;
          if (!groupKind) return;
          event.preventDefault();
          if (!expandedGroups[groupKind]) {
            toggleGroup(groupKind);
          } else {
            const next = items[currentIndex + 1];
            next?.focus();
          }
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        if (!current) return;
        const kind = current.dataset.treeKind;
        event.preventDefault();
        if (kind === "group") {
          const groupKind = current.dataset.treeGroup as ProjectFileKind | undefined;
          if (groupKind && expandedGroups[groupKind]) toggleGroup(groupKind);
        } else if (kind === "file") {
          const groupKind = current.dataset.treeGroup as ProjectFileKind | undefined;
          if (!groupKind) return;
          const parent = items.find(
            (el) => el.dataset.treeKind === "group" && el.dataset.treeGroup === groupKind
          );
          parent?.focus();
        }
      }
    },
    [expandedGroups, toggleGroup]
  );

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
          ref={projectTriggerRef}
          aria-haspopup="menu"
          aria-expanded={projectMenuOpen}
          aria-label={project ? "プロジェクトメニュー" : "プロジェクトを開く"}
          aria-busy={isOpening}
          className="project-header"
          disabled={isOpening}
          onClick={() => {
            if (!project) {
              onOpenProject();
              return;
            }
            setProjectMenuOpen((current) => !current);
          }}
          title={project ? `${project.name} — ${project.rootPath}` : "プロジェクトを開く"}
          type="button"
        >
          {isOpening ? (
            <Loader2 aria-hidden className="spin" size={14} />
          ) : (
            <FolderOpen aria-hidden size={14} />
          )}
          <span className="project-header-name">{project ? project.name : "プロジェクトを開く"}</span>
          {project ? <ChevronsUpDown aria-hidden size={12} className="project-header-chev" /> : null}
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

        {projectMenuOpen && project ? (
          <div
            ref={projectMenuRef}
            className="project-menu"
            role="menu"
            aria-label="プロジェクトメニュー"
          >
            <div className="project-menu-section-label">現在のプロジェクト</div>
            <div className="project-menu-current" title={project.rootPath}>
              <Check aria-hidden size={13} />
              <div className="project-menu-current-text">
                <span className="project-menu-current-name">{project.name}</span>
                <span className="project-menu-current-path">{project.rootPath}</span>
              </div>
            </div>

            {recentProjectPaths && recentProjectPaths.filter((p) => p !== project.rootPath).length > 0 ? (
              <>
                <div className="project-menu-divider" role="separator" />
                <div className="project-menu-section-label">最近開いた</div>
                {recentProjectPaths
                  .filter((p) => p !== project.rootPath)
                  .slice(0, 6)
                  .map((path) => {
                    const name = path.split("/").filter(Boolean).pop() ?? path;
                    return (
                      <button
                        key={path}
                        className="project-menu-item"
                        role="menuitem"
                        title={path}
                        onClick={() => {
                          setProjectMenuOpen(false);
                          onOpenProjectAtPath?.(path);
                        }}
                        type="button"
                      >
                        <span className="project-menu-item-name">{name}</span>
                        <span className="project-menu-item-path">{path}</span>
                      </button>
                    );
                  })}
              </>
            ) : null}

            <div className="project-menu-divider" role="separator" />
            <button
              className="project-menu-item"
              role="menuitem"
              onClick={() => {
                setProjectMenuOpen(false);
                onOpenProject();
              }}
              type="button"
            >
              他のフォルダを開く…
            </button>
            {onRevealProject ? (
              <button
                className="project-menu-item"
                role="menuitem"
                onClick={() => {
                  setProjectMenuOpen(false);
                  onRevealProject(project.rootPath);
                }}
                type="button"
              >
                Finder で表示
              </button>
            ) : null}
            <button
              className="project-menu-item"
              role="menuitem"
              onClick={() => {
                setProjectMenuOpen(false);
                onRefresh();
              }}
              type="button"
            >
              <RefreshCcw aria-hidden size={13} />
              <span>ファイル一覧を更新</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="toolbar" aria-label="サイドバー操作">
        <button
          aria-label="検索"
          aria-pressed={sidebarTab === "search"}
          className={`icon-button${sidebarTab === "search" ? " is-active" : ""}`}
          disabled={!project}
          onClick={onOpenSearch}
          title={project ? "プロジェクト内検索" : "先にプロジェクトを開いてください"}
          type="button"
        >
          <Search aria-hidden size={15} />
        </button>
      </div>

      {sidebarTab === "search" ? (
        <div className="sidebar-search" aria-label="検索">
          {searchPanel}
        </div>
      ) : (
        <div
          ref={treeRef}
          className="sidebar-files"
          role="tree"
          aria-label="プロジェクトファイル"
          onKeyDown={handleTreeKeyDown}
        >
          <FileGroup
            activePath={activeFile?.relativePath}
            expanded={expandedGroups.manuscript}
            files={groupedFiles.manuscript}
            kind="manuscript"
            label="Manuscript"
            onCreate={project ? () => onCreateMarkdown("manuscript") : undefined}
            onContextMenu={(spec) => {
              if (onRequestNativeMenu) {
                onRequestNativeMenu(spec.file);
                return;
              }
              setContextMenu(spec);
            }}
            onFileSelect={onFileSelect}
            onToggle={() => toggleGroup("manuscript")}
          />
          <FileGroup
            activePath={activeFile?.relativePath}
            expanded={expandedGroups.context}
            files={groupedFiles.context}
            kind="context"
            label="Context"
            onCreate={project ? () => onCreateMarkdown("context") : undefined}
            onContextMenu={(spec) => {
              if (onRequestNativeMenu) {
                onRequestNativeMenu(spec.file);
                return;
              }
              setContextMenu(spec);
            }}
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
              onContextMenu={(spec) => {
                if (onRequestNativeMenu) {
                  onRequestNativeMenu(spec.file);
                  return;
                }
                setContextMenu(spec);
              }}
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
  onCreate?: () => void;
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
  onCreate,
  onContextMenu,
  onFileSelect,
  onToggle
}: FileGroupProps): JSX.Element {
  return (
    <div className={`file-group${expanded ? "" : " is-collapsed"}`} data-kind={kind}>
      <div className="group-header">
        <button
          aria-controls={`file-group-${label}`}
          aria-expanded={expanded}
          className="group-label"
          data-tree-key={`group:${kind}`}
          data-tree-kind="group"
          data-tree-group={kind}
          onClick={onToggle}
          role="treeitem"
          type="button"
        >
          <ChevronRight aria-hidden className="folder-chevron" size={14} />
          {label}
        </button>
        {onCreate ? (
          <button
            aria-label={`${label} に新規 Markdown`}
            className="group-action"
            onClick={onCreate}
            title={`${label} に新規 Markdown`}
            type="button"
          >
            <Plus aria-hidden size={13} />
          </button>
        ) : null}
      </div>
      <div className="file-list" id={`file-group-${label}`} role="list">
        {files.length > 0 ? (
          files.map((file) => (
            <button
              aria-selected={file.relativePath === activePath}
              className={`file-row${file.relativePath === activePath ? " active" : ""}`}
              data-tree-key={`file:${file.relativePath}`}
              data-tree-kind="file"
              data-tree-group={kind}
              key={file.relativePath}
              onClick={() => onFileSelect(file)}
              onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu({ x: event.clientX, y: event.clientY, file });
              }}
              role="treeitem"
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

