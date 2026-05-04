import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  Loader2,
  PanelRight,
  RefreshCcw,
  Save,
  Sparkles
} from "lucide-react";
import type {
  EditorSelectionSnapshot,
  GenerateSuggestionsResult,
  ModelProfile,
  ProjectFile,
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
        setStatusMessage("選択範囲を置換しました。");
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
      setStatusMessage("候補を挿入しました。");
    },
    [documentText, generationTarget, selection, suggestionResult?.kind]
  );

  useEffect(() => {
    if (!project) return;
    setSettingsDraft(project.settings);
    setMode(project.settings.defaultMode);
  }, [project]);

  return (
    <main className="app-shell">
      <ProjectSidebar
        activeFile={activeFile}
        groupedFiles={groupedFiles}
        isDirty={isDirty}
        isOpening={isOpening}
        isSaving={isSaving}
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
      />

      <section className="editor-pane" aria-label="Markdown editor">
        <div className="editor-topbar">
          <div className="document-title">
            <span>{activeFile?.name ?? "No file open"}</span>
            {isDirty ? <strong>Unsaved</strong> : null}
          </div>
          <div className="document-meta">
            {isLoadingFile ? "Loading..." : `${documentText.length.toLocaleString()} chars`}
          </div>
        </div>
        <MarkdownEditor
          value={documentText}
          onChange={setDocumentText}
          onSelectionChange={setSelection}
          editable={activeFile !== null}
        />
        <div className="statusbar">
          <span>{statusMessage}</span>
          <span>{selectedChars > 0 ? `${selectedChars.toLocaleString()} chars selected` : "No selection"}</span>
        </div>
      </section>

      <SuggestionPanel
        activeFile={activeFile}
        error={panelError}
        isGenerating={isGenerating}
        mode={mode}
        modelProfile={modelProfile}
        onApply={applySuggestion}
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
        selectedChars={selectedChars}
        settings={settingsDraft}
      />
    </main>
  );
}

interface ProjectSidebarProps {
  activeFile: ProjectFile | null;
  groupedFiles: Record<ProjectFile["kind"], ProjectFile[]>;
  isDirty: boolean;
  isOpening: boolean;
  isSaving: boolean;
  onFileSelect: (file: ProjectFile) => void;
  onOpenProject: () => void;
  onRefresh: () => void;
  onSave: () => void;
  project: ProjectSnapshot | null;
}

function ProjectSidebar({
  activeFile,
  groupedFiles,
  isDirty,
  isOpening,
  isSaving,
  onFileSelect,
  onOpenProject,
  onRefresh,
  onSave,
  project
}: ProjectSidebarProps): JSX.Element {
  return (
    <aside className="sidebar" aria-label="Project files">
      <div className="app-mark">
        <div className="mark-glyph">S</div>
        <div>
          <h1>Stolow</h1>
          <p>{project?.name ?? "No project"}</p>
        </div>
      </div>

      <div className="toolbar">
        <button className="primary-action" onClick={onOpenProject} disabled={isOpening} type="button">
          {isOpening ? <Loader2 className="spin" size={16} /> : <FolderOpen size={16} />}
          Open
        </button>
        <button className="icon-button" onClick={onSave} disabled={!activeFile || isSaving} title="Save" type="button">
          {isSaving ? <Loader2 className="spin" size={16} /> : isDirty ? <Save size={16} /> : <Check size={16} />}
        </button>
        <button
          className="icon-button"
          onClick={onRefresh}
          disabled={!project}
          title="Refresh files"
          type="button"
        >
          <RefreshCcw size={16} />
        </button>
      </div>

      <FileGroup
        activePath={activeFile?.relativePath}
        files={groupedFiles.manuscript}
        label="Manuscript"
        onFileSelect={onFileSelect}
      />
      <FileGroup
        activePath={activeFile?.relativePath}
        files={groupedFiles.context}
        label="Context"
        onFileSelect={onFileSelect}
      />
      {groupedFiles.other.length > 0 ? (
        <FileGroup
          activePath={activeFile?.relativePath}
          files={groupedFiles.other}
          label="Other"
          onFileSelect={onFileSelect}
        />
      ) : null}
    </aside>
  );
}

interface FileGroupProps {
  activePath?: string;
  files: ProjectFile[];
  label: string;
  onFileSelect: (file: ProjectFile) => void;
}

function FileGroup({ activePath, files, label, onFileSelect }: FileGroupProps): JSX.Element {
  return (
    <div className="file-group">
      <div className="group-label">
        <ChevronRight size={14} />
        <span>{label}</span>
      </div>
      <div className="file-list">
        {files.length === 0 ? <div className="empty-list">No Markdown files</div> : null}
        {files.map((file) => (
          <button
            className={file.relativePath === activePath ? "file-row active" : "file-row"}
            key={file.relativePath}
            onClick={() => onFileSelect(file)}
            type="button"
          >
            <FileText size={15} />
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
  isGenerating: boolean;
  mode: SuggestionMode;
  modelProfile: ModelProfile;
  onApply: (candidate: SuggestionCandidate) => void;
  onGenerate: () => void;
  onModeChange: (mode: SuggestionMode) => void;
  onModelProfileChange: (profile: ModelProfile) => void;
  onSettingsChange: <K extends keyof StolowSettings>(field: K, value: StolowSettings[K]) => void;
  result: GenerateSuggestionsResult | null;
  selectedChars: number;
  settings: StolowSettings | null;
}

function SuggestionPanel({
  activeFile,
  error,
  isGenerating,
  mode,
  modelProfile,
  onApply,
  onGenerate,
  onModeChange,
  onModelProfileChange,
  onSettingsChange,
  result,
  selectedChars,
  settings
}: SuggestionPanelProps): JSX.Element {
  return (
    <aside className="suggestion-pane" aria-label="AI suggestions">
      <div className="panel-heading">
        <div>
          <h2>AI Suggest</h2>
          <p>{selectedChars > 0 ? "Selection rewrite" : "Next paragraph"}</p>
        </div>
        <PanelRight size={18} />
      </div>

      <div className="control-block">
        <label>Mode</label>
        <div className="mode-grid">
          {SUGGESTION_MODES.map((item) => (
            <button
              className={item === mode ? "chip active" : "chip"}
              key={item}
              onClick={() => onModeChange(item)}
              title={MODE_HINTS[item]}
              type="button"
            >
              {MODE_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="control-block">
        <label>Model profile</label>
        <div className="segmented">
          {MODEL_PROFILES.map((profile) => (
            <button
              className={profile === modelProfile ? "active" : ""}
              key={profile}
              onClick={() => onModelProfileChange(profile)}
              type="button"
            >
              {PROFILE_LABELS[profile]}
            </button>
          ))}
        </div>
      </div>

      {settings ? (
        <details className="settings-box">
          <summary>Connection and models</summary>
          <SettingsInput
            label="Ollama URL"
            value={settings.ollamaUrl}
            onChange={(value) => onSettingsChange("ollamaUrl", value)}
          />
          <SettingsInput
            label="Default"
            value={settings.defaultModel}
            onChange={(value) => onSettingsChange("defaultModel", value)}
          />
          <SettingsInput
            label="Quick"
            value={settings.quickModel}
            onChange={(value) => onSettingsChange("quickModel", value)}
          />
          <SettingsInput
            label="Quality"
            value={settings.qualityModel}
            onChange={(value) => onSettingsChange("qualityModel", value)}
          />
        </details>
      ) : null}

      <button className="generate-button" disabled={!activeFile || isGenerating} onClick={onGenerate} type="button">
        {isGenerating ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
        {isGenerating ? "Generating..." : selectedChars > 0 ? "Rewrite selection" : "Generate 3 ideas"}
      </button>

      {error ? (
        <div className="error-box" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="suggestion-list">
        {result?.suggestions.map((candidate) => (
          <article className="suggestion-card" key={candidate.id}>
            <div className="suggestion-title">
              <span>{candidate.title}</span>
              <button onClick={() => onApply(candidate)} type="button">
                Apply
              </button>
            </div>
            <p>{candidate.text}</p>
          </article>
        ))}
        {!result && !isGenerating ? (
          <div className="empty-suggestions">
            <Sparkles size={18} />
            <span>候補はここに表示されます。</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

interface SettingsInputProps {
  label: string;
  onChange: (value: string) => void;
  value: string;
}

function SettingsInput({ label, onChange, value }: SettingsInputProps): JSX.Element {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <label className="settings-input">
      <span>{label}</span>
      <input
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
