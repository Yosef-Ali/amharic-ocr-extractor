import { useState, useEffect, useCallback } from 'react';
import {
  ChevronUp, ChevronDown, ChevronRight, LayoutGrid, Type, Columns3,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Italic, Underline, Strikethrough, FileText, Pilcrow, Image, Scissors, Sparkles, X, Loader2,
} from 'lucide-react';
import { type ElementStyles } from '../DocumentPage';
import { useScrub } from '../../hooks/useScrub';

// ── Types ────────────────────────────────────────────────────────────────────
export interface PageLayout {
  marginT:    number;  // mm
  marginR:    number;  // mm
  marginB:    number;  // mm
  marginL:    number;  // mm
  columns:    1 | 2 | 3 | 4;
  colGap:     number;  // rem
  fontSize:   number;  // rem
  lineHeight: number;  // unitless
}

export const DEFAULT_LAYOUT: PageLayout = {
  marginT: 12, marginR: 16, marginB: 12, marginL: 16,
  columns: 1,  colGap: 1.5,
  fontSize: 1.0, lineHeight: 1.6,
};

export function layoutToStyle(layout: PageLayout): React.CSSProperties {
  return {
    padding:     `${layout.marginT}mm ${layout.marginR}mm ${layout.marginB}mm ${layout.marginL}mm`,
    columnCount: layout.columns > 1 ? layout.columns : undefined,
    columnGap:   layout.columns > 1 ? `${layout.colGap}rem` : undefined,
    fontSize:    `${layout.fontSize}rem`,
    lineHeight:  `${layout.lineHeight}`,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function parsePx(val: string): number {
  return parseFloat(val) || 0;
}
function parseUnitless(val: string): number {
  return parseFloat(val) || 1.6;
}
function parseLetterSpacing(val: string): number {
  if (!val || val === 'normal') return 0;
  return parseFloat(val) || 0;
}

// ── Collapsible section header ───────────────────────────────────────────
function SectionHead({ icon, label, open, onToggle }: {
  icon: React.ReactNode; label: string;
  open: boolean; onToggle: () => void;
}) {
  return (
    <button className="insp-section-toggle" onClick={onToggle}>
      {icon} {label}
      <ChevronRight
        size={10}
        className={`insp-chevron${open ? ' insp-chevron--open' : ''}`}
      />
    </button>
  );
}

// ── Stepper input ─────────────────────────────────────────────────────────
interface StepperProps {
  label:    string;
  value:    number;
  min:      number;
  max:      number;
  step:     number;
  unit?:    string;
  onChange: (v: number) => void;
}

function Stepper({ label, value, min, max, step, unit, onChange }: StepperProps) {
  const clamp = (v: number) => Math.max(min, Math.min(max, parseFloat(v.toFixed(2))));
  const scrub = useScrub({ value, min, max, step, onChange: v => onChange(clamp(v)) });
  return (
    <div className="insp-field">
      <span className={`insp-field-label ${scrub.labelProps.className}`}
        onPointerDown={scrub.labelProps.onPointerDown}
        style={scrub.labelProps.style}
      >{label}</span>
      <div className="insp-stepper">
        <button
          className="insp-step-btn"
          onClick={() => onChange(clamp(value - step))}
          tabIndex={-1}
        >
          <ChevronDown size={9} />
        </button>
        <input
          type="number"
          className="insp-step-input"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(clamp(+e.target.value))}
        />
        {unit && <span className="insp-step-unit">{unit}</span>}
        <button
          className="insp-step-btn"
          onClick={() => onChange(clamp(value + step))}
          tabIndex={-1}
        >
          <ChevronUp size={9} />
        </button>
      </div>
    </div>
  );
}

// ── Compact Paired Stepper (side-by-side) ─────────────────────────────────
function PairedStepper({ label, value, min, max, step, unit, onChange }: StepperProps) {
  const clamp = (v: number) => Math.max(min, Math.min(max, parseFloat(v.toFixed(2))));
  const scrub = useScrub({ value, min, max, step, onChange: v => onChange(clamp(v)) });
  return (
    <div className="insp-paired-field">
      <span className={`insp-paired-label ${scrub.labelProps.className}`}
        onPointerDown={scrub.labelProps.onPointerDown}
        style={scrub.labelProps.style}
      >{label}</span>
      <div className="insp-stepper insp-stepper--paired">
        <button
          className="insp-step-btn"
          onClick={() => onChange(clamp(value - step))}
          tabIndex={-1}
        >
          <ChevronDown size={8} />
        </button>
        <input
          type="number"
          className="insp-step-input"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(clamp(+e.target.value))}
        />
        {unit && <span className="insp-step-unit">{unit}</span>}
        <button
          className="insp-step-btn"
          onClick={() => onChange(clamp(value + step))}
          tabIndex={-1}
        >
          <ChevronUp size={8} />
        </button>
      </div>
    </div>
  );
}

// ── Box Model Widget (compact margin editor) ──────────────────────────────
function BoxModelWidget({ layout, onChange }: {
  layout: PageLayout;
  onChange: <K extends keyof PageLayout>(key: K, val: PageLayout[K]) => void;
}) {
  return (
    <div className="box-model">
      <input
        className="box-model-input box-model-top"
        type="number" value={layout.marginT} min={0} max={60}
        onChange={e => onChange('marginT', +e.target.value)}
        aria-label="Top margin"
      />
      <input
        className="box-model-input box-model-right"
        type="number" value={layout.marginR} min={0} max={60}
        onChange={e => onChange('marginR', +e.target.value)}
        aria-label="Right margin"
      />
      <input
        className="box-model-input box-model-bottom"
        type="number" value={layout.marginB} min={0} max={60}
        onChange={e => onChange('marginB', +e.target.value)}
        aria-label="Bottom margin"
      />
      <input
        className="box-model-input box-model-left"
        type="number" value={layout.marginL} min={0} max={60}
        onChange={e => onChange('marginL', +e.target.value)}
        aria-label="Left margin"
      />
      <div className="box-model-inner" />
      <span className="box-model-label">mm</span>
    </div>
  );
}

// ── Tag options for the tag switcher ───────────────────────────────────────
const TAG_OPTIONS = [
  { tag: 'p',          label: 'P',   title: 'Paragraph' },
  { tag: 'h1',         label: 'H1',  title: 'Heading 1' },
  { tag: 'h2',         label: 'H2',  title: 'Heading 2' },
  { tag: 'h3',         label: 'H3',  title: 'Heading 3' },
  { tag: 'h4',         label: 'H4',  title: 'Heading 4' },
  { tag: 'blockquote', label: 'BQ',  title: 'Blockquote' },
] as const;

// ── Text transform options ────────────────────────────────────────────────
const TRANSFORM_OPTIONS = [
  { value: 'none',       label: 'Aa',  title: 'No transform' },
  { value: 'uppercase',  label: 'AA',  title: 'UPPERCASE' },
  { value: 'lowercase',  label: 'aa',  title: 'lowercase' },
  { value: 'capitalize', label: 'Ab',  title: 'Capitalize' },
] as const;

// ── Tab type ──────────────────────────────────────────────────────────────
type InspTab = 'page' | 'paragraph' | 'image';

// ── Crop state from SplitPageView ─────────────────────────────────────────
interface CropState {
  active:      boolean;
  cropUrl?:    string;
  pageNumber?: number;
}

// ── Component ─────────────────────────────────────────────────────────────
interface Props {
  layout:               PageLayout;
  elementStyles?:       ElementStyles | null;
  onChange:             (layout: PageLayout) => void;
  onElementStyleChange?: (patch: Record<string, string>) => void;
  onTagChange?:         (newTag: string) => void;
}

export default function InspectorPanel({
  layout, elementStyles, onChange, onElementStyleChange, onTagChange,
}: Props) {
  const set = <K extends keyof PageLayout>(key: K, val: PageLayout[K]) =>
    onChange({ ...layout, [key]: val });

  const patch = (p: Record<string, string>) => onElementStyleChange?.(p);

  const hasElement = !!elementStyles;

  // ── Crop state from SplitPageView events ───────────────────────────────
  const [crop, setCrop] = useState<CropState>({ active: false });
  const [cropDesc, setCropDesc] = useState('');
  const [cropRestoring, setCropRestoring] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as CropState;
      setCrop(detail);
      if (!detail.active) {
        setCropDesc('');
        setCropRestoring(false);
      }
    };
    window.addEventListener('insp-crop-state', handler);
    return () => window.removeEventListener('insp-crop-state', handler);
  }, []);

  // Dispatch crop actions back to SplitPageView
  const cropAction = useCallback((action: string, desc?: string) => {
    if (action === 'insert-restore') setCropRestoring(true);
    window.dispatchEvent(new CustomEvent('insp-crop-action', {
      detail: { action, desc },
    }));
  }, []);

  // ── Tab auto-switching ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<InspTab>('page');

  useEffect(() => {
    if (crop.active) setActiveTab('image');
    else if (hasElement) setActiveTab('paragraph');
    else setActiveTab('page');
  }, [hasElement, crop.active]);

  // Accordion state — all sections open by default
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => sections[id] !== false;   // default open
  const toggle = (id: string) =>
    setSections(s => ({ ...s, [id]: s[id] === false }));

  return (
    <aside className="inspector-panel">

      {/* ── InDesign-style Tab Bar ─────────────────────────────────── */}
      <div className="insp-tab-bar">
        <button
          className={`insp-tab${activeTab === 'page' ? ' insp-tab--active' : ''}`}
          onClick={() => setActiveTab('page')}
          title="Page Layout — margins, columns, global type"
        >
          <FileText size={12} />
          <span>Page</span>
        </button>
        <button
          className={`insp-tab${activeTab === 'paragraph' ? ' insp-tab--active' : ''}${!hasElement ? ' insp-tab--disabled' : ''}`}
          onClick={() => hasElement && setActiveTab('paragraph')}
          title={hasElement
            ? `Paragraph — editing <${elementStyles.tag}>`
            : 'Click or select a text element first'}
        >
          <Pilcrow size={12} />
          <span>Text</span>
          {hasElement && (
            <code className="insp-tab-tag">{elementStyles.tag}</code>
          )}
        </button>
        <button
          className={`insp-tab${activeTab === 'image' ? ' insp-tab--active' : ''}${!crop.active ? ' insp-tab--disabled' : ''}`}
          onClick={() => crop.active && setActiveTab('image')}
          title={crop.active
            ? 'Image — crop preview and actions'
            : 'Draw a selection on the scan to crop an image'}
        >
          <Image size={12} />
          <span>Image</span>
          {crop.active && <span className="insp-tab-dot" />}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ══ PAGE TAB ═══════════════════════════════════════════════════ */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'page' && (
        <>
          {/* Margins */}
          <div className="insp-section">
            <SectionHead
              icon={<LayoutGrid size={11} />} label="Margins"
              open={isOpen('pg-margins')} onToggle={() => toggle('pg-margins')}
            />
            <div className={`insp-section-body${isOpen('pg-margins') ? '' : ' insp-section-body--collapsed'}`}>
              <BoxModelWidget layout={layout} onChange={set} />
            </div>
          </div>

          <div className="insp-divider" />

          {/* Columns */}
          <div className="insp-section">
            <SectionHead
              icon={<Columns3 size={11} />} label="Columns"
              open={isOpen('pg-columns')} onToggle={() => toggle('pg-columns')}
            />
            <div className={`insp-section-body${isOpen('pg-columns') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-col-row">
                {([1, 2, 3, 4] as const).map(n => (
                  <button
                    key={n}
                    className={`insp-col-btn${layout.columns === n ? ' active' : ''}`}
                    onClick={() => set('columns', n)}
                    title={`${n} column${n > 1 ? 's' : ''}`}
                  >
                    <span className="insp-col-icon">
                      {Array.from({ length: n }).map((_, i) => (
                        <span key={i} className="insp-col-bar" />
                      ))}
                    </span>
                    <span className="insp-col-num">{n}</span>
                  </button>
                ))}
              </div>
              {layout.columns > 1 && (
                <Stepper
                  label="Gap" value={layout.colGap} min={0.5} max={6} step={0.5} unit="rem"
                  onChange={v => set('colGap', v)}
                />
              )}
            </div>
          </div>

          <div className="insp-divider" />

          {/* Global Typography */}
          <div className="insp-section">
            <SectionHead
              icon={<Type size={11} />} label="Base Typography"
              open={isOpen('pg-type')} onToggle={() => toggle('pg-type')}
            />
            <div className={`insp-section-body${isOpen('pg-type') ? '' : ' insp-section-body--collapsed'}`}>
              <Stepper
                label="Size" value={layout.fontSize} min={0.7} max={2.0} step={0.05} unit="rem"
                onChange={v => set('fontSize', v)}
              />
              <Stepper
                label="Leading" value={layout.lineHeight} min={1.0} max={3.0} step={0.1}
                onChange={v => set('lineHeight', v)}
              />
            </div>
          </div>

          {/* Hint */}
          {!hasElement && (
            <>
              <div className="insp-divider" />
              <div className="insp-hint">
                <Pilcrow size={14} />
                <p>Click on any text element to edit paragraph styles</p>
              </div>
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ══ PARAGRAPH TAB ═════════════════════════════════════════════ */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'paragraph' && hasElement && (
        <>
          {/* Tag Switcher */}
          <div className="insp-section">
            <SectionHead
              icon={<Pilcrow size={11} />} label="Element Type"
              open={isOpen('el-tag')} onToggle={() => toggle('el-tag')}
            />
            <div className={`insp-section-body${isOpen('el-tag') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-tag-row">
                {TAG_OPTIONS.map(({ tag, label, title }) => (
                  <button
                    key={tag}
                    className={`insp-tag-btn${elementStyles.tag === tag ? ' active' : ''}`}
                    onClick={() => onTagChange?.(tag)}
                    title={title}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Character */}
          <div className="insp-section">
            <SectionHead
              icon={<Type size={11} />} label="Character"
              open={isOpen('el-char')} onToggle={() => toggle('el-char')}
            />
            <div className={`insp-section-body${isOpen('el-char') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-paired-row">
                <PairedStepper
                  label="Size"
                  value={parsePx(elementStyles.fontSize)}
                  min={8} max={96} step={1} unit="px"
                  onChange={v => patch({ fontSize: `${v}px` })}
                />
                <PairedStepper
                  label="Leading"
                  value={parseUnitless(elementStyles.lineHeight)}
                  min={0.8} max={4.0} step={0.05}
                  onChange={v => patch({ lineHeight: `${v.toFixed(2)}` })}
                />
              </div>

              <Stepper
                label="Tracking"
                value={parseLetterSpacing(elementStyles.letterSpacing)}
                min={-5} max={20} step={0.5} unit="px"
                onChange={v => patch({ letterSpacing: `${v}px` })}
              />

              <div className="insp-field">
                <span className="insp-field-label">Case</span>
                <div className="insp-transform-row">
                  {TRANSFORM_OPTIONS.map(({ value, label, title }) => (
                    <button
                      key={value}
                      className={`insp-transform-btn${elementStyles.textTransform === value ? ' active' : ''}`}
                      onClick={() => patch({ textTransform: value })}
                      title={title}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Style */}
          <div className="insp-section">
            <SectionHead
              icon={<Type size={11} />} label="Style"
              open={isOpen('el-style')} onToggle={() => toggle('el-style')}
            />
            <div className={`insp-section-body${isOpen('el-style') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-field">
                <span className="insp-field-label">Weight</span>
                <div className="insp-weight-row">
                  {([
                    ['400', 'Regular'],
                    ['700', 'Bold'],
                    ['900', 'Black'],
                  ] as const).map(([w, label]) => (
                    <button
                      key={w}
                      className={`insp-weight-btn${elementStyles.fontWeight === w ? ' active' : ''}`}
                      onClick={() => patch({ fontWeight: w })}
                      title={label}
                      style={{ fontWeight: w }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="insp-field">
                <span className="insp-field-label">Format</span>
                <div className="insp-style-row">
                  <button
                    className={`insp-style-btn${elementStyles.fontStyle === 'italic' ? ' active' : ''}`}
                    onClick={() => patch({ fontStyle: elementStyles.fontStyle === 'italic' ? 'normal' : 'italic' })}
                    title="Italic"
                  >
                    <Italic size={12} />
                  </button>
                  <button
                    className={`insp-style-btn${elementStyles.textDecoration.includes('underline') ? ' active' : ''}`}
                    onClick={() => patch({
                      textDecoration: elementStyles.textDecoration.includes('underline') ? 'none' : 'underline'
                    })}
                    title="Underline"
                  >
                    <Underline size={12} />
                  </button>
                  <button
                    className={`insp-style-btn${elementStyles.textDecoration.includes('line-through') ? ' active' : ''}`}
                    onClick={() => patch({
                      textDecoration: elementStyles.textDecoration.includes('line-through') ? 'none' : 'line-through'
                    })}
                    title="Strikethrough"
                  >
                    <Strikethrough size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Alignment */}
          <div className="insp-section">
            <SectionHead
              icon={<AlignLeft size={11} />} label="Alignment"
              open={isOpen('el-align')} onToggle={() => toggle('el-align')}
            />
            <div className={`insp-section-body${isOpen('el-align') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-align-row">
                {([
                  ['left',    <AlignLeft    size={13} key="l" />],
                  ['center',  <AlignCenter  size={13} key="c" />],
                  ['right',   <AlignRight   size={13} key="r" />],
                  ['justify', <AlignJustify size={13} key="j" />],
                ] as const).map(([val, icon]) => (
                  <button
                    key={val}
                    className={`insp-align-btn${elementStyles.textAlign === val ? ' active' : ''}`}
                    onClick={() => patch({ textAlign: val })}
                    title={val.charAt(0).toUpperCase() + val.slice(1)}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Color */}
          <div className="insp-section">
            <SectionHead
              icon={<span style={{ width: 11, height: 11, borderRadius: 3, background: elementStyles.color, display: 'inline-block', border: '1px solid #334155' }} />}
              label="Color"
              open={isOpen('el-color')} onToggle={() => toggle('el-color')}
            />
            <div className={`insp-section-body${isOpen('el-color') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-color-row">
                <input
                  type="color"
                  className="insp-color-swatch"
                  value={elementStyles.color}
                  onChange={e => patch({ color: e.target.value })}
                  title="Text color"
                />
                <span className="insp-color-hex">{elementStyles.color}</span>
              </div>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Spacing */}
          <div className="insp-section">
            <SectionHead
              icon={<LayoutGrid size={11} />} label="Spacing"
              open={isOpen('el-spacing')} onToggle={() => toggle('el-spacing')}
            />
            <div className={`insp-section-body${isOpen('el-spacing') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-paired-row">
                <PairedStepper
                  label="Margin T"
                  value={parsePx(elementStyles.marginTop)}
                  min={0} max={80} step={4} unit="px"
                  onChange={v => patch({ marginTop: `${v}px` })}
                />
                <PairedStepper
                  label="Margin B"
                  value={parsePx(elementStyles.marginBottom)}
                  min={0} max={80} step={4} unit="px"
                  onChange={v => patch({ marginBottom: `${v}px` })}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty state for Paragraph tab */}
      {activeTab === 'paragraph' && !hasElement && (
        <div className="insp-empty-state">
          <Pilcrow size={28} />
          <p className="insp-empty-title">No Element Selected</p>
          <p className="insp-empty-desc">
            Click on any text element in the document, or use <strong>Select Mode</strong> to pick an element.
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ══ IMAGE TAB ═════════════════════════════════════════════════ */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'image' && crop.active && crop.cropUrl && (
        <>
          {/* Preview */}
          <div className="insp-section">
            <SectionHead
              icon={<Image size={11} />} label="Crop Preview"
              open={isOpen('img-prev')} onToggle={() => toggle('img-prev')}
            />
            <div className={`insp-section-body${isOpen('img-prev') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-crop-preview">
                <img src={crop.cropUrl} alt="Crop preview" className="insp-crop-img" />
              </div>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Description */}
          <div className="insp-section">
            <SectionHead
              icon={<Type size={11} />} label="Description"
              open={isOpen('img-desc')} onToggle={() => toggle('img-desc')}
            />
            <div className={`insp-section-body${isOpen('img-desc') ? '' : ' insp-section-body--collapsed'}`}>
              <input
                type="text"
                className="insp-crop-desc"
                placeholder="Describe this image (optional)…"
                value={cropDesc}
                onChange={e => {
                  setCropDesc(e.target.value);
                  cropAction('set-desc', e.target.value);
                }}
              />
            </div>
          </div>

          <div className="insp-divider" />

          {/* Actions */}
          <div className="insp-section">
            <SectionHead
              icon={<Scissors size={11} />} label="Actions"
              open={isOpen('img-actions')} onToggle={() => toggle('img-actions')}
            />
            <div className={`insp-section-body${isOpen('img-actions') ? '' : ' insp-section-body--collapsed'}`}>
              <button
                className="insp-crop-action insp-crop-action--insert"
                onClick={() => cropAction('insert-raw')}
                disabled={cropRestoring}
                title="Insert the raw crop — no AI processing"
              >
                <Scissors size={14} />
                Insert Crop
              </button>
              <button
                className="insp-crop-action insp-crop-action--restore"
                onClick={() => cropAction('insert-restore')}
                disabled={cropRestoring}
                title="Restore with AI, then insert"
              >
                {cropRestoring
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Sparkles size={14} />}
                {cropRestoring ? 'Restoring…' : 'AI Restore & Insert'}
              </button>
              <button
                className="insp-crop-action insp-crop-action--cancel"
                onClick={() => cropAction('cancel')}
                disabled={cropRestoring}
                title="Cancel selection"
              >
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Empty state for Image tab */}
      {activeTab === 'image' && !crop.active && (
        <div className="insp-empty-state">
          <Image size={28} />
          <p className="insp-empty-title">No Image Cropped</p>
          <p className="insp-empty-desc">
            Draw a selection on the <strong>Original Scan</strong> (left panel) to crop and insert an image region.
          </p>
        </div>
      )}

    </aside>
  );
}
