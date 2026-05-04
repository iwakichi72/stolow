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

export interface StolowApi {
  openProject: () => Promise<ProjectSnapshot | null>;
  refreshProject: (projectPath: string) => Promise<ProjectSnapshot>;
  readFile: (projectPath: string, relativePath: string) => Promise<string>;
  saveFile: (projectPath: string, relativePath: string, contents: string) => Promise<SaveFileResult>;
  createMarkdownFile: (projectPath: string, relativePath: string) => Promise<ProjectFile>;
  updateSettings: (projectPath: string, settings: StolowSettings) => Promise<StolowSettings>;
  generateSuggestions: (payload: GenerateSuggestionsPayload) => Promise<GenerateSuggestionsResult>;
}
