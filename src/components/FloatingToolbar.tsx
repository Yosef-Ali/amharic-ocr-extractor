import { createPortal } from 'react-dom';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Eraser,
} from 'lucide-react';

interface Props {
  x: number;
  y: number;
  onFormat: (cmd: string, value?: string) => void;
}

// ── Base button style ──────────────────────────────────────────────────────
const btnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, border: 'none', borderRadius: 6, padding: 0,
  background: 'transparent', color: '#cbd5e1',
  cursor: 'pointer', flexShrink: 0, outline: 'none',
  transition: 'background 0.1s ease, color 0.1s ease',
};

function TBtn({ title, onClick, children }: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      // preventDefault keeps the selection alive in the contentEditable
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={btnStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.16)';
        e.currentTarget.style.color = '#f8fafc';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = '#cbd5e1';
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return (
    <div style={{
      width: 1, height: 18, flexShrink: 0, margin: '0 3px',
      background: 'rgba(255,255,255,0.15)',
    }} />
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function FloatingToolbar({ x, y, onFormat }: Props) {
  const W = 348;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;

  // Clamp so toolbar never overflows viewport
  const left = Math.max(8, Math.min(x - W / 2, vw - W - 8));
  const top  = Math.max(8, y - 52);

  const toolbar = (
    <div
      onMouseDown={(e) => e.preventDefault()}   // don't steal focus from editor
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        padding: '4px 8px',
        background: '#1e293b',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.35)',
        userSelect: 'none',
        pointerEvents: 'auto',
        // Tiny downward arrow via CSS
        filter: 'drop-shadow(0 1px 0 rgba(255,255,255,0.04))',
      }}
    >
      {/* ── Text style ──────────────────────────────── */}
      <TBtn title="Bold (Ctrl+B)"       onClick={() => onFormat('bold')}>          <Bold        size={13} /></TBtn>
      <TBtn title="Italic (Ctrl+I)"     onClick={() => onFormat('italic')}>        <Italic      size={13} /></TBtn>
      <TBtn title="Underline (Ctrl+U)"  onClick={() => onFormat('underline')}>     <Underline   size={13} /></TBtn>
      <TBtn title="Strikethrough"       onClick={() => onFormat('strikeThrough')}> <Strikethrough size={12} /></TBtn>

      <Sep />

      {/* ── Alignment ───────────────────────────────── */}
      <TBtn title="Align left"    onClick={() => onFormat('justifyLeft')}>    <AlignLeft    size={13} /></TBtn>
      <TBtn title="Center"        onClick={() => onFormat('justifyCenter')}>  <AlignCenter  size={13} /></TBtn>
      <TBtn title="Align right"   onClick={() => onFormat('justifyRight')}>   <AlignRight   size={13} /></TBtn>
      <TBtn title="Justify"       onClick={() => onFormat('justifyFull')}>    <AlignJustify size={13} /></TBtn>

      <Sep />

      {/* ── Block / heading ─────────────────────────── */}
      <TBtn title="Heading 2"  onClick={() => onFormat('formatBlock', 'h2')}>
        <span style={{ fontSize: 11, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em' }}>H2</span>
      </TBtn>
      <TBtn title="Heading 3"  onClick={() => onFormat('formatBlock', 'h3')}>
        <span style={{ fontSize: 10, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>H3</span>
      </TBtn>
      <TBtn title="Paragraph"  onClick={() => onFormat('formatBlock', 'p')}>
        <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1 }}>¶</span>
      </TBtn>

      <Sep />

      {/* ── Colour ──────────────────────────────────── */}
      <TBtn title="Red text (emphasis / heading)"   onClick={() => onFormat('foreColor', '#dc2626')}>
        <span style={{ fontSize: 14, fontWeight: 900, color: '#ef4444', lineHeight: 1 }}>A</span>
      </TBtn>
      <TBtn title="Highlight yellow"                onClick={() => onFormat('hiliteColor', '#fef08a')}>
        <span style={{ fontSize: 14, fontWeight: 900, color: '#ca8a04', lineHeight: 1, background: '#fef08a', borderRadius: 2, padding: '0 1px' }}>A</span>
      </TBtn>
      <TBtn title="Reset to black"                  onClick={() => onFormat('foreColor', '#000000')}>
        <span style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>A</span>
      </TBtn>

      <Sep />

      {/* ── Clear ───────────────────────────────────── */}
      <TBtn title="Clear all formatting"            onClick={() => onFormat('removeFormat')}>
        <Eraser size={12} />
      </TBtn>
    </div>
  );

  return createPortal(toolbar, document.body);
}
