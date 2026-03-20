import { v4 as uuidv4 } from 'uuid';
import { sql } from '../lib/neon';

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
  name: string,
  pageImages: string[],
  pageResults: Record<number, string>,
): Promise<string> {   // returns the new document UUID
  const userId = requireUserId();
  const id     = uuidv4();

  // Upload page images and thumbnail in parallel
  const thumbBase64 = extractThumbnailBase64(pageImages, pageResults);
  const [storedImages, thumbnailUrl] = await Promise.all([
    Promise.all(
      pageImages.map(async (img, i) => {
        if (isUrl(img)) return img;
        const url = await uploadToBlob(img, `${id}/page-${i + 1}.jpg`);
        return url ?? img;
      }),
    ),
    thumbBase64
      ? uploadToBlob(thumbBase64, `${id}/thumbnail.jpg`)
          .then(url => url ?? `data:image/jpeg;base64,${thumbBase64}`)
      : Promise.resolve(null),
  ]);

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
  return id;
}

// ---------------------------------------------------------------------------
// Load all documents — returns metadata stubs (no large content)
// ---------------------------------------------------------------------------
export async function loadAllDocuments(): Promise<SavedDocument[]> {
  const userId = requireUserId();
  await ensureSchema();
  const rows = await sql`
    SELECT d.id, d.name, d.saved_at, d.page_count,
           COALESCE(d.thumbnail_url, c.page_images->>0) AS thumbnail_url
    FROM   documents d
    LEFT JOIN document_content c ON c.document_id = d.id
    WHERE  d.user_id = ${userId}
    ORDER  BY d.saved_at DESC
  `;
  return rows.map(r => ({
    id:           r.id as string,
    name:         r.name as string,
    savedAt:      r.saved_at as string,
    pageCount:    r.page_count as number,
    thumbnailUrl: (r.thumbnail_url as string | null) ?? undefined,
    pageImages:   [],
    pageResults:  {},
  }));
}

// ---------------------------------------------------------------------------
// Load full document content (called when user opens a project)
// ---------------------------------------------------------------------------
export async function loadDocumentContent(id: string): Promise<SavedDocument> {
  const userId = requireUserId();
  const rows = await sql`
    SELECT d.id, d.name, d.saved_at, d.page_count,
           c.page_images, c.page_results
    FROM   documents d
    JOIN   document_content c ON c.document_id = d.id
    WHERE  d.id = ${id}
    AND    d.user_id = ${userId}
    LIMIT  1
  `;
  if (!rows.length) throw new Error('Document not found');
  const r = rows[0];
  return {
    id:          r.id as string,
    name:        r.name as string,
    savedAt:     r.saved_at as string,
    pageCount:   r.page_count as number,
    pageImages:  r.page_images as string[],
    pageResults: r.page_results as Record<number, string>,
  };
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
}
