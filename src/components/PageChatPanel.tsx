import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, ChevronDown, RefreshCw, Wand2 } from 'lucide-react';
import { editPageWithChat } from '../services/geminiService';

// ── Types ──────────────────────────────────────────────────────────────────
interface Message {
  role:    'user' | 'ai';
  text:    string;
  isError?: boolean;
}

interface Props {
  pageNumber: number;
  pageImage:  string;   // raw base64 JPEG of the original scan
  html:       string;   // current extracted HTML (updated after each edit)
  onEdit:     (newHtml: string) => void;
}

// ── Suggestion chips — universal design actions ────────────────────────────
const SUGGESTIONS = [
  { icon: '✦', label: 'Clean up — remove excessive borders' },
  { icon: '↕', label: 'Fix spacing and margins' },
  { icon: '𝗛', label: 'Improve heading hierarchy' },
  { icon: '⬡', label: 'Make layout more compact' },
  { icon: '⌶', label: 'Fix text alignment' },
  { icon: '✦', label: 'Remove visual clutter' },
];

// ── Component ──────────────────────────────────────────────────────────────
export default function PageChatPanel({ pageNumber, pageImage, html, onEdit }: Props) {
  const [open,     setOpen]     = useState(false);
  const [input,    setInput]    = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading,  setLoading]  = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const send = async (text: string = input.trim()) => {
    if (!text || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const newHTML = await editPageWithChat(pageImage, html, text);
      onEdit(newHTML);
      setMessages((prev) => [...prev, {
        role: 'ai',
        text: '✓ Page updated. Continue editing or try another suggestion.',
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'ai',
        text: `⚠️ ${(err as Error).message ?? 'Something went wrong — please try again.'}`,
        isError: true,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  };

  return (
    <div className="chat-wrap">

      {/* ── Toggle bar ───────────────────────────────────────────────────── */}
      <button
        className="chat-toggle"
        onClick={() => setOpen((o) => !o)}
        title="Open AI Design Assistant for this page"
      >
        <Wand2 size={11} />
        <span>AI Design Assistant</span>
        {messages.length > 0 && !open && (
          <span className="chat-badge">{messages.filter((m) => m.role === 'user').length}</span>
        )}
        <ChevronDown
          size={12}
          style={{ marginLeft: 'auto', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {/* ── Expanded panel ───────────────────────────────────────────────── */}
      {open && (
        <div className="chat-body">

          {/* Suggestion chips — shown only before first message */}
          {messages.length === 0 && (
            <div className="chat-intro">
              <div className="chat-intro-header">
                <Sparkles size={13} />
                <span>What would you like to improve on page {pageNumber}?</span>
              </div>
              <div className="chat-chips">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    className="chat-chip"
                    onClick={() => send(s.label)}
                    disabled={loading}
                  >
                    <span className="chat-chip-icon">{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message history */}
          {messages.length > 0 && (
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={[
                    'chat-msg',
                    m.role === 'user' ? 'chat-msg--user' : 'chat-msg--ai',
                    m.isError ? 'chat-msg--error' : '',
                  ].join(' ')}
                >
                  {m.text}
                </div>
              ))}
              {loading && (
                <div className="chat-msg chat-msg--ai chat-msg--loading">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Redesigning page {pageNumber}…</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input row */}
          <div className="chat-input-row">
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder="e.g. Remove the borders, fix spacing, make headings bolder…"
              value={input}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button
              className="chat-send"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              title="Send"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>

            {messages.length > 0 && (
              <button
                className="chat-reset"
                onClick={() => setMessages([])}
                title="Clear conversation"
                disabled={loading}
              >
                <RefreshCw size={11} />
              </button>
            )}
          </div>

          {/* Keyboard hint */}
          <p className="chat-hint">Press Enter to send · Re-extract to start over from scratch</p>
        </div>
      )}
    </div>
  );
}
