#!/usr/bin/env node
// MCP stdio server — Claude Code CLI connects here via stdio.
// Forwards tool calls to the browser canvas editor via WebSocket relay.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WsRelay } from './wsServer.js';
import { MCP_TOOLS } from './tools.js';

const relay = new WsRelay();

const server = new Server(
  { name: 'amharic-ocr-canvas', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// ── List tools ────────────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: MCP_TOOLS.map(t => ({
    name:        t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

// ── Execute tool ──────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  // pageNumber defaults to 1 if not provided
  const pageNumber = typeof args.pageNumber === 'number' ? args.pageNumber : 1;

  if (!relay.isConnected) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Browser not connected. Open http://localhost:5173 in your browser first, then retry.',
        }),
      }],
      isError: true,
    };
  }

  // extractAllPages: ask browser how many pages exist, then loop extractPage
  if (name === 'extractAllPages') {
    try {
      // Ask browser for total page count
      const totalRaw = await relay.relay('getTotalPages', {}, 1);
      const { totalPages } = JSON.parse(totalRaw) as { totalPages: number };
      const force = (args as Record<string, unknown>).force === true;
      const results: string[] = [];
      for (let p = 1; p <= totalPages; p++) {
        const r = await relay.relay('extractPage', { pageNumber: p, force }, p);
        results.push(`Page ${p}: ${JSON.parse(r).cached ? 'cached' : 'extracted'}`);
        process.stderr.write(`[mcp] extractAllPages: page ${p}/${totalPages} done\n`);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, results, totalPages }) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }], isError: true };
    }
  }

  try {
    const result = await relay.relay(name, args as Record<string, unknown>, pageNumber);
    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('[mcp] amharic-ocr-canvas MCP server started\n');
