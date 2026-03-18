/**
 * CoverSetup — inline cover generation form that renders INSIDE the canvas.
 * No modal, no dialog — appears as an overlay on the blank A4 page 0.
 */
import { useState, useRef, useCallback } from 'react';
import { Sparkles, Loader2, BookOpen, BookMarked, Upload, X, Wand2, ImageIcon } from 'lucide-react';
import {
  generateCoverBackground,
  improveCoverBackground,
  generateCoverBackgroundFromReference,
  buildEditableCoverHTML,
  type CoverStyle,
  type BindingType,
  type CoverPageOptions,
} from '../../services/geminiService';

interface Props {
  existingBgUrl?: string;
  onApply:  (html: string) => void;
  onError:  (msg: string) => void;
  onClose?: () => void;         // escape / skip without generating
}

type Mode = 'generate' | 'improve' | 'reference';

const STYLES: { value: CoverStyle; label: string; emoji: string }[] = [
  { value: 'orthodox',   label: 'Orthodox',   emoji: '✝️' },
  { value: 'ornate',     label: 'Ornate',     emoji: '📜' },
  { value: 'classic',    label: 'Classic',    emoji: '📕' },
  { value: 'modern',     label: 'Modern',     emoji: '🎨' },
  { value: 'minimalist', label: 'Minimal',    emoji: '◻️' },
];

export default function CoverSetup({ existingBgUrl, onApply, onError, onClose }: Props) {
  const [mode,     setMode]     = useState<Mode>(existingBgUrl ? 'improve' : 'generate');
  const [title,    setTitle]    = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [author,   setAuthor]   = useState('');
  const [style,    setStyle]    = useState<CoverStyle>('orthodox');
  const [binding,  setBinding]  = useState<BindingType>('saddle-stitch');
  const [instruction, setInstruction] = useState('');
  const [refImg,   setRefImg]   = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);
  const cancelledRef = useRef(false);
  const refInputRef  = useRef<HTMLInputElement>(null);

  const handleRefUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setRefImg(reader.result as string); setMode('reference'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const canGenerate =
    (mode === 'generate'  && title.trim()) ||
    (mode === 'improve'   && existingBgUrl) ||
    (mode === 'reference' && refImg && title.trim());

  const handleGenerate = async () => {
    if (!canGenerate || busy) return;
    cancelledRef.current = false;
    setBusy(true);
    try {
      const opts: CoverPageOptions = {
        title:    title.trim() || 'Untitled',
        subtitle: subtitle.trim() || undefined,
        author:   author.trim()   || undefined,
        style, binding,
      };
      let bgUrl: string;
      if (mode === 'generate')     bgUrl = await generateCoverBackground(opts);
      else if (mode === 'improve') bgUrl = await improveCoverBackground(existingBgUrl!, instruction.trim() || 'Improve overall design quality and visual appeal.');
      else                         bgUrl = await generateCoverBackgroundFromReference(refImg!, opts);
      if (!cancelledRef.current) onApply(buildEditableCoverHTML(bgUrl, opts));
    } catch (err) {
      if (!cancelledRef.current) onError(err instanceof Error ? err.message : 'Cover generation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setBusy(false);
    onClose?.();
  };

  // ── While generating: scan animation + Cancel button ─────────────────
  if (busy) {
    return (
      <div className="cov-generating">
        <div className="cov-gen-fx">
          <div className="cov-gen-scan-line" />
        </div>
        <div className="cov-gen-label">
          <Loader2 size={18} className="animate-spin" />
          <span>Generating cover background…</span>
        </div>
        <button className="cov-cancel-btn" onClick={handleCancel}>
          <X size={13} /> Cancel
        </button>
      </div>
    );
  }

  // ── Inline form ──────────────────────────────────────────────────────
  return (
    <div className="cov-setup">
      <div className="cov-setup-header">
        <Sparkles size={16} />
        <span>Cover Page Generator</span>
        <span className="cov-setup-badge">NanoBanana 2</span>
        {onClose && (
          <button className="cov-setup-close" onClick={onClose} title="Skip cover page (Escape)">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Mode tabs */}
      <div className="cov-tabs">
        <button className={`cov-tab${mode === 'generate'  ? ' cov-tab--on' : ''}`} onClick={() => setMode('generate')}>
          <Sparkles size={11} /> New
        </button>
        <button
          className={`cov-tab${mode === 'improve' ? ' cov-tab--on' : ''}`}
          onClick={() => setMode('improve')}
          disabled={!existingBgUrl}
          title={existingBgUrl ? '' : 'Generate a cover first'}
        >
          <Wand2 size={11} /> Improve
        </button>
        <button className={`cov-tab${mode === 'reference' ? ' cov-tab--on' : ''}`} onClick={() => setMode('reference')}>
          <ImageIcon size={11} /> Reference
        </button>
      </div>

      {/* Fields for generate / reference */}
      {(mode === 'generate' || mode === 'reference') && (
        <div className="cov-fields">
          <input className="cov-input" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Title *" />
          <input className="cov-input" value={subtitle} onChange={e => setSubtitle(e.target.value)}
            placeholder="Subtitle (optional)" />
          <input className="cov-input" value={author} onChange={e => setAuthor(e.target.value)}
            placeholder="Author (optional)" />

          {/* Reference image upload */}
          {mode === 'reference' && (
            <div className="cov-ref-wrap">
              {refImg ? (
                <div className="cov-ref-preview">
                  <img src={refImg} alt="ref" />
                  <button className="cov-ref-remove" onClick={() => setRefImg(null)}><X size={12} /></button>
                </div>
              ) : (
                <button className="cov-ref-btn" onClick={() => refInputRef.current?.click()}>
                  <Upload size={14} /> Upload reference image
                </button>
              )}
              <input ref={refInputRef} type="file" accept="image/*" onChange={handleRefUpload} style={{ display: 'none' }} />
            </div>
          )}

          {/* Binding */}
          <div className="cov-row">
            {[
              { value: 'saddle-stitch' as BindingType, label: 'Saddle Stitch', Icon: BookOpen },
              { value: 'perfect-binding' as BindingType, label: 'Perfect Binding', Icon: BookMarked },
            ].map(({ value, label, Icon }) => (
              <button
                key={value}
                className={`cov-chip${binding === value ? ' cov-chip--on' : ''}`}
                onClick={() => setBinding(value)}
              >
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>

          {/* Style */}
          <div className="cov-row cov-row--wrap">
            {STYLES.map(s => (
              <button
                key={s.value}
                className={`cov-chip${style === s.value ? ' cov-chip--on' : ''}`}
                onClick={() => setStyle(s.value)}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Improve mode */}
      {mode === 'improve' && existingBgUrl && (
        <div className="cov-fields">
          <div className="cov-existing-thumb">
            <img src={existingBgUrl} alt="current cover" />
          </div>
          <textarea
            className="cov-input cov-textarea"
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="e.g. Add gold border, darker colors, more Ethiopian patterns…"
            rows={3}
          />
        </div>
      )}

      {/* Generate button */}
      <button className="cov-generate-btn" onClick={handleGenerate} disabled={!canGenerate}>
        <Sparkles size={14} />
        {mode === 'improve' ? 'Regenerate Background' : 'Generate Cover'}
      </button>
    </div>
  );
}
