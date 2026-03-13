import {
  ChevronLeft, ChevronRight, Layers, Loader2, Save, Download,
  RefreshCw, Trash2, Zap, Sparkles, MoreHorizontal, BookOpen,
} from 'lucide-react';
import { useState } from 'react';
import { type ImageQuality } from '../../services/geminiService';

interface Props {
  activePage:       number;
  totalPages:       number;
  hasResult:        boolean;
  hasAnyResults:    boolean;
  isProcessing:     boolean;
  isRegenerating:   boolean;
  isPdfExporting:   boolean;
  imageQuality:     ImageQuality;
  processingStatus: string;

  onPrev:              () => void;
  onNext:              () => void;
  onExtract:           () => void;
  onForceExtract:      () => void;
  onRegenerate:        () => void;
  onDeletePage:        () => void;
  onSave:              () => void;
  onShowLibrary:       () => void;
  onDownloadPDF:       () => void;
  onImageQualityChange: (q: ImageQuality) => void;
}

export default function BottomToolbar({
  activePage, totalPages, hasResult, hasAnyResults,
  isProcessing, isRegenerating, isPdfExporting,
  imageQuality, processingStatus,
  onPrev, onNext, onExtract, onForceExtract,
  onRegenerate, onDeletePage,
  onSave, onShowLibrary, onDownloadPDF,
  onImageQualityChange,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="bt-bar">
      {/* Processing status */}
      {isProcessing && processingStatus && (
        <div className="bt-status">
          <Loader2 size={11} className="animate-spin" />
          <span>{processingStatus}</span>
        </div>
      )}

      <div className="bt-row">
        {/* Left — Page navigation */}
        <div className="bt-group">
          <button className="bt-icon" onClick={onPrev} disabled={activePage <= 1} title="Previous page">
            <ChevronLeft size={16} />
          </button>
          <span className="bt-page-count">
            <strong>{activePage}</strong>
            <span className="bt-sep">/</span>
            {totalPages}
          </span>
          <button className="bt-icon" onClick={onNext} disabled={activePage >= totalPages} title="Next page">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Center — Primary actions */}
        <div className="bt-group">
          {/* Quality toggle */}
          <button
            className="bt-mode"
            onClick={() => onImageQualityChange(imageQuality === 'fast' ? 'pro' : 'fast')}
            disabled={isProcessing}
            title={imageQuality === 'pro' ? 'Switch to Fast' : 'Switch to Pro'}
          >
            <span className={`bt-mode-opt${imageQuality === 'fast' ? ' bt-mode-opt--on' : ''}`}>
              <Zap size={10} /> Fast
            </span>
            <span className={`bt-mode-opt${imageQuality === 'pro' ? ' bt-mode-opt--on' : ''}`}>
              <Sparkles size={10} /> Pro
            </span>
          </button>

          {/* Extract */}
          <button className="bt-btn bt-btn--primary" onClick={onExtract} disabled={isProcessing}>
            {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
            <span>{isProcessing ? 'Extracting…' : 'Extract'}</span>
          </button>

          {/* Re-extract current page */}
          {hasResult && (
            <button
              className="bt-icon"
              onClick={onRegenerate}
              disabled={isRegenerating || isProcessing}
              title={`Re-extract page ${activePage}`}
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>

        {/* Right — Export + overflow */}
        <div className="bt-group">
          {hasAnyResults && (
            <>
              <button className="bt-btn bt-btn--save" onClick={onSave} disabled={isProcessing} title="Save">
                <Save size={14} />
                <span className="bt-label-desktop">Save</span>
              </button>
              <button
                className="bt-btn bt-btn--pdf"
                onClick={onDownloadPDF}
                disabled={isPdfExporting || isProcessing}
                title="Download PDF"
              >
                {isPdfExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span className="bt-label-desktop">PDF</span>
              </button>
            </>
          )}

          {/* Overflow menu */}
          <div className="bt-overflow-wrap">
            <button className="bt-icon" onClick={() => setMoreOpen(o => !o)} title="More actions">
              <MoreHorizontal size={16} />
            </button>
            {moreOpen && (
              <>
                <div className="bt-overflow-scrim" onClick={() => setMoreOpen(false)} />
                <div className="bt-overflow">
                  <button onClick={() => { onShowLibrary(); setMoreOpen(false); }}>
                    <BookOpen size={14} /> Library
                  </button>
                  {hasAnyResults && (
                    <button onClick={() => { onForceExtract(); setMoreOpen(false); }}>
                      <RefreshCw size={14} /> Re-extract all
                    </button>
                  )}
                  {hasResult && (
                    <button className="bt-overflow-danger" onClick={() => { onDeletePage(); setMoreOpen(false); }}>
                      <Trash2 size={14} /> Delete page {activePage}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
