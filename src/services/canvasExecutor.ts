// DOM manipulation engine for AI-powered print document editing.
// Works on HTML strings (via DOMParser) — not live DOM — to avoid
// React state conflicts. All styles are applied inline.

import { autoFillImagePlaceholders, generateCoverBackground, improveCoverBackground, buildEditableCoverHTML, type CoverStyle, type BindingType } from './geminiService';
import type {
  GetDocumentStructureParams,
  EditTextBlockParams,
  EditImageFrameParams,
  SetColumnLayoutParams,
  InsertElementParams,
  DeleteElementParams,
  BatchEditParams,
  GetPageScreenshotParams,
  SetActivePageParams,
} from './canvasTools';

// ── Context provided by App.tsx ────────────────────────────────────────────
export interface CanvasContext {
  getPageHTML:       (pageNumber: number) => string;
  getPageImage:      (pageNumber: number) => string;   // raw base64 of original scan
  getActivePage:     () => number;
  getTotalPages:     () => number;
  onEdit:            (pageNumber: number, html: string) => void;
  onSetActivePage:   (pageNumber: number) => void;
  captureScreenshot: (pageNumber: number) => Promise<string>;
  /** Trigger Gemini OCR on a page. force=true re-extracts even if already done. */
  extractPage:       (pageNumber: number, force?: boolean) => Promise<string>;
  /** Called before OCR starts on a page — use to show scan animation */
  onExtractStart?:   (pageNumber: number) => void;
  /** Called after OCR finishes on a page — use to hide scan animation */
  onExtractEnd?:     (pageNumber: number) => void;
}

// ── Element node in structure tree ────────────────────────────────────────
interface ElementNode {
  id:       string;
  tag:      string;
  text:     string;
  styles:   Record<string, string>;
  children: ElementNode[];
}

// ── Stable ID counter (persists across calls within a session) ────────────
let _idCounter = 0;
const nextCanvasId = () => `cv-${++_idCounter}`;

// ── Annotate all un-tagged elements with data-canvas-id ──────────────────
function annotateDOM(root: Element): void {
  if (!root.getAttribute('data-canvas-id')) {
    root.setAttribute('data-canvas-id', nextCanvasId());
  }
  root.querySelectorAll('*').forEach(el => {
    if (!el.getAttribute('data-canvas-id')) {
      el.setAttribute('data-canvas-id', nextCanvasId());
    }
  });
}

// ── Build a compact element tree for Gemini to read ──────────────────────
function buildTree(el: Element, depth = 0): ElementNode {
  const styleAttr = el.getAttribute('style') ?? '';
  const styles: Record<string, string> = {};
  styleAttr.split(';').forEach(rule => {
    const sep = rule.indexOf(':');
    if (sep > 0) {
      styles[rule.slice(0, sep).trim()] = rule.slice(sep + 1).trim();
    }
  });
  return {
    id:       el.getAttribute('data-canvas-id') ?? '',
    tag:      el.tagName.toLowerCase(),
    text:     (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    styles,
    children: depth < 3
      ? Array.from(el.children).map(c => buildTree(c, depth + 1))
      : [],
  };
}

// ── Find element by data-canvas-id ────────────────────────────────────────
function findById(root: Element, id: string): Element | null {
  if (id === 'root' || !id) return root;
  return root.querySelector(`[data-canvas-id="${CSS.escape(id)}"]`);
}

// ── Apply CSS property map to an element's inline style ──────────────────
function applyStyles(el: HTMLElement, styles: Record<string, string>): void {
  Object.entries(styles).forEach(([prop, value]) => {
    el.style.setProperty(prop, value);
  });
}

// ── CanvasExecutor ─────────────────────────────────────────────────────────
export class CanvasExecutor {
  private ctx: CanvasContext;
  constructor(ctx: CanvasContext) { this.ctx = ctx; }

  // Parse HTML into a temporary document, annotate, return root + doc
  private parse(html: string): { doc: Document; root: HTMLElement } {
    const doc  = new DOMParser().parseFromString(
      `<div id="__root__">${html}</div>`,
      'text/html',
    );
    const root = doc.getElementById('__root__') as HTMLElement;
    annotateDOM(root);
    return { doc, root };
  }

  // Serialize root inner HTML back to string
  private serial(root: Element): string {
    return root.innerHTML;
  }

  // ── Tools ────────────────────────────────────────────────────────────────

  getDocumentStructure({ pageNumber }: GetDocumentStructureParams): string {
    const html = this.ctx.getPageHTML(pageNumber);
    if (!html) {
      return JSON.stringify({ error: `Page ${pageNumber} has no extracted content yet.` });
    }
    const { root } = this.parse(html);
    // Save annotated HTML so future calls use stable IDs
    this.ctx.onEdit(pageNumber, this.serial(root));
    const tree = Array.from(root.children).map(c => buildTree(c));
    return JSON.stringify({
      pageNumber,
      elementCount: root.querySelectorAll('*').length,
      tree,
    });
  }

  editTextBlock(p: EditTextBlockParams, page: number): string {
    const html = this.ctx.getPageHTML(page);
    console.log(`[CanvasExecutor] editTextBlock page=${page}, selector="${p.selector}", htmlLength=${html?.length ?? 0}`);
    if (!html) return JSON.stringify({ error: `Page ${page} has no content to edit.` });

    // Guard: applying style patches to the root container leaks via CSS
    // inheritance (e.g. `color: blue` on the root div paints every descendant).
    // The model sometimes passes selector='root' or '' as a shortcut — reject
    // that for style edits and force it to pick the specific child id returned
    // by getDocumentStructure.
    const isRootSelector = !p.selector || p.selector === 'root' || p.selector === '__root__';
    const hasStylePatch = !!(p.fontSize || p.lineHeight || p.color || p.textAlign || p.fontWeight ||
      p.fontStyle || p.marginTop || p.marginBottom || p.letterSpacing || p.textTransform ||
      p.border || p.borderRadius || p.padding !== undefined || p.background || p.display || p.width);
    if (isRootSelector && hasStylePatch) {
      return JSON.stringify({
        error: 'Refusing to apply style to the page root — it would inherit to every element. ' +
               'Call getDocumentStructure first, then pass the specific child id ' +
               '(e.g. the <h1> id for a title color change).',
      });
    }

    const { root } = this.parse(html);
    const el = findById(root, p.selector) as HTMLElement | null;
    if (!el) {
      const ids = Array.from(root.querySelectorAll('[data-canvas-id]')).map(e => e.getAttribute('data-canvas-id')).slice(0, 10);
      console.log(`[CanvasExecutor] Element not found. Available IDs:`, ids);
      return JSON.stringify({ error: `Element "${p.selector}" not found. Call getDocumentStructure first to get valid IDs.` });
    }

    if (p.content !== undefined) el.innerHTML = p.content;

    const styleMap: Record<string, string> = {};
    if (p.fontSize)      styleMap['font-size']      = p.fontSize;
    if (p.lineHeight)    styleMap['line-height']     = p.lineHeight;
    if (p.color)         styleMap['color']           = p.color;
    if (p.textAlign)     styleMap['text-align']      = p.textAlign;
    if (p.fontWeight)    styleMap['font-weight']     = p.fontWeight;
    if (p.fontStyle)     styleMap['font-style']      = p.fontStyle;
    if (p.marginTop)     styleMap['margin-top']      = p.marginTop;
    if (p.marginBottom)  styleMap['margin-bottom']   = p.marginBottom;
    if (p.letterSpacing) styleMap['letter-spacing']  = p.letterSpacing;
    if (p.textTransform) styleMap['text-transform']  = p.textTransform;
    if (p.border)        styleMap['border']          = p.border;
    if (p.borderRadius)  styleMap['border-radius']   = p.borderRadius;
    if (p.padding !== undefined) styleMap['padding']  = p.padding;
    if (p.background)    styleMap['background']      = p.background;
    if (p.display)       styleMap['display']         = p.display;
    if (p.width)         styleMap['width']           = p.width;
    if (Object.keys(styleMap).length > 0) applyStyles(el, styleMap);

    this.ctx.onEdit(page, this.serial(root));
    return JSON.stringify({ success: true, selector: p.selector, changed: Object.keys(styleMap) });
  }

  editImageFrame(p: EditImageFrameParams, page: number): string {
    const { root } = this.parse(this.ctx.getPageHTML(page));
    const el = findById(root, p.selector) as HTMLElement | null;
    if (!el) return JSON.stringify({ error: `Element "${p.selector}" not found` });

    const styleMap: Record<string, string> = {};
    if (p.width)     styleMap['width']      = p.width;
    if (p.maxWidth)  styleMap['max-width']  = p.maxWidth;
    if (p.objectFit) styleMap['object-fit'] = p.objectFit;
    if (p.display)   styleMap['display']    = p.display;
    if (Object.keys(styleMap).length > 0) applyStyles(el, styleMap);

    this.ctx.onEdit(page, this.serial(root));
    return JSON.stringify({ success: true, selector: p.selector });
  }

  setColumnLayout(p: SetColumnLayoutParams, page: number): string {
    const { root } = this.parse(this.ctx.getPageHTML(page));
    const el = findById(root, p.selector) as HTMLElement | null;
    if (!el) return JSON.stringify({ error: `Element "${p.selector}" not found` });

    if (p.columns === 1) {
      el.style.removeProperty('column-count');
      el.style.removeProperty('column-gap');
    } else {
      el.style.setProperty('column-count', String(p.columns));
      el.style.setProperty('column-gap', p.gap ?? '2rem');
    }
    this.ctx.onEdit(page, this.serial(root));
    return JSON.stringify({ success: true, columns: p.columns });
  }

  insertElement(p: InsertElementParams, page: number): string {
    const { doc, root } = this.parse(this.ctx.getPageHTML(page));
    const newEl = doc.createElement(p.elementType) as HTMLElement;
    newEl.setAttribute('data-canvas-id', nextCanvasId());
    if (p.content) newEl.innerHTML = p.content;
    if (p.styles) applyStyles(newEl, p.styles);

    const parent = findById(root, p.parentSelector);
    if (!parent) return JSON.stringify({ error: `Parent "${p.parentSelector}" not found` });

    if (p.position === 'prepend') {
      parent.prepend(newEl);
    } else if (p.position === 'append') {
      parent.append(newEl);
    } else {
      if (!p.siblingSelector) {
        return JSON.stringify({ error: 'siblingSelector required for before/after' });
      }
      const sib = findById(root, p.siblingSelector);
      if (!sib) return JSON.stringify({ error: `Sibling "${p.siblingSelector}" not found` });
      if (p.position === 'before') sib.before(newEl);
      else sib.after(newEl);
    }

    this.ctx.onEdit(page, this.serial(root));
    return JSON.stringify({ success: true, newId: newEl.getAttribute('data-canvas-id') });
  }

  deleteElement(p: DeleteElementParams, page: number): string {
    const { root } = this.parse(this.ctx.getPageHTML(page));
    const el = findById(root, p.selector);
    if (!el) return JSON.stringify({ error: `Element "${p.selector}" not found` });
    el.remove();
    this.ctx.onEdit(page, this.serial(root));
    return JSON.stringify({ success: true });
  }

  async batchEdit(p: BatchEditParams, page: number): Promise<string> {
    // Use a local HTML snapshot so each operation builds on the previous one
    // (React state ref won't update until after the batch completes)
    let currentHTML = this.ctx.getPageHTML(page);
    const localCtx: CanvasContext = {
      ...this.ctx,
      getPageHTML: (n) => n === page ? currentHTML : this.ctx.getPageHTML(n),
      onEdit: (n, html) => {
        if (n === page) currentHTML = html;
        // Don't call real onEdit per-op — we commit once at end
      },
    };
    const localExec = new CanvasExecutor(localCtx);

    const results: unknown[] = [];
    for (const op of p.operations) {
      try {
        const r = localExec.execute(op.tool, op.params, page);
        results.push(JSON.parse(typeof r === 'string' ? r : await r));
      } catch (e) {
        results.push({ error: String(e), tool: op.tool });
      }
    }
    // Commit the accumulated result once
    this.ctx.onEdit(page, currentHTML);
    return JSON.stringify({ batchResults: results });
  }

  async getPageScreenshot(p: GetPageScreenshotParams): Promise<string> {
    try {
      const dataUrl = await this.ctx.captureScreenshot(p.pageNumber);
      return JSON.stringify({ success: true, preview: dataUrl.slice(0, 60) + '…' });
    } catch (e) {
      return JSON.stringify({ error: String(e) });
    }
  }

  setActivePage(p: SetActivePageParams): string {
    this.ctx.onSetActivePage(p.pageNumber);
    return JSON.stringify({ success: true, pageNumber: p.pageNumber });
  }

  async extractPage(p: { pageNumber: number; force?: boolean }): Promise<string> {
    // Navigate to the page being extracted so the user sees it
    this.ctx.onSetActivePage(p.pageNumber);
    this.ctx.onExtractStart?.(p.pageNumber);
    try {
      return await this.ctx.extractPage(p.pageNumber, p.force ?? false);
    } catch (e) {
      return JSON.stringify({ error: String(e) });
    } finally {
      this.ctx.onExtractEnd?.(p.pageNumber);
    }
  }

  async autoFillImages(p: { pageNumber?: number }): Promise<string> {
    const page = p.pageNumber ?? this.ctx.getActivePage();
    const html  = this.ctx.getPageHTML(page);
    if (!html) return JSON.stringify({ error: `Page ${page} not extracted yet. Run extractPage first.` });
    const scan  = this.ctx.getPageImage(page);
    if (!scan) return JSON.stringify({ error: `No scan image available for page ${page}.` });
    const { html: filled, filled: count } = await autoFillImagePlaceholders(html, scan);
    if (count > 0) this.ctx.onEdit(page, filled);
    return JSON.stringify({ success: true, pageNumber: page, imagesFound: count });
  }

  async extractAllPages(p: { force?: boolean }): Promise<string> {
    const total = this.ctx.getTotalPages();
    if (total === 0) return JSON.stringify({ error: 'No document loaded. Upload a PDF or image first.' });
    const results: string[] = [];
    for (let n = 1; n <= total; n++) {
      try {
        const r = JSON.parse(await this.ctx.extractPage(n, p.force ?? false)) as { cached?: boolean; extracted?: boolean; error?: string };
        results.push(`Page ${n}: ${r.error ? `error — ${r.error}` : r.cached ? 'cached' : 'extracted'}`);
      } catch (e) {
        results.push(`Page ${n}: error — ${String(e)}`);
      }
    }
    return JSON.stringify({ success: true, totalPages: total, results });
  }

  // ── Cover page generation via NanoBanana 2 ──────────────────────────
  async generateCover(args: Record<string, unknown>): Promise<string> {
    const mode         = (args.mode as string) ?? 'generate';
    const title        = (args.title as string) ?? '';
    const subtitle     = (args.subtitle as string) ?? undefined;
    const author       = (args.author as string) ?? undefined;
    const style        = ((args.style as string) ?? 'classic') as CoverStyle;
    const binding      = ((args.binding as string) ?? 'saddle-stitch') as BindingType;
    const customPrompt = (args.customPrompt as string) ?? undefined;
    const instruction  = (args.instruction as string) ?? '';

    try {
      let bgDataUrl: string;

      if (mode === 'improve') {
        // Get existing background from page 0
        const existingHtml = this.ctx.getPageHTML(0);
        const match = existingHtml?.match(/url\('(data:image\/[^']+)'\)/);
        if (!match?.[1]) {
          return JSON.stringify({ error: 'No existing cover background found on page 0. Use mode "generate" instead.' });
        }
        bgDataUrl = await improveCoverBackground(match[1], instruction || 'Improve the design quality, colors, and visual appeal of the background.');
      } else {
        if (!title) return JSON.stringify({ error: 'Title is required for cover generation.' });
        bgDataUrl = await generateCoverBackground({ title, subtitle, author, style, binding, customPrompt });
      }

      // Build editable HTML and apply as page 0
      const coverHtml = buildEditableCoverHTML(bgDataUrl, { title, subtitle, author, style, binding, customPrompt });
      this.ctx.onEdit(0, coverHtml);
      this.ctx.onSetActivePage(0);

      return JSON.stringify({ success: true, mode, binding, message: `Cover page ${mode === 'improve' ? 'improved' : 'generated'} with ${binding} binding and applied to page 0. Text is editable.` });
    } catch (e) {
      return JSON.stringify({ error: `Cover generation failed: ${String(e)}` });
    }
  }

  // ── Main dispatcher called by geminiService / MCP ──────────────────────
  execute(
    toolName: string,
    args: Record<string, unknown>,
    pageNumber?: number,
  ): string | Promise<string> {
    const page = pageNumber ?? this.ctx.getActivePage();
    console.log(`[CanvasExecutor] execute: ${toolName}`, { page, args });
    switch (toolName) {
      case 'getDocumentStructure': return this.getDocumentStructure(args as unknown as GetDocumentStructureParams);
      case 'editTextBlock':        return this.editTextBlock(args as unknown as EditTextBlockParams, page);
      case 'editImageFrame':       return this.editImageFrame(args as unknown as EditImageFrameParams, page);
      case 'setColumnLayout':      return this.setColumnLayout(args as unknown as SetColumnLayoutParams, page);
      case 'insertElement':        return this.insertElement(args as unknown as InsertElementParams, page);
      case 'deleteElement':        return this.deleteElement(args as unknown as DeleteElementParams, page);
      case 'batchEdit':            return this.batchEdit(args as unknown as BatchEditParams, page);
      case 'getPageScreenshot':    return this.getPageScreenshot(args as unknown as GetPageScreenshotParams);
      case 'setActivePage':        return this.setActivePage(args as unknown as SetActivePageParams);
      case 'extractPage':           return this.extractPage(args as unknown as { pageNumber: number; force?: boolean });
      case 'extractAllPages':       return this.extractAllPages(args as unknown as { force?: boolean });
      case 'autoFillImages':        return this.autoFillImages(args as unknown as { pageNumber?: number });
      case 'getTotalPages':         return JSON.stringify({ totalPages: this.ctx.getTotalPages() });
      case '_generateCover':         return this.generateCover(args as Record<string, unknown>);
      case 'openCoverSetup':        return JSON.stringify({ success: true, needsUI: true, message: 'Opening cover setup…' });
      default:                      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  }
}
