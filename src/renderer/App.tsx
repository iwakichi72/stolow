import { useCallback, useEffect, useMemo, useState } from "react";
import type { InputHTMLAttributes } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  FilePlus,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCcw,
  Save,
  Sparkles,
  StickyNote,
  X
} from "lucide-react";
import type {
  EditorSelectionSnapshot,
  GenerateSuggestionsResult,
  ModelProfile,
  ProjectFile,
  ProjectFileKind,
  ProjectSnapshot,
  StolowSettings,
  SuggestionCandidate,
  SuggestionMode
} from "../shared/types";
import { MODEL_PROFILES, SUGGESTION_MODES } from "../shared/types";
import { MarkdownEditor } from "./components/MarkdownEditor";

const MODE_LABELS: Record<SuggestionMode, string> = {
  natural: "Natural",
  surprising: "Surprising",
  ominous: "Ominous",
  emotional: "Emotional",
  fast: "Fast",
  styleOnly: "Style"
};

const MODE_HINTS: Record<SuggestionMode, string> = {
  natural: "自然に続きを出す",
  surprising: "少し意外な方向へ",
  ominous: "不穏さを足す",
  emotional: "心理と余韻を強める",
  fast: "会話や行動で進める",
  styleOnly: "文体に寄せる"
};

const PROFILE_LABELS: Record<ModelProfile, string> = {
  default: "Default",
  quick: "Quick",
  quality: "Quality"
};

const EMPTY_SELECTION: EditorSelectionSnapshot = {
  from: 0,
  to: 0,
  head: 0,
  selectedText: ""
};

const LAYOUT_STORAGE_KEYS = {
  sidebarWidth: "stolow.layout.sidebarWidth",
  rightPanelWidth: "stolow.layout.rightPanelWidth",
  aiPanelOpen: "stolow.layout.aiPanelOpen"
} as const;

function readStoredNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "0") return false;
    if (raw === "1") return true;
    return fallback;
  } catch {
    return fallback;
  }
}

export function App(): JSX.Element {
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [lastSavedText, setLastSavedText] = useState("");
  const [selection, setSelection] = useState<EditorSelectionSnapshot>(EMPTY_SELECTION);
  const [mode, setMode] = useState<SuggestionMode>("natural");
  const [modelProfile, setModelProfile] = useState<ModelProfile>("default");
  const [settingsDraft, setSettingsDraft] = useState<StolowSettings | null>(null);
  const [suggestionResult, setSuggestionResult] = useState<GenerateSuggestionsResult | null>(null);
  const [generationTarget, setGenerationTarget] = useState<EditorSelectionSnapshot | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("プロジェクトを開いてください。");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredNumber(LAYOUT_STORAGE_KEYS.sidebarWidth, 260)
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    readStoredNumber(LAYOUT_STORAGE_KEYS.rightPanelWidth, 320)
  );
  const [aiPanelOpen, setAiPanelOpen] = useState(() =>
    readStoredBoolean(LAYOUT_STORAGE_KEYS.aiPanelOpen, true)
  );

  const isDirty = activeFile !== null && documentText !== lastSavedText;
  const selectedChars = selection.to > selection.from ? selection.to - selection.from : 0;

  const groupedFiles = useMemo(() => {
    const groups: Record<ProjectFile["kind"], ProjectFile[]> = {
      manuscript: [],
      context: [],
      other: []
    };

    for (const file of project?.files ?? []) {
      groups[file.kind].push(file);
    }

    return groups;
  }, [project?.files]);

  const loadFile = useCallback(
    async (file: ProjectFile, snapshot = project): Promise<void> => {
      if (!snapshot) return;
      setIsLoadingFile(true);
      setPanelError(null);

      try {
        const contents = await window.stolow.readFile(snapshot.rootPath, file.relativePath);
        setActiveFile(file);
        setDocumentText(contents);
        setLastSavedText(contents);
        setSelection(EMPTY_SELECTION);
        setSuggestionResult(null);
        setGenerationTarget(null);
        setStatusMessage(`${file.relativePath} を開きました。`);
      } catch (error) {
        console.error(error);
        setPanelError("ファイルを読み込めませんでした。");
      } finally {
        setIsLoadingFile(false);
      }
    },
    [project]
  );

  const refreshProject = useCallback(
    async (rootPath: string, preferredFile?: ProjectFile | null): Promise<ProjectSnapshot> => {
      const snapshot = await window.stolow.refreshProject(rootPath);
      setProject(snapshot);
      setSettingsDraft(snapshot.settings);
      setMode(snapshot.settings.defaultMode);

      const nextFile =
        (preferredFile &&
          snapshot.files.find((file) => file.relativePath === preferredFile.relativePath)) ??
        snapshot.files.find((file) => file.kind === "manuscript") ??
        snapshot.files[0] ??
        null;

      if (nextFile) {
        await loadFile(nextFile, snapshot);
      }

      return snapshot;
    },
    [loadFile]
  );

  const openProject = useCallback(async (): Promise<void> => {
    setIsOpening(true);
    setPanelError(null);

    try {
      if (!window.stolow) {
        setPanelError(
          "Electron のプリロードが読み込まれていません。`npm run dev` で起動するか、ビルド済みの Stolow から開いてください。"
        );
        return;
      }
      const snapshot = await window.stolow.openProject();
      if (!snapshot) return;

      setProject(snapshot);
      setSettingsDraft(snapshot.settings);
      setMode(snapshot.settings.defaultMode);
      setStatusMessage(`${snapshot.name} を開きました。`);

      const firstFile =
        snapshot.files.find((file) => file.kind === "manuscript") ?? snapshot.files[0] ?? null;
      if (firstFile) {
        await loadFile(firstFile, snapshot);
      } else {
        setActiveFile(null);
        setDocumentText("");
        setLastSavedText("");
        setSelection(EMPTY_SELECTION);
        setStatusMessage("Markdown ファイルが見つかりません。manuscript/ に .md を追加してください。");
      }
    } catch (error) {
      console.error(error);
      setPanelError("プロジェクトを開けませんでした。");
    } finally {
      setIsOpening(false);
    }
  }, [loadFile]);

  const saveFile = useCallback(async (): Promise<void> => {
    if (!project || !activeFile) {
      setPanelError("保存するファイルがありません。");
      return;
    }

    setIsSaving(true);
    setPanelError(null);

    try {
      await window.stolow.saveFile(project.rootPath, activeFile.relativePath, documentText);
      setLastSavedText(documentText);
      setStatusMessage("保存しました。");
      await refreshProject(project.rootPath, activeFile);
    } catch (error) {
      console.error(error);
      setPanelError("ファイル保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }, [activeFile, documentText, project, refreshProject]);

  const persistSettings = useCallback(
    async (nextSettings: StolowSettings): Promise<void> => {
      if (!project) return;
      setSettingsDraft(nextSettings);

      try {
        const saved = await window.stolow.updateSettings(project.rootPath, nextSettings);
        setProject((current) => (current ? { ...current, settings: saved } : current));
      } catch (error) {
        console.error(error);
        setPanelError("設定を保存できませんでした。");
      }
    },
    [project]
  );

  const updateSettingsField = useCallback(
    <K extends keyof StolowSettings>(field: K, value: StolowSettings[K]): void => {
      if (!settingsDraft) return;
      const nextSettings = { ...settingsDraft, [field]: value };
      void persistSettings(nextSettings);
    },
    [persistSettings, settingsDraft]
  );

  const generate = useCallback(async (): Promise<void> => {
    if (!project) {
      setPanelError("プロジェクトが開かれていません。");
      return;
    }
    if (!activeFile || !settingsDraft) {
      setPanelError("Markdownファイルを開いてください。");
      return;
    }

    const target = selection;
    setIsGenerating(true);
    setPanelError(null);
    setSuggestionResult(null);
    setGenerationTarget(target);

    try {
      const result = await window.stolow.generateSuggestions({
        projectPath: project.rootPath,
        documentText,
        cursorPosition: target.head,
        selection: target,
        mode,
        modelProfile,
        settings: settingsDraft
      });
      setSuggestionResult(result);
      setStatusMessage(
        result.kind === "rewrite" ? "リライト候補を生成しました。" : "次段落候補を生成しました。"
      );
    } catch (error) {
      console.error(error);
      setPanelError(error instanceof Error ? error.message : "AI生成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  }, [activeFile, documentText, mode, modelProfile, project, selection, settingsDraft]);

  const applySuggestion = useCallback(
    (candidate: SuggestionCandidate): void => {
      const target = generationTarget ?? selection;
      const cleanText = candidate.text.trim();
      if (!cleanText) {
        setPanelError("候補が空です。");
        return;
      }

      if (suggestionResult?.kind === "rewrite" && target.to > target.from) {
        const nextText = `${documentText.slice(0, target.from)}${cleanText}${documentText.slice(target.to)}`;
        setDocumentText(nextText);
        setSelection({
          from: target.from,
          to: target.from + cleanText.length,
          head: target.from + cleanText.length,
          selectedText: cleanText
        });
        setStatusMessage("選択範囲を候補で置き換えました。必要なら上書き保存してください。");
        return;
      }

      const insertion = formatParagraphInsertion(documentText, target.head, cleanText);
      const nextText = `${documentText.slice(0, target.head)}${insertion}${documentText.slice(target.head)}`;
      const head = target.head + insertion.length;
      setDocumentText(nextText);
      setSelection({
        from: head,
        to: head,
        head,
        selectedText: ""
      });
      setStatusMessage("候補を本文に反映しました。必要なら上書き保存してください。");
    },
    [documentText, generationTarget, selection, suggestionResult?.kind]
  );

  useEffect(() => {
    if (!project) return;
    setSettingsDraft(project.settings);
    setMode(project.settings.defaultMode);
  }, [project]);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEYS.sidebarWidth, String(Math.round(sidebarWidth)));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEYS.rightPanelWidth, String(Math.round(rightPanelWidth)));
    } catch {
      /* ignore */
    }
  }, [rightPanelWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEYS.aiPanelOpen, aiPanelOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [aiPanelOpen]);

  const beginResizeSidebar = useCallback(
    (event: React.MouseEvent): void => {
      event.preventDefault();
      const startX = event.clientX;
      const startW = sidebarWidth;
      const onMove = (moveEvent: MouseEvent): void => {
        const next = Math.round(Math.min(560, Math.max(180, startW + (moveEvent.clientX - startX))));
        setSidebarWidth(next);
      };
      const onUp = (): void => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [sidebarWidth]
  );

  const beginResizeSuggestionPane = useCallback(
    (event: React.MouseEvent): void => {
      event.preventDefault();
      const startX = event.clientX;
      const startW = rightPanelWidth;

      const onMove = (moveEvent: MouseEvent): void => {
        const deltaX = moveEvent.clientX - startX;
        // 区切りを右に動かすと右パネルは狭くなる（直感的な挙動）
        const unclamped = startW - deltaX;
        const next = Math.round(Math.min(720, Math.max(220, unclamped)));
        setRightPanelWidth(next);
      };
      const onUp = (): void => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [rightPanelWidth]
  );

  const createNewMarkdown = useCallback(
    async (folder: "manuscript" | "context"): Promise<void> => {
      if (!project) return;
      if (isDirty) {
        setPanelError("未保存の変更があります。保存してから新規ファイルを作成してください。");
        setStatusMessage("未保存の変更があります。保存してから新規ファイルを作成してください。");
        return;
      }

      const defaultStem = folder === "manuscript" ? "new-scene" : "new-note";
      const message =
        folder === "manuscript"
          ? "manuscript に新規 Markdown（ファイル名のみ。拡張子は省略可）"
          : "context に新規 Markdown（ファイル名のみ。拡張子は省略可）";
      const input = window.prompt(message, defaultStem);
      if (input === null) return;

      let base = input.trim().replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
      if (!base) return;
      if (!base.toLowerCase().endsWith(".md")) {
        base = `${base}.md`;
      }

      const relativePath = `${folder}/${base}`;
      setPanelError(null);

      try {
        const created = await window.stolow.createMarkdownFile(project.rootPath, relativePath);
        await refreshProject(project.rootPath, created);
        setStatusMessage(`${created.relativePath} を作成しました。`);
      } catch (error) {
        console.error(error);
        setPanelError(error instanceof Error ? error.message : "ファイルを作成できませんでした。");
      }
    },
    [isDirty, project, refreshProject]
  );

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  return (
    <main className="app-shell">
      <ProjectSidebar
        activeFile={activeFile}
        groupedFiles={groupedFiles}
        isDirty={isDirty}
        isOpening={isOpening}
        isSaving={isSaving}
        onCreateMarkdown={createNewMarkdown}
        onFileSelect={(file) => {
          if (isDirty) {
            setStatusMessage("未保存の変更があります。必要なら保存してから別ファイルを開いてください。");
            setPanelError("未保存の変更があります。保存してから別ファイルを開いてください。");
            return;
          }
          void loadFile(file);
        }}
        onOpenProject={openProject}
        onRefresh={() => {
          if (project) void refreshProject(project.rootPath, activeFile);
        }}
        onSave={saveFile}
        project={project}
        sidebarWidth={sidebarWidth}
      />

      <div
        aria-orientation="vertical"
        aria-label="サイドバー幅を変更"
        className="pane-resizer"
        onMouseDown={beginResizeSidebar}
        role="separator"
      />

      <section className="editor-pane" aria-label="Markdown editor">
        {!aiPanelOpen && panelError ? (
          <div className="editor-panel-error" role="alert">
            <AlertCircle aria-hidden size={17} />
            <span>{panelError}</span>
          </div>
        ) : null}
        <div className="editor-topbar">
          <div className="document-title">
            <span title={activeFile?.relativePath}>
              {activeFile ? `${activeFile.name}` : "ファイル未選択"}
            </span>
            {activeFile ? (
              <span className="document-path" title={activeFile.relativePath}>
                {activeFile.relativePath}
              </span>
            ) : null}
            {isDirty ? <strong className="dirty-badge">未保存</strong> : activeFile ? <span className="saved-badge">保存済み</span> : null}
          </div>
          <div className="document-meta">
            {isLoadingFile ? "読み込み中…" : `${documentText.length.toLocaleString()} 文字`}
          </div>
        </div>
        <MarkdownEditor
          value={documentText}
          onChange={setDocumentText}
          onSelectionChange={setSelection}
          selection={selection}
          editable={activeFile !== null}
        />
        <div className="statusbar">
          <span>{statusMessage}</span>
          <span>
            {selectedChars > 0 ? `${selectedChars.toLocaleString()} 文字を選択中` : "選択なし"}
          </span>
        </div>
      </section>

      {aiPanelOpen ? (
        <>
          <div
            aria-orientation="vertical"
            aria-label="AIパネル幅を変更"
            className="pane-resizer"
            onMouseDown={beginResizeSuggestionPane}
            role="separator"
          />
          <SuggestionPanel
            activeFile={activeFile}
            error={panelError}
            expectedSuggestionCount={settingsDraft?.suggestionCount ?? 3}
            isGenerating={isGenerating}
            mode={mode}
            modelProfile={modelProfile}
            onApply={applySuggestion}
            onClose={() => setAiPanelOpen(false)}
            onGenerate={generate}
            onModeChange={(nextMode) => {
              setMode(nextMode);
              if (settingsDraft) {
                void persistSettings({ ...settingsDraft, defaultMode: nextMode });
              }
            }}
            onModelProfileChange={setModelProfile}
            onSettingsChange={updateSettingsField}
            result={suggestionResult}
            rightPanelWidth={rightPanelWidth}
            selectedChars={selectedChars}
            settings={settingsDraft}
          />
        </>
      ) : (
        <button
          aria-label="AI サジェストパネルを開く"
          className="ai-panel-reopen"
          onClick={() => setAiPanelOpen(true)}
          title="AI サジェストを表示"
          type="button"
        >
          <Sparkles aria-hidden size={18} />
          AI
        </button>
      )}
    </main>
  );
}

interface ProjectSidebarProps {
  activeFile: ProjectFile | null;
  groupedFiles: Record<ProjectFile["kind"], ProjectFile[]>;
  isDirty: boolean;
  isOpening: boolean;
  isSaving: boolean;
  onCreateMarkdown: (folder: "manuscript" | "context") => void;
  onFileSelect: (file: ProjectFile) => void;
  onOpenProject: () => void;
  onRefresh: () => void;
  onSave: () => void;
  project: ProjectSnapshot | null;
  sidebarWidth: number;
}

function ProjectSidebar({
  activeFile,
  groupedFiles,
  isDirty,
  isOpening,
  isSaving,
  onCreateMarkdown,
  onFileSelect,
  onOpenProject,
  onRefresh,
  onSave,
  project,
  sidebarWidth
}: ProjectSidebarProps): JSX.Element {
  const [expandedGroups, setExpandedGroups] = useState<Record<ProjectFileKind, boolean>>({
    manuscript: true,
    context: true,
    other: true
  });

  const toggleGroup = useCallback((kind: ProjectFileKind): void => {
    setExpandedGroups((current) => ({ ...current, [kind]: !current[kind] }));
  }, []);

  return (
    <aside
      className="sidebar"
      aria-label="Project files"
      style={{ width: sidebarWidth, maxWidth: "100%" }}
    >
      {project ? (
        <div className="sidebar-project-line">
          <p title={project.rootPath}>{project.name}</p>
        </div>
      ) : null}

      <div className="toolbar">
        <button
          aria-busy={isOpening}
          className="primary-action"
          disabled={isOpening}
          onClick={onOpenProject}
          type="button"
        >
          {isOpening ? <Loader2 aria-hidden className="spin" size={16} /> : <FolderOpen aria-hidden size={16} />}
          Open
        </button>
        <button
          aria-label="Save"
          className="icon-button"
          disabled={!activeFile || isSaving}
          onClick={onSave}
          title="Save"
          type="button"
        >
          {isSaving ? (
            <Loader2 aria-hidden className="spin" size={16} />
          ) : isDirty ? (
            <Save aria-hidden size={16} />
          ) : (
            <Check aria-hidden size={16} />
          )}
        </button>
        <button
          aria-label="Refresh file list"
          className="icon-button"
          disabled={!project}
          onClick={onRefresh}
          title="Refresh files"
          type="button"
        >
          <RefreshCcw aria-hidden size={16} />
        </button>
        <button
          aria-label="manuscript に新規 Markdown"
          className="icon-button"
          disabled={!project}
          onClick={() => onCreateMarkdown("manuscript")}
          title="原稿（manuscript）に新規 .md"
          type="button"
        >
          <FilePlus aria-hidden size={16} />
        </button>
        <button
          aria-label="context に新規 Markdown"
          className="icon-button"
          disabled={!project}
          onClick={() => onCreateMarkdown("context")}
          title="Context に新規 .md"
          type="button"
        >
          <StickyNote aria-hidden size={16} />
        </button>
      </div>

      <div className="sidebar-files">
        <FileGroup
          activePath={activeFile?.relativePath}
          expanded={expandedGroups.manuscript}
          files={groupedFiles.manuscript}
          label="Manuscript"
          onFileSelect={onFileSelect}
          onToggle={() => toggleGroup("manuscript")}
        />
        <FileGroup
          activePath={activeFile?.relativePath}
          expanded={expandedGroups.context}
          files={groupedFiles.context}
          label="Context"
          onFileSelect={onFileSelect}
          onToggle={() => toggleGroup("context")}
        />
        {groupedFiles.other.length > 0 ? (
          <FileGroup
            activePath={activeFile?.relativePath}
            expanded={expandedGroups.other}
            files={groupedFiles.other}
            label="Other"
            onFileSelect={onFileSelect}
            onToggle={() => toggleGroup("other")}
          />
        ) : null}
      </div>
    </aside>
  );
}

interface FileGroupProps {
  activePath?: string;
  expanded: boolean;
  files: ProjectFile[];
  label: string;
  onFileSelect: (file: ProjectFile) => void;
  onToggle: () => void;
}

function FileGroup({
  activePath,
  expanded,
  files,
  label,
  onFileSelect,
  onToggle
}: FileGroupProps): JSX.Element {
  return (
    <div className={`file-group${expanded ? "" : " is-collapsed"}`}>
      <button
        aria-controls={`file-group-${label}`}
        aria-expanded={expanded}
        className="group-label"
        onClick={onToggle}
        type="button"
      >
        <ChevronRight aria-hidden className="folder-chevron" size={14} />
        <span>{label}</span>
      </button>
      <div className="file-list" id={`file-group-${label}`}>
        {files.length === 0 ? <div className="empty-list">No Markdown files</div> : null}
        {files.map((file) => (
          <button
            className={file.relativePath === activePath ? "file-row active" : "file-row"}
            key={file.relativePath}
            onClick={() => onFileSelect(file)}
            type="button"
          >
            <FileText aria-hidden size={15} />
            <span>{file.relativePath}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface SuggestionPanelProps {
  activeFile: ProjectFile | null;
  error: string | null;
  expectedSuggestionCount: number;
  isGenerating: boolean;
  mode: SuggestionMode;
  modelProfile: ModelProfile;
  onApply: (candidate: SuggestionCandidate) => void;
  onClose: () => void;
  onGenerate: () => void;
  onModeChange: (mode: SuggestionMode) => void;
  onModelProfileChange: (profile: ModelProfile) => void;
  onSettingsChange: <K extends keyof StolowSettings>(field: K, value: StolowSettings[K]) => void;
  result: GenerateSuggestionsResult | null;
  rightPanelWidth: number;
  selectedChars: number;
  settings: StolowSettings | null;
}

function SuggestionPanel({
  activeFile,
  error,
  expectedSuggestionCount,
  isGenerating,
  mode,
  modelProfile,
  onApply,
  onClose,
  onGenerate,
  onModeChange,
  onModelProfileChange,
  onSettingsChange,
  result,
  rightPanelWidth,
  selectedChars,
  settings
}: SuggestionPanelProps): JSX.Element {
  const controlsLocked = isGenerating;
  const shortCount =
    result && result.suggestions.length < expectedSuggestionCount
      ? `モデルは ${result.suggestions.length} 件のみ返しました（期待 ${expectedSuggestionCount} 件）。`
      : null;

  return (
    <aside
      className="suggestion-pane"
      aria-label="AI suggestions"
      style={{ width: rightPanelWidth, maxWidth: "100%" }}
    >
      <div className="panel-heading">
        <div>
          <h2>AI サジェスト</h2>
          <p>{selectedChars > 0 ? "選択範囲リライト" : "次の1段落"}</p>
        </div>
        <div className="panel-heading-actions">
          <button
            aria-label="AI パネルを閉じる"
            className="panel-close-button"
            onClick={onClose}
            title="パネルを閉じる"
            type="button"
          >
            <X aria-hidden size={16} />
          </button>
        </div>
      </div>

      <fieldset className="control-block control-fieldset">
        <legend className="control-legend">モード</legend>
        <div className="mode-grid">
          {SUGGESTION_MODES.map((item) => (
            <button
              aria-pressed={item === mode}
              className={item === mode ? "chip active" : "chip"}
              disabled={controlsLocked}
              key={item}
              onClick={() => onModeChange(item)}
              title={MODE_HINTS[item]}
              type="button"
            >
              {MODE_LABELS[item]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="control-block control-fieldset">
        <legend className="control-legend">モデル</legend>
        <div className="segmented" role="presentation">
          {MODEL_PROFILES.map((profile) => (
            <button
              aria-pressed={profile === modelProfile}
              className={profile === modelProfile ? "active" : ""}
              disabled={controlsLocked}
              key={profile}
              onClick={() => onModelProfileChange(profile)}
              type="button"
            >
              {PROFILE_LABELS[profile]}
            </button>
          ))}
        </div>
      </fieldset>

      {settings ? (
        <details className="settings-box">
          <summary>接続とモデル名</summary>
          <SettingsInput
            autoComplete="off"
            inputMode="url"
            label="Ollama URL"
            name="stolow-ollama-url"
            spellCheck={false}
            value={settings.ollamaUrl}
            onChange={(value) => onSettingsChange("ollamaUrl", value)}
          />
          <SettingsInput
            autoComplete="off"
            label="Default"
            name="stolow-model-default"
            spellCheck={false}
            value={settings.defaultModel}
            onChange={(value) => onSettingsChange("defaultModel", value)}
          />
          <SettingsInput
            autoComplete="off"
            label="Quick"
            name="stolow-model-quick"
            spellCheck={false}
            value={settings.quickModel}
            onChange={(value) => onSettingsChange("quickModel", value)}
          />
          <SettingsInput
            autoComplete="off"
            label="Quality"
            name="stolow-model-quality"
            spellCheck={false}
            value={settings.qualityModel}
            onChange={(value) => onSettingsChange("qualityModel", value)}
          />
        </details>
      ) : null}

      <button
        className="generate-button"
        disabled={!activeFile || !settings || isGenerating}
        onClick={onGenerate}
        type="button"
      >
        {isGenerating ? (
          <Loader2 aria-hidden className="spin" size={18} />
        ) : (
          <Sparkles aria-hidden size={18} />
        )}
        {isGenerating
          ? "生成中…"
          : selectedChars > 0
            ? "リライト候補を生成"
            : `次段落を ${expectedSuggestionCount} 件生成`}
      </button>

      {isGenerating ? (
        <div className="generating-hint" role="status">
          <Loader2 className="spin" size={16} aria-hidden />
          <span>Ollama から応答を待っています。長いモデルは数分かかることがあります。</span>
        </div>
      ) : null}

      {error ? (
        <div className="error-box" role="alert">
          <AlertCircle aria-hidden size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      {shortCount ? (
        <div className="hint-box" role="status">
          {shortCount}
        </div>
      ) : null}

      <div className={`suggestion-list${isGenerating ? " is-generating" : ""}`}>
        {result?.suggestions.map((candidate) => (
          <article className="suggestion-card" key={candidate.id}>
            <div className="suggestion-title">
              <span>{candidate.title}</span>
              <button disabled={isGenerating} onClick={() => onApply(candidate)} type="button">
                本文に反映
              </button>
            </div>
            <p className="suggestion-body">{candidate.text}</p>
          </article>
        ))}
        {!result && !isGenerating ? (
          <div className="empty-suggestions">
            <Sparkles aria-hidden size={18} />
            <span>候補はここに表示されます。反映したい候補だけ「本文に反映」を押してください。</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

interface SettingsInputProps {
  autoComplete?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  name?: string;
  onChange: (value: string) => void;
  spellCheck?: boolean;
  value: string;
}

function SettingsInput({
  autoComplete,
  inputMode,
  label,
  name,
  onChange,
  spellCheck,
  value
}: SettingsInputProps): JSX.Element {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <label className="settings-input">
      <span>{label}</span>
      <input
        autoComplete={autoComplete}
        inputMode={inputMode}
        name={name}
        spellCheck={spellCheck}
        value={draft}
        onBlur={() => {
          if (draft.trim() && draft !== value) onChange(draft.trim());
        }}
        onChange={(event) => setDraft(event.target.value)}
      />
    </label>
  );
}

function formatParagraphInsertion(documentText: string, position: number, text: string): string {
  const before = documentText.slice(0, position);
  const after = documentText.slice(position);
  const prefix = before.length === 0 || /\n\n$/.test(before) ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.length === 0 || /^\n\n/.test(after) ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return `${prefix}${text}${suffix}`;
}
