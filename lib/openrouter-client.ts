/**
 * OpenRouter client with automatic model fallback.
 * Tries each model in the chain sequentially — all free, all with vision.
 *
 * Fallback chain:
 *  1. google/gemini-2.0-flash-exp:free  → Best: native PDF, 1M token context
 *  2. google/gemma-4-31b-it:free        → Strong: image+text+video, 262K ctx
 *  3. google/gemma-4-26b-a4b-it:free    → Efficient MoE: image+text+video, 262K ctx
 */

export const FALLBACK_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
] as const;

export type FallbackModel = (typeof FALLBACK_MODELS)[number];

/** HTTP status codes from OpenRouter that mean "this model can't serve you right now" */
const RETRYABLE_CODES = new Set([429, 500, 502, 503, 529]);

export interface ConvertPdfOptions {
  apiKey: string;
  pdfBase64: string;
  fileName: string;
  systemPrompt: string;
  referer?: string;
  signal?: AbortSignal;
}

export interface ConvertPdfResult {
  markdown: string;
  modelUsed: FallbackModel;
  attemptsCount: number;
}

interface OpenRouterError {
  error?: { message?: string; code?: number };
}

/**
 * Calls the OpenRouter API trying each model in FALLBACK_MODELS until one succeeds.
 * Retries on 429 / 5xx errors (model overloaded / unavailable).
 * Throws on non-retryable errors or if all models are exhausted.
 */
export async function convertPdfWithFallback(
  opts: ConvertPdfOptions
): Promise<ConvertPdfResult> {
  const { apiKey, pdfBase64, fileName, systemPrompt, referer, signal } = opts;

  const errors: string[] = [];

  for (let i = 0; i < FALLBACK_MODELS.length; i++) {
    const model = FALLBACK_MODELS[i];

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": referer ?? "https://conversor-de-pdf-a-markdown.vercel.app",
            "X-Title": "Conversor PDF a Markdown",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Convert this PDF document to clean, elegant, and standard Markdown format according to your parsing instructions.",
                  },
                  {
                    // OpenRouter file part — works for Gemini (native PDF) and
                    // vision-only models (OpenRouter converts PDF → images automatically)
                    type: "file",
                    file: {
                      filename: fileName,
                      file_data: `data:application/pdf;base64,${pdfBase64}`,
                    },
                  },
                ],
              },
            ],
          }),
        }
      );

      // If model is unavailable / rate-limited, try next
      if (!response.ok) {
        const body: OpenRouterError = await response.json().catch(() => ({}));
        const detail = body?.error?.message ?? response.statusText;
        const reason = `[${model}] HTTP ${response.status}: ${detail}`;
        errors.push(reason);
        console.warn(`OpenRouter fallback — ${reason}`);

        if (RETRYABLE_CODES.has(response.status) && i < FALLBACK_MODELS.length - 1) {
          continue; // try next model
        }

        // Non-retryable error or last model — bubble up
        throw new Error(reason);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const markdown = data?.choices?.[0]?.message?.content ?? "";

      if (!markdown) {
        const reason = `[${model}] Model returned empty response`;
        errors.push(reason);
        console.warn(`OpenRouter fallback — ${reason}`);

        if (i < FALLBACK_MODELS.length - 1) {
          continue; // try next model
        }

        throw new Error("Todos los modelos devolvieron una respuesta vacía. Intenta con un PDF diferente.");
      }

      return {
        markdown,
        modelUsed: model,
        attemptsCount: i + 1,
      };
    } catch (err: any) {
      // AbortError (timeout) — don't retry, propagate immediately
      if (err?.name === "AbortError") throw err;

      // If we already built the error message above and threw, rethrow as-is
      const alreadyLogged = errors.some((e) => err?.message?.includes(e.split(":")[0]));
      if (!alreadyLogged) {
        const reason = `[${model}] ${err?.message ?? "Unknown error"}`;
        errors.push(reason);
        console.warn(`OpenRouter fallback — ${reason}`);
      }

      if (i < FALLBACK_MODELS.length - 1) {
        continue; // try next model
      }

      // All models exhausted
      throw new Error(
        `Todos los modelos fallaron:\n${errors.join("\n")}`
      );
    }
  }

  // TypeScript guard — unreachable in practice
  throw new Error("No models available");
}
