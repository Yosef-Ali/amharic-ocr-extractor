import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_auth';
import { sql } from './_db';

// Allowlist for blob filenames: <uuid>/page-N.jpg or <uuid>/thumbnail.jpg
const SAFE_FILENAME = /^[0-9a-f-]{36}\/(page-\d+|thumbnail)\.jpg$/;

// ~7.5MB decoded — reject oversized payloads before passing to Blob
const MAX_BASE64_LEN = 10_000_000;


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { filename, data } = (req.body ?? {}) as { filename?: string; data?: string };
  if (!filename || !data) {
    return res.status(400).json({ error: 'Missing filename or data' });
  }

  if (!SAFE_FILENAME.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  // Verify the UUID prefix belongs to a document owned by this user.
  // If the document doesn't exist yet (new-document flow: client uploads blobs
  // before calling /api/documents), gate on the user's doc quota to cap abuse.
  const docUuid = filename.split('/')[0];
  const ownerRows = await sql`SELECT user_id FROM documents WHERE id = ${docUuid} LIMIT 1`;
  if (ownerRows.length) {
    if (ownerRows[0].user_id !== user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } else {
    const quotaRows = await sql`
      SELECT u.doc_limit, (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id)::int AS used
      FROM users u WHERE u.id = ${user.userId}
    `;
    if (!quotaRows.length || quotaRows[0].used >= quotaRows[0].doc_limit) {
      return res.status(403).json({ error: 'Quota exceeded' });
    }
  }

  if (data.length > MAX_BASE64_LEN) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  // Buffer.from is the idiomatic Node.js way to decode base64 (faster than atob + loop)
  const file = new Blob([Buffer.from(data, 'base64')], { type: 'image/jpeg' });

  const result = await put(filename, file, { access: 'public' });

  return res.json({ url: result.url });
}
