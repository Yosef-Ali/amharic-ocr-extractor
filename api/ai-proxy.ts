import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_auth';

export const maxDuration = 60;

const BASE_URL = process.env.ANTHROPIC_BASE_URL || process.env.VITE_ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || process.env.VITE_ANTHROPIC_MODEL || 'claude-3-sonnet-20240229';

// Only these models may be requested — prevents billing abuse via expensive model substitution
const ALLOWED_MODELS = new Set([
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'claude-3-5-sonnet-20240620',
  'claude-3-opus-20240229',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const { messages, system, model } = req.body as {
      messages: unknown[];
      system?: string;
      model?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing messages array' });
    }

    const resolvedModel = model || DEFAULT_MODEL;
    if (!ALLOWED_MODELS.has(resolvedModel)) {
      return res.status(400).json({ error: `Model not allowed: ${resolvedModel}` });
    }

    const body: Record<string, unknown> = {
      model: resolvedModel,
      max_tokens: 4096,
      messages,
    };
    if (system) body.system = system;

    const response = await fetch(`${BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      // Return sanitized error — do not leak raw Anthropic body (contains account metadata)
      return res.status(response.status).json({ error: 'AI request failed', status: response.status });
    }

    return res.json(data);
  } catch (err: unknown) {
    console.error('ai-proxy error:', err);
    return res.status(500).json({ error: 'AI proxy request failed' });
  }
}
