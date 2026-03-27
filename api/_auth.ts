import type { VercelRequest } from '@vercel/node';

export interface AuthUser {
  userId: string;
  email?: string;
}

/**
 * Extract and decode the JWT from the Authorization header.
 * MVP: decodes payload without cryptographic signature verification.
 * TODO: add JWKS verification against NEON_AUTH_URL.
 */
export function getAuthUser(req: VercelRequest): AuthUser | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    );
    // Check expiration
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
  const adminEmail = process.env.ADMIN_EMAIL;
  return !!adminEmail && user.email === adminEmail;
}
