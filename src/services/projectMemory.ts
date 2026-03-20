/**
 * Per-document project memory — persisted in localStorage.
 *
 * Gives both Chat and Agent AI full awareness of:
 *   • Document name, type, page count, extraction status
 *   • Notes written by the AI from previous sessions
 *   • Conversation history (last N turns) restored on panel open
 *   • Log of past agent actions
 */

import { type ChatTurn } from './geminiService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ProjectMemory {
  docKey:          string;      // fileName — used as storage key
  notes:           string;      // AI-writable notes learned about this doc
  chatHistory:     ChatTurn[];  // persisted across panel open/close
  agentSummaries:  string[];    // one-line log of what the agent did each session
  lastSessionAt:   string;      // ISO datetime of last save
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
const STORAGE_PREFIX   = 'amharic-ocr:proj:';
const MAX_CHAT_TURNS   = 40;   // ~20 exchanges
const MAX_SUMMARIES    = 30;

export function getProjectMemory(docKey: string): ProjectMemory {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + docKey);
    if (raw) return JSON.parse(raw) as ProjectMemory;
  } catch { /* corrupt or unavailable */ }
  return {
    docKey,
    notes:          '',
    chatHistory:    [],
    agentSummaries: [],
    lastSessionAt:  new Date().toISOString(),
  };
}

export function saveProjectMemory(memory: ProjectMemory): void {
  try {
    const trimmed: ProjectMemory = {
      ...memory,
      chatHistory:    memory.chatHistory.slice(-MAX_CHAT_TURNS),
      agentSummaries: memory.agentSummaries.slice(-MAX_SUMMARIES),
      lastSessionAt:  new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_PREFIX + trimmed.docKey, JSON.stringify(trimmed));
  } catch { /* storage full */ }
}

export function clearProjectMemory(docKey: string): void {
  localStorage.removeItem(STORAGE_PREFIX + docKey);
}

export function appendAgentSummary(memory: ProjectMemory, summary: string): ProjectMemory {
  return {
    ...memory,
    agentSummaries: [...memory.agentSummaries, `[${new Date().toLocaleTimeString()}] ${summary}`],
  };
}

// ---------------------------------------------------------------------------
// Build the system context block — injected into every AI call
// ---------------------------------------------------------------------------
export function buildProjectContext(opts: {
  docKey:         string;
  totalPages:     number;
  extractedPages: Set<number>;
  activePage:     number;
  memory:         ProjectMemory;
}): string {
  const { docKey, totalPages, extractedPages, activePage, memory } = opts;

  // Separate cover/back-cover (pages 0, -1) from content pages
  const contentExtracted = [...extractedPages].filter(n => n > 0).sort((a, b) => a - b);
  const notExtracted     = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(n => !extractedPages.has(n));

  const extList  = contentExtracted.length > 0
    ? contentExtracted.join(', ')
    : 'none yet';
  const notList  = notExtracted.length > 0
    ? notExtracted.slice(0, 12).join(', ') + (notExtracted.length > 12 ? ` …+${notExtracted.length - 12} more` : '')
    : 'all pages extracted';

  const pct = totalPages > 0
    ? Math.round((contentExtracted.length / totalPages) * 100)
    : 0;

  const ext = docKey.split('.').pop()?.toLowerCase() ?? '';
  const fileType =
    ext === 'pdf'                                        ? 'PDF — scanned pages (OCR required for each page)'   :
    ext === 'docx'                                       ? 'Word document — digital text (no OCR needed)'       :
    ['jpg','jpeg','png','webp','bmp','tif','tiff'].includes(ext) ? 'Image — single scanned page (OCR on one page)' :
    ext === 'txt' || ext === 'md'                        ? 'Plain text file — digital (no OCR needed)'          :
    'Unknown format';

  const hasCover     = extractedPages.has(0);
  const hasBackCover = extractedPages.has(-1);
  const coverNote    = [hasCover ? 'front cover ✓' : '', hasBackCover ? 'back cover ✓' : '']
    .filter(Boolean).join(', ');

  let ctx =
    `━━━ PROJECT CONTEXT ━━━\n` +
    `Document: ${docKey}\n` +
    `Type: ${fileType}\n` +
    `Pages: ${totalPages} total | ${contentExtracted.length} extracted (${pct}%) | ${notExtracted.length} remaining\n` +
    `Active page: ${activePage}\n` +
    (coverNote ? `Covers: ${coverNote}\n` : '') +
    `Extracted pages: ${extList}\n` +
    `Not yet extracted: ${notList}`;

  if (memory.notes) {
    ctx += `\n\nProject notes (learned in previous sessions):\n${memory.notes}`;
  }

  if (memory.agentSummaries.length > 0) {
    const recent = memory.agentSummaries.slice(-6);
    ctx += `\n\nRecent agent actions:\n${recent.map(s => `• ${s}`).join('\n')}`;
  }

  if (memory.lastSessionAt && memory.chatHistory.length > 0) {
    const d = new Date(memory.lastSessionAt).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    ctx += `\n\nLast session: ${d} (${memory.chatHistory.length} messages in history)`;
  }

  ctx += '\n━━━━━━━━━━━━━━━━━━━━━━━';
  return ctx;
}
