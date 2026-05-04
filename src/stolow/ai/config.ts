import type { ModelProfile, StolowSettings } from "../../shared/types.js";

export const DEFAULT_STOLOW_SETTINGS: StolowSettings = {
  ollamaUrl: "http://localhost:11434",
  defaultModel: "qwen3.5:9b",
  quickModel: "gemma4:e4b",
  qualityModel: "gemma4:26b",
  defaultMode: "natural",
  suggestionCount: 3,
  maxParagraphChars: 600,
  requestTimeoutMs: 180000
};

export function normalizeSettings(settings?: Partial<StolowSettings> | null): StolowSettings {
  const merged = {
    ...DEFAULT_STOLOW_SETTINGS,
    ...(settings ?? {})
  };

  return {
    ...merged,
    suggestionCount: clampInteger(merged.suggestionCount, 1, 5, DEFAULT_STOLOW_SETTINGS.suggestionCount),
    maxParagraphChars: clampInteger(
      merged.maxParagraphChars,
      120,
      1200,
      DEFAULT_STOLOW_SETTINGS.maxParagraphChars
    ),
    requestTimeoutMs: clampInteger(
      merged.requestTimeoutMs,
      10000,
      600000,
      DEFAULT_STOLOW_SETTINGS.requestTimeoutMs
    )
  };
}

export function modelForProfile(settings: StolowSettings, profile: ModelProfile): string {
  if (profile === "quick") return settings.quickModel;
  if (profile === "quality") return settings.qualityModel;
  return settings.defaultModel;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
