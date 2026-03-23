import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X, Copy } from 'lucide-react';
import ImageEditModal, { type ImageEditTarget } from './ImageEditModal';
import { editImage, type ImageGenOptions } from '../services/geminiService';

// ── Undo / Redo history stack ────────────────────────────────────────────────
const MAX_HISTORY = 80;
interface UndoStack {
  past: string[];
  future: string[];
}
function pushUndo(stack: UndoStack, html: string): UndoStack {
  const past = [...stack.past, html].slice(-MAX_HISTORY);
  return { past, future: [] };
}
function undo(stack: UndoStack, current: string): { stack: UndoStack; html: string | null } {
  if (stack.past.length === 0) return { stack, html: null };
  const past = [...stack.past];
  const prev = past.pop()!;
  return { stack: { past, future: [current, ...stack.future].slice(0, MAX_HISTORY) }, html: prev };
}
function redo(stack: UndoStack, current: string): { stack: UndoStack; html: string | null } {
  if (stack.future.length === 0) return { stack, html: null };
  const future = [...stack.future];
  const next = future.shift()!;
  return { stack: { past: [...stack.past, current], future }, html: next };
}

// ── Public handle — passed via docHandle prop (avoids forwardRef complexity) ──
export interface DocumentPageHandle {
  /** Insert a data-URL image. Returns true if auto-placed, false if ghost mode needed. */
  insertImage: (dataUrl: string, desc: string) => boolean;
  /** Undo last edit — returns true if undo was applied */
  undo: () => boolean;
  /** Redo last undone edit — returns true if redo was applied */
  redo: () => boolean;
  /** Whether undo is available */
  canUndo: () => boolean;
  /** Whether redo is available */
  canRedo: () => boolean;
}

// ── Element style snapshot ────────────────────────────────────────────────────
export interface ElementStyles {
  tag:            string;   // 'p', 'h2', 'div', etc.
  textAlign:      string;   // 'left' | 'center' | 'right' | 'justify'
  fontSize:       string;   // e.g. '16px'
  fontWeight:     string;   // e.g. '400' | '700' | '900'
  fontStyle:      string;   // 'normal' | 'italic'
  textDecoration: string;   // 'none' | 'underline' | 'line-through'
  color:          string;   // '#1c1917' (hex)
  lineHeight:     string;   // unitless, e.g. '1.60'
  marginTop:      string;   // e.g. '8px'
  marginBottom:   string;   // e.g. '8px'
  letterSpacing:  string;   // e.g. '0px' or '2px'
  textTransform:  string;   // 'none' | 'uppercase' | 'lowercase' | 'capitalize'
}

function rgbToHex(color: string): string {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

export function readElementStyles(el: HTMLElement): ElementStyles {
  const cs = window.getComputedStyle(el);
  const s  = el.style;
  const csFS = parseFloat(cs.fontSize) || 16;
  const csLH = parseFloat(cs.lineHeight);
  const lineHeight = s.lineHeight || (csFS > 0 ? (csLH / csFS).toFixed(2) : '1.60');
  return {
    tag:            el.tagName.toLowerCase(),
    textAlign:      s.textAlign       || cs.textAlign       || 'left',
    fontSize:       s.fontSize        || cs.fontSize        || '16px',
    fontWeight:     s.fontWeight      || cs.fontWeight      || '400',
    fontStyle:      s.fontStyle       || cs.fontStyle       || 'normal',
    textDecoration: s.textDecoration  || cs.textDecorationLine || 'none',
    color:          rgbToHex(cs.color),
    lineHeight,
    marginTop:      s.marginTop       || cs.marginTop       || '0px',
    marginBottom:   s.marginBottom    || cs.marginBottom    || '0px',
    letterSpacing:  s.letterSpacing   || cs.letterSpacing   || 'normal',
    textTransform:  s.textTransform   || cs.textTransform   || 'none',
  };
}

interface Props {
  pageNumber:     number;
  html:           string;
  compact?:       boolean;
  docHandle?:     { current: DocumentPageHandle | null };
  styleOverride?: React.CSSProperties;
  selectionMode?: boolean;
  onElementSelect?:      (styles: ElementStyles | null) => void;
  onExitSelectionMode?:  () => void;
  styleApply?: { patch: Record<string, string>; nonce: number } | null;
  onEdit: (pageNumber: number, html: string) => void;
  /** Canvas zoom level (100 = 100%). Used to scale drag/resize deltas. */
  zoom?: number;
  /** Page margins in mm — used for snap guides */
  margins?: { t: number; r: number; b: number; l: number };
  /** Dynamic page width as CSS value (e.g. '210mm'). Defaults to '210mm' (A4). */
  pageWidth?: string;
  /** Dynamic page height as CSS value (e.g. '297mm'). Defaults to '297mm' (A4). */
  pageHeight?: string;
}

// ── Block-level tags that can be selected ────────────────────────────────────
const SELECTABLE_TAGS = new Set([
  'H1','H2','H3','H4','H5','H6',
  'P','BLOCKQUOTE','PRE',
  'TABLE','FIGURE','UL','OL','LI',
  'DIV','SECTION','ARTICLE','HR',
]);

/** Find the most-specific selectable block ancestor within editorEl */
function findSelectableEl(
  clicked: HTMLElement,
  editorEl: HTMLElement,
): HTMLElement | null {
  let el: HTMLElement | null = clicked;
  while (el && el !== editorEl) {
    if (el.style.display === 'grid' || el.style.display === 'flex' || el.classList.contains('split-grid')) {
      break;
    }
    if (SELECTABLE_TAGS.has(el.tagName)) return el;
    el = el.parentElement as HTMLElement;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DocumentPage({
  pageNumber, html, compact = false, docHandle,
  styleOverride, selectionMode = false,
  onElementSelect, onExitSelectionMode, styleApply, onEdit,
  zoom = 100,
  margins = { t: 12, r: 16, b: 12, l: 16 },
  pageWidth  = '210mm',
  pageHeight = '297mm',
}: Props) {
  const editorRef            = useRef<HTMLDivElement>(null);
  const editImgRef           = useRef<HTMLImageElement | null>(null);
  const targetPlaceholderRef = useRef<HTMLElement | null>(null);

  const hoveredElRef         = useRef<HTMLElement | null>(null);
  const selectedElRef        = useRef<HTMLElement | null>(null);

  // InDesign-style: store click position so we can place the caret after exiting selection mode
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);

  // ── Drag-to-move & resize state ──
  const dragStateRef = useRef<{
    mode: 'move' | 'resize';
    handle?: string; // nw, n, ne, e, se, s, sw, w
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    origWidth: number;
    origHeight: number;
    origScreenRect?: DOMRect; // for snap calculations
  } | null>(null);
  const [handleRects, setHandleRects] = useState<DOMRect | null>(null);
  const [dimTip, setDimTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ type: 'h' | 'v'; pos: number; extent: [number, number] }[]>([]);

  // Track active paragraph at cursor position (text editing mode)
  const activeParaRef = useRef<HTMLElement | null>(null);

  const onElementSelectRef = useRef(onElementSelect);
  useEffect(() => { onElementSelectRef.current = onElementSelect; }, [onElementSelect]);

  const [editTarget,  setEditTarget]  = useState<ImageEditTarget | null>(null);

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const undoStackRef = useRef<UndoStack>({ past: [], future: [] });
  const isUndoRedoRef = useRef(false);     // flag to skip re-pushing during undo/redo
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotRef = useRef<string>('');

  // Snapshot current HTML into undo history (debounced on input)
  const snapshotForUndo = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const cur = el.innerHTML;
    if (cur === lastSnapshotRef.current) return;
    undoStackRef.current = pushUndo(undoStackRef.current, lastSnapshotRef.current);
    lastSnapshotRef.current = cur;
  }, []);

  // Initialize last snapshot when html prop arrives
  useEffect(() => {
    if (html && !lastSnapshotRef.current) lastSnapshotRef.current = html;
  }, [html]);

  // Action-bar position + tag
  const [actionBar, setActionBar] = useState<{
    x: number; y: number; below: boolean; tag: string;
  } | null>(null);

  // ── Recompute action bar from selectedElRef ────────────────────────────────
  const refreshActionBar = useCallback(() => {
    const sel = selectedElRef.current;
    if (!sel) { setActionBar(null); return; }
    const r = sel.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { setActionBar(null); return; }
    const below = r.top < 52;   // header bar is ~52px; not enough room above → show below
    setActionBar({
      x:     r.left + r.width / 2,
      y:     below ? r.bottom + 8 : r.top - 8,
      below,
      tag:   sel.tagName.toLowerCase(),
    });
  }, []);

  /** Refresh the 8 resize handles around the selected element */
  const refreshHandles = useCallback(() => {
    const sel = selectedElRef.current;
    if (!sel) { setHandleRects(null); return; }
    setHandleRects(sel.getBoundingClientRect());
  }, []);

  // ── Sync HTML into contentEditable ────────────────────────────────────────
  useEffect(() => {
    if (isUndoRedoRef.current) return;   // skip during undo/redo
    const el = editorRef.current;
    if (el && el.innerHTML !== html) {
      // Push previous state to undo stack so external edits (AI agent) are undoable
      if (lastSnapshotRef.current && lastSnapshotRef.current !== html) {
        undoStackRef.current = pushUndo(undoStackRef.current, lastSnapshotRef.current);
      }
      el.innerHTML = html;
      lastSnapshotRef.current = html;
    }
  }, [html]);

  // ── Expose handle via docHandle prop ─────────────────────────────────────
  useEffect(() => {
    if (!docHandle) return;
    docHandle.current = {
      insertImage(dataUrl: string, desc: string) {
        const el = editorRef.current;
        if (!el) return false;
        const img               = document.createElement('img');
        img.src                 = dataUrl;
        img.alt                 = desc;
        img.dataset.description = desc;
        img.title               = 'Click to edit this image with AI';
        img.style.cssText       =
          'max-width:100%;height:auto;border-radius:6px;cursor:pointer;display:block;margin:1.25rem auto;';
        const targeted = targetPlaceholderRef.current;
        if (targeted && el.contains(targeted)) {
          targeted.replaceWith(img);
          targetPlaceholderRef.current = null;
          onEdit(pageNumber, el.innerHTML);
          img.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return true;
        }
        const placeholders = el.querySelectorAll('.ai-image-placeholder');
        if (placeholders.length >= 1) {
          // Find the spatially nearest placeholder to the crop rect (by DOM order = visual order)
          placeholders[0].replaceWith(img);
          onEdit(pageNumber, el.innerHTML);
          img.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return true;
        }
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (el.contains(range.commonAncestorContainer)) {
            range.collapse(false);
            range.insertNode(img);
            range.setStartAfter(img);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            onEdit(pageNumber, el.innerHTML);
            img.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return true;
          }
        }
        // No suitable position found — caller should use ghost mode
        return false;
      },
      undo() {
        const el = editorRef.current;
        if (!el) return false;
        const result = undo(undoStackRef.current, el.innerHTML);
        if (result.html === null) return false;
        undoStackRef.current = result.stack;
        isUndoRedoRef.current = true;
        el.innerHTML = result.html;
        lastSnapshotRef.current = result.html;
        onEdit(pageNumber, result.html);
        requestAnimationFrame(() => { isUndoRedoRef.current = false; });
        return true;
      },
      redo() {
        const el = editorRef.current;
        if (!el) return false;
        const result = redo(undoStackRef.current, el.innerHTML);
        if (result.html === null) return false;
        undoStackRef.current = result.stack;
        isUndoRedoRef.current = true;
        el.innerHTML = result.html;
        lastSnapshotRef.current = result.html;
        onEdit(pageNumber, result.html);
        requestAnimationFrame(() => { isUndoRedoRef.current = false; });
        return true;
      },
      canUndo: () => undoStackRef.current.past.length > 0,
      canRedo: () => undoStackRef.current.future.length > 0,
    };
    return () => { if (docHandle) docHandle.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docHandle, pageNumber]);

  // ── Selection mode mouse interactions ────────────────────────────────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    if (!selectionMode) {
      hoveredElRef.current?.classList.remove('sel-hover');
      hoveredElRef.current = null;
      selectedElRef.current?.classList.remove('sel-active');
      selectedElRef.current = null;
      setActionBar(null);
      setHandleRects(null);
      return;
    }

    const deselect = () => {
      selectedElRef.current?.classList.remove('sel-active');
      selectedElRef.current = null;
      setActionBar(null);
      setHandleRects(null);
      onElementSelectRef.current?.(null);
    };

    const onMove = (e: MouseEvent) => {
      // Skip hover highlight while dragging/resizing
      if (dragStateRef.current) return;
      const found = findSelectableEl(e.target as HTMLElement, el);
      if (hoveredElRef.current !== found) {
        hoveredElRef.current?.classList.remove('sel-hover');
        if (found && found !== selectedElRef.current) found.classList.add('sel-hover');
        hoveredElRef.current = found;
      }
    };

    const onLeave = () => {
      hoveredElRef.current?.classList.remove('sel-hover');
      hoveredElRef.current = null;
    };

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      const found = findSelectableEl(e.target as HTMLElement, el);
      if (!found) { deselect(); return; }
      if (found === selectedElRef.current) { deselect(); return; }

      selectedElRef.current?.classList.remove('sel-active');
      found.classList.remove('sel-hover');
      found.classList.add('sel-active');
      selectedElRef.current = found;
      hoveredElRef.current = null;

      refreshActionBar();
      refreshHandles();
      onElementSelectRef.current?.(readElementStyles(found));
    };

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      const found = findSelectableEl(e.target as HTMLElement, el);
      if (found) {
        // Store click position — cursor will be placed here after contentEditable re-enables
        pendingCursorRef.current = { x: e.clientX, y: e.clientY };
        deselect();
        onExitSelectionMode?.();
      }
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('click', onClick);
    el.addEventListener('dblclick', onDblClick);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('click', onClick);
      el.removeEventListener('dblclick', onDblClick);
    };
  }, [selectionMode, refreshActionBar, onExitSelectionMode]);

  // ── InDesign-style: place cursor when selection mode turns OFF ──────────
  useEffect(() => {
    if (selectionMode || !pendingCursorRef.current) return;
    const { x, y } = pendingCursorRef.current;
    pendingCursorRef.current = null;
    // After React re-renders with contentEditable=true, place the caret
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range) {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    });
  }, [selectionMode]);

  // ── Cursor tracking: sync sidebar with paragraph at cursor (text editing mode) ──
  useEffect(() => {
    if (selectionMode) {
      activeParaRef.current = null;
      return;
    }
    const update = () => {
      const sel = window.getSelection();
      const el  = editorRef.current;
      if (!sel || !el || !sel.rangeCount) return;
      const anchor = sel.anchorNode;
      if (!anchor || !el.contains(anchor)) {
        if (activeParaRef.current) {
          activeParaRef.current = null;
          onElementSelectRef.current?.(null);
        }
        return;
      }
      const target = anchor.nodeType === Node.TEXT_NODE
        ? anchor.parentElement!
        : anchor as HTMLElement;
      const block = findSelectableEl(target, el);
      if (block !== activeParaRef.current) {
        activeParaRef.current = block;
        onElementSelectRef.current?.(block ? readElementStyles(block) : null);
      }
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [selectionMode]);

  // Keep action bar + handles in sync on scroll, zoom, pan
  useEffect(() => {
    if (!selectionMode) return;
    const onScroll = () => { refreshActionBar(); refreshHandles(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    // rAF loop: detect position changes from zoom/pan transforms
    let raf: number;
    let lastKey = '';
    const syncLoop = () => {
      const sel = selectedElRef.current;
      if (sel) {
        const r = sel.getBoundingClientRect();
        const key = `${r.left|0},${r.top|0},${r.width|0},${r.height|0}`;
        if (key !== lastKey) { lastKey = key; onScroll(); }
      }
      raf = requestAnimationFrame(syncLoop);
    };
    raf = requestAnimationFrame(syncLoop);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [selectionMode, refreshActionBar, refreshHandles]);

  // ── Drag-to-move logic ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selectionMode) return;
    const el = editorRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      const sel = selectedElRef.current;
      if (!sel || !sel.contains(e.target as Node)) return;
      // Don't start drag on action bar buttons
      if ((e.target as HTMLElement).closest('.sel-action-bar')) return;

      e.preventDefault();
      e.stopPropagation();

      // Ensure element has position: relative for offset movement
      if (!sel.style.position || sel.style.position === 'static') {
        sel.style.position = 'relative';
      }
      const left = parseFloat(sel.style.left || '0');
      const top  = parseFloat(sel.style.top  || '0');

      dragStateRef.current = {
        mode: 'move',
        startX: e.clientX,
        startY: e.clientY,
        origLeft: left,
        origTop: top,
        origWidth: sel.offsetWidth,
        origHeight: sel.offsetHeight,
        origScreenRect: sel.getBoundingClientRect(),
      };
      sel.classList.add('sel-dragging');
    };

    const onMouseMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      const sel = selectedElRef.current;
      if (!drag || !sel) return;

      const scale = zoom / 100;
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;

      if (drag.mode === 'move') {
        const SNAP_THRESH = 6; // screen px
        const guides: { type: 'h' | 'v'; pos: number; extent: [number, number] }[] = [];
        let snapDx = 0, snapDy = 0;

        // Build snap targets from page margins + center
        const pageEl = editorRef.current;
        const osr = drag.origScreenRect;
        if (pageEl && osr) {
          const pr = pageEl.getBoundingClientRect();
          const mmPx = 3.7795 * scale; // 1mm in screen px

          // Snap target X positions (screen coords)
          const snapXTargets = [
            pr.left + margins.l * mmPx,                    // margin-left
            (pr.left + pr.right) / 2,                       // center-x
            pr.right - margins.r * mmPx,                   // margin-right
          ];
          // Snap target Y positions (screen coords)
          const snapYTargets = [
            pr.top + margins.t * mmPx,                     // margin-top
            (pr.top + pr.bottom) / 2,                       // center-y
            pr.bottom - margins.b * mmPx,                  // margin-bottom
          ];

          // Add sibling element edges as snap targets
          const siblings = pageEl.querySelectorAll(':scope > *');
          siblings.forEach(sib => {
            if (sib === sel || !(sib instanceof HTMLElement)) return;
            const sr = sib.getBoundingClientRect();
            if (sr.width === 0 && sr.height === 0) return;
            snapXTargets.push(sr.left, sr.right, sr.left + sr.width / 2);
            snapYTargets.push(sr.top, sr.bottom, sr.top + sr.height / 2);
          });

          // Tentative screen position of dragged element
          const tLeft   = osr.left   + dx * scale;
          const tRight  = osr.right  + dx * scale;
          const tCenterX = (tLeft + tRight) / 2;
          const tTop    = osr.top    + dy * scale;
          const tBottom = osr.bottom + dy * scale;
          const tCenterY = (tTop + tBottom) / 2;

          // Check X snaps: left edge, right edge, center
          for (const tx of snapXTargets) {
            const pairs = [
              { val: tLeft, label: 'left' },
              { val: tRight, label: 'right' },
              { val: tCenterX, label: 'center' },
            ];
            for (const p of pairs) {
              if (Math.abs(p.val - tx) < SNAP_THRESH && snapDx === 0) {
                snapDx = (tx - p.val) / scale;
                guides.push({ type: 'v', pos: tx, extent: [pr.top, pr.bottom] });
              }
            }
          }

          // Check Y snaps: top edge, bottom edge, center
          for (const ty of snapYTargets) {
            const pairs = [
              { val: tTop, label: 'top' },
              { val: tBottom, label: 'bottom' },
              { val: tCenterY, label: 'center' },
            ];
            for (const p of pairs) {
              if (Math.abs(p.val - ty) < SNAP_THRESH && snapDy === 0) {
                snapDy = (ty - p.val) / scale;
                guides.push({ type: 'h', pos: ty, extent: [pr.left, pr.right] });
              }
            }
          }
        }

        sel.style.left = `${drag.origLeft + dx + snapDx}px`;
        sel.style.top  = `${drag.origTop  + dy + snapDy}px`;
        setSnapGuides(guides);
        refreshActionBar();
        refreshHandles();
      } else if (drag.mode === 'resize') {
        const h = drag.handle || 'se';
        let newW = drag.origWidth;
        let newH = drag.origHeight;
        let newL = drag.origLeft;
        let newT = drag.origTop;

        if (h.includes('e')) newW = Math.max(30, drag.origWidth + dx);
        if (h.includes('w')) { newW = Math.max(30, drag.origWidth - dx); newL = drag.origLeft + dx; }
        if (h.includes('s')) newH = Math.max(20, drag.origHeight + dy);
        if (h.includes('n')) { newH = Math.max(20, drag.origHeight - dy); newT = drag.origTop + dy; }

        // ── Snap resize edges to margins + siblings ──
        const SNAP_THRESH = 6;
        const resizeGuides: typeof snapGuides = [];
        const pageEl = editorRef.current;
        const osr = drag.origScreenRect;
        if (pageEl && osr) {
          const pr = pageEl.getBoundingClientRect();
          const mmPx = 3.7795 * scale;

          const snapXTargets = [
            pr.left + margins.l * mmPx, (pr.left + pr.right) / 2, pr.right - margins.r * mmPx,
          ];
          const snapYTargets = [
            pr.top + margins.t * mmPx, (pr.top + pr.bottom) / 2, pr.bottom - margins.b * mmPx,
          ];
          const siblings = pageEl.querySelectorAll(':scope > *');
          siblings.forEach(sib => {
            if (sib === sel || !(sib instanceof HTMLElement)) return;
            const sr = sib.getBoundingClientRect();
            if (sr.width === 0 && sr.height === 0) return;
            snapXTargets.push(sr.left, sr.right, sr.left + sr.width / 2);
            snapYTargets.push(sr.top, sr.bottom, sr.top + sr.height / 2);
          });

          // Snap moving edges
          if (h.includes('e')) {
            const tRight = osr.left + newW * scale;
            for (const tx of snapXTargets) {
              if (Math.abs(tRight - tx) < SNAP_THRESH) {
                newW += (tx - tRight) / scale;
                resizeGuides.push({ type: 'v', pos: tx, extent: [pr.top, pr.bottom] });
                break;
              }
            }
          }
          if (h.includes('w')) {
            const tLeft = osr.right - newW * scale;
            for (const tx of snapXTargets) {
              if (Math.abs(tLeft - tx) < SNAP_THRESH) {
                const adj = (tx - tLeft) / scale;
                newL += adj; newW -= adj;
                resizeGuides.push({ type: 'v', pos: tx, extent: [pr.top, pr.bottom] });
                break;
              }
            }
          }
          if (h.includes('s')) {
            const tBottom = osr.top + newT * scale - drag.origTop * scale + newH * scale;
            for (const ty of snapYTargets) {
              if (Math.abs(tBottom - ty) < SNAP_THRESH) {
                newH += (ty - tBottom) / scale;
                resizeGuides.push({ type: 'h', pos: ty, extent: [pr.left, pr.right] });
                break;
              }
            }
          }
          if (h.includes('n')) {
            const tTop = osr.bottom - (drag.origHeight - newT + drag.origTop) * scale;
            for (const ty of snapYTargets) {
              if (Math.abs(tTop - ty) < SNAP_THRESH) {
                const adj = (ty - tTop) / scale;
                newT += adj; newH -= adj;
                resizeGuides.push({ type: 'h', pos: ty, extent: [pr.left, pr.right] });
                break;
              }
            }
          }
        }

        sel.style.width  = `${newW}px`;
        sel.style.height = `${newH}px`;
        sel.style.left   = `${newL}px`;
        sel.style.top    = `${newT}px`;
        setSnapGuides(resizeGuides);
        refreshActionBar();
        refreshHandles();

        // Show dimension tooltip
        const r = sel.getBoundingClientRect();
        setDimTip({ x: r.right + 8, y: r.bottom + 8, text: `${Math.round(newW)} × ${Math.round(newH)}` });
      }
    };

    const onMouseUp = () => {
      const sel = selectedElRef.current;
      if (dragStateRef.current && sel) {
        sel.classList.remove('sel-dragging');
        dragStateRef.current = null;
        setDimTip(null);
        setSnapGuides([]);
        // Commit the position/size change
        if (editorRef.current) onEdit(pageNumber, editorRef.current.innerHTML);
        refreshActionBar();
        refreshHandles();
        onElementSelectRef.current?.(readElementStyles(sel));
      }
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode, pageNumber, onEdit, refreshActionBar, refreshHandles]);

  // ── Keyboard shortcuts in selection mode ─────────────────────────────────
  useEffect(() => {
    if (!selectionMode) return;
    const onKey = (e: KeyboardEvent) => {
      const sel = selectedElRef.current;
      if (!sel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editorRef.current?.contains(sel)) {
          e.preventDefault();
          sel.remove();
          selectedElRef.current = null;
          setActionBar(null);
          if (editorRef.current) onEdit(pageNumber, editorRef.current.innerHTML);
        }
      }
      if (e.key === 'Escape') {
        sel.classList.remove('sel-active');
        selectedElRef.current = null;
        setActionBar(null);
        onElementSelectRef.current?.(null);
      }
      // Ctrl/Cmd+D → duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        duplicateSelected();
      }
      // ── Arrow key nudge: 1px default, 10px with Shift ──
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (!sel.style.position || sel.style.position === 'static') {
          sel.style.position = 'relative';
        }
        const step = e.shiftKey ? 10 : 1;
        const left = parseFloat(sel.style.left || '0');
        const top  = parseFloat(sel.style.top  || '0');
        switch (e.key) {
          case 'ArrowUp':    sel.style.top  = `${top  - step}px`; break;
          case 'ArrowDown':  sel.style.top  = `${top  + step}px`; break;
          case 'ArrowLeft':  sel.style.left = `${left - step}px`; break;
          case 'ArrowRight': sel.style.left = `${left + step}px`; break;
        }
        if (editorRef.current) onEdit(pageNumber, editorRef.current.innerHTML);
        refreshActionBar();
        refreshHandles();
        onElementSelectRef.current?.(readElementStyles(sel));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode, pageNumber, onEdit]);

  // ── Apply CSS patch to selected OR active-cursor element ───────────────
  useEffect(() => {
    if (!styleApply) return;
    const el = selectedElRef.current || activeParaRef.current;
    if (!el || !editorRef.current?.contains(el)) return;
    Object.assign(el.style, styleApply.patch);
    if (editorRef.current) onEdit(pageNumber, editorRef.current.innerHTML);
    onElementSelectRef.current?.(readElementStyles(el));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleApply?.nonce]);

  // ── Tag change: replace element tag (e.g. <p> → <h2>) ──────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { newTag } = (e as CustomEvent).detail;
      const el = selectedElRef.current || activeParaRef.current;
      if (!el || !editorRef.current?.contains(el)) return;
      if (el.tagName.toLowerCase() === newTag) return;

      const newEl = document.createElement(newTag);
      // Copy all attributes
      for (const attr of Array.from(el.attributes)) {
        newEl.setAttribute(attr.name, attr.value);
      }
      // Copy inline styles
      newEl.style.cssText = el.style.cssText;
      // Copy innerHTML
      newEl.innerHTML = el.innerHTML;
      // Replace in DOM
      el.replaceWith(newEl);

      // Update refs
      if (selectedElRef.current === el) {
        newEl.classList.add('sel-active');
        selectedElRef.current = newEl;
        refreshActionBar();
      }
      if (activeParaRef.current === el) {
        activeParaRef.current = newEl;
      }

      if (editorRef.current) onEdit(pageNumber, editorRef.current.innerHTML);
      onElementSelectRef.current?.(readElementStyles(newEl));
    };
    window.addEventListener('insp-tag-change', handler);
    return () => window.removeEventListener('insp-tag-change', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, onEdit, refreshActionBar]);

  // ── Event delegation: img/placeholder clicks (non-selection mode) ────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const handleClick = (e: MouseEvent) => {
      if (selectionMode) return;
      const img = (e.target as Element).closest('img') as HTMLImageElement | null;
      if (img && img.src.startsWith('data:')) {
        editImgRef.current = img;
        setEditTarget({ src: img.src, description: img.dataset.description ?? img.alt ?? '' });
        return;
      }
      const ph = (e.target as Element).closest('.ai-image-placeholder') as HTMLElement | null;
      if (ph) {
        el.querySelectorAll('.ai-image-placeholder.targeted')
          .forEach((p) => p.classList.remove('targeted'));
        if (targetPlaceholderRef.current === ph) {
          targetPlaceholderRef.current = null;
        } else {
          ph.classList.add('targeted');
          targetPlaceholderRef.current = ph;
        }
      }
    };
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode]);

  const handleBlur = () => {
    if (editorRef.current) {
      snapshotForUndo();
      onEdit(pageNumber, editorRef.current.innerHTML);
    }
  };

  // ── Track input for undo history (debounced) ──────────────────────────────
  const handleInput = () => {
    if (isUndoRedoRef.current) return;
    if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
    inputTimerRef.current = setTimeout(() => {
      snapshotForUndo();
    }, 400);
  };

  // ── Undo / Redo / Cut / Paste keyboard handler ────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectionMode) return;
    const mod = e.ctrlKey || e.metaKey;

    // Undo: Ctrl+Z
    if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      const el = editorRef.current;
      if (!el) return;
      const result = undo(undoStackRef.current, el.innerHTML);
      if (result.html !== null) {
        undoStackRef.current = result.stack;
        isUndoRedoRef.current = true;
        el.innerHTML = result.html;
        lastSnapshotRef.current = result.html;
        onEdit(pageNumber, result.html);
        // Clear flag after React re-render so useEffect won't overwrite
        requestAnimationFrame(() => { isUndoRedoRef.current = false; });
      }
      return;
    }

    // Redo: Ctrl+Shift+Z or Ctrl+Y
    if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault();
      const el = editorRef.current;
      if (!el) return;
      const result = redo(undoStackRef.current, el.innerHTML);
      if (result.html !== null) {
        undoStackRef.current = result.stack;
        isUndoRedoRef.current = true;
        el.innerHTML = result.html;
        lastSnapshotRef.current = result.html;
        onEdit(pageNumber, result.html);
        // Clear flag after React re-render so useEffect won't overwrite
        requestAnimationFrame(() => { isUndoRedoRef.current = false; });
      }
      return;
    }

    // Cut: Ctrl+X — let browser handle, then snapshot
    if (mod && e.key === 'x') {
      // Don't preventDefault — let browser do the cut
      setTimeout(() => {
        snapshotForUndo();
        if (editorRef.current) onEdit(pageNumber, editorRef.current.innerHTML);
      }, 50);
      return;
    }

    // Paste: Ctrl+V — let browser handle, then snapshot
    if (mod && e.key === 'v') {
      // Don't preventDefault — let browser do the paste
      setTimeout(() => {
        snapshotForUndo();
        if (editorRef.current) onEdit(pageNumber, editorRef.current.innerHTML);
      }, 50);
      return;
    }
  };

  // ── AI image edit ─────────────────────────────────────────────────────────
  const handleEditConfirm = async (
    prompt: string,
    options: { aspectRatio: NonNullable<ImageGenOptions['aspectRatio']>; imageSize: NonNullable<ImageGenOptions['imageSize']> },
  ) => {
    const img = editImgRef.current;
    if (!img) return;
    const [header, data] = img.src.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/png';
    const newDataUrl = await editImage(data, mimeType, prompt, options);
    img.src = newDataUrl;
    if (editorRef.current) onEdit(pageNumber, editorRef.current.innerHTML);
    setEditTarget(null);
    editImgRef.current = null;
  };

  // ── Action bar operations ─────────────────────────────────────────────────
  const deleteSelected = () => {
    const sel = selectedElRef.current;
    if (sel && editorRef.current?.contains(sel)) {
      sel.classList.remove('sel-active');
      sel.remove();
      selectedElRef.current = null;
      setActionBar(null);
      setHandleRects(null);
      onElementSelectRef.current?.(null);
      if (editorRef.current) onEdit(pageNumber, editorRef.current.innerHTML);
    }
  };

  const duplicateSelected = () => {
    const sel = selectedElRef.current;
    if (!sel || !editorRef.current?.contains(sel)) return;
    const clone = sel.cloneNode(true) as HTMLElement;
    sel.after(clone);
    sel.classList.remove('sel-active');
    clone.classList.add('sel-active');
    selectedElRef.current = clone;
    if (editorRef.current) onEdit(pageNumber, editorRef.current.innerHTML);
    requestAnimationFrame(() => {
      refreshActionBar();
      refreshHandles();
      onElementSelectRef.current?.(readElementStyles(clone));
      clone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const deselect = () => {
    selectedElRef.current?.classList.remove('sel-active');
    selectedElRef.current = null;
    setActionBar(null);
    setHandleRects(null);
    onElementSelectRef.current?.(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        id={`page-${pageNumber}`}
        className={compact ? 'h-full flex flex-col' : 'mb-10 relative animate-slide-up group'}
      >
        {!compact && (
          <div className="absolute top-4 right-4 z-10 print:hidden bg-gray-100/80 backdrop-blur-sm text-gray-500 text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full border border-gray-200/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-sm pointer-events-none">
            Page {pageNumber}
          </div>
        )}

        <div
          ref={editorRef}
          contentEditable={!selectionMode}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className={`document-page relative bg-white focus:outline-none flex-1 ${compact ? 'overflow-y-auto' : 'overflow-hidden mx-auto'}${selectionMode ? ' sel-mode' : ''}`}
          style={{
            width:      compact ? '100%' : pageWidth,
            minHeight:  compact ? 'auto' : pageHeight,
            padding:    compact ? '24px 32px' : '12mm 16mm',
            fontFamily: "'Noto Serif Ethiopic', 'Noto Sans Ethiopic', serif",
            fontSize:   '1rem',
            boxSizing:  'border-box',
            lineHeight: '1.6',
            cursor:     selectionMode ? 'default' : undefined,
            userSelect: selectionMode ? 'none' : undefined,
            ...styleOverride,
            // Always enforce page height cap — must come after styleOverride
            ...(compact ? {} : { maxHeight: pageHeight, overflowY: 'hidden' }),
          }}
        />
      </div>

      {/* ── Selection action bar — portalled to body to escape canvas transform ── */}
      {selectionMode && actionBar && createPortal(
        <div
          className={`sel-action-bar${actionBar.below ? ' sel-action-bar--below' : ''}`}
          style={{
            position:  'fixed',
            left:      actionBar.x,
            top:       actionBar.y,
            transform: actionBar.below
              ? 'translateX(-50%)'
              : 'translateX(-50%) translateY(-100%)',
          }}
        >
          <code className="sel-tag">&lt;{actionBar.tag}&gt;</code>
          <div className="sel-action-sep" />

          {/* Edit Text — text-containing elements */}
          {['p','h1','h2','h3','h4','h5','h6','div','li','blockquote','pre'].includes(actionBar.tag) && (
            <button
              className="sel-action-btn"
              onClick={() => {
                const sel = selectedElRef.current;
                if (sel) {
                  const r = sel.getBoundingClientRect();
                  pendingCursorRef.current = { x: r.left + 8, y: r.top + 8 };
                }
                deselect();
                onExitSelectionMode?.();
              }}
              title="Switch to text editing (double-click)"
            >
              Edit Text
            </button>
          )}

          {/* Duplicate */}
          <button
            className="sel-action-btn"
            onClick={duplicateSelected}
            title="Duplicate element (Ctrl+D)"
          >
            <Copy size={11} /> Duplicate
          </button>

          <div className="sel-action-sep" />

          {/* Delete */}
          <button
            className="sel-action-btn sel-action-btn--delete"
            onClick={deleteSelected}
            title="Delete element (Del)"
          >
            <Trash2 size={11} /> Delete
          </button>

          {/* Deselect */}
          <button
            className="sel-action-btn"
            onClick={deselect}
            title="Deselect (Esc)"
          >
            <X size={11} />
          </button>
        </div>,
        document.body
      )}

      {/* ── 8 Resize handles — portalled to body ── */}
      {selectionMode && handleRects && createPortal(
        <div className="sel-handles-overlay">
          {(['nw','n','ne','e','se','s','sw','w'] as const).map(h => {
            const r = handleRects;
            const half = 4.5; // half handle size
            let left = 0, top = 0;
            if (h.includes('w')) left = r.left - half;
            else if (h.includes('e')) left = r.right - half;
            else left = r.left + r.width / 2 - half;
            if (h.includes('n')) top = r.top - half;
            else if (h.includes('s')) top = r.bottom - half;
            else top = r.top + r.height / 2 - half;

            return (
              <div
                key={h}
                className={`sel-handle sel-handle--${h}`}
                style={{ left, top, position: 'fixed' }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const sel = selectedElRef.current;
                  if (!sel) return;
                  if (!sel.style.position || sel.style.position === 'static') {
                    sel.style.position = 'relative';
                  }
                  dragStateRef.current = {
                    mode: 'resize',
                    handle: h,
                    startX: e.clientX,
                    startY: e.clientY,
                    origLeft: parseFloat(sel.style.left || '0'),
                    origTop: parseFloat(sel.style.top || '0'),
                    origWidth: sel.offsetWidth,
                    origHeight: sel.offsetHeight,
                    origScreenRect: sel.getBoundingClientRect(),
                  };
                  sel.classList.add('sel-dragging');
                }}
              />
            );
          })}
        </div>,
        document.body
      )}

      {/* ── Dimension tooltip during resize ── */}
      {dimTip && createPortal(
        <div className="sel-dimension-tip" style={{ left: dimTip.x, top: dimTip.y }}>
          {dimTip.text}
        </div>,
        document.body
      )}

      {/* ── Snap guide lines ── */}
      {snapGuides.length > 0 && createPortal(
        <>
          {snapGuides.map((g, i) =>
            g.type === 'v' ? (
              <div key={`sg-${i}`} className="snap-guide snap-guide--v" style={{
                position: 'fixed', left: g.pos, top: g.extent[0], height: g.extent[1] - g.extent[0],
              }} />
            ) : (
              <div key={`sg-${i}`} className="snap-guide snap-guide--h" style={{
                position: 'fixed', left: g.extent[0], top: g.pos, width: g.extent[1] - g.extent[0],
              }} />
            )
          )}
        </>,
        document.body
      )}

      {editTarget && (
        <ImageEditModal
          target={editTarget}
          onConfirm={handleEditConfirm}
          onClose={() => { setEditTarget(null); editImgRef.current = null; }}
        />
      )}
    </>
  );
}
