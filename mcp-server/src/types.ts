// Shared WebSocket message types between MCP server and browser wsBridge

export interface WsToolCall {
  type: 'tool_call';
  reqId: string;
  name: string;
  args: Record<string, unknown>;
  pageNumber: number;
}

export interface WsToolResult {
  type: 'tool_result';
  reqId: string;
  result?: string;
  error?: string;
}

export interface WsPing {
  type: 'ping';
}

export interface WsPong {
  type: 'pong';
}

export type WsMessage = WsToolCall | WsToolResult | WsPing | WsPong;
