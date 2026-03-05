import { useState, useCallback, useEffect } from 'react';

import HomeScreen    from './components/HomeScreen';
import EditorShell   from './components/editor/EditorShell';
import LibraryModal  from './components/LibraryModal';
import FloatingChat  from './components/FloatingChat';
import Toast, { type ToastMessage } from './components/Toast';
import AuthScreen    from './components/AuthScreen';

import { pdfToImages, imageFileToBase64 } from './services/pdfService';
import { extractPageHTML, type ImageQuality } from './services/geminiService';
import { saveDocument, initStorage, type SavedDocument } from './services/storageService';
import { authClient } from './lib/neonAuth';

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
  // ── Auth state ─────────────────────────────────────────────────────────
  const [neonUser,     setNeonUser]     = useState<NeonUser | null>(null);
  const [authLoading,  setAuthLoading]  = useState(true);

  const syncAuthState = useCallback(async () => {
    const result = await (authClient as any).getSession();
    const u = result?.data?.user ?? null;
    setNeonUser(u);
    initStorage(u?.id ?? null);
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
          prevHTML = html;
          setPageResults((prev) => ({ ...prev, [p]: html }));
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
  const handleClear = () => {
    setFileName('');
    setPageImages([]);
    setPageResults({});
    setFromPage(1);
    setToPage(1);
    setProcessingStatus('');
  };

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

  // ── Upload / landing screen ──────────────────────────────────────────────
  if (!hasFile) {
    return (
      <>
        <HomeScreen
          onFile={handleFile}
          onLoadDoc={handleLoad}
          isProcessing={isProcessing}
          processingStatus={processingStatus}
        />
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-[350px] pointer-events-none">
          {toast && <Toast key={toast.id} toast={toast} onDismiss={() => setToast(null)} />}
        </div>
        <FloatingChat />
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
        onShowLibrary={() => setShowLibrary(true)}
        onDownloadPDF={handleDownloadPDF}
        onImageQualityChange={setImageQuality}
        onActivePageChange={setActivePage}
        onSignOut={handleSignOut}
        onError={(msg) => setToast({ id: Date.now().toString(), message: msg, variant: 'error' })}
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
        {toast && <Toast key={toast.id} toast={toast} onDismiss={() => setToast(null)} />}
      </div>

      {/* Floating AI chat — with page edit context */}
      <FloatingChat
        user={neonUser}
        editContext={pageResults[activePage] ? {
          pageNumber: activePage,
          html:       pageResults[activePage],
          image:      pageImages[activePage - 1] ?? '',
          onEdit:     (html) => handleEdit(activePage, html),
        } : undefined}
      />
    </div>
  );
}
