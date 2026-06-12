/**
 * Local PDF → Markdown converter (no AI).
 *
 * - Uses **pdfjs-dist** to extract selectable text with font metadata.
 * - Uses **Tesseract.js** (OCR) for scanned / image-only pages.
 * - No API keys, no external AI network calls.
 *
 * The `@napi-rs/canvas` npm package is required only for OCR (rendering PDF pages to
 * images).  If it's not installed, digital text extraction still works and
 * scanned pages are skipped with a warning.
 */

import { reconstructMarkdown } from "./markdown-reconstructor";
import type { PageData, TextItem } from "./markdown-reconstructor";

/** Pages with fewer meaningful chars than this are treated as scanned. */
const MIN_TEXT_CHARS = 30;

// ── Public Interface ─────────────────────────────────────────────────────

export interface LocalOcrOptions {
  ocrLanguage?: string;   // Tesseract lang code, default "eng+spa"
  signal?: AbortSignal;
}

export interface LocalOcrResult {
  markdown: string;
  pagesProcessed: number;
  ocrPages: number[];
  warnings: string[];
}

/**
 * Converts a base64-encoded PDF to Markdown using local extraction + OCR.
 */
export async function convertPdfLocally(
  pdfBase64: string,
  options: LocalOcrOptions = {},
): Promise<LocalOcrResult> {
  const { ocrLanguage = "eng+spa", signal } = options;
  const warnings: string[] = [];
  const ocrPages: number[] = [];

  // ── Load pdfjs-dist (prefer Node-compatible legacy build) ────────────
  let pdfjsLib: any;
  try {
    pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    pdfjsLib = await import("pdfjs-dist");
  }

  // ── Decode base64 → Uint8Array ───────────────────────────────────────
  const buf = Buffer.from(pdfBase64, "base64");
  const data = new Uint8Array(buf);

  // ── Open PDF ─────────────────────────────────────────────────────────
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const numPages: number = pdf.numPages;
  const pages: PageData[] = [];

  for (let n = 1; n <= numPages; n++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const page = await pdf.getPage(n);
    const content = await page.getTextContent();

    // ── Extract items with font metadata ─────────────────────────────
    const textItems: TextItem[] = [];
    for (const rawItem of content.items) {
      const item = rawItem as any;
      if (!item.str?.trim()) continue;
      const tf = item.transform ?? [1, 0, 0, 1, 0, 0];
      const fontSize = Math.abs(tf[3]) || Math.abs(tf[0]) || 12;
      textItems.push({
        str: item.str,
        fontName: item.fontName ?? "",
        fontSize,
        x: tf[4] ?? 0,
        y: tf[5] ?? 0,
        width: item.width ?? 0,
        height: item.height ?? fontSize,
      });
    }

    // Count meaningful (non-whitespace) characters
    const chars = textItems.map(i => i.str.replace(/\s/g, "")).join("").length;

    if (chars >= MIN_TEXT_CHARS) {
      // ── Digital page (has selectable text layer) ─────────────────
      pages.push({ pageNumber: n, type: "digital", textItems });
    } else {
      // ── Attempt OCR for scanned / image-only page ────────────────
      try {
        const ocrText = await ocrPage(page, ocrLanguage);
        if (ocrText?.trim()) {
          pages.push({ pageNumber: n, type: "ocr", plainText: ocrText });
          ocrPages.push(n);
          warnings.push(
            `Página ${n}: procesada mediante OCR (la calidad puede variar según la resolución del escaneo).`,
          );
        } else {
          warnings.push(
            `Página ${n}: sin texto legible (posible página vacía o imagen decorativa). Omitida.`,
          );
        }
      } catch (err: any) {
        warnings.push(
          `Página ${n}: OCR no disponible — ${err?.message ?? "error desconocido"}. Omitida.`,
        );
      }
    }

    page.cleanup();
  }

  if (!pages.length) {
    throw new Error(
      "No se pudo extraer texto del PDF. El archivo podría estar vacío, protegido " +
        "o contener solo imágenes sin texto reconocible.",
    );
  }

  return {
    markdown: reconstructMarkdown(pages),
    pagesProcessed: numPages,
    ocrPages,
    warnings,
  };
}

// ── OCR Helper ───────────────────────────────────────────────────────────

/**
 * Renders a single PDF page to an image via Node `canvas` and runs
 * Tesseract.js OCR over it.
 */
async function ocrPage(page: any, language: string): Promise<string> {
  // 1. canvas is required to rasterise the PDF page in Node.js
  let createCanvas: any;
  try {
    const mod = await import("@napi-rs/canvas");
    createCanvas = mod.createCanvas;
  } catch {
    throw new Error(
      "El paquete '@napi-rs/canvas' no está instalado. Necesario para OCR de páginas " +
        "escaneadas. Ejecuta:  npm install @napi-rs/canvas",
    );
  }

  // 2. Render at 2× scale for better OCR accuracy
  const viewport = page.getViewport({ scale: 2.0 });
  const cvs = createCanvas(viewport.width, viewport.height);
  const ctx = cvs.getContext("2d");

  // Custom canvas factory so pdfjs-dist can create auxiliary canvases
  const canvasFactory = {
    create(w: number, h: number) {
      const c = createCanvas(w, h);
      return { canvas: c, context: c.getContext("2d") };
    },
    reset(pair: any, w: number, h: number) {
      pair.canvas.width = w;
      pair.canvas.height = h;
    },
    destroy(pair: any) {
      pair.canvas.width = 0;
      pair.canvas.height = 0;
    },
  };

  await page.render({ canvasContext: ctx, viewport, canvasFactory }).promise;
  const imgBuf: Buffer = cvs.toBuffer("image/png");

  // 3. Run Tesseract OCR
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(language);
  const { data } = await worker.recognize(imgBuf);
  await worker.terminate();

  return data.text;
}
