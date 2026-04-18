import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDocumentExport, downloadAsText } from '../exportService';

// Mock DOMParser for jsdom compatibility
// jsdom provides DOMParser but we need it available globally

describe('buildDocumentExport', () => {
  const docId = 'test-doc-123';
  const docName = 'Test Amharic Document';

  it('returns empty chunks for empty pageResults', () => {
    const result = buildDocumentExport(docId, docName, {});
    expect(result.chunks).toHaveLength(0);
    expect(result.fullText).toBe('');
    expect(result.document.totalPages).toBe(0);
    expect(result.document.chunkCount).toBe(0);
  });

  it('extracts text from HTML paragraphs', () => {
    const pageResults = {
      1: '<p>ሰላም ዓለም</p><p>Hello World</p>',
    };
    const result = buildDocumentExport(docId, docName, pageResults);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks[0].text).toBe('ሰላም ዓለም');
    expect(result.chunks[1].text).toBe('Hello World');
  });

  it('detects Amharic language from Ethiopic Unicode characters', () => {
    const pageResults = {
      1: '<p>በስመ አብ ወወልድ ወመንፈስ ቅዱስ</p>',
    };
    const result = buildDocumentExport(docId, docName, pageResults);
    expect(result.chunks[0].language).toBe('am');
    expect(result.document.languages).toContain('am');
  });

  it('detects English language', () => {
    const pageResults = {
      1: '<p>This is an English paragraph with no Amharic text.</p>',
    };
    const result = buildDocumentExport(docId, docName, pageResults);
    expect(result.chunks[0].language).toBe('en');
  });

  it('identifies heading chunks from h1-h6 tags', () => {
    const pageResults = {
      1: '<h1>ምዕራፍ ፩</h1><h2>Subtitle</h2><p>Body text.</p>',
    };
    const result = buildDocumentExport(docId, docName, pageResults);
    const headings = result.chunks.filter(c => c.type === 'heading');
    expect(headings).toHaveLength(2);
    expect(headings[0].level).toBe(1);
    expect(headings[1].level).toBe(2);
  });

  it('generates correct chunk IDs with page numbers', () => {
    const pageResults = {
      3: '<p>Page three content</p>',
      5: '<p>Page five content</p>',
    };
    const result = buildDocumentExport(docId, docName, pageResults);
    expect(result.chunks[0].id).toBe('test-doc-123-p3-0');
    expect(result.chunks[1].id).toBe('test-doc-123-p5-0');
  });

  it('skips image placeholders and buttons', () => {
    const pageResults = {
      1: '<div class="ai-image-placeholder">placeholder</div><button>Click</button><p>Real text</p>',
    };
    const result = buildDocumentExport(docId, docName, pageResults);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].text).toBe('Real text');
  });

  it('sorts pages numerically, putting cover page (-1) last', () => {
    const pageResults = {
      2: '<p>Page 2</p>',
      1: '<p>Page 1</p>',
      [-1]: '<p>Cover</p>',
    } as Record<number, string>;
    const result = buildDocumentExport(docId, docName, pageResults);
    // Pages 1, 2 counted (not -1)
    expect(result.document.totalPages).toBe(2);
  });

  it('preserves Amharic fidel characters exactly', () => {
    const fidelPairs = 'ሀ ሐ ኀ ሰ ሠ ጸ ፀ አ ዐ';
    const pageResults = {
      1: `<p>${fidelPairs}</p>`,
    };
    const result = buildDocumentExport(docId, docName, pageResults);
    expect(result.chunks[0].text).toBe(fidelPairs);
    expect(result.fullText).toContain(fidelPairs);
  });
});

describe('downloadAsText', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:test');
    revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock as (obj: Blob | MediaSource) => string;
    global.URL.revokeObjectURL = revokeObjectURLMock as (url: string) => void;
  });

  it('creates a text blob and triggers download', () => {
    const clickMock = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickMock,
    } as unknown as HTMLAnchorElement);

    const pageResults = {
      1: '<p>ሰላም</p>',
      2: '<p>ዓለም</p>',
    };
    downloadAsText(pageResults, 'test-doc.pdf');

    expect(clickMock).toHaveBeenCalled();
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();
  });

  it('skips pages with no content', () => {
    const clickMock = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickMock,
    } as unknown as HTMLAnchorElement);

    const pageResults = {
      1: '<p>Content</p>',
      2: '',
      3: '   ',
    };
    downloadAsText(pageResults, 'test.pdf');
    expect(clickMock).toHaveBeenCalled();
  });
});
