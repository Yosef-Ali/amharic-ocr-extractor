import { createAuthClient } from '@neondatabase/neon-js/auth';

/** Result shape shared by signIn/signUp — an absent `error` means success. */
export interface NeonAuthResult {
  error?: { message?: string } | null;
}

export interface NeonSession {
  data?: {
    user?: { id: string; email?: string; name?: string } | null;
    /** The SDK returns the JWT at data.session.token, not data.accessToken. */
    session?: { token?: string | null } | null;
  } | null;
}

/**
 * The slice of the Neon Auth client this app actually calls.
 *
 * `@neondatabase/neon-js/auth` ships no type declarations, so without this the
 * only way to reach these methods was `(authClient as any)` at every call site.
 * Describing the surface here keeps the assertion in one place and gives the
 * call sites real checking on their arguments and results.
 */
export interface NeonAuthClient {
  getSession(): Promise<NeonSession>;
  signOut(): Promise<unknown>;
  signUp: {
    email(input: { name?: string; email: string; password: string }): Promise<NeonAuthResult>;
  };
  signIn: {
    email(input: { email: string; password: string }): Promise<NeonAuthResult>;
  };
}

export const authClient = createAuthClient(
  import.meta.env.VITE_NEON_AUTH_URL as string,
) as unknown as NeonAuthClient;
