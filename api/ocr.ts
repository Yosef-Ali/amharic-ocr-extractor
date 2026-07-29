import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_auth.js';
import { sql } from './_db.js';
import {
  decideGuestGate,
  guestIdentity,
  guestLimitMessage,
  hashIp,
  type GuestGateDecision,
} from './_guestLimit.js';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

// GA release of the model this route was pinned to. The `-preview` alias is
// retired, and GA carries better free-tier quota. This is the constant that
// actually serves OCR — the one in src/services/geminiService.ts no longer does.
const OCR_FAST = 'gemini-3.1-flash-image';

// Caps, identity selection and the block/allow decision live in ./_guestLimit
// (no DB imports there, so the decision logic is unit-testable). This file owns
// the storage: schema, the usage query, and recording each conversion.

let guestSchemaReady = false;

async function ensureGuestSchema(): Promise<void> {
  if (guestSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS guest_ocr_usage (
      id            BIGSERIAL PRIMARY KEY,
      identity      TEXT NOT NULL,
      conversion_id TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Added after the initial single-tier version shipped — existing deployments
  // pick the column up here rather than needing a separate migration step.
  await sql`ALTER TABLE guest_ocr_usage ADD COLUMN IF NOT EXISTS ip_hash TEXT`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_guest_ocr_identity_time
      ON guest_ocr_usage (identity, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_guest_ocr_iphash_time
      ON guest_ocr_usage (ip_hash, created_at DESC)
  `;
  guestSchemaReady = true;
}

/** Best-effort client IP from the proxy chain (first hop = original client). */
function clientIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : (xff ?? '').split(',')[0];
  return first.trim() || req.socket?.remoteAddress || 'unknown';
}

/**
 * Enforce the guest conversion caps for one OCR request. Records the conversion
 * on first sight; repeat pages of the same document do not re-count. Fails open
 * (allows the request) if the datastore is unreachable — availability of the
 * demo is more important than a perfectly strict cap.
 */
async function checkGuestRateLimit(
  guestKey: string,
  ipHash: string,
  conversionId: string,
): Promise<GuestGateDecision> {
  try {
    await ensureGuestSchema();

    // One round trip for everything: whether this document was already counted,
    // both tier counts, and how long until each tier's oldest entry ages out.
    // Minutes are computed in SQL so the answer doesn't depend on clock skew.
    const [row] = await sql`
      SELECT
        BOOL_OR(identity = ${guestKey} AND conversion_id = ${conversionId}) AS seen,
        COUNT(DISTINCT conversion_id) FILTER (WHERE identity = ${guestKey})::int AS browser_n,
        COUNT(DISTINCT conversion_id) FILTER (WHERE ip_hash  = ${ipHash})::int   AS network_n,
        CEIL(EXTRACT(EPOCH FROM (
          MIN(created_at) FILTER (WHERE identity = ${guestKey}) + INTERVAL '1 hour' - NOW()
        )) / 60)::int AS browser_mins,
        CEIL(EXTRACT(EPOCH FROM (
          MIN(created_at) FILTER (WHERE ip_hash = ${ipHash}) + INTERVAL '1 hour' - NOW()
        )) / 60)::int AS network_mins
      FROM guest_ocr_usage
      WHERE created_at > NOW() - INTERVAL '1 hour'
        AND (identity = ${guestKey} OR ip_hash = ${ipHash})
    `;

    const decision = decideGuestGate(row);
    if (decision.outcome !== 'record') return decision;

    await sql`
      INSERT INTO guest_ocr_usage (identity, conversion_id, ip_hash)
      VALUES (${guestKey}, ${conversionId}, ${ipHash})
    `;

    // Nothing older than the window is ever read, so sweep occasionally rather
    // than letting the table grow without bound.
    if (Math.random() < 0.02) {
      await sql`DELETE FROM guest_ocr_usage WHERE created_at < NOW() - INTERVAL '2 hours'`;
    }

    return { outcome: 'record' };
  } catch (err) {
    console.error('guest rate-limit check failed (failing open):', err);
    return { outcome: 'allow' };
  }
}

// ── Inlined prompts from src/services/aiCommon.ts ───────────────────────────

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
    .trim();

  if (!cleaned.startsWith('<')) {
    cleaned = `<p style="line-height: 1.8; text-align: justify;">${cleaned}</p>`;
  }

  return cleaned;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { base64Image, previousPageHTML, conversionId } = req.body as {
    base64Image: string;
    previousPageHTML?: string;
    conversionId?: string;
  };

  // Guests (no auth token) may use the OCR pipeline, but are rate-limited to
  // GUEST_CONVERSIONS_PER_HOUR distinct documents per IP. Signed-in users skip this.
  const user = await getAuthUser(req);
  if (!user) {
    const guestId  = req.headers['x-guest-id'] as string | undefined;
    const ipHash   = hashIp(clientIp(req));
    const guestKey = guestIdentity(guestId, ipHash);
    const conv     = (conversionId || guestId || 'anon').slice(0, 128);

    const gate = await checkGuestRateLimit(guestKey, ipHash, conv);
    if (gate.outcome === 'block') {
      res.setHeader('Retry-After', String(gate.retryAfterMinutes * 60));
      return res.status(429).json({
        error: 'GUEST_RATE_LIMIT',
        scope: gate.scope,
        message: guestLimitMessage(gate.scope, gate.retryAfterMinutes),
        retryAfterMinutes: gate.retryAfterMinutes,
      });
    }
  }

  try {
    if (!base64Image) {
      return res.status(400).json({ error: 'Missing base64Image' });
    }

    // Reject oversized payloads (~7.5MB decoded) to prevent memory exhaustion
    if (base64Image.length > 10_000_000) {
      return res.status(413).json({ error: 'Image too large' });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const ai = new GoogleGenAI({ apiKey });

    // ── Single pass: transcription and layout together ──
    // Previously two calls. One call per page doubles the pages a rate-limited
    // key gets through, which is the binding constraint on long books.
    const response = await ai.models.generateContent({
      model: OCR_FAST,
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildCombinedPrompt(previousPageHTML) },
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          ],
        },
      ],
    });

    const layoutHtml = response.text ?? '';

    if (!layoutHtml.trim()) {
      return res.json({ html: '<p style="color:#999;text-align:center;">No text detected on this page.</p>' });
    }

    const verified = verifyLayout(layoutHtml);

    // rawText is part of the response contract; derive it from the HTML now
    // that there is no separate transcription step producing it.
    const rawText = htmlToText(verified);

    return res.json({ html: verified, rawText });
  } catch (err: unknown) {
    console.error('ocr error:', err);

    // Gemini rate limits were previously collapsed into a generic 500. The
    // client could not tell them apart from a real failure, so it fell back to
    // calling Gemini directly from the browser — doubling the request rate at
    // exactly the moment we were already over quota. Surface them as 429 with
    // Retry-After so the client can back off and retry properly.
    if (isUpstreamRateLimit(err)) {
      const retryAfterSeconds = extractRetryAfterSeconds(err) ?? 60;
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'UPSTREAM_RATE_LIMIT',
        message:
          'The AI service is busy right now. Extraction will resume automatically — ' +
          'long documents on the free tier may need a few pauses.',
        retryAfterSeconds,
      });
    }

    return res.status(500).json({ error: 'OCR processing failed' });
  }
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

/** Does this error represent an upstream quota/rate-limit rejection? */
function isUpstreamRateLimit(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string };
  if (e?.status === 429 || e?.code === 429) return true;
  const msg = (e?.message ?? '').toLowerCase();
  return msg.includes('429')
    || msg.includes('resource_exhausted')
    || msg.includes('rate limit')
    || msg.includes('quota');
}

/**
 * Gemini reports its cooldown as a RetryInfo duration such as "retryDelay":"37s".
 * Pull it out when present so we wait exactly as long as asked rather than guessing.
 */
function extractRetryAfterSeconds(err: unknown): number | null {
  const msg = (err as { message?: string })?.message ?? '';
  const m = msg.match(/"?retry-?delay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i);
  if (!m) return null;
  const secs = Math.ceil(parseFloat(m[1]));
  return Number.isFinite(secs) && secs > 0 ? Math.min(secs, 300) : null;
}
