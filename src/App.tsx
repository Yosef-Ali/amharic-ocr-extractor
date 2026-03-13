import { useState, useCallback, useEffect, useRef } from 'react';

import HomeScreen    from './components/HomeScreen';
import EditorShell   from './components/editor/EditorShell';
import LibraryModal  from './components/LibraryModal';
import AdminPanel    from './components/AdminPanel';
import Toast, { type ToastMessage } from './components/Toast';
import AuthScreen    from './components/AuthScreen';

import { pdfToImages, imageFileToBase64 } from './services/pdfService';
import { extractPageHTML, autoFillImagePlaceholders, type ImageQuality } from './services/geminiService';
import { saveDocument, initStorage, type SavedDocument } from './services/storageService';
import { CanvasExecutor } from './services/canvasExecutor';
import { WsBridge }      from './services/wsBridge';
import { ensureUsersTable, upsertUser, checkUserBlocked } from './services/adminService';
import { authClient } from './lib/neonAuth';
import { useTheme } from './hooks/useTheme';

type NeonUser = { id: string; email?: string; name?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const is429Error = (err: unknown): boolean => {
  const error = err as Error & { status?: number };
  return !!(
    error?.message?.includes('429') ||
    error?.status === 429 ||
    error?.message?.toLowerCase().includes('resource_exhausted')
  );
};

const RATE_LIMIT_ERROR_HTML = `
  <div style="border:2px solid #ef4444;border-radius:8px;padding:1.5rem;text-align:center;background:#fef2f2;margin:2rem 0;">
    <p style="color:#dc2626;font-weight:700;font-size:1rem;margin:0 0 0.5rem;">
      ⚠️ Rate Limit Reached (429)
    </p>
    <p style="color:#991b1b;font-size:0.875rem;margin:0;">
      You've hit the API rate limit. Please wait a minute, then click <strong>Extract</strong> to continue.
    </p>
  </div>
`.trim();

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  // ── Theme ───────────────────────────────────────────────────────────────
  const { theme, toggleTheme } = useTheme();

  // ── Auth state ─────────────────────────────────────────────────────────
  const [neonUser,     setNeonUser]     = useState<NeonUser | null>(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [isBlocked,    setIsBlocked]    = useState(false);

  const syncAuthState = useCallback(async () => {
    const result = await (authClient as any).getSession();
    const u = result?.data?.user ?? null;
    setNeonUser(u);
    initStorage(u?.id ?? null);
    if (u?.id && u?.email) {
      try {
        await ensureUsersTable();
        await upsertUser(u.id, u.email, u.name);
        const blocked = await checkUserBlocked(u.id);
        setIsBlocked(blocked);
      } catch (e) {
        console.error(e);
      }
    }
    return u;
  }, []);

  useEffect(() => {
    syncAuthState().then(() => setAuthLoading(false));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = useCallback(async () => {
    await (authClient as any).signOut();
    setNeonUser(null);
    initStorage(null);
  }, []);

  const handleAuthSuccess = useCallback(async () => {
    await syncAuthState();
  }, [syncAuthState]);

  // ── Document state ──────────────────────────────────────────────────────
  const [fileName,         setFileName]         = useState('');
  const [pageImages,       setPageImages]       = useState<string[]>([]);
  const [pageResults,      setPageResults]      = useState<Record<number, string>>({});
  const [fromPage,         setFromPage]         = useState(1);
  const [toPage,           setToPage]           = useState(1);
  const [isProcessing,     setIsProcessing]     = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [isPdfExporting,   setIsPdfExporting]   = useState(false);
  const [showLibrary,      setShowLibrary]      = useState(false);
  const [toast,            setToast]            = useState<ToastMessage | null>(null);
  const [imageQuality,     setImageQuality]     = useState<ImageQuality>('fast');
  const [regeneratingPages, setRegeneratingPages] = useState<Set<number>>(new Set());
  const [activePage,       setActivePage]       = useState(1);
  const [showAdmin,        setShowAdmin]        = useState(false);

  // ── Canvas executor — stable ref so FloatingChat doesn't re-mount ──────
  const pageResultsRef = useRef(pageResults);
  const pageImagesRef  = useRef(pageImages);
  const activePageRef  = useRef(activePage);
  useEffect(() => { pageResultsRef.current = pageResults; }, [pageResults]);
  useEffect(() => { pageImagesRef.current  = pageImages;  }, [pageImages]);
  useEffect(() => { activePageRef.current  = activePage;  }, [activePage]);

  const executorRef  = useRef<CanvasExecutor | null>(null);
  const wsBridgeRef  = useRef<WsBridge | null>(null);
  const [mcpConnected, setMcpConnected] = useState(false);

  if (!executorRef.current) {
    executorRef.current = new CanvasExecutor({
      getPageHTML:     (n) => pageResultsRef.current[n] ?? '',
      getPageImage:    (n) => pageImagesRef.current[n - 1] ?? '',
      getActivePage:   ()  => activePageRef.current,
      getTotalPages:   ()  => pageImagesRef.current.length,
      onEdit:          (n, html) => setPageResults(prev => ({ ...prev, [n]: html })),
      onSetActivePage: (n) => setActivePage(n),
      captureScreenshot: async (n) => {
        const el = document.getElementById(`page-${n}`);
        if (!el) throw new Error(`Page ${n} element not found`);
        const html2canvasModule = await import('html2canvas');
        const html2canvas = (html2canvasModule.default ?? html2canvasModule) as (el: HTMLElement, opts?: object) => Promise<HTMLCanvasElement>;
        const canvas = await html2canvas(el, { scale: 1, useCORS: true, logging: false });
        return canvas.toDataURL('image/jpeg', 0.85);
      },
      extractPage: async (n, force = false) => {
        const existing = pageResultsRef.current[n];
        if (existing && !force) {
          return JSON.stringify({ success: true, pageNumber: n, cached: true });
        }
        const img = pageImagesRef.current[n - 1];
        if (!img) return JSON.stringify({ error: `No image for page ${n}. Upload a document first.` });
        const prevHTML = pageResultsRef.current[n - 1];

        // Pass 1: OCR → structured HTML (may contain .ai-image-placeholder elements)
        const rawHtml = await extractPageHTML(img, prevHTML);

        // Pass 2: auto-detect image regions in original scan → crop → replace placeholders
        const { html: finalHtml, filled } = await autoFillImagePlaceholders(rawHtml, img);
        const remaining = (finalHtml.match(/ai-image-placeholder/g) ?? []).length;

        setPageResults(prev => ({ ...prev, [n]: finalHtml }));
        return JSON.stringify({ success: true, pageNumber: n, extracted: true, imagesFound: filled, placeholdersRemaining: remaining });
      },
      onExtractStart: (n) => {
        setActivePage(n);
        setRegeneratingPages(prev => { const s = new Set(prev); s.add(n); return s; });
      },
      onExtractEnd: (n) => {
        setRegeneratingPages(prev => { const s = new Set(prev); s.delete(n); return s; });
      },
    });
  }

  // Start WsBridge once — connects to MCP relay at ws://localhost:3001
  useEffect(() => {
    if (wsBridgeRef.current || !executorRef.current) return;
    const bridge = new WsBridge(executorRef.current);
    wsBridgeRef.current = bridge;
    const unsub = bridge.onStatus(setMcpConnected);
    return () => { unsub(); bridge.stop(); wsBridgeRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Admin gate — only show to the exact email set in VITE_ADMIN_EMAIL
  const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim();
  const isAdmin    = !!adminEmail && neonUser?.email?.toLowerCase() === adminEmail.toLowerCase();

  const hasFile = !!fileName;

  // -------------------------------------------------------------------------
  // File ingestion
  // -------------------------------------------------------------------------
  const handleFile = async (file: File) => {
    setPageResults({});
    setFileName(file.name);
    setProcessingStatus('Reading file…');
    setIsProcessing(true);

    try {
      let images: string[];
      if (file.type === 'application/pdf') {
        images = await pdfToImages(file);
      } else {
        images = [await imageFileToBase64(file)];
      }
      setPageImages(images);
      setFromPage(1);
      setToPage(images.length);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // -------------------------------------------------------------------------
  // Core OCR processing loop
  // -------------------------------------------------------------------------
  const processPages = useCallback(
    async (force = false) => {
      setIsProcessing(true);
      let prevHTML: string | undefined;

      for (let p = fromPage; p <= toPage; p++) {
        if (!force && pageResults[p]) {
          prevHTML = pageResults[p];
          continue;
        }

        setProcessingStatus(`Extracting page ${p} of ${toPage}…`);

        try {
          const html = await extractPageHTML(pageImages[p - 1], prevHTML);

          // Auto-fill image placeholders: detect, crop, and replace from original scan
          setProcessingStatus(`Page ${p}: placing images…`);
          const { html: finalHtml } = await autoFillImagePlaceholders(
            html,
            pageImages[p - 1],
            (msg) => setProcessingStatus(`Page ${p}: ${msg}`),
          );

          prevHTML = finalHtml;
          setPageResults((prev) => ({ ...prev, [p]: finalHtml }));
        } catch (err: unknown) {
          const error = err as Error & { status?: number };
          const errHtml = is429Error(err)
            ? RATE_LIMIT_ERROR_HTML
            : `<p style="color:red;text-align:center;font-weight:bold;">
                ⚠️ Error on page ${p}: ${error?.message ?? 'Unknown error'}
              </p>`;

          setPageResults((prev) => ({ ...prev, [p]: errHtml }));
          if (is429Error(err)) { setProcessingStatus('Rate limit hit — paused.'); break; }
        }

        if (p < toPage) {
          for (let s = 5; s > 0; s--) {
            setProcessingStatus(`Page ${p} done. Waiting ${s}s before next page…`);
            await sleep(1000);
          }
        }
      }

      setIsProcessing(false);
      setProcessingStatus('');
    },
    [fromPage, toPage, pageImages, pageResults],
  );

  // -------------------------------------------------------------------------
  // Edit handler — persist manual edits into state
  // -------------------------------------------------------------------------
  const handleEdit = (pageNumber: number, html: string) => {
    setPageResults((prev) => ({ ...prev, [pageNumber]: html }));
  };

  // -------------------------------------------------------------------------
  // Re-extract a single page (independent of the global extract loop)
  // -------------------------------------------------------------------------
  const regenerateSinglePage = useCallback(async (pageNumber: number) => {
    setRegeneratingPages((prev) => { const next = new Set(prev); next.add(pageNumber); return next; });
    const prevHTML = pageNumber > 1 ? pageResults[pageNumber - 1] : undefined;

    try {
      const html = await extractPageHTML(pageImages[pageNumber - 1], prevHTML);
      setPageResults((prev) => ({ ...prev, [pageNumber]: html }));
      setToast({ id: Date.now().toString(), message: `Page ${pageNumber} re-extracted.`, variant: 'success' });
    } catch (err: unknown) {
      const error = err as Error & { status?: number };
      const errHtml = is429Error(err)
        ? RATE_LIMIT_ERROR_HTML
        : `<p style="color:red;text-align:center;font-weight:bold;">⚠️ Error on page ${pageNumber}: ${error?.message ?? 'Unknown error'}</p>`;
      setPageResults((prev) => ({ ...prev, [pageNumber]: errHtml }));
    } finally {
      setRegeneratingPages((prev) => {
        const next = new Set(prev);
        next.delete(pageNumber);
        return next;
      });
    }
  }, [pageImages, pageResults]);

  // -------------------------------------------------------------------------
  // Delete a single page from results
  // -------------------------------------------------------------------------
  const handleDeletePage = useCallback((pageNumber: number) => {
    setPageResults((prev) => {
      const next = { ...prev };
      delete next[pageNumber];
      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Save to library
  // -------------------------------------------------------------------------
  const handleSave = async () => {
    await saveDocument(fileName, pageImages, pageResults);
    setToast({ id: Date.now().toString(), message: `"${fileName}" saved to library.`, variant: 'success' });
  };

  // -------------------------------------------------------------------------
  // Load from library
  // -------------------------------------------------------------------------
  const handleLoad = (doc: SavedDocument) => {
    setFileName(doc.name);
    setPageImages(doc.pageImages);
    setPageResults(doc.pageResults);
    setFromPage(1);
    setToPage(doc.pageCount);
  };

  // -------------------------------------------------------------------------
  // Download PDF — uses the hidden #pdf-export-container to render all pages
  // -------------------------------------------------------------------------
  const handleDownloadPDF = async () => {
    setIsPdfExporting(true);
    try {
      await document.fonts.ready;

      const { jsPDF }         = await import('jspdf');
      const html2canvasModule = await import('html2canvas');
      const html2canvas: any  = html2canvasModule.default ?? html2canvasModule;

      // Query the hidden off-screen container (contains all pages as static divs)
      const pages = document.querySelectorAll('#pdf-export-container .document-page');
      if (pages.length === 0) { setIsPdfExporting(false); return; }

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        const saved  = {
          minHeight: pageEl.style.minHeight,
          maxHeight: pageEl.style.maxHeight,
          overflow:  pageEl.style.overflow,
          boxShadow: pageEl.style.boxShadow,
          transform: pageEl.style.transform,
        };

        pageEl.style.minHeight = '297mm';
        pageEl.style.maxHeight = '297mm';
        pageEl.style.overflow  = 'hidden';
        pageEl.style.boxShadow = 'none';
        pageEl.style.transform = 'none';

        const canvas = await html2canvas(pageEl as any, {
          scale:   2,
          useCORS: true,
          logging: false,
          width:   pageEl.scrollWidth,
          height:  Math.round(297 * (96 / 25.4)),
        });

        Object.assign(pageEl.style, saved);

        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, 210, 297);
      }

      pdf.save(`${fileName.replace(/\.[^.]+$/, '') || 'document'}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
      setToast({ id: Date.now().toString(), message: 'PDF export failed. Check console for details.', variant: 'error' });
    } finally {
      setIsPdfExporting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Clear everything — back to upload screen
  // -------------------------------------------------------------------------
  const handleClear = useCallback(() => {
    setFileName('');
    setPageImages([]);
    setPageResults({});
    setFromPage(1);
    setToPage(1);
    setProcessingStatus('');
  }, []);

  const handleShowAdmin   = useCallback(() => setShowAdmin(true), []);
  const handleShowLibrary = useCallback(() => setShowLibrary(true), []);
  const handleError       = useCallback((msg: string) => setToast({ id: Date.now().toString(), message: msg, variant: 'error' }), []);
  const handleDismissToast = useCallback(() => setToast(null), []);

  // -------------------------------------------------------------------------
  // Clamp page range inputs
  // -------------------------------------------------------------------------

  // =========================================================================
  // ── Render ─────────────────────────────────────────────────────────────
  // =========================================================================

  // ── Auth gates ────────────────────────────────────────────────────────
  if (authLoading) {
    return <div className="auth-splash"><div className="auth-splash-spinner" /></div>;
  }
  if (!neonUser) {
    return <AuthScreen onSuccess={handleAuthSuccess} />;
  }
  if (isBlocked) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', gap:'1rem', background:'var(--t-bg)', color:'var(--t-text)' }}>
        <div style={{ fontSize:'2.5rem' }}>🚫</div>
        <h2 style={{ fontSize:'1.25rem', fontWeight:700, margin:0 }}>Account Suspended</h2>
        <p style={{ color:'var(--t-text3)', fontSize:'0.875rem', margin:0, textAlign:'center', maxWidth:'320px' }}>
          Your account has been suspended by an administrator.<br />Please contact support if you believe this is a mistake.
        </p>
        <button
          style={{ marginTop:'0.5rem', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', background:'#f1f5f9', color:'#64748b', fontSize:'0.8rem', cursor:'pointer' }}
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </div>
    );
  }

  // ── Upload / landing screen ──────────────────────────────────────────────
  if (!hasFile) {
    return (
      <>
        <HomeScreen
          onFile={handleFile}
          onLoadDoc={handleLoad}
          isProcessing={isProcessing}
          processingStatus={processingStatus}
          theme={theme}
          onToggleTheme={toggleTheme}
          user={neonUser}
          onSignOut={handleSignOut}
          isAdmin={isAdmin}
          onOpenAdmin={handleShowAdmin}
        />
        {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-[350px] pointer-events-none">
          {toast && <Toast key={toast.id} toast={toast} onDismiss={handleDismissToast} />}
        </div>
      </>
    );
  }

  // ── Full editor shell (file is loaded) ───────────────────────────────────
  return (
    <div style={{ position: 'relative' }}>

      {/* ── Full-viewport editor layout ── */}
      <EditorShell
        fileName={fileName}
        pageImages={pageImages}
        pageResults={pageResults}
        imageQuality={imageQuality}
        isProcessing={isProcessing}
        processingStatus={processingStatus}
        regeneratingPages={regeneratingPages}
        isPdfExporting={isPdfExporting}
        user={neonUser}
        onEdit={handleEdit}
        onRegenerate={regenerateSinglePage}
        onDeletePage={handleDeletePage}
        onExtract={() => processPages(false)}
        onForceExtract={() => processPages(true)}
        onSave={handleSave}
        onClear={handleClear}
        onShowLibrary={handleShowLibrary}
        onDownloadPDF={handleDownloadPDF}
        onImageQualityChange={setImageQuality}
        onActivePageChange={setActivePage}
        canvasExecutor={executorRef.current ?? undefined}
        mcpConnected={mcpConnected}
        onSignOut={handleSignOut}
        theme={theme}
        onToggleTheme={toggleTheme}
        onError={handleError}
      />

      {/* ── Hidden PDF export container ─────────────────────────────────
          All extracted pages rendered as static divs off-screen.
          handleDownloadPDF() queries #pdf-export-container .document-page
          so ALL pages are included, not just the currently visible one.
      ── */}
      <div
        id="pdf-export-container"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-99999px',
          top: 0,
          width: '210mm',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        {Object.entries(pageResults)
          .sort(([a], [b]) => +a - +b)
          .map(([page, html]) => (
            <div
              key={page}
              className="document-page"
              style={{
                width:      '210mm',
                minHeight:  '297mm',
                padding:    '12mm 16mm',
                fontFamily: "'Noto Serif Ethiopic', 'Noto Sans Ethiopic', serif",
                fontSize:   '1rem',
                boxSizing:  'border-box',
                lineHeight: '1.6',
                background: 'white',
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ))}
      </div>

      {/* Library modal */}
      {showLibrary && (
        <LibraryModal
          onLoad={handleLoad}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-[350px] pointer-events-none">
        {toast && <Toast key={toast.id} toast={toast} onDismiss={handleDismissToast} />}
      </div>

    </div>
  );
}
