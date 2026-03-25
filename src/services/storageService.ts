import { v4 as uuidv4 } from 'uuid';
import { sql } from '../lib/neon';
import localforage from 'localforage';
import { getUserQuota } from './adminService';

/** Typed error thrown when a user has reached their document quota. */
export class QuotaExceededError extends Error {
  used:  number;
  limit: number;
  constructor(used: number, limit: number) {
    super(`QUOTA_EXCEEDED`);
    this.name  = 'QuotaExceededError';
    this.used  = used;
    this.limit = limit;
  }
}

// ---------------------------------------------------------------------------
// Vercel Blob helpers
// ---------------------------------------------------------------------------

/** Upload a raw base64 JPEG to Vercel Blob via the /api/blob-upload endpoint.
 *  Returns the public URL, or null if the endpoint is unavailable (local dev). */
async function uploadToBlob(base64: string, filename: string): Promise<string | null> {
  try {
    const res = await fetch('/api/blob-upload', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ filename, data: base64 }),
    });
    if (!res.ok) return null;
    const { url } = await res.json() as { url: string };
    return url;
  } catch {
    return null;
  }
}

/** Returns true if the string is already a remote URL (i.e. already uploaded to Blob). */
const isUrl = (s: string) => s.startsWith('https://') || s.startsWith('http://');

// ---------------------------------------------------------------------------
// One-time schema migration — called from App.tsx after sign-in
// ---------------------------------------------------------------------------
let _schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  try {
    await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`;
  } catch { /* column already exists */ }
  _schemaReady = true;
}

export async function initializeSchema(): Promise<void> {
  return ensureSchema();
}

// ---------------------------------------------------------------------------
// Auth context — set by App.tsx when a user signs in/out
// ---------------------------------------------------------------------------
let _userId: string | null = null;

export function initStorage(userId: string | null): void {
  _userId = userId;
}

function requireUserId(): string {
  if (!_userId) throw new Error('Not authenticated');
  return _userId;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SavedDocument {
  id: string;
  name: string;
  savedAt: string;
  pageCount: number;
  thumbnailUrl?: string;
  pageImages: string[];
  pageResults: Record<number, string>;
}

// ---------------------------------------------------------------------------
// Save document (always creates a new record)
// ---------------------------------------------------------------------------
/** Extract a thumbnail data URL from pageResults (cover) or first pageImage. */
function extractThumbnailBase64(
  pageImages: string[],
  pageResults: Record<number, string>,
): string | null {
  // Prefer cover image (pageResults[0])
  const coverHtml = pageResults[0];
  if (coverHtml) {
    const m = coverHtml.match(/<img[^>]+src="(data:image\/[^"]+)"/)
           ?? coverHtml.match(/url\('(data:image\/[^']+)'\)/);
    if (m?.[1]) return m[1].replace(/^data:image\/[^;]+;base64,/, '');
  }
  // Fallback to first page scan image
  const first = pageImages[0];
  if (first && !isUrl(first)) return first;
  return null;
}

export async function saveDocument(
  docId: string | null,
  name: string,
  pageImages: string[],
  pageResults: Record<number, string>,
): Promise<string> {   // returns the document UUID
  const userId = requireUserId();
  const id     = docId || uuidv4();

  // ── Quota check — only for brand-new documents ──────────────────────────
  if (!docId) {
    const { used, limit } = await getUserQuota(userId);
    if (used >= limit) throw new QuotaExceededError(used, limit);
  }

  // If we have a docId, fetch the existing images to fill in any empty slots
  let origImages: string[] = [];
  if (docId) {
    const rows = await sql`
      SELECT c.page_images 
      FROM document_content c 
      JOIN documents d ON d.id = c.document_id
      WHERE d.id = ${docId} AND d.user_id = ${userId}
      LIMIT 1
    `;
    if (rows.length) {
      origImages = rows[0].page_images as string[];
    }
  }

  // Upload page images and thumbnail in parallel
  const thumbBase64 = extractThumbnailBase64(pageImages, pageResults);
  const [storedImages, thumbnailUrl] = await Promise.all([
    Promise.all(
      pageImages.map(async (img, i) => {
        // If image is lazy-loaded placeholder (empty string), use original from database
        let resolveImg = img;
        if (img === '') {
           resolveImg = origImages[i] ?? '';
        }

        // Cache base64 locally on-save to guarantee fast retrieval
        if (resolveImg && !isUrl(resolveImg)) {
           localforage.setItem(`aoe_img_${id}_${i}`, resolveImg).catch(console.warn);
        }

        if (isUrl(resolveImg)) return resolveImg;
        const url = await uploadToBlob(resolveImg, `${id}/page-${i + 1}.jpg`);
        return url ?? resolveImg;
      }),
    ),
    thumbBase64
      ? uploadToBlob(thumbBase64, `${id}/thumbnail.jpg`)
          .then(url => url ?? `data:image/jpeg;base64,${thumbBase64}`)
      : Promise.resolve(null),
  ]);

  if (docId && origImages.length > 0) {
    // Update existing document instead of duplicating
    await sql`
      UPDATE documents 
      SET name = ${name}, 
          page_count = ${pageImages.length}, 
          thumbnail_url = ${thumbnailUrl}, 
          updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
    `;
    await sql`
      UPDATE document_content
      SET page_images = ${JSON.stringify(storedImages)}::jsonb,
          page_results = ${JSON.stringify(pageResults)}::jsonb
      WHERE document_id = ${id}
    `;
  } else {
    // Insert new document
    await sql`
      INSERT INTO documents (id, user_id, name, page_count, thumbnail_url, saved_at, updated_at)
      VALUES (${id}, ${userId}, ${name}, ${pageImages.length}, ${thumbnailUrl}, NOW(), NOW())
    `;
    await sql`
      INSERT INTO document_content (document_id, page_images, page_results)
      VALUES (
        ${id},
        ${JSON.stringify(storedImages)}::jsonb,
        ${JSON.stringify(pageResults)}::jsonb
      )
    `;
  }
  
  // Update local IndexedDB cache with the newest document state for instant local loading
  const docToCache: SavedDocument = {
    id,
    name,
    savedAt: new Date().toISOString(),
    pageCount: pageImages.length,
    pageImages: new Array(pageImages.length).fill(''),
    pageResults,
    thumbnailUrl: thumbnailUrl ?? undefined
  };
  localforage.setItem(`aoe_doc_${id}`, docToCache).catch(console.warn);

  return id;
}

// ---------------------------------------------------------------------------
// Load all documents — returns metadata stubs (no large content)
// ---------------------------------------------------------------------------
export async function loadAllDocuments(): Promise<SavedDocument[]> {
  const userId = requireUserId();
  await ensureSchema();
  const rows = await sql`
    SELECT d.id, d.name, d.saved_at, d.page_count, d.thumbnail_url
    FROM   documents d
    WHERE  d.user_id = ${userId}
    ORDER  BY d.saved_at DESC
  `;
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    savedAt: r.saved_at,
    pageCount: r.page_count,
    thumbnailUrl: r.thumbnail_url ?? undefined,
    pageImages: [],
    pageResults: {},
  }));
}

// ---------------------------------------------------------------------------
// Load full document content (called when user opens a project)
// ---------------------------------------------------------------------------
export async function loadDocumentContent(id: string): Promise<SavedDocument> {
  const cacheKey = `aoe_doc_${id}`;
  try {
    const cached = await localforage.getItem<SavedDocument>(cacheKey);
    if (cached) return cached; // Serve from IndexedDB for zero-latency load
  } catch (err) {
    console.warn('Local cache read failed:', err);
  }

  const userId = requireUserId();
  const rows = await sql`
    SELECT d.id, d.name, d.saved_at, d.page_count,
           c.page_results
    FROM   documents d
    JOIN   document_content c ON c.document_id = d.id
    WHERE  d.id = ${id}
    AND    d.user_id = ${userId}
    LIMIT  1
  `;
  if (!rows.length) throw new Error('Document not found');
  const r = rows[0];
  
  const doc: SavedDocument = {
    id:          r.id as string,
    name:        r.name as string,
    savedAt:     r.saved_at as string,
    pageCount:   r.page_count as number,
    pageImages:  new Array(r.page_count as number).fill(''),
    pageResults: r.page_results as Record<number, string>,
  };

  try {
    await localforage.setItem(cacheKey, doc);
  } catch (err) { }

  return doc;
}

// ---------------------------------------------------------------------------
// Load specific document page image
// ---------------------------------------------------------------------------
export async function loadDocumentPageImage(docId: string, pageIndex: number): Promise<string | null> {
  const cacheKey = `aoe_img_${docId}_${pageIndex}`;
  try {
    const cached = await localforage.getItem<string>(cacheKey);
    // If the image is locally cached and valid, skip remote SQL fetch entirely
    if (cached && typeof cached === 'string') return cached;
  } catch (err) {
    console.warn('Local cache read failed:', err);
  }

  const userId = requireUserId();
  const rows = await sql`
    SELECT c.page_images->>(${pageIndex}::int) AS img
    FROM   document_content c
    JOIN   documents d ON d.id = c.document_id
    WHERE  c.document_id = ${docId}
    AND    d.user_id = ${userId}
    LIMIT  1
  `;
  if (!rows.length) return null;
  const imgStr = rows[0].img as string;
  
  if (imgStr) {
    try {
      await localforage.setItem(cacheKey, imgStr);
    } catch (err) { }
  }

  return imgStr;
}

// ---------------------------------------------------------------------------
// Delete a document (CASCADE removes document_content row)
// ---------------------------------------------------------------------------
export async function deleteDocument(id: string): Promise<void> {
  const userId = requireUserId();
  await sql`
    DELETE FROM documents
    WHERE id = ${id} AND user_id = ${userId}
  `;
  
  // Wipe associated data from the local IndexedDB cache safely
  try {
    await localforage.removeItem(`aoe_doc_${id}`);
    const keys = await localforage.keys();
    for (const key of keys) {
      if (key.startsWith(`aoe_img_${id}_`)) {
        await localforage.removeItem(key);
      }
    }
  } catch (err) { }
}
