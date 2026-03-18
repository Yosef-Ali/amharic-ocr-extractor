/**
 * CoverEditorPanel — unified right-drawer panel for the cover page.
 *
 * Two views handled in one place:
 *  • GENERATE — when no cover exists, or user wants a new/improved background
 *  • EDIT     — layers list + text properties when a cover is present
 *
 * The canvas stays clean — zero UI overlap.
 */
import { useState, useRef, useCallback } from 'react';
import {
  Sparkles, Loader2, Wand2, ImageIcon, Upload, X,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Trash2, Plus, Minus, Type, Layers, BookOpen, BookMarked, RotateCcw,
} from 'lucide-react';
import { type CoverBlock } from './coverUtils';
import {
  generateCoverBackground,
  improveCoverBackground,
  generateCoverBackgroundFromReference,
  buildEditableCoverHTML,
  generateBackCover,
  buildBackCoverHTML,
  type CoverStyle, type BindingType, type CoverPageOptions,
  type CoverDesignMode, type TextRemovalMode,
} from '../../services/geminiService';

// ── Constants ─────────────────────────────────────────────────────────────────
const COLOR_PRESETS = ['#ffffff','#000000','#d4a574','#fbbf24','#f87171','#a3e635','#38bdf8','#c084fc','#f8fafc','#1e293b'];

const STYLES: { value: CoverStyle; label: string; emoji: string }[] = [
  { value: 'orthodox',   label: 'Orthodox',   emoji: '✝️' },
  { value: 'ornate',     label: 'Ornate',     emoji: '📜' },
  { value: 'classic',    label: 'Classic',    emoji: '📕' },
  { value: 'modern',     label: 'Modern',     emoji: '🎨' },
  { value: 'minimalist', label: 'Minimal',    emoji: '◻️' },
];

type GenMode = 'new' | 'improve' | 'reference';

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  // Current cover state
  hasCover:     boolean;
  hasBackCover: boolean;
  bgUrl:        string;
  backBgUrl:    string;   // back cover image URL (parsed from pageResults[-1])
  activeCoverSide: 'front' | 'back';  // which side is currently on canvas
  blocks:    CoverBlock[];
  selId:     string | null;
  // Callbacks
  onSelect:    (id: string | null) => void;
  onUpdate:    (id: string, patch: Partial<CoverBlock>) => void;
  onAdd:       () => void;
  onDelete:    (id: string) => void;
  onApply:     (html: string) => void;   // front cover HTML
  onApplyBack: (html: string) => void;   // back cover HTML (pageResults[-1])
  onError:     (msg: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CoverEditorPanel({
  hasCover, hasBackCover, bgUrl, backBgUrl, activeCoverSide,
  blocks, selId,
  onSelect, onUpdate, onAdd, onDelete, onApply, onApplyBack, onError,
}: Props) {
  // Which cover side is being edited (synced to canvas via activeCoverSide)
  const [editSide, setEditSide] = useState<'front' | 'back'>(activeCoverSide);

  // Which top-level view
  const [showGenerate, setShowGenerate] = useState(!hasCover);

  // Generation form state
  const [genMode,      setGenMode]      = useState<GenMode>('new');
  const [designMode,   setDesignMode]   = useState<CoverDesignMode>('full-design');
  const [textMode,     setTextMode]     = useState<TextRemovalMode>('keep');
  const [title,        setTitle]        = useState('');
  const [subtitle,     setSubtitle]     = useState('');
  const [author,       setAuthor]       = useState('');
  const [style,        setStyle]        = useState<CoverStyle>('orthodox');
  const [binding,      setBinding]      = useState<BindingType>('saddle-stitch');
  const [instruction,  setInstruction]  = useState('');
  const [refImg,       setRefImg]       = useState<string | null>(null);
  const [busy,         setBusy]         = useState(false);
  const cancelledRef  = useRef(false);
  const refInputRef   = useRef<HTMLInputElement>(null);

  const selBlock = blocks.find(b => b.id === selId);

  // ── Reference upload ────────────────────────────────────────────────────────
  const handleRefUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setRefImg(reader.result as string); setGenMode('reference'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // ── Generate ────────────────────────────────────────────────────────────────
  const canGenerate =
    editSide === 'back'
      ? !!hasCover   // back cover needs the front cover as style reference
      : (genMode === 'new'       && title.trim()) ||
        (genMode === 'improve'   && hasCover) ||
        (genMode === 'reference' && !!refImg && title.trim());

  const handleGenerate = async () => {
    if (!canGenerate || busy) return;
    cancelledRef.current = false;
    setBusy(true);
    try {
      if (editSide === 'back') {
        // Back cover: generate from front cover as style reference
        const backBg = await generateBackCover(bgUrl, { title: title.trim() || 'Untitled', subtitle: subtitle.trim() || undefined, author: author.trim() || undefined, style, designMode });
        if (!cancelledRef.current) { onApplyBack(buildBackCoverHTML(backBg)); setShowGenerate(false); }
        return;
      }
      const opts: CoverPageOptions = {
        title: title.trim() || 'Untitled',
        subtitle: subtitle.trim() || undefined,
        author:   author.trim()   || undefined,
        style, binding,
        designMode: genMode === 'improve' ? undefined : designMode,
      };
      let bgDataUrl: string;
      if      (genMode === 'new')       bgDataUrl = await generateCoverBackground(opts);
      else if (genMode === 'improve')   bgDataUrl = await improveCoverBackground(bgUrl, instruction.trim(), undefined, textMode);
      else                              bgDataUrl = await generateCoverBackgroundFromReference(refImg!, opts);
      if (!cancelledRef.current) {
        onApply(buildEditableCoverHTML(bgDataUrl, opts));
        setShowGenerate(false);
      }
    } catch (err) {
      if (!cancelledRef.current) onError(err instanceof Error ? err.message : 'Cover generation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => { cancelledRef.current = true; setBusy(false); };

  // ── Shared section header ───────────────────────────────────────────────────
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="ce-section-title">{children}</div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GENERATE VIEW
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const GenerateView = (
    <div className="ce-panel" style={{ width: '100%', borderLeft: 'none', height: '100%' }}>

      {/* Header */}
      <div className="ce-section" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
        <Sparkles size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--t-text1)', flex: 1 }}>
          {editSide === 'back' ? 'Back Cover' : hasCover ? 'Regenerate Cover' : 'Generate Cover'}
        </span>
        <span className="cov-setup-badge" style={{ fontSize: '0.55rem' }}>NanoBanana 2</span>
        {hasCover && (
          <button className="ce-ctrl-btn" onClick={() => setShowGenerate(false)} title="Back to editor"><X size={12} /></button>
        )}
      </div>

      {/* Front / Back tabs */}
      <div className="ce-section" style={{ paddingBottom: 0 }}>
        <div className="cov-tabs" style={{ maxWidth: '100%' }}>
          <button
            className={`cov-tab${editSide === 'front' ? ' cov-tab--on' : ''}`}
            onClick={() => setEditSide('front')}
          >
            Front Cover
          </button>
          <button
            className={`cov-tab${editSide === 'back' ? ' cov-tab--on' : ''}`}
            onClick={() => setEditSide('back')}
            disabled={!hasCover}
            title={hasCover ? '' : 'Generate a front cover first'}
          >
            Back Cover
          </button>
        </div>
      </div>

      {/* Generating state */}
      {busy ? (
        <div className="ce-section" style={{ alignItems: 'center', gap: '1rem', padding: '2rem 1rem' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: '#818cf8' }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--t-text3)', textAlign: 'center' }}>
            {editSide === 'back' ? 'Generating back cover…' : 'Generating cover…'}
          </span>
          <button className="cov-cancel-btn" onClick={handleCancel}><X size={12} /> Cancel</button>
        </div>
      ) : editSide === 'back' ? (
        /* ── Back Cover generate panel ── */
        <div className="ce-section" style={{ gap: '0.75rem' }}>
          {backBgUrl && (
            <div style={{ width: '100%', aspectRatio: '3/4', maxHeight: '40vh', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--t-border)', flexShrink: 0 }}>
              <img src={backBgUrl} alt="back cover" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )}
          {!backBgUrl && bgUrl && (
            <div style={{ fontSize: '0.75rem', color: 'var(--t-text3)', lineHeight: 1.5, padding: '0.5rem 0' }}>
              AI will generate a back cover matching your front cover style.
            </div>
          )}
          <button className="cov-generate-btn" onClick={handleGenerate} disabled={!canGenerate}>
            <Sparkles size={13} /> {hasBackCover ? 'Regenerate Back Cover' : 'Generate Back Cover'}
          </button>
        </div>
      ) : (
        <>
          {/* Mode tabs — front cover only */}
          <div className="ce-section">
            <div className="cov-tabs" style={{ maxWidth: '100%' }}>
              <button className={`cov-tab${genMode === 'new'       ? ' cov-tab--on' : ''}`} onClick={() => setGenMode('new')}><Sparkles size={11} /> New</button>
              <button className={`cov-tab${genMode === 'improve'   ? ' cov-tab--on' : ''}`} onClick={() => setGenMode('improve')} disabled={!hasCover} title={hasCover ? '' : 'Generate a cover first'}><Wand2 size={11} /> Improve</button>
              <button className={`cov-tab${genMode === 'reference' ? ' cov-tab--on' : ''}`} onClick={() => setGenMode('reference')}><ImageIcon size={11} /> Reference</button>
            </div>
          </div>

          {/* Fields — new / reference */}
          {(genMode === 'new' || genMode === 'reference') && (
            <div className="ce-section" style={{ gap: '0.5rem' }}>
              {/* Design mode toggle */}
              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.25rem' }}>
                {([
                  { v: 'full-design'    as CoverDesignMode, label: '✦ Full AI Design', hint: 'AI renders title & author as typography' },
                  { v: 'background-only' as CoverDesignMode, label: '◻ Background Only', hint: 'Text-free image; add your own text layers' },
                ] as const).map(({ v, label, hint }) => (
                  <button
                    key={v}
                    className={`cov-chip${designMode === v ? ' cov-chip--on' : ''}`}
                    onClick={() => setDesignMode(v)}
                    title={hint}
                    style={{ flex: 1, justifyContent: 'center', fontSize: '0.68rem' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input className="cov-input" value={title}    onChange={e => setTitle(e.target.value)}    placeholder="Title *" />
              <input className="cov-input" value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Subtitle (optional)" />
              <input className="cov-input" value={author}   onChange={e => setAuthor(e.target.value)}   placeholder="Author (optional)" />

              {/* Reference image */}
              {genMode === 'reference' && (
                refImg ? (
                  <div style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden' }}>
                    <img src={refImg} alt="ref" style={{ width: '100%', maxHeight: '90px', objectFit: 'cover' }} />
                    <button onClick={() => setRefImg(null)} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={11} /></button>
                  </div>
                ) : (
                  <button className="cov-ref-btn" onClick={() => refInputRef.current?.click()}>
                    <Upload size={13} /> Upload reference image
                  </button>
                )
              )}
              <input ref={refInputRef} type="file" accept="image/*" onChange={handleRefUpload} style={{ display: 'none' }} />

              {/* Binding */}
              <div className="cov-row">
                {([{ value: 'saddle-stitch' as BindingType, label: 'Saddle Stitch', Icon: BookOpen }, { value: 'perfect-binding' as BindingType, label: 'Perfect Binding', Icon: BookMarked }]).map(({ value, label, Icon }) => (
                  <button key={value} className={`cov-chip${binding === value ? ' cov-chip--on' : ''}`} onClick={() => setBinding(value)}><Icon size={10} /> {label}</button>
                ))}
              </div>

              {/* Style */}
              <div className="cov-row cov-row--wrap">
                {STYLES.map(s => (
                  <button key={s.value} className={`cov-chip${style === s.value ? ' cov-chip--on' : ''}`} onClick={() => setStyle(s.value)}>{s.emoji} {s.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Improve mode */}
          {genMode === 'improve' && hasCover && (
            <div className="ce-section" style={{ gap: '0.75rem' }}>
              {/* Full-proportion cover preview */}
              {bgUrl && (
                <div style={{
                  width: '100%',
                  aspectRatio: '3 / 4',
                  maxHeight: '52vh',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid var(--t-border)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  flexShrink: 0,
                }}>
                  <img src={bgUrl} alt="current cover" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              )}

              {/* Text removal options */}
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--t-text3)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Text handling</div>
                <div className="cov-row cov-row--wrap" style={{ gap: '0.3rem' }}>
                  {([
                    { v: 'keep'          as TextRemovalMode, label: 'Keep text' },
                    { v: 'remove-all'    as TextRemovalMode, label: 'Remove all' },
                    { v: 'remove-title'  as TextRemovalMode, label: 'Remove title' },
                    { v: 'remove-author' as TextRemovalMode, label: 'Remove author' },
                  ] as const).map(({ v, label }) => (
                    <button
                      key={v}
                      className={`cov-chip${textMode === v ? ' cov-chip--on' : ''}`}
                      onClick={() => setTextMode(v)}
                      style={{ fontSize: '0.67rem' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                className="cov-input cov-textarea"
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder="e.g. Add gold border, darker colors, softer texture…"
                rows={3}
              />
            </div>
          )}

          {/* Generate button */}
          <div className="ce-section">
            <button className="cov-generate-btn" onClick={handleGenerate} disabled={!canGenerate}>
              <Sparkles size={13} /> {genMode === 'improve' ? 'Regenerate Background' : 'Generate Cover'}
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EDIT VIEW
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const EditView = (
    <div className="ce-panel" style={{ width: '100%', borderLeft: 'none', height: '100%' }}>

      {/* Regenerate background button */}
      <div className="ce-section">
        <button
          className="ce-add-btn"
          style={{ borderStyle: 'solid', color: '#818cf8', borderColor: 'rgba(129,140,248,0.4)' }}
          onClick={() => { setGenMode(hasCover ? 'improve' : 'new'); setShowGenerate(true); }}
        >
          <RotateCcw size={11} /> Regenerate Background
        </button>
      </div>

      {/* Layers */}
      <div className="ce-section">
        <SectionTitle><Layers size={12} /> Layers</SectionTitle>
        <div className="ce-layers">
          {blocks.map((b, i) => (
            <button
              key={b.id}
              className={`ce-layer${b.id === selId ? ' ce-layer--sel' : ''}`}
              onClick={() => onSelect(b.id)}
            >
              <span className="ce-layer-name">T{i + 1} — {b.text.slice(0, 20) || '…'}</span>
              <button className="ce-layer-del" onClick={e => { e.stopPropagation(); onDelete(b.id); }} title="Delete">
                <Trash2 size={10} />
              </button>
            </button>
          ))}
        </div>
        <button className="ce-add-btn" onClick={onAdd}><Plus size={11} /> Add Text Block</button>
      </div>

      {/* Properties */}
      {selBlock ? (
        <div className="ce-section">
          <SectionTitle>Properties</SectionTitle>

          <div className="ce-prop-row">
            <span className="ce-prop-label">Size</span>
            <div className="ce-prop-ctrl">
              <button className="ce-ctrl-btn" onClick={() => onUpdate(selBlock.id, { size: Math.max(0.5, +(selBlock.size - 0.1).toFixed(1)) })}><Minus size={10} /></button>
              <span className="ce-ctrl-val">{selBlock.size.toFixed(1)}</span>
              <button className="ce-ctrl-btn" onClick={() => onUpdate(selBlock.id, { size: Math.min(6, +(selBlock.size + 0.1).toFixed(1)) })}><Plus size={10} /></button>
            </div>
          </div>

          <div className="ce-prop-row">
            <span className="ce-prop-label">Width</span>
            <div className="ce-prop-ctrl" style={{ flex: 1 }}>
              <input type="range" min={20} max={100} step={5} value={selBlock.w} onChange={e => onUpdate(selBlock.id, { w: Number(e.target.value) })} className="ce-slider" />
              <span className="ce-ctrl-val">{selBlock.w}%</span>
            </div>
          </div>

          <div className="ce-prop-row">
            <span className="ce-prop-label">Style</span>
            <div className="ce-prop-ctrl">
              <button className={`ce-ctrl-btn${selBlock.weight >= 700 ? ' ce-ctrl-btn--on' : ''}`} onClick={() => onUpdate(selBlock.id, { weight: selBlock.weight >= 700 ? 400 : 700 })} title="Bold"><Bold size={11} /></button>
              <button className={`ce-ctrl-btn${selBlock.italic ? ' ce-ctrl-btn--on' : ''}`} onClick={() => onUpdate(selBlock.id, { italic: !selBlock.italic })} title="Italic"><Italic size={11} /></button>
              <button className={`ce-ctrl-btn${selBlock.shadow ? ' ce-ctrl-btn--on' : ''}`} onClick={() => onUpdate(selBlock.id, { shadow: !selBlock.shadow })} title="Shadow"><Type size={11} /></button>
            </div>
          </div>

          <div className="ce-prop-row">
            <span className="ce-prop-label">Align</span>
            <div className="ce-prop-ctrl">
              {(['left','center','right'] as const).map(a => {
                const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
                return <button key={a} className={`ce-ctrl-btn${selBlock.align === a ? ' ce-ctrl-btn--on' : ''}`} onClick={() => onUpdate(selBlock.id, { align: a })}><Icon size={11} /></button>;
              })}
            </div>
          </div>

          <div className="ce-prop-row ce-prop-row--wrap">
            <span className="ce-prop-label">Color</span>
            <div className="ce-prop-ctrl ce-prop-ctrl--wrap">
              {COLOR_PRESETS.map(c => (
                <button key={c} className={`ce-swatch${selBlock.color === c ? ' ce-swatch--on' : ''}`} style={{ background: c, border: c === '#ffffff' ? '1px solid #aaa' : undefined }} onClick={() => onUpdate(selBlock.id, { color: c })} />
              ))}
              <input type="color" className="ce-color-input" value={selBlock.color} onChange={e => onUpdate(selBlock.id, { color: e.target.value })} />
            </div>
          </div>

          <p className="ce-hint">Double-click text on canvas to edit. Drag to reposition.</p>
        </div>
      ) : (
        <div className="ce-section ce-empty-state">
          <p>Click a text layer above to edit its properties.</p>
        </div>
      )}
    </div>
  );

  return showGenerate ? GenerateView : EditView;
}
