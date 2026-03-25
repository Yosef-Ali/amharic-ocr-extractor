import { sql } from '../lib/neon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AdminUser {
  id:        string;
  email:     string;
  name:      string | null;
  createdAt: string;
  docCount:  number;
  docLimit:  number;
  blocked:   boolean;
}

export interface AdminDocument {
  id:        string;
  userId:    string;
  userEmail: string;
  name:      string;
  pageCount: number;
  savedAt:   string;
}

export interface AdminStats {
  totalUsers:     number;
  totalDocuments: number;
  totalPages:     number;
}

// ---------------------------------------------------------------------------
// Ensure users table exists (idempotent)
// ---------------------------------------------------------------------------
export async function ensureUsersTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      name       TEXT,
      blocked    BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Add columns if table already existed without them
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked   BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS doc_limit INT     NOT NULL DEFAULT 3`;
}

// ---------------------------------------------------------------------------
// Upsert user on login — called from App.tsx after auth
// ---------------------------------------------------------------------------
export async function upsertUser(id: string, email: string, name?: string): Promise<void> {
  await sql`
    INSERT INTO users (id, email, name, created_at, last_seen)
    VALUES (${id}, ${email}, ${name ?? null}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
      SET email     = EXCLUDED.email,
          name      = EXCLUDED.name,
          last_seen = NOW()
  `;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export async function getAdminStats(): Promise<AdminStats> {
  const [users, docs] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM users`,
    sql`SELECT COUNT(*)::int AS doc_count, COALESCE(SUM(page_count), 0)::int AS page_sum FROM documents`,
  ]);
  return {
    totalUsers:     users[0].count     as number,
    totalDocuments: docs[0].doc_count  as number,
    totalPages:     docs[0].page_sum   as number,
  };
}

// ---------------------------------------------------------------------------
// Users — with doc counts
// ---------------------------------------------------------------------------
export async function getAdminUsers(): Promise<AdminUser[]> {
  const rows = await sql`
    SELECT
      u.id,
      u.email,
      u.name,
      u.blocked,
      u.doc_limit,
      u.created_at,
      COUNT(d.id)::int AS doc_count
    FROM users u
    LEFT JOIN documents d ON d.user_id = u.id
    GROUP BY u.id, u.email, u.name, u.blocked, u.doc_limit, u.created_at
    ORDER BY u.created_at DESC
  `;
  return rows.map(r => ({
    id:        r.id         as string,
    email:     r.email      as string,
    name:      r.name       as string | null,
    createdAt: r.created_at as string,
    docCount:  r.doc_count  as number,
    docLimit:  r.doc_limit  as number,
    blocked:   r.blocked    as boolean,
  }));
}

// ---------------------------------------------------------------------------
// Per-user quota — returns used / limit (called from storageService)
// ---------------------------------------------------------------------------
export async function getUserQuota(userId: string): Promise<{ used: number; limit: number }> {
  const rows = await sql`
    SELECT u.doc_limit, COUNT(d.id)::int AS used
    FROM users u
    LEFT JOIN documents d ON d.user_id = u.id
    WHERE u.id = ${userId}
    GROUP BY u.doc_limit
  `;
  if (!rows[0]) return { used: 0, limit: 3 };
  return { used: rows[0].used as number, limit: rows[0].doc_limit as number };
}

// ---------------------------------------------------------------------------
// Set per-user document limit (admin only)
// ---------------------------------------------------------------------------
export async function setUserDocLimit(userId: string, limit: number): Promise<void> {
  await sql`UPDATE users SET doc_limit = ${limit} WHERE id = ${userId}`;
}

// ---------------------------------------------------------------------------
// All documents — optionally filtered by user
// ---------------------------------------------------------------------------
export async function getAdminDocuments(userId?: string): Promise<AdminDocument[]> {
  const rows = userId
    ? await sql`
        SELECT d.id, d.user_id, COALESCE(u.email, d.user_id) AS user_email,
               d.name, d.page_count, d.saved_at
        FROM documents d
        LEFT JOIN users u ON u.id = d.user_id
        WHERE d.user_id = ${userId}
        ORDER BY d.saved_at DESC
      `
    : await sql`
        SELECT d.id, d.user_id, COALESCE(u.email, d.user_id) AS user_email,
               d.name, d.page_count, d.saved_at
        FROM documents d
        LEFT JOIN users u ON u.id = d.user_id
        ORDER BY d.saved_at DESC
      `;
  return rows.map(r => ({
    id:        r.id         as string,
    userId:    r.user_id    as string,
    userEmail: r.user_email as string,
    name:      r.name       as string,
    pageCount: r.page_count as number,
    savedAt:   r.saved_at   as string,
  }));
}

// ---------------------------------------------------------------------------
// Delete any document (admin — no user_id guard)
// ---------------------------------------------------------------------------
export async function adminDeleteDocument(id: string): Promise<void> {
  await sql`DELETE FROM documents WHERE id = ${id}`;
}

// ---------------------------------------------------------------------------
// Delete user + all their data
// ---------------------------------------------------------------------------
export async function deleteUser(id: string): Promise<void> {
  await sql`DELETE FROM documents WHERE user_id = ${id}`;
  await sql`DELETE FROM users WHERE id = ${id}`;
}

// ---------------------------------------------------------------------------
// Block / unblock / check
// ---------------------------------------------------------------------------
export async function blockUser(id: string): Promise<void> {
  await sql`UPDATE users SET blocked = TRUE WHERE id = ${id}`;
}

export async function unblockUser(id: string): Promise<void> {
  await sql`UPDATE users SET blocked = FALSE WHERE id = ${id}`;
}

export async function checkUserBlocked(userId: string): Promise<boolean> {
  const rows = await sql`SELECT blocked FROM users WHERE id = ${userId} LIMIT 1`;
  return rows[0]?.blocked === true;
}
