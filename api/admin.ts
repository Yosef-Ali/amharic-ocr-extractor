import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_db';
import { getAuthUser, isAdmin } from './_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!isAdmin(user)) return res.status(403).json({ error: 'Forbidden' });

  const action = req.query.action as string;
  if (!action) return res.status(400).json({ error: 'Missing action query param' });

  try {
    // ── GET actions ──
    if (req.method === 'GET') {
      if (action === 'stats') {
        const [users, docs] = await Promise.all([
          sql`SELECT COUNT(*)::int AS count FROM users`,
          sql`SELECT COUNT(*)::int AS doc_count, COALESCE(SUM(page_count), 0)::int AS page_sum FROM documents`,
        ]);
        return res.json({
          totalUsers: users[0].count,
          totalDocuments: docs[0].doc_count,
          totalPages: docs[0].page_sum,
        });
      }

      if (action === 'users') {
        const rows = await sql`
          SELECT u.id, u.email, u.name, u.blocked, u.doc_limit, u.created_at,
                 COUNT(d.id)::int AS doc_count
          FROM users u
          LEFT JOIN documents d ON d.user_id = u.id
          GROUP BY u.id, u.email, u.name, u.blocked, u.doc_limit, u.created_at
          ORDER BY u.created_at DESC
        `;
        return res.json(
          rows.map(r => ({
            id: r.id,
            email: r.email,
            name: r.name,
            createdAt: r.created_at,
            docCount: r.doc_count,
            docLimit: r.doc_limit,
            blocked: r.blocked,
          })),
        );
      }

      if (action === 'documents') {
        const userId = req.query.userId as string | undefined;
        const rows = await sql`
          SELECT d.id, d.user_id, COALESCE(u.email, d.user_id) AS user_email,
                 d.name, d.page_count, d.saved_at
          FROM documents d
          LEFT JOIN users u ON u.id = d.user_id
          WHERE (${userId}::text IS NULL OR d.user_id = ${userId})
          ORDER BY d.saved_at DESC
        `;
        return res.json(
          rows.map(r => ({
            id: r.id,
            userId: r.user_id,
            userEmail: r.user_email,
            name: r.name,
            pageCount: r.page_count,
            savedAt: r.saved_at,
          })),
        );
      }

      return res.status(400).json({ error: `Unknown GET action: ${action}` });
    }

    // ── POST actions ──
    if (req.method === 'POST') {
      if (action === 'setDocLimit') {
        const { userId, limit } = req.body as { userId: string; limit: number };
        if (!userId || limit == null) return res.status(400).json({ error: 'Missing userId or limit' });
        if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0) {
          return res.status(400).json({ error: 'limit must be a non-negative integer' });
        }
        await sql`UPDATE users SET doc_limit = ${limit} WHERE id = ${userId}`;
        return res.json({ ok: true });
      }

      if (action === 'blockUser') {
        const { userId } = req.body as { userId: string };
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        await sql`UPDATE users SET blocked = TRUE WHERE id = ${userId}`;
        return res.json({ ok: true });
      }

      if (action === 'unblockUser') {
        const { userId } = req.body as { userId: string };
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        await sql`UPDATE users SET blocked = FALSE WHERE id = ${userId}`;
        return res.json({ ok: true });
      }

      return res.status(400).json({ error: `Unknown POST action: ${action}` });
    }

    // ── DELETE actions ──
    if (req.method === 'DELETE') {
      if (action === 'deleteUser') {
        const { userId } = req.body as { userId: string };
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        // Delete content rows first (in case no ON DELETE CASCADE), then documents, then user
        await sql`
          DELETE FROM document_content
          WHERE document_id IN (SELECT id FROM documents WHERE user_id = ${userId})
        `;
        await sql`DELETE FROM documents WHERE user_id = ${userId}`;
        await sql`DELETE FROM users WHERE id = ${userId}`;
        return res.json({ ok: true });
      }

      if (action === 'deleteDocument') {
        const { docId } = req.body as { docId: string };
        if (!docId) return res.status(400).json({ error: 'Missing docId' });
        await sql`DELETE FROM document_content WHERE document_id = ${docId}`;
        await sql`DELETE FROM documents WHERE id = ${docId}`;
        return res.json({ ok: true });
      }

      return res.status(400).json({ error: `Unknown DELETE action: ${action}` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: unknown) {
    console.error('admin error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
