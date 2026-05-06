import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_db';
import { getAuthUser } from './_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const id = req.query.id as string;
    if (!id) return res.status(400).json({ error: 'Missing id query param' });

    const rows = await sql`
      SELECT d.id, d.name, d.saved_at, d.page_count, c.page_results
      FROM documents d
      JOIN document_content c ON c.document_id = d.id
      WHERE d.id = ${id} AND d.user_id = ${user.userId}
      LIMIT 1
    `;

    if (!rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.json(rows[0]);
  } catch (err: unknown) {
    console.error('document-content error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
