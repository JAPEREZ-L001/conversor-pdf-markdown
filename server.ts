import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

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

// PDF to Markdown conversion endpoint — OpenRouter backend
app.post("/api/convert-pdf", convertLimiter, async (req, res) => {
  try {
    const { pdfBase64, fileName, options } = req.body;

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

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY no está configurada en el servidor." });
    }

    const systemPrompt = buildSystemPrompt(options?.instructions || "");

    // AbortController for 60-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    let markdownText = "";
    try {
      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
          "X-Title": "Conversor PDF a Markdown",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-exp:free",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Convert this PDF document to clean, elegant, and standard Markdown format according to your parsing instructions." },
                {
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

    return res.json({
      success: true,
      markdown: markdownText,
      fileName: fileName || "document.pdf",
    });
  } catch (error: any) {
    console.error("Conversion error details:", error);

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
