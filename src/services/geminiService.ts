import { GoogleGenAI } from '@google/genai';

const OCR_MODEL       = 'gemini-3.1-flash-image-preview'; // Nano Banana 2 – OCR & fast image edit
const IMAGE_PRO_MODEL = 'gemini-3-pro-image-preview';     // Nano Banana Pro – high-quality

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

let client = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
});

/** Call this after the user connects a Pro Key so the client picks up new credentials */
export function reinitializeClient() {
  client = new GoogleGenAI({
    apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  });
}

// ---------------------------------------------------------------------------
// Pass 1 — OCR: extract raw text from the page image
// ---------------------------------------------------------------------------
function buildOcrPrompt(): string {
  return `You are an expert multilingual OCR engine that works with any document type (books, newspapers, forms, academic papers, religious texts, manuals, etc.).

TASK: Extract ALL text from this page image with 100% accuracy.

RULES:
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

STRICT OUTPUT RULES:
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

<div class="ai-image-placeholder" data-description="[brief English description]">
  <span class="ai-ph-icon">📷</span>
  <p class="ai-ph-label">[same description]</p>
</div>

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
    model: OCR_MODEL,
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

  // ── Pass 1: OCR — extract raw text ──
  const ocrResponse = await client.models.generateContent({
    model: OCR_MODEL,
    contents: [{ role: 'user', parts: [imagePart, { text: buildOcrPrompt() }] }],
  });

  const extractedText = ocrResponse.text ?? '';
  if (!extractedText.trim()) {
    return '<p style="color:red;text-align:center;font-weight:bold;">⚠️ OCR returned no text for this page.</p>';
  }

  // ── Pass 2: Layout — reconstruct HTML from text + image reference ──
  const layoutResponse = await client.models.generateContent({
    model: OCR_MODEL,
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
// Uses OCR_MODEL (fast) or IMAGE_PRO_MODEL (pro quality).
// ---------------------------------------------------------------------------
export async function restoreImage(
  cropDataUrl: string,
  quality: ImageQuality = 'fast',
): Promise<string> {
  const model = quality === 'pro' ? IMAGE_PRO_MODEL : OCR_MODEL;
  const [header, data] = cropDataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';

  const response = await client.models.generateContent({
    model,
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
    model: OCR_MODEL,
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
    model: OCR_MODEL,
    contents: [...contextContents, ...historyContents],
    config: {
      systemInstruction:
        'You are an intelligent AI assistant built into an Amharic document OCR extractor. ' +
        'You help users understand, translate, summarize, and work with their scanned documents. ' +
        'When canvas context is provided you can see the current page image and its extracted HTML — ' +
        'use this to answer questions accurately about what the page contains. ' +
        'Format responses with markdown: **bold**, *italic*, `code`, bullet lists with "- ". ' +
        'Be concise, helpful, and direct. Use paragraph breaks for readability.',
    },
  });

  return response.text?.trim() ?? 'No response generated.';
}
