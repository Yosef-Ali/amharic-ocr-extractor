import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Layers, Loader2,
  PanelLeftClose, PanelLeftOpen,
  X, FileText, FileImage, MousePointer2,
  Bot, SlidersHorizontal,
  Maximize, Hand,
  Minus, Plus, Undo2, Redo2,
} from 'lucide-react';
import { type Theme } from '../../hooks/useTheme';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import ThemeToggleButton from '../ThemeToggleButton';

import PageThumbnailSidebar from './PageThumbnailSidebar';
import SplitPageView        from '../SplitPageView';
import SettingsPanel         from './SettingsPanel';
import InspectorPanel, { type PageLayout, DEFAULT_LAYOUT, layoutToStyle }
                             from './InspectorPanel';
import AgentPanel            from './AgentPanel';
import RightDrawer           from './RightDrawer';
import ViewModeTabs, { type ViewMode } from './ViewModeTabs';
import BottomToolbar         from './BottomToolbar';
import DocumentPage          from '../DocumentPage';
import { type ElementStyles, type DocumentPageHandle } from '../DocumentPage';
import { type ImageQuality }  from '../../services/geminiService';
import { type CanvasExecutor } from '../../services/canvasExecutor';
import UserMenu               from '../UserMenu';

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
  canvasExecutor?: CanvasExecutor;
  mcpConnected?:   boolean;
  user:          { id: string; email?: string; name?: string } | null;
  onSignOut:     () => void;
  theme:         Theme;
  onToggleTheme: () => void;
}

type DrawerPanel = 'agent' | 'inspector' | null;

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
  canvasExecutor,
  mcpConnected = false,
  user,
  onSignOut,
  theme,
  onToggleTheme,
}: Props) {

  const totalPages    = pageImages.length;
  const hasAnyResults = Object.keys(pageResults).length > 0;
  const isMobile      = useMediaQuery('(max-width: 767px)');
  const isTablet      = useMediaQuery('(max-width: 1023px)');

  const [activePage,    setActivePage]    = useState<number>(() => {
    const pages = Object.keys(pageResults).map(Number).sort((a, b) => a - b);
    return pages[0] ?? 1;
  });
  const [thumbsOpen,    setThumbsOpen]    = useState(!isTablet);
  const [rightDrawer,   setRightDrawer]   = useState<DrawerPanel>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [pageLayout,    setPageLayout]    = useState<PageLayout>(DEFAULT_LAYOUT);
  const [elementStyles, setElementStyles] = useState<ElementStyles | null>(null);
  const [styleApplySignal, setStyleApplySignal] =
    useState<{ patch: Record<string, string>; nonce: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('scan');

  // ── Zoom & Pan state ──────────────────────────────────────────────────
  const ZOOM_MIN = 25;
  const ZOOM_MAX = 400;
  const ZOOM_STEP = 15;
  const [zoom, setZoom]           = useState(100);
  const [handTool, setHandTool]   = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const contentRef = useRef<HTMLDivElement>(null);

  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z)));
  const zoomIn    = () => setZoom(z => clampZoom(z + ZOOM_STEP));
  const zoomOut   = () => setZoom(z => clampZoom(z - ZOOM_STEP));
  const zoomFit   = () => { setZoom(100); setPanOffset({ x: 0, y: 0 }); };

  // ── Undo / Redo — docHandle ref shared with DocumentPage ──────────────
  const docHandleRef = useRef<DocumentPageHandle | null>(null);
  const handleUndo = () => docHandleRef.current?.undo();
  const handleRedo = () => docHandleRef.current?.redo();

  // Ctrl+scroll to zoom
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(z => clampZoom(z - e.deltaY * 0.5));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Pan with mouse drag when hand tool is active
  const onPanMouseDown = useCallback((e: React.MouseEvent) => {
    if (!handTool) return;
    e.preventDefault();
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
  }, [handTool, panOffset]);
  const onPanMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanOffset({
      x: panStart.current.ox + (e.clientX - panStart.current.x),
      y: panStart.current.oy + (e.clientY - panStart.current.y),
    });
  }, [isPanning]);
  const onPanMouseUp = useCallback(() => setIsPanning(false), []);

  // Middle-mouse-button pan (no hand tool needed)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let mid = false;
    let sx = 0, sy = 0, ox = 0, oy = 0;
    const down = (e: MouseEvent) => {
      if (e.button !== 1) return; // middle button
      e.preventDefault();
      mid = true;
      sx = e.clientX; sy = e.clientY;
      ox = panOffset.x; oy = panOffset.y;
    };
    const move = (e: MouseEvent) => {
      if (!mid) return;
      setPanOffset({ x: ox + (e.clientX - sx), y: oy + (e.clientY - sy) });
    };
    const up = () => { mid = false; };
    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      el.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [panOffset]);

  const activePageRef = useRef(activePage);
  useEffect(() => { activePageRef.current = activePage; }, [activePage]);

  // Auto-switch to document view when results arrive
  useEffect(() => {
    if (pageResults[activePage] && viewMode === 'scan') {
      setViewMode('compare');
    }
  }, [pageResults, activePage]);

  // Collapse sidebar on tablet
  useEffect(() => { setThumbsOpen(!isTablet); }, [isTablet]);

  const hasResult    = !!pageResults[activePage];
  const isRegen      = regeneratingPages.has(activePage);
  const currentHtml  = pageResults[activePage] ?? '';
  const currentImage = pageImages[activePage - 1] ?? '';
  const isPdf        = fileName.toLowerCase().endsWith('.pdf');

  // ── Navigation ─────────────────────────────────────────────────────────
  const changePage = useCallback((p: number) => {
    setActivePage(p);
    onActivePageChange?.(p);
    setElementStyles(null);
    setStyleApplySignal(null);
  }, [onActivePageChange]);

  // During bulk extraction, auto-advance to the latest extracted page
  useEffect(() => {
    if (!isProcessing) return;
    const pages = Object.keys(pageResults).map(Number).sort((a, b) => a - b);
    if (pages.length > 0) changePage(pages[pages.length - 1]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageResults, isProcessing]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'Escape') { setSelectionMode(false); setRightDrawer(null); setHandTool(false); return; }
      // Zoom shortcuts
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomOut(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); zoomFit(); return; }
      // Hand tool toggle
      if (e.key === 'h' || e.key === 'H') { setHandTool(h => !h); return; }
      if (selectionMode) return;
      if (e.key === 'ArrowLeft')  changePage(Math.max(1, activePage - 1));
      if (e.key === 'ArrowRight') changePage(Math.min(totalPages, activePage + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPages, activePage, selectionMode, changePage]);

  // ── Element selection (inspector) ──────────────────────────────────────
  const handleElementSelect = (styles: ElementStyles | null) => {
    setElementStyles(styles);
    // Inspector updates if already open, but does NOT auto-open on element select.
    // User opens it manually via the toolbar button when they want it.
  };
  const handleElementStyleChange = (p: Record<string, string>) => {
    setStyleApplySignal({ patch: p, nonce: Date.now() });
  };
  const handleTagChange = useCallback((newTag: string) => {
    window.dispatchEvent(new CustomEvent('insp-tag-change', { detail: { newTag, nonce: Date.now() } }));
  }, []);

  // ── Auto-open inspector when a crop selection is drawn ───────────────
  const pendingCropRef = useRef<CustomEventInit | null>(null);
  useEffect(() => {
    const onCropState = (e: Event) => {
      const detail = (e as CustomEvent).detail as { active: boolean };
      if (detail.active) {
        pendingCropRef.current = { detail };   // stash so we can re-fire after mount
        setRightDrawer('inspector');
      } else {
        pendingCropRef.current = null;
      }
    };
    window.addEventListener('insp-crop-state', onCropState);
    return () => window.removeEventListener('insp-crop-state', onCropState);
  }, []);

  // Re-dispatch the crop event once InspectorPanel is mounted in the drawer
  useEffect(() => {
    if (rightDrawer !== 'inspector' || !pendingCropRef.current) return;
    const saved = pendingCropRef.current;
    pendingCropRef.current = null;
    // Give React one tick to finish rendering InspectorPanel before firing
    const id = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('insp-crop-state', saved));
    }, 0);
    return () => clearTimeout(id);
  }, [rightDrawer]);

  // ── Right drawer toggling ─────────────────────────────────────────────
  const toggleDrawer = (panel: DrawerPanel) => {
    setRightDrawer(prev => prev === panel ? null : panel);
  };


  // ── Drawer title ──────────────────────────────────────────────────────
  const drawerTitle = rightDrawer === 'agent' ? 'AI Agent'
    : rightDrawer === 'inspector' ? 'Inspector'
    : '';

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="es-shell">

      {/* ══ Header ════════════════════════════════════════════════════════ */}
      <header className="es-header">
        {/* Left cluster */}
        <div className="es-header-left">
          <button
            className="es-icon-btn"
            onClick={() => setThumbsOpen(o => !o)}
            title={thumbsOpen ? 'Hide pages' : 'Show pages'}
          >
            {thumbsOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
          <div className="es-file-info">
            {isPdf ? <FileText size={14} /> : <FileImage size={14} />}
            <span className="es-filename">{fileName}</span>
          </div>
        </div>

        {/* Center — page nav */}
        {totalPages > 0 && (
          <div className="es-page-nav">
            <button className="es-nav-btn" onClick={() => changePage(Math.max(1, activePage - 1))} disabled={activePage <= 1}>
              <ChevronLeft size={14} />
            </button>
            <span className="es-page-ct"><strong>{activePage}</strong> / {totalPages}</span>
            <button className="es-nav-btn" onClick={() => changePage(Math.min(totalPages, activePage + 1))} disabled={activePage >= totalPages}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Right cluster */}
        <div className="es-header-right">
          {/* Tool toggles */}
          <button
            className={`es-icon-btn${selectionMode ? ' es-icon-btn--active' : ''}`}
            onClick={() => setSelectionMode(m => !m)}
            title="Select mode"
          >
            <MousePointer2 size={14} />
          </button>
          <button
            className={`es-icon-btn${rightDrawer === 'agent' ? ' es-icon-btn--active' : ''}`}
            onClick={() => toggleDrawer('agent')}
            title="AI Agent"
            style={{ position: 'relative' }}
          >
            <Bot size={14} />
            {mcpConnected && <span className="es-mcp-dot" />}
          </button>
          <button
            className={`es-icon-btn${rightDrawer === 'inspector' ? ' es-icon-btn--active' : ''}`}
            onClick={() => toggleDrawer('inspector')}
            title="Inspector"
          >
            <SlidersHorizontal size={14} />
          </button>
          <div className="es-header-sep" />

          {/* ── Undo / Redo ───────────────────────────────── */}
          <button className="es-icon-btn" onClick={handleUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={14} />
          </button>
          <button className="es-icon-btn" onClick={handleRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={14} />
          </button>

          <div className="es-header-sep" />

          {/* ── Zoom & Pan controls ─────────────────────── */}
          <button
            className={`es-icon-btn${handTool ? ' es-icon-btn--active' : ''}`}
            onClick={() => setHandTool(h => !h)}
            title="Hand tool (H)"
          >
            <Hand size={14} />
          </button>
          <div className="es-zoom-bar">
            <button className="es-zoom-btn" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom out (Ctrl -)">
              <Minus size={12} />
            </button>
            <button className="es-zoom-pct" onClick={zoomFit} title="Reset zoom (Ctrl 0)">
              {zoom}%
            </button>
            <button className="es-zoom-btn" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in (Ctrl +)">
              <Plus size={12} />
            </button>
            <button className="es-zoom-btn" onClick={zoomFit} title="Fit to view">
              <Maximize size={12} />
            </button>
          </div>

          <div className="es-header-sep" />
          <ThemeToggleButton theme={theme} onClick={onToggleTheme} iconSize={14} />
          <SettingsPanel />
          {user && <UserMenu user={user} onSignOut={onSignOut} />}
          <button className="es-icon-btn es-icon-btn--danger" onClick={onClear} title="Close document">
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Selection mode strip */}
      {selectionMode && (
        <div className="es-sel-strip">
          <MousePointer2 size={12} />
          <span>SELECT MODE</span>
          <span className="es-sel-hint">Click elements to inspect</span>
          <button onClick={() => setSelectionMode(false)}><X size={11} /> Exit</button>
        </div>
      )}

      {/* ══ Body ══════════════════════════════════════════════════════════ */}
      <div className="es-body">

        {/* ── Left: Thumbnail sidebar ─────────────────────────────────── */}
        {thumbsOpen && totalPages > 0 && (
          <aside className={`es-sidebar${isTablet ? ' es-sidebar--overlay' : ''}`}>
            <PageThumbnailSidebar
              pageImages={pageImages}
              pageResults={pageResults}
              regeneratingPages={regeneratingPages}
              activePage={activePage}
              onSelect={changePage}
            />
          </aside>
        )}
        {/* Overlay scrim for tablet sidebar */}
        {thumbsOpen && isTablet && (
          <div className="es-sidebar-scrim" onClick={() => setThumbsOpen(false)} />
        )}

        {/* ── Main content area ───────────────────────────────────────── */}
        <main className="es-main">
          {/* View mode tabs */}
          <ViewModeTabs mode={viewMode} onChange={setViewMode} hasResults={hasResult} />

          {/* Content area — scrollable + zoomable */}
          <div
            ref={contentRef}
            className={`es-content${handTool ? ' es-content--grab' : ''}${isPanning ? ' es-content--grabbing' : ''}`}
            onMouseDown={onPanMouseDown}
            onMouseMove={onPanMouseMove}
            onMouseUp={onPanMouseUp}
            onMouseLeave={onPanMouseUp}
          >
            <div
              className="es-zoom-layer"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom / 100})`,
                transformOrigin: 'top center',
              }}
            >
            {viewMode === 'compare' && hasResult ? (
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
                docHandle={docHandleRef}
                zoom={zoom}
              />
            ) : viewMode === 'document' && hasResult ? (
              <div className="es-doc-wrap">
                <DocumentPage
                  pageNumber={activePage}
                  html={currentHtml}
                  styleOverride={layoutToStyle(pageLayout)}
                  selectionMode={selectionMode}
                  onElementSelect={handleElementSelect}
                  onExitSelectionMode={() => setSelectionMode(false)}
                  styleApply={styleApplySignal}
                  onEdit={onEdit}
                  docHandle={docHandleRef}
                  zoom={zoom}
                />
              </div>
            ) : viewMode === 'scan' || !hasResult ? (
              <div className="es-scan-wrap">
                {currentImage ? (
                  <>
                    <img
                      src={`data:image/jpeg;base64,${currentImage}`}
                      alt={`Page ${activePage} scan`}
                      className="es-scan-img"
                    />
                    {isRegen && (
                      <div className="scan-overlay">
                        <span className="scan-overlay-label">Extracting page {activePage}…</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="es-empty">
                    <Loader2 size={28} className="animate-spin" style={{ color: '#94a3b8' }} />
                  </div>
                )}
                {!hasResult && !isRegen && (
                  <div className="es-unextracted-bar">
                    <span>Page {activePage} — not yet extracted</span>
                    <button
                      className="bt-btn bt-btn--primary"
                      onClick={() => onRegenerate(activePage)}
                      disabled={isRegen || isProcessing}
                    >
                      {isRegen ? <Loader2 size={12} className="animate-spin" /> : <Layers size={12} />}
                      <span>{isRegen ? 'Extracting…' : 'Extract this page'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : null}
            </div>{/* /es-zoom-layer */}
          </div>{/* /es-content */}

          {/* Bottom toolbar */}
          <BottomToolbar
            activePage={activePage}
            totalPages={totalPages}
            hasResult={hasResult}
            hasAnyResults={hasAnyResults}
            isProcessing={isProcessing}
            isRegenerating={isRegen}
            isPdfExporting={isPdfExporting}
            imageQuality={imageQuality}
            processingStatus={processingStatus}
            onPrev={() => changePage(Math.max(1, activePage - 1))}
            onNext={() => changePage(Math.min(totalPages, activePage + 1))}
            onExtract={onExtract}
            onForceExtract={onForceExtract}
            onRegenerate={() => onRegenerate(activePage)}
            onDeletePage={() => onDeletePage(activePage)}
            onSave={onSave}
            onShowLibrary={onShowLibrary}
            onDownloadPDF={onDownloadPDF}
            onImageQualityChange={onImageQualityChange}
          />
        </main>

        {/* ── Right drawer ────────────────────────────────────────────── */}
        <RightDrawer
          open={!!rightDrawer}
          title={drawerTitle}
          onClose={() => setRightDrawer(null)}
          mobile={isMobile}
          hideHeader={rightDrawer === 'agent'}
        >
          {rightDrawer === 'agent' && (
            <AgentPanel
              context={pageResults[activePage] ? {
                pageNumber: activePage,
                html:       pageResults[activePage],
                image:      pageImages[activePage - 1] ?? '',
                onEdit:     (html) => onEdit(activePage, html),
              } : undefined}
              activePage={activePage}
              pageImage={pageImages[activePage - 1] ?? ''}
              totalPages={totalPages}
              extractedPages={new Set(Object.keys(pageResults).map(Number))}
              executor={canvasExecutor}
              onNavigatePage={changePage}
              onSave={onSave}
              onDownloadPDF={onDownloadPDF}
              onClose={() => setRightDrawer(null)}
            />
          )}
          {rightDrawer === 'inspector' && (
            <InspectorPanel
              layout={pageLayout}
              elementStyles={elementStyles}
              onChange={setPageLayout}
              onElementStyleChange={handleElementStyleChange}
              onTagChange={handleTagChange}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onDownloadPDF={onDownloadPDF}
            />
          )}
        </RightDrawer>

      </div>
    </div>
  );
}
