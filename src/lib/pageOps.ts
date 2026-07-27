/**
 * Page-list operations shared by delete / insert / reorder.
 *
 * A document is held as three parallel structures that must stay index-aligned:
 *   pageImages[i]      — base64 scan for page i+1
 *   pageDimensions[i]  — physical size of page i+1 (drives layout AND PDF export)
 *   pageResults[n]     — extracted HTML for page n (1-based, sparse)
 *
 * Anything that reorders or resizes the document has to apply the *same*
 * transform to all three. These helpers exist so that transform can be written
 * once and handed to each structure, rather than reimplemented three times.
 */

/** Sparse map of page number → HTML. Key 0 is the front cover, -1 the back cover. */
export type PageResults = Record<number, string>;

export const FRONT_COVER = 0;
export const BACK_COVER = -1;

/** Physical page size in millimetres. Structurally identical to
 *  pdfService's PageDimension, redeclared here so this module stays free of
 *  the pdfjs import chain. */
export interface PageSize {
  widthMm: number;
  heightMm: number;
}

export const A4: PageSize = { widthMm: 210, heightMm: 297 };

/** 1 PDF point = 1/72 inch = 25.4/72 mm ≈ 0.3528 mm */
const PT_TO_MM = 25.4 / 72;

/**
 * Convert a PDF page's size from points to millimetres.
 *
 * Callers should pass an *unscaled* viewport, which already accounts for page
 * rotation — so a rotated or landscape page reports its visual size rather than
 * its pre-rotation one. A page reporting a size we can't use (zero, negative,
 * NaN from a malformed file) falls back to A4 rather than producing a sliver
 * that would break both the on-screen layout and the PDF export.
 */
export function pointsToPageSize(widthPt: number, heightPt: number): PageSize {
  const widthMm  = widthPt  * PT_TO_MM;
  const heightMm = heightPt * PT_TO_MM;
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
    return A4;
  }
  return {
    widthMm:  Math.round(widthMm  * 100) / 100,
    heightMm: Math.round(heightMm * 100) / 100,
  };
}

/**
 * Coerce a stored/partial dimension list into exactly `pageCount` valid entries.
 *
 * Documents saved before dimensions were persisted have none at all, and a list
 * can also be short or hold junk from an older schema. Anything missing or
 * unusable becomes A4 — the same assumption the app made before, so old
 * documents keep rendering exactly as they did.
 */
export function normalizePageDimensions(
  dims: unknown,
  pageCount: number,
): PageSize[] {
  const src = Array.isArray(dims) ? dims : [];
  return Array.from({ length: Math.max(0, pageCount) }, (_, i) => {
    const d = src[i] as Partial<PageSize> | undefined;
    const w = Number(d?.widthMm);
    const h = Number(d?.heightMm);
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
      ? { widthMm: w, heightMm: h }
      : A4;
  });
}

/** Remove one item by 0-based index. Out-of-range indices leave the array as-is. */
export function removeAt<T>(arr: readonly T[], index: number): T[] {
  if (index < 0 || index >= arr.length) return [...arr];
  const next = [...arr];
  next.splice(index, 1);
  return next;
}

/** Insert one item at a 0-based index, clamped to the ends of the array. */
export function insertAt<T>(arr: readonly T[], index: number, item: T): T[] {
  const next = [...arr];
  next.splice(Math.max(0, Math.min(index, arr.length)), 0, item);
  return next;
}

/** Move one item between 0-based indices. Out-of-range indices leave it as-is. */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) {
    return [...arr];
  }
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Remap the content pages (keys 1..totalPages) of a results map through an
 * array transform, carrying both covers across untouched.
 *
 * `totalPages` MUST come from the page-image array, never from the results map.
 * Results are sparse — only extracted pages appear — so counting its keys
 * undercounts a partly-extracted document and silently drops the tail. That was
 * a real bug: reordering a 20-page book with 3 pages extracted destroyed
 * everything past page 3.
 */
export function remapPageResults(
  prev: PageResults,
  totalPages: number,
  transform: (pages: (string | undefined)[]) => (string | undefined)[],
): PageResults {
  const pages = Array.from({ length: Math.max(0, totalPages) }, (_, i) => prev[i + 1]);
  const next: PageResults = {};
  // Covers are not part of the page sequence and must survive every operation.
  if (prev[FRONT_COVER] !== undefined) next[FRONT_COVER] = prev[FRONT_COVER];
  if (prev[BACK_COVER]  !== undefined) next[BACK_COVER]  = prev[BACK_COVER];
  transform(pages).forEach((html, i) => {
    if (html !== undefined) next[i + 1] = html;
  });
  return next;
}
