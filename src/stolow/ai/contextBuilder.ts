import type { GenerationContext, GenerateSuggestionsInput } from "./types.js";
import { extractMarkdownHeadings } from "./headings.js";

const BEFORE_LIMIT = 5000;
const AFTER_LIMIT = 500;
const SUMMARY_LIMIT = 1500;
const NOTES_LIMIT = 800;
const SELECTION_LIMIT = 4000;

export function buildGenerationContext(input: GenerateSuggestionsInput): GenerationContext {
  const selectionFrom = Math.max(0, Math.min(input.selection.from, input.documentText.length));
  const selectionTo = Math.max(selectionFrom, Math.min(input.selection.to, input.documentText.length));
  const hasSelection = selectionTo > selectionFrom;
  const cursor = Math.max(0, Math.min(input.cursorPosition, input.documentText.length));
  const beforeEnd = hasSelection ? selectionFrom : cursor;
  const afterStart = hasSelection ? selectionTo : cursor;

  return {
    kind: hasSelection ? "rewrite" : "continuation",
    beforeText: takeLast(input.documentText.slice(0, beforeEnd), BEFORE_LIMIT),
    afterText: takeFirst(input.documentText.slice(afterStart), AFTER_LIMIT),
    selectedText: hasSelection ? takeFirst(input.documentText.slice(selectionFrom, selectionTo), SELECTION_LIMIT) : "",
    summaryText: takeFirst(input.summaryText ?? "", SUMMARY_LIMIT),
    notesText: takeFirst(input.notesText ?? "", NOTES_LIMIT),
    headings: extractMarkdownHeadings(input.documentText)
  };
}

function takeFirst(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit);
}

function takeLast(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(text.length - limit);
}
