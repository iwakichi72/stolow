import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ProjectSearchResult,
  ProjectReplacePreviewResult,
  ProjectSnapshot,
  StolowSettings,
  SuggestionCandidate,
  SuggestionMode
} from "../shared/types";
import { MODEL_PROFILES, SUGGESTION_MODES } from "../shared/types";
import { MarkdownEditor, type MarkdownEditorHandle } from "./components/MarkdownEditor";

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
  const [contextSelection, setContextSelection] = useState<Record<string, boolean>>({});
  const [chapterHeadingLevel, setChapterHeadingLevel] = useState<0 | 1 | 2>(0);
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
  const [newFileModal, setNewFileModal] = useState<null | { folder: "manuscript" | "context"; value: string }>(
    null
  );
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredNumber(LAYOUT_STORAGE_KEYS.sidebarWidth, 260)
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    readStoredNumber(LAYOUT_STORAGE_KEYS.rightPanelWidth, 320)
  );
  const [aiPanelOpen, setAiPanelOpen] = useState(() =>
    readStoredBoolean(LAYOUT_STORAGE_KEYS.aiPanelOpen, true)
  );
  const [rightPanelTab, setRightPanelTab] = useState<"ai" | "search">("ai");
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const focusSearchRef = useRef<null | (() => void)>(null);
  const projectRef = useRef<ProjectSnapshot | null>(null);
  const [previewPlan, setPreviewPlan] = useState<null | {
    title: string;
    kindLabel: string;
    beforeText: string;
    afterText: string;
    change: { from: number; to: number; insert: string; selection: EditorSelectionSnapshot };
  }>(null);

  const isDirty = activeFile !== null && documentText !== lastSavedText;
  const selectedChars = selection.to > selection.from ? selection.to - selection.from : 0;
  const contextFiles = useMemo(
    () => (project?.files ?? []).filter((file) => file.kind === "context"),
    [project?.files]
  );
  const selectedContextFiles = useMemo(
    () => Object.keys(contextSelection).filter((path) => contextSelection[path]),
    [contextSelection]
  );

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

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const loadFile = useCallback(
    async (file: ProjectFile, snapshot?: ProjectSnapshot | null): Promise<void> => {
      const resolvedSnapshot = snapshot ?? projectRef.current;
      if (!resolvedSnapshot) return;
      setIsLoadingFile(true);
      setPanelError(null);

      try {
        const contents = await window.stolow.readFile(resolvedSnapshot.rootPath, file.relativePath);
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
    []
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

  // 起動時に最後に開いていたプロジェクトを自動で開く
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.stolow) return;
        const snapshot = await window.stolow.openLastProject();
        if (cancelled || !snapshot) return;

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
          setStatusMessage("Markdown ファイルが見つかりません。");
        }
      } catch (e) {
        // 最後のプロジェクトが無い/消えた等は黙って初期表示のままにする
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
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
        contextFiles: selectedContextFiles,
        chapterHeadingLevel,
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
  }, [
    activeFile,
    chapterHeadingLevel,
    documentText,
    mode,
    modelProfile,
    project,
    selection,
    selectedContextFiles,
    settingsDraft
  ]);

  const buildApplyPlan = useCallback(
    (candidate: SuggestionCandidate) => {
      const target = generationTarget ?? selection;
      const cleanText = candidate.text.trim();
      if (!cleanText) return null;

      if (suggestionResult?.kind === "rewrite" && target.to > target.from) {
        const nextSelection: EditorSelectionSnapshot = {
          from: target.from,
          to: target.from + cleanText.length,
          head: target.from + cleanText.length,
          selectedText: cleanText
        };
        return {
          title: candidate.title,
          kindLabel: "リライト（置き換え）",
          beforeText: documentText.slice(target.from, target.to),
          afterText: cleanText,
          change: { from: target.from, to: target.to, insert: cleanText, selection: nextSelection }
        };
      }

      const insertion = formatParagraphInsertion(documentText, target.head, cleanText);
      const head = target.head + insertion.length;
      const nextSelection: EditorSelectionSnapshot = {
        from: head,
        to: head,
        head,
        selectedText: ""
      };

      const contextBefore = documentText.slice(Math.max(0, target.head - 220), target.head);
      const contextAfter = documentText.slice(target.head, Math.min(documentText.length, target.head + 220));
      const beforeText = `${contextBefore}[挿入位置]${contextAfter}`;

      return {
        title: candidate.title,
        kindLabel: "次段落（挿入）",
        beforeText,
        afterText: insertion,
        change: { from: target.head, to: target.head, insert: insertion, selection: nextSelection }
      };
    },
    [documentText, generationTarget, selection, suggestionResult?.kind]
  );

  const applySuggestion = useCallback(
    (candidate: SuggestionCandidate): void => {
      const plan = buildApplyPlan(candidate);
      if (!plan) {
        setPanelError("候補が空です。");
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        setPanelError("エディタが初期化されていません。");
        return;
      }
      editor.applyChange(plan.change);
      setStatusMessage("候補を本文に反映しました。必要なら上書き保存してください。");
    },
    [buildApplyPlan]
  );

  useEffect(() => {
    if (!project) return;
    setSettingsDraft(project.settings);
    setMode(project.settings.defaultMode);
  }, [project]);


  useEffect(() => {
    if (!project) return;
    setContextSelection((current) => {
      const next: Record<string, boolean> = {};
      for (const file of project.files) {
        if (file.kind !== "context") continue;
        const fallback =
          file.relativePath === "context/summary.md" || file.relativePath === "context/notes.md";
        next[file.relativePath] = current[file.relativePath] ?? fallback;
      }
      return next;
    });
  }, [project?.files]);

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
      setPanelError(null);
      setNewFileModal({ folder, value: defaultStem });
    },
    [isDirty, project, refreshProject]
  );

  const submitNewFile = useCallback(async (): Promise<void> => {
    if (!project || !newFileModal) return;
    if (isDirty) {
      setPanelError("未保存の変更があります。保存してから新規ファイルを作成してください。");
      setStatusMessage("未保存の変更があります。保存してから新規ファイルを作成してください。");
      return;
    }

    const { folder, value } = newFileModal;
    let base = value.trim().replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
    if (!base) {
      setPanelError("ファイル名を入力してください。");
      return;
    }
    if (!base.toLowerCase().endsWith(".md")) {
      base = `${base}.md`;
    }

    const relativePath = `${folder}/${base}`;
    setPanelError(null);

    try {
      const created = await window.stolow.createMarkdownFile(project.rootPath, relativePath);
      setNewFileModal(null);
      await refreshProject(project.rootPath, created);
      setStatusMessage(`${created.relativePath} を作成しました。`);
    } catch (error) {
      console.error(error);
      setPanelError(error instanceof Error ? error.message : "ファイルを作成できませんでした。");
    }
  }, [isDirty, newFileModal, project, refreshProject]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const isEditableElement = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || target.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = navigator.platform.includes("Mac") ? event.metaKey : event.ctrlKey;
      if (!mod && event.key !== "Escape") return;

      // Escape: close preview modal
      if (event.key === "Escape") {
        if (previewPlan) {
          event.preventDefault();
          setPreviewPlan(null);
        }
        return;
      }

      // Avoid hijacking when typing into inputs
      if (isEditableElement(event.target)) return;

      // Mod+F: open search tab and focus query
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (!aiPanelOpen) setAiPanelOpen(true);
        setRightPanelTab("search");
        window.setTimeout(() => focusSearchRef.current?.(), 0);
        return;
      }

      // Mod+Enter: generate (AI tab)
      if (event.key === "Enter") {
        if (!aiPanelOpen) setAiPanelOpen(true);
        setRightPanelTab("ai");
        event.preventDefault();
        void generate();
        return;
      }

      // Mod+Shift+P: preview first candidate
      if (event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        const first = suggestionResult?.suggestions?.[0];
        if (!first) {
          setPanelError("プレビューする候補がありません。先に生成してください。");
          return;
        }
        const plan = buildApplyPlan(first);
        if (!plan) {
          setPanelError("候補が空です。");
          return;
        }
        setPreviewPlan(plan);
        return;
      }

      // Mod+Shift+A: apply first candidate
      if (event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const first = suggestionResult?.suggestions?.[0];
        if (!first) {
          setPanelError("反映する候補がありません。先に生成してください。");
          return;
        }
        applySuggestion(first);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    aiPanelOpen,
    applySuggestion,
    buildApplyPlan,
    generate,
    isDirty,
    previewPlan,
    suggestionResult?.suggestions
  ]);

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
          ref={editorRef}
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
          <aside
            className="suggestion-pane"
            aria-label="Right panel"
            style={{ width: rightPanelWidth, maxWidth: "100%" }}
          >
            <div className="panel-heading">
              <div>
                <h2>{rightPanelTab === "ai" ? "AI サジェスト" : "検索"}</h2>
                <p>
                  {rightPanelTab === "ai"
                    ? selectedChars > 0
                      ? "選択範囲リライト"
                      : "次の1段落"
                    : project
                      ? "プロジェクト内の Markdown を検索"
                      : "プロジェクト未選択"}
                </p>
              </div>
              <div className="panel-heading-actions">
                <div className="panel-tabs" role="tablist" aria-label="Right panel tabs">
                  <button
                    aria-selected={rightPanelTab === "ai"}
                    className={rightPanelTab === "ai" ? "active" : ""}
                    onClick={() => setRightPanelTab("ai")}
                    role="tab"
                    type="button"
                  >
                    AI
                  </button>
                  <button
                    aria-selected={rightPanelTab === "search"}
                    className={rightPanelTab === "search" ? "active" : ""}
                    onClick={() => setRightPanelTab("search")}
                    role="tab"
                    type="button"
                  >
                    検索
                  </button>
                </div>
                <button
                  aria-label="右パネルを閉じる"
                  className="panel-close-button"
                  onClick={() => setAiPanelOpen(false)}
                  title="パネルを閉じる"
                  type="button"
                >
                  <X aria-hidden size={16} />
                </button>
              </div>
            </div>

            {rightPanelTab === "ai" ? (
              <SuggestionPanelBody
                activeFile={activeFile}
                contextFiles={contextFiles}
                contextSelection={contextSelection}
                chapterHeadingLevel={chapterHeadingLevel}
                error={panelError}
                expectedSuggestionCount={settingsDraft?.suggestionCount ?? 3}
                isGenerating={isGenerating}
                mode={mode}
                modelProfile={modelProfile}
                onApply={applySuggestion}
                onChapterHeadingLevelChange={setChapterHeadingLevel}
                onContextToggle={(relativePath, nextValue) => {
                  setContextSelection((current) => ({ ...current, [relativePath]: nextValue }));
                }}
                onModeChange={(nextMode) => {
                  setMode(nextMode);
                  if (settingsDraft) {
                    void persistSettings({ ...settingsDraft, defaultMode: nextMode });
                  }
                }}
                onModelProfileChange={setModelProfile}
                onPreview={(candidate) => {
                  const plan = buildApplyPlan(candidate);
                  if (!plan) {
                    setPanelError("候補が空です。");
                    return;
                  }
                  setPreviewPlan(plan);
                }}
                onGenerate={generate}
                onSettingsChange={updateSettingsField}
                result={suggestionResult}
                selectedChars={selectedChars}
                settings={settingsDraft}
              />
            ) : (
              <SearchPanel
                error={panelError}
                project={project}
                registerFocus={(fn) => {
                  focusSearchRef.current = fn;
                }}
                onJump={async (relativePath, from, to) => {
                  if (!project) return;
                  const file = project.files.find((f) => f.relativePath === relativePath);
                  if (!file) return;
                  await loadFile(file);
                  const head = to;
                  setSelection({
                    from,
                    to,
                    head,
                    selectedText: ""
                  });
                }}
                onRefreshAfterReplace={async () => {
                  if (!project) return;
                  await refreshProject(project.rootPath, activeFile);
                  if (activeFile) {
                    await loadFile(activeFile);
                  }
                }}
                setPanelError={setPanelError}
                setStatusMessage={setStatusMessage}
              />
            )}
          </aside>
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
      {previewPlan ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="候補プレビュー"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewPlan(null);
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3>{previewPlan.title}</h3>
                <p>{previewPlan.kindLabel}</p>
              </div>
              <div className="modal-actions">
                <button className="icon-button" onClick={() => setPreviewPlan(null)} type="button">
                  <X aria-hidden size={16} />
                </button>
              </div>
            </div>
            <div className="modal-grid">
              <section className="modal-pane">
                <h4>Before</h4>
                <pre>{previewPlan.beforeText}</pre>
              </section>
              <section className="modal-pane">
                <h4>After</h4>
                <pre>{previewPlan.afterText}</pre>
              </section>
            </div>
            <div className="modal-footer">
              <button className="chip" onClick={() => setPreviewPlan(null)} type="button">
                閉じる
              </button>
              <button
                className="primary-action"
                onClick={() => {
                  const editor = editorRef.current;
                  if (!editor) return;
                  editor.applyChange(previewPlan.change);
                  setPreviewPlan(null);
                  setStatusMessage("候補を本文に反映しました。必要なら上書き保存してください。");
                }}
                type="button"
              >
                本文に反映
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {newFileModal ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="新規 Markdown を作成"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNewFileModal(null);
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3>新規 Markdown</h3>
                <p>
                  {newFileModal.folder === "manuscript"
                    ? "manuscript/ に作成します（拡張子は省略可）"
                    : "context/ に作成します（拡張子は省略可）"}
                </p>
              </div>
              <div className="modal-actions">
                <button className="icon-button" onClick={() => setNewFileModal(null)} type="button">
                  <X aria-hidden size={16} />
                </button>
              </div>
            </div>
            <div className="modal-grid" style={{ gridTemplateColumns: "1fr" }}>
              <section className="modal-pane">
                <h4>ファイル名</h4>
                <div style={{ padding: 12 }}>
                  <input
                    autoFocus
                    className="select-input"
                    value={newFileModal.value}
                    onChange={(e) => setNewFileModal((cur) => (cur ? { ...cur, value: e.target.value } : cur))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitNewFile();
                      if (e.key === "Escape") setNewFileModal(null);
                    }}
                    placeholder="例: 02-first-meeting"
                    spellCheck={false}
                  />
                </div>
              </section>
            </div>
            <div className="modal-footer">
              <button className="chip" onClick={() => setNewFileModal(null)} type="button">
                キャンセル
              </button>
              <button className="primary-action" onClick={() => void submitNewFile()} type="button">
                作成
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

      <div
        className="toolbar"
        onMouseDownCapture={() => {
          // no-op
        }}
      >
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
          <FilePlus aria-hidden size={16} />
        </button>
        <button
          aria-label="context に新規 Markdown"
          className="icon-button"
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

interface SuggestionPanelBodyProps {
  activeFile: ProjectFile | null;
  contextFiles: ProjectFile[];
  contextSelection: Record<string, boolean>;
  chapterHeadingLevel: 0 | 1 | 2;
  error: string | null;
  expectedSuggestionCount: number;
  isGenerating: boolean;
  mode: SuggestionMode;
  modelProfile: ModelProfile;
  onApply: (candidate: SuggestionCandidate) => void;
  onPreview: (candidate: SuggestionCandidate) => void;
  onGenerate: () => void;
  onChapterHeadingLevelChange: (value: 0 | 1 | 2) => void;
  onContextToggle: (relativePath: string, nextValue: boolean) => void;
  onModeChange: (mode: SuggestionMode) => void;
  onModelProfileChange: (profile: ModelProfile) => void;
  onSettingsChange: <K extends keyof StolowSettings>(field: K, value: StolowSettings[K]) => void;
  result: GenerateSuggestionsResult | null;
  selectedChars: number;
  settings: StolowSettings | null;
}

function SuggestionPanelBody({
  activeFile,
  contextFiles,
  contextSelection,
  chapterHeadingLevel,
  error,
  expectedSuggestionCount,
  isGenerating,
  mode,
  modelProfile,
  onApply,
  onPreview,
  onGenerate,
  onChapterHeadingLevelChange,
  onContextToggle,
  onModeChange,
  onModelProfileChange,
  onSettingsChange,
  result,
  selectedChars,
  settings
}: SuggestionPanelBodyProps): JSX.Element {
  const controlsLocked = isGenerating;
  const shortCount =
    result && result.suggestions.length < expectedSuggestionCount
      ? `モデルは ${result.suggestions.length} 件のみ返しました（期待 ${expectedSuggestionCount} 件）。`
      : null;

  return (
    <>
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
        <legend className="control-legend">参照コンテキスト</legend>
        {contextFiles.length === 0 ? (
          <div className="empty-list">context/ に Markdown がありません</div>
        ) : (
          contextFiles.map((file) => (
            <label className="toggle-row" key={file.relativePath}>
              <input
                checked={contextSelection[file.relativePath] ?? false}
                disabled={controlsLocked}
                onChange={(event) => onContextToggle(file.relativePath, event.target.checked)}
                type="checkbox"
              />
              <span>{file.relativePath}</span>
            </label>
          ))
        )}
      </fieldset>

      <fieldset className="control-block control-fieldset">
        <legend className="control-legend">章コンテキスト（カーソル位置）</legend>
        <label className="settings-input">
          <span>単位</span>
          <select
            className="select-input"
            disabled={controlsLocked}
            value={String(chapterHeadingLevel)}
            onChange={(e) => onChapterHeadingLevelChange((Number(e.target.value) as 0 | 1 | 2) ?? 0)}
          >
            <option value="0">OFF</option>
            <option value="1">#（章）</option>
            <option value="2">##（節）</option>
          </select>
        </label>
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

      <button
        className="chip"
        disabled={controlsLocked}
        onClick={() => {
          void window.stolow?.openSettingsWindow();
        }}
        type="button"
      >
        接続/モデル/アプリ設定…
      </button>

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
              <div className="suggestion-actions">
                <button disabled={isGenerating} onClick={() => onPreview(candidate)} type="button">
                  プレビュー
                </button>
                <button disabled={isGenerating} onClick={() => onApply(candidate)} type="button">
                  本文に反映
                </button>
              </div>
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
    </>
  );
}

function SearchPanel({
  error,
  registerFocus,
  onJump,
  onRefreshAfterReplace,
  project,
  setPanelError,
  setStatusMessage
}: {
  error: string | null;
  project: ProjectSnapshot | null;
  registerFocus: (fn: () => void) => void;
  onJump: (relativePath: string, from: number, to: number) => Promise<void>;
  onRefreshAfterReplace: () => Promise<void>;
  setPanelError: (value: string | null) => void;
  setStatusMessage: (value: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [result, setResult] = useState<ProjectSearchResult | null>(null);
  const [preview, setPreview] = useState<ProjectReplacePreviewResult | null>(null);
  const queryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    registerFocus(() => {
      queryInputRef.current?.focus();
      queryInputRef.current?.select();
    });
  }, [registerFocus]);

  const canRun = Boolean(project) && query.trim().length > 0 && !isSearching;

  const runSearch = useCallback(async (): Promise<void> => {
    if (!project) {
      setPanelError("プロジェクトを開いてください。");
      return;
    }
    const q = query.trim();
    if (!q) return;
    setIsSearching(true);
    setPanelError(null);
    setPreview(null);
    try {
      const next = await window.stolow.searchProject(project.rootPath, {
        query: q,
        isRegex,
        caseSensitive,
        wholeWord
      });
      setResult(next);
      setStatusMessage(
        next.totalMatches > 0
          ? `検索: ${next.totalMatches.toLocaleString()} 件ヒット`
          : "検索: ヒットなし"
      );
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "検索に失敗しました。");
    } finally {
      setIsSearching(false);
    }
  }, [caseSensitive, isRegex, project, query, setPanelError, setStatusMessage, wholeWord]);

  const runReplacePreview = useCallback(async (): Promise<void> => {
    if (!project) {
      setPanelError("プロジェクトを開いてください。");
      return;
    }
    const q = query.trim();
    if (!q) return;
    setIsPreviewing(true);
    setPanelError(null);
    try {
      const next = await window.stolow.replacePreview({
        projectPath: project.rootPath,
        query: q,
        replace,
        isRegex,
        caseSensitive,
        wholeWord
      });
      setPreview(next);
      setStatusMessage(
        next.totalMatches > 0
          ? `置換プレビュー: ${next.totalMatches.toLocaleString()} 件`
          : "置換プレビュー: 対象なし"
      );
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "置換プレビューに失敗しました。");
    } finally {
      setIsPreviewing(false);
    }
  }, [caseSensitive, isRegex, project, query, replace, setPanelError, setStatusMessage, wholeWord]);

  const runReplaceApply = useCallback(async (): Promise<void> => {
    if (!project) return;
    if (!preview || preview.totalMatches === 0) return;
    setIsApplying(true);
    setPanelError(null);
    try {
      const applied = await window.stolow.replaceApply({
        projectPath: project.rootPath,
        query: preview.query,
        replace: preview.replace,
        isRegex,
        caseSensitive,
        wholeWord
      });
      setStatusMessage(
        `置換: ${applied.totalMatches.toLocaleString()} 件 / ${applied.updatedFiles.toLocaleString()} ファイル更新`
      );
      setPreview(null);
      await onRefreshAfterReplace();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : "置換に失敗しました。");
    } finally {
      setIsApplying(false);
    }
  }, [caseSensitive, isRegex, onRefreshAfterReplace, preview, project, query, setPanelError, setStatusMessage, wholeWord]);

  return (
    <>
      <div className="search-form">
        <label className="settings-input">
          <span>検索</span>
          <input
            ref={queryInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: 彼女 / /禁則.*/ / (?:彼|彼女)"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
          />
        </label>

        <fieldset className="control-block control-fieldset">
          <legend className="control-legend">オプション</legend>
          <label className="toggle-row">
            <input checked={isRegex} onChange={(e) => setIsRegex(e.target.checked)} type="checkbox" />
            <span>正規表現</span>
          </label>
          <label className="toggle-row">
            <input
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              type="checkbox"
            />
            <span>大/小文字を区別</span>
          </label>
          <label className="toggle-row">
            <input checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} type="checkbox" />
            <span>単語境界（whole word）</span>
          </label>
        </fieldset>

        <div className="search-actions">
          <button className="generate-button" disabled={!canRun} onClick={() => void runSearch()} type="button">
            {isSearching ? "検索中…" : "検索"}
          </button>
        </div>

        <details className="settings-box">
          <summary>置換</summary>
          <label className="settings-input">
            <span>置換後</span>
            <input value={replace} onChange={(e) => setReplace(e.target.value)} spellCheck={false} />
          </label>
          <div className="search-actions">
            <button
              className="chip"
              disabled={!project || !query.trim() || isPreviewing}
              onClick={() => void runReplacePreview()}
              type="button"
            >
              {isPreviewing ? "プレビュー中…" : "プレビュー"}
            </button>
            <button
              className="primary-action"
              disabled={!preview || preview.totalMatches === 0 || isApplying}
              onClick={() => void runReplaceApply()}
              type="button"
            >
              {isApplying ? "適用中…" : "置換を適用"}
            </button>
          </div>
          {preview ? (
            <div className="hint-box" role="status">
              {preview.totalMatches.toLocaleString()} 件 / {preview.files.length.toLocaleString()} ファイル
              {preview.truncated ? "（表示は一部）" : ""}
            </div>
          ) : null}
        </details>
      </div>

      {error ? (
        <div className="error-box" role="alert">
          <AlertCircle aria-hidden size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="search-results">
        {result ? (
          <>
            <div className="search-summary">
              <span>
                {result.totalMatches.toLocaleString()} 件 / {result.files.length.toLocaleString()} ファイル
                {result.truncated ? "（表示は一部）" : ""}
              </span>
            </div>
            {result.files.map((file) => (
              <details className="search-file" key={file.relativePath} open={file.matchCount <= 3}>
                <summary>
                  <span className="search-file-path">{file.relativePath}</span>
                  <span className="search-file-count">{file.matchCount.toLocaleString()} 件</span>
                </summary>
                <div className="search-hits">
                  {file.items.slice(0, 50).map((hit, idx) => (
                    <button
                      className="search-hit"
                      key={`${file.relativePath}:${hit.from}:${idx}`}
                      onClick={() => void onJump(file.relativePath, hit.from, hit.to)}
                      type="button"
                      title={`${hit.line}:${hit.column}`}
                    >
                      <span className="search-hit-loc">
                        {hit.line}:{hit.column}
                      </span>
                      <span className="search-hit-text">{hit.lineText.trim()}</span>
                    </button>
                  ))}
                  {file.items.length > 50 ? (
                    <div className="empty-list">このファイルの表示は 50 件までです。</div>
                  ) : null}
                </div>
              </details>
            ))}
          </>
        ) : (
          <div className="empty-suggestions">
            <Sparkles aria-hidden size={18} />
            <span>検索語を入力して「検索」を押してください。</span>
          </div>
        )}
      </div>
    </>
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
