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
    return url ?? null;
  } catch {
    return null;
  }
}

/** Returns true if the string looks like a URL (already uploaded). */
const isUrl = (s: string) => s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/');

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
  pageImages: string[];
  pageResults: Record<number, string>;
}

// ---------------------------------------------------------------------------
// Save document (always creates a new record)
// ---------------------------------------------------------------------------
export async function saveDocument(
  name: string,
  pageImages: string[],
  pageResults: Record<number, string>,
): Promise<void> {
  const userId = requireUserId();
  const id     = uuidv4();

  // Upload each page image to Vercel Blob; fall back to raw base64 if unavailable.
  const storedImages = await Promise.all(
    pageImages.map(async (img, i) => {
      if (isUrl(img)) return img; // already a URL — don't re-upload
      const url = await uploadToBlob(img, `${id}/page-${i + 1}.jpg`);
      return url ?? img;          // keep base64 if upload fails (local dev)
    }),
  );

  await sql`
    INSERT INTO documents (id, user_id, name, page_count, saved_at, updated_at)
    VALUES (${id}, ${userId}, ${name}, ${pageImages.length}, NOW(), NOW())
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

// ---------------------------------------------------------------------------
// Load all documents — returns metadata stubs (no large content)
// ---------------------------------------------------------------------------
export async function loadAllDocuments(): Promise<SavedDocument[]> {
  const userId = requireUserId();
  const rows = await sql`
    SELECT id, name, saved_at, page_count
    FROM   documents
    WHERE  user_id = ${userId}
    ORDER  BY saved_at DESC
  `;
  return rows.map(r => ({
    id:          r.id as string,
    name:        r.name as string,
    savedAt:     r.saved_at as string,
    pageCount:   r.page_count as number,
    pageImages:  [],
    pageResults: {},
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
