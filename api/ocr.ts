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
import { buildCombinedPrompt, htmlToText, redactKeys, isKeyRejected } from './_ocrPrompt.js';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

/**
 * OCR model. This is the constant that actually serves extraction — the one in
 * src/services/geminiService.ts no longer does.
 *
 * Pinned back to the `-preview` alias deliberately. The GA release
 * `gemini-3.1-flash-image` is the documented current name, but it returns 429
 * immediately and indefinitely on a free key — including on a user's own fresh
 * key, and after a 30-minute idle period, with a flat ~60s retryDelay that never
 * shrinks. That is the signature of no free-tier allowance at all, not a busy
 * window. The preview alias does have free quota and demonstrably extracts.
 *
 * Overridable via OCR_MODEL so this can be re-tested, or moved to GA the moment
 * a paid key makes GA's quota available, without a code change.
 */
const OCR_FAST = process.env.OCR_MODEL || 'gemini-3.1-flash-image-preview';

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

  // ── Bring-your-own-key ────────────────────────────────────────────────────
  // A user-supplied key is used for this request only: never stored, never
  // logged, never written to the database. It is read from a header rather than
  // the body so it cannot be captured by anything that logs request payloads.
  const rawUserKey = req.headers['x-user-gemini-key'];
  const userKey = (Array.isArray(rawUserKey) ? rawUserKey[0] : rawUserKey)?.trim();
  // Shape check only — the API is the real authority on validity.
  const hasUserKey = !!userKey && userKey.length >= 20 && userKey.length <= 200;

  // Guests (no auth token) are capped per browser and per network. That cap
  // exists to protect the project's quota, so it does not apply to someone
  // spending their own — they are limited by their own key instead.
  const user = await getAuthUser(req);
  if (!user && !hasUserKey) {
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

    // Prefer the user's key so their extraction runs on their own quota.
    const apiKey = (hasUserKey ? userKey : undefined)
      || process.env.GEMINI_API_KEY
      || process.env.VITE_GEMINI_API_KEY;
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
    // Redact before logging: SDK errors can echo the key back in a URL or
    // message, and a user's own key must never reach the server logs.
    console.error('ocr error:', redactKeys(String((err as Error)?.message ?? err)));

    // A user-supplied key that the API rejects is the user's problem to fix,
    // and must not read as a fault in the app.
    if (hasUserKey && isKeyRejected(err)) {
      return res.status(400).json({
        error: 'USER_KEY_REJECTED',
        message: 'Google rejected the API key you added. Check it was copied in full and that the Generative Language API is enabled for it.',
      });
    }

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
        message: hasUserKey
          ? 'Your API key has hit its rate limit. Extraction will resume automatically — ' +
            'free Google keys allow only a few requests per minute.'
          : 'The AI service is busy right now. Extraction will resume automatically — ' +
            'adding your own API key in Settings gives you your own quota.',
        retryAfterSeconds,
      });
    }

    return res.status(500).json({ error: 'OCR processing failed' });
  }
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
