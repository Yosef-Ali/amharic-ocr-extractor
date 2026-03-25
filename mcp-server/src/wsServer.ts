// WebSocket relay server — sits between the MCP stdio server and the browser.
// Browser wsBridge connects here on startup. MCP tool calls are forwarded to
// the browser which executes them via canvasExecutor, then sends the result back.

import { WebSocketServer, WebSocket } from 'ws';
import type { WsMessage, WsToolCall, WsToolResult } from './types.js';

const WS_PORT = 3001;

type PendingReq = {
  resolve: (result: string) => void;
  reject:  (err: Error)    => void;
  timer:   ReturnType<typeof setTimeout>;
};

export class WsRelay {
  private wss: WebSocketServer;
  private browser: WebSocket | null = null;
  private pending = new Map<string, PendingReq>();
  private reqCounter = 0;

  constructor() {
    this.wss = new WebSocketServer({ port: WS_PORT });

    this.wss.on('listening', () => {
      process.stderr.write(`[mcp-ws] relay listening on ws://localhost:${WS_PORT}\n`);
    });

    this.wss.on('connection', (ws) => {
      process.stderr.write('[mcp-ws] browser connected\n');
      this.browser = ws;

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as WsMessage;
          if (msg.type === 'tool_result') {
            this.handleResult(msg);
          } else if (msg.type === 'pong') {
            // keep-alive — ignore
          }
        } catch {
          process.stderr.write('[mcp-ws] invalid message from browser\n');
        }
      });

      ws.on('close', () => {
        process.stderr.write('[mcp-ws] browser disconnected\n');
        if (this.browser === ws) this.browser = null;
        // Reject all in-flight requests
        for (const [id, req] of this.pending) {
          clearTimeout(req.timer);
          req.reject(new Error('Browser disconnected'));
          this.pending.delete(id);
        }
      });
    });
  }

  /** Forward a tool call to the browser and wait for the result (30s timeout). */
  relay(name: string, args: Record<string, unknown>, pageNumber: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.browser || this.browser.readyState !== WebSocket.OPEN) {
        reject(new Error('No browser connected. Open the Amharic OCR app in your browser first.'));
        return;
      }

      const reqId = `req-${++this.reqCounter}`;
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error(`Tool call "${name}" timed out after 30s`));
      }, 30_000);

      this.pending.set(reqId, { resolve, reject, timer });

      const call: WsToolCall = { type: 'tool_call', reqId, name, args, pageNumber };
      this.browser.send(JSON.stringify(call));
    });
  }

  private handleResult(msg: WsToolResult) {
    const req = this.pending.get(msg.reqId);
    if (!req) return;
    clearTimeout(req.timer);
    this.pending.delete(msg.reqId);
    if (msg.error) {
      req.reject(new Error(msg.error));
    } else {
      req.resolve(msg.result ?? 'ok');
    }
  }

  get isConnected() {
    return this.browser?.readyState === WebSocket.OPEN;
  }
}
