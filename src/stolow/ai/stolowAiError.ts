import type { AiErrorCode } from "./types.js";

export class StolowAiError extends Error {
  readonly code: AiErrorCode;
  readonly details: unknown;

  constructor(code: AiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "StolowAiError";
    this.code = code;
    this.details = details;
  }
}
