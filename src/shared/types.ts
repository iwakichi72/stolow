export const SUGGESTION_MODES = [
  "natural",
  "surprising",
  "ominous",
  "emotional",
  "fast",
  "styleOnly"
] as const;

export type SuggestionMode = (typeof SUGGESTION_MODES)[number];

export const MODEL_PROFILES = ["default", "quick", "quality"] as const;

export type ModelProfile = (typeof MODEL_PROFILES)[number];

export type ProjectFileKind = "manuscript" | "context" | "other";

export interface StolowSettings {
  ollamaUrl: string;
  defaultModel: string;
  quickModel: string;
  qualityModel: string;
  defaultMode: SuggestionMode;
  suggestionCount: number;
  maxParagraphChars: number;
  requestTimeoutMs: number;
  /** プロジェクト全体の目標文字数（任意） */
  targetChars?: number;
}

export interface StolowAppSettings {
  /** プロジェクトを開いたときに manuscript/context などを自動生成する */
  autoCreateProjectStructure: boolean;
  /** 最後に開いていたプロジェクト（フォルダ） */
  lastOpenedProjectPath?: string;
  /** 最近開いたプロジェクト（新しい順、最大 8 件） */
  recentProjectPaths?: string[];
}

export interface ProjectFile {
  relativePath: string;
  name: string;
  kind: ProjectFileKind;
}

export interface ProjectSnapshot {
  rootPath: string;
  name: string;
  settings: StolowSettings;
  files: ProjectFile[];
}

export interface EditorSelectionSnapshot {
  from: number;
  to: number;
  head: number;
  selectedText: string;
}

export interface GenerateSuggestionsPayload {
  projectPath: string;
  documentText: string;
  cursorPosition: number;
  selection: EditorSelectionSnapshot;
  includeSummary?: boolean;
  includeNotes?: boolean;
  /** context/*.md のうち AI に渡す相対パス一覧（未指定なら従来の summary/notes のみ）。 */
  contextFiles?: string[];
  /** カーソル位置の見出し単位で章コンテキストを追加する（# / ## など） */
  chapterHeadingLevel?: 0 | 1 | 2 | 3;
  mode: SuggestionMode;
  modelProfile: ModelProfile;
  settings: StolowSettings;
}

export interface SuggestionCandidate {
  id: string;
  title: string;
  text: string;
}

export interface GenerateSuggestionsResult {
  kind: "continuation" | "rewrite";
  mode: SuggestionMode;
  modelProfile: ModelProfile;
  usedModel: string;
  suggestions: SuggestionCandidate[];
}

export interface SaveFileResult {
  savedAt: string;
}

export interface ProjectSearchOptions {
  query: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

export interface ProjectSearchMatch {
  relativePath: string;
  matchCount: number;
  items: Array<{
    from: number;
    to: number;
    line: number;
    column: number;
    lineText: string;
  }>;
}

export interface ProjectSearchResult {
  query: string;
  options: Required<Pick<ProjectSearchOptions, "isRegex" | "caseSensitive" | "wholeWord">>;
  totalMatches: number;
  files: ProjectSearchMatch[];
  truncated: boolean;
}

export interface ProjectReplacePreviewPayload extends ProjectSearchOptions {
  projectPath: string;
  replace: string;
}

export interface ProjectReplacePreviewResult {
  query: string;
  replace: string;
  totalMatches: number;
  files: Array<{ relativePath: string; matchCount: number }>;
  truncated: boolean;
}

export interface ProjectReplaceApplyPayload extends ProjectReplacePreviewPayload {}

export interface ProjectReplaceApplyResult {
  totalMatches: number;
  updatedFiles: number;
}

export interface ProjectStats {
  totalChars: number;
  manuscriptChars: number;
  contextChars: number;
  fileCount: number;
  manuscriptFileCount: number;
}

export type FileContextMenuAction = "duplicate" | "delete" | "rename" | null;

export interface FileContextMenuPayload {
  relativePath: string;
  name: string;
  kind: ProjectFileKind;
}

export type MenuAction =
  | "openProject"
  | "newManuscript"
  | "newContext"
  | "save"
  | "search"
  | "toggleSidebar"
  | "toggleRightPanel"
  | "rightTabAi"
  | "rightTabOutline"
  | "rightTabContext"
  | "rightTabStats"
  | "generate";

export interface StolowApi {
  openProject: () => Promise<ProjectSnapshot | null>;
  openLastProject: () => Promise<ProjectSnapshot | null>;
  openProjectAtPath: (projectPath: string) => Promise<ProjectSnapshot | null>;
  revealProjectInFolder: (projectPath: string) => Promise<void>;
  refreshProject: (projectPath: string) => Promise<ProjectSnapshot>;
  getCurrentProjectSnapshot: () => Promise<ProjectSnapshot | null>;
  openSettingsWindow: () => Promise<void>;
  readFile: (projectPath: string, relativePath: string) => Promise<string>;
  saveFile: (projectPath: string, relativePath: string, contents: string) => Promise<SaveFileResult>;
  createMarkdownFile: (projectPath: string, relativePath: string) => Promise<ProjectFile>;
  deleteMarkdownFile: (projectPath: string, relativePath: string) => Promise<void>;
  duplicateMarkdownFile: (projectPath: string, relativePath: string) => Promise<ProjectFile>;
  renameMarkdownFile: (
    projectPath: string,
    relativePath: string,
    nextRelativePath: string
  ) => Promise<ProjectFile>;
  showFileContextMenu: (
    projectPath: string,
    payload: FileContextMenuPayload
  ) => Promise<FileContextMenuAction>;
  getAppSettings: () => Promise<StolowAppSettings>;
  updateAppSettings: (settings: StolowAppSettings) => Promise<StolowAppSettings>;
  updateSettings: (projectPath: string, settings: StolowSettings) => Promise<StolowSettings>;
  generateSuggestions: (payload: GenerateSuggestionsPayload) => Promise<GenerateSuggestionsResult>;
  cancelGeneration: () => void;
  searchProject: (projectPath: string, options: ProjectSearchOptions) => Promise<ProjectSearchResult>;
  replacePreview: (payload: ProjectReplacePreviewPayload) => Promise<ProjectReplacePreviewResult>;
  replaceApply: (payload: ProjectReplaceApplyPayload) => Promise<ProjectReplaceApplyResult>;
  getProjectStats: (projectPath: string) => Promise<ProjectStats>;
  notifyDirty: (isDirty: boolean) => void;
  onMenuAction: (handler: (action: MenuAction) => void) => () => void;
}
