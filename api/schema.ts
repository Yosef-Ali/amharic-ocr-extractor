import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_db.js';
import { getAuthUser, isAdmin } from './_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!isAdmin(user)) return res.status(403).json({ error: 'Forbidden' });

  try {
    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`;
    // Also applied lazily by api/_docSchema.ts, since this route is admin-only.
    await sql`ALTER TABLE document_content ADD COLUMN IF NOT EXISTS page_dimensions JSONB`;

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

    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked   BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS doc_limit INT     NOT NULL DEFAULT 3`;

    return res.json({ ok: true });
  } catch (err: unknown) {
    console.error('schema error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
