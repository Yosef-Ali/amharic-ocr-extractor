import { GoogleGenAI } from '@google/genai';
import { APPROVAL_REQUIRED_TOOLS } from '../types/a2ui';

const MODEL       = 'gemini-3-flash-preview';          // agent chat — function calling (tools in config.tools)
const OCR_FAST    = 'gemini-3.1-flash-image-preview';  // Pass 1 & 2 batch extraction (fast model — DO NOT CHANGE)
const IMAGE_MODEL = 'gemini-3-pro-image-preview';      // image generation & editing (DO NOT CHANGE)
const NANOBANANA2 = 'gemini-3.1-flash-image-preview';  // NanoBanana 2 — cover page generation (pro quality at flash speed)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ImageQuality    = 'fast' | 'pro';
export type ImageAspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
export type ImageSize       = '512px' | '1K' | '2K';

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

const LS_KEY = 'gemini_api_key';

function resolveApiKey(): string {
  return localStorage.getItem(LS_KEY) || (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
}

let client = new GoogleGenAI({ apiKey: resolveApiKey() });

/** Call this after the user connects a Pro Key so the client picks up new credentials */
export function reinitializeClient() {
  client = new GoogleGenAI({ apiKey: resolveApiKey() });
}

/** Save a user-provided API key, then reinitialize the client. */
export function setApiKey(key: string) {
  if (key.trim()) localStorage.setItem(LS_KEY, key.trim());
  else            localStorage.removeItem(LS_KEY);
  reinitializeClient();
}

/** Returns true if the error is a Gemini API key problem (missing / expired / invalid). */
export function isApiKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /API_KEY_INVALID|API key expired|API key not valid|API_KEY_NOT_FOUND|INVALID_ARGUMENT.*key/i.test(msg);
}

// ---------------------------------------------------------------------------
// Pass 1 — OCR: extract raw text from the page image
// ---------------------------------------------------------------------------
function buildOcrPrompt(): string {
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
- IGNORE actual photographs, illustrations, logos, and non-text graphics — extract text only.
- Do NOT translate, interpret, or add commentary.

Extract now:`;
}

// ---------------------------------------------------------------------------
// Pass 2 — Layout: reconstruct HTML from extracted text + page image reference
// ---------------------------------------------------------------------------
function buildLayoutPrompt(extractedText: string, prevHTML?: string): string {
  return `You are an expert document layout reconstructor for Amharic (Ge'ez) text.

TASK: Convert the extracted OCR text below into clean, professional HTML that faithfully reproduces the original page layout shown in the image. This app works with ANY document type — books, newspapers, academic papers, forms, manuals — so adapt the design to what you actually see, not to assumptions about document type.

EXTRACTED TEXT:
${extractedText}

ABSOLUTE RULE — TEXT INTEGRITY:
You MUST use the EXACT text from "EXTRACTED TEXT" above — copy it character-by-character into your HTML.
- NEVER rewrite, paraphrase, modernize, or "improve" any Amharic word.
- NEVER drop words, add words, or reorder words.
- NEVER substitute similar-looking Ethiopic characters (ሀ≠ሐ≠ኀ, ሰ≠ሠ, ጸ≠ፀ).
- If the extracted text has errors, preserve those errors — your job is LAYOUT, not editing.
- Every single word from the extracted text MUST appear in your HTML output.
- Output raw HTML only — zero markdown, zero code fences, zero \`\`\`html wrappers.
- Do NOT include <html>, <head>, <body>, or <doctype> tags.
- Start your output directly with the first HTML element.
- Preserve ALL text character-perfect from the extracted text above.
- Lines marked "[BOXED]" in the extracted text sat inside a four-sided rectangle in the scan — render them with a CSS border div (see template below), NOT as an image placeholder.

LAYOUT TEMPLATES — adapt colors to match the original document's palette:

Two-column layout (only when the page clearly has two columns):
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;width:100%;">

Primary header:
  <h2 style="text-align:center;font-weight:900;color:#0f172a;font-size:1.2rem;margin:0 0 0.75rem;">

Section subheader (use the dominant heading color of the original — e.g. #b91c1c for red, #1d4ed8 for blue, #0f172a for black):
  <h3 style="text-align:center;font-weight:700;color:[HEADING_COLOR];font-size:0.95rem;margin:0 0 0.5rem;">

Body paragraph:
  <p style="line-height:1.75;color:#1c1917;margin:0 0 0.85rem;text-align:justify;font-size:1rem;">

Bordered text box — ONLY for [BOXED] lines (match the border color of the original scan):
  <div style="border:2px solid [BORDER_COLOR];border-radius:4px;padding:0.55rem 0.85rem;margin:0.6rem 0;text-align:center;">

DESIGN PRINCIPLES (follow these — act as a senior document designer):
- Use borders SPARINGLY — only when a four-sided rectangle is explicitly visible in the scan.
- Section titles that are merely colored or bold text → use <h3>, NOT a bordered div.
- Maintain clear visual hierarchy: primary header > subheader > body.
- Keep margins compact and consistent — avoid excessive whitespace or crowding.
- Prefer semantic HTML (h2, h3, p) over generic divs for text content.
- Every element must carry its own inline styles — no class dependencies.

IMAGE PLACEHOLDERS — strict rules:

  ✅ Insert placeholder ONLY for genuine photographs, illustrations, drawings, charts, or non-text graphics.

  ❌ NEVER insert a placeholder for:
     - [BOXED] text areas (render with CSS border instead)
     - Section headers, captions, or labels — even decoratively styled ones
     - Any area where you can read the text content
     - Blank space, page borders, or backgrounds

  When in doubt: if you can read text there → it's HTML, not a placeholder.

  Use this exact HTML for true image regions only:

<div class="ai-image-placeholder" data-description="[specific English description of what the image shows]">
  <span class="ai-ph-icon">📷</span>
  <p class="ai-ph-label">[same description]</p>
</div>

  Make data-description as specific as possible (e.g. "religious illustration: Jesus blessing a kneeling person, black-and-white engraving, located in right column middle"). This description is used to locate the image in the original scan.

${prevHTML
    ? `PREVIOUS PAGE HTML (use for style consistency — do NOT repeat its content):\n${prevHTML.slice(0, 2500)}`
    : ''}

Now output the HTML layout for this page:`.trim();
}

// ---------------------------------------------------------------------------
// Layout verification — clean up model output
// ---------------------------------------------------------------------------
function verifyLayout(html: string): string {
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
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim();

  if (!cleaned.startsWith('<')) {
    cleaned = `<p style="line-height: 1.8; color: #1c1917; margin-bottom: 2rem; text-align: justify; font-size: 1rem;">${cleaned}</p>`;
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// AI Design Chat — edit a page via natural language instruction
// Acts as a senior document designer: improves layout, removes clutter,
// fixes typography, while preserving every word of the original content.
// ---------------------------------------------------------------------------
export async function editPageWithChat(
  base64Image: string,
  currentHTML: string,
  instruction: string,
): Promise<string> {
  const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64Image } };

  const prompt = `You are a senior document designer and HTML expert.
You are editing a document page. The original scanned image is provided for visual reference.

CURRENT PAGE HTML:
\`\`\`html
${currentHTML}
\`\`\`

USER REQUEST: ${instruction}

YOUR TASK:
Apply the user's request and return improved HTML. Think like a professional designer:
- Remove visual clutter (excessive borders, inconsistent spacing, redundant wrappers)
- Enforce clear typographic hierarchy: primary header → subheader → body text
- Use borders ONLY where they add genuine visual structure (not for every heading)
- Use whitespace effectively — not too cramped, not too spacious
- Keep fonts using font-family: 'Noto Serif Ethiopic', 'Noto Sans Ethiopic', serif for non-Latin script text
- Match colors intelligently to the document's original palette
- Make the design universally professional — not style-locked to any one document type

STRICT RULES:
- Return ONLY raw HTML — no markdown, no code fences, no comments, no explanations
- Do NOT include html / head / body / doctype tags
- Preserve every word of text — do not add or remove content
- All styles must be inline — no class references that won't resolve outside the editor

Output the improved HTML now:`.trim();

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [imagePart, { text: prompt }] }],
  });

  return verifyLayout(response.text ?? '');
}

// ---------------------------------------------------------------------------
// Extract HTML from a page image (two-pass: OCR → Layout)
// ---------------------------------------------------------------------------
export async function extractPageHTML(
  base64Image: string,
  previousPageHTML?: string,
): Promise<string> {
  const imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64Image } };

  // ── Pass 1: OCR — extract raw text (fast model) ──
  const ocrResponse = await client.models.generateContent({
    model: OCR_FAST,
    contents: [{ role: 'user', parts: [imagePart, { text: buildOcrPrompt() }] }],
  });

  const extractedText = ocrResponse.text ?? '';
  if (!extractedText.trim()) {
    return '<p style="color:red;text-align:center;font-weight:bold;">⚠️ OCR returned no text for this page.</p>';
  }

  // ── Pass 2: Layout — reconstruct HTML from text + image reference ──
  // Use the fast model for batch extraction; pro is reserved for agent/chat editing
  const layoutResponse = await client.models.generateContent({
    model: OCR_FAST,
    contents: [{ role: 'user', parts: [imagePart, { text: buildLayoutPrompt(extractedText, previousPageHTML) }] }],
  });

  return verifyLayout(layoutResponse.text ?? '');
}

// ---------------------------------------------------------------------------
// Canvas crop — extract a bbox region from a base64 page scan (NO API call)
// bbox values are percentages of full page dimensions (0–100).
// paddingPct adds a small safety margin around the crop (default: 1 = 1%).
// Returns a "data:image/jpeg;base64,..." data URL.
// ---------------------------------------------------------------------------
export function cropPageRegion(
  pageBase64: string,
  bbox: BBox,
  paddingPct = 1,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const pad = paddingPct / 100;

      const x = Math.max(0, (bbox.x1 / 100 - pad) * W);
      const y = Math.max(0, (bbox.y1 / 100 - pad) * H);
      const w = Math.min(W - x, ((bbox.x2 - bbox.x1) / 100 + 2 * pad) * W);
      const h = Math.min(H - y, ((bbox.y2 - bbox.y1) / 100 + 2 * pad) * H);

      const canvas = document.createElement('canvas');
      canvas.width  = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));

      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }

      ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };

    img.crossOrigin = 'anonymous';
    img.onerror = () => reject(new Error('Failed to load page image for cropping'));
    img.src = pageBase64.startsWith('http') ? pageBase64 : `data:image/jpeg;base64,${pageBase64}`;
  });
}

// ---------------------------------------------------------------------------
// AI restoration — enhance quality while preserving content exactly.
// Pass a "data:..." data URL such as returned by cropPageRegion().
// ---------------------------------------------------------------------------
export async function restoreImage(
  cropDataUrl: string,
): Promise<string> {
  const [header, data] = cropDataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';

  const response = await client.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data } },
          {
            text:
              'This is a cropped region from a scanned book page. ' +
              'Restore and enhance its quality: remove scan artifacts and noise, ' +
              'sharpen text and fine details, correct contrast and brightness. ' +
              'Preserve ALL existing visual content exactly as-is — ' +
              'do NOT add, remove, or change any objects, text, or elements. ' +
              'Output only the restored image.',
          },
        ],
      },
    ],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType ?? 'image/jpeg'};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('Image restoration returned no image data');
}

// ---------------------------------------------------------------------------
// Image Editing — text-and-image-to-image (for the click-to-edit modal).
// Pass raw base64 (no "data:" prefix) + mimeType from a data URL.
// ---------------------------------------------------------------------------
export async function editImage(
  base64Data: string,
  mimeType: string,
  editPrompt: string,
  options: Pick<ImageGenOptions, 'aspectRatio' | 'imageSize'> = {},
): Promise<string> {
  const response = await client.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: editPrompt },
        ],
      },
    ],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: options.aspectRatio ?? '1:1',
        imageSize:   options.imageSize   ?? '1K',
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('Image editing returned no image data');
}

// ---------------------------------------------------------------------------
// Layout tool-calling loop — AI makes surgical print-document edits
// Uses Gemini function calling (official @google/genai multi-turn pattern)
// ---------------------------------------------------------------------------
import { CanvasExecutor } from './canvasExecutor';
import { CANVAS_TOOL_DECLARATIONS, type ToolCallFeedback } from './canvasTools';

const LAYOUT_SYSTEM_PROMPT = `You are an expert Amharic print document designer — a specialist in Adobe InDesign-style layout for Ethiopian religious and academic texts. You work inside a live multi-page A4 document editor.

══════════════════════════════════════════════════
CRITICAL: TOOL DISCIPLINE
══════════════════════════════════════════════════
- ONLY call tools listed in your function declarations. Never invent tools.
- Use ONLY these tools: getDocumentStructure, editTextBlock, editImageFrame, setColumnLayout, insertElement, deleteElement, batchEdit, getPageScreenshot, setActivePage, extractPage, extractAllPages, generateCoverPage.
- You have full document access through these tools — you need nothing else.

══════════════════════════════════════════════════
MODE 1 — EXTRACTION
══════════════════════════════════════════════════
When the user says extract/scan/digitize:
- Call extractPage({ pageNumber: N }). The tool fetches the image automatically — ANY page number works.
- NEVER say "I cannot access page N" — just call extractPage(N).
- After success respond only: "✅ Page N extracted." NEVER echo HTML.

══════════════════════════════════════════════════
MODE 2 — ANALYSIS / REVIEW
══════════════════════════════════════════════════
When the user says "analyze", "review", "what's on this page", "critique":
1. Call getDocumentStructure({ pageNumber }) to read the element tree.
2. Call getPageScreenshot({ pageNumber }) to visually inspect.
3. Return a structured review:
   • Typography: heading hierarchy, body sizes, line-height
   • Layout: columns, whitespace, margins
   • Issues found: widows, orphans, inconsistent spacing
   • Suggestions: 2–3 specific actionable improvements

══════════════════════════════════════════════════
MODE 3 — EDITING
══════════════════════════════════════════════════
TYPOGRAPHY HIERARCHY (Amharic print):
  H1 — main title:        font-size 1.5rem, font-weight 900, text-align center, color #1c1917
  H2 — section heading:   font-size 1.25rem, font-weight 700, color #b91c1c, letter-spacing 0.05em
  H3 — subsection:        font-size 1.1rem, font-weight 700, color #1c1917
  Body ( አካል):            font-size 1rem, line-height 1.8, text-align justify, color #1c1917
  Caption / footnote:     font-size 0.875rem, line-height 1.5, color #44403c
  Boxed / special text:   border-left 3px solid #b91c1c, padding-left 1rem

LAYOUT RULES:
- All measurements in rem, mm, or pt — NEVER px.
- All styles INLINE — required for PDF export.
- A4 safe zone: 20mm top/bottom, 22mm left/right.
- Two-column body gap: 2rem. Three-column: 1.5rem.
- Use CSS column-count on the container element, not on individual paragraphs.
- For Ge'ez text: font-family "Noto Serif Ethiopic" — NEVER change this.
- Page breaks: use style="page-break-before: always" on section openers.

COLOR PALETTE (CMYK-safe for print):
  Text:        #1c1917   Body paragraphs, titles
  Red:         #b91c1c   Section headings, decorative rules
  Muted:       #44403c   Captions, footnotes
  Light rule:  #e7e5e4   Dividers, borders

WORKFLOW:
1. Call getDocumentStructure to get element IDs first.
2. Use batchEdit for coordinated multi-element changes (preferred).
3. Use editTextBlock for single-element changes.
4. Call getPageScreenshot to verify key changes visually.
5. Return a brief 1–2 sentence summary — no HTML, no raw JSON.

AMHARIC-SPECIFIC RULES:
- Always justify body text (text-align: justify).
- Preserve Ge'ez numerals (፩ ፪ ፫) in headings — do not replace with Arabic.
- Religious headings (ጸሎት, ምዕራፍ, ክፍል) get color #b91c1c and letter-spacing 0.1em.
- Red decorative rules: <hr style="border: none; border-top: 2px solid #b91c1c; margin: 1rem 0;">

══════════════════════════════════════════════════
MODE 4 — COVER PAGE
══════════════════════════════════════════════════
When the user asks to generate, create, make, or design a cover page:
1. Call generateCoverPage with the title and any details they provide.
2. Use style "orthodox" for Ethiopian/religious texts, "modern" for contemporary, etc.
3. If the user wants to improve an existing cover, use mode "improve" with instructions.
4. After success, respond briefly: "✅ Cover page generated." — do NOT echo any HTML or image data.

NEVER:
- Add web CSS (hover, focus, media queries, responsive units, viewport units).
- Remove text content unless explicitly asked.
- Change font-family on Amharic text.
- Echo HTML back in responses — it is live in the editor.`;

// ---------------------------------------------------------------------------
// Auto-image: detect image regions in a scanned page and crop them
// ---------------------------------------------------------------------------

interface ImgBBox { x1: number; y1: number; x2: number; y2: number; }

/** Ask Gemini to locate each described image in the scan. Returns 1-indexed results. */
async function detectImageBBoxes(
  base64Scan: string,
  descriptions: string[],
): Promise<Array<{ index: number } & ImgBBox>> {
  if (!descriptions.length) return [];
  const list = descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n');
  const prompt = `Locate each illustration/photo in this scanned page. Coordinates: x1,y1=top-left, x2,y2=bottom-right as percentages (0-100). Tight box, no whitespace. Omit if not found.

${list}

Return ONLY JSON: [{"index":1,"x1":12,"y1":8,"x2":47,"y2":38},...]`;

  try {
    type Part = { text?: string; inlineData?: { mimeType: string; data: string } };
    const res = await client.models.generateContent({
      model: OCR_FAST,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Scan } } as unknown as Part,
        { text: prompt },
      ] }],
      config: { temperature: 0 },
    });
    const text = res.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    return JSON.parse(match[0]) as Array<{ index: number } & ImgBBox>;
  } catch {
    return [];
  }
}

/**
 * Enhance a cropped canvas in-place:
 *  1. Auto-levels   — stretch per-channel histogram to fill 0–255
 *  2. Contrast boost — mild S-curve (×1.25)
 *  3. Unsharp mask  — sharpen edges without amplifying noise
 */
function enhanceCropCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const { width: W, height: H } = canvas;
  const id   = ctx.getImageData(0, 0, W, H);
  const d    = id.data;
  const n    = d.length;

  // ── 1. Auto-levels (per channel, skip 2% tails to ignore dust/burn) ────
  const hist = Array.from({ length: 3 }, () => new Uint32Array(256));
  for (let i = 0; i < n; i += 4) {
    for (let c = 0; c < 3; c++) hist[c][d[i + c]]++;
  }
  const pixels = W * H;
  const tail   = Math.round(pixels * 0.02);   // 2% cut-off

  const lo = new Uint8Array(3);
  const hi = new Uint8Array(3).fill(255);

  for (let c = 0; c < 3; c++) {
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[c][v]; if (acc >= tail) { lo[c] = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[c][v]; if (acc >= tail) { hi[c] = v; break; } }
  }

  // Build LUT for speed
  const lut = Array.from({ length: 3 }, (_, c) => {
    const table = new Uint8Array(256);
    const range = hi[c] - lo[c] || 1;
    for (let v = 0; v < 256; v++) {
      // auto-levels
      let out = Math.round(((v - lo[c]) / range) * 255);
      // contrast S-curve (×1.25)
      out = Math.round((out - 128) * 1.25 + 128);
      table[v] = Math.max(0, Math.min(255, out));
    }
    return table;
  });

  for (let i = 0; i < n; i += 4) {
    d[i]     = lut[0][d[i]];
    d[i + 1] = lut[1][d[i + 1]];
    d[i + 2] = lut[2][d[i + 2]];
  }
  ctx.putImageData(id, 0, 0);

  // ── 2. Unsharp mask — sharpen without border artifacts ──────────────────
  // kernel: center×5 − top − bottom − left − right  (amount = 0.5 blend)
  const src = new Uint8ClampedArray(d);   // snapshot before sharpen
  const AMOUNT = 0.55;
  const stride = W * 4;

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * stride + x * 4;
      for (let c = 0; c < 3; c++) {
        const lap = 4 * src[i + c]
          - src[i - stride + c]
          - src[i + stride + c]
          - src[i - 4 + c]
          - src[i + 4 + c];
        d[i + c] = Math.max(0, Math.min(255, src[i + c] + Math.round(AMOUNT * lap)));
      }
    }
  }
  ctx.putImageData(id, 0, 0);
}

/** Crop a rectangular region from a base64 JPEG, then enhance it. */
function cropRegion(base64: string, bbox: ImgBBox): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Must use naturalWidth/naturalHeight — img.width is 0 for off-DOM images
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      if (!W || !H) { reject(new Error('Image has zero dimensions')); return; }

      const x  = Math.round((bbox.x1 / 100) * W);
      const y  = Math.round((bbox.y1 / 100) * H);
      const cw = Math.round(((bbox.x2 - bbox.x1) / 100) * W);
      const ch = Math.round(((bbox.y2 - bbox.y1) / 100) * H);
      if (cw < 4 || ch < 4) { reject(new Error('Crop area too small')); return; }

      const canvas = document.createElement('canvas');
      canvas.width  = cw;
      canvas.height = ch;
      const ctx2d = canvas.getContext('2d')!;
      ctx2d.drawImage(img, x, y, cw, ch, 0, 0, cw, ch);

      // Sanity check — reject all-black or all-white crops (bad bbox)
      const probe = ctx2d.getImageData(0, 0, cw, ch);
      let sum = 0, sum2 = 0;
      const pd = probe.data;
      const samples = Math.min(pd.length, 4000);
      for (let i = 0; i < samples; i += 4) {
        const lum = 0.299 * pd[i] + 0.587 * pd[i + 1] + 0.114 * pd[i + 2];
        sum += lum; sum2 += lum * lum;
      }
      const n = samples / 4;
      const mean = sum / n;
      const variance = sum2 / n - mean * mean;
      if (variance < 20) { reject(new Error(`Crop variance too low (${variance.toFixed(0)}) — bad bbox`)); return; }

      // Enhance: auto-levels → contrast → unsharp mask
      enhanceCropCanvas(canvas);

      resolve(canvas.toDataURL('image/jpeg', 0.94).split(',')[1]);
    };
    img.onerror = () => reject(new Error('Failed to load scan image for cropping'));
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

/**
 * Find all .ai-image-placeholder elements in the HTML, detect their locations
 * in the original page scan, crop them, and replace placeholders with real images.
 * Returns updated HTML and the count of images successfully filled.
 */
export async function autoFillImagePlaceholders(
  html:        string,
  base64Scan:  string,
  onProgress?: (msg: string) => void,
): Promise<{ html: string; filled: number }> {
  const doc  = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
  const root = doc.getElementById('r')!;
  const placeholders = Array.from(root.querySelectorAll<HTMLElement>('.ai-image-placeholder'));
  if (!placeholders.length) return { html, filled: 0 };

  // Build bbox list — prefer data-bbox (embedded by layout pass), fall back to Gemini detection
  const bboxMap = new Map<number, ImgBBox>();
  const needDetection: { idx: number; desc: string }[] = [];

  for (let i = 0; i < placeholders.length; i++) {
    const raw = placeholders[i].getAttribute('data-bbox');
    if (raw) {
      const [x1, y1, x2, y2] = raw.split(',').map(Number);
      if ([x1, y1, x2, y2].every(n => !isNaN(n) && n >= 0 && n <= 100) && x2 > x1 && y2 > y1) {
        bboxMap.set(i, { x1, y1, x2, y2 });
        continue;
      }
    }
    needDetection.push({ idx: i, desc: placeholders[i].getAttribute('data-description') ?? 'graphic' });
  }

  // For any placeholder without a valid data-bbox, ask Gemini to detect it
  if (needDetection.length > 0) {
    onProgress?.(`Locating ${needDetection.length} image${needDetection.length > 1 ? 's' : ''} in scan…`);
    const boxes = await detectImageBBoxes(base64Scan, needDetection.map(n => n.desc));
    for (const box of boxes) {
      const entry = needDetection[box.index - 1];
      if (entry) bboxMap.set(entry.idx, { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 });
    }
  }

  // Crop and replace each placeholder
  let filled = 0;
  for (const [idx, bbox] of bboxMap.entries()) {
    const placeholder = placeholders[idx];
    const desc = placeholder.getAttribute('data-description') ?? 'image';
    onProgress?.(`Placing image: ${desc}…`);
    try {
      // Try tight crop first, then retry with expanded bbox if it fails
      let data: string;
      try {
        data = await cropRegion(base64Scan, bbox);
      } catch {
        // Expand bbox by 5% on each side and retry
        const expanded = {
          x1: Math.max(0, bbox.x1 - 5),
          y1: Math.max(0, bbox.y1 - 5),
          x2: Math.min(100, bbox.x2 + 5),
          y2: Math.min(100, bbox.y2 + 5),
        };
        data = await cropRegion(base64Scan, expanded);
      }
      const img  = doc.createElement('img');
      img.setAttribute('src', `data:image/jpeg;base64,${data}`);
      img.setAttribute('alt', desc);
      img.style.cssText = 'width:100%;max-width:100%;display:block;margin:0.75rem auto;';
      placeholder.replaceWith(img);
      filled++;
    } catch { /* leave placeholder if both crops fail */ }
  }

  return { html: root.innerHTML, filled };
}

export interface EditWithToolsOptions {
  model?:               string;
  onToolCall?:          (feedback: ToolCallFeedback) => void;
  onApprovalRequest?:   (id: string, action: string, description: string) => Promise<boolean>;
  referenceImages?:     string[];   // raw base64 JPEG, no data: prefix
  projectContext?:      string;     // injected project-awareness block (doc name, page status, notes)
}

export async function editPageWithTools(
  base64Image: string,
  currentHTML: string,
  instruction: string,
  executor: CanvasExecutor,
  pageNumber: number,
  options?: EditWithToolsOptions,
): Promise<string> {
  const { model, onToolCall, onApprovalRequest, referenceImages, projectContext } = options ?? {};
  const activeModel = model ?? MODEL;

  type Part    = { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: { result: string } } };
  type Content = { role: 'user' | 'model'; parts: Part[] };

  // Get total pages for context so the agent knows the document scope
  let totalPages = pageNumber;
  try {
    const tpResult = JSON.parse(await Promise.resolve(executor.execute('getTotalPages', {}))) as { totalPages?: number };
    if (tpResult.totalPages) totalPages = tpResult.totalPages;
  } catch { /* non-critical */ }

  // Build initial user message — page scan + optional reference images + HTML + instruction
  const initialParts: Part[] = [];

  // Only attach image when we actually have one (empty string would corrupt context)
  if (base64Image) {
    initialParts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Image } } as unknown as Part);
  }

  // Attach reference images as additional context
  if (referenceImages?.length) {
    for (const refImg of referenceImages) {
      initialParts.push({ inlineData: { mimeType: 'image/jpeg', data: refImg } } as unknown as Part);
    }
    initialParts.push({ text: `[REFERENCE IMAGES: ${referenceImages.length} image(s) provided above as visual style reference]` });
  }

  const pageContext = currentHTML
    ? `[CURRENT PAGE HTML — page ${pageNumber} of ${totalPages}]\n${currentHTML.slice(0, 3000)}`
    : `[DOCUMENT CONTEXT]\nThis is a ${totalPages}-page document. Page ${pageNumber} has not been extracted yet. Use extractPage(${pageNumber}) to extract it, or extractAllPages() for all pages.`;

  initialParts.push({
    text: `${pageContext}\n\n[USER INSTRUCTION]\n${instruction}`,
  });

  const conversation: Content[] = [{ role: 'user', parts: initialParts }];

  let summary = 'Done.';
  const MAX_TURNS = 10;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.models.generateContent({
      model: activeModel,
      contents: conversation,
      config: {
        systemInstruction: projectContext
          ? `${LAYOUT_SYSTEM_PROMPT}\n\n${projectContext}`
          : LAYOUT_SYSTEM_PROMPT,
        tools: [{ functionDeclarations: CANVAS_TOOL_DECLARATIONS as unknown as import('@google/genai').FunctionDeclaration[] }],
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) break;

    const parts: Part[] = (candidate.content?.parts ?? []) as Part[];
    conversation.push({ role: 'model', parts });

    // Extract function calls from this turn
    const calls = parts.filter(p => p.functionCall);

    if (calls.length === 0) {
      // No tool calls — Gemini is done, extract summary text
      summary = parts.map(p => p.text ?? '').join('').trim() || 'Layout updated.';
      break;
    }

    // Execute each function call and collect responses
    const toolResponses: Part[] = [];
    for (const part of calls) {
      if (!part.functionCall) continue;
      const { name, args } = part.functionCall;

      const feedbackId = `${name}-${Date.now()}`;
      onToolCall?.({ id: feedbackId, name, status: 'running' });

      try {
        // Human-in-the-loop: pause on destructive tools and request approval
        if (onApprovalRequest && APPROVAL_REQUIRED_TOOLS.has(name)) {
          const description = name === 'batchEdit'
            ? `Execute ${(args as { operations?: unknown[] }).operations?.length ?? '?'} batch operations`
            : `Delete element: ${JSON.stringify(args).slice(0, 80)}`;
          const approved = await onApprovalRequest(feedbackId, name, description);
          if (!approved) {
            onToolCall?.({ id: feedbackId, name, status: 'error', summary: 'Rejected by user' });
            toolResponses.push({
              functionResponse: { name, response: { result: JSON.stringify({ rejected: true, message: 'User rejected this operation. Try a different approach.' }) } },
            });
            continue;
          }
        }

        const result = await Promise.resolve(executor.execute(name, args as Record<string, unknown>, pageNumber));
        onToolCall?.({ id: feedbackId, name, status: 'done', summary: result.slice(0, 80) });
        toolResponses.push({
          functionResponse: { name, response: { result } },
        });
      } catch (e) {
        const errResult = JSON.stringify({ error: String(e) });
        onToolCall?.({ id: feedbackId, name, status: 'error', summary: String(e) });
        toolResponses.push({
          functionResponse: { name, response: { result: errResult } },
        });
      }
    }

    conversation.push({ role: 'user', parts: toolResponses });
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Floating Chat — general-purpose multimodal assistant chat
// Supports conversation history with optional image attachments per turn.
// ---------------------------------------------------------------------------
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

export async function chatWithAI(
  history: ChatTurn[],
  canvasContext?: CanvasContext,
  projectContext?: string,
): Promise<string> {
  type Part = { text?: string; inlineData?: { mimeType: string; data: string } };
  type Content = { role: 'user' | 'model'; parts: Part[] };

  // If a canvas page is open, inject it as a silent context exchange before history
  const contextContents: Content[] = canvasContext ? [
    {
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: canvasContext.image } },
        { text: `[CANVAS CONTEXT — page ${canvasContext.pageNumber}]\n${canvasContext.html.slice(0, 2500)}` },
      ],
    },
    {
      role: 'model',
      parts: [{ text: `I can see page ${canvasContext.pageNumber}. Ready to help.` }],
    },
  ] : [];

  const historyContents: Content[] = history
    .filter(t => t.text.trim() || t.imageDataUrl)
    .map(turn => {
      const parts: Part[] = [];
      if (turn.imageDataUrl) {
        const [header, data] = turn.imageDataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
        parts.push({ inlineData: { mimeType, data } });
      }
      if (turn.text.trim()) parts.push({ text: turn.text });
      return {
        role: turn.role === 'ai' ? 'model' : 'user',
        parts: parts.length > 0 ? parts : [{ text: ' ' }],
      };
    });

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [...contextContents, ...historyContents],
    config: {
      systemInstruction:
        'You are an intelligent AI assistant built into an Amharic document OCR extractor. ' +
        'You help users understand, translate, summarize, and work with their scanned documents. ' +
        'When canvas context is provided you can see the current page image and its extracted HTML — ' +
        'use this to answer questions accurately about what the page contains. ' +
        'The app has a Cover Page Generator powered by NanoBanana 2 (Gemini 3.1 Flash Image) that can generate, improve, or create covers from reference images. ' +
        'If users ask about cover pages in chat mode, tell them to switch to Layout mode and say "generate a cover page" or use the Cover Page button in the toolbar menu. ' +
        'Format responses with markdown: **bold**, *italic*, `code`, bullet lists with "- ". ' +
        'Be concise, helpful, and direct. Use paragraph breaks for readability.' +
        (projectContext ? `\n\n${projectContext}` : ''),
    },
  });

  return response.text?.trim() ?? 'No response generated.';
}

// ---------------------------------------------------------------------------
// Cover Page Generator — NanoBanana 2 (gemini-3.1-flash-image-preview)
// Three modes: generate from scratch, improve existing, generate with reference
// ---------------------------------------------------------------------------

export type CoverStyle = 'orthodox' | 'modern' | 'classic' | 'minimalist' | 'ornate';

export type BindingType = 'saddle-stitch' | 'perfect-binding';

/** 'full-design' = AI renders title/author as typography in the image.
 *  'background-only' = text-free background; text added as HTML overlays. */
export type CoverDesignMode = 'full-design' | 'background-only';

/** How to handle existing text when regenerating. */
export type TextRemovalMode = 'keep' | 'remove-all' | 'remove-title' | 'remove-author';

export interface CoverPageOptions {
  title:       string;
  subtitle?:   string;
  author?:     string;
  style:       CoverStyle;
  binding?:    BindingType;
  aspectRatio?: ImageAspectRatio;
  imageSize?:   ImageSize;
  designMode?:  CoverDesignMode;
}

const COVER_STYLE_DESCRIPTIONS: Record<CoverStyle, string> = {
  orthodox:    'Ethiopian Orthodox style with traditional cross patterns, gold and burgundy colors, ornamental Ge\'ez borders, and ecclesiastical motifs',
  modern:      'Clean modern design with bold typography, geometric shapes, subtle gradients, and contemporary layout',
  classic:     'Traditional book cover with elegant serif typography, decorative frames, muted earth tones, and refined borders',
  minimalist:  'Ultra-minimal design with large whitespace, single accent color, simple typography, and restrained composition',
  ornate:      'Richly decorated with intricate Ethiopian manuscript illumination patterns, vibrant colors, and detailed ornamental borders',
};

/** Prompt for background-only (text-free) mode */
function buildCoverBackgroundPrompt(options: CoverPageOptions): string {
  const { style = 'orthodox', binding = 'saddle-stitch' } = options;
  const styleDesc = COVER_STYLE_DESCRIPTIONS[style];

  const sizeNote = binding === 'perfect-binding'
    ? 'The image is for a BOOK COVER SPREAD: back cover (left half) + front cover (right half), landscape orientation. Leave the right half more visually prominent with open areas for text overlay. The left half should be simpler with space for a description blurb.'
    : 'A4 book cover (210mm × 297mm, portrait 3:4). Leave a clear central area (upper third to middle) and a contrasting lower portion where title and author text will be overlaid.';

  return `Generate a FLAT, SIMPLE background image for a book cover. Text will be overlaid separately — this is the background layer only.

PAGE SIZE: ${sizeNote}
DESIGN STYLE: ${styleDesc}

CRITICAL REQUIREMENTS:
- ZERO TEXT: Do NOT include ANY letters, words, numbers, titles, names, glyphs, or characters of ANY script (Latin, Amharic, or otherwise). Not even as subtle overlays or watermarks. The image must be 100% text-free.
- FLAT design — no 3D objects, no depth illusions, no perspective geometry.
- NO diagonal lines, NO sharp geometric shards, NO origami/polygon shapes.
- NO technological elements — no circuit boards, microchips, wires, sci-fi motifs.
- Use SIMPLE, CALM visual elements: soft gradients, watercolor washes, subtle organic patterns, or broad color fields.
- Leave large open calm areas with good contrast for text overlay.
- Fill the entire canvas edge to edge. No white margins.
- Output a single image — no mockup, no collage, no variants.`;
}

/** Prompt for full AI design mode — typography baked into the image */
function buildFullAICoverPrompt(options: CoverPageOptions): string {
  const { style = 'orthodox', binding = 'saddle-stitch', title, subtitle, author } = options;
  const styleDesc = COVER_STYLE_DESCRIPTIONS[style];

  const textLines = [
    `TITLE: "${title}"`,
    subtitle ? `SUBTITLE: "${subtitle}"` : '',
    author   ? `AUTHOR: "${author}"` : '',
  ].filter(Boolean).join('\n');

  const sizeNote = binding === 'perfect-binding'
    ? 'Landscape book cover spread (16:9). Left half = back cover (simpler, space for blurb). Right half = front cover (main design + title). Narrow center = spine with vertical title.'
    : 'A4 portrait book cover (3:4, 210mm × 297mm). Full front cover — title prominent in upper/central area, author name near bottom.';

  return `Design a COMPLETE, professional book cover. The title and author name must be beautifully rendered as elegant typography directly in the image.

BOOK DETAILS:
${textLines}

COVER SIZE: ${sizeNote}
DESIGN STYLE: ${styleDesc}

REQUIREMENTS:
- The title${author ? ' and author name' : ''} MUST appear in the image as artistic, legible typography — this is the final cover design.
- For Amharic/Ethiopic text: use traditional Ethiopic calligraphic letterforms, graceful and ornate.
- For Latin text: use elegant serif or display typeface appropriate to the style.
- Typography should be an INTEGRAL part of the design, not an afterthought.
- FLAT design — no 3D objects, no depth illusions, no perspective geometry.
- NO technological elements — no circuit boards, microchips, wires, sci-fi motifs.
- Use SIMPLE, CALM visual elements: soft gradients, watercolor washes, organic textures, subtle cultural patterns.
- The design must feel ELEGANT and PRINT-READY.
- Fill the entire canvas edge to edge. No white margins.
- Output a single final cover image — no mockups, no variants.`;
}

/**
 * Generate a cover image using NanoBanana 2.
 * - designMode 'full-design' (default): AI renders title/author as typography in the image.
 * - designMode 'background-only': text-free background; text will be added as HTML overlays.
 */
export async function generateCoverBackground(options: CoverPageOptions): Promise<string> {
  const defaultRatio = options.binding === 'perfect-binding' ? '16:9' : '3:4';
  const prompt = (options.designMode ?? 'full-design') === 'full-design'
    ? buildFullAICoverPrompt(options)
    : buildCoverBackgroundPrompt(options);
  const response = await client.models.generateContent({
    model: NANOBANANA2,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: options.aspectRatio ?? defaultRatio,
        imageSize:   options.imageSize   ?? '2K',
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('Cover background generation returned no image');
}

/**
 * Improve an existing cover background using NanoBanana 2.
 * Pass the current background as a data URL + improvement instructions.
 */
export async function improveCoverBackground(
  existingBgDataUrl: string,
  instruction: string,
  options?: Pick<CoverPageOptions, 'aspectRatio' | 'imageSize'>,
  textMode: TextRemovalMode = 'keep',
): Promise<string> {
  const [header, data] = existingBgDataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';

  const textInstruction =
    textMode === 'remove-all'    ? 'REMOVE ALL TEXT from the image — strip every letter, word, title, author name, number, or glyph of any script. Output a completely text-free decorative background.'
    : textMode === 'remove-title' ? 'REMOVE ONLY the main title / heading text. Keep the author name and any other text elements. Preserve all decorative elements.'
    : textMode === 'remove-author'? 'REMOVE ONLY the author name text. Keep the title and any other text elements. Preserve all decorative elements.'
    : 'Keep all existing text exactly as-is — do NOT move, restyle, or remove any text.';

  const improvePart = instruction.trim()
    ? `Also apply these visual improvements: ${instruction}`
    : 'Improve the overall design quality, colors, and visual composition.';

  const response = await client.models.generateContent({
    model: NANOBANANA2,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data } },
        { text: `This is a book cover image. Follow these instructions precisely:

TEXT HANDLING: ${textInstruction}

DESIGN IMPROVEMENTS: ${improvePart}

Output the modified cover image.` },
      ],
    }],
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: options?.aspectRatio ?? '3:4',
        imageSize:   options?.imageSize   ?? '2K',
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('Cover background improvement returned no image');
}

/**
 * Generate a cover background using a reference image for style inspiration.
 */
export async function generateCoverBackgroundFromReference(
  referenceDataUrl: string,
  options: CoverPageOptions,
): Promise<string> {
  const [header, data] = referenceDataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const defaultRatio = options.binding === 'perfect-binding' ? '16:9' : '3:4';

  const response = await client.models.generateContent({
    model: NANOBANANA2,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data } },
        { text: `Use this image as a STYLE REFERENCE for the design aesthetic, color palette, and composition.\n\nNow create a NEW, ORIGINAL book cover BACKGROUND (not a copy) inspired by this style:\n\n${buildCoverBackgroundPrompt(options)}\n\nDo NOT reproduce the reference image — use it only for stylistic inspiration. Output ONLY the decorative background — absolutely NO text.` },
      ],
    }],
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: options.aspectRatio ?? defaultRatio,
        imageSize:   options.imageSize   ?? '2K',
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('Cover background generation from reference returned no image');
}

/**
 * Build editable cover HTML from a background image URL and text options.
 *
 * - Saddle stitch: Single A4 portrait front cover — background fills the page, text overlaid.
 * - Perfect binding: Landscape spread — back cover (left) + spine strip + front cover (right).
 *   The background image spans the full spread; spine is an overlay strip in the centre.
 */
export function buildEditableCoverHTML(
  bgDataUrl: string,
  options: CoverPageOptions,
  noOverlay = false,
): string {
  const { title, subtitle, author, binding = 'saddle-stitch' } = options;

  const ts = '0 2px 8px rgba(0,0,0,0.7), 0 0 2px rgba(0,0,0,0.5)';
  const font = "'Noto Serif Ethiopic','Noto Sans Ethiopic',serif";

  // Full AI design: image already contains typography — use <img> for reliable PDF export
  if (noOverlay || (options.designMode ?? 'full-design') === 'full-design') {
    if (binding === 'perfect-binding') {
      return `<div style="position:relative;width:420mm;height:297mm;overflow:hidden;padding:0;margin:0;box-sizing:border-box;"><img src="${bgDataUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:top center;display:block;" /></div>`;
    }
    return `<div style="position:relative;width:210mm;height:297mm;overflow:hidden;padding:0;margin:0 auto;box-sizing:border-box;"><img src="${bgDataUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:top center;display:block;" /></div>`;
  }

  if (binding === 'perfect-binding') {
    // ── Perfect binding: landscape spread  ─────────────────────────────
    return `<div style="position:relative;width:420mm;height:297mm;overflow:hidden;padding:0;margin:0;box-sizing:border-box;">
  <img src="${bgDataUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:top center;display:block;" />
  <!-- dark overlay for text contrast -->
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,0.35) 0%,rgba(0,0,0,0.12) 30%,rgba(0,0,0,0.05) 45%,rgba(0,0,0,0.05) 55%,rgba(0,0,0,0.12) 70%,rgba(0,0,0,0.35) 100%);pointer-events:none;"></div>
  <!-- spine strip -->
  <div style="position:absolute;top:0;bottom:0;left:50%;transform:translateX(-50%);width:18mm;background:linear-gradient(180deg,rgba(20,8,8,0.92) 0%,rgba(60,20,20,0.88) 50%,rgba(20,8,8,0.92) 100%);display:flex;align-items:center;justify-content:center;border-left:1px solid rgba(255,255,255,0.08);border-right:1px solid rgba(255,255,255,0.08);z-index:2;">
    <div contenteditable="true" style="writing-mode:vertical-rl;transform:rotate(180deg);font-family:${font};font-size:0.65rem;font-weight:700;color:#d4a574;letter-spacing:0.15em;white-space:nowrap;padding:1rem 0;text-shadow:0 1px 3px rgba(0,0,0,0.5);">${title || 'Book Title'}</div>
  </div>
  <!-- Back cover text (left half) -->
  <div contenteditable="true" style="position:absolute;top:50%;left:12%;transform:translateY(-50%);width:30%;text-align:center;font-family:${font};font-size:0.8rem;font-weight:400;color:#e0d5c5;line-height:1.7;text-shadow:0 1px 4px rgba(0,0,0,0.6);z-index:1;">${subtitle || 'Back cover description or summary text.'}</div>
  <!-- Front cover: title (right half) -->
  <div contenteditable="true" style="position:absolute;top:18%;right:5%;width:38%;text-align:center;font-family:${font};font-size:1.8rem;font-weight:900;color:#ffffff;text-shadow:${ts};line-height:1.3;letter-spacing:0.02em;z-index:1;">${title || 'Book Title'}</div>
  ${subtitle ? `<div contenteditable="true" style="position:absolute;top:40%;right:8%;width:32%;text-align:center;font-family:${font};font-size:0.95rem;font-weight:600;color:#e8d5b7;text-shadow:${ts};line-height:1.4;letter-spacing:0.05em;z-index:1;">${subtitle}</div>` : ''}
  ${author ? `<div contenteditable="true" style="position:absolute;bottom:10%;right:10%;width:28%;text-align:center;font-family:${font};font-size:0.85rem;font-weight:600;color:#d4a574;text-shadow:${ts};letter-spacing:0.08em;z-index:1;">${author}</div>` : ''}
</div>`;
  }

  // ── Saddle stitch: A4 portrait front cover (background-only mode) ────
  return `<div style="position:relative;width:210mm;height:297mm;overflow:hidden;padding:0;margin:0 auto;box-sizing:border-box;">
  <img src="${bgDataUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:top center;display:block;" />
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.3) 0%,rgba(0,0,0,0.08) 35%,rgba(0,0,0,0.08) 65%,rgba(0,0,0,0.35) 100%);pointer-events:none;z-index:1;"></div>
  <div contenteditable="true" style="position:absolute;top:20%;left:50%;transform:translateX(-50%);text-align:center;font-family:${font};font-size:2.2rem;font-weight:900;color:#ffffff;text-shadow:${ts};max-width:80%;line-height:1.3;letter-spacing:0.02em;z-index:2;">${title || 'Book Title'}</div>
  ${subtitle ? `<div contenteditable="true" style="position:absolute;top:40%;left:50%;transform:translateX(-50%);text-align:center;font-family:${font};font-size:1.15rem;font-weight:600;color:#e8d5b7;text-shadow:${ts};max-width:70%;line-height:1.4;letter-spacing:0.05em;z-index:2;">${subtitle}</div>` : ''}
  ${author ? `<div contenteditable="true" style="position:absolute;bottom:10%;left:50%;transform:translateX(-50%);text-align:center;font-family:${font};font-size:1rem;font-weight:600;color:#d4a574;text-shadow:${ts};max-width:70%;letter-spacing:0.08em;z-index:2;">${author}</div>` : ''}
</div>`;
}

// ---------------------------------------------------------------------------
// Back Cover Generator
// ---------------------------------------------------------------------------

/**
 * Generate a back cover using the front cover image as style reference.
 * Produces a complementary A4 portrait image suitable for the back of the book.
 */
export async function generateBackCover(
  frontCoverBgDataUrl: string,
  options: Pick<CoverPageOptions, 'title' | 'subtitle' | 'author' | 'style' | 'designMode'>,
): Promise<string> {
  const [header, data] = frontCoverBgDataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const isFullDesign = (options.designMode ?? 'full-design') === 'full-design';

  const textSection = isFullDesign
    ? `BACK COVER TEXT TO INCLUDE:
- Book title: "${options.title}"
${options.author ? `- Author: "${options.author}"` : ''}
${options.subtitle ? `- Brief description area (back cover blurb space)` : ''}
- Optional: a simple barcode/ISBN placeholder area at the bottom`
    : 'ZERO TEXT — this is a background-only image, no letters or characters.';

  const prompt = `This is the FRONT COVER of a book. Design a matching BACK COVER.

The back cover must:
- Use the SAME visual style, color palette, textures, and design language as the front cover
- Be A4 portrait orientation (210mm × 297mm, 3:4 ratio)
- Feel like it belongs to the same book — complementary but not identical
- Have a slightly simpler composition than the front cover
- Leave space in the center for a back-cover description blurb

${textSection}

REQUIREMENTS:
- FLAT design — no 3D objects, no depth illusions
- NO technological elements
- Same style as the front: ${COVER_STYLE_DESCRIPTIONS[options.style ?? 'orthodox']}
- Fill the entire canvas edge to edge
- Output a single back cover image`;

  const response = await client.models.generateContent({
    model: NANOBANANA2,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data } },
        { text: prompt },
      ],
    }],
    config: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: { aspectRatio: '3:4', imageSize: '2K' },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('Back cover generation returned no image');
}

/** Build the HTML wrapper for a back cover image (same structure as front). */
export function buildBackCoverHTML(bgDataUrl: string): string {
  return `<div style="position:relative;width:210mm;height:297mm;overflow:hidden;padding:0;margin:0 auto;box-sizing:border-box;"><img src="${bgDataUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:top center;display:block;" /></div>`;
}
