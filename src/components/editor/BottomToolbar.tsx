import {
  Layers, Loader2, Save, Download, FileText, FileDown, ClipboardCopy, X,
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
  isDirty?:         boolean;
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
  onCopyAllText?:      () => void;
  onCancel?:           () => void;
  onImageQualityChange: (q: ImageQuality) => void;
  onCoverPage?:        () => void;
  isGuest?:            boolean;
}

export default function BottomToolbar({
  activePage, totalPages, hasResult, hasAnyResults,
  isProcessing, isRegenerating, isPdfExporting, isSaving, isDirty,
  imageQuality, processingStatus,
  hasImage = true,
  onExtract, onForceExtract,
  onRegenerate, onDeletePage,
  onSave, onShowLibrary, onDownloadPDF, onDownloadTxt, onDownloadDocx, onCopyAllText, onCancel,
  onImageQualityChange, onCoverPage,
  isGuest = false,
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
          {/* Extract */}
          <button className="bt-btn bt-btn--primary" onClick={onExtract} disabled={isProcessing} title={`Extract ${totalPages} page${totalPages !== 1 ? 's' : ''} with AI OCR`}>
            {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
            <span>
              {isProcessing
                ? (processingStatus.match(/page (\d+) of (\d+)/i)
                    ? `${processingStatus.match(/page (\d+) of (\d+)/i)![1]}/${processingStatus.match(/page (\d+) of (\d+)/i)![2]}`
                    : 'Extracting…')
                : <>Extract All<span className="bt-badge">{totalPages}</span></>}
            </span>
          </button>

          {/* Cancel extraction */}
          {isProcessing && onCancel && (
            <button className="bt-btn bt-btn--cancel" onClick={onCancel} title="Stop extraction">
              <X size={14} />
              <span className="bt-label-desktop">Stop</span>
            </button>
          )}

        </div>

        {/* Right — Export PDF + overflow */}
        <div className="bt-group">
          {hasAnyResults && (
            <button
              className="bt-btn bt-btn--pdf"
              onClick={onDownloadPDF}
              disabled={isPdfExporting || isProcessing}
              title="Export as PDF"
            >
              {isPdfExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              <span className="bt-label-desktop">Export</span>
            </button>
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
                  {hasAnyResults && (
                    <button
                      onClick={() => { onSave(); setMoreOpen(false); }}
                      disabled={isSaving}
                      title={isGuest ? 'Sign in to save your work' : 'Save to library (Ctrl+S)'}
                      style={{ position: 'relative' }}
                    >
                      {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {isSaving ? 'Saving…' : isGuest ? 'Sign in to save' : 'Save'}
                      {isDirty && !isSaving && !isGuest && <span className="bt-dirty-dot" />}
                    </button>
                  )}
                  <button
                    onClick={() => { onShowLibrary(); setMoreOpen(false); }}
                    title={isGuest ? 'Sign in to access your library' : 'Open your saved library'}
                  >
                    <BookOpen size={14} /> {isGuest ? 'Sign in for library' : 'Library'}
                  </button>
                  {hasResult && hasImage && (
                    <button onClick={() => { onRegenerate(); setMoreOpen(false); }} disabled={isRegenerating || isProcessing}>
                      {isRegenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Re-extract page
                    </button>
                  )}
                  {hasAnyResults && (
                    <button onClick={() => { onImageQualityChange(imageQuality === 'fast' ? 'pro' : 'fast'); setMoreOpen(false); }}>
                      {imageQuality === 'fast' ? <><Sparkles size={14} /> Try higher accuracy</> : <><Zap size={14} /> Use fast mode</>}
                    </button>
                  )}
                  {hasAnyResults && onDownloadTxt && (
                    <button onClick={() => { onDownloadTxt(); setMoreOpen(false); }}>
                      <FileText size={14} /> Download .txt
                    </button>
                  )}
                  {hasAnyResults && onDownloadDocx && (
                    <button onClick={() => { onDownloadDocx(); setMoreOpen(false); }}>
                      <FileDown size={14} /> Download .doc
                    </button>
                  )}
                  {hasAnyResults && onCopyAllText && (
                    <button onClick={() => { onCopyAllText(); setMoreOpen(false); }}>
                      <ClipboardCopy size={14} /> Copy all text
                    </button>
                  )}
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
