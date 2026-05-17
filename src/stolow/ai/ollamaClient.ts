import type { OllamaChatRequest } from "./types.js";
import { StolowAiError } from "./stolowAiError.js";

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  error?: string;
}

export async function chatWithOllama(request: OllamaChatRequest): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  const externalSignal = request.signal;
  const onExternalAbort = (): void => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const response = await fetch(new URL("/api/chat", request.ollamaUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
        format: "json"
      }),
      signal: controller.signal
    });

    const responseText = await response.text();
    let payload: OllamaChatResponse | null = null;

    try {
      payload = responseText.length > 0 ? (JSON.parse(responseText) as OllamaChatResponse) : null;
    } catch {
      throw new StolowAiError("HTTP_ERROR", "Ollama returned a non-JSON HTTP response.", responseText);
    }

    if (!response.ok) {
      const detail = payload?.error ?? responseText;
      if (response.status === 404 || /not found|model/i.test(detail)) {
        throw new StolowAiError("MODEL_NOT_FOUND", `Model not found: ${request.model}`, detail);
      }
      throw new StolowAiError("HTTP_ERROR", `Ollama HTTP error: ${response.status}`, detail);
    }

    const content = payload?.message?.content;
    if (!content) {
      throw new StolowAiError("EMPTY_SUGGESTIONS", "Ollama returned an empty message.");
    }

    return content;
  } catch (error) {
    if (error instanceof StolowAiError) throw error;

    if (error instanceof Error && error.name === "AbortError") {
      if (externalSignal?.aborted) {
        throw new StolowAiError("CANCELLED", "Generation was cancelled.", error);
      }
      throw new StolowAiError("TIMEOUT", "Ollama request timed out.", error);
    }

    throw new StolowAiError("OLLAMA_UNAVAILABLE", "Could not connect to Ollama.", error);
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}
