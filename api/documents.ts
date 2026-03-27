import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_db';
import { getAuthUser } from './_auth';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT d.id, d.name, d.saved_at, d.page_count, d.thumbnail_url
        FROM documents d
        WHERE d.user_id = ${user.userId}
        ORDER BY d.saved_at DESC
      `;
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { docId, name, pageCount, storedImages, pageResults, thumbnailUrl } =
        req.body as {
          docId: string | null;
          name: string;
          pageCount: number;
          storedImages: string[];
          pageResults: Record<number, string>;
          thumbnailUrl: string | null;
        };

      if (!name || pageCount == null) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (docId) {
        // ── Update existing document — must verify ownership first ──
        const result = await sql`
          UPDATE documents
          SET name = ${name}, page_count = ${pageCount},
              thumbnail_url = ${thumbnailUrl}, updated_at = NOW()
          WHERE id = ${docId} AND user_id = ${user.userId}
          RETURNING id
        `;
        if (!result.length) {
          return res.status(404).json({ error: 'Document not found' });
        }
        await sql`
          UPDATE document_content
          SET page_images  = ${JSON.stringify(storedImages)}::jsonb,
              page_results = ${JSON.stringify(pageResults)}::jsonb
          WHERE document_id = ${docId}
            AND document_id IN (
              SELECT id FROM documents WHERE id = ${docId} AND user_id = ${user.userId}
            )
        `;
        return res.json({ id: docId });
      } else {
        // ── Create new document — check quota first ──
        const quotaRows = await sql`
          SELECT u.doc_limit, COUNT(d.id)::int AS used
          FROM users u
          LEFT JOIN documents d ON d.user_id = u.id
          WHERE u.id = ${user.userId}
          GROUP BY u.doc_limit
        `;
        const quota = quotaRows[0];
        if (quota && (quota.used as number) >= (quota.doc_limit as number)) {
          return res.status(403).json({
            error: 'Document limit reached',
            used: quota.used,
            limit: quota.doc_limit,
          });
        }

        const id = uuidv4();
        await sql`
          INSERT INTO documents (id, user_id, name, page_count, thumbnail_url, saved_at, updated_at)
          VALUES (${id}, ${user.userId}, ${name}, ${pageCount}, ${thumbnailUrl}, NOW(), NOW())
        `;
        await sql`
          INSERT INTO document_content (document_id, page_images, page_results)
          VALUES (${id}, ${JSON.stringify(storedImages)}::jsonb, ${JSON.stringify(pageResults)}::jsonb)
        `;
        return res.json({ id });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: unknown) {
    console.error('documents error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
