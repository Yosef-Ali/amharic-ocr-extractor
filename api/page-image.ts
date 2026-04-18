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
    const docId = req.query.docId as string;
    const page = req.query.page as string;
    if (!docId || page == null) {
      return res.status(400).json({ error: 'Missing docId or page query param' });
    }

    const pageIndex = parseInt(page, 10);
    if (isNaN(pageIndex)) {
      return res.status(400).json({ error: 'Invalid page number' });
    }

    const rows = await sql`
      SELECT c.page_images->>(${pageIndex}::int) AS img
      FROM document_content c
      JOIN documents d ON d.id = c.document_id
      WHERE c.document_id = ${docId} AND d.user_id = ${user.userId}
      LIMIT 1
    `;

    if (!rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.json({ img: rows[0].img ?? null });
  } catch (err: unknown) {
    console.error('page-image error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
