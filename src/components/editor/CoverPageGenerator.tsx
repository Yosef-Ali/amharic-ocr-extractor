import { useState, useRef, useCallback } from 'react';
import {
  X, Loader2, Sparkles, Upload, Image as ImageIcon,
  Wand2, RotateCcw, Check, BookOpen, BookMarked,
} from 'lucide-react';
import {
  generateCoverBackground,
  improveCoverBackground,
  generateCoverBackgroundFromReference,
  buildEditableCoverHTML,
  type CoverStyle,
  type CoverPageOptions,
  type BindingType,
} from '../../services/geminiService';

// ── Types ────────────────────────────────────────────────────────────────────
type Mode = 'generate' | 'improve' | 'reference';

interface Props {
  /** Current cover background data URL (if one exists already) */
  existingCover?: string;
  /** Called with editable HTML to finalize cover as page 0 */
  onApply: (coverHtml: string) => void;
  onClose: () => void;
  /** Live-preview callback — updates canvas page 0 in real time */
  onPreview?: (html: string) => void;
}

const STYLES: { value: CoverStyle; label: string; emoji: string }[] = [
  { value: 'orthodox',   label: 'Ethiopian Orthodox', emoji: '✝️' },
  { value: 'ornate',     label: 'Ornate Manuscript',  emoji: '📜' },
  { value: 'classic',    label: 'Classic',             emoji: '📕' },
  { value: 'modern',     label: 'Modern',              emoji: '🎨' },
  { value: 'minimalist', label: 'Minimalist',          emoji: '◻️' },
];

const BINDINGS: { value: BindingType; label: string; icon: typeof BookOpen }[] = [
  { value: 'saddle-stitch',    label: 'Saddle Stitch',    icon: BookOpen },
  { value: 'perfect-binding',  label: 'Perfect Binding',  icon: BookMarked },
];

// ── Component ────────────────────────────────────────────────────────────────
export default function CoverPageGenerator({ existingCover, onApply, onClose, onPreview }: Props) {
  // Form state
  const [title,    setTitle]    = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [author,   setAuthor]   = useState('');
  const [style,    setStyle]    = useState<CoverStyle>('orthodox');
  const [binding,  setBinding]  = useState<BindingType>('saddle-stitch');
  const [mode,     setMode]     = useState<Mode>(existingCover ? 'improve' : 'generate');

  // Improve mode
  const [improveInstruction, setImproveInstruction] = useState('');

  // Reference image
  const [referenceImg, setReferenceImg] = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  // Generation state
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [previewBgUrl,  setPreviewBgUrl]  = useState<string | null>(null);
  const [previewHtml,   setPreviewHtml]   = useState<string | null>(null);
  const [error,         setError]         = useState<string | null>(null);

  // ── Reference image upload ──────────────────────────────────────────────
  const handleRefUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setReferenceImg(reader.result as string);
      setMode('reference');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // ── Generate ────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (mode === 'generate' && !title.trim()) return;
    if (mode === 'improve' && !existingCover) return;
    if (mode === 'reference' && !referenceImg) return;

    setIsGenerating(true);
    setError(null);

    try {
      let bgUrl: string;
      const opts: CoverPageOptions = {
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        author: author.trim() || undefined,
        style,
        binding,
      };

      switch (mode) {
        case 'generate':
          bgUrl = await generateCoverBackground(opts);
          break;
        case 'improve':
          bgUrl = await improveCoverBackground(
            existingCover!,
            improveInstruction.trim() || 'Improve the overall design quality, colors, and visual appeal of the background.',
          );
          break;
        case 'reference':
          bgUrl = await generateCoverBackgroundFromReference(referenceImg!, opts);
          break;
      }

      setPreviewBgUrl(bgUrl);
      // Build editable HTML and push live to canvas
      const html = buildEditableCoverHTML(bgUrl, opts);
      setPreviewHtml(html);
      onPreview?.(html);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const canGenerate =
    (mode === 'generate' && title.trim()) ||
    (mode === 'improve' && existingCover) ||
    (mode === 'reference' && referenceImg && title.trim());

  return (
    <div className="cpg-panel">
      {/* Header */}
      <div className="cpg-header">
        <div className="cpg-header-title">
          <Sparkles size={15} />
          <span>Cover Page</span>
          <span className="cpg-badge">AI</span>
        </div>
        <button className="cpg-close" onClick={onClose} title="Close"><X size={15} /></button>
      </div>

      {/* Form — scrollable body */}
      <div className="cpg-form">
        {/* Mode tabs */}
        <div className="cpg-tabs">
          <button
            className={`cpg-tab${mode === 'generate' ? ' cpg-tab--active' : ''}`}
            onClick={() => setMode('generate')}
          >
            <Sparkles size={12} /> New
          </button>
          <button
            className={`cpg-tab${mode === 'improve' ? ' cpg-tab--active' : ''}`}
            onClick={() => setMode('improve')}
            disabled={!existingCover}
            title={!existingCover ? 'No existing cover to improve' : ''}
          >
            <Wand2 size={12} /> Improve
          </button>
          <button
            className={`cpg-tab${mode === 'reference' ? ' cpg-tab--active' : ''}`}
            onClick={() => setMode('reference')}
          >
            <ImageIcon size={12} /> Reference
          </button>
        </div>

        {/* Generate / Reference mode — title + style fields */}
        {(mode === 'generate' || mode === 'reference') && (
          <>
            <label className="cpg-label">
              Title <span className="cpg-required">*</span>
              <input
                className="cpg-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. የካቶሊክ ቤተ ክርስቲያን ትምህርተ ክርስቶስ"
              />
            </label>
            <label className="cpg-label">
              Subtitle
              <input
                className="cpg-input"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                placeholder="e.g. Compendium"
              />
            </label>
            <label className="cpg-label">
              Author
              <input
                className="cpg-input"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="e.g. ቅዱስ ዮሐንስ ጳውሎስ ዳግማዊ"
              />
            </label>

            {/* Binding type picker */}
            <div className="cpg-label">Binding</div>
            <div className="cpg-bindings">
              {BINDINGS.map(b => {
                const Icon = b.icon;
                return (
                  <button
                    key={b.value}
                    className={`cpg-binding-btn${binding === b.value ? ' cpg-binding-btn--active' : ''}`}
                    onClick={() => setBinding(b.value)}
                  >
                    <Icon size={13} />
                    <span>{b.label}</span>
                  </button>
                );
              })}
            </div>
            {binding === 'perfect-binding' && (
              <div className="cpg-binding-hint">
                Adds a spine strip with rotated title on the book edge
              </div>
            )}

            {/* Style picker */}
            <div className="cpg-label">Style</div>
            <div className="cpg-styles">
              {STYLES.map(s => (
                <button
                  key={s.value}
                  className={`cpg-style-btn${style === s.value ? ' cpg-style-btn--active' : ''}`}
                  onClick={() => setStyle(s.value)}
                >
                  <span>{s.emoji}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Reference mode — upload area */}
        {mode === 'reference' && (
          <div className="cpg-ref-section">
            <div className="cpg-label">Reference Image</div>
            {referenceImg ? (
              <div className="cpg-ref-preview">
                <img src={referenceImg} alt="Reference" />
                <button className="cpg-ref-remove" onClick={() => setReferenceImg(null)}>
                  <X size={14} /> Remove
                </button>
              </div>
            ) : (
              <button className="cpg-ref-upload" onClick={() => refInputRef.current?.click()}>
                <Upload size={18} />
                <span>Upload reference image</span>
                <span className="cpg-ref-hint">Style inspired by this image</span>
              </button>
            )}
            <input
              ref={refInputRef}
              type="file"
              accept="image/*"
              onChange={handleRefUpload}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* Improve mode */}
        {mode === 'improve' && existingCover && (
          <>
            <div className="cpg-label">Current Background</div>
            <div className="cpg-existing-preview">
              <img src={existingCover} alt="Current cover background" />
            </div>
            <label className="cpg-label">
              Improvement Instructions
              <textarea
                className="cpg-textarea"
                value={improveInstruction}
                onChange={e => setImproveInstruction(e.target.value)}
                placeholder="e.g. Add gold ornamental border, darker background, more Ethiopian patterns..."
                rows={3}
              />
            </label>
          </>
        )}

        {/* Error */}
        {error && <div className="cpg-error">{error}</div>}

        {/* Generate button */}
        <button
          className="cpg-generate-btn"
          onClick={handleGenerate}
          disabled={isGenerating || !canGenerate}
        >
          {isGenerating ? (
            <><Loader2 size={15} className="animate-spin" /> Generating…</>
          ) : previewBgUrl ? (
            <><RotateCcw size={15} /> Regenerate</>
          ) : (
            <><Sparkles size={15} /> Generate Cover</>
          )}
        </button>

        {/* Apply button — visible once a cover has been generated */}
        {previewHtml && !isGenerating && (
          <button className="cpg-action-btn cpg-action-btn--apply" onClick={() => { onApply(previewHtml); onClose(); }}>
            <Check size={14} /> Done — Close Panel
          </button>
        )}

        {/* Live hint */}
        {isGenerating && (
          <p className="cpg-live-hint">Rendering live on canvas…</p>
        )}
        {previewHtml && !isGenerating && (
          <p className="cpg-live-hint">Cover is live on canvas. Edit text directly on the page.</p>
        )}
      </div>
    </div>
  );
}
