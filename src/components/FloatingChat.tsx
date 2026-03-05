import {
  useState, useRef, useEffect, useCallback, type KeyboardEvent,
  type ClipboardEvent, type DragEvent,
} from 'react';
import {
  MessageSquare, X, Send, Paperclip, Trash2, Bot, User, ImageIcon,
  Pencil, MessageCircle, CheckCircle2,
} from 'lucide-react';
import { chatWithAI, editPageWithChat, type ChatTurn } from '../services/geminiService';

// ── Edit context ─────────────────────────────────────────────────────────────
export interface EditContext {
  pageNumber: number;
  html:       string;
  image:      string;  // raw base64 (no "data:" prefix)
  onEdit:     (html: string) => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

// ─── component ──────────────────────────────────────────────────────────────

interface Props {
  editContext?: EditContext;
}

export default function FloatingChat({ editContext }: Props) {
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState<ChatTurn[]>([]);
  const [input, setInput]             = useState('');
  const [attachment, setAttachment]   = useState<string | null>(null); // data URL
  const [attachName, setAttachName]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [dragging, setDragging]       = useState(false);
  // 'edit' mode uses editPageWithChat; 'chat' mode is general Q&A
  const [mode, setMode]               = useState<'chat' | 'edit'>('chat');

  // Switch to edit mode automatically when editContext becomes available
  useEffect(() => {
    if (editContext) setMode('edit');
  }, [!!editContext]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear edit-mode conversation when the active page changes
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-focus textarea when panel opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 60);
  }, [open]);

  // Auto-grow textarea
  const growTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px'; // max ~4 lines
  };

  // ── image attachment ──────────────────────────────────────────────────────

  const attachImage = useCallback(async (file: File) => {
    if (!isImageFile(file)) return;
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
    const items = Array.from(e.clipboardData.items);
    const imgItem = items.find(it => it.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (file) await attachImage(file);
    }
  };

  // ── drag & drop onto panel ────────────────────────────────────────────────

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await attachImage(file);
  };

  // ── send ─────────────────────────────────────────────────────────────────

  const canSend = (input.trim() || attachment) && !loading;

  const send = async () => {
    if (!canSend) return;

    const instruction = input.trim();
    const userTurn: ChatTurn = {
      role:         'user',
      text:         instruction,
      imageDataUrl: attachment ?? undefined,
    };

    setMessages(prev => [...prev, userTurn]);
    setInput('');
    setAttachment(null);
    setAttachName('');
    setLoading(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      if (mode === 'edit' && editContext) {
        // Edit page mode — apply instruction to active page HTML
        const newHtml = await editPageWithChat(
          editContext.image,
          editContext.html,
          instruction,
        );
        editContext.onEdit(newHtml);
        setMessages(prev => [
          ...prev,
          { role: 'ai', text: `✅ Page ${editContext.pageNumber} updated! The changes have been applied to your document.` },
        ]);
      } else {
        // General chat mode
        const reply = await chatWithAI([...messages, userTurn]);
        setMessages(prev => [...prev, { role: 'ai', text: reply }]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          text: `⚠️ ${(err as Error).message ?? 'Something went wrong. Please try again.'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── FAB ── */}
      <button
        className={`fc-fab${open ? ' fc-fab--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={open ? 'Close assistant' : 'Open AI assistant'}
        aria-label="AI Chat Assistant"
      >
        {open ? <X size={20} /> : <MessageSquare size={20} />}
        {!open && messages.length > 0 && (
          <span className="fc-fab-badge">{messages.filter(m => m.role === 'ai').length}</span>
        )}
      </button>

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

            {/* Mode toggle pills (only when editContext is available) */}
            {editContext && (
              <div className="fc-mode-pills">
                <button
                  className={`fc-mode-pill${mode === 'chat' ? ' active' : ''}`}
                  onClick={() => { setMode('chat'); setMessages([]); }}
                  title="General chat"
                >
                  <MessageCircle size={10} /> Chat
                </button>
                <button
                  className={`fc-mode-pill${mode === 'edit' ? ' active' : ''}`}
                  onClick={() => { setMode('edit'); setMessages([]); }}
                  title={`Edit page ${editContext.pageNumber}`}
                >
                  <Pencil size={10} /> Edit p.{editContext.pageNumber}
                </button>
              </div>
            )}

            <button className="fc-header-clear" onClick={() => setMessages([])} title="Clear conversation" disabled={messages.length === 0}>
              <Trash2 size={12} />
            </button>
            <button className="fc-header-close" onClick={() => setOpen(false)} title="Close">
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div className="fc-messages">
            {messages.length === 0 && (
              <div className="fc-empty">
                {mode === 'edit' && editContext
                  ? <><CheckCircle2 size={28} className="fc-empty-icon" style={{ color: '#34d399' }} />
                      <p>Tell me how to redesign page {editContext.pageNumber}.<br />
                        <span style={{ fontSize: '0.72rem', color: '#475569' }}>
                          e.g. "make it two columns" · "remove all borders" · "increase font size"
                        </span>
                      </p></>
                  : <><Bot size={28} className="fc-empty-icon" />
                      <p>Ask anything about your document.<br />You can also paste or drop an image.</p></>
                }
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`fc-msg fc-msg--${msg.role}`}>
                <div className="fc-msg-avatar">
                  {msg.role === 'user' ? <User size={11} /> : <Bot size={11} />}
                </div>
                <div className="fc-msg-body">
                  {msg.imageDataUrl && (
                    <img
                      src={msg.imageDataUrl}
                      alt="attachment"
                      className="fc-msg-img"
                    />
                  )}
                  {msg.text && (
                    <p className="fc-msg-text">{msg.text}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="fc-msg fc-msg--ai">
                <div className="fc-msg-avatar">
                  <Bot size={11} />
                </div>
                <div className="fc-msg-body">
                  <div className="fc-typing">
                    <span /><span /><span />
                  </div>
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

          {/* Image attachment preview */}
          {attachment && (
            <div className="fc-attachment">
              <img src={attachment} alt={attachName} className="fc-attachment-thumb" />
              <span className="fc-attachment-name">{attachName || 'Image'}</span>
              <button
                className="fc-attachment-remove"
                onClick={() => { setAttachment(null); setAttachName(''); }}
                title="Remove attachment"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Input row */}
          <div className="fc-input-row">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
            {/* Attach image button */}
            <button
              className={`fc-attach-btn${attachment ? ' fc-attach-btn--active' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              title="Attach image (or paste / drop)"
              disabled={loading}
            >
              <Paperclip size={15} />
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              className="fc-textarea"
              placeholder={mode === 'edit' && editContext
                ? `Describe changes for page ${editContext.pageNumber}…`
                : 'Ask anything… (Shift+Enter for new line)'}
              value={input}
              rows={1}
              disabled={loading}
              onChange={e => { setInput(e.target.value); growTextarea(); }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
            />

            {/* Send */}
            <button
              className="fc-send-btn"
              onClick={send}
              disabled={!canSend}
              title="Send (Enter)"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
