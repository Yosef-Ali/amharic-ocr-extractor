import { createPortal } from 'react-dom';
import { useState, useRef } from 'react';
import {
  Bold, Underline,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Eraser, List, ListOrdered,
  Superscript, Subscript, ChevronDown,
} from 'lucide-react';

interface Props {
  x: number;
  y: number;
  onFormat: (cmd: string, value?: string) => void;
}

// Only fonts that render Ethiopic glyphs
const FONT_FAMILIES = [
  { label: 'Noto Serif',  value: "'Noto Serif Ethiopic', serif" },
  { label: 'Noto Sans',   value: "'Noto Sans Ethiopic', sans-serif" },
  { label: 'Abyssinica',  value: "'Abyssinica SIL', 'Noto Serif Ethiopic', serif" },
  { label: 'Nyala',       value: "Nyala, 'Noto Serif Ethiopic', serif" },
];

const ETHIO_PUNCT = [
  { char: '።', title: 'Full stop ። (U+1362)' },
  { char: '፣', title: 'Comma ፣ (U+1363)' },
  { char: '፤', title: 'Semicolon ፤ (U+1364)' },
  { char: '፥', title: 'Colon ፥ (U+1365)' },
  { char: '፡', title: 'Word separator ፡ (U+1361)' },
  { char: '፦', title: 'Preface colon ፦ (U+1366)' },
  { char: '፧', title: 'Question mark ፧ (U+1367)' },
];
const ETHIO_NUMS = ['፩','፪','፫','፬','፭','፮','፯','፰','፱','፲','፳','፻'];

// ── Styles ────────────────────────────────────────────────────────────────
const BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, border: 'none', borderRadius: 5, padding: 0,
  background: 'transparent', color: '#cbd5e1',
  cursor: 'pointer', flexShrink: 0,
  transition: 'background 0.1s, color 0.1s',
};
const SEP: React.CSSProperties = {
  width: 1, height: 14, flexShrink: 0, margin: '0 2px',
  background: 'rgba(255,255,255,0.13)',
};

function TBtn({ title, onClick, children }: {
  title: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      style={BTN}
      onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.14)'; e.currentTarget.style.color='#f8fafc'; }}
      onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#cbd5e1'; }}
    >{children}</button>
  );
}

function Div() { return <div style={SEP} />; }

// ── Component ──────────────────────────────────────────────────────────────
export default function FloatingToolbar({ x, y, onFormat }: Props) {
  const [ethioOpen, setEthioOpen] = useState(false);
  const [fontSize,  setFontSize]  = useState('');
  const sizeRef = useRef<HTMLInputElement>(null);

  const vw   = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const W    = 360;
  const left = Math.max(8, Math.min(x - W / 2, vw - W - 8));
  const top  = Math.max(8, y - 46);

  const applySize = (v: string) => {
    const n = parseInt(v);
    if (!n || n < 4 || n > 200) return;
    window.dispatchEvent(new CustomEvent('ft-font-size-px', { detail: { px: n } }));
  };

  const toolbar = (
    <div
      data-ft="1"
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'fixed', left, top, zIndex: 9999,
        display: 'flex', flexDirection: 'column',
        background: '#1e293b',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        userSelect: 'none', pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    >
      {/* ── Primary row ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', gap:1, padding:'3px 6px' }}>

        {/* Font family */}
        <select
          title="Font family"
          onMouseDown={e => e.stopPropagation()}
          onChange={e => onFormat('fontName', e.target.value)}
          style={{
            height:22, width:88, fontSize:10,
            border:'1px solid rgba(255,255,255,0.13)',
            borderRadius:5, background:'#0f172a', color:'#94a3b8',
            padding:'0 3px', cursor:'pointer', outline:'none', flexShrink:0,
          }}
        >
          {FONT_FAMILIES.map(f => (
            <option key={f.value} value={f.value} style={{ background:'#1e293b' }}>{f.label}</option>
          ))}
        </select>

        {/* Font size */}
        <input
          ref={sizeRef}
          type="number" min={6} max={200}
          placeholder="px"
          title="Font size (px)"
          value={fontSize}
          onMouseDown={e => e.stopPropagation()}
          onChange={e => setFontSize(e.target.value)}
          onBlur={e  => applySize(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') applySize((e.target as HTMLInputElement).value); }}
          style={{
            width:36, height:22, fontSize:10,
            border:'1px solid rgba(255,255,255,0.13)',
            borderRadius:5, background:'#0f172a', color:'#94a3b8',
            padding:'0 4px', outline:'none', marginLeft:2, flexShrink:0,
          }}
        />

        <Div />

        {/* Bold, Underline */}
        <TBtn title="Bold (Ctrl+B)"      onClick={() => onFormat('bold')}>      <Bold      size={12}/></TBtn>
        <TBtn title="Underline (Ctrl+U)" onClick={() => onFormat('underline')}> <Underline size={12}/></TBtn>

        <Div />

        {/* Alignment */}
        <TBtn title="Left"    onClick={() => onFormat('justifyLeft')}>   <AlignLeft    size={12}/></TBtn>
        <TBtn title="Center"  onClick={() => onFormat('justifyCenter')}> <AlignCenter  size={12}/></TBtn>
        <TBtn title="Right"   onClick={() => onFormat('justifyRight')}>  <AlignRight   size={12}/></TBtn>
        <TBtn title="Justify" onClick={() => onFormat('justifyFull')}>   <AlignJustify size={12}/></TBtn>

        <Div />

        {/* Headings */}
        <TBtn title="Heading 2" onClick={() => onFormat('formatBlock', 'h2')}>
          <span style={{ fontSize:10, fontWeight:900, lineHeight:1 }}>H2</span>
        </TBtn>
        <TBtn title="Paragraph" onClick={() => onFormat('formatBlock', 'p')}>
          <span style={{ fontSize:13, fontWeight:500, lineHeight:1 }}>¶</span>
        </TBtn>

        <Div />

        {/* Lists */}
        <TBtn title="Bullet list"   onClick={() => onFormat('insertUnorderedList')}><List        size={12}/></TBtn>
        <TBtn title="Numbered list" onClick={() => onFormat('insertOrderedList')}>  <ListOrdered size={12}/></TBtn>

        <Div />

        {/* Sub/Super */}
        <TBtn title="Superscript (verse numbers)" onClick={() => onFormat('superscript')}><Superscript size={11}/></TBtn>
        <TBtn title="Subscript"                   onClick={() => onFormat('subscript')}>  <Subscript   size={11}/></TBtn>

        <Div />

        {/* Colors */}
        <TBtn title="Red"       onClick={() => onFormat('foreColor',  '#dc2626')}>
          <span style={{ fontSize:13, fontWeight:900, color:'#ef4444' }}>A</span>
        </TBtn>
        <TBtn title="Highlight" onClick={() => onFormat('hiliteColor','#fef08a')}>
          <span style={{ fontSize:13, fontWeight:900, color:'#ca8a04', background:'#fef08a', borderRadius:2, padding:'0 1px' }}>A</span>
        </TBtn>
        <TBtn title="Black"     onClick={() => onFormat('foreColor',  '#000000')}>
          <span style={{ fontSize:13, fontWeight:900, color:'#0f172a' }}>A</span>
        </TBtn>

        <Div />

        {/* Clear */}
        <TBtn title="Clear formatting" onClick={() => onFormat('removeFormat')}><Eraser size={11}/></TBtn>

        <Div />

        {/* Ethiopic toggle */}
        <button
          title={ethioOpen ? 'Hide Ethiopic panel' : 'Ethiopic punctuation & numerals'}
          onMouseDown={e => { e.preventDefault(); setEthioOpen(o => !o); }}
          style={{
            ...BTN,
            width: 'auto', padding: '0 5px', gap: 2,
            fontFamily: "'Noto Serif Ethiopic', serif",
            fontSize: 13, fontWeight: 700,
            color: ethioOpen ? '#fde68a' : '#94a3b8',
            background: ethioOpen ? 'rgba(253,230,138,0.12)' : 'transparent',
          }}
          onMouseEnter={e => { if (!ethioOpen) { e.currentTarget.style.background='rgba(253,230,138,0.08)'; e.currentTarget.style.color='#fde68a'; }}}
          onMouseLeave={e => { if (!ethioOpen) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#94a3b8'; }}}
        >
          ሀ <ChevronDown size={9} style={{ transform: ethioOpen ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }} />
        </button>
      </div>

      {/* ── Ethiopic accordion row ───────────────────────────────────── */}
      {ethioOpen && (
        <div style={{
          display:'flex', alignItems:'center', flexWrap:'wrap', gap:1,
          padding:'3px 8px 5px',
          borderTop:'1px solid rgba(255,255,255,0.07)',
          background:'rgba(0,0,0,0.15)',
        }}>
          <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', marginRight:3, letterSpacing:'0.06em', flexShrink:0 }}>PUNCT</span>
          {ETHIO_PUNCT.map(p => (
            <button key={p.char} title={p.title}
              onMouseDown={e => { e.preventDefault(); onFormat('insertText', p.char); }}
              style={{ ...BTN, width:'auto', padding:'0 4px', fontFamily:"'Noto Serif Ethiopic',serif", fontSize:14, fontWeight:700, color:'#fde68a' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(253,230,138,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; }}
            >{p.char}</button>
          ))}
          <div style={SEP} />
          <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', marginRight:3, letterSpacing:'0.06em', flexShrink:0 }}>NUMS</span>
          {ETHIO_NUMS.map(n => (
            <button key={n} title={`Insert ${n}`}
              onMouseDown={e => { e.preventDefault(); onFormat('insertText', n); }}
              style={{ ...BTN, width:'auto', padding:'0 3px', fontFamily:"'Noto Serif Ethiopic',serif", fontSize:12, fontWeight:600, color:'#86efac' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(134,239,172,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; }}
            >{n}</button>
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(toolbar, document.body);
}
