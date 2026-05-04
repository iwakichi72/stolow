import type { ParsedSuggestions, SuggestionCandidate } from "./types.js";
import { StolowAiError } from "./stolowAiError.js";

interface RawSuggestionObject {
  title?: unknown;
  text?: unknown;
  content?: unknown;
}

export function parseSuggestions(raw: string, maxParagraphChars: number): ParsedSuggestions {
  const jsonText = extractJsonPayload(raw);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new StolowAiError("LLM_JSON_INVALID", "LLM response was not valid JSON.", { raw, error });
  }

  const rawSuggestions = extractRawSuggestions(parsed);
  const suggestions: SuggestionCandidate[] = [];

  for (const item of rawSuggestions) {
    const text = normalizeParagraph(extractText(item), maxParagraphChars);
    if (!text) continue;

    const title = extractTitle(item) || `案${suggestions.length + 1}`;
    if (suggestions.some((suggestion) => suggestion.text === text)) continue;

    suggestions.push({
      id: `suggestion-${suggestions.length + 1}`,
      title,
      text
    });
  }

  if (suggestions.length === 0) {
    throw new StolowAiError("EMPTY_SUGGESTIONS", "LLM response did not contain usable suggestions.", raw);
  }

  return { suggestions };
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const whole = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (whole) return whole[1].trim();

  const inline = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (inline) return inline[1].trim();

  return trimmed;
}

/**
 * 前置き・後書き・非JSONが混ざっても、最初の JSON オブジェクトを拾ってパースする。
 */
function extractJsonPayload(raw: string): string {
  const unfenced = stripCodeFence(raw).trim();
  if (unfenced.length === 0) return "";

  try {
    JSON.parse(unfenced);
    return unfenced;
  } catch {
    // continue
  }

  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = unfenced.slice(start, end + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      // continue
    }
  }

  return unfenced;
}

function extractRawSuggestions(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;

  if (isRecord(parsed)) {
    const suggestions = parsed.suggestions ?? parsed.candidates ?? parsed.results;
    if (Array.isArray(suggestions)) return suggestions;
  }

  throw new StolowAiError("LLM_JSON_INVALID", "LLM JSON did not contain a suggestions array.", parsed);
}

function extractText(item: unknown): string {
  if (typeof item === "string") return item;
  if (!isRecord(item)) return "";

  const raw = (item as RawSuggestionObject).text ?? (item as RawSuggestionObject).content;
  return typeof raw === "string" ? raw : "";
}

function extractTitle(item: unknown): string {
  if (!isRecord(item)) return "";
  const raw = (item as RawSuggestionObject).title;
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeParagraph(text: string, maxParagraphChars: number): string {
  const withoutFence = stripCodeFence(text);
  const firstParagraph = withoutFence
    .split(/\n\s*\n/)
    .find((paragraph) => paragraph.trim().length > 0);

  if (!firstParagraph) return "";

  const normalized = firstParagraph.replace(/[ \t]*\r?\n[ \t]*/g, "").trim();
  if (normalized.length <= maxParagraphChars) return normalized;

  return trimAtSentenceBoundary(normalized, maxParagraphChars);
}

function trimAtSentenceBoundary(text: string, maxLength: number): string {
  const sliced = text.slice(0, maxLength);
  const boundary = Math.max(
    sliced.lastIndexOf("。"),
    sliced.lastIndexOf("！"),
    sliced.lastIndexOf("？"),
    sliced.lastIndexOf("."),
    sliced.lastIndexOf("!"),
    sliced.lastIndexOf("?")
  );

  if (boundary > Math.floor(maxLength * 0.55)) {
    return sliced.slice(0, boundary + 1).trim();
  }

  return sliced.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
