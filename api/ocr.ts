import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_auth';
import { sql } from './_db';
import {
  decideGuestGate,
  guestIdentity,
  guestLimitMessage,
  hashIp,
  type GuestGateDecision,
} from './_guestLimit';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const OCR_FAST = 'gemini-3.1-flash-image-preview';

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

function buildOcrPrompt(): string {
  return `You are an expert multilingual OCR engine that works with any document type (books, newspapers, forms, academic papers, religious texts, manuals, etc.).

TASK: Extract ALL text from this page image with 100% accuracy.

CRITICAL — AMHARIC / ETHIOPIC (\u134A\u12F0\u120D) TEXT RULES:
- NEVER substitute, correct, modernize, or "fix" any Amharic word. Output EXACTLY what is printed.
- Visually similar Ethiopic characters MUST be distinguished carefully:
  \u1200 \u2260 \u1210 \u2260 \u1240  |  \u1230 \u2260 \u1220  |  \u1338 \u2260 \u1340  |  \u12A0 \u2260 \u12D0
- Preserve ALL Ethiopic punctuation exactly: \u1362 (full stop) \u1363 (comma) \u1364 (semicolon) \u1361 (wordspace) :: (old-style full stop)
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

function buildLayoutPrompt(extractedText: string, prevHTML?: string): string {
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

    // ── Pass 1: OCR raw text extraction ──
    const pass1Response = await ai.models.generateContent({
      model: OCR_FAST,
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildOcrPrompt() },
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          ],
        },
      ],
    });

    const rawText = pass1Response.text ?? '';

    if (!rawText.trim()) {
      return res.json({ html: '<p style="color:#999;text-align:center;">No text detected on this page.</p>' });
    }

    // ── Pass 2: Layout reconstruction ──
    const pass2Response = await ai.models.generateContent({
      model: OCR_FAST,
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildLayoutPrompt(rawText, previousPageHTML) },
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          ],
        },
      ],
    });

    const layoutHtml = pass2Response.text ?? '';
    const verified = verifyLayout(layoutHtml);

    return res.json({ html: verified, rawText });
  } catch (err: unknown) {
    console.error('ocr error:', err);
    return res.status(500).json({ error: 'OCR processing failed' });
  }
}
