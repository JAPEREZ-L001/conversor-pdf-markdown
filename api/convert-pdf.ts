import type { VercelRequest, VercelResponse } from "@vercel/node";
import { convertPdfWithFallback, FALLBACK_MODELS } from "../lib/openrouter-client.js";
import { convertPdfWithGemini } from "../lib/gemini-client.js";

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
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? "unknown";

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: "Demasiadas solicitudes. Por favor, espera un momento antes de convertir otro archivo.",
    });
  }

  try {
    const { pdfBase64, fileName, options, provider = "openrouter" } = req.body as {
      pdfBase64: string;
      fileName?: string;
      options?: { instructions?: string };
      provider?: "openrouter" | "gemini";
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

    const systemPrompt = buildSystemPrompt(options?.instructions ?? "");

    // 60-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    let result;
    try {
      if (provider === "gemini") {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return res.status(400).json({
            error: "La API Key de Google AI Studio (GEMINI_API_KEY) no está configurada en el servidor.",
          });
        }
        const geminiRes = await convertPdfWithGemini({
          apiKey,
          pdfBase64,
          fileName: fileName ?? "document.pdf",
          systemPrompt,
          signal: controller.signal,
        });
        result = {
          markdown: geminiRes.markdown,
          modelUsed: geminiRes.modelUsed,
          attemptsCount: 1,
          maxAttempts: 1,
        };
      } else {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return res.status(400).json({
            error: "La API Key de OpenRouter (OPENROUTER_API_KEY) no está configurada en el servidor.",
          });
        }
        const openrouterRes = await convertPdfWithFallback({
          apiKey,
          pdfBase64,
          fileName: fileName ?? "document.pdf",
          systemPrompt,
          referer: "https://conversor-de-pdf-a-markdown.vercel.app",
          signal: controller.signal,
        });
        result = {
          markdown: openrouterRes.markdown,
          modelUsed: openrouterRes.modelUsed,
          attemptsCount: openrouterRes.attemptsCount,
          maxAttempts: FALLBACK_MODELS.length,
        };
      }
    } finally {
      clearTimeout(timeoutId);
    }

    console.log(
      `✅ Conversion OK — provider: ${provider}, model: ${result.modelUsed}, attempts: ${result.attemptsCount}/${result.maxAttempts}`
    );

    return res.status(200).json({
      success: true,
      markdown: result.markdown,
      fileName: fileName ?? "document.pdf",
      modelUsed: result.modelUsed,
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
      details: error?.message ?? "Internal Server Error",
    });
  }
}
