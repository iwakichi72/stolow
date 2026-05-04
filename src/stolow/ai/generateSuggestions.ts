import type { GenerateSuggestionsInput } from "./types.js";
import type { GenerateSuggestionsResult } from "../../shared/types.js";
import { buildGenerationContext } from "./contextBuilder.js";
import { buildPromptMessages } from "./promptBuilder.js";
import { modelForProfile, normalizeSettings } from "./config.js";
import { chatWithOllama } from "./ollamaClient.js";
import { parseSuggestions } from "./responseParser.js";

export async function generateSuggestions(input: GenerateSuggestionsInput): Promise<GenerateSuggestionsResult> {
  const settings = normalizeSettings(input.settings);
  const context = buildGenerationContext(input);
  const usedModel = modelForProfile(settings, input.modelProfile);
  const messages = buildPromptMessages({
    context,
    mode: input.mode,
    settings
  });

  const raw = await chatWithOllama({
    ollamaUrl: settings.ollamaUrl,
    model: usedModel,
    messages,
    timeoutMs: settings.requestTimeoutMs
  });

  const parsed = parseSuggestions(raw, settings.maxParagraphChars);

  return {
    kind: context.kind,
    mode: input.mode,
    modelProfile: input.modelProfile,
    usedModel,
    suggestions: parsed.suggestions.slice(0, settings.suggestionCount)
  };
}
