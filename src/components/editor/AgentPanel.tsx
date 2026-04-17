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
  AlertTriangle, AlertCircle, ListOrdered, Cpu, KeyRound,
  MessageCircle, Wrench,
} from 'lucide-react';
import { editPageWithTools, chatWithAI, setApiKey, isApiKeyError, setActiveModel, generateCoverBackground, buildEditableCoverHTML, type ChatTurn, type CanvasContext, type CoverStyle as CoverStyle_, type BindingType as BindingType_, type CoverDesignMode as CoverDesignMode_ } from '../../services/geminiService';
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
  'claude-sonnet': 'claude-3-5-sonnet-20240620',
  'claude-opus':   'claude-3-opus-20240229',
  'minimax-m27':   'MiniMax-M2.7',
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
  onApplyCover?:   (html: string) => void;
  onSave?:         () => void;
  onDownloadPDF?:  () => void;
  /** Document file name — used as the per-project memory key */
  fileName?:       string;
  /** Currently selected element on the canvas — fed into the agent's
   *  system context so edit requests are scoped to this element. */
  selection?:      { id: string; tag: string } | null;
}

// ── Thinking dots (replaces shimmer skeleton) ─────────────────────────────
function ThinkingDots() {
  return (
    <div className="ap-thinking">
      <span className="ap-thinking-dot" style={{ animationDelay: '0ms' }} />
      <span className="ap-thinking-dot" style={{ animationDelay: '180ms' }} />
      <span className="ap-thinking-dot" style={{ animationDelay: '360ms' }} />
    </div>
  );
}


// ── Inline Cover Setup Card ───────────────────────────────────────────────
type CoverStyle = 'orthodox' | 'ornate' | 'classic' | 'modern' | 'minimalist';
type CoverDesignMode = 'full-design' | 'background-only';
type CoverBinding = 'saddle-stitch' | 'perfect-binding';

interface CoverTemplate {
  label:    string;
  labelAm:  string;   // Amharic label
  desc:     string;
  style:    CoverStyle;
  prompt:   string;
  bg:       string;   // mini preview background
  accent:   string;   // mini preview accent element color
  layout:   'cross' | 'band-top' | 'solid' | 'band-left' | 'emblem';
}

// Print-quality, commonly used Ethiopian book/booklet covers — simple enough for any printer
const COVER_TEMPLATES: CoverTemplate[] = [
  {
    label: 'Church Bulletin',  labelAm: 'ቤተ ክርስቲያን ዜና',
    desc: 'Dark solid + Ethiopian cross — works on B&W printers',
    style: 'orthodox', layout: 'cross',
    bg: '#1a0a00', accent: '#c9a84c',
    prompt: 'Simple Ethiopian Lalibela cross centered on a deep dark burgundy background, single gold cross, clean solid color — no complex patterns, print-ready design',
  },
  {
    label: 'Prayer Book',      labelAm: 'ፀሎት መጽሐፍ',
    desc: 'Navy + gold cross — classic liturgical booklet',
    style: 'orthodox', layout: 'cross',
    bg: '#0f1f3d', accent: '#e8c96d',
    prompt: 'Navy blue prayer book cover, centered Orthodox cross in gold, simple clean layout, suitable for printing, minimal ornamentation',
  },
  {
    label: 'Textbook',         labelAm: 'የትምህርት መጽሐፍ',
    desc: 'Colored top band + clean white body — Ethiopian school standard',
    style: 'classic', layout: 'band-top',
    bg: '#f5f5f5', accent: '#1a56a0',
    prompt: 'Ethiopian school textbook cover, bold blue horizontal band across the top third, clean white background below, professional academic look, print-ready',
  },
  {
    label: 'Amharic Novel',    labelAm: 'ልቦለድ',
    desc: 'Warm solid color, bold title — standard paperback',
    style: 'classic', layout: 'solid',
    bg: '#7c3a1a', accent: '#f5c06d',
    prompt: 'Ethiopian novel book cover, warm deep terracotta background, clean minimal composition, bold centered title area, simple and elegant — easy to print',
  },
  {
    label: 'Church Program',   labelAm: 'ፕሮግራም',
    desc: 'Light background + red accent band — event handout',
    style: 'minimalist', layout: 'band-top',
    bg: '#ffffff', accent: '#b91c1c',
    prompt: 'Ethiopian church event program cover, white or cream background, red accent band, clean minimal layout, suitable for home or office printing',
  },
  {
    label: 'Research / Report', labelAm: 'ምርምር / ሪፖርት',
    desc: 'Formal navy with left accent — university/NGO style',
    style: 'classic', layout: 'band-left',
    bg: '#1e3a5f', accent: '#38bdf8',
    prompt: 'Formal Ethiopian academic report cover, deep navy background, thin bright accent stripe on left margin, clean professional typography layout',
  },
  {
    label: 'Church Magazine',  labelAm: 'መጽሔት',
    desc: 'Clean white + green header — bi-weekly/monthly bulletin',
    style: 'minimalist', layout: 'band-top',
    bg: '#f8f8f4', accent: '#166534',
    prompt: 'Ethiopian church magazine cover, clean off-white background, forest green header band, simple elegant layout, easy to photocopy or print',
  },
  {
    label: "Children's Book",  labelAm: 'ለልጆች',
    desc: 'Bright solid + playful — easy to print in color',
    style: 'modern', layout: 'emblem',
    bg: '#fbbf24', accent: '#7c3aed',
    prompt: 'Ethiopian children\'s book cover, bright sunny yellow background, simple playful illustration in purple, clean bold colors that print well, welcoming and fun',
  },
];

const COVER_STYLES: { value: CoverStyle; label: string }[] = [
  { value: 'orthodox',   label: 'Orthodox'   },
  { value: 'classic',    label: 'Classic'    },
  { value: 'modern',     label: 'Modern'     },
  { value: 'ornate',     label: 'Ornate'     },
  { value: 'minimalist', label: 'Minimal'    },
];

const COVER_BINDINGS: { value: CoverBinding; label: string; sub: string }[] = [
  { value: 'saddle-stitch',   label: 'Single Page',      sub: 'Front cover only (A4)' },
  { value: 'perfect-binding', label: 'Full Spread',      sub: 'Front + spine + back' },
];

const TITLE_MAX = 80;

const GENERATING_STEPS = [
  'Writing the art prompt…',
  'Generating your cover image…',
  'Laying out title and typography…',
];

function CoverSetupCard({ msg, onSubmit, onCancel }: {
  msg: import('../../types/a2ui').A2UICoverSetupMessage;
  onSubmit: (opts: { title: string; subtitle: string; author: string; style: CoverStyle; designMode: CoverDesignMode; binding: CoverBinding; customPrompt: string }) => void;
  onCancel: () => void;
}) {
  const [title,        setTitle]        = useState(msg.suggestedTitle ?? '');
  const [subtitle,     setSubtitle]     = useState('');
  const [author,       setAuthor]       = useState('');
  const [style,        setStyle]        = useState<CoverStyle>('classic');
  const [designMode,   setDesignMode]   = useState<CoverDesignMode>('full-design');
  const [binding,      setBinding]      = useState<CoverBinding>('saddle-stitch');
  const [customPrompt, setCustomPrompt] = useState('');
  const [activeTemplate, setActiveTemplate] = useState<number | null>(null);
  const [touched,      setTouched]      = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  const applyTemplate = (idx: number) => {
    const t = COVER_TEMPLATES[idx];
    setStyle(t.style);
    setCustomPrompt(t.prompt);
    setActiveTemplate(idx);
  };

  const handleSubmit = () => {
    setTouched(true);
    if (!title.trim()) {
      titleRef.current?.focus();
      return;
    }
    onSubmit({ title: title.trim(), subtitle: subtitle.trim(), author: author.trim(), style, designMode, binding, customPrompt: customPrompt.trim() });
  };

  // Keyboard shortcuts: Escape → cancel, Enter on title input → submit
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (msg.status === 'generating') {
    const step = msg.generatingStep ?? GENERATING_STEPS[0];
    return (
      <div className="ap-cover-card">
        <div className="ap-cover-card-header"><Sparkles size={13} /> Generating cover…</div>
        <div className="ap-cover-generating">
          <div className="ap-cover-generating-track">
            <div className="ap-cover-generating-bar" />
          </div>
          <div className="ap-cover-generating-step">
            <Loader2 size={12} className="animate-spin" />
            <span>{step}</span>
          </div>
          <p className="ap-cover-generating-hint">This usually takes 10–20 seconds. The AI is composing your cover from scratch.</p>
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

  // 'pending' or 'error' — show the form (local state is preserved on retry)
  const titleInvalid = touched && !title.trim();
  const titleNearLimit = title.length > TITLE_MAX * 0.85;

  return (
    <div className="ap-cover-card">
      <div className="ap-cover-card-header"><Sparkles size={13} /> Cover Page Generator</div>
      <p className="ap-cover-card-hint">Pick a template or describe your own vision.</p>

      {/* ── Error banner (shown on retry after failure) ── */}
      {msg.status === 'error' && msg.errorMsg && (
        <div className="ap-cover-error-banner">
          <span className="ap-cover-error-icon"><AlertCircle size={12} /></span>
          {msg.errorMsg} — adjust your settings and try again.
        </div>
      )}

      {/* ── Quick templates ── */}
      <div className="ap-cover-section-label">Quick Templates</div>
      <div className="ap-cover-templates">
        {COVER_TEMPLATES.map((t, i) => (
          <button
            key={i}
            className={`ap-cover-template${activeTemplate === i ? ' ap-cover-template--on' : ''}`}
            onClick={() => applyTemplate(i)}
            title={t.prompt}
          >
            <span className="ap-cover-template-swatch" style={{ background: t.bg }} />
            <span className="ap-cover-template-label">{t.label}</span>
            <span className="ap-cover-template-desc">{t.desc}</span>
          </button>
        ))}
      </div>

      {/* ── Book details ── */}
      <div className="ap-cover-section-label" style={{ marginTop: '0.4rem' }}>Book Details</div>
      <div className="ap-cover-input-wrap">
        <input
          ref={titleRef}
          className={`ap-cover-input${titleInvalid ? ' ap-cover-input--invalid' : ''}`}
          placeholder="Title *"
          value={title}
          maxLength={TITLE_MAX}
          onChange={e => { setTitle(e.target.value); setTouched(false); }}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
        />
        <span className={`ap-cover-char-count${titleNearLimit ? ' ap-cover-char-count--warn' : ''}`}>
          {title.length}/{TITLE_MAX}
        </span>
        {!titleInvalid && (
          <span className="ap-cover-field-hint">
            The title is printed on the cover and used in the AI prompt.
          </span>
        )}
        {titleInvalid && <span className="ap-cover-field-error">Title is required to generate a cover.</span>}
      </div>
      <input
        className="ap-cover-input"
        placeholder="Subtitle (optional)"
        value={subtitle}
        onChange={e => setSubtitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
      />
      <input
        className="ap-cover-input"
        placeholder="Author (optional)"
        value={author}
        onChange={e => setAuthor(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
      />

      {/* ── Style ── */}
      <div className="ap-cover-section-label">Style</div>
      <div className="ap-cover-chips">
        {COVER_STYLES.map(s => (
          <button
            key={s.value}
            className={`ap-cover-chip${style === s.value ? ' ap-cover-chip--on' : ''}`}
            onClick={() => { setStyle(s.value); setActiveTemplate(null); }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Custom prompt ── */}
      <div className="ap-cover-section-label">Describe Your Vision <span style={{ fontWeight: 400, textTransform: 'none', opacity: 0.7 }}>(optional)</span></div>
      <textarea
        className="ap-cover-textarea"
        placeholder="e.g. Dark mountain landscape at dusk, golden stars, traditional Ethiopian patterns along the border…"
        value={customPrompt}
        rows={3}
        onChange={e => { setCustomPrompt(e.target.value); setActiveTemplate(null); }}
      />

      {/* ── Layout ── */}
      <div className="ap-cover-section-label">Layout</div>
      <div className="ap-cover-chips" style={{ flexDirection: 'column', gap: '0.3rem' }}>
        {COVER_BINDINGS.map(b => (
          <button
            key={b.value}
            className={`ap-cover-chip ap-cover-chip--layout${binding === b.value ? ' ap-cover-chip--on' : ''}`}
            onClick={() => setBinding(b.value)}
          >
            <span style={{ fontWeight: 600 }}>{b.label}</span>
            <span style={{ opacity: 0.65, marginLeft: '0.35rem', fontWeight: 400 }}>— {b.sub}</span>
          </button>
        ))}
      </div>

      {/* ── Design mode ── */}
      <div className="ap-cover-section-label">AI Mode</div>
      <div className="ap-cover-chips">
        <button className={`ap-cover-chip${designMode === 'full-design' ? ' ap-cover-chip--on' : ''}`} onClick={() => setDesignMode('full-design')}>
          ✦ Full AI Design
        </button>
        <button className={`ap-cover-chip${designMode === 'background-only' ? ' ap-cover-chip--on' : ''}`} onClick={() => setDesignMode('background-only')}>
          ◻ Background Only
        </button>
      </div>

      <div className="ap-cover-actions">
        <button className="ap-cover-cancel" onClick={onCancel} title="Cancel (Esc)">Cancel</button>
        <button
          className="ap-cover-generate"
          onClick={handleSubmit}
        >
          <Sparkles size={12} /> Generate Cover
        </button>
      </div>
      <p className="ap-cover-kbd-hint">Press <kbd>Enter</kbd> to generate · <kbd>Esc</kbd> to cancel</p>
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
  onCoverSetupSubmit?: (id: string, opts: { title: string; subtitle: string; author: string; style: CoverStyle; designMode: CoverDesignMode; binding: CoverBinding; customPrompt: string }) => void;
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
        <ThinkingDots />
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
                if (!m.note || m.id === 'minimax-m27') {
                  onChange(m.id);
                  setActiveModel(m.id);
                  setOpen(false);
                }
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
function ProcessBar({ label, step, total }: { label: string; step?: number; total?: number }) {
  return (
    <div className="ap-process-bar">
      <div className="ap-process-shimmer" />
      <div className="ap-process-content">
        {step != null && total != null && (
          <span className="ap-process-step">{step}<span className="ap-process-step-sep">/</span>{total}</span>
        )}
        <span className="ap-process-label">{label}</span>
      </div>
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

// ── Detect cover generation intent ────────────────────────────────────────
function parseCoverIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /\b(generate|create|make|design|build|add)\b.{0,20}\bcover\b/.test(t)
    || /\bcover\b.{0,20}\b(page|image|design|art)\b/.test(t);
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
  executor, onClose, onNavigatePage, onApplyCover, onSave, onDownloadPDF,
  fileName = '',
  selection = null,
}: Props) {
  // Panel mode is auto-derived from executor availability + per-message intent.
  // UI affordances (refs, model selector, chips) follow this default; per-send
  // routing in `send()` re-checks the message so "what's on this page?" always
  // goes through chat even in agent mode.
  const [panelMode,  setPanelMode]  = useState<'chat' | 'agent'>(() => executor ? 'agent' : 'chat');
  // Keep panelMode in sync if executor arrives late (e.g. after first extraction).
  useEffect(() => {
    setPanelMode(executor ? 'agent' : 'chat');
  }, [executor]);

  // Detect "edit intent" — verbs that imply manipulating the document.
  const EDIT_INTENT_RE = /\b(make|change|set|update|edit|fix|bold|italic|underline|align|center|left|right|justify|insert|add|remove|delete|move|resize|larger|smaller|bigger|font|color|heading|header|title|column|columns|layout|margin|padding|style|rewrite|reflow|paragraph|extract|fill|replace|crop|regenerate|generate\s+cover|cover\s+page|two\s+column|single\s+column)\b/i;
  const routeToChat = (text: string) => !EDIT_INTENT_RE.test(text);
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
    selection,
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
    opts: { title: string; subtitle: string; author: string; style: CoverStyle; designMode: CoverDesignMode; binding: CoverBinding; customPrompt: string },
  ) => {
    updateMsg(id, { status: 'generating', generatingStep: 'Writing the art prompt…' } as Partial<A2UIMessage>);
    try {
      if (executor) {
        // Agent mode — use executor (keeps ctx.onEdit in sync)
        updateMsg(id, { status: 'generating', generatingStep: 'Generating your cover image…' } as Partial<A2UIMessage>);
        const result = JSON.parse(await executor.execute('_generateCover', {
          mode: 'generate',
          title: opts.title,
          subtitle: opts.subtitle || undefined,
          author: opts.author || undefined,
          style: opts.style,
          designMode: opts.designMode,
          binding: opts.binding,
          customPrompt: opts.customPrompt || undefined,
        }) as string);
        if (result.error) {
          updateMsg(id, { status: 'error', errorMsg: result.error } as Partial<A2UIMessage>);
          return;
        }
      } else {
        // Chat mode — call geminiService directly, apply via onApplyCover
        const coverOpts = {
          title:        opts.title,
          subtitle:     opts.subtitle || undefined,
          author:       opts.author || undefined,
          style:        opts.style as CoverStyle_,
          binding:      opts.binding as BindingType_,
          designMode:   opts.designMode as CoverDesignMode_,
          customPrompt: opts.customPrompt || undefined,
        };
        const bgDataUrl = await generateCoverBackground(coverOpts);
        updateMsg(id, { status: 'generating', generatingStep: 'Laying out title and typography…' } as Partial<A2UIMessage>);
        const coverHtml = buildEditableCoverHTML(bgDataUrl, coverOpts);
        onApplyCover?.(coverHtml);
      }
      updateMsg(id, { status: 'done', result: 'Cover page generated and applied.' } as Partial<A2UIMessage>);
      onNavigatePage?.(0);
    } catch (err) {
      updateMsg(id, {
        status: 'error',
        errorMsg: (err as Error).message || 'Cover generation failed.',
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

    // ── Cover intent fast-path: inject setup card instead of calling AI ──
    if (parseCoverIntent(text)) {
      const setupId = uid();
      addMsg({ type: 'cover-setup', id: setupId, status: 'pending' } as A2UIMessage);
      return;
    }

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

      const reply = await chatWithAI(newHistory, canvasCtx, projectContext, model);

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
    const text = overrideText ?? input.trim();
    if (!text || loading) return;

    // Auto-route: if panel is in chat mode (no executor yet) OR the message
    // reads as conversational (no edit verbs), go through chat. Otherwise
    // fall through to the agent/tool pipeline below.
    if (panelMode === 'chat' || !executor || routeToChat(text)) {
      return sendChat(overrideText);
    }

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
          <Sparkles size={12} />
        </div>
        <span className="ap-header-title">AI</span>
        <span className="ap-header-hint" title="AI routes questions to chat and edit requests to tools automatically">
          {panelMode === 'agent' ? (
            <><Wrench size={10} /> tools on</>
          ) : (
            <><MessageCircle size={10} /> chat only</>
          )}
        </span>

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
            <div className="ap-empty-icon">
              {panelMode === 'chat'
                ? <MessageCircle size={18} />
                : <Bot size={18} />
              }
            </div>
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
