import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Layers, Save, BookOpen, Download,
  Loader2, RefreshCw, Trash2, PanelLeftClose, PanelLeftOpen,
  X, FileText, FileImage, Zap, Sparkles, SlidersHorizontal, MousePointer2,
  ZoomIn, ZoomOut, Maximize, Hand, Scan, Bot,
} from 'lucide-react';
import { type Theme } from '../../hooks/useTheme';
import ThemeToggleButton from '../ThemeToggleButton';

import PageThumbnailSidebar from './PageThumbnailSidebar';
import SplitPageView        from '../SplitPageView';
import SettingsPanel        from './SettingsPanel';
import InspectorPanel, { type PageLayout, DEFAULT_LAYOUT, layoutToStyle }
                          from './InspectorPanel';
import { type ElementStyles } from '../DocumentPage';
import { type ImageQuality }  from '../../services/geminiService';
import { useResizable }       from '../../hooks/useResizable';
import UserMenu               from '../UserMenu';

const MIN_ZOOM   = 10;
const MAX_ZOOM   = 400;
const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  fileName:          string;
  pageImages:        string[];
  pageResults:       Record<number, string>;
  imageQuality:      ImageQuality;
  isProcessing:      boolean;
  processingStatus:  string;
  regeneratingPages: Set<number>;
  isPdfExporting:    boolean;

  onEdit:             (pageNumber: number, html: string) => void;
  onRegenerate:       (pageNumber: number) => void;
  onDeletePage:       (pageNumber: number) => void;
  onExtract:          () => void;
  onForceExtract:     () => void;
  onSave:             () => void;
  onClear:            () => void;
  onShowLibrary:      () => void;
  onDownloadPDF:      () => void;
  onImageQualityChange:    (q: ImageQuality) => void;
  onActivePageChange?: (page: number) => void;
  onError:  (msg: string) => void;
  user:          { id: string; email?: string; name?: string } | null;
  onSignOut:     () => void;
  theme:         Theme;
  onToggleTheme: () => void;
  chatOpen:      boolean;
  onChatToggle:  () => void;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function EditorShell({
  fileName, pageImages, pageResults, imageQuality,
  isProcessing, processingStatus, regeneratingPages,
  isPdfExporting,
  onEdit, onRegenerate, onDeletePage,
  onExtract, onForceExtract, onSave, onClear,
  onShowLibrary, onDownloadPDF,
  onImageQualityChange,
  onActivePageChange,
  onError,
  user,
  onSignOut,
  theme,
  onToggleTheme,
  chatOpen,
  onChatToggle,
}: Props) {

  const totalPages      = pageImages.length;
  const hasAnyResults   = Object.keys(pageResults).length > 0;

  const [activePage,   setActivePage]   = useState<number>(() => {
    const pages = Object.keys(pageResults).map(Number).sort((a, b) => a - b);
    return pages[0] ?? 1;
  });
  const [thumbsOpen,    setThumbsOpen]   = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [pageLayout,    setPageLayout]    = useState<PageLayout>(DEFAULT_LAYOUT);
  const [elementStyles, setElementStyles] = useState<ElementStyles | null>(null);
  const [styleApplySignal, setStyleApplySignal] =
    useState<{ patch: Record<string, string>; nonce: number } | null>(null);

  // ── Zoom + Pan (Figma-style canvas) ──────────────────────────────────
  const [zoom, setZoom] = useState(50);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [handTool, setHandTool] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [navTransition, setNavTransition] = useState(false);
  const navTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const spaceDownRef = useRef(false);

  // Refs so autoFit can read latest values without being recreated on every change
  const activePageRef  = useRef(1);
  const pageResultsRef = useRef(pageResults);
  useEffect(() => { pageResultsRef.current = pageResults; }, [pageResults]);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const zoomIn = useCallback(() => {
    setZoom(z => {
      const next = ZOOM_STEPS.find(s => s > z);
      return next ?? clampZoom(z + 10);
    });
  }, []);
  const zoomOut = useCallback(() => {
    setZoom(z => {
      const prev = [...ZOOM_STEPS].reverse().find(s => s < z);
      return prev ?? clampZoom(z - 10);
    });
  }, []);

  // Stable autoFit — reads activePage and pageResults from refs, never recreated
  const autoFit = useCallback((targetZoom?: number) => {
    const el = canvasAreaRef.current;
    if (!el) return;

    const canvasW = el.clientWidth;
    const canvasH = el.clientHeight;

    // Use refs so this callback is stable (no deps that change on navigation)
    const hasActiveResult = !!pageResultsRef.current[activePageRef.current];
    const targetW = hasActiveResult ? 1700 : 816;
    const targetH = 1100;

    let newZoom = targetZoom;
    if (newZoom === undefined) {
      const zoomW = (canvasW * 0.9) / targetW;
      const zoomH = (canvasH * 0.9) / targetH;
      newZoom = Math.round(Math.min(zoomW, zoomH) * 100);
    }

    newZoom = clampZoom(newZoom);
    setZoom(newZoom);

    const scaledW = targetW * (newZoom / 100);
    const scaledH = targetH * (newZoom / 100);
    setPanX((canvasW - scaledW) / 2);
    setPanY((canvasH - scaledH) / 2);
  }, []); // stable — never recreated

  const zoomFit    = useCallback(() => { autoFit(100); }, [autoFit]);
  const fitToWidth = useCallback(() => { autoFit();     }, [autoFit]);

  // Set initial zoom to 50% once on mount
  useEffect(() => {
    const timer = setTimeout(() => { autoFit(50); }, 100);
    return () => clearTimeout(timer);
  }, []); // runs once

  // Cleanup nav transition timer on unmount
  useEffect(() => () => {
    if (navTransitionTimer.current) clearTimeout(navTransitionTimer.current);
  }, []);

  const hasResult = !!pageResults[activePage];

  // Track per-page result state so we only auto-fit when a result FIRST
  // arrives while the user is already on that page — never on navigation.
  const trackedResultsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (hasResult && !trackedResultsRef.current.has(activePage)) {
      // Result just appeared for this page while we were watching it
      trackedResultsRef.current.add(activePage);
      // Don't recalculate zoom — user may have already set their preferred level
    }
  }, [hasResult, activePage]);

  // Ctrl/⌘ + scroll → zoom toward cursor
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      setNavTransition(false); // disable nav transition during wheel zoom
      setZoom(prevZoom => {
        const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
        const newZoom = clampZoom(Math.round(prevZoom * factor));
        const scale = newZoom / prevZoom;

        setPanX(px => cursorX - scale * (cursorX - px));
        setPanY(py => cursorY - scale * (cursorY - py));

        return newZoom;
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Space key → temporary pan mode
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat &&
          !(e.target as HTMLElement).isContentEditable &&
          (e.target as HTMLElement).tagName !== 'INPUT' &&
          (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        spaceDownRef.current = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Mouse drag → pan canvas
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      // Pan on: Space+click, middle-click, or hand tool + left-click
      const shouldPan = spaceDownRef.current || e.button === 1 || (handTool && e.button === 0);
      if (!shouldPan) return;
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };

      const onMove = (me: MouseEvent) => {
        const dx = me.clientX - panStartRef.current.x;
        const dy = me.clientY - panStartRef.current.y;
        setPanX(panStartRef.current.panX + dx);
        setPanY(panStartRef.current.panY + dy);
      };
      const onUp = () => {
        setIsPanning(false);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    el.addEventListener('mousedown', onMouseDown);
    return () => el.removeEventListener('mousedown', onMouseDown);
  }, [handTool]); // panX/panY captured in panStartRef at mousedown — no need in deps

  // ── Resizable panels ──────────────────────────────────────────────────
  const thumbResize = useResizable({
    initialWidth: 150, minWidth: 100, maxWidth: 250,
    side: 'left', storageKey: 'editor-thumb-w',
  });
  const inspResize = useResizable({
    initialWidth: 280, minWidth: 240, maxWidth: 420,
    side: 'right', storageKey: 'editor-insp-w',
  });


  const handleElementSelect = (styles: ElementStyles | null) => {
    setElementStyles(styles);
    // Auto-open inspector when element selected in selection mode (not on every cursor move)
    if (styles && !inspectorOpen && selectionMode) setInspectorOpen(true);
  };

  const handleElementStyleChange = (p: Record<string, string>) => {
    setStyleApplySignal({ patch: p, nonce: Date.now() });
  };

  // Tag change: replace an element's tag (e.g. <p> → <h2>) in the DOM
  const handleTagChange = useCallback((newTag: string) => {
    // We need to find the actual DOM element for the selected/active element.
    // The element is either selectedElRef or activeParaRef in DocumentPage.
    // We'll broadcast via a custom event that DocumentPage listens for.
    const detail = { newTag, nonce: Date.now() };
    window.dispatchEvent(new CustomEvent('insp-tag-change', { detail }));
  }, []);

  const changePage = (p: number) => {
    activePageRef.current = p;
    setActivePage(p);
    onActivePageChange?.(p);
    setElementStyles(null);
    setStyleApplySignal(null);

    // Smooth re-center: enable CSS transition, update pan, then clear transition
    if (navTransitionTimer.current) clearTimeout(navTransitionTimer.current);
    setNavTransition(true);
    navTransitionTimer.current = setTimeout(() => setNavTransition(false), 300);

    const el = canvasAreaRef.current;
    if (el) {
      const canvasW = el.clientWidth;
      const canvasH = el.clientHeight;
      const hasPageResult = !!pageResultsRef.current[p];
      const targetW = hasPageResult ? 1700 : 816;
      const targetH = 1100;
      setZoom(z => {
        setPanX((canvasW - targetW * (z / 100)) / 2);
        setPanY((canvasH - targetH * (z / 100)) / 2);
        return z;
      });
    }
  };

  // `hasResult` is already defined above now for the hook
  const isRegen      = regeneratingPages.has(activePage);
  const currentHtml  = pageResults[activePage] ?? '';
  const currentImage = pageImages[activePage - 1] ?? '';

  // During bulk extraction, auto-advance to the latest extracted page
  useEffect(() => {
    if (!isProcessing) return;
    const pages = Object.keys(pageResults).map(Number).sort((a, b) => a - b);
    if (pages.length > 0) changePage(pages[pages.length - 1]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageResults, isProcessing]);

  // Keyboard shortcuts: ← → to navigate pages
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only fire when no input/textarea is focused
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'Escape') { setSelectionMode(false); return; }
      if (selectionMode) return; // don't navigate in selection mode
      if (e.key === 'ArrowLeft')  changePage(Math.max(1, activePage - 1));
      if (e.key === 'ArrowRight') changePage(Math.min(totalPages, activePage + 1));
      // Zoom: Ctrl/Cmd + / -
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-')                   { e.preventDefault(); zoomOut(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '0')                   { e.preventDefault(); zoomFit(); }
      // Hand tool toggle
      if (e.key === 'h' || e.key === 'H') { setHandTool(h => !h); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages, activePage, selectionMode]);

  const isPdf = fileName.toLowerCase().endsWith('.pdf');

  return (
    <div className="editor-shell">

      {/* ══ Top Bar ══════════════════════════════════════════════════════════ */}
      <header className="editor-top-bar">

        {/* Thumbnail panel toggle */}
        <button
          className="editor-icon-btn"
          onClick={() => { const next = !thumbsOpen; setThumbsOpen(next); thumbResize.setCollapsed(!next); }}
          aria-label={thumbsOpen ? 'Hide pages panel' : 'Show pages panel'}
          title={thumbsOpen ? 'Hide pages panel' : 'Show pages panel'}
        >
          {thumbsOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
        </button>

        {/* File info */}
        <div className="editor-file-info">
          {isPdf ? <FileText size={13} /> : <FileImage size={13} />}
          <span className="editor-filename">{fileName}</span>
        </div>

        {/* Page navigation */}
        {totalPages > 0 && (
          <div className="editor-page-nav">
            <button
              className="editor-nav-btn"
              onClick={() => changePage(Math.max(1, activePage - 1))}
              disabled={activePage <= 1}
              aria-label="Previous page"
              title="Previous page (←)"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="editor-page-count">
              <strong>{activePage}</strong>
              <span className="editor-page-sep">/</span>
              {totalPages}
            </span>
            <button
              className="editor-nav-btn"
              onClick={() => changePage(Math.min(totalPages, activePage + 1))}
              disabled={activePage >= totalPages}
              aria-label="Next page"
              title="Next page (→)"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Processing status chip */}
        {isProcessing && processingStatus && (
          <div className="editor-status-chip">
            <Loader2 size={11} className="animate-spin" />
            <span>{processingStatus}</span>
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* ── Top-bar chrome: theme · settings · user · close ── */}
        <div className="etb-group">
          <ThemeToggleButton theme={theme} onClick={onToggleTheme} iconSize={14} />
          <SettingsPanel />
          {user && <UserMenu user={user} onSignOut={onSignOut} />}
          <button
            className="editor-icon-btn editor-icon-btn--danger"
            onClick={onClear}
            aria-label="Close document"
            title="Close document"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {/* ══ Selection mode indicator ═══════════════════════════════════════ */}
      {selectionMode && (
        <div className="editor-sel-strip">
          <MousePointer2 size={12} />
          <span className="editor-sel-strip-label">SELECT MODE</span>
          <span className="editor-sel-strip-hint">Click elements to inspect or delete</span>
          <button
            className="editor-sel-strip-exit"
            onClick={() => setSelectionMode(false)}
            aria-label="Exit select mode"
          >
            <X size={11} />
            <span>Exit</span>
          </button>
        </div>
      )}

      {/* ══ Body ═════════════════════════════════════════════════════════════ */}
      <div className="editor-body">

        {/* ── Left: Page thumbnail sidebar (resizable) ─────────────── */}
        {totalPages > 0 && (
          <>
            <div className="editor-panel-wrap" style={thumbResize.panelStyle}>
              <PageThumbnailSidebar
                pageImages={pageImages}
                pageResults={pageResults}
                regeneratingPages={regeneratingPages}
                activePage={activePage}
                onSelect={changePage}
              />
            </div>
            <div {...thumbResize.dividerProps} />
          </>
        )}

        {/* ── Center: Main editing canvas ────────────────────────────── */}
        <div
          className={`editor-canvas-wrap${isPanning ? ' editor-canvas--panning' : ''}${handTool ? ' editor-canvas--hand' : ''}`}
          ref={canvasAreaRef}
          style={{ '--dot-spacing': `${Math.max(16, 20 * zoom / 100)}px` } as React.CSSProperties}
        >
          <div className="editor-canvas">
            <div
              className="editor-zoom-content"
              style={{
                transform: `translate(${panX}px, ${panY}px) scale(${zoom / 100})`,
                transformOrigin: '0 0',
                willChange: 'transform',
                transition: navTransition && !isPanning
                  ? 'transform 260ms cubic-bezier(0.4, 0, 0.2, 1)'
                  : undefined,
              }}
            >
              {hasResult ? (
                <SplitPageView
                  key={activePage}
                  pageNumber={activePage}
                  pageImage={currentImage}
                  html={currentHtml}
                  imageQuality={imageQuality}
                  isRegenerating={isRegen}
                  styleOverride={layoutToStyle(pageLayout)}
                  selectionMode={selectionMode}
                  onElementSelect={handleElementSelect}
                  onExitSelectionMode={() => setSelectionMode(false)}
                  styleApply={styleApplySignal}
                  onEdit={onEdit}
                  onError={onError}
                />
              ) : totalPages === 0 ? (
                <div className="editor-empty-state">
                  <Loader2 size={32} className="animate-spin" style={{ color: '#475569' }} />
                  <p>Loading document…</p>
                </div>
              ) : (
                <div className="editor-unextracted-page">
                  {currentImage ? (
                    <img
                      src={`data:image/jpeg;base64,${currentImage}`}
                      alt={`Page ${activePage} scan`}
                      className="editor-unextracted-img"
                    />
                  ) : (
                    <div className="editor-unextracted-placeholder">
                      <Loader2 size={28} className="animate-spin" style={{ color: '#94a3b8' }} />
                    </div>
                  )}
                  {/* Scanning beam while extracting */}
                  {isRegen && (
                    <div className="scan-overlay">
                      <span className="scan-overlay-label">Extracting page {activePage}…</span>
                    </div>
                  )}
                  <div className="editor-unextracted-bar">
                    <span className="editor-unextracted-label">Page {activePage} — not yet extracted</span>
                    <button
                      className="etb etb--primary"
                      onClick={() => onRegenerate(activePage)}
                      disabled={isRegen || isProcessing}
                    >
                      {isRegen
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Layers size={12} />}
                      <span>{isRegen ? 'Extracting…' : 'Extract this page'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Zoom bar — floats over canvas ─────────────────────── */}
          <div className="editor-zoom-bar">
            <button
              className={`editor-zoom-btn${handTool ? ' editor-zoom-btn--active' : ''}`}
              onClick={() => setHandTool(h => !h)}
              aria-label={handTool ? 'Disable hand tool' : 'Enable hand tool'}
              title={handTool ? 'Hand tool ON (H) — click to disable' : 'Hand tool (H) — drag to pan'}
            >
              <Hand size={14} />
            </button>

            <div className="editor-zoom-sep" />

            <button
              className="editor-zoom-btn"
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              title="Zoom out (Ctrl+scroll)"
            >
              <ZoomOut size={14} />
            </button>

            <button
              className="editor-zoom-pct"
              onClick={zoomFit}
              title="Reset to 100% (Ctrl+0)"
            >
              {zoom}%
            </button>

            <button
              className="editor-zoom-btn"
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              title="Zoom in (Ctrl+scroll)"
            >
              <ZoomIn size={14} />
            </button>

            <div className="editor-zoom-sep" />

            <button
              className="editor-zoom-btn"
              onClick={fitToWidth}
              aria-label="Fit to width"
              title="Fit to width"
            >
              <Maximize size={13} />
            </button>

            <button
              className="editor-zoom-btn"
              onClick={zoomFit}
              aria-label="Fit to page (reset)"
              title="Fit to page — reset zoom & pan (Ctrl+0)"
            >
              <Scan size={13} />
            </button>
          </div>
        </div>

        {/* ── Right: Layout inspector (resizable) ──────────────────── */}
        <div {...inspResize.dividerProps} />
        <div className="editor-panel-wrap editor-panel-wrap--right" style={inspResize.panelStyle}>
          <InspectorPanel
            layout={pageLayout}
            elementStyles={elementStyles}
            onChange={setPageLayout}
            onElementStyleChange={handleElementStyleChange}
            onTagChange={handleTagChange}
          />
        </div>

      </div>

      {/* ══ Figma-style floating action dock ════════════════════════════════
           Groups (left → right, by similarity):
           1. Tools      — Select · Inspector
           2. OCR        — Fast/Pro · Extract · Re-extract All
           3. Page       — Re-extract Page · Delete  (conditional)
           4. Export     — Save · Library · PDF
           5. AI         — AI Chat
      ══ */}
      <div className="ftb-dock">

        {/* Processing status bubble — floats above dock */}
        {isProcessing && processingStatus && (
          <div className="ftb-status">
            <Loader2 size={10} className="animate-spin" />
            <span>{processingStatus}</span>
          </div>
        )}

        {/* ── Group 1: Tools — canvas interaction modes ── */}
        <div className="ftb-group">
          <button
            className={`ftb-icon-btn ftb-tool${selectionMode ? ' ftb-tool--active' : ''}`}
            onClick={() => setSelectionMode(m => !m)}
            aria-label={selectionMode ? 'Exit select mode (Esc)' : 'Select elements'}
            title={selectionMode ? 'Select mode ON — click to exit (Esc)' : 'Select elements to inspect or delete (V)'}
          >
            <MousePointer2 size={14} />
          </button>
          <button
            className={`ftb-icon-btn ftb-tool${inspectorOpen ? ' ftb-tool--active' : ''}`}
            onClick={() => { const next = !inspectorOpen; setInspectorOpen(next); inspResize.setCollapsed(!next); }}
            aria-label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
            title={inspectorOpen ? 'Hide layout inspector' : 'Show layout inspector (I)'}
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>

        <div className="ftb-sep" />

        {/* ── Group 2: OCR / Extract ── */}
        <div className="ftb-group">
          <button
            className="ftb-mode-toggle"
            onClick={() => onImageQualityChange(imageQuality === 'fast' ? 'pro' : 'fast')}
            disabled={isProcessing}
            title={imageQuality === 'pro'
              ? 'OCR: Pro (high quality) — click to switch to Fast'
              : 'OCR: Fast (Gemini Flash) — click to switch to Pro'}
          >
            <span className={`ftb-mode-opt${imageQuality === 'fast' ? ' ftb-mode-opt--active' : ''}`}>
              <Zap size={10} /> Fast
            </span>
            <span className={`ftb-mode-opt${imageQuality === 'pro' ? ' ftb-mode-opt--active' : ''}`}>
              <Sparkles size={10} /> Pro
            </span>
          </button>

          <div className="ftb-inner-sep" />

          <button
            className="ftb-btn ftb-btn--primary"
            onClick={onExtract}
            disabled={isProcessing}
            title="Extract all unprocessed pages"
          >
            {isProcessing
              ? <Loader2 size={13} className="animate-spin" />
              : <Layers size={13} />}
            <span>{isProcessing ? 'Extracting…' : 'Extract'}</span>
          </button>

          {hasAnyResults && (
            <button
              className="ftb-icon-btn"
              onClick={onForceExtract}
              disabled={isProcessing}
              title="Re-extract all pages (force)"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>

        {/* ── Group 3: Page — current page operations (conditional) ── */}
        {hasResult && (
          <>
            <div className="ftb-sep" />
            <div className="ftb-group">
              <button
                className="ftb-btn ftb-btn--teal"
                onClick={() => onRegenerate(activePage)}
                disabled={isRegen || isProcessing}
                title={`Re-extract page ${activePage} with AI`}
              >
                {isRegen
                  ? <Loader2 size={13} className="animate-spin" />
                  : <RefreshCw size={13} />}
                <span>Re-extract</span>
              </button>
              <button
                className="ftb-icon-btn ftb-icon-btn--danger"
                onClick={() => onDeletePage(activePage)}
                disabled={isRegen || isProcessing}
                title={`Delete page ${activePage} from results`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </>
        )}

        <div className="ftb-sep" />

        {/* ── Group 4: Export — document output ── */}
        <div className="ftb-group">
          {hasAnyResults && (
            <button
              className="ftb-btn ftb-btn--green"
              onClick={onSave}
              disabled={isProcessing}
              title="Save document to library"
            >
              <Save size={13} />
              <span>Save</span>
            </button>
          )}
          <button
            className="ftb-icon-btn"
            onClick={onShowLibrary}
            title="Open document library"
          >
            <BookOpen size={14} />
          </button>
          {hasAnyResults && (
            <button
              className="ftb-btn ftb-btn--blue"
              onClick={onDownloadPDF}
              disabled={isPdfExporting || isProcessing}
              title="Download as PDF"
            >
              {isPdfExporting
                ? <Loader2 size={13} className="animate-spin" />
                : <Download size={13} />}
              <span>{isPdfExporting ? 'Exporting…' : 'PDF'}</span>
            </button>
          )}
        </div>

        <div className="ftb-sep" />

        {/* ── Group 5: AI — intelligence ── */}
        <div className="ftb-group">
          <button
            className={`ftb-btn ftb-btn--ai${chatOpen ? ' ftb-btn--ai-active' : ''}`}
            onClick={onChatToggle}
            title={chatOpen ? 'Close AI assistant' : 'Open AI assistant'}
          >
            <Bot size={13} />
            <span>AI Chat</span>
          </button>
        </div>

      </div>
    </div>
  );
}
