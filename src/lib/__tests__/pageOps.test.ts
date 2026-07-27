import { describe, it, expect } from 'vitest';
import {
  removeAt, insertAt, moveItem, remapPageResults, normalizePageDimensions,
  A4, FRONT_COVER, BACK_COVER, type PageResults,
} from '../pageOps';

describe('removeAt', () => {
  it('removes by index without mutating the input', () => {
    const src = ['a', 'b', 'c'];
    expect(removeAt(src, 1)).toEqual(['a', 'c']);
    expect(src).toEqual(['a', 'b', 'c']);
  });

  it('leaves out-of-range indices alone', () => {
    expect(removeAt(['a', 'b'], 9)).toEqual(['a', 'b']);
    expect(removeAt(['a', 'b'], -1)).toEqual(['a', 'b']);
  });
});

describe('insertAt', () => {
  it('inserts at an index', () => {
    expect(insertAt(['a', 'c'], 1, 'b')).toEqual(['a', 'b', 'c']);
  });

  it('inserting at 0 puts the item first', () => {
    expect(insertAt(['a'], 0, 'z')).toEqual(['z', 'a']);
  });

  it('clamps past the end rather than leaving holes', () => {
    expect(insertAt(['a'], 99, 'z')).toEqual(['a', 'z']);
  });
});

describe('moveItem', () => {
  it('moves forwards and backwards', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('is a no-op for equal or out-of-range indices', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('remapPageResults', () => {
  // A 20-page book where only pages 1, 2 and 5 have been extracted so far.
  const partial: PageResults = { 1: '<p>one</p>', 2: '<p>two</p>', 5: '<p>five</p>' };

  it('keeps sparse results intact when nothing moves', () => {
    expect(remapPageResults(partial, 20, p => p)).toEqual(partial);
  });

  it('does not drop the tail of a partly-extracted document', () => {
    // The original bug: sizing the array by results-key count (3) instead of
    // page count (20) truncated everything past page 3, destroying page 5.
    const out = remapPageResults(partial, 20, p => p);
    expect(out[5]).toBe('<p>five</p>');
  });

  it('reordering a partly-extracted book moves the right page', () => {
    // Move page 5 → position 1. Page 5's HTML must land on page 1, and the
    // pages it jumped over shift down by one.
    const out = remapPageResults(partial, 20, p => moveItem(p, 4, 0));
    expect(out[1]).toBe('<p>five</p>');
    expect(out[2]).toBe('<p>one</p>');
    expect(out[3]).toBe('<p>two</p>');
    expect(out[4]).toBeUndefined();
  });

  it('preserves the front cover', () => {
    const src: PageResults = { [FRONT_COVER]: '<cover/>', 1: 'a' };
    expect(remapPageResults(src, 1, p => p)[FRONT_COVER]).toBe('<cover/>');
  });

  it('preserves the back cover through a reorder', () => {
    // Reorder used to carry key 0 across but silently discard key -1.
    const src: PageResults = { [FRONT_COVER]: '<f/>', [BACK_COVER]: '<b/>', 1: 'a', 2: 'b' };
    const out = remapPageResults(src, 2, p => moveItem(p, 0, 1));
    expect(out[BACK_COVER]).toBe('<b/>');
    expect(out[FRONT_COVER]).toBe('<f/>');
    expect(out[1]).toBe('b');
    expect(out[2]).toBe('a');
  });

  it('preserves the back cover through a delete', () => {
    const src: PageResults = { [BACK_COVER]: '<b/>', 1: 'a', 2: 'b', 3: 'c' };
    const out = remapPageResults(src, 3, p => removeAt(p, 1));
    expect(out[BACK_COVER]).toBe('<b/>');
    expect(out[1]).toBe('a');
    expect(out[2]).toBe('c');
    expect(out[3]).toBeUndefined();
  });

  it('preserves the back cover through an insert', () => {
    const src: PageResults = { [BACK_COVER]: '<b/>', 1: 'a', 2: 'b' };
    const out = remapPageResults(src, 2, p => insertAt(p, 1, undefined));
    expect(out[BACK_COVER]).toBe('<b/>');
    expect(out[1]).toBe('a');
    expect(out[2]).toBeUndefined();   // the new blank page
    expect(out[3]).toBe('b');
  });

  it('deleting page 1 shifts the rest down', () => {
    const src: PageResults = { 1: 'a', 2: 'b', 3: 'c' };
    expect(remapPageResults(src, 3, p => removeAt(p, 0))).toEqual({ 1: 'b', 2: 'c' });
  });

  it('handles an empty document', () => {
    expect(remapPageResults({}, 0, p => p)).toEqual({});
  });

  it('a cover-only document survives an operation on zero pages', () => {
    const src: PageResults = { [FRONT_COVER]: '<f/>' };
    expect(remapPageResults(src, 0, p => p)).toEqual({ [FRONT_COVER]: '<f/>' });
  });

  it('never mutates the input map', () => {
    const src: PageResults = { 1: 'a', 2: 'b' };
    remapPageResults(src, 2, p => removeAt(p, 0));
    expect(src).toEqual({ 1: 'a', 2: 'b' });
  });
});

describe('normalizePageDimensions', () => {
  const A5 = { widthMm: 148, heightMm: 210 };
  const A3 = { widthMm: 297, heightMm: 420 };

  it('round-trips a full, valid list', () => {
    expect(normalizePageDimensions([A5, A3], 2)).toEqual([A5, A3]);
  });

  it('falls back to A4 for documents saved before dimensions were stored', () => {
    // The backward-compat case: page_dimensions comes back NULL from Postgres.
    expect(normalizePageDimensions(null, 3)).toEqual([A4, A4, A4]);
    expect(normalizePageDimensions(undefined, 2)).toEqual([A4, A4]);
    expect(normalizePageDimensions([], 2)).toEqual([A4, A4]);
  });

  it('always returns exactly pageCount entries', () => {
    expect(normalizePageDimensions([A5], 3)).toHaveLength(3);      // short → padded
    expect(normalizePageDimensions([A5, A3, A5], 1)).toHaveLength(1); // long → trimmed
  });

  it('pads a short list with A4 rather than leaving holes', () => {
    expect(normalizePageDimensions([A5], 3)).toEqual([A5, A4, A4]);
  });

  it('replaces unusable entries with A4 instead of rendering a broken page', () => {
    const junk = [null, { widthMm: 0, heightMm: 297 }, { widthMm: 'x', heightMm: 1 }, {}];
    expect(normalizePageDimensions(junk, 4)).toEqual([A4, A4, A4, A4]);
  });

  it('rejects negative and non-finite sizes', () => {
    const bad = [{ widthMm: -210, heightMm: 297 }, { widthMm: NaN, heightMm: 297 }];
    expect(normalizePageDimensions(bad, 2)).toEqual([A4, A4]);
  });

  it('keeps good entries alongside bad ones', () => {
    expect(normalizePageDimensions([A5, null, A3], 3)).toEqual([A5, A4, A3]);
  });

  it('coerces numeric strings, since JSONB round-trips are not always typed', () => {
    expect(normalizePageDimensions([{ widthMm: '148', heightMm: '210' }], 1)).toEqual([A5]);
  });

  it('handles a zero-page document and non-array input', () => {
    expect(normalizePageDimensions([A5], 0)).toEqual([]);
    expect(normalizePageDimensions('nonsense', 1)).toEqual([A4]);
    expect(normalizePageDimensions([A5], -5)).toEqual([]);
  });
});

describe('parallel structures stay aligned', () => {
  // The invariant that actually matters: images, dimensions and results must
  // describe the same page after any operation, or PDF export uses the wrong
  // physical size for every page past the edit.
  const images = ['imgA', 'imgB', 'imgC'];
  const dims = [
    { widthMm: 210, heightMm: 297 },   // A4
    { widthMm: 148, heightMm: 210 },   // A5
    { widthMm: 297, heightMm: 420 },   // A3
  ];
  const results: PageResults = { 1: 'A', 2: 'B', 3: 'C' };

  it('stays aligned through a delete', () => {
    const idx = 0;
    const i = removeAt(images, idx);
    const d = removeAt(dims, idx);
    const r = remapPageResults(results, images.length, p => removeAt(p, idx));
    expect(i).toEqual(['imgB', 'imgC']);
    expect(d[0]).toEqual({ widthMm: 148, heightMm: 210 });  // B is still A5
    expect(r[1]).toBe('B');
    expect(i.length).toBe(d.length);
  });

  it('stays aligned through a reorder', () => {
    const i = moveItem(images, 2, 0);
    const d = moveItem(dims, 2, 0);
    const r = remapPageResults(results, images.length, p => moveItem(p, 2, 0));
    expect(i[0]).toBe('imgC');
    expect(d[0]).toEqual({ widthMm: 297, heightMm: 420 });  // C is still A3
    expect(r[1]).toBe('C');
  });

  it('stays aligned through an insert', () => {
    const idx = 1;
    const inherited = dims[idx - 1];
    const i = insertAt(images, idx, '');
    const d = insertAt(dims, idx, inherited);
    const r = remapPageResults(results, images.length, p => insertAt(p, idx, undefined));
    expect(i.length).toBe(4);
    expect(d.length).toBe(4);
    expect(d[1]).toEqual({ widthMm: 210, heightMm: 297 });  // inherits page 1
    expect(r[2]).toBeUndefined();
    expect(r[3]).toBe('B');
  });
});
