// ── Common Types ──────────────────────────────────────────────────────────

export interface ChatTurn {
  role: 'user' | 'ai';
  text: string;
  imageDataUrl?: string; // full "data:image/...;base64,..." data URL
}

/** Optional context about the document page currently open in the editor */
export interface CanvasContext {
  pageNumber: number;
  html:       string;
  image:      string;   // raw base64 JPEG (no data: prefix)
}

export type ImageAspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
export type ImageSize       = '512px' | '1K' | '2K';
export type ImageQuality    = 'fast' | 'pro';

export interface ImageGenOptions {
  aspectRatio?: ImageAspectRatio;
  imageSize?:   ImageSize;
  quality?:     ImageQuality;
}

/** Bounding box expressed as percentages of the full page (0–100) */
export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ── Shared Prompts ─────────────────────────────────────────────────────────

export function buildOcrPrompt(): string {
  return `You are an expert multilingual OCR engine that works with any document type (books, newspapers, forms, academic papers, religious texts, manuals, etc.).

TASK: Extract ALL text from this page image with 100% accuracy.

CRITICAL — AMHARIC / ETHIOPIC (ፊደል) TEXT RULES:
- NEVER substitute, correct, modernize, or "fix" any Amharic word. Output EXACTLY what is printed.
- Visually similar Ethiopic characters MUST be distinguished carefully:
  ሀ ≠ ሐ ≠ ኀ  |  ሰ ≠ ሠ  |  ጸ ≠ ፀ  |  አ ≠ ዐ
- Preserve ALL Ethiopic punctuation exactly: ። (full stop) ፣ (comma) ፤ (semicolon) ፡ (wordspace) :: (old-style full stop)
- Church/religious texts use archaic forms — do NOT replace them with modern equivalents.
- If a word is unclear, output your best character-level reading — NEVER skip or paraphrase it.
- Mixed Amharic + English/numbers: keep both scripts exactly as printed, in the correct reading order.

GENERAL RULES:
- Output ONLY the raw text — nothing else, no explanations.
- Preserve every character, punctuation mark, and number exactly as it appears.
- Preserve paragraph breaks with blank lines.
- If the page has two or more columns, extract each column left-to-right, separated by "---COLUMN BREAK---".
- Mark headers and titles with "### " prefix.
- Mark a text line with "[BOXED] " ONLY when it sits inside a clearly drawn rectangle whose lines are visible on ALL FOUR sides. Do NOT mark colored or styled text that simply has no surrounding box.
- For photographs, illustrations, drawings, charts, or any non-text graphic region: insert a marker IN PLACE (at the exact reading position where it appears in the page flow):
    [IMAGE: <brief English description> | pos:<top|upper|middle|lower|bottom> | h:<approximate % of page height the image occupies>]
- Do NOT translate, interpret, or add commentary.

Extract now:`;
}

export function buildLayoutPrompt(extractedText: string, prevHTML?: string): string {
  return `You are an expert document layout reconstructor for Amharic (Ge'ez) text.

TASK: Convert the extracted OCR text below into clean, professional HTML that faithfully reproduces the original page layout shown in the image.

EXTRACTED TEXT:
${extractedText}

ABSOLUTE RULE — TEXT INTEGRITY:
You MUST use the EXACT text from "EXTRACTED TEXT" above — copy it character-by-character into your HTML.
- NEVER rewrite, paraphrase, modernize, or "improve" any Amharic word.
- NEVER drop words, add words, or reorder words.
- Every single word from the extracted text MUST appear in your HTML output.
- Output raw HTML only — zero markdown, zero code fences.
- Start your output directly with the first HTML element.
- All styles must be inline.

LAYOUT TEMPLATES:
- Two-column: <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;">
- Primary header: <h2 style="text-align:center;font-weight:900;font-size:1.2rem;">
- Body paragraph: <p style="line-height:1.75;text-align:justify;">

${prevHTML ? `PREVIOUS PAGE HTML (for consistency):\n${prevHTML.slice(0, 1000)}` : ''}

Now output the HTML layout for this page:`.trim();
}

export function verifyLayout(html: string): string {
  let cleaned = html
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  cleaned = cleaned
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<\/?head[^>]*>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '')
    .replace(/<\/?doctype[^>]*>/gi, '')
    .trim();

  if (!cleaned.startsWith('<')) {
    cleaned = `<p style="line-height: 1.8; text-align: justify;">${cleaned}</p>`;
  }

  return cleaned;
}
