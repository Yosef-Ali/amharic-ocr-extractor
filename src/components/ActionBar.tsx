import React from 'react';
import {
  Eraser, Zap, Save, RefreshCw,
  BookOpen, Download, Loader2, ScanSearch,
} from 'lucide-react';
import type { ImageQuality } from '../services/geminiService';

interface Props {
  disabled:       boolean;
  hasFile:        boolean;
  hasResults:     boolean;
  fromPage:       number;
  toPage:         number;
  totalPages:     number;
  isPdfExporting: boolean;
  imageQuality:   ImageQuality;
  onFromChange:    (v: number) => void;
  onToChange:      (v: number) => void;
  onClear:         () => void;
  onExtract:       () => void;
  onRegenerate:    () => void;
  onSave:          () => void;
  onLibrary:       () => void;
  onDownloadPDF:   () => void;
  onImageQualityChange: (q: ImageQuality) => void;
}

// ── Primary action button ──────────────────────────────────────────────────
function Btn({
  label, icon, onClick, disabled, variant = 'default', title,
}: {
  label:    string;
  icon:     React.ReactNode;
  onClick:  () => void;
  disabled: boolean;
  variant?: 'default' | 'primary' | 'green' | 'blue' | 'teal' | 'ghost';
  title?:   string;
}) {
  const variants: Record<string, string> = {
    default: 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 hover:border-gray-300 shadow-sm',
    ghost:   'bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-transparent',
    primary: 'bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-md shadow-red-500/20 border border-red-600/50',
    green:   'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-md shadow-emerald-500/20 border border-emerald-600/50',
    blue:    'bg-gradient-to-b from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-md shadow-blue-500/20 border border-blue-600/50',
    teal:    'bg-gradient-to-b from-teal-500 to-teal-600 text-white hover:from-teal-600 hover:to-teal-700 shadow-md shadow-teal-500/20 border border-teal-600/50',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold tracking-wide
        transition-all duration-200 active:scale-[0.97] whitespace-nowrap
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none
        ${variants[variant]}
      `}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ── Labeled select — tiny label stacked above dropdown ─────────────────────
function LabeledSelect<T extends string>({
  label, value, options, onChange, disabled,
}: {
  label:    string;
  value:    T;
  options:  { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold text-teal-500 uppercase tracking-wider text-center leading-none px-0.5">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-white border border-teal-200 text-gray-700 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all disabled:opacity-50 cursor-pointer hover:border-teal-400 min-w-[72px]"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────
function Divider() {
  return <div className="h-7 w-px bg-gray-200/80 mx-1 shrink-0" />;
}

// ── Section label chip ─────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap leading-none">
      {children}
    </span>
  );
}

// ── Main ActionBar ─────────────────────────────────────────────────────────
export default function ActionBar(p: Props) {
  return (
    <div className="print:hidden flex flex-col gap-0 bg-white/80 backdrop-blur-lg border border-gray-200/60 rounded-2xl shadow-sm overflow-hidden">

      {/* ══ Row 1: OCR Extraction ══════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100/80">

        {/* Page range */}
        {p.hasFile && (
          <>
            <SectionLabel>Pages</SectionLabel>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={1} max={p.totalPages} value={p.fromPage}
                onChange={(e) => p.onFromChange(Number(e.target.value))}
                className="w-12 bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1.5 text-center text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white transition-all"
              />
              <span className="text-gray-400 text-sm font-medium">–</span>
              <input
                type="number" min={p.fromPage} max={p.totalPages} value={p.toPage}
                onChange={(e) => p.onToChange(Number(e.target.value))}
                className="w-12 bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1.5 text-center text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white transition-all"
              />
              <span className="text-gray-400 text-xs font-medium">/ {p.totalPages}</span>
            </div>
            <Divider />
          </>
        )}

        {/* Extraction actions */}
        <SectionLabel>Extract</SectionLabel>
        {p.hasFile && (
          <Btn
            label="Extract Pages"
            icon={<Zap size={14} />}
            onClick={p.onExtract}
            disabled={p.disabled}
            variant="primary"
            title="Run OCR extraction on the selected page range"
          />
        )}
        {p.hasResults && (
          <Btn
            label="Re-Extract All"
            icon={<RefreshCw size={14} />}
            onClick={p.onRegenerate}
            disabled={p.disabled}
            variant="default"
            title="Force re-run OCR on all pages, overwriting cached results"
          />
        )}

        <Divider />

        {/* Document management */}
        {p.hasResults && (
          <Btn
            label="Save"
            icon={<Save size={14} />}
            onClick={p.onSave}
            disabled={p.disabled}
            variant="green"
            title="Save this document to your local library"
          />
        )}
        <Btn
          label="Clear"
          icon={<Eraser size={14} />}
          onClick={p.onClear}
          disabled={p.disabled}
          variant="ghost"
          title="Clear the current document and start fresh"
        />

        {/* Right-side export */}
        <div className="ml-auto flex items-center gap-2">
          <Btn
            label="Library"
            icon={<BookOpen size={14} />}
            onClick={p.onLibrary}
            disabled={false}
            title="Browse and load previously saved documents"
          />
          {p.hasResults && (
            <button
              onClick={p.onDownloadPDF}
              disabled={p.disabled || p.isPdfExporting}
              title="Export all pages as a PDF file"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-gradient-to-b from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-md shadow-blue-500/20 border border-blue-600/50 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none whitespace-nowrap"
            >
              {p.isPdfExporting
                ? <Loader2 size={14} className="animate-spin" />
                : <Download size={14} />}
              Download PDF
            </button>
          )}
        </div>
      </div>

      {/* ══ Row 2: AI Restoration quality — shown when results exist ══════ */}
      {p.hasResults && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-slate-50/80 border-t border-gray-100">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="p-1 bg-cyan-50 rounded-md">
              <ScanSearch size={12} className="text-cyan-600" />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Image Restoration Quality
            </span>
          </div>
          <LabeledSelect<ImageQuality>
            label="Model"
            value={p.imageQuality}
            disabled={p.disabled}
            onChange={p.onImageQualityChange}
            options={[
              { value: 'fast', label: '⚡ Fast — Nano Banana 2' },
              { value: 'pro',  label: '✨ Pro  — Nano Banana Pro' },
            ]}
          />
          <p className="ml-auto text-[10px] text-slate-400 hidden lg:block">
            Draw a selection on the original scan (left panel) to crop &amp; restore images
          </p>
        </div>
      )}
    </div>
  );
}
