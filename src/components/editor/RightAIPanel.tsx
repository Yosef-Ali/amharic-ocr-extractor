import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, RefreshCw, Wand2 } from 'lucide-react';
import { editPageWithChat } from '../../services/geminiService';

// ── Types ───────────────────────────────────────────────────────────────────
interface Message {
  role:     'user' | 'ai';
  text:     string;
  isError?: boolean;
}

interface Props {
  pageNumber: number;
  pageImage:  string;   // raw base64 JPEG
  html:       string;   // current page HTML
  onEdit:     (newHtml: string) => void;
}

// ── Quick-action suggestions ─────────────────────────────────────────────────
const SUGGESTIONS = [
  'Remove all borders and boxes from titles',
  'Clean up — remove excessive borders',
  'Fix spacing and margins',
  'Improve heading hierarchy',
  'Make layout more compact',
  'Fix text alignment',
];

// ── Component ────────────────────────────────────────────────────────────────
export default function RightAIPanel({ pageNumber, pageImage, html, onEdit }: Props) {
  const [input,    setInput]    = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading,  setLoading]  = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  // Scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset conversation when active page changes
  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [pageNumber]);

  const send = async (text: string = input.trim()) => {
    if (!text || loading) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const newHTML = await editPageWithChat(pageImage, html, text);
      onEdit(newHTML);
      setMessages(prev => [...prev, {
        role: 'ai',
        text: '✓ Page updated. Continue editing or try another suggestion.',
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
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
    <aside className="right-ai-panel">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="right-ai-header">
        <Wand2 size={13} />
        <span>AI Design Assistant</span>
        <span className="right-ai-page-badge">P{pageNumber}</span>
      </div>

      {/* ── Suggestion chips (before first message) ─────────────────── */}
      {messages.length === 0 && (
        <div className="right-ai-intro">
          <div className="right-ai-intro-label">
            <Sparkles size={11} />
            <span>What would you like to improve on page {pageNumber}?</span>
          </div>
          <div className="right-ai-chips">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                className="right-ai-chip"
                onClick={() => send(s)}
                disabled={loading || !pageImage}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Message history ─────────────────────────────────────────── */}
      {messages.length > 0 && (
        <div className="right-ai-messages">
          {messages.map((m, i) => (
            <div
              key={i}
              className={[
                'right-ai-msg',
                m.role === 'user' ? 'right-ai-msg--user' : 'right-ai-msg--ai',
                m.isError ? 'right-ai-msg--error' : '',
              ].join(' ')}
            >
              {m.text}
            </div>
          ))}

          {loading && (
            <div className="right-ai-msg right-ai-msg--ai right-ai-msg--loading">
              <Loader2 size={11} className="animate-spin" />
              <span>Redesigning page {pageNumber}…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Input area ──────────────────────────────────────────────── */}
      <div className="right-ai-input-wrap">
        <textarea
          ref={inputRef}
          className="right-ai-textarea"
          placeholder="Describe a design change… (Enter to apply)"
          value={input}
          rows={2}
          disabled={loading || !pageImage}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <div className="right-ai-row">
          {messages.length > 0 && (
            <button
              className="right-ai-clear"
              onClick={() => setMessages([])}
              disabled={loading}
              title="Clear conversation"
            >
              <RefreshCw size={11} />
            </button>
          )}
          <button
            className="right-ai-send"
            onClick={() => send()}
            disabled={!input.trim() || loading || !pageImage}
          >
            {loading
              ? <Loader2 size={12} className="animate-spin" />
              : <Send size={12} />}
            <span>{loading ? 'Working…' : 'Apply'}</span>
          </button>
        </div>
      </div>

      {!pageImage && (
        <p className="right-ai-disabled-hint">
          Extract this page first to use AI editing.
        </p>
      )}
    </aside>
  );
}
