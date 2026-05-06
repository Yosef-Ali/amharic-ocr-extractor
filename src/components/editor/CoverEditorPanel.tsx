/**
 * CoverEditorPanel — unified right-drawer panel for the cover page.
 *
 * Two views handled in one place:
 *  • GENERATE — when no cover exists, or user wants a new/improved background
 *  • EDIT     — layers list + text properties when a cover is present
 *
 * The canvas stays clean — zero UI overlap.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Sparkles, Wand2, ImageIcon, Upload, X,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Trash2, Plus, Minus, Type, Layers, BookOpen, BookMarked, RotateCcw,
  Camera,
} from 'lucide-react';
import DeleteConfirmModal from '../DeleteConfirmModal';
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function autoLabel(blocks: CoverBlock[], index: number): string {
  const sorted = [...blocks].sort((a, b) => b.size - a.size);
  const rank = sorted.findIndex(b => b.id === blocks[index].id);
  const labels = ['Title', 'Subtitle', 'Author', 'Publisher'];
  return labels[rank] ?? `T${index + 1}`;
}

// ── Template definitions (8 print-quality Ethiopian styles) ───────────────────
interface TemplateInfo {
  value: CoverStyle;
  label: string;
  desc: string;
  bg: string;       // CSS gradient for mini preview swatch
  accent: string;   // mock title text color in preview
  dots: [string, string, string];  // 3-swatch palette
}

const TEMPLATES: TemplateInfo[] = [
  {
    value: 'orthodox',
    label: 'Orthodox',
    desc: 'Gold crosses, deep reds, Ge\'ez borders',
    bg: 'linear-gradient(160deg, #140404 0%, #5a1010 50%, #0d0d2e 100%)',
    accent: '#c9a84c',
    dots: ['#5a1010', '#0d0d2e', '#c9a84c'],
  },
  {
    value: 'ornate',
    label: 'Ornate',
    desc: 'Illuminated manuscript, rich interlacing',
    bg: 'linear-gradient(155deg, #0d1b3e 0%, #2a0a40 45%, #4a0e20 100%)',
    accent: '#f0c040',
    dots: ['#0d1b3e', '#c41e3a', '#f0c040'],
  },
  {
    value: 'heritage',
    label: 'Heritage',
    desc: 'Parchment, ink calligraphy, folk patterns',
    bg: 'linear-gradient(160deg, #c8a96e 0%, #a0722a 50%, #4a2210 100%)',
    accent: '#fef3c7',
    dots: ['#f5e6c8', '#c9843c', '#4a2210'],
  },
  {
    value: 'contemporary',
    label: 'Ethiopian',
    desc: 'Flag colors, bold graphic, modern energy',
    bg: 'linear-gradient(145deg, #064e27 0%, #d4a800 50%, #b00f12 100%)',
    accent: '#ffffff',
    dots: ['#078930', '#fcdd09', '#da121a'],
  },
  {
    value: 'classic',
    label: 'Classic',
    desc: 'Serif elegance, decorative frames',
    bg: 'linear-gradient(160deg, #2c1810 0%, #6b3d14 55%, #9a7020 100%)',
    accent: '#f5e6c8',
    dots: ['#2c1810', '#8b6914', '#f5e6c8'],
  },
  {
    value: 'academic',
    label: 'Academic',
    desc: 'Navy & ivory, scholarly, institutional',
    bg: 'linear-gradient(160deg, #0f1e38 0%, #1e3a5f 60%, #2a4a7a 100%)',
    accent: '#e8d9a0',
    dots: ['#0f1e38', '#1e3a5f', '#c9a84c'],
  },
  {
    value: 'modern',
    label: 'Modern',
    desc: 'Bold geometry, clean, contemporary',
    bg: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #312e81 100%)',
    accent: '#a5b4fc',
    dots: ['#0f172a', '#4f46e5', '#818cf8'],
  },
  {
    value: 'minimalist',
    label: 'Minimal',
    desc: 'Clean flat, whitespace, single accent',
    bg: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
    accent: '#4f46e5',
    dots: ['#f8fafc', '#6366f1', '#1e293b'],
  },
];

// ── Progress phases ───────────────────────────────────────────────────────────
const PHASES = ['Composing design', 'Generating artwork', 'Refining image', 'Finalizing cover'];
// Phase advance timing (ms after busy=true)
const PHASE_TIMES = [0, 1200, 9000, 17000];
// Progress bar widths per phase
const PHASE_WIDTHS = ['6%', '28%', '68%', '90%'];

// ── Constants ─────────────────────────────────────────────────────────────────
const COLOR_PRESETS = ['#ffffff','#000000','#d4a574','#fbbf24','#f87171','#a3e635','#38bdf8','#c084fc','#f8fafc','#1e293b'];

type GenMode = 'new' | 'improve' | 'photo';

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  hasCover:     boolean;
  hasBackCover: boolean;
  bgUrl:        string;
  backBgUrl:    string;
  activeCoverSide: 'front' | 'back';
  blocks:    CoverBlock[];
  selId:     string | null;
  onSelect:    (id: string | null) => void;
  onUpdate:    (id: string, patch: Partial<CoverBlock>) => void;
  onAdd:       () => void;
  onDelete:    (id: string) => void;
  onDeleteCover?: () => void;
  onApply:     (html: string) => void;
  onApplyBack: (html: string) => void;
  onError:     (msg: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CoverEditorPanel({
  hasCover, hasBackCover, bgUrl, backBgUrl, activeCoverSide,
  blocks, selId,
  onSelect, onUpdate, onAdd, onDelete, onDeleteCover, onApply, onApplyBack, onError,
}: Props) {
  const [editSide, setEditSide] = useState<'front' | 'back'>(activeCoverSide);
  const [showGenerate, setShowGenerate] = useState(!hasCover);

  // Generation form
  const [genMode,      setGenMode]      = useState<GenMode>('new');
  const [designMode,   setDesignMode]   = useState<CoverDesignMode>('full-design');
  const [textMode,     setTextMode]     = useState<TextRemovalMode>('keep');
  const [title,        setTitle]        = useState('');
  const [subtitle,     setSubtitle]     = useState('');
  const [author,       setAuthor]       = useState('');
  const [style,        setStyle]        = useState<CoverStyle>('orthodox');
  const [binding,      setBinding]      = useState<BindingType>('saddle-stitch');
  const [instruction,  setInstruction]  = useState('');
  const [photoImg,     setPhotoImg]     = useState<string | null>(null);
  const [isDragOver,   setIsDragOver]   = useState(false);
  const [busy,         setBusy]         = useState(false);
  const [phase,        setPhase]        = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const cancelledRef  = useRef(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const selBlock = blocks.find(b => b.id === selId);

  // ── Phase advancement while generating ──────────────────────────────────────
  useEffect(() => {
    if (!busy) { setPhase(0); return; }
    setPhase(0);
    const timers = PHASE_TIMES.slice(1).map((t, i) =>
      setTimeout(() => setPhase(i + 1), t),
    );
    return () => timers.forEach(clearTimeout);
  }, [busy]);

  // ── Photo upload / drag-drop ─────────────────────────────────────────────────
  const loadPhotoFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoImg(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handlePhotoInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadPhotoFile(file);
    e.target.value = '';
  }, [loadPhotoFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback(() => setIsDragOver(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadPhotoFile(file);
  }, [loadPhotoFile]);

  // ── Generate ────────────────────────────────────────────────────────────────
  const canGenerate =
    editSide === 'back'
      ? !!hasCover
      : genMode === 'new'
          ? title.trim().length > 0
          : genMode === 'improve'
              ? hasCover
              : !!photoImg; // photo mode: need a photo

  const handleGenerate = async () => {
    if (!canGenerate || busy) return;
    cancelledRef.current = false;
    setBusy(true);
    try {
      if (editSide === 'back') {
        const backBg = await generateBackCover(bgUrl, { title: title.trim() || 'Untitled', subtitle: subtitle.trim() || undefined, author: author.trim() || undefined, style, designMode });
        if (!cancelledRef.current) { onApplyBack(buildBackCoverHTML(backBg)); setShowGenerate(false); }
        return;
      }
      const opts: CoverPageOptions = {
        title:    title.trim() || 'Untitled',
        subtitle: subtitle.trim() || undefined,
        author:   author.trim()   || undefined,
        style, binding,
        designMode: genMode === 'improve' ? undefined : designMode,
      };
      let bgDataUrl: string;
      if      (genMode === 'new')     bgDataUrl = await generateCoverBackground(opts);
      else if (genMode === 'improve') bgDataUrl = await improveCoverBackground(bgUrl, instruction.trim(), undefined, textMode);
      else                            bgDataUrl = await generateCoverBackgroundFromReference(photoImg!, opts);
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

  // Direct photo placement — no AI, instant
  const handleUsePhotoDirectly = () => {
    if (!photoImg) return;
    const opts: CoverPageOptions = {
      title:    title.trim() || 'Untitled',
      subtitle: subtitle.trim() || undefined,
      author:   author.trim()   || undefined,
      style, binding,
      designMode: 'background-only',
    };
    onApply(buildEditableCoverHTML(photoImg, opts));
    setShowGenerate(false);
  };

  const handleCancel = () => { cancelledRef.current = true; setBusy(false); };

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
          <button className={`cov-tab${editSide === 'front' ? ' cov-tab--on' : ''}`} onClick={() => setEditSide('front')}>Front Cover</button>
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

      {/* ── Generating state ── */}
      {busy ? (
        <div className="cov-progress-wrap">
          {/* Phase dots + connectors */}
          <div className="cov-progress-phases">
            {PHASES.map((p, i) => (
              <div key={p} style={{ display: 'contents' }}>
                <div className="cov-progress-phase">
                  <div className={`cov-progress-dot${i < phase ? ' cov-progress-dot--done' : i === phase ? ' cov-progress-dot--active' : ''}`} />
                </div>
                {i < PHASES.length - 1 && (
                  <div className={`cov-progress-connector${i < phase ? ' cov-progress-connector--done' : ''}`} />
                )}
              </div>
            ))}
          </div>

          {/* Bar */}
          <div className="cov-progress-bar-wrap">
            <div className="cov-progress-bar-fill" style={{ width: PHASE_WIDTHS[phase] }} />
          </div>

          {/* Label */}
          <div className="cov-progress-phase-label">{PHASES[phase]}</div>
          <div className="cov-progress-hint">This usually takes 15–30 seconds</div>

          <button className="cov-cancel-btn" onClick={handleCancel}><X size={12} /> Cancel</button>
        </div>
      ) : editSide === 'back' ? (
        /* ── Back Cover panel ── */
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
          {/* ── Mode tabs ── */}
          <div className="ce-section">
            <div className="cov-tabs" style={{ maxWidth: '100%' }}>
              <button className={`cov-tab${genMode === 'new'     ? ' cov-tab--on' : ''}`} onClick={() => setGenMode('new')}><Sparkles size={11} /> New</button>
              <button className={`cov-tab${genMode === 'improve' ? ' cov-tab--on' : ''}`} onClick={() => setGenMode('improve')} disabled={!hasCover} title={hasCover ? '' : 'Generate a cover first'}><Wand2 size={11} /> Improve</button>
              <button className={`cov-tab${genMode === 'photo'   ? ' cov-tab--on' : ''}`} onClick={() => setGenMode('photo')}><Camera size={11} /> Photo</button>
            </div>
          </div>

          {/* ── NEW mode ── */}
          {genMode === 'new' && (
            <div className="ce-section" style={{ gap: '0.5rem' }}>
              {/* Design mode toggle */}
              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.25rem' }}>
                {([
                  { v: 'full-design'     as CoverDesignMode, label: '✦ Full AI Design' },
                  { v: 'background-only' as CoverDesignMode, label: '◻ Background Only' },
                ] as const).map(({ v, label }) => (
                  <button key={v} className={`cov-chip${designMode === v ? ' cov-chip--on' : ''}`} onClick={() => setDesignMode(v)} style={{ flex: 1, justifyContent: 'center', fontSize: '0.68rem' }}>
                    {label}
                  </button>
                ))}
              </div>

              <input className="cov-input" value={title}    onChange={e => setTitle(e.target.value)}    placeholder="Title *" />
              <input className="cov-input" value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Subtitle (optional)" />
              <input className="cov-input" value={author}   onChange={e => setAuthor(e.target.value)}   placeholder="Author (optional)" />

              {/* Binding */}
              <div className="cov-row">
                {([{ value: 'saddle-stitch' as BindingType, label: 'Saddle Stitch', Icon: BookOpen }, { value: 'perfect-binding' as BindingType, label: 'Perfect Binding', Icon: BookMarked }]).map(({ value, label, Icon }) => (
                  <button key={value} className={`cov-chip${binding === value ? ' cov-chip--on' : ''}`} onClick={() => setBinding(value)}><Icon size={10} /> {label}</button>
                ))}
              </div>

              {/* ── Template grid ── */}
              <div style={{ fontSize: '0.68rem', color: 'var(--t-text3)', fontWeight: 600, marginTop: '0.25rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Style</div>
              <div className="cov-template-grid">
                {TEMPLATES.map(t => (
                  <button
                    key={t.value}
                    className={`cov-template-card${style === t.value ? ' cov-template-card--on' : ''}`}
                    onClick={() => setStyle(t.value)}
                  >
                    {/* Mini cover preview */}
                    <div className="cov-template-preview" style={{ background: t.bg }}>
                      <div className="cov-template-title-mock" style={{ color: t.accent }}>
                        {title || t.label}
                      </div>
                      <div className="cov-template-dots">
                        {t.dots.map(d => (
                          <div key={d} className="cov-template-dot" style={{ background: d }} />
                        ))}
                      </div>
                    </div>
                    <div className="cov-template-label">{t.label}</div>
                    <div className="cov-template-desc">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── IMPROVE mode ── */}
          {genMode === 'improve' && hasCover && (
            <div className="ce-section" style={{ gap: '0.75rem' }}>
              {bgUrl && (
                <div style={{ width: '100%', aspectRatio: '3 / 4', maxHeight: '52vh', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--t-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', flexShrink: 0 }}>
                  <img src={bgUrl} alt="current cover" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--t-text3)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Text handling</div>
                <div className="cov-row cov-row--wrap" style={{ gap: '0.3rem' }}>
                  {([
                    { v: 'keep'          as TextRemovalMode, label: 'Keep text' },
                    { v: 'remove-all'    as TextRemovalMode, label: 'Remove all' },
                    { v: 'remove-title'  as TextRemovalMode, label: 'Remove title' },
                    { v: 'remove-author' as TextRemovalMode, label: 'Remove author' },
                  ] as const).map(({ v, label }) => (
                    <button key={v} className={`cov-chip${textMode === v ? ' cov-chip--on' : ''}`} onClick={() => setTextMode(v)} style={{ fontSize: '0.67rem' }}>
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

          {/* ── PHOTO mode ── */}
          {genMode === 'photo' && (
            <div className="ce-section" style={{ gap: '0.6rem' }}>
              {/* Drop zone / preview */}
              {photoImg ? (
                <div className="cov-photo-preview">
                  <img src={photoImg} alt="photo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div className="cov-photo-preview-overlay">
                    <button className="cov-photo-change-btn" onClick={() => photoInputRef.current?.click()}>
                      <Upload size={11} /> Change photo
                    </button>
                    <button className="cov-photo-change-btn" style={{ color: '#fca5a5', borderColor: 'rgba(239,68,68,0.5)' }} onClick={() => setPhotoImg(null)}>
                      <X size={11} /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`cov-photo-drop${isDragOver ? ' cov-photo-drop--drag' : ''}`}
                  onClick={() => photoInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Camera size={22} style={{ opacity: 0.5 }} />
                  <span style={{ fontWeight: 600 }}>Drop a photo here</span>
                  <span style={{ fontSize: '0.68rem', opacity: 0.6 }}>or click to browse</span>
                </div>
              )}
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoInput} style={{ display: 'none' }} />

              {/* Text fields */}
              <input className="cov-input" value={title}    onChange={e => setTitle(e.target.value)}    placeholder="Title" />
              <input className="cov-input" value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Subtitle (optional)" />
              <input className="cov-input" value={author}   onChange={e => setAuthor(e.target.value)}   placeholder="Author (optional)" />

              {/* Two actions */}
              <button
                className="cov-generate-btn"
                onClick={handleUsePhotoDirectly}
                disabled={!photoImg}
                style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}
              >
                <ImageIcon size={13} /> Use Photo as Cover
              </button>
              <button
                className="cov-generate-btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', opacity: photoImg ? undefined : 0.45 }}
              >
                <Sparkles size={13} /> Generate AI Cover from Photo
              </button>
              <p style={{ fontSize: '0.65rem', color: 'var(--t-text3)', margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
                "Use Photo" places your image directly.<br />"Generate AI" uses it as style reference.
              </p>
            </div>
          )}

          {/* Generate button — shown for new / improve */}
          {(genMode === 'new' || genMode === 'improve') && (
            <div className="ce-section">
              <button className="cov-generate-btn" onClick={handleGenerate} disabled={!canGenerate}>
                <Sparkles size={13} /> {genMode === 'improve' ? 'Regenerate Background' : 'Generate Cover'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EDIT VIEW
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const EditView = (
    <div className="ce-panel" style={{ width: '100%', borderLeft: 'none', height: '100%' }}>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          onConfirm={() => { setShowDeleteConfirm(false); onDeleteCover?.(); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      <div className="ce-section" style={{ gap: '0.4rem' }}>
        <button
          className="ce-add-btn"
          style={{ borderStyle: 'solid', color: '#818cf8', borderColor: 'rgba(129,140,248,0.4)' }}
          onClick={() => { setGenMode(hasCover ? 'improve' : 'new'); setShowGenerate(true); }}
        >
          <RotateCcw size={11} /> Regenerate Background
        </button>
        {onDeleteCover && (
          <button
            className="ce-add-btn"
            style={{ borderStyle: 'solid', color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)' }}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 size={11} /> Delete Cover Page
          </button>
        )}
      </div>

      <div className="ce-section">
        <SectionTitle><Layers size={12} /> Layers</SectionTitle>
        <div className="ce-layers">
          {blocks.map((b, i) => (
            <button
              key={b.id}
              className={`ce-layer${b.id === selId ? ' ce-layer--sel' : ''}`}
              onClick={() => onSelect(b.id)}
            >
              <span className="ce-layer-swatch" style={{ background: b.color }} />
              <span className="ce-layer-name">{autoLabel(blocks, i)} — {b.text.slice(0, 20) || '…'}</span>
              <button className="ce-layer-del" onClick={e => { e.stopPropagation(); onDelete(b.id); }} title="Delete">
                <Trash2 size={10} />
              </button>
            </button>
          ))}
        </div>
        <button className="ce-add-btn" onClick={onAdd}><Plus size={11} /> Add Text Block</button>
      </div>

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
