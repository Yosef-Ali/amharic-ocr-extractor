// AgentPanel — Pencil.dev-style left-side full agentic development environment.
// Features: model switcher, reference image upload, A2UI message stream,
// shimmer/skeleton loading, tool-call cards, human-in-the-loop approval.

import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent,
} from 'react';
import {
  Bot, Send, X, Paperclip, Trash2, ChevronDown,
  Check, ImageIcon, Loader2, Zap, Sparkles,
  AlertTriangle, ListOrdered, Cpu, KeyRound,
  MessageCircle, Wrench,
} from 'lucide-react';
import { editPageWithTools, chatWithAI, setApiKey, isApiKeyError, type ChatTurn, type CanvasContext } from '../../services/geminiService';
import {
  getProjectMemory, saveProjectMemory, buildProjectContext, appendAgentSummary,
  type ProjectMemory,
} from '../../services/projectMemory';
import { type CanvasExecutor } from '../../services/canvasExecutor';
import {
  type A2UIMessage,
  type AgentModel,
  AGENT_MODELS,
  toolIcon,
} from '../../types/a2ui';
import { MarkdownText } from '../../utils/markdownRenderer';

// ── Model name mapping → actual API model string ──────────────────────────
const MODEL_API: Record<AgentModel, string> = {
  'gemini-flash':  'gemini-3-flash-preview',
  'gemini-pro':    'gemini-3.1-pro-preview',
  'claude-sonnet': '',   // placeholder — requires Anthropic setup
  'claude-opus':   '',
};

// ── Props ─────────────────────────────────────────────────────────────────
export interface AgentContext {
  pageNumber: number;
  html:       string;
  image:      string;    // raw base64, no data: prefix
  onEdit:     (html: string) => void;
}

interface Props {
  context?:        AgentContext;
  activePage?:     number;
  pageImage?:      string;
  totalPages?:     number;
  extractedPages?: Set<number>;
  executor?:       CanvasExecutor;
  onClose?:        () => void;
  onNavigatePage?: (page: number) => void;
  onSave?:         () => void;
  onDownloadPDF?:  () => void;
  /** Document file name — used as the per-project memory key */
  fileName?:       string;
}

// ── Shimmer skeleton ──────────────────────────────────────────────────────
function Shimmer({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ap-shimmer">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="ap-shimmer-line"
          style={{ width: `${65 + (i % 3) * 12}%` }}
        />
      ))}
    </div>
  );
}


// ── Inline Cover Setup Card ───────────────────────────────────────────────
type CoverStyle = 'orthodox' | 'ornate' | 'classic' | 'modern' | 'minimalist';
type CoverDesignMode = 'full-design' | 'background-only';
type CoverBinding = 'saddle-stitch' | 'perfect-binding';

const COVER_STYLES: { value: CoverStyle; label: string; emoji: string }[] = [
  { value: 'classic',    label: 'Classic',   emoji: '📕' },
  { value: 'modern',     label: 'Modern',    emoji: '🎨' },
  { value: 'ornate',     label: 'Ornate',    emoji: '📜' },
  { value: 'orthodox',   label: 'Orthodox',  emoji: '✝️' },
  { value: 'minimalist', label: 'Minimal',   emoji: '◻️' },
];

const COVER_BINDINGS: { value: CoverBinding; label: string; emoji: string }[] = [
  { value: 'saddle-stitch',   label: 'Saddle Stitch',   emoji: '📖' },
  { value: 'perfect-binding', label: 'Perfect Binding', emoji: '📚' },
];

function CoverSetupCard({ msg, onSubmit, onCancel }: {
  msg: import('../../types/a2ui').A2UICoverSetupMessage;
  onSubmit: (opts: { title: string; author: string; style: CoverStyle; designMode: CoverDesignMode; binding: CoverBinding }) => void;
  onCancel: () => void;
}) {
  const [title,      setTitle]      = useState(msg.suggestedTitle ?? '');
  const [author,     setAuthor]     = useState('');
  const [style,      setStyle]      = useState<CoverStyle>('classic');
  const [designMode, setDesignMode] = useState<CoverDesignMode>('full-design');
  const [binding,    setBinding]    = useState<CoverBinding>('saddle-stitch');

  if (msg.status === 'generating') {
    return (
      <div className="ap-cover-card">
        <div className="ap-cover-card-header"><Sparkles size={13} /> Generating cover…</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 0', color: 'var(--t-text3)', fontSize: '0.78rem' }}>
          <Loader2 size={14} className="animate-spin" /> Creating your cover page…
        </div>
      </div>
    );
  }

  if (msg.status === 'done' || msg.status === 'cancelled') {
    return (
      <div className="ap-cover-card ap-cover-card--done">
        <span>{msg.status === 'done' ? `✅ ${msg.result ?? 'Cover generated.'}` : '✕ Cancelled'}</span>
      </div>
    );
  }

  return (
    <div className="ap-cover-card">
      <div className="ap-cover-card-header"><Sparkles size={13} /> Cover Page Setup</div>
      <p className="ap-cover-card-hint">Fill in the details and I'll generate your cover.</p>

      <input
        className="ap-cover-input"
        placeholder="Title *"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <input
        className="ap-cover-input"
        placeholder="Author (optional)"
        value={author}
        onChange={e => setAuthor(e.target.value)}
      />

      <div className="ap-cover-section-label">Style</div>
      <div className="ap-cover-chips">
        {COVER_STYLES.map(s => (
          <button
            key={s.value}
            className={`ap-cover-chip${style === s.value ? ' ap-cover-chip--on' : ''}`}
            onClick={() => setStyle(s.value)}
          >
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      <div className="ap-cover-section-label">Design mode</div>
      <div className="ap-cover-chips">
        <button className={`ap-cover-chip${designMode === 'full-design' ? ' ap-cover-chip--on' : ''}`} onClick={() => setDesignMode('full-design')}>
          ✦ Full AI Design
        </button>
        <button className={`ap-cover-chip${designMode === 'background-only' ? ' ap-cover-chip--on' : ''}`} onClick={() => setDesignMode('background-only')}>
          ◻ Background Only
        </button>
      </div>

      <div className="ap-cover-section-label">Binding</div>
      <div className="ap-cover-chips">
        {COVER_BINDINGS.map(b => (
          <button
            key={b.value}
            className={`ap-cover-chip${binding === b.value ? ' ap-cover-chip--on' : ''}`}
            onClick={() => setBinding(b.value)}
          >
            {b.emoji} {b.label}
          </button>
        ))}
      </div>

      <div className="ap-cover-actions">
        <button className="ap-cover-cancel" onClick={onCancel}>Cancel</button>
        <button
          className="ap-cover-generate"
          onClick={() => onSubmit({ title: title.trim() || 'Untitled', author: author.trim(), style, designMode, binding })}
          disabled={!title.trim()}
        >
          <Sparkles size={12} /> Generate Cover
        </button>
      </div>
    </div>
  );
}

// ── A2UI message card renderer ────────────────────────────────────────────
function MessageCard({
  msg,
  onApprove,
  onReject,
  onCoverSetupSubmit,
  onCoverSetupCancel,
}: {
  msg: A2UIMessage;
  onApprove?: (id: string) => void;
  onReject?:  (id: string) => void;
  onCoverSetupSubmit?: (id: string, opts: { title: string; author: string; style: CoverStyle; designMode: CoverDesignMode; binding: CoverBinding }) => void;
  onCoverSetupCancel?: (id: string) => void;
}) {
  if (msg.type === 'user') {
    return (
      <div className="ap-msg ap-msg--user">
        {msg.imageDataUrl && (
          <img src={msg.imageDataUrl} alt="attachment" className="ap-msg-img" />
        )}
        <p className="ap-msg-text">{msg.text}</p>
      </div>
    );
  }

  if (msg.type === 'thinking') {
    return (
      <div className="ap-msg ap-msg--agent">
        <div className="ap-msg-header">
          <Cpu size={11} className="ap-msg-icon" />
          <span className="ap-msg-label">{msg.label ?? 'Thinking…'}</span>
        </div>
        <Shimmer lines={3} />
      </div>
    );
  }

  if (msg.type === 'plan') {
    return (
      <div className="ap-msg ap-msg--plan">
        <div className="ap-msg-header">
          <ListOrdered size={11} className="ap-msg-icon" />
          <span className="ap-msg-label">{msg.title}</span>
        </div>
        <ol className="ap-plan-list">
          {msg.steps.map((step, i) => (
            <li key={i} className="ap-plan-step">{step}</li>
          ))}
        </ol>
      </div>
    );
  }

  if (msg.type === 'tool') {
    return (
      <div className={`ap-tool-card ap-tool-card--${msg.status}`}>
        <span className="ap-tool-icon">{toolIcon[msg.name] ?? '⚙️'}</span>
        <span className="ap-tool-name">{msg.name}</span>
        <span className="ap-tool-status">
          {msg.status === 'running' && <Loader2 size={10} className="animate-spin" />}
          {msg.status === 'done'    && <Check size={10} />}
          {msg.status === 'error'   && <X size={10} />}
        </span>
        {msg.summary && msg.status !== 'running' && (
          <span className="ap-tool-summary">{msg.summary}</span>
        )}
      </div>
    );
  }

  if (msg.type === 'approval') {
    return (
      <div className={`ap-approval ap-approval--${msg.status}`}>
        <div className="ap-approval-header">
          <AlertTriangle size={13} />
          <span>{msg.title}</span>
        </div>
        <p className="ap-approval-desc">{msg.description}</p>
        {msg.status === 'pending' && (
          <div className="ap-approval-actions">
            <button
              className="ap-approval-btn ap-approval-btn--approve"
              onClick={() => onApprove?.(msg.id)}
            >
              <Check size={12} /> Approve
            </button>
            <button
              className="ap-approval-btn ap-approval-btn--reject"
              onClick={() => onReject?.(msg.id)}
            >
              <X size={12} /> Reject
            </button>
          </div>
        )}
        {msg.status === 'approved' && (
          <span className="ap-approval-result ap-approval-result--ok">✓ Approved</span>
        )}
        {msg.status === 'rejected' && (
          <span className="ap-approval-result ap-approval-result--no">✕ Rejected</span>
        )}
      </div>
    );
  }

  if (msg.type === 'text') {
    return (
      <div className="ap-msg ap-msg--agent">
        <div className="ap-msg-header">
          <Bot size={11} className="ap-msg-icon" />
          <span className="ap-msg-label">Agent</span>
        </div>
        <MarkdownText text={msg.content} prefix="ap" />
      </div>
    );
  }

  if (msg.type === 'error') {
    return (
      <div className="ap-msg ap-msg--error">
        <AlertTriangle size={13} />
        <span>{msg.message}</span>
      </div>
    );
  }

  if (msg.type === 'cover-setup') {
    return (
      <CoverSetupCard
        msg={msg}
        onSubmit={opts => onCoverSetupSubmit?.(msg.id, opts)}
        onCancel={() => onCoverSetupCancel?.(msg.id)}
      />
    );
  }

  return null;
}

// ── API Key Banner ────────────────────────────────────────────────────────
function KeyBanner({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const save = () => {
    if (!key.trim()) return;
    setApiKey(key.trim());
    onSaved();
  };

  return (
    <div className="ap-keybanner">
      <div className="ap-keybanner-header">
        <KeyRound size={12} />
        <span>Gemini API key expired or missing</span>
      </div>
      <p className="ap-keybanner-hint">
        Get a free key at{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          aistudio.google.com
        </a>
      </p>
      <div className="ap-keybanner-row">
        <input
          ref={inputRef}
          type="password"
          className="ap-keybanner-input"
          placeholder="AIza…"
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          spellCheck={false}
        />
        <button
          className="ap-keybanner-save"
          onClick={save}
          disabled={!key.trim()}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Model selector dropdown ───────────────────────────────────────────────
function ModelSelector({
  model,
  onChange,
}: {
  model: AgentModel;
  onChange: (m: AgentModel) => void;
}) {
  const [open, setOpen] = useState(false);
  const def = AGENT_MODELS.find(m => m.id === model)!;

  return (
    <div className="ap-model-wrap">
      <button
        className="ap-model-btn"
        onClick={() => setOpen(o => !o)}
        title="Switch AI model"
      >
        <span
          className="ap-model-dot"
          style={{ background: def.color }}
        />
        <span className="ap-model-label">{def.label}</span>
        <span className="ap-model-badge" style={{ color: def.color }}>{def.badge}</span>
        <ChevronDown size={10} className={`ap-model-chevron${open ? ' open' : ''}`} />
      </button>

      {open && (
        <div className="ap-model-dropdown">
          {AGENT_MODELS.map(m => (
            <button
              key={m.id}
              className={`ap-model-option${m.id === model ? ' active' : ''}${m.note ? ' ap-model-option--disabled' : ''}`}
              onClick={() => {
                if (!m.note) { onChange(m.id); setOpen(false); }
              }}
              title={m.note}
            >
              <span className="ap-model-dot" style={{ background: m.color }} />
              <span className="ap-model-option-label">{m.label}</span>
              <span className="ap-model-option-badge" style={{ color: m.color }}>{m.badge}</span>
              {m.note && <span className="ap-model-option-note">{m.note}</span>}
              {m.id === model && <Check size={10} className="ap-model-option-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Process indicator ─────────────────────────────────────────────────────
function ProcessBar({ label }: { label: string }) {
  return (
    <div className="ap-process-bar">
      <div className="ap-process-shimmer" />
      <span className="ap-process-label">{label}</span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────
let _msgId = 0;
const uid = () => `m${++_msgId}`;

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => {
      const result = reader.result as string;
      const [, data] = result.split(',');
      res(data ?? '');
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ── AgentPanel ─────────────────────────────────────────────────────────────
// ── Document status dot strip (Pencil-style page overview) ───────────────
function DocumentStatus({
  totalPages, extractedPages, activePage, onNavigate,
}: {
  totalPages:     number;
  extractedPages: Set<number>;
  activePage:     number;
  onNavigate:     (page: number) => void;
}) {
  if (totalPages === 0) return null;
  const doneCount = extractedPages.size;
  return (
    <div className="ap-doc-status">
      <span className="ap-doc-label">{doneCount}/{totalPages} extracted</span>
      <div className="ap-doc-dots">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            className={`ap-doc-dot${p === activePage ? ' ap-doc-dot--active' : ''}${extractedPages.has(p) ? ' ap-doc-dot--done' : ''}`}
            onClick={() => onNavigate(p)}
            title={`Page ${p}${extractedPages.has(p) ? ' ✓ extracted' : ' — not extracted'}`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Detect navigation intent — "go to page 3", "show page 2" ─────────────
function parseNavigateIntent(text: string): { page: number } | null {
  const t = text.trim().toLowerCase();
  const m = t.match(/\b(?:go\s+to|navigate\s+to|show|open|jump\s+to)\s+page\s*(\d+)/);
  if (m) return { page: parseInt(m[1]) };
  return null;
}

// ── Detect extraction intent — bypasses AI for reliable execution ─────────
function parseExtractionIntent(text: string): { type: 'page'; page: number; force: boolean } | { type: 'all'; force: boolean } | null {
  const t = text.trim().toLowerCase();
  // "extract all" / "scan all" / "digitize all"
  if (/\b(extract|scan|digitize)\b.*\ball\b/.test(t)) {
    return { type: 'all', force: /\b(re-?extract|force|again)\b/.test(t) };
  }
  // "extract page 3" / "scan page 3" / "extract 3" / "page 3 extract"
  const m = t.match(/(?:extract|scan|digitize)\s*(?:page\s*)?(\d+)|(?:page\s*)?(\d+)\s*(?:extract|scan)/);
  if (m) {
    const page = parseInt(m[1] ?? m[2]);
    return { type: 'page', page, force: /\b(re-?extract|force|again)\b/.test(t) };
  }
  return null;
}

export default function AgentPanel({
  context, activePage = 1, pageImage = '',
  totalPages = 0, extractedPages = new Set<number>(),
  executor, onClose, onNavigatePage, onSave, onDownloadPDF,
  fileName = '',
}: Props) {
  const [panelMode,  setPanelMode]  = useState<'chat' | 'agent'>('chat');
  const [messages,   setMessages]   = useState<A2UIMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [model,      setModel]      = useState<AgentModel>('gemini-flash');
  const [refImages,  setRefImages]  = useState<{ name: string; base64: string; preview: string }[]>([]);
  const [processLabel, setProcess]  = useState('');
  const [keyError,   setKeyError]   = useState(false);

  // ── Per-document memory (load once on mount, save on unmount) ─────────────
  const memoryRef = useRef<ProjectMemory>(getProjectMemory(fileName || 'untitled'));

  // Restore persisted chat history on mount (so panel reopen continues the conversation)
  const [historyRestored, setHistoryRestored] = useState(false);
  useEffect(() => {
    if (historyRestored || !fileName) return;
    const mem = getProjectMemory(fileName);
    memoryRef.current = mem;
    if (mem.chatHistory.length > 0) {
      setChatHistory(mem.chatHistory);
    }
    setHistoryRestored(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]);

  // Save memory whenever chat history changes (debounced via unmount)
  const chatHistoryRef = useRef(chatHistory);
  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);

  useEffect(() => {
    return () => {
      if (!fileName) return;
      const mem = memoryRef.current;
      saveProjectMemory({ ...mem, chatHistory: chatHistoryRef.current });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]);

  // Build a fresh project context string on every render (live doc state)
  const projectContext = buildProjectContext({
    docKey:         fileName || 'untitled',
    totalPages,
    extractedPages,
    activePage,
    memory:         memoryRef.current,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const refFileRef     = useRef<HTMLInputElement>(null);

  // Pending approval callbacks — keyed by message ID
  const pendingApprovalsRef = useRef<Map<string, (approved: boolean) => void>>(new Map());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Revoke all object URLs when panel unmounts to prevent memory leaks
  useEffect(() => {
    return () => {
      setRefImages(prev => {
        prev.forEach(r => URL.revokeObjectURL(r.preview));
        return prev;
      });
    };
  }, []);

  const addMsg = useCallback((msg: A2UIMessage) => {
    setMessages(prev => [...prev, msg]);
    return msg.id;
  }, []);

  const updateMsg = useCallback((id: string, patch: Partial<A2UIMessage>) => {
    setMessages(prev =>
      prev.map(m => m.id === id ? { ...m, ...patch } as A2UIMessage : m),
    );
  }, []);

  // ── Reference image upload ──────────────────────────────────────────────
  const addReferenceImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const base64  = await fileToBase64(file);
    const preview = URL.createObjectURL(file);
    setRefImages(prev => [...prev, { name: file.name, base64, preview }]);
  }, []);

  const handleRefFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await addReferenceImage(file);
    e.target.value = '';
  };

  const removeRef = (idx: number) => {
    setRefImages(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ── Attachment (for chat message) ───────────────────────────────────────
  const [attachment, setAttachment] = useState<string | null>(null);
  const [attachName, setAttachName] = useState('');

  const attachFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setAttachment(reader.result as string);
    reader.readAsDataURL(file);
    setAttachName(file.name);
  }, []);

  // ── Approval handlers ───────────────────────────────────────────────────
  const handleApprove = (id: string) => {
    updateMsg(id, { status: 'approved' } as Partial<A2UIMessage>);
    pendingApprovalsRef.current.get(id)?.(true);
    pendingApprovalsRef.current.delete(id);
  };

  const handleReject = (id: string) => {
    updateMsg(id, { status: 'rejected' } as Partial<A2UIMessage>);
    pendingApprovalsRef.current.get(id)?.(false);
    pendingApprovalsRef.current.delete(id);
  };

  const handleCoverSetupCancel = (id: string) => {
    updateMsg(id, { status: 'cancelled' } as Partial<A2UIMessage>);
  };

  const handleCoverSetupSubmit = async (
    id: string,
    opts: { title: string; author: string; style: CoverStyle; designMode: CoverDesignMode; binding: CoverBinding },
  ) => {
    if (!executor) return;
    updateMsg(id, { status: 'generating' } as Partial<A2UIMessage>);
    try {
      const result = JSON.parse(await executor.execute('_generateCover', {
        mode: 'generate',
        title: opts.title,
        author: opts.author || undefined,
        style: opts.style,
        designMode: opts.designMode,
        binding: opts.binding,
      }) as string);
      if (result.error) {
        updateMsg(id, {
          status: 'done',
          result: `❌ ${result.error}`,
        } as Partial<A2UIMessage>);
      } else {
        updateMsg(id, {
          status: 'done',
          result: '✅ Cover page generated and applied.',
        } as Partial<A2UIMessage>);
        // Auto-navigate to cover page so user sees the result
        onNavigatePage?.(0);
      }
    } catch (err) {
      updateMsg(id, {
        status: 'done',
        result: `❌ ${(err as Error).message ?? 'Cover generation failed.'}`,
      } as Partial<A2UIMessage>);
    }
  };

  // ── Send ────────────────────────────────────────────────────────────────
  const canSend = (input.trim() || attachment) && !loading && (panelMode === 'chat' || !!executor);

  // ── Simple chat send (no tools, just conversational AI) ─────────────────
  const sendChat = async (overrideText?: string) => {
    const text = overrideText ?? input.trim();
    if (!text || loading) return;

    const userImageUrl = attachment ?? undefined;
    addMsg({ type: 'user', id: uid(), text, imageDataUrl: userImageUrl });
    setInput('');
    setAttachment(null);
    setAttachName('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Build chat history
    const newHistory: ChatTurn[] = [
      ...chatHistory,
      { role: 'user', text, imageDataUrl: userImageUrl },
    ];
    setChatHistory(newHistory);

    setLoading(true);
    const thinkId = uid();
    addMsg({ type: 'thinking', id: thinkId, label: 'Thinking…' });

    try {
      const canvasCtx: CanvasContext | undefined =
        context ? { pageNumber: context.pageNumber, html: context.html, image: context.image } : undefined;

      const reply = await chatWithAI(newHistory, canvasCtx, projectContext);

      setMessages(prev => prev.filter(m => !(m.type === 'thinking' && m.id === thinkId)));
      addMsg({ type: 'text', id: uid(), content: reply });
      setChatHistory(prev => [...prev, { role: 'ai', text: reply }]);
    } catch (err) {
      setMessages(prev => prev.filter(m => !(m.type === 'thinking' && m.id === thinkId)));
      if (isApiKeyError(err)) setKeyError(true);
      else addMsg({ type: 'error', id: uid(), message: (err as Error).message ?? 'Chat failed.' });
    } finally {
      setLoading(false);
    }
  };

  const send = async (overrideText?: string) => {
    // Chat mode — simple conversational AI (no tools)
    if (panelMode === 'chat') return sendChat(overrideText);

    const text = overrideText ?? input.trim();
    if (!text || loading || !executor) return;

    // Add user message
    addMsg({
      type: 'user', id: uid(), text,
      imageDataUrl: attachment ?? undefined,
    });
    setInput('');
    setAttachment(null);
    setAttachName('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setLoading(true);

    // ── Fast path: extraction intent → run directly, no AI needed ──────────
    const extractIntent = parseExtractionIntent(text);
    if (extractIntent) {
      try {
        const totalPages = executor.execute('getTotalPages', {});
        const total = JSON.parse(totalPages as string).totalPages as number ?? 1;

        if (extractIntent.type === 'page') {
          const { page, force } = extractIntent;
          const tId = uid();
          setProcess(`Extracting page ${page}…`);
          onNavigatePage?.(page);
          addMsg({ type: 'tool', id: tId, name: 'extractPage', status: 'running', args: { pageNumber: page } });
          const result = JSON.parse(await executor.execute('extractPage', { pageNumber: page, force }) as string);
          const imgNote = result.imagesFound > 0 ? ` + ${result.imagesFound} image${result.imagesFound > 1 ? 's' : ''} auto-filled` : '';
          updateMsg(tId, { status: result.error ? 'error' : 'done', summary: result.error ?? `Page ${page} extracted${imgNote}` });
          const remaining: number = result.placeholdersRemaining ?? 0;
          const retryHint = remaining > 0
            ? `\n⚠️ ${remaining} image placeholder${remaining > 1 ? 's' : ''} couldn't be auto-cropped. Say **"fill images on page ${page}"** to retry.`
            : '';
          addMsg({ type: 'text', id: uid(), content: result.error
            ? `❌ ${result.error}`
            : `✅ Page ${page} extracted successfully.${imgNote ? `\n🖼️ ${result.imagesFound} image${result.imagesFound > 1 ? 's' : ''} detected and placed automatically.` : ''}${retryHint}` });

        } else {
          // extract all
          setProcess('Extracting all pages…');
          for (let n = 1; n <= total; n++) {
            const tId = uid();
            setProcess(`Extracting page ${n} of ${total}…`);
            addMsg({ type: 'tool', id: tId, name: 'extractPage', status: 'running', args: { pageNumber: n } });
            const result = JSON.parse(await executor.execute('extractPage', { pageNumber: n, force: extractIntent.force }) as string);
            updateMsg(tId, { status: result.error ? 'error' : 'done', summary: result.error ?? (result.cached ? 'cached' : 'extracted') });
          }
          addMsg({ type: 'text', id: uid(), content: `✅ All ${total} pages extracted.` });
        }
      } catch (err) {
        if (isApiKeyError(err)) setKeyError(true);
        else addMsg({ type: 'error', id: uid(), message: (err as Error).message ?? 'Extraction failed.' });
      } finally {
        setLoading(false);
        setProcess('');
      }
      return;
    }

    // ── Fill images intent — crops image regions from original scan ─────────
    if (
      /\b(fill|auto.?fill|place|restore)\b.*\bimage/i.test(text) ||
      /\bimage.*\b(fill|place)\b/i.test(text) ||
      /\bimage\b.*(not yet|missing|placeholder|not placed|still there|not filled|is there|show)/i.test(text) ||
      /\b(placeholder|image.?box)\b.*(still|fill|replace|fix)/i.test(text) ||
      /\b(fix|add|get|show|load|put)\b.*\bimage/i.test(text)
    ) {
      const tId = uid();
      const targetPage = context?.pageNumber ?? activePage;
      setProcess(`Finding images on page ${targetPage}…`);
      addMsg({ type: 'tool', id: tId, name: 'autoFillImages', status: 'running', args: { pageNumber: targetPage } });
      try {
        const result = JSON.parse(await executor.execute('autoFillImages', { pageNumber: targetPage }) as string);
        updateMsg(tId, { status: result.error ? 'error' : 'done', summary: result.error ?? `${result.imagesFound} image${result.imagesFound !== 1 ? 's' : ''} filled` });
        addMsg({ type: 'text', id: uid(), content: result.error
          ? `❌ ${result.error}`
          : result.imagesFound > 0
            ? `🖼️ ${result.imagesFound} image${result.imagesFound !== 1 ? 's' : ''} detected and placed from the original scan.`
            : 'No image placeholders found on this page.' });
      } catch (err) {
        updateMsg(tId, { status: 'error' });
        addMsg({ type: 'error', id: uid(), message: (err as Error).message ?? 'Image fill failed.' });
      } finally {
        setLoading(false);
        setProcess('');
      }
      return;
    }

    // ── Cover page intent — show A2UI setup card instead of auto-generating ──
    if (
      /\b(cover|cover.?page|book.?cover)\b/i.test(text) &&
      /\b(ge[nr]\w*|cre\w*|make|design\w*|build|improv\w*|enhanc\w*|updat\w*|add|new|set.?up|want|need)\b/i.test(text)
    ) {
      const suggestedTitle = text
        .replace(/\b(ge[nr]\w*|cre\w*|make|design\w*|build|improv\w*|enhanc\w*|updat\w*|add|new|set.?up|want|need|a|an|the|cover|page|book|for|me|please|with|style|orthodox|ornate|classic|modern|minimalist)\b/gi, '')
        .replace(/\s+/g, ' ').trim();
      addMsg({ type: 'cover-setup', id: uid(), suggestedTitle: suggestedTitle || '', status: 'pending' });
      setLoading(false);
      setProcess('');
      return;
    }

    // ── Navigate intent — instant, no AI ───────────────────────────────────
    const navIntent = parseNavigateIntent(text);
    if (navIntent) {
      onNavigatePage?.(navIntent.page);
      addMsg({ type: 'text', id: uid(), content: `📄 Navigated to page ${navIntent.page}.` });
      setLoading(false);
      setProcess('');
      return;
    }

    // ── Save / export shortcuts ─────────────────────────────────────────────
    if (/\b(save|save doc|save document)\b/i.test(text) && onSave) {
      onSave();
      addMsg({ type: 'text', id: uid(), content: '💾 Document saved to library.' });
      setLoading(false);
      setProcess('');
      return;
    }
    if (/\b(export|download|pdf)\b/i.test(text) && onDownloadPDF) {
      onDownloadPDF();
      addMsg({ type: 'text', id: uid(), content: '📄 PDF export started.' });
      setLoading(false);
      setProcess('');
      return;
    }

    // ── Standard path: editing / layout instructions → use AI ──────────────
    setProcess('Analyzing document…');

    // Add thinking shimmer
    const thinkId = uid();
    addMsg({ type: 'thinking', id: thinkId, label: 'Reading page structure…' });

    try {
      const apiModel = MODEL_API[model];
      if (!apiModel) {
        removeThinking(thinkId);
        addMsg({ type: 'error', id: uid(), message: `${AGENT_MODELS.find(m => m.id === model)?.label} requires additional API setup.` });
        return;
      }

      const summary = await editPageWithTools(
        context?.image ?? pageImage,
        context?.html ?? '',
        text,
        executor,
        context?.pageNumber ?? activePage,
        {
          model: apiModel,
          referenceImages: refImages.map(r => r.base64),
          projectContext,

          onToolCall: (fb) => {
            const label: Record<string, string> = {
              extractPage:          `Extracting page ${(fb as unknown as {args?: {pageNumber?: number}}).args?.pageNumber ?? ''}…`,
              extractAllPages:      'Extracting all pages…',
              getDocumentStructure: 'Reading document structure…',
              editTextBlock:        'Editing text…',
              editImageFrame:       'Editing image frame…',
              setColumnLayout:      'Setting column layout…',
              insertElement:        'Inserting element…',
              deleteElement:        'Deleting element…',
              batchEdit:            'Applying batch edits…',
              getPageScreenshot:    'Capturing screenshot…',
              setActivePage:        'Navigating to page…',
              openCoverSetup:       'Opening cover setup…',
            };
            setProcess(label[fb.name] ?? `Running ${fb.name}…`);
            // Remove thinking shimmer on first real tool call
            setMessages(prev => prev.filter(m => !(m.type === 'thinking' && m.id === thinkId)));
            // When openCoverSetup completes, inject the A2UI cover-setup card
            if (fb.name === 'openCoverSetup' && fb.status === 'done') {
              // Extract suggestedTitle from Gemini args, fall back to cleaned fileName
              const geminiTitle = (fb.args as Record<string, unknown>)?.suggestedTitle as string | undefined;
              const fallbackTitle = fileName
                ? fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim()
                : '';
              const suggestedTitle = geminiTitle || fallbackTitle;
              // Deduplicate: only allow one pending cover-setup card at a time
              setMessages(prev => {
                const hasPending = prev.some(m => m.type === 'cover-setup' && m.status === 'pending');
                if (hasPending) return prev;
                return [...prev, { type: 'cover-setup', id: uid(), suggestedTitle, status: 'pending' }];
              });
              return;
            }
            // Upsert tool card
            setMessages(prev => {
              const existing = prev.findIndex(m => m.type === 'tool' && m.id === fb.id);
              const toolMsg: A2UIMessage = {
                type:    'tool',
                id:      fb.id,
                name:    fb.name,
                status:  fb.status,
                summary: fb.summary,
              };
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = toolMsg;
                return next;
              }
              return [...prev, toolMsg];
            });
          },

          onApprovalRequest: (id, action, description) =>
            new Promise<boolean>(resolve => {
              // Remove thinking shimmer
              setMessages(prev => prev.filter(m => !(m.type === 'thinking' && m.id === thinkId)));
              setProcess('Waiting for approval…');

              // Add approval card
              const approvalMsg: A2UIMessage = {
                type:        'approval',
                id,
                title:       `Approve: ${action}`,
                description,
                status:      'pending',
              };
              setMessages(prev => [...prev, approvalMsg]);
              pendingApprovalsRef.current.set(id, resolve);
            }),
        },
      );

      // Remove any remaining thinking shimmer
      setMessages(prev => prev.filter(m => !(m.type === 'thinking' && m.id === thinkId)));
      addMsg({ type: 'text', id: uid(), content: summary });

      // Log to per-document memory so future sessions know what was done
      if (fileName && summary && summary !== 'Done.') {
        const brief = `"${text.slice(0, 60)}${text.length > 60 ? '…' : ''}" → ${summary.replace(/[*_`]/g, '').slice(0, 80)}`;
        memoryRef.current = appendAgentSummary(memoryRef.current, brief);
        saveProjectMemory({ ...memoryRef.current, chatHistory: chatHistoryRef.current });
      }

    } catch (err) {
      setMessages(prev => prev.filter(m => !(m.type === 'thinking' && m.id === thinkId)));
      if (isApiKeyError(err)) {
        setKeyError(true);
      } else {
        addMsg({ type: 'error', id: uid(), message: (err as Error).message ?? 'Something went wrong.' });
      }
    } finally {
      setLoading(false);
      setProcess('');
    }
  };

  function removeThinking(thinkId: string) {
    setMessages(prev => prev.filter(m => !(m.type === 'thinking' && m.id === thinkId)));
  }

  const growTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const hasResult = !!context;
  const unextractedCount = totalPages - extractedPages.size;

  // ── Context-aware chips ──────────────────────────────────────────────────
  const CHAT_CHIPS = [
    ...(hasResult
      ? [
          { icon: '📖', text: 'What does this page say?',       cat: 'ai' },
          { icon: '🔤', text: 'Translate this to English',      cat: 'ai' },
          { icon: '📝', text: 'Summarize this page',            cat: 'ai' },
          { icon: '❓', text: 'What language is this?',          cat: 'ai' },
        ]
      : [
          { icon: '👋', text: 'How do I get started?',           cat: 'ai' },
          { icon: '📄', text: 'What file types are supported?',  cat: 'ai' },
        ]),
  ];

  const AGENT_CHIPS = [
    ...(unextractedCount > 0
      ? [{ icon: '📥', text: `Extract page ${activePage}`, cat: 'extract' }]
      : []),
    ...(unextractedCount > 1
      ? [{ icon: '📚', text: 'Extract all pages', cat: 'extract' }]
      : []),
    ...(hasResult
      ? [
          { icon: '🖼️', text: 'Fill images on this page',   cat: 'ai'     },
          { icon: '🚫', text: 'Remove all borders and boxes', cat: 'style'  },
          { icon: '⬛', text: 'Make this two columns',       cat: 'layout' },
          { icon: '≡',  text: 'Justify all body text',       cat: 'style'  },
          { icon: '↑',  text: 'Increase heading font sizes',  cat: 'style'  },
          { icon: '—',  text: 'Add a divider after the title', cat: 'layout' },
          { icon: '🔍', text: 'Analyze and review this page',  cat: 'ai'   },
          { icon: '🎨', text: 'Match my reference image style', cat: 'ai'  },
          { icon: '📖', text: 'Generate a cover page',          cat: 'ai'  },
        ]
      : []),
    { icon: '📖', text: 'Create an Orthodox cover page',   cat: 'ai' },
  ];

  const CHIPS = panelMode === 'chat' ? CHAT_CHIPS : AGENT_CHIPS;

  return (
    <aside className="agent-panel">

      {/* ── Header ── */}
      <div className="ap-header">
        <div className="ap-header-icon">
          {panelMode === 'chat' ? <MessageCircle size={12} /> : <Sparkles size={12} />}
        </div>
        <span className="ap-header-title">{panelMode === 'chat' ? 'Chat' : 'Agent'}</span>

        {/* Mode toggle pill */}
        <div className="ap-mode-toggle">
          <button
            className={`ap-mode-btn${panelMode === 'chat' ? ' active' : ''}`}
            onClick={() => setPanelMode('chat')}
            title="Simple chat — ask questions about your document"
          >
            <MessageCircle size={10} />
            Chat
          </button>
          <button
            className={`ap-mode-btn${panelMode === 'agent' ? ' active' : ''}`}
            onClick={() => setPanelMode('agent')}
            title="MCP Agent — edit layout with AI tools"
          >
            <Wrench size={10} />
            Agent
          </button>
        </div>

        {panelMode === 'agent' && <ModelSelector model={model} onChange={setModel} />}

        <button
          className="ap-header-btn"
          onClick={() => { setMessages([]); setChatHistory([]); }}
          disabled={messages.length === 0}
          title="Clear conversation"
        >
          <Trash2 size={12} />
        </button>
        {onClose && (
          <button className="ap-header-btn" onClick={onClose} title="Close agent panel">
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── Reference Images (Agent mode only) ── */}
      {panelMode === 'agent' && (
        <div className="ap-refs">
          <div className="ap-refs-header">
            <ImageIcon size={10} />
            <span>Reference Images</span>
            <button
              className="ap-refs-add"
              onClick={() => refFileRef.current?.click()}
              title="Add reference image"
            >
              + Add
            </button>
          </div>
          {refImages.length > 0 && (
            <div className="ap-refs-strip">
              {refImages.map((r, i) => (
                <div key={i} className="ap-ref-thumb">
                  <img src={r.preview} alt={r.name} className="ap-ref-img" />
                  <button
                    className="ap-ref-remove"
                    onClick={() => removeRef(i)}
                    title="Remove"
                  >
                    <X size={8} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input ref={refFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleRefFile} />
        </div>
      )}

      {/* ── Process indicator ── */}
      {loading && processLabel && <ProcessBar label={processLabel} />}

      {/* ── API key banner (shown when key is expired/missing) ── */}
      {keyError && <KeyBanner onSaved={() => setKeyError(false)} />}

      {/* ── Messages stream ── */}
      <div className="ap-messages">
        {messages.length === 0 && (
          <div className="ap-empty">
            {panelMode === 'chat'
              ? <MessageCircle size={24} className="ap-empty-icon" />
              : <Bot size={24} className="ap-empty-icon" />
            }
            <p className="ap-empty-title">
              {panelMode === 'chat'
                ? (hasResult ? `Chat about page ${context!.pageNumber}` : 'Document Chat')
                : (totalPages === 0 ? 'AI Layout Agent' : hasResult ? `Page ${context!.pageNumber}` : `${totalPages}-page document`)
              }
            </p>

            {/* Document status dots (Agent mode only) */}
            {panelMode === 'agent' && totalPages > 0 && (
              <DocumentStatus
                totalPages={totalPages}
                extractedPages={extractedPages}
                activePage={activePage}
                onNavigate={(p) => { onNavigatePage?.(p); }}
              />
            )}

            <p className="ap-empty-sub">
              {panelMode === 'chat'
                ? (hasResult
                  ? 'Ask questions, translate, or summarize your document.'
                  : 'Upload a document to start chatting about it.')
                : (totalPages === 0
                  ? 'Open a document to get started.'
                  : unextractedCount > 0
                  ? `${unextractedCount} page${unextractedCount > 1 ? 's' : ''} not yet extracted. Start below.`
                  : 'All pages extracted. Give me a layout instruction.')
              }
            </p>

            {CHIPS.length > 0 && (
              <div className="ap-chips">
                {CHIPS.map(chip => (
                  <button
                    key={chip.text}
                    className={`ap-chip ap-chip--${chip.cat}`}
                    onClick={() => send(chip.text)}
                    disabled={loading}
                  >
                    <span>{chip.icon}</span>
                    {chip.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map(msg => (
          <MessageCard
            key={msg.id}
            msg={msg}
            onApprove={handleApprove}
            onReject={handleReject}
            onCoverSetupSubmit={handleCoverSetupSubmit}
            onCoverSetupCancel={handleCoverSetupCancel}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Attachment preview ── */}
      {attachment && (
        <div className="ap-attachment">
          <img src={attachment} alt={attachName} className="ap-attachment-thumb" />
          <span className="ap-attachment-name">{attachName || 'Image'}</span>
          <button
            className="ap-attachment-remove"
            onClick={() => { setAttachment(null); setAttachName(''); }}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── Input row ── */}
      <div className="ap-input-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={async e => {
            const f = e.target.files?.[0];
            if (f) await attachFile(f);
            e.target.value = '';
          }}
        />
        <button
          className={`ap-attach-btn${attachment ? ' active' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          title="Attach image"
        >
          <Paperclip size={13} />
        </button>
        <textarea
          ref={textareaRef}
          className="ap-textarea"
          placeholder={
            panelMode === 'chat'
              ? (hasResult ? `Ask about page ${context!.pageNumber}…` : 'Ask me anything…')
              : (!executor
                ? 'Open a document first…'
                : hasResult
                ? `Instruct agent for page ${context!.pageNumber}…`
                : `Ask agent to extract page ${activePage}…`)
          }
          value={input}
          rows={1}
          disabled={loading || (panelMode === 'agent' && !executor)}
          onChange={e => { setInput(e.target.value); growTextarea(); }}
          onKeyDown={onKey}
        />
        <button
          className="ap-send-btn"
          onClick={() => send()}
          disabled={!canSend}
          title="Send (Enter)"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
      </div>

      {/* ── Model note (Claude not yet available, Agent mode only) ── */}
      {panelMode === 'agent' && (model === 'claude-sonnet' || model === 'claude-opus') && (
        <div className="ap-model-note">
          <Zap size={10} />
          {AGENT_MODELS.find(m => m.id === model)?.note}
        </div>
      )}

    </aside>
  );
}
