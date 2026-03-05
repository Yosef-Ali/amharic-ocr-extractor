import {
  useRef, useState, useEffect, useLayoutEffect, useCallback,
} from 'react';
import { CropIcon } from 'lucide-react';

import DocumentPage, { type DocumentPageHandle, type ElementStyles } from './DocumentPage';
import { cropPageRegion, restoreImage, type ImageQuality } from '../services/geminiService';

// ── Types ──────────────────────────────────────────────────────────────────
/** Selection expressed as 0-1 fractions of the canvas size */
interface NormRect { x1: number; y1: number; x2: number; y2: number; }

interface Props {
  pageNumber:     number;
  pageImage:      string;          // raw base64 JPEG of original scan
  html:           string;
  imageQuality:   ImageQuality;
  isRegenerating?: boolean;        // true while this page is being re-extracted
  styleOverride?:  React.CSSProperties;
  selectionMode?:  boolean;
  onElementSelect?: (styles: ElementStyles | null) => void;
  onExitSelectionMode?: () => void;
  styleApply?:      { patch: Record<string, string>; nonce: number } | null;
  onEdit:          (pageNumber: number, html: string) => void;
  onError?:        (msg: string) => void;
}

// ── Colours ────────────────────────────────────────────────────────────────
const SEL_COLOR   = '#22d3ee';   // cyan-400
const SEL_SHADOW  = 'rgba(34,211,238,0.35)';

// ── Component ──────────────────────────────────────────────────────────────
export default function SplitPageView({
  pageNumber, pageImage, html, imageQuality,
  isRegenerating = false, styleOverride, selectionMode = false,
  onElementSelect, onExitSelectionMode, styleApply,
  onEdit, onError,
}: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef<HTMLImageElement>(null);
  const docRef     = useRef<DocumentPageHandle | null>(null);
  const rafRef     = useRef<number>(0);
  const drawingRef = useRef(false);   // mutable, avoids stale closure issues
  const startRef   = useRef<{ x: number; y: number } | null>(null);
  
  // Ghost overlay state
  const [ghosting, setGhosting] = useState(false);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });

  // Selection state
  const [rect,       setRect]       = useState<NormRect | null>(null);
  const [cropUrl,    setCropUrl]    = useState<string | null>(null);
  const [desc,       setDesc]       = useState('');

  // ── Keep canvas pixel dimensions matched to the rendered img size ─────────
  useLayoutEffect(() => {
    const img    = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const sync = () => {
      if (img.clientWidth > 0) {
        canvas.width  = img.clientWidth;
        canvas.height = img.clientHeight;
      }
    };
    if (img.complete) sync();
    img.addEventListener('load', sync);
    const ro = new ResizeObserver(sync);
    ro.observe(img);
    return () => { img.removeEventListener('load', sync); ro.disconnect(); };
  }, [pageImage]);

  // ── Marching-ants drawing loop ────────────────────────────────────────────
  const draw = useCallback((r: NormRect) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Semi-transparent vignette outside selection
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, W, H);

    const x = r.x1 * W;
    const y = r.y1 * H;
    const w = (r.x2 - r.x1) * W;
    const h = (r.y2 - r.y1) * H;

    // Cut-out (clear = shows original image)
    ctx.clearRect(x, y, w, h);

    // Animated dashed border (marching ants)
    ctx.save();
    ctx.strokeStyle = SEL_COLOR;
    ctx.lineWidth   = 2;
    ctx.shadowColor = SEL_SHADOW;
    ctx.shadowBlur  = 8;
    ctx.setLineDash([8, 4]);
    ctx.lineDashOffset = -(Date.now() / 60) % 12;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    // Corner handles
    const hs = 7;
    ctx.fillStyle = SEL_COLOR;
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) =>
      ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
    );

    // Dimension badge
    const pxW = Math.round(w);
    const pxH = Math.round(h);
    const badge = ` ${pxW} × ${pxH} `;
    ctx.font      = 'bold 11px ui-monospace, monospace';
    const tw      = ctx.measureText(badge).width;
    const bx      = x + w / 2 - tw / 2 - 4;
    const by      = y + h + 6;
    ctx.fillStyle = SEL_COLOR;
    ctx.fillRect(bx, by, tw + 8, 18);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(badge, bx + 4, by + 13);
  }, []);

  // Animation loop while rect exists
  useEffect(() => {
    if (!rect) {
      cancelAnimationFrame(rafRef.current);
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const loop = () => { draw(rect); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [rect, draw]);

  // ── Canvas coord helpers ──────────────────────────────────────────────────
  const toNorm = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left)  / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top)   / r.height)),
    };
  };

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pt = toNorm(e);
    startRef.current  = pt;
    drawingRef.current = true;
    setCropUrl(null);
    setRect(null);
    setDesc('');
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !startRef.current) return;
    const pt = toNorm(e);
    const s  = startRef.current;
    setRect({
      x1: Math.min(s.x, pt.x), y1: Math.min(s.y, pt.y),
      x2: Math.max(s.x, pt.x), y2: Math.max(s.y, pt.y),
    });
  };

  const onMouseUp = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !startRef.current) return;
    drawingRef.current = false;
    const pt  = toNorm(e);
    const s   = startRef.current;
    const r: NormRect = {
      x1: Math.min(s.x, pt.x), y1: Math.min(s.y, pt.y),
      x2: Math.max(s.x, pt.x), y2: Math.max(s.y, pt.y),
    };
    // Ignore tiny accidental clicks
    if ((r.x2 - r.x1) < 0.015 || (r.y2 - r.y1) < 0.015) {
      setRect(null);
      return;
    }
    setRect(r);

    // Immediately crop from canvas (no API)
    const bbox = { x1: r.x1 * 100, y1: r.y1 * 100, x2: r.x2 * 100, y2: r.y2 * 100 };
    try {
      const crop = await cropPageRegion(pageImage, bbox, 0);
      setCropUrl(crop);
      // Broadcast to inspector sidebar
      window.dispatchEvent(new CustomEvent('insp-crop-state', {
        detail: { active: true, cropUrl: crop, pageNumber },
      }));
    } catch (err) {
      clearSel();
      onError?.('Failed to crop region — check your API key and try again.');
    }
  };

  const onMouseLeave = () => { drawingRef.current = false; };

  // ── Clear selection ───────────────────────────────────────────────────────
  const clearSel = useCallback(() => {
    setRect(null);
    setCropUrl(null);
    setDesc('');
    window.dispatchEvent(new CustomEvent('insp-crop-state', {
      detail: { active: false },
    }));
  }, []);

  // ESC → cancel active crop selection or ghost placement
  useEffect(() => {
    if (!rect && !ghosting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (ghosting) { setGhosting(false); return; }
      clearSel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rect, ghosting, clearSel]);

  // ── Insert crop into document ─────────────────────────────────────────────
  const handleInsert = useCallback(async (withRestore: boolean) => {
    if (!cropUrl || !rect) return;

    let dataUrl = cropUrl;
    if (withRestore) {
      try {
        dataUrl = await restoreImage(cropUrl, imageQuality);
      } catch (err) {
        onError?.('Image restore failed — the region was inserted as a raw crop instead.');
        dataUrl = cropUrl; // fall back to raw crop rather than doing nothing
      }
    }

    // Try auto-placement first (placeholder, cursor, etc.)
    const placed = docRef.current?.insertImage(dataUrl, desc.trim() || 'image from scan');
    if (placed) {
      clearSel();
    } else {
      // No placeholder found — enter ghost mode so user can click to place
      setCropUrl(dataUrl);
      setGhosting(true);
    }
  }, [cropUrl, rect, imageQuality, desc, clearSel]);

  // ── Global mouse listener for Ghost Overlay ──────────────────────────────
  useEffect(() => {
    if (!ghosting || !cropUrl) return;

    const onMove = (e: MouseEvent) => setGhostPos({ x: e.clientX, y: e.clientY });
    
    const onClick = (e: MouseEvent) => {
      // Find the document panel
      const docPage = document.getElementById(`page-${pageNumber}`);
      if (docPage && docPage.contains(e.target as Node)) {
        // Find if they clicked inside a specific element we can append to or after
        docRef.current?.insertImage(cropUrl, desc.trim() || 'image from scan');
        clearSel();
        setGhosting(false);
      }
    };

    window.addEventListener('mousemove', onMove);
    // Slight delay to stop the button click from immediately triggering the window click
    setTimeout(() => window.addEventListener('click', onClick), 50);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('click', onClick);
    };
  }, [ghosting, cropUrl, desc, pageNumber]);

  // ── Listen for inspector-triggered crop actions ─────────────────────────
  useEffect(() => {
    const onInspCropAction = (e: Event) => {
      const { action, desc: newDesc } = (e as CustomEvent).detail;
      if (action === 'insert-raw') handleInsert(false);
      else if (action === 'insert-restore') handleInsert(true);
      else if (action === 'cancel') clearSel();
      else if (action === 'set-desc' && typeof newDesc === 'string') setDesc(newDesc);
    };
    window.addEventListener('insp-crop-action', onInspCropAction);
    return () => window.removeEventListener('insp-crop-action', onInspCropAction);
  }, [handleInsert, clearSel]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Ghost Overlay Rendering ── */}
      {ghosting && cropUrl && (
        <div 
          className="fixed pointer-events-none z-[9999] opacity-60 mix-blend-multiply drop-shadow-2xl transition-transform duration-75"
          style={{
            left: ghostPos.x,
            top: ghostPos.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <img src={cropUrl} className="max-w-[300px] h-auto border-2 border-teal-500 rounded shadow-2xl" alt="Preview Ghost" />
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-3 py-1.5 rounded-full font-bold whitespace-nowrap shadow-lg">
            Click anywhere on the right page to insert (Esc to cancel)
          </div>
        </div>
      )}

      <div className="split-page-view" id={`split-page-${pageNumber}`}>
        <div className="split-grid">

        {/* ═══ LEFT — Original Scan ═══════════════════════════════════════ */}
        <div className="scan-panel">

          {/* Header */}
          <div className="scan-header relative z-10">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Original Scan</span>
            </div>
            <span className="scan-tool-hint">
              <CropIcon size={12} className="inline mr-[4px] opacity-70" />
              Draw to select image region
            </span>
          </div>

          {/* Image + Canvas overlay */}
          <div className="scan-body">
            <div className="relative select-none">
              <img
                ref={imgRef}
                src={pageImage.startsWith('http') ? pageImage : `data:image/jpeg;base64,${pageImage}`}
                crossOrigin="anonymous"
                alt={`Page ${pageNumber} original`}
                className="w-full h-auto block"
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ cursor: 'crosshair' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
              />
            </div>
          </div>

        </div>


        {/* ═══ RIGHT — Extracted Document ══════════════════════════════════ */}
        <div className="doc-panel relative">

          {/* Re-extracting overlay — scanning beam */}
          {isRegenerating && (
            <div className="scan-overlay">
              <span className="scan-overlay-label">Extracting page {pageNumber}…</span>
            </div>
          )}

          {/* Header */}
          <div className="doc-header relative z-10">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
              Extracted Document
            </span>
            <span className="text-[10px] text-slate-400 font-medium ml-auto px-2 py-1 bg-slate-50/50 rounded-full border border-slate-100">
              Click to edit · Select text to format
            </span>
          </div>

          <DocumentPage
            docHandle={docRef}
            pageNumber={pageNumber}
            html={html}
            styleOverride={styleOverride}
            selectionMode={selectionMode}
            onElementSelect={onElementSelect}
            onExitSelectionMode={onExitSelectionMode}
            styleApply={styleApply}
            onEdit={onEdit}
            compact
          />

        </div>
      </div>
    </div>
  </>
);
}
