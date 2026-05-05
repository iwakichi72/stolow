import type {
  GenerateSuggestionsPayload,
  ModelProfile,
  StolowSettings,
  SuggestionCandidate,
  SuggestionMode
} from "../../shared/types.js";

export type GenerationKind = "continuation" | "rewrite";

export type AiErrorCode =
  | "OLLAMA_UNAVAILABLE"
  | "MODEL_NOT_FOUND"
  | "PROJECT_NOT_OPEN"
  | "FILE_SAVE_FAILED"
  | "LLM_JSON_INVALID"
  | "EMPTY_SUGGESTIONS"
  | "TIMEOUT"
  | "HTTP_ERROR";

export interface GenerationContext {
  kind: GenerationKind;
  beforeText: string;
  afterText: string;
  selectedText: string;
  summaryText: string;
  notesText: string;
  chapterText: string;
  headings: string[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PromptBuildInput {
  context: GenerationContext;
  mode: SuggestionMode;
  settings: StolowSettings;
}

export interface OllamaChatRequest {
  ollamaUrl: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
}

export interface ParsedSuggestions {
  suggestions: SuggestionCandidate[];
}

export interface GenerateSuggestionsInput extends GenerateSuggestionsPayload {
  summaryText?: string;
  notesText?: string;
  chapterText?: string;
}

export { ModelProfile, StolowSettings, SuggestionCandidate, SuggestionMode };
