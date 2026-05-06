/**
 * AI Data Export Service
 *
 * Converts extracted HTML page results into clean, structured JSON.
 * General-purpose format — can be used for:
 *   • RAG (Retrieval-Augmented Generation) pipelines
 *   • AI / LLM fine-tuning datasets
 *   • Embedding pipelines (OpenAI, Gemini, Cohere, etc.)
 *   • Full-text search indexing (Elasticsearch, Typesense, pgvector)
 *   • Analytics and content auditing
 *   • Digital archiving with structured metadata
 *
 * Compatible with: LangChain, LlamaIndex, Haystack, any vector DB.
 *
 * Access: only admins can query the exported data.
 * Trigger: auto-saved whenever any user saves a document.
 */

import { authFetch } from '../lib/apiClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ChunkType = 'heading' | 'paragraph' | 'list' | 'table' | 'caption';
export type Language  = 'am' | 'en' | 'mixed' | 'unknown';

export interface ContentChunk {
  id:         string;       // "{docId}-p{page}-{idx}"
  text:       string;       // clean plain text — ready for embedding
  type:       ChunkType;
  level?:     number;       // heading depth 1-6
  pageNumber: number;
  chunkIndex: number;       // sequential within document
  language:   Language;
  wordCount:  number;
  metadata: {               // kept flat for easy vector-DB metadata filtering
    document:  string;
    page:      number;
    type:      ChunkType;
    level?:    number;
  };
}

export interface ExportDocument {
  document: {
    id:          string;
    name:        string;
    totalPages:  number;
    exportedAt:  string;    // ISO datetime
    languages:   Language[];
    source:      'OCR' | 'digital';
    chunkCount:  number;
  };
  chunks:   ContentChunk[];
  fullText: string;         // all text joined — useful for BM25 / keyword search
}

export interface ExportMeta {
  id:           string;
  documentName: string;
  userId:       string;
  userEmail?:   string;
  pageCount:    number;
  chunkCount:   number;
  languages:    string[];
  exportedAt:   string;
  updatedAt:    string;
}

// ---------------------------------------------------------------------------
// Language detection — Ethiopic Unicode block: U+1200–U+137F
// ---------------------------------------------------------------------------
function detectLanguage(text: string): Language {
  if (!text.trim()) return 'unknown';
  const chars = text.replace(/\s/g, '');
  if (!chars.length) return 'unknown';
  let am = 0, latin = 0;
  for (const ch of chars) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x1200 && cp <= 0x137F) am++;
    else if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) latin++;
  }
  const total = chars.length;
  const amR = am / total, latR = latin / total;
  if (amR > 0.4)                       return 'am';
  if (latR > 0.4)                      return 'en';
  if (amR > 0.1 || latR > 0.1)        return 'mixed';
  return 'unknown';
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// HTML → ContentChunks  (runs in the browser via DOMParser)
// ---------------------------------------------------------------------------
function htmlToChunks(
  html:       string,
  docId:      string,
  docName:    string,
  pageNumber: number,
): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  if (!html?.trim()) return chunks;

  const doc  = new DOMParser().parseFromString(html, 'text/html');
  let   idx  = 0;

  const push = (text: string, type: ChunkType, level?: number) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length < 2) return;
    chunks.push({
      id:         `${docId}-p${pageNumber}-${idx}`,
      text:       clean,
      type,
      level,
      pageNumber,
      chunkIndex: idx++,
      language:   detectLanguage(clean),
      wordCount:  wordCount(clean),
      metadata:   { document: docName, page: pageNumber, type, ...(level ? { level } : {}) },
    });
  };

  const walk = (el: Element) => {
    const tag = el.tagName?.toLowerCase() ?? '';
    if (['img','svg','style','script','button','input'].includes(tag)) return;
    if (el.classList.contains('ai-image-placeholder')) return;

    if (/^h[1-6]$/.test(tag)) { push(el.textContent ?? '', 'heading', parseInt(tag[1])); return; }
    if (tag === 'p')           { push(el.textContent ?? '', 'paragraph'); return; }
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.querySelectorAll('li')).map(li => li.textContent?.trim()).filter(Boolean).join(' | ');
      push(items, 'list');
      return;
    }
    if (tag === 'table') {
      const cells = Array.from(el.querySelectorAll('td,th')).map(c => c.textContent?.trim()).filter(Boolean).join(' | ');
      push(cells, 'table');
      return;
    }
    if (tag === 'figcaption') { push(el.textContent ?? '', 'caption'); return; }
    for (const child of Array.from(el.children)) walk(child as Element);
  };

  for (const child of Array.from(doc.body.children)) walk(child as Element);
  return chunks;
}

// ---------------------------------------------------------------------------
// Build the full export document from pageResults
// ---------------------------------------------------------------------------
export function buildDocumentExport(
  docId:       string,
  docName:     string,
  pageResults: Record<number, string>,
  source:      'OCR' | 'digital' = 'OCR',
): ExportDocument {
  const allChunks: ContentChunk[] = [];
  const textParts: string[] = [];
  const langSet   = new Set<Language>();

  const sortedKeys = Object.keys(pageResults)
    .map(Number)
    .sort((a, b) => (a === -1 ? 1 : b === -1 ? -1 : a - b));

  for (const pageNum of sortedKeys) {
    const html = pageResults[pageNum];
    if (!html) continue;
    const chunks = htmlToChunks(html, docId, docName, pageNum);
    for (const c of chunks) {
      allChunks.push(c);
      textParts.push(c.text);
      if (c.language !== 'unknown') langSet.add(c.language);
    }
  }

  const contentPages = sortedKeys.filter(n => n > 0).length;
  const usedLangs    = langSet.size > 0 ? [...langSet] : ['unknown' as Language];

  return {
    document: {
      id:         docId,
      name:       docName,
      totalPages: contentPages,
      exportedAt: new Date().toISOString(),
      languages:  usedLangs,
      source,
      chunkCount: allChunks.length,
    },
    chunks:   allChunks,
    fullText: textParts.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// DB helpers — all routed through server-side API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Upsert export — called on every Save (so admin always has latest version)
// ---------------------------------------------------------------------------
export async function saveDocumentExport(
  docId:     string,
  exported:  ExportDocument,
): Promise<void> {
  await authFetch('/api/exports?action=save', {
    method: 'POST',
    body: JSON.stringify({ docId, exported }),
  });
}

// ---------------------------------------------------------------------------
// Admin — list all exports (no large JSON payloads)
// ---------------------------------------------------------------------------
export async function listExports(): Promise<ExportMeta[]> {
  const res = await authFetch('/api/exports?action=list');
  return res.json();
}

// ---------------------------------------------------------------------------
// Admin — fetch full JSON for one document
// ---------------------------------------------------------------------------
export async function getExportJson(docId: string): Promise<ExportDocument | null> {
  const res = await authFetch(`/api/exports?action=get&docId=${encodeURIComponent(docId)}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Admin — delete export
// ---------------------------------------------------------------------------
export async function deleteExport(docId: string): Promise<void> {
  await authFetch(`/api/exports?action=delete&docId=${encodeURIComponent(docId)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Admin — aggregate stats
// ---------------------------------------------------------------------------
export async function getExportStats(): Promise<{ totalExports: number; totalChunks: number; totalPages: number }> {
  const res = await authFetch('/api/exports?action=stats');
  return res.json();
}

// ---------------------------------------------------------------------------
// Client-side download — triggers browser file save
// ---------------------------------------------------------------------------
export function downloadExportJson(exported: ExportDocument, fileName: string): void {
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName.replace(/\.[^.]+$/, '') + '.ai-data.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Download as plain .txt — clean Amharic text with page separators
// ---------------------------------------------------------------------------
export function downloadAsText(
  pageResults: Record<number, string>,
  fileName:    string,
): void {
  const sortedKeys = Object.keys(pageResults)
    .map(Number)
    .filter(n => n > 0)
    .sort((a, b) => a - b);

  const parts: string[] = [];
  for (const pageNum of sortedKeys) {
    const html = pageResults[pageNum];
    if (!html?.trim()) continue;
    // Strip HTML → plain text via DOMParser
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    // Remove image placeholders and buttons
    doc.querySelectorAll('.ai-image-placeholder, button, img, svg, style, script').forEach(el => el.remove());
    const text = (doc.body.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (text) {
      parts.push(`──── Page ${pageNum} ────\n\n${text}`);
    }
  }

  const fullText = parts.join('\n\n');
  const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName.replace(/\.[^.]+$/, '') + '.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Download as .docx — real Word document using the docx package
// ---------------------------------------------------------------------------

/** Parse HTML string into DOM elements via DOMParser, stripping non-content nodes. */
function htmlToElements(html: string): Element[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('.ai-image-placeholder, button, img, svg, style, script').forEach(el => el.remove());
  return Array.from(doc.body.children);
}

/** Convert a single DOM element to docx Paragraph(s). */
function elementToParagraphs(
  el: Element,
  docx: { Paragraph: typeof import('docx').Paragraph; TextRun: typeof import('docx').TextRun; HeadingLevel: typeof import('docx').HeadingLevel; AlignmentType: typeof import('docx').AlignmentType },
): import('docx').Paragraph[] {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  const tag = el.tagName?.toLowerCase() ?? '';
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  // Heading detection
  const headingMap: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
    h4: HeadingLevel.HEADING_4,
    h5: HeadingLevel.HEADING_5,
    h6: HeadingLevel.HEADING_6,
  };

  if (headingMap[tag]) {
    return [new Paragraph({
      heading: headingMap[tag],
      children: [new TextRun({ text, font: 'Noto Serif Ethiopic', bold: true })],
      alignment: AlignmentType.CENTER,
    })];
  }

  // List items — flatten into bullet paragraphs
  if (tag === 'ul' || tag === 'ol') {
    return Array.from(el.querySelectorAll('li')).map(li => {
      const liText = (li.textContent ?? '').trim();
      if (!liText) return null;
      return new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: liText, font: 'Noto Serif Ethiopic', size: 24 })],
      });
    }).filter(Boolean) as import('docx').Paragraph[];
  }

  // Table — flatten cells into a single paragraph (docx tables are complex, keep it simple)
  if (tag === 'table') {
    const cells = Array.from(el.querySelectorAll('td, th'))
      .map(c => (c.textContent ?? '').trim())
      .filter(Boolean);
    if (!cells.length) return [];
    return [new Paragraph({
      children: [new TextRun({ text: cells.join(' | '), font: 'Noto Serif Ethiopic', size: 24 })],
    })];
  }

  // Paragraph or generic block — detect bold/italic from inline styles or tags
  const hasBold = el.querySelector('b, strong') !== null ||
    (el as HTMLElement).style?.fontWeight === 'bold' ||
    (el as HTMLElement).style?.fontWeight === '900';
  const hasItalic = el.querySelector('i, em') !== null ||
    (el as HTMLElement).style?.fontStyle === 'italic';

  return [new Paragraph({
    children: [new TextRun({
      text,
      font: 'Noto Serif Ethiopic',
      size: 24, // 12pt
      bold: hasBold,
      italics: hasItalic,
    })],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160 }, // 8pt
  })];
}

export async function downloadAsDocx(
  pageResults: Record<number, string>,
  fileName:    string,
): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, PageBreak, AlignmentType, HeadingLevel } = await import('docx');
  const { saveAs } = await import('file-saver');

  const sortedKeys = Object.keys(pageResults)
    .map(Number)
    .filter(n => n > 0)
    .sort((a, b) => a - b);

  const allParagraphs: import('docx').Paragraph[] = [];

  for (let i = 0; i < sortedKeys.length; i++) {
    const pageNum = sortedKeys[i];
    const html = pageResults[pageNum];
    if (!html?.trim()) continue;

    // Page separator header
    allParagraphs.push(new Paragraph({
      children: [new TextRun({ text: `Page ${pageNum}`, color: '999999', size: 20, font: 'Arial' })],
      spacing: { after: 240 },
      alignment: AlignmentType.LEFT,
    }));

    // Convert HTML elements to docx paragraphs
    const elements = htmlToElements(html);
    for (const el of elements) {
      allParagraphs.push(...elementToParagraphs(el, { Paragraph, TextRun, HeadingLevel, AlignmentType }));
    }

    // Page break between pages (except last)
    if (i < sortedKeys.length - 1) {
      allParagraphs.push(new Paragraph({
        children: [new PageBreak()],
      }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: allParagraphs,
    }],
    styles: {
      default: {
        document: {
          run: {
            font: 'Noto Serif Ethiopic',
            size: 24, // 12pt
          },
          paragraph: {
            spacing: { line: 384 }, // 1.6x line height (240 * 1.6)
          },
        },
      },
    },
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName.replace(/\.[^.]+$/, '') + '.docx');
}
