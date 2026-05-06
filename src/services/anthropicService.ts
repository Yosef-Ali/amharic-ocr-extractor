import { buildOcrPrompt, buildLayoutPrompt, verifyLayout, type ChatTurn, type CanvasContext } from './aiCommon';
import { authFetch } from '../lib/apiClient';

async function callAnthropic(messages: any[], system?: string, model?: string) {
  // Always use server-side proxy to keep API key secure
  const res = await authFetch('/api/ai-proxy', {
    method: 'POST',
    body: JSON.stringify({ messages, system, model }),
  });
  const data = await res.json();
  // Server proxy returns the full response; extract text
  if (typeof data === 'string') return data;
  if (data.content?.[0]?.text) return data.content[0].text;
  return data.text || '';
}

/** OCR Extraction via MiniMax/Anthropic */
export async function anthropicExtractPageHTML(
  base64Image: string,
  previousPageHTML?: string,
): Promise<string> {
  // Pass 1: OCR
  const ocrMessages = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64Image },
        },
        { type: 'text', text: buildOcrPrompt() },
      ],
    },
  ];

  const extractedText = await callAnthropic(ocrMessages);
  if (!extractedText.trim()) {
    return '<p style="color:red;text-align:center;font-weight:bold;">⚠️ OCR returned no text for this page.</p>';
  }

  // Pass 2: Layout
  const layoutMessages = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64Image },
        },
        { type: 'text', text: buildLayoutPrompt(extractedText, previousPageHTML) },
      ],
    },
  ];

  const layoutHtml = await callAnthropic(layoutMessages);
  return verifyLayout(layoutHtml);
}

/** Chat with MiniMax/Anthropic */
export async function anthropicChat(
  history: ChatTurn[],
  canvasContext?: CanvasContext,
  projectContext?: string,
  model?: string,
): Promise<string> {
  const system =
    'You are an intelligent AI assistant built into an Amharic document OCR extractor. ' +
    'You help users understand, translate, summarize, and work with their scanned documents. ' +
    'Format responses with markdown. Be concise. ' +
    (projectContext ? `\n\n${projectContext}` : '');

  const messages: any[] = [];

  // Inject canvas context if provided
  if (canvasContext) {
    messages.push({
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: canvasContext.image },
        },
        { type: 'text', text: `[CANVAS CONTEXT — page ${canvasContext.pageNumber}]\n${canvasContext.html.slice(0, 2500)}` },
      ],
    });
    messages.push({ role: 'assistant', content: [{ type: 'text', text: `I can see page ${canvasContext.pageNumber}. Ready to help.` }] });
  }

  // Convert history
  for (const turn of history) {
    const content: any[] = [];
    if (turn.imageDataUrl) {
      const [, data] = turn.imageDataUrl.split(',');
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
    }
    content.push({ type: 'text', text: turn.text || ' ' });
    messages.push({ role: turn.role === 'ai' ? 'assistant' : 'user', content });
  }

  return await callAnthropic(messages, system, model);
}

/** Edit page via natural language */
export async function anthropicEditPage(
  base64Image: string,
  currentHTML: string,
  instruction: string,
  model?: string,
): Promise<string> {
  const system = 'You are a senior document designer and HTML expert. Apply user requests and return improved HTML. Return ONLY raw HTML.';
  const prompt = `CURRENT PAGE HTML:\n\`\`\`html\n${currentHTML}\n\`\`\`\n\nUSER REQUEST: ${instruction}\n\nOutput improved HTML now:`;

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
        { type: 'text', text: prompt },
      ],
    },
  ];

  const res = await callAnthropic(messages, system, model);
  return verifyLayout(res);
}
