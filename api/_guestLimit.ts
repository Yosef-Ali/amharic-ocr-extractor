import { createHash } from 'node:crypto';

// ── Guest rate limiting ─────────────────────────────────────────────────────
// Unauthenticated visitors may run the OCR pipeline without an account (the
// "Try as Guest" wedge), but usage is capped to protect the Gemini API quota.
// A "conversion" = one uploaded document, identified by a client-generated
// conversionId shared across all pages of that document — so a 10-page PDF
// still counts as a single conversion. Signed-in users bypass this entirely
// (their per-account document quota applies instead).
//
// Two tiers, because IP alone is the wrong unit of identity for this audience:
// much of Ethiopia reaches the internet through carrier-grade NAT, and churches,
// universities and internet cafés put many people behind one address. Capping
// per IP would let the first visitor lock out everyone else on their network.
//
//   • per browser (X-Guest-Id, localStorage) — the real per-person limit.
//   • per IP                                 — a much looser ceiling that only
//     trips on genuine scripted abuse, sized so a busy shared network never
//     reaches it through ordinary human use.
//
// The browser id is client-controlled and can be cleared, so it is not a
// security boundary on its own; the IP ceiling is what bounds the damage from
// someone rotating ids. Neither is meant to be airtight — the goal is to keep a
// demo affordable, and signing in is always the unrestricted path.

export const GUEST_CONVERSIONS_PER_HOUR = 3;
export const GUEST_IP_CONVERSIONS_PER_HOUR = 30;

export type GuestLimitScope = 'browser' | 'network';

/** Aggregate row returned by the usage query in `ocr.ts`. */
export interface GuestUsageRow {
  seen?: boolean | null;
  browser_n?: number | null;
  network_n?: number | null;
  browser_mins?: number | null;
  network_mins?: number | null;
}

export type GuestGateDecision =
  | { outcome: 'allow' }
  | { outcome: 'record' }
  | { outcome: 'block'; scope: GuestLimitScope; retryAfterMinutes: number };

/**
 * Hash the client IP before storing it. The usage table only needs to answer
 * "how much has this address done in the last hour", which a hash answers just
 * as well as the address itself — so there is no reason to keep raw IPs on
 * disk. Set GUEST_IP_SALT in the environment to make the hashes non-enumerable
 * (the IPv4 space is small enough to brute-force an unsalted digest).
 */
export function hashIp(ip: string): string {
  return createHash('sha256')
    .update(`${process.env.GUEST_IP_SALT ?? ''}:${ip}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Choose the per-request guest identity. Prefer the per-browser id so that
 * everyone behind a shared address gets their own allowance. A caller that
 * sends none (a script, typically) falls back to its address and so gets the
 * strict per-person limit rather than the loose network one.
 */
export function guestIdentity(guestId: string | undefined, ipHash: string): string {
  const trimmed = guestId?.slice(0, 64).trim();
  return trimmed ? `g:${trimmed}` : `ip:${ipHash}`;
}

/** Pure decision over the usage counts — no I/O, so it is directly testable. */
export function decideGuestGate(row: GuestUsageRow | undefined): GuestGateDecision {
  // Same document, more pages → already counted, let it through.
  if (row?.seen) return { outcome: 'allow' };

  if ((row?.browser_n ?? 0) >= GUEST_CONVERSIONS_PER_HOUR) {
    return {
      outcome: 'block',
      scope: 'browser',
      retryAfterMinutes: clampMinutes(row?.browser_mins),
    };
  }

  if ((row?.network_n ?? 0) >= GUEST_IP_CONVERSIONS_PER_HOUR) {
    return {
      outcome: 'block',
      scope: 'network',
      retryAfterMinutes: clampMinutes(row?.network_mins),
    };
  }

  return { outcome: 'record' };
}

/** Never promise "try again in 0 minutes", and never more than the window. */
function clampMinutes(mins: number | null | undefined): number {
  if (typeof mins !== 'number' || !Number.isFinite(mins)) return 60;
  return Math.min(60, Math.max(1, Math.ceil(mins)));
}

export function guestLimitMessage(scope: GuestLimitScope, mins: number): string {
  const minsStr = `${mins} minute${mins === 1 ? '' : 's'}`;
  return scope === 'network'
    ? `This network has reached the shared guest limit. Sign in to keep going right away, or try again in about ${minsStr}.`
    : `Guest limit reached — ${GUEST_CONVERSIONS_PER_HOUR} documents per hour. Sign in for unlimited conversions, or try again in about ${minsStr}.`;
}
