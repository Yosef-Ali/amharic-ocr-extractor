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
      >
        <Eye size={13} />
        <span>Scan</span>
      </button>
      <button
        className={`vt-tab${mode === 'document' ? ' vt-tab--active' : ''}`}
        onClick={() => onChange('document')}
        disabled={!hasResults}
      >
        <FileText size={13} />
        <span>Document</span>
      </button>
      <button
        className={`vt-tab${mode === 'compare' ? ' vt-tab--active' : ''}`}
        onClick={() => onChange('compare')}
        disabled={!hasResults}
      >
        <Columns2 size={13} />
        <span>Compare</span>
      </button>
    </div>
  );
}
