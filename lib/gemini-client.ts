/**
 * Direct Google AI Studio Gemini API client.
 * Calls the Gemini API directly without external packages, using fetch.
 */

export interface ConvertPdfWithGeminiOptions {
  apiKey: string;
  pdfBase64: string;
  fileName: string;
  systemPrompt: string;
  signal?: AbortSignal;
}

export interface ConvertPdfWithGeminiResult {
  markdown: string;
  modelUsed: string;
}

/**
 * Converts a PDF to Markdown using Google AI Studio API directly.
 */
export async function convertPdfWithGemini(
  opts: ConvertPdfWithGeminiOptions
): Promise<ConvertPdfWithGeminiResult> {
  const { apiKey, pdfBase64, systemPrompt, signal } = opts;
  const model = "gemini-2.5-flash";

  // Use the standard Google AI Studio endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              text: `Convert this PDF document to clean, elegant, and standard Markdown format according to these parsing instructions:\n\n${systemPrompt}`,
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message ?? response.statusText;
    throw new Error(`Error de Google AI Studio [HTTP ${response.status}]: ${message}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const markdown = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!markdown) {
    throw new Error("El modelo Gemini devolvió una respuesta vacía. Verifica el archivo PDF.");
  }

  return {
    markdown,
    modelUsed: `google/${model} (AI Studio)`,
  };
}
