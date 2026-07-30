/**
 * Pure OCR prompt + text helpers.
 *
 * Deliberately free of any database or SDK import so it can be unit tested
 * directly. api/_db.ts throws at module load when DATABASE_URL is unset, so a
 * test that reaches it through api/ocr.ts passes locally (Vitest loads .env)
 * and fails in CI, which has no .env. Same reasoning as _guestLimit.ts.
 */

/**
 * Single-call OCR + layout.
 *
 * This replaces a two-call pipeline (transcribe, then lay out). On a free-tier
 * key limited to a handful of requests per minute, halving the calls per page
 * doubles how much of a book gets through — that quota, not model quality, is
 * what stops long documents.
 *
 * The fidel rules below are copied verbatim from the transcription prompt and
 * are stated FIRST, because the risk of merging is that the model optimises for
 * tidy layout at the expense of exact characters. Layout is explicitly demoted
 * to secondary throughout.
 */
export function buildCombinedPrompt(prevHTML?: string): string {
  return `You are an expert OCR engine and document layout reconstructor for Amharic (Ge'ez) documents.

You will do two things in ONE response: read every character on the page exactly, and express it as HTML that mirrors the page's layout.

PRIORITY ORDER — THIS MATTERS:
1. Character-exact transcription. This is the whole purpose of the task.
2. Layout fidelity. Secondary.
Never alter, drop, normalise or reorder a single character in order to make the layout tidier. If the two goals ever conflict, transcription wins.

CRITICAL — AMHARIC / ETHIOPIC (ፊደል) TEXT RULES:
- NEVER substitute, correct, modernize, or "fix" any Amharic word. Output EXACTLY what is printed.
- Visually similar Ethiopic characters MUST be distinguished carefully:
  ሀ ≠ ሐ ≠ ቀ  |  ሰ ≠ ሠ  |  ጸ ≠ ፀ  |  አ ≠ ዐ
- Preserve ALL Ethiopic punctuation exactly: ። (full stop) ፣ (comma) ፤ (semicolon) ፡ (wordspace) :: (old-style full stop)
- Church/religious texts use archaic forms — do NOT replace them with modern equivalents.
- If a word is unclear, output your best character-level reading — NEVER skip or paraphrase it.
- Mixed Amharic + English/numbers: keep both scripts exactly as printed, in the correct reading order.
- Do NOT translate, interpret, or add commentary.
- Every word visible on the page must appear in the HTML. Do not summarise.

OUTPUT FORMAT:
- Raw HTML only. Zero markdown, zero code fences. Begin with the first HTML element.
- All styling inline.

LAYOUT RULES:
- Reading order must follow the page. For multi-column pages wrap the columns in:
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;">
- Headers and titles: <h2 style="text-align:center;font-weight:900;font-size:1.2rem;">
- Body paragraphs: <p style="line-height:1.75;text-align:justify;">
- A line enclosed by a rectangle drawn on ALL FOUR sides:
  <div style="border:1px solid #333;padding:0.5rem;margin:0.5rem 0;">
  Do not do this for text that is merely coloured or emphasised.

IMAGES — photographs, illustrations, drawings, charts:
Emit a placeholder at the exact reading position where the graphic appears:
  <div class="ai-image-placeholder" data-description="<brief English description>" data-bbox="x1,y1,x2,y2"></div>
where x1,y1 is the top-left and x2,y2 the bottom-right of a tight box around the
graphic, each expressed as a percentage (0-100) of the full page. Be accurate —
these coordinates are used to crop the real image out of the scan.
${prevHTML ? `\nPREVIOUS PAGE HTML (match its styling for consistency):\n${prevHTML.slice(0, 1000)}\n` : ''}
Now output the HTML for this page:`.trim();
}

/**
 * Strip anything key-shaped out of a string before it is logged.
 *
 * Users can supply their own API key, and SDK errors sometimes echo the key
 * back inside a URL or message. Logging that verbatim would put a user's
 * credential into the server logs.
 */
export function redactKeys(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, 'AIza…[redacted]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[redacted]');
}

/** True when the API rejected the credential itself, rather than rate limiting. */
export function isKeyRejected(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string };
  if (e?.status === 401 || e?.status === 403 || e?.code === 401 || e?.code === 403) return true;
  const msg = (e?.message ?? '').toLowerCase();
  return msg.includes('api_key_invalid')
    || msg.includes('api key not valid')
    || msg.includes('api key expired')
    || msg.includes('permission_denied')
    || msg.includes('unauthenticated');
}

/**
 * Plain text from the generated HTML, for the `rawText` field of the response.
 * Runs server-side where there is no DOMParser, so it strips tags directly.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
