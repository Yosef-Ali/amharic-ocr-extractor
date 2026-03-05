import { put } from '@vercel/blob';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { filename, data } = await req.json() as { filename: string; data: string };

  // Decode base64 to bytes (Edge-compatible — no Buffer)
  const binary = atob(data);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const file   = new Blob([bytes], { type: 'image/jpeg' });
  const result = await put(filename, file, {
    access: 'public',
  });

  return Response.json({ url: result.url });
}
