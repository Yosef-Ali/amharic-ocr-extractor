import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { filename, data } = req.body as { filename: string; data: string };

  // Decode base64 → Blob (no Buffer needed; Blob is available in Node 18+)
  const binary = atob(data);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new Blob([bytes], { type: 'image/jpeg' });

  const result = await put(filename, file, { access: 'public' });

  return res.json({ url: result.url });
}
