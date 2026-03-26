import { Eye, FileText, Columns2 } from 'lucide-react';

export type ViewMode = 'scan' | 'document' | 'compare';

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  hasResults: boolean;
}

export default function ViewModeTabs({ mode, onChange, hasResults }: Props) {
  return (
    <div className="vt-bar">
      <button
        className={`vt-tab${mode === 'scan' ? ' vt-tab--active' : ''}`}
        onClick={() => onChange('scan')}
        title="View original scanned page"
      >
        <Eye size={13} />
        <span>Original</span>
      </button>
      <button
        className={`vt-tab${mode === 'document' ? ' vt-tab--active' : ''}`}
        onClick={() => onChange('document')}
        disabled={!hasResults}
        title="View extracted editable document"
      >
        <FileText size={13} />
        <span>Extracted</span>
      </button>
      <button
        className={`vt-tab${mode === 'compare' ? ' vt-tab--active' : ''}`}
        onClick={() => onChange('compare')}
        disabled={!hasResults}
        title="Side-by-side: original scan vs extracted text"
      >
        <Columns2 size={13} />
        <span>Side by Side</span>
      </button>
    </div>
  );
}
