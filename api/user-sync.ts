import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_db';
import { getAuthUser } from './_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { name } = req.body as { name?: string };

    const userId = user.userId;
    // Use email from the verified JWT, not from the request body
    const email = user.email;
    if (!email) return res.status(400).json({ error: 'No email in auth token' });

    await sql`
      INSERT INTO users (id, email, name, created_at, last_seen)
      VALUES (${userId}, ${email}, ${name ?? null}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE
        SET email     = EXCLUDED.email,
            name      = EXCLUDED.name,
            last_seen = NOW()
    `;

    // Check blocked status
    const rows = await sql`SELECT blocked FROM users WHERE id = ${userId} LIMIT 1`;
    const blocked = rows[0]?.blocked === true;

    return res.json({ blocked });
  } catch (err: unknown) {
    console.error('user-sync error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
