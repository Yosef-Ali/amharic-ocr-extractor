import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { filename, data } = (req.body ?? {}) as { filename?: string; data?: string };
  if (!filename || !data) {
    return res.status(400).json({ error: 'Missing filename or data' });
  }

  // Buffer.from is the idiomatic Node.js way to decode base64 (faster than atob + loop)
  const file = new Blob([Buffer.from(data, 'base64')], { type: 'image/jpeg' });

  const result = await put(filename, file, { access: 'public' });

  return res.json({ url: result.url });
}
