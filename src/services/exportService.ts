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

import { sql } from '../lib/neon';

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
// DB helpers
// ---------------------------------------------------------------------------
let _schemaPromise: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  return (_schemaPromise ??= sql`
    CREATE TABLE IF NOT EXISTS ai_exports (
      id            TEXT PRIMARY KEY,
      document_name TEXT        NOT NULL,
      user_id       TEXT        NOT NULL,
      page_count    INTEGER     NOT NULL DEFAULT 0,
      chunk_count   INTEGER     NOT NULL DEFAULT 0,
      languages     TEXT[]      NOT NULL DEFAULT '{}',
      export_json   JSONB       NOT NULL,
      exported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.then(() => {}));
}

// ---------------------------------------------------------------------------
// Upsert export — called on every Save (so admin always has latest version)
// ---------------------------------------------------------------------------
export async function saveDocumentExport(
  docId:     string,
  userId:    string,
  exported:  ExportDocument,
): Promise<void> {
  await ensureTable();
  const { document: meta, chunks } = exported;
  await sql`
    INSERT INTO ai_exports
      (id, document_name, user_id, page_count, chunk_count, languages, export_json, exported_at, updated_at)
    VALUES (
      ${docId}, ${meta.name}, ${userId},
      ${meta.totalPages}, ${meta.chunkCount},
      ${meta.languages as unknown as string},
      ${JSON.stringify({ document: meta, chunks })}::jsonb,
      NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE
      SET document_name = EXCLUDED.document_name,
          page_count    = EXCLUDED.page_count,
          chunk_count   = EXCLUDED.chunk_count,
          languages     = EXCLUDED.languages,
          export_json   = EXCLUDED.export_json,
          updated_at    = NOW()
  `;
}

// ---------------------------------------------------------------------------
// Admin — list all exports (no large JSON payloads)
// ---------------------------------------------------------------------------
export async function listExports(): Promise<ExportMeta[]> {
  await ensureTable();
  const rows = await sql`
    SELECT e.id, e.document_name, e.user_id, e.page_count, e.chunk_count,
           e.languages, e.exported_at, e.updated_at,
           COALESCE(u.email, e.user_id) AS user_email
    FROM   ai_exports e
    LEFT JOIN users u ON u.id = e.user_id
    ORDER  BY e.updated_at DESC
  `;
  return rows.map(r => ({
    id:           r.id            as string,
    documentName: r.document_name as string,
    userId:       r.user_id       as string,
    userEmail:    r.user_email    as string | undefined,
    pageCount:    r.page_count    as number,
    chunkCount:   r.chunk_count   as number,
    languages:    (r.languages    as string[] | null) ?? [],
    exportedAt:   r.exported_at   as string,
    updatedAt:    r.updated_at    as string,
  }));
}

// ---------------------------------------------------------------------------
// Admin — fetch full JSON for one document
// ---------------------------------------------------------------------------
export async function getExportJson(docId: string): Promise<ExportDocument | null> {
  await ensureTable();
  const rows = await sql`SELECT export_json FROM ai_exports WHERE id = ${docId} LIMIT 1`;
  if (!rows.length) return null;
  const p = rows[0].export_json as { document: ExportDocument['document']; chunks: ContentChunk[] };
  return { document: p.document, chunks: p.chunks, fullText: p.chunks.map(c => c.text).join('\n') };
}

// ---------------------------------------------------------------------------
// Admin — delete export
// ---------------------------------------------------------------------------
export async function deleteExport(docId: string): Promise<void> {
  await ensureTable();
  await sql`DELETE FROM ai_exports WHERE id = ${docId}`;
}

// ---------------------------------------------------------------------------
// Admin — aggregate stats
// ---------------------------------------------------------------------------
export async function getExportStats(): Promise<{ totalExports: number; totalChunks: number; totalPages: number }> {
  await ensureTable();
  const rows = await sql`
    SELECT COUNT(*)::int                      AS total_exports,
           COALESCE(SUM(chunk_count), 0)::int AS total_chunks,
           COALESCE(SUM(page_count),  0)::int AS total_pages
    FROM   ai_exports
  `;
  return {
    totalExports: rows[0].total_exports as number,
    totalChunks:  rows[0].total_chunks  as number,
    totalPages:   rows[0].total_pages   as number,
  };
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
// Download as .docx — uses simple HTML-to-DOCX via Mammoth-compatible Blob
// ---------------------------------------------------------------------------
export function downloadAsDocx(
  pageResults: Record<number, string>,
  fileName:    string,
): void {
  const sortedKeys = Object.keys(pageResults)
    .map(Number)
    .filter(n => n > 0)
    .sort((a, b) => a - b);

  // Build clean HTML body with Amharic font
  const pages: string[] = [];
  for (const pageNum of sortedKeys) {
    const html = pageResults[pageNum];
    if (!html?.trim()) continue;
    // Clean up: remove buttons, image placeholders
    const cleaned = html
      .replace(/<button[^>]*>.*?<\/button>/gi, '')
      .replace(/<div[^>]*class="ai-image-placeholder"[^>]*>.*?<\/div>/gi, '');
    pages.push(
      `<div style="page-break-after: always;">`
      + `<p style="color: #999; font-size: 10pt; margin-bottom: 12pt;">Page ${pageNum}</p>`
      + cleaned
      + `</div>`
    );
  }

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Noto Serif Ethiopic', 'Noto Sans Ethiopic', serif; font-size: 12pt; line-height: 1.6; }
  h1,h2,h3 { font-weight: bold; }
  p { margin-bottom: 8pt; text-align: justify; }
</style>
</head>
<body>${pages.join('\n')}</body>
</html>`;

  // Create a .doc file (Word can open HTML saved as .doc)
  const blob = new Blob([fullHtml], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName.replace(/\.[^.]+$/, '') + '.doc';
  a.click();
  URL.revokeObjectURL(url);
}
