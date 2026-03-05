import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent, type ClipboardEvent, type DragEvent,
} from 'react';
import {
  MessageSquare, X, Send, Paperclip, Trash2, Bot, User,
  ImageIcon, Pencil, MessageCircle, Copy, Check, Lock,
  FileText, Sparkles, Zap,
} from 'lucide-react';
import {
  chatWithAI, editPageWithChat,
  type ChatTurn, type CanvasContext,
} from '../services/geminiService';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface EditContext {
  pageNumber: number;
  html:       string;
  image:      string;  // raw base64 (no "data:" prefix)
  onEdit:     (html: string) => void;
}

interface Props {
  editContext?:   EditContext;
  user?:          { id: string; email?: string; name?: string } | null;
  /** When provided, panel open-state is controlled externally (dock mode — FAB hidden) */
  open?:          boolean;
  onOpenChange?:  (open: boolean) => void;
}

// ── Suggestion chips ──────────────────────────────────────────────────────────
const CANVAS_CHIPS = [
  { icon: '🔍', text: 'What does this page say?' },
  { icon: '🌐', text: 'Translate this page to English' },
  { icon: '📋', text: 'Summarize the key points' },
  { icon: '🔤', text: "What is the document's title?" },
];

const GENERAL_CHIPS = [
  { icon: '📄', text: 'How does OCR extraction work?' },
  { icon: '✂️', text: 'How do I crop an image region?' },
  { icon: '📤', text: 'How do I export to PDF?' },
  { icon: '🌍', text: 'What languages are supported?' },
];

// ── Markdown renderer ─────────────────────────────────────────────────────────
function inlineMd(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/);
  return tokens.map((t, i) => {
    if (t.startsWith('**') && t.endsWith('**')) return <strong key={i}>{t.slice(2, -2)}</strong>;
    if (t.startsWith('*')  && t.endsWith('*'))  return <em key={i}>{t.slice(1, -1)}</em>;
    if (t.startsWith('`')  && t.endsWith('`'))  return <code key={i} className="fc-md-code">{t.slice(1, -1)}</code>;
    return t;
  });
}

function MarkdownText({ text }: { text: string }) {
  const paragraphs = text.trim().split(/\n{2,}/);
  return (
    <div className="fc-md">
      {paragraphs.map((para, i) => {
        const lines = para.split('\n');
        const listLines = lines.filter(l => /^[-*•]\s/.test(l.trim()));
        if (listLines.length > 0 && listLines.length === lines.filter(l => l.trim()).length) {
          return (
            <ul key={i} className="fc-md-ul">
              {listLines.map((l, j) => (
                <li key={j}>{inlineMd(l.replace(/^[-*•]\s*/, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="fc-md-p">
            {lines.map((line, j) => (
              <span key={j}>{inlineMd(line)}{j < lines.length - 1 && <br />}</span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FloatingChat({ editContext, user, open: controlledOpen, onOpenChange }: Props) {
  const isControlled                = onOpenChange !== undefined;
  const [internalOpen, setInternal] = useState(false);
  const open                        = isControlled ? (controlledOpen ?? false) : internalOpen;
  const setOpen                     = (v: boolean) => {
    if (isControlled) onOpenChange(v); else setInternal(v);
  };
  const [messages, setMessages]     = useState<ChatTurn[]>([]);
  const [input, setInput]           = useState('');
  const [attachment, setAttachment] = useState<string | null>(null);
  const [attachName, setAttachName] = useState('');
  const [loading, setLoading]       = useState(false);
  const [dragging, setDragging]     = useState(false);
  const [mode, setMode]             = useState<'chat' | 'edit'>('chat');
  const [copiedIdx, setCopiedIdx]   = useState<number | null>(null);

  // Switch to edit mode when editContext arrives
  useEffect(() => {
    if (editContext) setMode('edit');
  }, [!!editContext]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear edit conversation when active page changes
  const prevPageRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (editContext && editContext.pageNumber !== prevPageRef.current) {
      prevPageRef.current = editContext.pageNumber;
      if (mode === 'edit') setMessages([]);
    }
  }, [editContext?.pageNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open && user) setTimeout(() => textareaRef.current?.focus(), 60);
  }, [open, user]);

  const growTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
  };

  // ── Attachment ───────────────────────────────────────────────────────────
  const attachImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const dataUrl = await fileToDataUrl(file);
    setAttachment(dataUrl);
    setAttachName(file.name);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) attachImage(file);
    e.target.value = '';
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const imgItem = Array.from(e.clipboardData.items).find(it => it.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (file) await attachImage(file);
    }
  };

  const handleDragOver  = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop      = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await attachImage(file);
  };

  // ── Send ─────────────────────────────────────────────────────────────────
  const canSend = (input.trim() || attachment) && !loading && !!user;

  const send = async (overrideText?: string) => {
    const text = overrideText ?? input.trim();
    if ((!text && !attachment) || loading || !user) return;

    const userTurn: ChatTurn = {
      role:         'user',
      text,
      imageDataUrl: attachment ?? undefined,
    };

    setMessages(prev => [...prev, userTurn]);
    setInput('');
    setAttachment(null);
    setAttachName('');
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      if (mode === 'edit' && editContext) {
        const newHtml = await editPageWithChat(editContext.image, editContext.html, text);
        editContext.onEdit(newHtml);
        setMessages(prev => [
          ...prev,
          { role: 'ai', text: `✅ Page ${editContext.pageNumber} updated. Continue editing or switch to Chat to ask questions.` },
        ]);
      } else {
        // Chat mode — pass canvas context so AI can see the current page
        const canvasCtx: CanvasContext | undefined = editContext
          ? { pageNumber: editContext.pageNumber, html: editContext.html, image: editContext.image }
          : undefined;
        const reply = await chatWithAI([...messages, userTurn], canvasCtx);
        setMessages(prev => [...prev, { role: 'ai', text: reply }]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'ai', text: `⚠️ ${(err as Error).message ?? 'Something went wrong. Please try again.'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ── Copy AI message ───────────────────────────────────────────────────────
  const copyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // ── Chips ─────────────────────────────────────────────────────────────────
  const chips = (mode === 'chat' && editContext) ? CANVAS_CHIPS : GENERAL_CHIPS;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* FAB — only shown in self-controlled mode (HomeScreen) */}
      {!isControlled && (
        <button
          className={`fc-fab${open ? ' fc-fab--open' : ''}`}
          onClick={() => setOpen(!open)}
          title={open ? 'Close assistant' : 'Open AI assistant'}
          aria-label="AI Chat Assistant"
        >
          {open ? <X size={20} /> : <MessageSquare size={20} />}
          {!open && messages.length > 0 && (
            <span className="fc-fab-badge">{messages.filter(m => m.role === 'ai').length}</span>
          )}
        </button>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div
          className={`fc-panel${dragging ? ' fc-panel--drag' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Header */}
          <div className="fc-header">
            <div className="fc-header-icon">
              <Bot size={14} />
            </div>
            <span className="fc-header-title">AI Assistant</span>
            <span className="fc-header-sub">Gemini</span>

            {editContext && (
              <div className="fc-mode-pills">
                <button
                  className={`fc-mode-pill${mode === 'chat' ? ' active' : ''}`}
                  onClick={() => { setMode('chat'); setMessages([]); }}
                >
                  <MessageCircle size={10} /> Chat
                </button>
                <button
                  className={`fc-mode-pill${mode === 'edit' ? ' active' : ''}`}
                  onClick={() => { setMode('edit'); setMessages([]); }}
                >
                  <Pencil size={10} /> Edit p.{editContext.pageNumber}
                </button>
              </div>
            )}

            <button
              className="fc-header-clear"
              onClick={() => setMessages([])}
              title="Clear conversation"
              disabled={messages.length === 0}
            >
              <Trash2 size={12} />
            </button>
            <button className="fc-header-close" onClick={() => setOpen(false)} title="Close">
              <X size={14} />
            </button>
          </div>

          {/* Canvas context bar */}
          {editContext && mode === 'chat' && (
            <div className="fc-context-bar">
              <FileText size={10} />
              <span>Page {editContext.pageNumber} loaded as context</span>
              <span className="fc-context-dot" />
              <span style={{ color: '#34d399' }}>Canvas-aware</span>
            </div>
          )}

          {/* ── Auth gate ── */}
          {!user ? (
            <div className="fc-auth-gate">
              <div className="fc-auth-gate-icon">
                <Lock size={22} />
              </div>
              <p className="fc-auth-gate-title">Sign in to use AI Assistant</p>
              <p className="fc-auth-gate-sub">
                The AI assistant is available to signed-in users only.
              </p>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="fc-messages">
                {messages.length === 0 && (
                  <div className="fc-empty">
                    {mode === 'edit' && editContext ? (
                      <>
                        <Zap size={26} className="fc-empty-icon" style={{ color: '#fbbf24' }} />
                        <p>Describe changes for page {editContext.pageNumber}.<br />
                          <span style={{ fontSize: '0.68rem', color: '#475569' }}>
                            "make it two columns" · "fix the spacing" · "increase font size"
                          </span>
                        </p>
                      </>
                    ) : (
                      <>
                        <Sparkles size={26} className="fc-empty-icon" style={{ color: '#818cf8' }} />
                        <p>
                          {editContext
                            ? `Ask anything about page ${editContext.pageNumber} or your document.`
                            : 'Ask anything about your document or OCR extraction.'}
                        </p>
                        <div className="fc-chips">
                          {chips.map(chip => (
                            <button
                              key={chip.text}
                              className="fc-chip"
                              onClick={() => send(chip.text)}
                              disabled={loading}
                            >
                              <span className="fc-chip-icon">{chip.icon}</span>
                              {chip.text}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i} className={`fc-msg fc-msg--${msg.role}`}>
                    <div className="fc-msg-avatar">
                      {msg.role === 'user' ? <User size={11} /> : <Bot size={11} />}
                    </div>
                    <div className="fc-msg-body">
                      {msg.imageDataUrl && (
                        <img src={msg.imageDataUrl} alt="attachment" className="fc-msg-img" />
                      )}
                      {msg.text && (
                        <div className="fc-msg-bubble-wrap">
                          {msg.role === 'ai' ? (
                            <div className="fc-msg-text">
                              <MarkdownText text={msg.text} />
                            </div>
                          ) : (
                            <p className="fc-msg-text">{msg.text}</p>
                          )}
                          {msg.role === 'ai' && (
                            <button
                              className="fc-copy-btn"
                              onClick={() => copyMessage(msg.text, i)}
                              title="Copy response"
                            >
                              {copiedIdx === i ? <Check size={10} /> : <Copy size={10} />}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="fc-msg fc-msg--ai">
                    <div className="fc-msg-avatar"><Bot size={11} /></div>
                    <div className="fc-msg-body">
                      <div className="fc-typing"><span /><span /><span /></div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Drag overlay */}
              {dragging && (
                <div className="fc-drag-overlay">
                  <ImageIcon size={28} />
                  <span>Drop image to attach</span>
                </div>
              )}

              {/* Attachment preview */}
              {attachment && (
                <div className="fc-attachment">
                  <img src={attachment} alt={attachName} className="fc-attachment-thumb" />
                  <span className="fc-attachment-name">{attachName || 'Image'}</span>
                  <button
                    className="fc-attachment-remove"
                    onClick={() => { setAttachment(null); setAttachName(''); }}
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Input row */}
              <div className="fc-input-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileInput}
                />
                <button
                  className={`fc-attach-btn${attachment ? ' fc-attach-btn--active' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image"
                  disabled={loading}
                >
                  <Paperclip size={15} />
                </button>
                <textarea
                  ref={textareaRef}
                  className="fc-textarea"
                  placeholder={
                    mode === 'edit' && editContext
                      ? `Describe changes for page ${editContext.pageNumber}…`
                      : editContext
                        ? `Ask about page ${editContext.pageNumber}… (Shift+Enter for new line)`
                        : 'Ask anything… (Shift+Enter for new line)'
                  }
                  value={input}
                  rows={1}
                  disabled={loading}
                  onChange={e => { setInput(e.target.value); growTextarea(); }}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                />
                <button
                  className="fc-send-btn"
                  onClick={() => send()}
                  disabled={!canSend}
                  title="Send (Enter)"
                >
                  <Send size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
