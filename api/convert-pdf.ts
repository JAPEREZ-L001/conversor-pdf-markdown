import type { VercelRequest, VercelResponse } from "@vercel/node";

// In-memory rate limiter (per serverless instance)
const limiterStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 5;
  const entry = limiterStore.get(ip);
  if (!entry || now > entry.resetAt) {
    limiterStore.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

function buildSystemPrompt(instructions: string): string {
  return `You are an expert document parser. Your goal is to convert the uploaded PDF document into structured, clean Markdown (.md) format.
Follow these rigid output formatting guidelines:
1. Retain document structures: headings (H1, H2, H3), paragraphs, bullet/numbered lists, quotes, tables, bold/italic formatting, and code blocks.
2. Structure tables precisely using standard Markdown table syntax.
3. Keep the output strictly in Markdown format. Do NOT wrap the entire output in a triple-backtick markdown block (like \`\`\`markdown ... \`\`\`) unless the document itself exists exclusively to contain custom source code formatting.
4. If there are headers, footers, page numbers, or repetitive navigation artifacts, omit them gracefully unless they hold actual content value.
5. If mathematical equations or formulas are present, format them clearly in standard LaTeX format (using $$ for block math and $ for inline math).
${instructions ? `6. Additional user request direction: "${instructions}"` : ""}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido." });
  }

  // Rate limiting by IP
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    "unknown";

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: "Demasiadas solicitudes. Por favor, espera un momento antes de convertir otro archivo.",
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY no está configurada en el servidor." });
  }

  try {
    const { pdfBase64, fileName, options } = req.body as {
      pdfBase64: string;
      fileName?: string;
      options?: { instructions?: string };
    };

    if (!pdfBase64) {
      return res.status(400).json({ error: "Falta el archivo PDF en formato base64." });
    }

    // Validate PDF size (max 10 MB decoded)
    const estimatedBytes = Math.ceil((pdfBase64.length * 3) / 4);
    const maxBytes = 10 * 1024 * 1024;
    if (estimatedBytes > maxBytes) {
      return res.status(413).json({
        error: `El archivo PDF supera el límite de 10 MB (tamaño estimado: ${(estimatedBytes / 1024 / 1024).toFixed(1)} MB). Por favor, usa un archivo más pequeño.`,
      });
    }

    const systemPrompt = buildSystemPrompt(options?.instructions || "");

    // 60-second timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    let markdownText = "";
    try {
      // OpenRouter API — OpenAI-compatible endpoint with PDF support
      // Model: google/gemini-2.0-flash-exp:free  (free tier, supports PDF inline)
      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://conversor-de-pdf-a-markdown.vercel.app",
          "X-Title": "Conversor PDF a Markdown",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-exp:free",
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
                  // OpenRouter supports PDF as a file part following the OpenAI file format
                  type: "file",
                  file: {
                    filename: fileName || "document.pdf",
                    file_data: `data:application/pdf;base64,${pdfBase64}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!orRes.ok) {
        const errBody = await orRes.json().catch(() => ({}));
        const errMsg = (errBody as any)?.error?.message || orRes.statusText;
        throw new Error(`OpenRouter API error ${orRes.status}: ${errMsg}`);
      }

      const data = await orRes.json() as any;
      markdownText = data?.choices?.[0]?.message?.content || "";

      if (!markdownText) {
        throw new Error("El modelo no devolvió contenido. Intenta con un PDF diferente.");
      }
    } finally {
      clearTimeout(timeoutId);
    }

    return res.status(200).json({
      success: true,
      markdown: markdownText,
      fileName: fileName || "document.pdf",
    });
  } catch (error: any) {
    console.error("Serverless conversion error:", error);

    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "La conversión tardó demasiado (más de 60 segundos). Intenta con un PDF más pequeño.",
      });
    }

    return res.status(500).json({
      error: "Error durante la conversión del PDF a Markdown.",
      details: error?.message || "Internal Server Error",
    });
  }
}
