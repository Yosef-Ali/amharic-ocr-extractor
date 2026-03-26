import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';

import HomeScreen    from './components/HomeScreen';
const EditorShell = lazy(() => import('./components/editor/EditorShell'));
const AdminPanel  = lazy(() => import('./components/AdminPanel'));
import LibraryModal  from './components/LibraryModal';
import Toast, { type ToastMessage } from './components/Toast';
import AuthScreen    from './components/AuthScreen';

import { pdfToImages, imageFileToBase64, detectFileType, docxToHtmlPages, textToHtmlPages, type PageDimension } from './services/pdfService';
import { extractPageHTML, autoFillImagePlaceholders, type ImageQuality } from './services/geminiService';
import { saveDocument, initStorage, initializeSchema, loadDocumentContent, loadDocumentPageImage, QuotaExceededError, type SavedDocument } from './services/storageService';
import { buildDocumentExport, saveDocumentExport, downloadAsText, downloadAsDocx } from './services/exportService';
import { AI_DATA_EXPORT_KEY } from './components/editor/SettingsPanel';
import { Loader2 } from 'lucide-react';
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
  <div style="border:2px solid #ef4444;border-radius:16px;padding:2rem;text-align:center;background:#fef2f2;margin:3rem auto;max-width:420px;">
    <div style="font-size:2rem;margin-bottom:0.5rem;">⏳</div>
    <p style="color:#dc2626;font-weight:800;font-size:1.1rem;margin:0 0 0.5rem;">
      Rate Limit Reached
    </p>
    <p style="color:#991b1b;font-size:0.85rem;margin:0 0 1rem;line-height:1.5;">
      The API needs a moment to cool down. Wait about 60 seconds, then use the <strong>↻ Re-extract</strong> button in the toolbar above.
    </p>
    <div style="display:inline-block;padding:6px 16px;background:#fee2e2;border-radius:8px;font-size:0.75rem;color:#b91c1c;font-weight:600;">
      Tip: Use <strong>Fast</strong> mode for fewer rate limits
    </div>
  </div>
`.trim();

function buildErrorHTML(page: number, message: string): string {
  return `
    <div style="border:2px solid #f59e0b;border-radius:16px;padding:2rem;text-align:center;background:#fffbeb;margin:3rem auto;max-width:420px;">
      <div style="font-size:2rem;margin-bottom:0.5rem;">⚠️</div>
      <p style="color:#92400e;font-weight:800;font-size:1.1rem;margin:0 0 0.5rem;">
        Extraction Failed — Page ${page}
      </p>
      <p style="color:#78350f;font-size:0.82rem;margin:0 0 1rem;line-height:1.5;">
        ${message.length > 120 ? message.slice(0, 120) + '…' : message}
      </p>
      <p style="color:#92400e;font-size:0.78rem;margin:0;font-weight:600;">
        Use the <strong>↻ Re-extract</strong> button to try again
      </p>
    </div>
  `.trim();
}

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
  const [isRestoringSession, setIsRestoringSession] = useState(() => !!localStorage.getItem('aoe_active_doc'));

  const syncAuthState = useCallback(async () => {
    const result = await (authClient as any).getSession();
    const u = result?.data?.user ?? null;
    setNeonUser(u);
    initStorage(u?.id ?? null);
    if (u?.id) initializeSchema().catch(() => {/* best-effort */});
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

  // ── Session Restore ──────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;

    const activeDocId = localStorage.getItem('aoe_active_doc');
    if (!activeDocId || !neonUser) {
      if (isRestoringSession) setIsRestoringSession(false);
      return;
    }
    
    let isCancelled = false;
    const restoreSession = async () => {
      try {
        const fullDoc = await loadDocumentContent(activeDocId);
        if (isCancelled) return;
        setActiveDocId(activeDocId);
        setFileName(fullDoc.name);
        setPageImages(fullDoc.pageImages);
        setPageResults(fullDoc.pageResults);
        setPageDimensions(fullDoc.pageImages.map(() => ({ widthMm: 210, heightMm: 297 })));
        setFromPage(1);
        setToPage(fullDoc.pageCount);
      } catch (err) {
        console.warn('Failed to restore document session:', err);
        localStorage.removeItem('aoe_active_doc');
      } finally {
        if (!isCancelled) setIsRestoringSession(false);
      }
    };
    
    restoreSession();
    return () => { isCancelled = true; };
  }, [authLoading, neonUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = useCallback(async () => {
    await (authClient as any).signOut();
    setNeonUser(null);
    initStorage(null);
  }, []);

  const handleAuthSuccess = useCallback(async () => {
    await syncAuthState();
  }, [syncAuthState]);

  // ── Document state ──────────────────────────────────────────────────────
  const [activeDocId,      setActiveDocId]      = useState<string | null>(null);
  const [fileName,         setFileName]         = useState('');
  const [pageImages,       setPageImages]       = useState<string[]>([]);
  const [pageDimensions,   setPageDimensions]   = useState<PageDimension[]>([]);
  const [pageResults,      setPageResults]      = useState<Record<number, string>>({});
  const [fromPage,         setFromPage]         = useState(1);
  const [toPage,           setToPage]           = useState(1);
  const [isProcessing,     setIsProcessing]     = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [isPdfExporting,   setIsPdfExporting]   = useState(false);
  const [isSaving,         setIsSaving]         = useState(false);
  const [isDirty,          setIsDirty]          = useState(false);
  const [showLibrary,      setShowLibrary]      = useState(false);
  const [toast,            setToast]            = useState<ToastMessage | null>(null);
  const [imageQuality,     setImageQuality]     = useState<ImageQuality>('fast');
  const [regeneratingPages, setRegeneratingPages] = useState<Set<number>>(new Set());
  const [activePage,       setActivePage]       = useState(1);
  const [showAdmin,        setShowAdmin]        = useState(false);

  // ── Warn before closing with unsaved changes ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Browser tab title ──
  useEffect(() => {
    document.title = fileName
      ? `${fileName}${isDirty ? ' •' : ''} — Amharic OCR`
      : 'Amharic OCR Extractor';
  }, [fileName, isDirty]);

  // ── Lazy load active page image ──────────────────────────────────────────
  useEffect(() => {
    if (!activeDocId || activePage < 1) return;
    const currentImg = pageImages[activePage - 1];
    
    if (currentImg === '') {
      let isCancelled = false;
      const fetchImage = async () => {
        try {
          const img = await loadDocumentPageImage(activeDocId, activePage - 1);
          if (isCancelled || !img) return;
          setPageImages(prev => {
            const next = [...prev];
            next[activePage - 1] = img;
            return next;
          });
        } catch (err) {
          console.warn('Failed to lazy-load image:', err);
        }
      };
      
      fetchImage();
      return () => { isCancelled = true; };
    }
  }, [activeDocId, activePage, pageImages]);

  // ── Canvas executor — stable ref so FloatingChat doesn't re-mount ──────
  const pageResultsRef = useRef(pageResults);
  const pageImagesRef  = useRef(pageImages);
  const activePageRef  = useRef(activePage);
  useEffect(() => { pageResultsRef.current = pageResults; }, [pageResults]);
  useEffect(() => { pageImagesRef.current  = pageImages;  }, [pageImages]);
  useEffect(() => { activePageRef.current  = activePage;  }, [activePage]);
  const cancelRef = useRef(false);

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
        let img = pageImagesRef.current[n - 1];
        if (img === '' && activeDocId) {
          img = await loadDocumentPageImage(activeDocId, n - 1) ?? '';
          if (img) {
            setPageImages(prev => {
              const next = [...prev];
              next[n - 1] = img;
              return next;
            });
          }
        }
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
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)
    ?.split(',').map(e => e.trim().toLowerCase()).filter(Boolean) ?? [];
  const isAdmin = adminEmails.length > 0 && !!neonUser?.email &&
    adminEmails.includes(neonUser.email.toLowerCase());

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
      const fileType = detectFileType(file);

      if (fileType === 'docx') {
        // DOCX → HTML pages (text is already digital, no OCR needed)
        setProcessingStatus('Converting Word document…');
        const htmlPages = await docxToHtmlPages(file);
        const blankImages = htmlPages.map(() => '');
        setPageImages(blankImages);
        setPageDimensions(htmlPages.map(() => ({ widthMm: 210, heightMm: 297 }))); // default A4 for text-based
        const results: Record<number, string> = {};
        htmlPages.forEach((html, i) => { results[i + 1] = html; });
        setPageResults(results);
        setFromPage(1);
        setToPage(htmlPages.length);
      } else if (fileType === 'text') {
        // Plain text → HTML pages
        setProcessingStatus('Reading text file…');
        const text = await file.text();
        const htmlPages = textToHtmlPages(text);
        const blankImages = htmlPages.map(() => '');
        setPageImages(blankImages);
        setPageDimensions(htmlPages.map(() => ({ widthMm: 210, heightMm: 297 }))); // default A4 for text
        const results: Record<number, string> = {};
        htmlPages.forEach((html, i) => { results[i + 1] = html; });
        setPageResults(results);
        setFromPage(1);
        setToPage(htmlPages.length);
      } else {
        // PDF or image — existing flow (renders to images for OCR)
        if (fileType === 'pdf') {
          const { images, dimensions } = await pdfToImages(file);
          setPageImages(images);
          setPageDimensions(dimensions);
          setFromPage(1);
          setToPage(images.length);
        } else {
          const img = await imageFileToBase64(file);
          setPageImages([img]);
          // For single images, default to A4
          setPageDimensions([{ widthMm: 210, heightMm: 297 }]);
          setFromPage(1);
          setToPage(1);
        }
      }
    } catch (err) {
      console.error(err);
      setToast({ id: Date.now().toString(), message: `Failed to open file: ${(err as Error).message}`, variant: 'error' });
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
      cancelRef.current = false;
      let prevHTML: string | undefined;
      let extractedCount = 0;
      let errorCount = 0;

      for (let p = fromPage; p <= toPage; p++) {
        if (cancelRef.current) {
          setProcessingStatus('Cancelled.');
          break;
        }
        if (!force && pageResults[p]) {
          prevHTML = pageResults[p];
          continue;
        }

        // Skip OCR for text-based pages (DOCX/plain text) that have no scan image
        if (!pageImages[p - 1]) {
          if (pageResults[p]) prevHTML = pageResults[p];
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
          extractedCount++;
        } catch (err: unknown) {
          const error = err as Error & { status?: number };
          const errHtml = is429Error(err)
            ? RATE_LIMIT_ERROR_HTML
            : buildErrorHTML(p, error?.message ?? 'Unknown error');

          setPageResults((prev) => ({ ...prev, [p]: errHtml }));
          errorCount++;
          if (is429Error(err)) { setProcessingStatus('Rate limit hit — paused.'); break; }
        }

        if (p < toPage && !cancelRef.current) {
          for (let s = 5; s > 0; s--) {
            if (cancelRef.current) break;
            setProcessingStatus(`Page ${p} done. Waiting ${s}s before next page…`);
            await sleep(1000);
          }
        }
      }

      // ── Extraction complete ──
      if (extractedCount > 0) {
        setIsDirty(true);
        const msg = errorCount > 0
          ? `Extracted ${extractedCount} page${extractedCount > 1 ? 's' : ''} (${errorCount} failed — use Re-extract to retry)`
          : `${extractedCount} page${extractedCount > 1 ? 's' : ''} extracted successfully`;
        setToast({ id: Date.now().toString(), message: msg, variant: errorCount > 0 ? 'error' : 'success' });
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
    setIsDirty(true);
  };

  // -------------------------------------------------------------------------
  // Re-extract a single page (independent of the global extract loop)
  // -------------------------------------------------------------------------
  const regenerateSinglePage = useCallback(async (pageNumber: number) => {
    // Skip OCR for text-based pages (DOCX/text) that have no scan image
    if (!pageImages[pageNumber - 1]) {
      setToast({ id: Date.now().toString(), message: 'This is a text-based page — edit directly in the document', variant: 'error' });
      return;
    }

    setRegeneratingPages((prev) => { const next = new Set(prev); next.add(pageNumber); return next; });
    const prevHTML = pageNumber > 1 ? pageResults[pageNumber - 1] : undefined;

    try {
      const html = await extractPageHTML(pageImages[pageNumber - 1], prevHTML);
      const { html: finalHtml } = await autoFillImagePlaceholders(html, pageImages[pageNumber - 1]);
      setPageResults((prev) => ({ ...prev, [pageNumber]: finalHtml }));
      setToast({ id: Date.now().toString(), message: `Page ${pageNumber} re-extracted.`, variant: 'success' });
    } catch (err: unknown) {
      const error = err as Error & { status?: number };
      const errHtml = is429Error(err)
        ? RATE_LIMIT_ERROR_HTML
        : buildErrorHTML(pageNumber, error?.message ?? 'Unknown error');
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
    // Remove the scan image and shift all subsequent page results down by 1
    setPageImages(prev => prev.filter((_, i) => i !== pageNumber - 1));
    setPageResults(prev => {
      const next: Record<number, string> = {};
      if (prev[0]) next[0] = prev[0]; // keep cover
      Object.entries(prev).forEach(([k, v]) => {
        const n = Number(k);
        if (n === 0) return;
        if (n < pageNumber) next[n] = v;
        else if (n > pageNumber) next[n - 1] = v;
        // n === pageNumber is deleted
      });
      return next;
    });
  }, []);

  const handleDeleteCover = useCallback(() => {
    setPageResults(prev => {
      const next = { ...prev };
      delete next[0];
      return next;
    });
  }, []);

  // Reorder pages: move page at fromPage to toPage position (1-indexed)
  const handleReorderPages = useCallback((fromPage: number, toPage: number) => {
    if (fromPage === toPage) return;
    setPageImages(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromPage - 1, 1);
      next.splice(toPage - 1, 0, moved);
      return next;
    });
    setPageResults(prev => {
      // Build ordered array of [pageNum, html] for pages 1..n, reorder, re-key
      const cover = prev[0];
      const total = Object.keys(prev).filter(k => Number(k) > 0).length;
      const arr: (string | undefined)[] = Array.from({ length: total }, (_, i) => prev[i + 1]);
      const [moved] = arr.splice(fromPage - 1, 1);
      arr.splice(toPage - 1, 0, moved);
      const next: Record<number, string> = {};
      if (cover) next[0] = cover;
      arr.forEach((html, i) => { if (html) next[i + 1] = html; });
      return next;
    });
  }, []);

  // Insert a blank page after the given page number (0 = insert before page 1)
  const handleInsertPage = useCallback((afterPage: number) => {
    setPageImages(prev => {
      const next = [...prev];
      next.splice(afterPage, 0, '');   // blank image
      return next;
    });
    setPageResults(prev => {
      const cover = prev[0];
      const total = pageImages.length;
      const arr: (string | undefined)[] = Array.from({ length: total }, (_, i) => prev[i + 1]);
      arr.splice(afterPage, 0, undefined);  // blank page result
      const next: Record<number, string> = {};
      if (cover) next[0] = cover;
      arr.forEach((html, i) => { if (html) next[i + 1] = html; });
      return next;
    });
  }, [pageImages.length]);

  // -------------------------------------------------------------------------
  // Save to library
  // -------------------------------------------------------------------------
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docId = await saveDocument(activeDocId, fileName, pageImages, pageResults);
      setActiveDocId(docId);
      localStorage.setItem('aoe_active_doc', docId);
      setToast({ id: Date.now().toString(), message: `"${fileName}" saved to library.`, variant: 'success' });
      setIsDirty(false);
      // Persist AI-data export in the background when the user has opted in
      if (neonUser && docId && localStorage.getItem(AI_DATA_EXPORT_KEY) === 'true') {
        void saveDocumentExport(docId, neonUser.id, buildDocumentExport(docId, fileName, pageResults))
          .catch(() => { /* non-critical */ });
      }
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        setToast({
          id: Date.now().toString(),
          message: `Document limit reached (${err.used}/${err.limit}). Contact an admin to increase your quota.`,
          variant: 'error',
        });
      } else {
        setToast({ id: Date.now().toString(), message: `Save failed: ${(err as Error).message}`, variant: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Load from library
  // -------------------------------------------------------------------------
  const handleLoad = (doc: SavedDocument) => {
    setActiveDocId(doc.id);
    setFileName(doc.name);
    setPageImages(doc.pageImages);
    setPageResults(doc.pageResults);
    // Loaded documents don't store dimensions yet — default to A4
    setPageDimensions(doc.pageImages.map(() => ({ widthMm: 210, heightMm: 297 })));
    setFromPage(1);
    setToPage(doc.pageCount);
    localStorage.setItem('aoe_active_doc', doc.id);
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

      // Use first page dimensions to initialise the PDF, fallback to A4
      const firstDim = pageDimensions[0] ?? { widthMm: 210, heightMm: 297 };
      const pdf = new jsPDF({
        unit: 'mm',
        format: [firstDim.widthMm, firstDim.heightMm],
        orientation: firstDim.widthMm > firstDim.heightMm ? 'landscape' : 'portrait',
      });

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i] as HTMLElement;
        // Resolve dimension for this page (page index from data attribute or sequential)
        const pageIdx = parseInt(pageEl.dataset.dimIndex ?? String(i), 10);
        const dim = pageDimensions[pageIdx] ?? { widthMm: 210, heightMm: 297 };
        const wMm = dim.widthMm;
        const hMm = dim.heightMm;

        const saved  = {
          minHeight: pageEl.style.minHeight,
          maxHeight: pageEl.style.maxHeight,
          overflow:  pageEl.style.overflow,
          boxShadow: pageEl.style.boxShadow,
          transform: pageEl.style.transform,
        };

        pageEl.style.minHeight = `${hMm}mm`;
        pageEl.style.maxHeight = `${hMm}mm`;
        pageEl.style.overflow  = 'hidden';
        pageEl.style.boxShadow = 'none';
        pageEl.style.transform = 'none';

        const canvas = await html2canvas(pageEl as any, {
          scale:   2,
          useCORS: true,
          logging: false,
          width:   pageEl.scrollWidth,
          height:  Math.round(hMm * (96 / 25.4)),
        });

        Object.assign(pageEl.style, saved);

        if (i > 0) pdf.addPage([wMm, hMm], wMm > hMm ? 'landscape' : 'portrait');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, wMm, hMm);
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
    if (isDirty && !window.confirm('You have unsaved changes. Close without saving?')) return;
    setActiveDocId(null);
    setFileName('');
    setPageImages([]);
    setPageDimensions([]);
    setPageResults({});
    setFromPage(1);
    setToPage(1);
    setProcessingStatus('');
    setIsDirty(false);
    localStorage.removeItem('aoe_active_doc');
  }, [isDirty]);

  const handleShowAdmin   = useCallback(() => setShowAdmin(true), []);
  const handleShowLibrary = useCallback(() => setShowLibrary(true), []);
  const handleCancel      = useCallback(() => { cancelRef.current = true; }, []);
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

  // ── Session restore loading screen ───────────────────────────────────────
  if (isRestoringSession) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--t-bg)', color: 'var(--t-text)' }}>
        <Loader2 size={32} className="animate-spin mb-4" style={{ color: '#ef4444' }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Restoring session...</h2>
        <p style={{ color: 'var(--t-text3)' }}>Loading your active document</p>
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
        {showAdmin && <Suspense fallback={<div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)',zIndex:999}}><Loader2 size={32} className="animate-spin" style={{color:'#6366f1'}} /></div>}><AdminPanel onClose={() => setShowAdmin(false)} /></Suspense>}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-[350px] pointer-events-none">
          {toast && <Toast key={toast.id} toast={toast} onDismiss={handleDismissToast} />}
        </div>
      </>
    );
  }

  // ── Full editor shell (file is loaded) ───────────────────────────────────
  return (
    <Suspense fallback={<div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--t-bg)'}}><Loader2 size={36} className="animate-spin" style={{color:'#6366f1'}} /></div>}>
    <div style={{ position: 'relative' }}>

      {/* ── Full-viewport editor layout ── */}
      <EditorShell
        fileName={fileName}
        pageImages={pageImages}
        pageDimensions={pageDimensions}
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
        onDeleteCover={handleDeleteCover}
        onReorderPages={handleReorderPages}
        onInsertPage={handleInsertPage}
        onExtract={() => processPages(false)}
        onForceExtract={() => processPages(true)}
        onSave={handleSave}
        isSaving={isSaving}
        isDirty={isDirty}
        onClear={handleClear}
        onShowLibrary={handleShowLibrary}
        onDownloadPDF={handleDownloadPDF}
        onDownloadTxt={() => downloadAsText(pageResults, fileName)}
        onDownloadDocx={() => downloadAsDocx(pageResults, fileName)}
        onCopyAllText={() => {
          const keys = Object.keys(pageResults).map(Number).filter(n => n > 0).sort((a, b) => a - b);
          const parts = keys.map(p => {
            const doc = new DOMParser().parseFromString(pageResults[p], 'text/html');
            doc.querySelectorAll('.ai-image-placeholder, button, img, svg, style, script').forEach(el => el.remove());
            return (doc.body.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
          }).filter(Boolean);
          navigator.clipboard.writeText(parts.join('\n\n')).then(() => {
            setToast({ id: Date.now().toString(), message: `Copied text from ${parts.length} pages`, variant: 'success' });
          }).catch(() => {
            setToast({ id: Date.now().toString(), message: 'Failed to copy — try downloading instead', variant: 'error' });
          });
        }}
        onImageQualityChange={setImageQuality}
        onActivePageChange={setActivePage}
        canvasExecutor={executorRef.current ?? undefined}
        mcpConnected={mcpConnected}
        onSignOut={handleSignOut}
        theme={theme}
        onToggleTheme={toggleTheme}
        onError={handleError}
        onCancel={handleCancel}
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
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        {Object.entries(pageResults)
          .sort(([a], [b]) => {
            // front cover (0) first, back cover (-1) last, content pages in between
            if (+a === -1) return 1;
            if (+b === -1) return -1;
            return +a - +b;
          })
          .map(([page, html]) => {
            const pageNum = +page;
            const isCoverPage = page === '0' || page === '-1';
            // Use the actual page dimension (0-indexed); covers/back covers fallback to A4
            const dimIdx = pageNum > 0 ? pageNum - 1 : 0;
            const dim = pageDimensions[dimIdx] ?? { widthMm: 210, heightMm: 297 };
            return (
              <div
                key={page}
                className="document-page"
                data-dim-index={pageNum > 0 ? pageNum - 1 : 0}
                style={{
                  width:      `${dim.widthMm}mm`,
                  minHeight:  `${dim.heightMm}mm`,
                  padding:    isCoverPage ? '0' : '12mm 16mm',
                  fontFamily: "'Noto Serif Ethiopic', 'Noto Sans Ethiopic', serif",
                  fontSize:   '1rem',
                  boxSizing:  'border-box',
                  lineHeight: '1.6',
                  background: isCoverPage ? 'transparent' : 'white',
                  overflow:   isCoverPage ? 'hidden' : undefined,
                }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          })}
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
    </Suspense>
  );
}
