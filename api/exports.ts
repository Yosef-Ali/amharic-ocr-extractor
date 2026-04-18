import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_db';
import { getAuthUser, isAdmin } from './_auth';

// Ensure the ai_exports table exists (idempotent, cached per lambda warm instance)
let _tableReady = false;
async function ensureTable(): Promise<void> {
  if (_tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS ai_exports (
      id            TEXT PRIMARY KEY,
      document_name TEXT        NOT NULL,
      user_id       TEXT        NOT NULL,
      page_count    INTEGER     NOT NULL DEFAULT 0,
      chunk_count   INTEGER     NOT NULL DEFAULT 0,
      languages     TEXT[]      NOT NULL DEFAULT '{}',
      export_json   JSONB       NOT NULL,
      exported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  _tableReady = true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const action = req.query.action as string;
  if (!action) return res.status(400).json({ error: 'Missing action query param' });

  // Only the save action is open to all authenticated users.
  // All other actions (list, get, stats, delete) require admin.
  if (action !== 'save' && !isAdmin(user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await ensureTable();

    // ── POST actions ──
    if (req.method === 'POST') {
      if (action === 'save') {
        const { docId, exported } = req.body as {
          docId: string;
          exported: {
            document: {
              name: string;
              totalPages: number;
              chunkCount: number;
              languages: string[];
            };
            chunks: unknown[];
          };
        };

        if (!docId || !exported) {
          return res.status(400).json({ error: 'Missing docId or exported' });
        }

        const { document: meta, chunks } = exported;
        await sql`
          INSERT INTO ai_exports
            (id, document_name, user_id, page_count, chunk_count, languages, export_json, exported_at, updated_at)
          VALUES (
            ${docId}, ${meta.name}, ${user.userId},
            ${meta.totalPages}, ${meta.chunkCount},
            ${meta.languages as unknown as string},
            ${JSON.stringify({ document: meta, chunks })}::jsonb,
            NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE
            SET document_name = EXCLUDED.document_name,
                page_count    = EXCLUDED.page_count,
                chunk_count   = EXCLUDED.chunk_count,
                languages     = EXCLUDED.languages,
                export_json   = EXCLUDED.export_json,
                updated_at    = NOW()
          WHERE ai_exports.user_id = ${user.userId}
        `;
        return res.json({ ok: true });
      }

      return res.status(400).json({ error: `Unknown POST action: ${action}` });
    }

    // ── GET actions ──
    if (req.method === 'GET') {
      if (action === 'list') {
        const rows = await sql`
          SELECT e.id, e.document_name, e.user_id, e.page_count, e.chunk_count,
                 e.languages, e.exported_at, e.updated_at,
                 COALESCE(u.email, e.user_id) AS user_email
          FROM   ai_exports e
          LEFT JOIN users u ON u.id = e.user_id
          ORDER  BY e.updated_at DESC
        `;
        return res.json(
          rows.map(r => ({
            id: r.id,
            documentName: r.document_name,
            userId: r.user_id,
            userEmail: r.user_email,
            pageCount: r.page_count,
            chunkCount: r.chunk_count,
            languages: r.languages ?? [],
            exportedAt: r.exported_at,
            updatedAt: r.updated_at,
          })),
        );
      }

      if (action === 'get') {
        const docId = req.query.docId as string;
        if (!docId) return res.status(400).json({ error: 'Missing docId' });
        const rows = await sql`SELECT export_json FROM ai_exports WHERE id = ${docId} LIMIT 1`;
        if (!rows.length) return res.status(404).json({ error: 'Export not found' });
        const p = rows[0].export_json as { document: unknown; chunks: { text: string }[] };
        return res.json({
          document: p.document,
          chunks: p.chunks,
          fullText: p.chunks.map(c => c.text).join('\n'),
        });
      }

      if (action === 'stats') {
        const rows = await sql`
          SELECT COUNT(*)::int                      AS total_exports,
                 COALESCE(SUM(chunk_count), 0)::int AS total_chunks,
                 COALESCE(SUM(page_count),  0)::int AS total_pages
          FROM   ai_exports
        `;
        return res.json({
          totalExports: rows[0].total_exports,
          totalChunks: rows[0].total_chunks,
          totalPages: rows[0].total_pages,
        });
      }

      return res.status(400).json({ error: `Unknown GET action: ${action}` });
    }

    // ── DELETE actions ──
    if (req.method === 'DELETE') {
      if (action === 'delete') {
        const docId = req.query.docId as string;
        if (!docId) return res.status(400).json({ error: 'Missing docId' });
        await sql`DELETE FROM ai_exports WHERE id = ${docId}`;
        return res.json({ ok: true });
      }

      return res.status(400).json({ error: `Unknown DELETE action: ${action}` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: unknown) {
    console.error('exports error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
