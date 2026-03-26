import {
  Layers, Loader2, Save, Download, FileText, FileDown,
  RefreshCw, Trash2, Zap, Sparkles, MoreHorizontal, BookOpen, Image as ImageIcon, HelpCircle,
} from 'lucide-react';
import { useState } from 'react';
import { type ImageQuality } from '../../services/geminiService';
import HelpModal from './HelpModal';

interface Props {
  activePage:       number;
  totalPages:       number;
  hasResult:        boolean;
  hasAnyResults:    boolean;
  isProcessing:     boolean;
  isRegenerating:   boolean;
  isPdfExporting:   boolean;
  isSaving?:        boolean;
  imageQuality:     ImageQuality;
  processingStatus: string;
  hasImage?:        boolean;

  onPrev:              () => void;
  onNext:              () => void;
  onExtract:           () => void;
  onForceExtract:      () => void;
  onRegenerate:        () => void;
  onDeletePage:        () => void;
  onSave:              () => void;
  onShowLibrary:       () => void;
  onDownloadPDF:       () => void;
  onDownloadTxt?:      () => void;
  onDownloadDocx?:     () => void;
  onImageQualityChange: (q: ImageQuality) => void;
  onCoverPage?:        () => void;
}

export default function BottomToolbar({
  activePage, hasResult, hasAnyResults,
  isProcessing, isRegenerating, isPdfExporting, isSaving,
  imageQuality, processingStatus,
  hasImage = true,
  onExtract, onForceExtract,
  onRegenerate, onDeletePage,
  onSave, onShowLibrary, onDownloadPDF, onDownloadTxt, onDownloadDocx,
  onImageQualityChange, onCoverPage,
}: Props) {
  const [moreOpen,  setMoreOpen]  = useState(false);
  const [showHelp,  setShowHelp]  = useState(false);

  return (
    <div className="bt-bar">
      {/* Processing status with progress bar */}
      {isProcessing && processingStatus && (() => {
        const match = processingStatus.match(/page (\d+) of (\d+)/i);
        const current = match ? parseInt(match[1]) : 0;
        const total = match ? parseInt(match[2]) : 0;
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        return (
          <div className="bt-status">
            <div className="bt-status-row">
              <Loader2 size={11} className="animate-spin" />
              <span>{processingStatus}</span>
              {total > 0 && <span className="bt-status-pct">{pct}%</span>}
            </div>
            {total > 0 && (
              <div className="bt-progress-track">
                <div className="bt-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        );
      })()}

      <div className="bt-row">
        {/* Center — Primary actions */}
        <div className="bt-group">
          {/* Quality toggle */}
          <button
            className="bt-mode"
            onClick={() => onImageQualityChange(imageQuality === 'fast' ? 'pro' : 'fast')}
            disabled={isProcessing}
            title={imageQuality === 'fast' ? 'Fast mode: quicker, good for most documents. Click for Pro.' : 'Pro mode: higher accuracy, slower. Click for Fast.'}
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
            <span>
              {isProcessing
                ? (processingStatus.match(/page (\d+) of (\d+)/i)
                    ? `${processingStatus.match(/page (\d+) of (\d+)/i)![1]}/${processingStatus.match(/page (\d+) of (\d+)/i)![2]}`
                    : 'Extracting…')
                : 'Extract All'}
            </span>
          </button>

          {/* Re-extract current page */}
          {hasResult && hasImage && (
            <button
              className="bt-btn bt-btn--regen"
              onClick={onRegenerate}
              disabled={isRegenerating || isProcessing}
              title={`Re-extract page ${activePage}`}
            >
              {isRegenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span className="bt-label-desktop">Re-extract</span>
            </button>
          )}
        </div>

        {/* Right — Save + Export + overflow */}
        <div className="bt-group">
          {hasAnyResults && (
            <>
              <button className="bt-btn bt-btn--save" onClick={onSave} disabled={isProcessing || isSaving} title="Save to library (Ctrl+S)">
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span className="bt-label-desktop">{isSaving ? 'Saving…' : 'Save'}</span>
              </button>

              {/* Export group — all visible */}
              <div className="bt-export-group">
                <button
                  className="bt-btn bt-btn--pdf"
                  onClick={onDownloadPDF}
                  disabled={isPdfExporting || isProcessing}
                  title="Download PDF"
                >
                  {isPdfExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span className="bt-label-desktop">PDF</span>
                </button>
                {onDownloadTxt && (
                  <button className="bt-btn bt-btn--export" onClick={onDownloadTxt} disabled={isProcessing} title="Download as plain text">
                    <FileText size={14} />
                    <span className="bt-label-desktop">.txt</span>
                  </button>
                )}
                {onDownloadDocx && (
                  <button className="bt-btn bt-btn--export" onClick={onDownloadDocx} disabled={isProcessing} title="Download as Word document">
                    <FileDown size={14} />
                    <span className="bt-label-desktop">.doc</span>
                  </button>
                )}
              </div>
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
                  {onCoverPage && (
                    <button onClick={() => { onCoverPage(); setMoreOpen(false); }}>
                      <ImageIcon size={14} /> Cover Page
                    </button>
                  )}
                  {hasAnyResults && (
                    <button onClick={() => { onForceExtract(); setMoreOpen(false); }}>
                      <RefreshCw size={14} /> Re-extract all
                    </button>
                  )}
                  {hasResult && (
                    <button className="bt-overflow-danger" onClick={() => { if (window.confirm('Delete this page?')) { onDeletePage(); setMoreOpen(false); } }}>
                      <Trash2 size={14} /> Delete page {activePage}
                    </button>
                  )}
                  <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--t-border)' }} />
                  <button onClick={() => { setShowHelp(true); setMoreOpen(false); }}>
                    <HelpCircle size={14} /> User Guide
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
