import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Layers, Loader2,
  PanelLeftClose, PanelLeftOpen,
  X, FileText, FileImage, MousePointer2,
  Bot, SlidersHorizontal,
  Maximize, Hand,
  Minus, Plus, Undo2, Redo2, Sparkles, Home, Search,
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
import { type PageDimension }  from '../../services/pdfService';
import UserMenu               from '../UserMenu';
import CoverEditor            from './CoverEditor';
import CoverEditorPanel       from './CoverEditorPanel';
import { type CoverBlock, parseCover, serialiseCover } from './coverUtils';
import FindReplaceBar         from './FindReplaceBar';
import HomophonePanel         from './HomophonePanel';

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  fileName:          string;
  pageImages:        string[];
  pageDimensions:    PageDimension[];
  pageResults:       Record<number, string>;
  imageQuality:      ImageQuality;
  isProcessing:      boolean;
  processingStatus:  string;
  regeneratingPages: Set<number>;
  isPdfExporting:    boolean;
  isSaving?:         boolean;

  onEdit:             (pageNumber: number, html: string) => void;
  onRegenerate:       (pageNumber: number) => void;
  onDeletePage:       (pageNumber: number) => void;
  onReorderPages?:    (fromPage: number, toPage: number) => void;
  onInsertPage?:      (afterPage: number) => void;
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

type DrawerPanel = 'agent' | 'inspector' | 'cover' | 'homophone' | null;

// ── Component ────────────────────────────────────────────────────────────────
export default function EditorShell({
  fileName, pageImages, pageDimensions, pageResults, imageQuality,
  isProcessing, processingStatus, regeneratingPages,
  isPdfExporting, isSaving,
  onEdit, onRegenerate, onDeletePage,
  onReorderPages, onInsertPage,
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
  const hasCover      = !!pageResults[0];
  const hasBackCover  = !!pageResults[-1];
  const backBgUrl     = (() => { const m = pageResults[-1]?.match(/<img[^>]+src="(data:image\/[^"]+)"/); return m?.[1] ?? ''; })();
  const hasAnyResults = Object.keys(pageResults).length > 0;
  const isMobile      = useMediaQuery('(max-width: 767px)');
  const isTablet      = useMediaQuery('(max-width: 1023px)');
  const navMin        = hasCover ? 0 : 1;

  const [activePage,    setActivePage]    = useState<number>(() => {
    const pages = Object.keys(pageResults).map(Number).sort((a, b) => a - b);
    return pages[0] ?? 1;
  });
  const [thumbsOpen,      setThumbsOpen]      = useState(false);
  const [rightDrawer,     setRightDrawer]     = useState<DrawerPanel>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [pageLayout,    setPageLayout]    = useState<PageLayout>(DEFAULT_LAYOUT);
  const [elementStyles, setElementStyles] = useState<ElementStyles | null>(null);
  const [styleApplySignal, setStyleApplySignal] =
    useState<{ patch: Record<string, string>; nonce: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('scan');

  // ── Cover editor state ────────────────────────────────────────────────
  const [coverBgUrl,  setCoverBgUrl]  = useState('');
  const [coverBlocks, setCoverBlocks] = useState<CoverBlock[]>([]);
  const [coverSelId,  setCoverSelId]  = useState<string | null>(null);

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

  // Auto-switch to document view when results arrive or when on cover page (page 0)
  useEffect(() => {
    if (activePage === 0) { setViewMode('document'); return; }
    if (pageResults[activePage]) {
      const hasScanImage = !!(pageImages[activePage - 1]);
      // Always force document view when there's a result but no scan image (text-based pages)
      if (!hasScanImage) { setViewMode('document'); return; }
      if (viewMode === 'scan') setViewMode('compare');
    }
  }, [pageResults, activePage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse logic removed to prevent unwanted sidebar auto-opening

  const hasResult    = !!pageResults[activePage];
  const isRegen      = activePage > 0 && regeneratingPages.has(activePage);
  const isPdf        = fileName.toLowerCase().endsWith('.pdf');

  // ── Dynamic page dimensions ──────────────────────────────────────────
  const activePageDim = activePage > 0
    ? (pageDimensions[activePage - 1] ?? { widthMm: 210, heightMm: 297 })
    : { widthMm: 210, heightMm: 297 }; // covers default to A4

  // ── Navigation ─────────────────────────────────────────────────────────
  const changePage = useCallback((p: number) => {
    setActivePage(p);
    onActivePageChange?.(p);
    setElementStyles(null);
    setStyleApplySignal(null);
    setTimeout(() => {
      document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }, [onActivePageChange]);

  // ── Intersection Observer Sync ─────────────────────────────────────────
  useEffect(() => {
    const elContainer = contentRef.current;
    if (!elContainer) return;

    let timeoutId: any;
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const wrappers = elContainer.querySelectorAll('.page-wrapper');
        let mostVisible = activePageRef.current;
        let maxArea = 0;
        const containerRect = elContainer.getBoundingClientRect();
        
        wrappers.forEach(w => {
          const r = w.getBoundingClientRect();
          const top = Math.max(r.top, containerRect.top);
          const bottom = Math.min(r.bottom, containerRect.bottom);
          if (bottom > top) {
             const area = bottom - top;
             if (area > maxArea) {
               maxArea = area;
               mostVisible = parseInt(w.getAttribute('data-page') || '1', 10);
             }
          }
        });
        
        if (mostVisible !== activePageRef.current) {
          setActivePage(mostVisible);
          onActivePageChange?.(mostVisible);
        }
      }, 50); // debounce scroll
    };

    elContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      elContainer.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
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
      // Ctrl+F: open find bar (intercept even inside editable)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace(true);
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'Escape') {
        // Never interrupt an active extraction with Escape
        if (isProcessing) return;
        if (showFindReplace) { setShowFindReplace(false); return; }
        setSelectionMode(false); setRightDrawer(null); setHandTool(false);
        // Escape from blank cover page → go to page 1
        if (activePage === 0 && !pageResults[0] && totalPages > 0) changePage(1);
        return;
      }
      // Zoom shortcuts
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomOut(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); zoomFit(); return; }
      // Hand tool toggle
      if (e.key === 'h' || e.key === 'H') { setHandTool(h => !h); return; }
      if (selectionMode) return;
      if (e.key === 'ArrowLeft')  changePage(Math.max(navMin, activePage - 1));
      if (e.key === 'ArrowRight') changePage(Math.min(totalPages, activePage + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPages, activePage, selectionMode, changePage, isProcessing, showFindReplace]);

  // ── Element selection (inspector) ──────────────────────────────────────
  const handleElementSelect = (styles: ElementStyles | null) => {
    setElementStyles(styles);
  };
  const handleElementStyleChange = (p: Record<string, string>) => {
    setStyleApplySignal({ patch: p, nonce: Date.now() });
  };
  const handleTagChange = useCallback((newTag: string) => {
    window.dispatchEvent(new CustomEvent('insp-tag-change', { detail: { newTag, nonce: Date.now() } }));
  }, []);

  // ── Preserve crop state without auto-opening inspector ───────────────
  const pendingCropRef = useRef<CustomEventInit | null>(null);
  useEffect(() => {
    const onCropState = (e: Event) => {
      const detail = (e as CustomEvent).detail as { active: boolean };
      if (detail.active) {
        pendingCropRef.current = { detail };   // stash so we can re-fire after mount
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


  // ── Cover page handler ───────────────────────────────────────────────
  const handleApplyCover = useCallback((coverHtml: string) => {
    onEdit(0, coverHtml);
    setViewMode('document');
  }, [onEdit]);

  // Parse cover HTML → controlled state whenever pageResults[0] changes
  useEffect(() => {
    if (!pageResults[0]) { setCoverBlocks([]); setCoverBgUrl(''); return; }
    const { bgUrl, blocks } = parseCover(pageResults[0]);
    setCoverBgUrl(bgUrl);
    setCoverBlocks(blocks);
  }, [pageResults[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-close 'cover' drawer when leaving cover or back cover page
  useEffect(() => {
    if (activePage !== 0 && activePage !== -1 && rightDrawer === 'cover') {
      setRightDrawer(null);
    }
  }, [activePage, rightDrawer]); // eslint-disable-line react-hooks/exhaustive-deps

  // saveCover — serialise and persist cover HTML
  const saveCover = useCallback((newBlocks: CoverBlock[]) => {
    onEdit(0, serialiseCover(coverBgUrl, newBlocks));
  }, [coverBgUrl, onEdit]);

  // Cover block handlers
  const handleCoverMove = useCallback((id: string, x: number, y: number) => {
    setCoverBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, x, y } : b);
      saveCover(next);
      return next;
    });
  }, [saveCover]);

  const handleCoverTextChange = useCallback((id: string, text: string) => {
    setCoverBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, text } : b);
      saveCover(next);
      return next;
    });
  }, [saveCover]);

  const handleCoverUpdate = useCallback((id: string, patch: Partial<CoverBlock>) => {
    setCoverBlocks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, ...patch } : b);
      saveCover(next);
      return next;
    });
  }, [saveCover]);

  const handleCoverAdd = useCallback(() => {
    const id = `blk-${Date.now()}`;
    const nb: CoverBlock = { id, text: 'New text', x: 20, y: 50, w: 60, color: '#ffffff', size: 1.4, weight: 700, italic: false, align: 'center', shadow: true };
    setCoverBlocks(prev => {
      const next = [...prev, nb];
      saveCover(next);
      return next;
    });
    setCoverSelId(id);
  }, [saveCover]);

  const handleCoverDelete = useCallback((id: string) => {
    setCoverBlocks(prev => {
      const next = prev.filter(b => b.id !== id);
      saveCover(next);
      return next;
    });
    setCoverSelId(s => s === id ? null : s);
  }, [saveCover]);

  // ── Drawer title ──────────────────────────────────────────────────────
  const drawerTitle = rightDrawer === 'agent'      ? 'AI Agent'
    : rightDrawer === 'inspector'  ? 'Inspector'
    : rightDrawer === 'cover'      ? 'Cover Editor'
    : rightDrawer === 'homophone'  ? 'Amharic OCR Corrections'
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
            onClick={onClear}
            title="Back to home"
          >
            <Home size={16} />
          </button>
          <div className="es-header-sep" />
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
        {(totalPages > 0 || hasCover) && (
          <div className="es-page-nav">
            <button className="es-nav-btn" onClick={() => changePage(Math.max(navMin, activePage - 1))} disabled={activePage <= navMin}>
              <ChevronLeft size={14} />
            </button>
            <span className="es-page-ct">
              <strong>{activePage === -1 ? 'Back' : activePage === 0 ? 'Cover' : activePage}</strong>
              {totalPages > 0 && <> / {totalPages}</>}
            </span>
            <button className="es-nav-btn" onClick={() => changePage(Math.min(totalPages, activePage + 1))} disabled={activePage >= totalPages}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Right cluster */}
        <div className="es-header-right">
          {/* Tool toggles — selection + agent always visible */}
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
          <button
            className={`es-icon-btn${rightDrawer === 'homophone' ? ' es-icon-btn--active' : ''}`}
            onClick={() => toggleDrawer('homophone')}
            title="Amharic OCR corrections"
            style={{ fontFamily: "'Noto Serif Ethiopic', serif", fontSize: 13, fontWeight: 700, letterSpacing: 0 }}
          >
            ሀ
          </button>
          <div className="es-header-sep es-hide-mobile" />

          {/* ── Find & Replace ───────────────────────── */}
          <button
            className={`es-icon-btn es-hide-mobile${showFindReplace ? ' es-icon-btn--active' : ''}`}
            onClick={() => setShowFindReplace(f => !f)}
            title="Find & Replace (Ctrl+F)"
          >
            <Search size={14} />
          </button>

          {/* ── Undo / Redo — hide on mobile ────────────── */}
          <button className="es-icon-btn es-hide-mobile" onClick={handleUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={14} />
          </button>
          <button className="es-icon-btn es-hide-mobile" onClick={handleRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 size={14} />
          </button>

          {/* ── Zoom & Pan — hand only on mobile ─────────── */}
          <button
            className={`es-icon-btn es-hide-mobile${handTool ? ' es-icon-btn--active' : ''}`}
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
          <div className="es-hide-mobile"><SettingsPanel /></div>
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

      {/* ── Find & Replace bar ────────────────────────────────────────── */}
      {showFindReplace && (
        <FindReplaceBar
          pageResults={pageResults}
          activePage={activePage}
          onEdit={onEdit}
          onChangePage={changePage}
          onClose={() => setShowFindReplace(false)}
        />
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
              onDoubleClick={page => {
                changePage(page);
                setRightDrawer(page === 0 ? 'cover' : 'inspector');
              }}
              onReorder={onReorderPages}
              onInsert={onInsertPage}
              onDelete={onDeletePage}
            />
          </aside>
        )}
        {/* Overlay scrim for tablet sidebar */}
        {thumbsOpen && isTablet && (
          <div className="es-sidebar-scrim" onClick={() => setThumbsOpen(false)} />
        )}

        {/* ── Main content area ───────────────────────────────────────── */}
        <main className="es-main" style={{ position: 'relative' }}>
          {/* View mode tabs — hidden on cover page (page 0 has no scan) */}
          {activePage !== 0 && <ViewModeTabs mode={viewMode} onChange={setViewMode} hasResults={hasResult} />}

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
            {/* ── 🚧 CONTINUOUS SCROLL VIEW 🚧 ── */}
            <div className="flex flex-col gap-12 pb-32 items-center w-full min-h-screen">
              
              {/* ── Cover Page (0) ── */}
              {((activePage === 0 && !hasResult) || hasCover) && (
                <div data-page="0" className="page-wrapper w-full flex justify-center scroll-mt-6" id="page-0">
                  {hasCover ? (
                    <div className="es-doc-wrap" style={{ position: 'relative' }}>
                      <CoverEditor
                        bgUrl={coverBgUrl}
                        blocks={coverBlocks}
                        selId={coverSelId}
                        onSelect={setCoverSelId}
                        onMove={handleCoverMove}
                        onTextChange={handleCoverTextChange}
                      />
                      <button
                        style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 30, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(4px)', letterSpacing: '0.06em' }}
                        onClick={() => { onEdit(0, ''); }}
                        title="New cover background"
                      >↺ New Cover</button>
                    </div>
                  ) : (
                    <div className="es-doc-wrap" style={{ position: 'relative' }}>
                      <div style={{ width: `${activePageDim.widthMm}mm`, minHeight: `${activePageDim.heightMm}mm`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', background: 'var(--t-surface)', borderRadius: '2px', boxShadow: '0 2px 12px rgba(0,0,0,.15)', color: 'var(--t-text3)', fontSize: '0.85rem' }}>
                        <Sparkles size={28} style={{ opacity: 0.35 }} />
                        <span>Use the panel on the right to generate your cover</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Document Pages (1..N) ── */}
              {pageImages.map((img, i) => {
                const p = i + 1;
                const pHasResult = !!pageResults[p];
                const pIsRegen = regeneratingPages.has(p);
                const currentHtml = pageResults[p] ?? '';
                const dim = pageDimensions[i] ?? { widthMm: 210, heightMm: 297 };

                // Virtualisation: only mount heavy components for pages near the viewport.
                // Pages outside the ±3 window get a lightweight height-preserving skeleton
                // so the scroll position and spy calculations stay accurate.
                const isNear = Math.abs(p - activePage) <= 3;

                return (
                  <div data-page={p.toString()} key={p} className="page-wrapper w-full flex justify-center scroll-mt-6" id={`page-${p}`}>
                    {!isNear ? (
                      // ── Skeleton placeholder keeps correct page height in the scroll column ──
                      <div
                        style={{
                          width: `${dim.widthMm}mm`,
                          height: `${dim.heightMm}mm`,
                          background: 'var(--t-surface)',
                          borderRadius: 2,
                          boxShadow: '0 1px 4px rgba(0,0,0,.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--t-text3)',
                          fontSize: '0.75rem',
                        }}
                      >
                        {p}
                      </div>
                    ) : viewMode === 'compare' && pHasResult ? (
                      <SplitPageView
                        pageNumber={p}
                        pageImage={img}
                        html={currentHtml}
                        imageQuality={imageQuality}
                        isRegenerating={pIsRegen}
                        styleOverride={layoutToStyle(pageLayout)}
                        selectionMode={selectionMode}
                        onElementSelect={handleElementSelect}
                        onExitSelectionMode={() => setSelectionMode(false)}
                        styleApply={activePage === p ? styleApplySignal : null}
                        onEdit={onEdit}
                        onError={onError}
                        docHandle={activePage === p ? docHandleRef : undefined}
                        zoom={zoom}
                      />
                    ) : viewMode === 'document' && pHasResult ? (
                      <div
                        className="es-doc-wrap"
                        onDoubleClick={e => {
                          if (e.target === e.currentTarget) { setSelectionMode(true); setRightDrawer('inspector'); }
                        }}
                      >
                        <DocumentPage
                          pageNumber={p}
                          html={currentHtml}
                          pageWidth={`${dim.widthMm}mm`}
                          pageHeight={`${dim.heightMm}mm`}
                          styleOverride={layoutToStyle(pageLayout)}
                          selectionMode={selectionMode}
                          onElementSelect={handleElementSelect}
                          onExitSelectionMode={() => setSelectionMode(false)}
                          styleApply={activePage === p ? styleApplySignal : null}
                          onEdit={onEdit}
                          docHandle={activePage === p ? docHandleRef : undefined}
                          zoom={zoom}
                          margins={{ t: pageLayout.marginT, r: pageLayout.marginR, b: pageLayout.marginB, l: pageLayout.marginL }}
                        />
                      </div>
                    ) : (viewMode === 'scan' || !pHasResult) ? (
                      <div className="es-scan-wrap">
                        {img ? (
                          <>
                            <img
                              src={img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`}
                              alt={`Page ${p} scan`}
                              className="es-scan-img"
                              loading="lazy"
                            />
                            {pIsRegen && (
                              <div className="scan-overlay"><span className="scan-overlay-label">Extracting page {p}…</span></div>
                            )}
                          </>
                        ) : (
                          <div className="es-empty" style={{ flexDirection: 'column', gap: '0.5rem', width: '100%', minHeight: '800px' }}>
                            <Loader2 size={32} className="animate-spin text-indigo-500 mb-2" />
                            <span className="text-slate-400 font-medium">Loading high-res scan...</span>
                          </div>
                        )}
                        {!pHasResult && !pIsRegen && (
                          <div className="es-unextracted-bar" style={{ marginTop: '1rem' }}>
                            <span>Page {p} — not yet extracted</span>
                            {img ? (
                              <button
                                className="bt-btn bt-btn--primary"
                                onClick={() => onRegenerate(p)}
                                disabled={pIsRegen || isProcessing}
                              >
                                {pIsRegen ? <Loader2 size={12} className="animate-spin" /> : <Layers size={12} />}
                                <span>{pIsRegen ? 'Extracting…' : 'Extract this page'}</span>
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {/* ── Back Cover (-1) ── */}
              {hasBackCover && (
                <div data-page="-1" className="page-wrapper w-full flex justify-center scroll-mt-6" id="page--1">
                  <div className="es-doc-wrap" style={{ position: 'relative' }}>
                    <div className="ce-canvas" style={{ backgroundImage: `url('${backBgUrl}')` }} />
                    <button
                      style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 30, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(4px)', letterSpacing: '0.06em' }}
                      onClick={() => { onEdit(-1, ''); }}
                      title="Remove back cover"
                    >✕ Remove</button>
                  </div>
                </div>
              )}
            </div>
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
            isSaving={isSaving}
            imageQuality={imageQuality}
            processingStatus={processingStatus}
            hasImage={activePage > 0 ? !!pageImages[activePage - 1] : false}
            onPrev={() => changePage(Math.max(navMin, activePage - 1))}
            onNext={() => changePage(Math.min(totalPages, activePage + 1))}
            onExtract={onExtract}
            onForceExtract={onForceExtract}
            onRegenerate={() => onRegenerate(activePage)}
            onDeletePage={() => onDeletePage(activePage)}
            onSave={onSave}
            onShowLibrary={onShowLibrary}
            onDownloadPDF={onDownloadPDF}
            onImageQualityChange={onImageQualityChange}
            onCoverPage={() => changePage(0)}
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
              fileName={fileName}
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
          {rightDrawer === 'cover' && (
            <CoverEditorPanel
              hasCover={hasCover}
              hasBackCover={hasBackCover}
              bgUrl={coverBgUrl}
              backBgUrl={backBgUrl}
              activeCoverSide={activePage === -1 ? 'back' : 'front'}
              blocks={coverBlocks}
              selId={coverSelId}
              onSelect={setCoverSelId}
              onUpdate={handleCoverUpdate}
              onAdd={handleCoverAdd}
              onDelete={handleCoverDelete}
              onApply={handleApplyCover}
              onApplyBack={html => onEdit(-1, html)}
              onError={onError}
            />
          )}
          {rightDrawer === 'homophone' && (
            <HomophonePanel
              pageResults={pageResults}
              activePage={activePage}
              onEdit={onEdit}
            />
          )}
        </RightDrawer>

      </div>

    </div>
  );
}
