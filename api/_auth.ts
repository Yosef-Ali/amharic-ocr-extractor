import type { VercelRequest } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AuthUser {
  userId: string;
  email?: string;
}

// Lazily created JWKS fetcher — cached across warm lambda invocations.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  const authUrl = process.env.NEON_AUTH_URL || process.env.VITE_NEON_AUTH_URL;
  if (!authUrl) return null;
  if (!_jwks) {
    // Neon Auth exposes JWKS at /.well-known/jwks.json
    const jwksUrl = new URL('/.well-known/jwks.json', authUrl);
    _jwks = createRemoteJWKSet(jwksUrl);
  }
  return _jwks;
}

/**
 * Extract and verify the JWT from the Authorization header.
 * Verifies the RS256 signature against Neon Auth's JWKS endpoint.
 * Falls back to payload-only decode if NEON_AUTH_URL is not configured
 * (local dev without auth service).
 */
export async function getAuthUser(req: VercelRequest): Promise<AuthUser | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);

  const jwks = getJwks();
  if (jwks) {
    try {
      const { payload } = await jwtVerify(token, jwks);
      const userId = payload.sub;
      if (!userId) return null;
      return { userId, email: payload['email'] as string | undefined };
    } catch {
      return null;
    }
  }

  // No NEON_AUTH_URL — local dev fallback: decode without verification.
  // This path is never reached in production where NEON_AUTH_URL is set.
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    );
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    const userId = payload.sub;
    if (!userId) return null;
    return { userId, email: payload.email };
  } catch {
    return null;
  }
}

/** Admin check — compares email against ADMIN_EMAIL env var */
export function isAdmin(user: AuthUser): boolean {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL;
  if (!adminEmail || !user.email) return false;
  // Normalize to NFC so different Unicode representations of the same character compare equal
  const adminBuf = Buffer.from(adminEmail.normalize('NFC'));
  const userBuf  = Buffer.from(user.email.normalize('NFC'));
  return adminBuf.length === userBuf.length && timingSafeEqual(adminBuf, userBuf);
}
