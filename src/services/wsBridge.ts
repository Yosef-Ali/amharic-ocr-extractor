// wsBridge — browser-side WebSocket client that connects to the MCP relay server.
// When Claude Code CLI calls a canvas tool, the relay forwards it here,
// wsBridge executes it via CanvasExecutor, and sends the result back.

import type { CanvasExecutor } from './canvasExecutor';

const WS_URL = 'ws://localhost:3001';
const RECONNECT_DELAY_MS = 3000;

type WsToolCall = {
  type: 'tool_call';
  reqId: string;
  name: string;
  args: Record<string, unknown>;
  pageNumber: number;
};

type StatusListener = (connected: boolean) => void;

export class WsBridge {
  private ws: WebSocket | null = null;
  private executor: CanvasExecutor;
  private listeners: StatusListener[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(executor: CanvasExecutor) {
    this.executor = executor;
    this.connect();
  }

  /** Subscribe to connection status changes. */
  onStatus(fn: StatusListener) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  private connect() {
    if (this.stopped) return;

    try {
      const ws = new WebSocket(WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        this.emit(true);
        // Keep-alive ping every 20s
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          } else {
            clearInterval(ping);
          }
        }, 20_000);
      };

      ws.onclose = () => {
        this.emit(false);
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        // close event will follow — just suppress the uncaught error
      };

      ws.onmessage = async (evt) => {
        let msg: WsToolCall;
        try {
          msg = JSON.parse(evt.data as string) as WsToolCall;
        } catch {
          return;
        }
        if (msg.type !== 'tool_call') return;

        const { reqId, name, args, pageNumber } = msg;
        try {
          const result = await this.executor.execute(name, args, pageNumber);
          ws.send(JSON.stringify({ type: 'tool_result', reqId, result }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'tool_result', reqId, error: String(err) }));
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
  }

  private emit(connected: boolean) {
    this.listeners.forEach(fn => fn(connected));
  }
}
