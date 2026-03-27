import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Ensure documents table has thumbnail_url column
    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`;

    // Ensure users table exists
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

    return res.json({ ok: true });
  } catch (err: unknown) {
    console.error('schema error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
