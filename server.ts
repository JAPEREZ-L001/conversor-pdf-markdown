import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { convertPdfWithFallback, FALLBACK_MODELS } from "./lib/openrouter-client";
import { convertPdfWithGemini } from "./lib/gemini-client";
import { convertPdfLocally } from "./lib/local-ocr-client";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Increase request size limit to support uploading larger PDFs in Base64
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Rate limiter: max 5 conversion requests per IP per minute
const convertLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiadas solicitudes. Por favor, espera un momento antes de convertir otro archivo.",
  },
});

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

// PDF to Markdown conversion endpoint — OpenRouter with automatic fallback or direct Gemini AI Studio
app.post("/api/convert-pdf", convertLimiter, async (req, res) => {
  try {
    const { pdfBase64, fileName, options, provider = "openrouter", customApiKey } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "Falta el archivo PDF en formato base64." });
    }

    // Validate PDF size server-side (max 10 MB decoded)
    const estimatedBytes = Math.ceil((pdfBase64.length * 3) / 4);
    const maxBytes = 10 * 1024 * 1024;
    if (estimatedBytes > maxBytes) {
      return res.status(413).json({
        error: `El archivo PDF supera el límite de 10 MB (tamaño estimado: ${(estimatedBytes / 1024 / 1024).toFixed(1)} MB). Por favor, usa un archivo más pequeño.`,
      });
    }

    const systemPrompt = buildSystemPrompt(options?.instructions ?? "");

    // 5-minute timeout (300 seconds) for large PDF conversions
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300_000);

    let result: { markdown: string; modelUsed: string; attemptsCount: number; maxAttempts: number; warnings?: string[] };
    try {
      if (provider === "local-ocr") {
        const localRes = await convertPdfLocally(pdfBase64, {
          signal: controller.signal,
        });
        result = {
          markdown: localRes.markdown,
          modelUsed: "Extracción Local (OCR/Texto)",
          attemptsCount: 1,
          maxAttempts: 1,
          warnings: localRes.warnings,
        };
      } else if (provider === "gemini") {
        const apiKey = customApiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return res.status(400).json({
            error: "La API Key de Google AI Studio (GEMINI_API_KEY) no está configurada y no se proporcionó una clave personalizada.",
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
          referer: process.env.APP_URL ?? "http://localhost:3000",
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

    return res.json({
      success: true,
      markdown: result.markdown,
      fileName: fileName ?? "document.pdf",
      modelUsed: result.modelUsed,
      warnings: result.warnings || [],
    });
  } catch (error: any) {
    console.error("Conversion error details:", error);

    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "La conversión tardó demasiado (límite de 5 minutos excedido). Intenta con un PDF más pequeño o divide el documento.",
      });
    }

    return res.status(500).json({
      error: "Error durante la conversión del PDF a Markdown.",
      details: error?.message ?? "Internal Server Error",
    });
  }
});

// Configure Vite or Serve static assets
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n❌ Port ${PORT} is already in use.`);
      console.error(`   Stop the other process or set a different PORT in your .env file.\n`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}

setupServer();
