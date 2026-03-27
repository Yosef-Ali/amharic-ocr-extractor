import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_db';
import { getAuthUser } from './_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { id } = req.body as { id: string };
    if (!id) return res.status(400).json({ error: 'Missing document id' });

    await sql`DELETE FROM documents WHERE id = ${id} AND user_id = ${user.userId}`;

    return res.json({ ok: true });
  } catch (err: unknown) {
    console.error('document-delete error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
