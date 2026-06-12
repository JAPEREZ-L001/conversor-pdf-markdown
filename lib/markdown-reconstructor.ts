/**
 * Heuristic-based Markdown reconstructor for locally-extracted PDF text.
 * Converts raw text items (with font metadata from pdfjs-dist) or plain OCR text
 * into structured Markdown WITHOUT relying on any AI model.
 */

// ── Public Types ─────────────────────────────────────────────────────────

export interface TextItem {
  str: string;
  fontName: string;
  fontSize: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageData {
  pageNumber: number;
  type: "digital" | "ocr";
  textItems?: TextItem[];   // Present when type === "digital"
  plainText?: string;       // Present when type === "ocr"
}

// ── Internal Types ───────────────────────────────────────────────────────

interface LineGroup {
  y: number;
  items: TextItem[];
  text: string;
  fontSize: number;
  fontName: string;
  isBold: boolean;
  isItalic: boolean;
  x: number;
}

// ── Constants ────────────────────────────────────────────────────────────

const BULLET_RE = /^[•\-*◦▪▸►◆●]\s+/;
const NUMBERED_RE = /^(\d+)[.)]\s+/;

// ── Main Entry Point ─────────────────────────────────────────────────────

/**
 * Reconstructs Markdown from an array of page-level data.
 * Pages with digital text use font-based heuristics; OCR pages use pattern
 * detection only (no heading/bold inference without font metadata).
 */
export function reconstructMarkdown(pages: PageData[]): string {
  const parts: string[] = [];

  for (const page of pages) {
    let md = "";
    if (page.type === "digital" && page.textItems?.length) {
      md = digitalPageToMarkdown(page.textItems);
    } else if (page.type === "ocr" && page.plainText) {
      md = ocrPageToMarkdown(page.plainText);
    }
    if (md.trim()) parts.push(md.trim());
  }

  return parts.join("\n\n").trim();
}

// ── Font Helpers ─────────────────────────────────────────────────────────

function isBoldFont(fontName: string): boolean {
  const l = fontName.toLowerCase();
  return l.includes("bold") || l.includes("black") || l.includes("heavy");
}

function isItalicFont(fontName: string): boolean {
  const l = fontName.toLowerCase();
  return l.includes("italic") || l.includes("oblique");
}

// ── Line Grouping ────────────────────────────────────────────────────────

/**
 * Groups TextItems into lines based on similar Y coordinates,
 * then sorts items within each line by X coordinate (left to right).
 */
function groupIntoLines(items: TextItem[]): LineGroup[] {
  if (!items.length) return [];

  // Sort by Y descending (PDF coordinates: Y grows upward), then X ascending
  const sorted = [...items].sort((a, b) => {
    const dy = b.y - a.y;
    return Math.abs(dy) > 2 ? dy : a.x - b.x;
  });

  const lines: LineGroup[] = [];
  let current: TextItem[] = [sorted[0]];
  let curY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i];
    if (Math.abs(it.y - curY) < 3) {
      current.push(it);
    } else {
      lines.push(buildLine(current));
      current = [it];
      curY = it.y;
    }
  }
  if (current.length) lines.push(buildLine(current));

  return lines;
}

function buildLine(items: TextItem[]): LineGroup {
  items.sort((a, b) => a.x - b.x);
  const text = items.map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
  const avg = items.reduce((s, i) => s + i.fontSize, 0) / items.length;

  // Find dominant font name by character count
  const fontCounts = new Map<string, number>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    fontCounts.set(item.fontName, (fontCounts.get(item.fontName) || 0) + item.str.length);
  }
  let dominantFont = items[0]?.fontName ?? "";
  let maxCount = 0;
  for (const [font, count] of fontCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantFont = font;
    }
  }

  return {
    y: items[0].y,
    items,
    text,
    fontSize: avg,
    fontName: dominantFont,
    isBold: items.some(i => isBoldFont(i.fontName)),
    isItalic: items.some(i => isItalicFont(i.fontName)),
    x: items[0].x,
  };
}

// ── Heading Detection ────────────────────────────────────────────────────

/**
 * Builds a mapping from rounded font size → heading level (1–4).
 * The most frequent font size (by total character count) is treated as body
 * text; all sizes larger than body become headings ordered largest→smallest.
 */
function buildHeadingMap(lines: LineGroup[]): Map<number, number> {
  const freq = new Map<number, number>();
  for (const l of lines) {
    if (!l.text.trim()) continue;
    const r = Math.round(l.fontSize);
    freq.set(r, (freq.get(r) || 0) + l.text.length);
  }

  // Body text = most frequent size by character count
  let bodySize = 0;
  let maxF = 0;
  for (const [sz, f] of freq) {
    if (f > maxF) { maxF = f; bodySize = sz; }
  }

  // Sizes larger than body → headings
  const larger = [...freq.keys()].filter(s => s > bodySize).sort((a, b) => b - a);
  const map = new Map<number, number>();
  for (let i = 0; i < Math.min(larger.length, 4); i++) {
    map.set(larger[i], i + 1); // H1, H2, H3, H4
  }
  return map;
}

// ── Digital Page Reconstruction ──────────────────────────────────────────

interface SemanticBlock {
  type: "heading" | "list-bullet" | "list-number" | "paragraph" | "blockquote";
  text: string;
  level?: number;
  num?: string;
  fontSize: number;
  fontName: string;
  isBold: boolean;
  isItalic: boolean;
}

function digitalPageToMarkdown(items: TextItem[]): string {
  const lines = groupIntoLines(items);
  if (!lines.length) return "";

  const headings = buildHeadingMap(lines);

  // Calculate average vertical spacing
  const spacings: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    spacings.push(Math.abs(lines[i - 1].y - lines[i].y));
  }
  const avgSpacing = spacings.length
    ? spacings.reduce((a, b) => a + b, 0) / spacings.length
    : 0;

  // Typical left margin
  const margins = lines.filter(l => l.text.trim()).map(l => l.x).sort((a, b) => a - b);
  const baseMargin = margins.length ? margins[Math.floor(margins.length * 0.25)] : 0;

  const blocks: SemanticBlock[] = [];
  let currentBlock: SemanticBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    if (!text.trim()) continue;

    const headingLevel = headings.get(Math.round(line.fontSize));
    const isHeading = !!(headingLevel && text.length < 200);

    const bulletMatch = text.match(BULLET_RE);
    const numberedMatch = text.match(NUMBERED_RE);

    const prevLine = i > 0 ? lines[i - 1] : null;
    const verticalGap = prevLine ? prevLine.y - line.y : 0;

    let startNewBlock = false;
    if (!currentBlock) {
      startNewBlock = true;
    } else if (isHeading) {
      startNewBlock = true;
    } else if (bulletMatch || numberedMatch) {
      startNewBlock = true;
    } else if (currentBlock.type === "heading") {
      startNewBlock = true;
    } else if (Math.abs(currentBlock.fontSize - line.fontSize) > 1.5) {
      startNewBlock = true;
    } else if (currentBlock.fontName !== line.fontName) {
      startNewBlock = true;
    } else if (currentBlock.isBold !== line.isBold || currentBlock.isItalic !== line.isItalic) {
      startNewBlock = true;
    } else if (avgSpacing > 0 && verticalGap > avgSpacing * 1.4) {
      startNewBlock = true;
    }

    if (startNewBlock) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }

      if (isHeading) {
        currentBlock = {
          type: "heading",
          text,
          level: headingLevel,
          fontSize: line.fontSize,
          fontName: line.fontName,
          isBold: line.isBold,
          isItalic: line.isItalic
        };
      } else if (bulletMatch) {
        currentBlock = {
          type: "list-bullet",
          text: text.replace(BULLET_RE, ""),
          fontSize: line.fontSize,
          fontName: line.fontName,
          isBold: line.isBold,
          isItalic: line.isItalic
        };
      } else if (numberedMatch) {
        currentBlock = {
          type: "list-number",
          text: text.replace(NUMBERED_RE, ""),
          num: numberedMatch[1],
          fontSize: line.fontSize,
          fontName: line.fontName,
          isBold: line.isBold,
          isItalic: line.isItalic
        };
      } else {
        const isBlockquote = line.x - baseMargin > 45;
        currentBlock = {
          type: isBlockquote ? "blockquote" : "paragraph",
          text,
          fontSize: line.fontSize,
          fontName: line.fontName,
          isBold: line.isBold,
          isItalic: line.isItalic
        };
      }
    } else {
      if (currentBlock) {
        currentBlock.text += " " + text;
      }
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const formattedText = applyInline(b.text, b);
    
    let prefix = "";
    if (b.type === "heading") {
      prefix = `${"#".repeat(b.level || 1)} `;
    } else if (b.type === "list-bullet") {
      prefix = "- ";
    } else if (b.type === "list-number") {
      prefix = `${b.num}. `;
    } else if (b.type === "blockquote") {
      prefix = "> ";
    }
    
    const blockMarkdown = b.type === "heading" ? `${prefix}${b.text}` : `${prefix}${formattedText}`;
    
    if (i === 0) {
      out.push(blockMarkdown);
    } else {
      const prev = blocks[i - 1];
      const isTightList = 
        (b.type === "list-bullet" && prev.type === "list-bullet") ||
        (b.type === "list-number" && prev.type === "list-number");
        
      if (isTightList) {
        out.push(out.pop() + "\n" + blockMarkdown);
      } else {
        out.push(blockMarkdown);
      }
    }
  }

  return out.join("\n\n");
}

/** Wraps text in bold/italic markers based on line-level font metadata. */
function applyInline(text: string, style: { isBold: boolean; isItalic: boolean }): string {
  if (style.isBold && style.isItalic) return `***${text}***`;
  if (style.isBold) return `**${text}**`;
  if (style.isItalic) return `*${text}*`;
  return text;
}

// ── OCR Page Reconstruction ──────────────────────────────────────────────

/**
 * OCR text has no font metadata → only detects lists and paragraph breaks.
 */
function ocrPageToMarkdown(plain: string): string {
  const raw = plain.split("\n");
  const out: string[] = [];

  for (const line of raw) {
    const t = line.trim();
    if (!t) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }

    // Bullet
    const bm = t.match(BULLET_RE);
    if (bm) { out.push(`- ${t.replace(BULLET_RE, "")}`); continue; }

    // Numbered
    const nm = t.match(NUMBERED_RE);
    if (nm) { out.push(`${nm[1]}. ${t.replace(NUMBERED_RE, "")}`); continue; }

    out.push(t);
  }

  return out.join("\n");
}
