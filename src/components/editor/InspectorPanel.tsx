import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, ChevronUp,
  LayoutGrid, Type, Columns3,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Italic, Underline, Strikethrough, FileText, Pilcrow, Image,
  Scissors, Sparkles, X, Loader2,
  Plus, Minus, Eye, EyeOff, Diamond, Download,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  Square, Maximize2, Layers,
  Settings2, FlipHorizontal,
} from 'lucide-react';
import { type ElementStyles } from '../DocumentPage';
import { useScrub } from '../../hooks/useScrub';
import { type Theme } from '../../hooks/useTheme';

// ── Types ────────────────────────────────────────────────────────────────────
export interface PageLayout {
  marginT:    number;
  marginR:    number;
  marginB:    number;
  marginL:    number;
  columns:    1 | 2 | 3 | 4;
  colGap:     number;
  fontSize:   number;
  lineHeight: number;
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function parsePx(val: string): number  { return parseFloat(val) || 0; }
function parseUnitless(val: string): number { return parseFloat(val) || 1.6; }
function parseLetterSpacing(val: string): number {
  if (!val || val === 'normal') return 0;
  return parseFloat(val) || 0;
}

// ── Props ─────────────────────────────────────────────────────────────────
interface Props {
  layout:                PageLayout;
  elementStyles?:        ElementStyles | null;
  onChange:              (layout: PageLayout) => void;
  onElementStyleChange?: (patch: Record<string, string>) => void;
  onTagChange?:          (newTag: string) => void;
  theme?:                Theme;
  onToggleTheme?:        () => void;
  onDownloadPDF?:        () => void;
}

type InspTab = 'page' | 'paragraph' | 'image';
type ExportFormat = 'PDF' | 'PNG' | 'SVG';
type ExportScale = '1x' | '2x' | '3x';

interface CropState {
  active:      boolean;
  cropUrl?:    string;
  pageNumber?: number;
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Figma-style section header: label left, + button right */
function SectionHd({ label, onAdd, onRemove, bold }: {
  label: string; onAdd?: () => void; onRemove?: () => void; bold?: boolean;
}) {
  return (
    <div className="fi-section-hd">
      <span className={`fi-section-title${bold ? ' fi-section-title--bold' : ''}`}>{label}</span>
      {onAdd    && <button className="fi-hd-btn" onClick={onAdd}    title={`Add ${label}`}><Plus  size={13} /></button>}
      {onRemove && <button className="fi-hd-btn" onClick={onRemove} title={`Remove ${label}`}><Minus size={13} /></button>}
    </div>
  );
}

/** Compact XY input pair */
function XYField({ labelX, valueX, labelY, valueY, onChangeX, onChangeY, unit }: {
  labelX: string; valueX: number;
  labelY: string; valueY: number;
  onChangeX: (v: number) => void;
  onChangeY: (v: number) => void;
  unit?: string;
}) {
  return (
    <div className="fi-xy-row">
      <label className="fi-xy-field">
        <span className="fi-xy-label">{labelX}</span>
        <input
          type="number" className="fi-xy-input" value={valueX}
          onChange={e => onChangeX(+e.target.value)}
        />
        {unit && <span className="fi-xy-unit">{unit}</span>}
      </label>
      <label className="fi-xy-field">
        <span className="fi-xy-label">{labelY}</span>
        <input
          type="number" className="fi-xy-input" value={valueY}
          onChange={e => onChangeY(+e.target.value)}
        />
        {unit && <span className="fi-xy-unit">{unit}</span>}
      </label>
    </div>
  );
}

/** Single compact input field */
function SingleField({ label, value, onChange, unit, readOnly }: {
  label: string; value: number | string; onChange?: (v: number) => void;
  unit?: string; readOnly?: boolean;
}) {
  return (
    <label className="fi-single-field">
      <span className="fi-xy-label">{label}</span>
      <input
        type="number" className="fi-xy-input" value={value}
        readOnly={readOnly}
        onChange={e => onChange?.(+e.target.value)}
      />
      {unit && <span className="fi-xy-unit">{unit}</span>}
    </label>
  );
}

/** Stepper for scrub-enabled inputs */
function Stepper({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number;
  step: number; unit?: string; onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, parseFloat(v.toFixed(2))));
  const scrub = useScrub({ value, min, max, step, onChange: v => onChange(clamp(v)) });
  return (
    <div className="insp-field">
      <span className={`insp-field-label ${scrub.labelProps.className}`}
        onPointerDown={scrub.labelProps.onPointerDown} style={scrub.labelProps.style}
      >{label}</span>
      <div className="insp-stepper">
        <button className="insp-step-btn" onClick={() => onChange(clamp(value - step))} tabIndex={-1}>
          <ChevronDown size={9} />
        </button>
        <input type="number" className="insp-step-input" value={value}
          min={min} max={max} step={step} onChange={e => onChange(clamp(+e.target.value))} />
        {unit && <span className="insp-step-unit">{unit}</span>}
        <button className="insp-step-btn" onClick={() => onChange(clamp(value + step))} tabIndex={-1}>
          <ChevronUp size={9} />
        </button>
      </div>
    </div>
  );
}

function PairedStepper({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number;
  step: number; unit?: string; onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, parseFloat(v.toFixed(2))));
  const scrub = useScrub({ value, min, max, step, onChange: v => onChange(clamp(v)) });
  return (
    <div className="insp-paired-field">
      <span className={`insp-paired-label ${scrub.labelProps.className}`}
        onPointerDown={scrub.labelProps.onPointerDown} style={scrub.labelProps.style}
      >{label}</span>
      <div className="insp-stepper insp-stepper--paired">
        <button className="insp-step-btn" onClick={() => onChange(clamp(value - step))} tabIndex={-1}>
          <ChevronDown size={8} /></button>
        <input type="number" className="insp-step-input" value={value}
          min={min} max={max} step={step} onChange={e => onChange(clamp(+e.target.value))} />
        {unit && <span className="insp-step-unit">{unit}</span>}
        <button className="insp-step-btn" onClick={() => onChange(clamp(value + step))} tabIndex={-1}>
          <ChevronUp size={8} /></button>
      </div>
    </div>
  );
}

// ── Fill Row ──────────────────────────────────────────────────────────────
function FillRow({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [visible, setVisible] = useState(true);
  const token = color.startsWith('#') ? color.toUpperCase() : color;
  return (
    <div className="fi-fill-row">
      <input type="color" className="fi-color-swatch" value={color} onChange={e => onChange(e.target.value)} />
      <span className="fi-fill-token">
        <Diamond size={9} className="fi-fill-diamond" />
        <span className="fi-fill-name">{token}</span>
      </span>
      <button className="fi-fill-icon" onClick={() => setVisible(v => !v)} title="Toggle visibility">
        {visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      <button className="fi-fill-icon fi-fill-icon--remove" title="Remove fill">
        <Minus size={12} />
      </button>
    </div>
  );
}

// ── Alignment 9-dot grid ──────────────────────────────────────────────────
type AlignPos = 'tl'|'tc'|'tr'|'ml'|'mc'|'mr'|'bl'|'bc'|'br';
const ALIGN_GRID: AlignPos[] = ['tl','tc','tr','ml','mc','mr','bl','bc','br'];

function AlignGrid({ value, onChange }: { value: AlignPos; onChange: (v: AlignPos) => void }) {
  return (
    <div className="fi-align-grid">
      {ALIGN_GRID.map(pos => (
        <button
          key={pos}
          className={`fi-align-dot${value === pos ? ' fi-align-dot--active' : ''}`}
          onClick={() => onChange(pos)}
          title={pos}
        />
      ))}
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────
function Section({ icon, label, open, onToggle, children }: {
  icon?: React.ReactNode; label: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="insp-section">
      <button className="insp-section-toggle" onClick={onToggle}>
        {icon} {label}
        <ChevronRight size={10} className={`insp-chevron${open ? ' insp-chevron--open' : ''}`} />
      </button>
      <div className={`insp-section-body${open ? '' : ' insp-section-body--collapsed'}`}>
        {children}
      </div>
    </div>
  );
}

// ── Tag / Transform options ───────────────────────────────────────────────
const TAG_OPTIONS = [
  { tag: 'p', label: 'P', title: 'Paragraph' },
  { tag: 'h1', label: 'H1', title: 'Heading 1' },
  { tag: 'h2', label: 'H2', title: 'Heading 2' },
  { tag: 'h3', label: 'H3', title: 'Heading 3' },
  { tag: 'h4', label: 'H4', title: 'Heading 4' },
  { tag: 'blockquote', label: 'BQ', title: 'Blockquote' },
] as const;

const TRANSFORM_OPTIONS = [
  { value: 'none',       label: 'Aa', title: 'None' },
  { value: 'uppercase',  label: 'AA', title: 'UPPERCASE' },
  { value: 'lowercase',  label: 'aa', title: 'lowercase' },
  { value: 'capitalize', label: 'Ab', title: 'Capitalize' },
] as const;

// ── Main component ────────────────────────────────────────────────────────
export default function InspectorPanel({
  layout, elementStyles, onChange, onElementStyleChange, onTagChange,
  theme = 'dark', onToggleTheme, onDownloadPDF,
}: Props) {
  const set = <K extends keyof PageLayout>(key: K, val: PageLayout[K]) =>
    onChange({ ...layout, [key]: val });
  const patch = (p: Record<string, string>) => onElementStyleChange?.(p);
  const hasElement = !!elementStyles;

  // ── Crop state ────────────────────────────────────────────────────────
  const [crop, setCrop] = useState<CropState>({ active: false });
  const [cropDesc, setCropDesc] = useState('');
  const [cropRestoring, setCropRestoring] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as CropState;
      setCrop(detail);
      if (!detail.active) { setCropDesc(''); setCropRestoring(false); }
    };
    window.addEventListener('insp-crop-state', handler);
    return () => window.removeEventListener('insp-crop-state', handler);
  }, []);

  const cropAction = useCallback((action: string, desc?: string) => {
    if (action === 'insert-restore') setCropRestoring(true);
    window.dispatchEvent(new CustomEvent('insp-crop-action', { detail: { action, desc } }));
  }, []);

  // ── Sections are contextual (no tabs): Text section appears when an
  // element is selected; Image section appears when crop is active;
  // Page settings always appear below. `activeTab` kept as a derived
  // value for the legacy tab-gated render blocks — it is no longer a
  // user-controlled knob.
  const activeTab: InspTab = crop.active ? 'image' : hasElement ? 'paragraph' : 'page';

  // ── Accordion ─────────────────────────────────────────────────────────
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => sections[id] !== false;
  const toggle = (id: string) => setSections(s => ({ ...s, [id]: s[id] === false }));

  // ── Layout state ──────────────────────────────────────────────────────
  const [alignPos, setAlignPos] = useState<AlignPos>('tl');
  const [opacity, setOpacity] = useState(100);
  const [radius, setRadius] = useState(0);
  const [fillColor, setFillColor] = useState('#1c1917');
  const [showStroke, setShowStroke] = useState(false);
  const [strokeColor, setStrokeColor] = useState('#e2e8f0');
  const [exportScale, setExportScale] = useState<ExportScale>('1x');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('PDF');

  // ── Gap options ───────────────────────────────────────────────────────
  const [gapMode, setGapMode] = useState<'fixed'|'between'|'around'>('fixed');

  // ── Fill color sync with selected element ─────────────────────────────
  useEffect(() => {
    if (elementStyles?.color) setFillColor(elementStyles.color);
  }, [elementStyles?.color]);

  return (
    <aside className="inspector-panel">

      {/* ── Contextual selection header (replaces tab bar) ──────────── */}
      <div className="insp-ctx-bar">
        {crop.active ? (
          <>
            <Image size={13} className="insp-ctx-icon" />
            <span className="insp-ctx-name">Image crop</span>
            <span className="insp-ctx-dot" />
          </>
        ) : hasElement ? (
          <>
            <Pilcrow size={13} className="insp-ctx-icon" />
            <span className="insp-ctx-name">Text element</span>
            <code className="insp-ctx-tag">{elementStyles.tag}</code>
          </>
        ) : (
          <>
            <FileText size={13} className="insp-ctx-icon" />
            <span className="insp-ctx-name">Page settings</span>
            <span className="insp-ctx-hint">Click text on the page to edit it</span>
          </>
        )}
      </div>

      {/* ════════════════════════════ PAGE TAB ═══════════════════════════ */}
      {activeTab === 'page' && (
        <>
          {/* Context row */}
          <div className="fi-context-row">
            <Square size={13} className="fi-context-icon" />
            <span className="fi-context-name">Document Page</span>
            <button className="fi-context-toggle">
              <ChevronDown size={12} />
            </button>
          </div>

          <div className="insp-divider" />

          {/* Alignment buttons (6 icons) */}
          <div className="fi-prop-block">
            <span className="fi-block-label">Alignment</span>
            <div className="fi-6align-row">
              {([
                [AlignStartHorizontal,  'Left'],
                [AlignCenterHorizontal, 'H Center'],
                [AlignEndHorizontal,    'Right'],
                [AlignStartVertical,    'Top'],
                [AlignCenterVertical,   'V Center'],
                [AlignEndVertical,      'Bottom'],
              ] as const).map(([Icon, title], i) => (
                <button key={i} className="fi-align6-btn" title={title} disabled>
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>

          <div className="insp-divider" />

          {/* Position */}
          <div className="fi-prop-block">
            <span className="fi-block-label">Position</span>
            <XYField
              labelX="X" valueX={layout.marginL}
              labelY="Y" valueY={layout.marginT}
              onChangeX={v => set('marginL', v)}
              onChangeY={v => set('marginT', v)}
              unit="mm"
            />
            <SingleField label="R" value={0} unit="°" readOnly />
          </div>

          <div className="insp-divider" />

          {/* Flex Layout */}
          <div className="fi-prop-block">
            <div className="fi-flex-header">
              <span className="fi-block-label">Flex Layout</span>
              <div className="fi-flex-mode-btns">
                {([
                  [LayoutGrid, 'Single column'],
                  [Columns3,   'Two columns'],
                  [FlipHorizontal, 'Multi-column'],
                ] as const).map(([Icon, title], i) => (
                  <button
                    key={i}
                    className={`fi-flex-mode-btn${layout.columns === [1,2,3][i] ? ' active' : ''}`}
                    onClick={() => set('columns', ([1,2,3,4] as const)[i])}
                    title={title}
                  >
                    <Icon size={13} />
                  </button>
                ))}
              </div>
            </div>

            {/* Alignment 9-dot grid + gap */}
            <div className="fi-flex-body">
              <AlignGrid value={alignPos} onChange={setAlignPos} />
              <div className="fi-gap-options">
                <label className={`fi-gap-opt${gapMode === 'fixed' ? ' active' : ''}`} onClick={() => setGapMode('fixed')}>
                  <input type="radio" name="gap" readOnly checked={gapMode === 'fixed'} className="fi-radio" />
                  <span className="fi-gap-num-wrap">
                    <FlipHorizontal size={10} />
                    <input
                      type="number"
                      className="fi-gap-input"
                      value={layout.colGap}
                      min={0} max={6} step={0.5}
                      onChange={e => set('colGap', +e.target.value)}
                    />
                  </span>
                </label>
                <label className={`fi-gap-opt${gapMode === 'between' ? ' active' : ''}`} onClick={() => setGapMode('between')}>
                  <input type="radio" name="gap" readOnly checked={gapMode === 'between'} className="fi-radio" />
                  Space Between
                </label>
                <label className={`fi-gap-opt${gapMode === 'around' ? ' active' : ''}`} onClick={() => setGapMode('around')}>
                  <input type="radio" name="gap" readOnly checked={gapMode === 'around'} className="fi-radio" />
                  Space Around
                </label>
              </div>
            </div>

            {/* Padding row */}
            <div className="fi-padding-hd">
              <span className="fi-block-label">Padding</span>
              <button className="fi-hd-btn" title="Padding settings"><Settings2 size={12} /></button>
            </div>
            <XYField
              labelX="⇔" valueX={layout.marginL}
              labelY="⇕" valueY={layout.marginT}
              onChangeX={v => set('marginL', v)}
              onChangeY={v => set('marginT', v)}
              unit="mm"
            />

            {/* Dimensions */}
            <div className="fi-block-label" style={{ marginTop: 8 }}>Dimensions</div>
            <XYField
              labelX="W" valueX={210} labelY="H" valueY={297}
              onChangeX={() => {}} onChangeY={() => {}} unit="mm"
            />
            <div className="fi-checkbox-grid">
              <label className="fi-checkbox"><input type="checkbox" readOnly /> Fill Width</label>
              <label className="fi-checkbox"><input type="checkbox" readOnly /> Fill Height</label>
              <label className="fi-checkbox"><input type="checkbox" readOnly /> Hug Width</label>
              <label className="fi-checkbox"><input type="checkbox" defaultChecked readOnly /> Hug Height</label>
              <label className="fi-checkbox"><input type="checkbox" readOnly /> Clip Content</label>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Appearance */}
          <div className="fi-prop-block">
            <span className="fi-block-label">Appearance</span>
            <div className="fi-appear-row">
              <label className="fi-appear-field">
                <span className="fi-appear-prefix">%</span>
                <input type="number" className="fi-appear-input" value={opacity}
                  min={0} max={100} onChange={e => setOpacity(+e.target.value)} />
              </label>
              <label className="fi-appear-field">
                <Maximize2 size={10} className="fi-appear-prefix-icon" />
                <input type="number" className="fi-appear-input" value={radius}
                  min={0} max={100} onChange={e => setRadius(+e.target.value)} />
              </label>
              <label className="fi-appear-field fi-appear-field--icon">
                <Layers size={12} className="fi-appear-prefix-icon" />
              </label>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════ TEXT TAB ══════════════════════════════ */}
      {activeTab === 'paragraph' && hasElement && (
        <>
          {/* Element type */}
          <div className="insp-section">
            <button className="insp-section-toggle" onClick={() => toggle('el-tag')}>
              <Pilcrow size={11} /> Element Type
              <ChevronRight size={10} className={`insp-chevron${isOpen('el-tag') ? ' insp-chevron--open' : ''}`} />
            </button>
            <div className={`insp-section-body${isOpen('el-tag') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-tag-row">
                {TAG_OPTIONS.map(({ tag, label, title }) => (
                  <button key={tag}
                    className={`insp-tag-btn${elementStyles.tag === tag ? ' active' : ''}`}
                    onClick={() => onTagChange?.(tag)} title={title}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Alignment */}
          <div className="fi-prop-block">
            <span className="fi-block-label">Alignment</span>
            <div className="fi-6align-row">
              {([
                ['left',    AlignLeft,    'Left'],
                ['center',  AlignCenter,  'Center'],
                ['right',   AlignRight,   'Right'],
                ['justify', AlignJustify, 'Justify'],
              ] as const).map(([val, Icon, title]) => (
                <button key={val}
                  className={`fi-align6-btn${elementStyles.textAlign === val ? ' fi-align6-btn--active' : ''}`}
                  onClick={() => patch({ textAlign: val })} title={title}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>

          <div className="insp-divider" />

          {/* Character */}
          <div className="insp-section">
            <button className="insp-section-toggle" onClick={() => toggle('el-char')}>
              <Type size={11} /> Character
              <ChevronRight size={10} className={`insp-chevron${isOpen('el-char') ? ' insp-chevron--open' : ''}`} />
            </button>
            <div className={`insp-section-body${isOpen('el-char') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-paired-row">
                <PairedStepper label="Size" value={parsePx(elementStyles.fontSize)}
                  min={8} max={96} step={1} unit="px"
                  onChange={v => patch({ fontSize: `${v}px` })} />
                <PairedStepper label="Leading" value={parseUnitless(elementStyles.lineHeight)}
                  min={0.8} max={4.0} step={0.05}
                  onChange={v => patch({ lineHeight: `${v.toFixed(2)}` })} />
              </div>
              <Stepper label="Tracking" value={parseLetterSpacing(elementStyles.letterSpacing)}
                min={-5} max={20} step={0.5} unit="px"
                onChange={v => patch({ letterSpacing: `${v}px` })} />
              <div className="insp-field">
                <span className="insp-field-label">Case</span>
                <div className="insp-transform-row">
                  {TRANSFORM_OPTIONS.map(({ value, label, title }) => (
                    <button key={value}
                      className={`insp-transform-btn${elementStyles.textTransform === value ? ' active' : ''}`}
                      onClick={() => patch({ textTransform: value })} title={title}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Style */}
          <div className="insp-section">
            <button className="insp-section-toggle" onClick={() => toggle('el-style')}>
              <Type size={11} /> Style
              <ChevronRight size={10} className={`insp-chevron${isOpen('el-style') ? ' insp-chevron--open' : ''}`} />
            </button>
            <div className={`insp-section-body${isOpen('el-style') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-field">
                <span className="insp-field-label">Weight</span>
                <div className="insp-weight-row">
                  {(['400','700','900'] as const).map((w, i) => (
                    <button key={w}
                      className={`insp-weight-btn${elementStyles.fontWeight === w ? ' active' : ''}`}
                      onClick={() => patch({ fontWeight: w })}
                      style={{ fontWeight: w }}>
                      {['Regular','Bold','Black'][i]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="insp-field">
                <span className="insp-field-label">Format</span>
                <div className="insp-style-row">
                  <button className={`insp-style-btn${elementStyles.fontStyle === 'italic' ? ' active' : ''}`}
                    onClick={() => patch({ fontStyle: elementStyles.fontStyle === 'italic' ? 'normal' : 'italic' })}
                    title="Italic"><Italic size={12} /></button>
                  <button className={`insp-style-btn${elementStyles.textDecoration.includes('underline') ? ' active' : ''}`}
                    onClick={() => patch({ textDecoration: elementStyles.textDecoration.includes('underline') ? 'none' : 'underline' })}
                    title="Underline"><Underline size={12} /></button>
                  <button className={`insp-style-btn${elementStyles.textDecoration.includes('line-through') ? ' active' : ''}`}
                    onClick={() => patch({ textDecoration: elementStyles.textDecoration.includes('line-through') ? 'none' : 'line-through' })}
                    title="Strikethrough"><Strikethrough size={12} /></button>
                </div>
              </div>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Spacing */}
          <div className="insp-section">
            <button className="insp-section-toggle" onClick={() => toggle('el-spacing')}>
              <LayoutGrid size={11} /> Spacing
              <ChevronRight size={10} className={`insp-chevron${isOpen('el-spacing') ? ' insp-chevron--open' : ''}`} />
            </button>
            <div className={`insp-section-body${isOpen('el-spacing') ? '' : ' insp-section-body--collapsed'}`}>
              <div className="insp-paired-row">
                <PairedStepper label="Margin T" value={parsePx(elementStyles.marginTop)}
                  min={0} max={80} step={4} unit="px" onChange={v => patch({ marginTop: `${v}px` })} />
                <PairedStepper label="Margin B" value={parsePx(elementStyles.marginBottom)}
                  min={0} max={80} step={4} unit="px" onChange={v => patch({ marginBottom: `${v}px` })} />
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'paragraph' && !hasElement && (
        <div className="insp-empty-state">
          <Pilcrow size={28} />
          <p className="insp-empty-title">No Element Selected</p>
          <p className="insp-empty-desc">Click on any text element to edit paragraph styles.</p>
        </div>
      )}

      {/* ═══════════════════════════ IMAGE TAB ════════════════════════════ */}
      {activeTab === 'image' && crop.active && crop.cropUrl && (
        <>
          <Section icon={<Image size={11}/>} label="Crop Preview"
            open={isOpen('img-prev')} onToggle={() => toggle('img-prev')}>
            <div className="insp-crop-preview">
              <img src={crop.cropUrl} alt="Crop preview" className="insp-crop-img" />
            </div>
          </Section>
          <div className="insp-divider" />
          <Section icon={<Type size={11}/>} label="Description"
            open={isOpen('img-desc')} onToggle={() => toggle('img-desc')}>
            <input type="text" className="insp-crop-desc"
              placeholder="Describe this image (optional)…"
              value={cropDesc}
              onChange={e => { setCropDesc(e.target.value); cropAction('set-desc', e.target.value); }} />
          </Section>
          <div className="insp-divider" />
          <Section icon={<Scissors size={11}/>} label="Actions"
            open={isOpen('img-actions')} onToggle={() => toggle('img-actions')}>
            <button className="insp-crop-action insp-crop-action--insert"
              onClick={() => cropAction('insert-raw')} disabled={cropRestoring}>
              <Scissors size={14} /> Insert Crop
            </button>
            <button className="insp-crop-action insp-crop-action--restore"
              onClick={() => cropAction('insert-restore')} disabled={cropRestoring}>
              {cropRestoring ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {cropRestoring ? 'Restoring…' : 'AI Restore & Insert'}
            </button>
            <button className="insp-crop-action insp-crop-action--cancel"
              onClick={() => cropAction('cancel')} disabled={cropRestoring}>
              <X size={14} /> Cancel
            </button>
          </Section>
        </>
      )}
      {activeTab === 'image' && !crop.active && (
        <div className="insp-empty-state">
          <Image size={28} />
          <p className="insp-empty-title">No Image Cropped</p>
          <p className="insp-empty-desc">Draw a selection on the <strong>Original Scan</strong> to crop and insert an image.</p>
        </div>
      )}

      {/* ══════════════ BOTTOM SECTIONS (all tabs) ═══════════════════════ */}
      {activeTab !== 'image' && (
        <>
          <div className="insp-divider" />

          {/* Fill */}
          <div className="fi-prop-block">
            <SectionHd label="Fill" onAdd={() => {}} />
            <FillRow
              color={hasElement ? (elementStyles?.color ?? fillColor) : fillColor}
              onChange={c => { setFillColor(c); if (hasElement) patch({ color: c }); }}
            />
          </div>

          <div className="insp-divider" />

          {/* Stroke */}
          <div className="fi-prop-block">
            <SectionHd label="Stroke" onAdd={() => setShowStroke(true)} />
            {showStroke && (
              <FillRow color={strokeColor} onChange={setStrokeColor} />
            )}
          </div>

          <div className="insp-divider" />

          {/* Effects */}
          <div className="fi-prop-block">
            <SectionHd label="Effects" onAdd={() => {}} />
          </div>

          <div className="insp-divider" />

          {/* Theme */}
          <div className="fi-prop-block">
            <SectionHd label="Theme" onAdd={() => {}} onRemove={() => {}} />
            <div className="fi-select-row">
              <select
                className="fi-select"
                value={theme}
                onChange={() => onToggleTheme?.()}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
              <button className="fi-hd-btn" onClick={onToggleTheme} title="Remove theme">
                <Minus size={13} />
              </button>
            </div>
          </div>

          <div className="insp-divider" />

          {/* Export */}
          <div className="fi-prop-block fi-prop-block--export">
            <SectionHd label="Export" />
            <div className="fi-export-row">
              <select className="fi-select fi-select--sm"
                value={exportScale} onChange={e => setExportScale(e.target.value as ExportScale)}>
                <option>1x</option>
                <option>2x</option>
                <option>3x</option>
              </select>
              <select className="fi-select fi-select--sm"
                value={exportFormat} onChange={e => setExportFormat(e.target.value as ExportFormat)}>
                <option>PDF</option>
                <option>PNG</option>
                <option>SVG</option>
              </select>
            </div>
            <button className="fi-export-btn" onClick={onDownloadPDF}>
              <Download size={13} />
              Export layer
            </button>
          </div>
        </>
      )}

    </aside>
  );
}
