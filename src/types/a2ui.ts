// A2UI — Agent-to-UI structured response types.
// Each message in the agent stream is one of these discriminated types.
// Rendered as distinct cards in the AgentPanel message stream.

// ── Message types ─────────────────────────────────────────────────────────

export interface A2UIUserMessage {
  type: 'user';
  id:   string;
  text: string;
  imageDataUrl?: string;
}

/** Shimmer skeleton — agent is thinking / waiting for API */
export interface A2UIThinkingMessage {
  type:   'thinking';
  id:     string;
  label?: string;
}

/** Plan card — agent explains what it will do before doing it */
export interface A2UIPlanMessage {
  type:  'plan';
  id:    string;
  title: string;
  steps: string[];
}

/** Tool execution card — shown for each function call */
export interface A2UIToolMessage {
  type:     'tool';
  id:       string;
  name:     string;
  args?:    Record<string, unknown>;
  status:   'running' | 'done' | 'error';
  summary?: string;
}

/** Human-in-the-loop approval card — agent pauses, waits for user */
export interface A2UIApprovalMessage {
  type:        'approval';
  id:          string;
  title:       string;
  description: string;
  status:      'pending' | 'approved' | 'rejected';
}

/** Final text response from agent */
export interface A2UITextMessage {
  type:    'text';
  id:      string;
  content: string;
}

export interface A2UIErrorMessage {
  type:    'error';
  id:      string;
  message: string;
}

/** Inline cover-page setup card — agent asks user to fill in cover details */
export interface A2UICoverSetupMessage {
  type:          'cover-setup';
  id:            string;
  suggestedTitle?: string;
  status:        'pending' | 'generating' | 'done' | 'cancelled';
  result?:       string;   // success / error text after generation
}

export type A2UIMessage =
  | A2UIUserMessage
  | A2UIThinkingMessage
  | A2UIPlanMessage
  | A2UIToolMessage
  | A2UIApprovalMessage
  | A2UITextMessage
  | A2UIErrorMessage
  | A2UICoverSetupMessage;

// ── Model definitions ──────────────────────────────────────────────────────

export type AgentModel =
  | 'gemini-flash'
  | 'gemini-pro'
  | 'claude-sonnet'
  | 'claude-opus'
  | 'minimax-m27';

export interface ModelDef {
  id:      AgentModel;
  label:   string;
  vendor:  'gemini' | 'claude' | 'minimax';
  badge:   string;
  color:   string;
  apiKey?: 'gemini' | 'anthropic';
  note?:   string;   // shown in selector when not available
}

export const AGENT_MODELS: ModelDef[] = [
  {
    id:     'gemini-flash',
    label:  'Gemini Flash',
    vendor: 'gemini',
    badge:  'Fast',
    color:  '#4ade80',
    apiKey: 'gemini',
  },
  {
    id:     'gemini-pro',
    label:  'Gemini Pro',
    vendor: 'gemini',
    badge:  'Pro',
    color:  '#818cf8',
    apiKey: 'gemini',
  },
  {
    id:     'minimax-m27',
    label:  'MiniMax-M2.7',
    vendor: 'minimax',
    badge:  'Smart',
    color:  '#f59e0b',
    apiKey: 'anthropic',
    note:   'Using MiniMax via Anthropic API',
  },
  {
    id:     'claude-sonnet',
    label:  'Claude Sonnet',
    vendor: 'claude',
    badge:  'Smart',
    color:  '#fb923c',
    apiKey: 'anthropic',
    note:   'Requires Anthropic API key',
  },
  {
    id:     'claude-opus',
    label:  'Claude Opus',
    vendor: 'claude',
    badge:  'Best',
    color:  '#f43f5e',
    apiKey: 'anthropic',
    note:   'Requires Anthropic API key',
  },
];

// ── Tools that require human approval before execution ────────────────────
export const APPROVAL_REQUIRED_TOOLS = new Set(['deleteElement', 'batchEdit']);

// ── Helpers ───────────────────────────────────────────────────────────────
export const toolIcon: Record<string, string> = {
  getDocumentStructure: '🔍',
  editTextBlock:        '✏️',
  editImageFrame:       '🖼️',
  setColumnLayout:      '⬛',
  insertElement:        '➕',
  deleteElement:        '🗑️',
  batchEdit:            '⚡',
  getPageScreenshot:    '📸',
  setActivePage:        '📄',
  extractPage:          '📥',
  extractAllPages:      '📚',
  autoFillImages:       '🖼️',
  openCoverSetup:       '📕',
};
