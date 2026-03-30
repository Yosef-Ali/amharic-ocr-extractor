import { v4 as uuidv4 } from 'uuid';
import { authFetch, getAccessToken } from '../lib/apiClient';
import localforage from 'localforage';

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

// Once we confirm the blob endpoint is unavailable, skip all subsequent calls
// to avoid spamming the console with 404s on every page image upload.
let _blobAvailable: boolean | null = null;  // null = untested

/** Upload a raw base64 JPEG to Vercel Blob via the /api/blob-upload endpoint.
 *  Returns the public URL, or null if the endpoint is unavailable (local dev). */
async function uploadToBlob(base64: string, filename: string): Promise<string | null> {
  if (_blobAvailable === false) return null;  // already confirmed unavailable
  try {
    const token = getAccessToken();
    const res = await fetch('/api/blob-upload', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body:    JSON.stringify({ filename, data: base64 }),
    });
    if (!res.ok) {
      _blobAvailable = false;
      return null;
    }
    _blobAvailable = true;
    const { url } = await res.json() as { url: string };
    return url;
  } catch {
    _blobAvailable = false;
    return null;
  }
}

/** Returns true if the string is already a remote URL (i.e. already uploaded to Blob). */
const isUrl = (s: string) => s.startsWith('https://') || s.startsWith('http://');

// ---------------------------------------------------------------------------
// One-time schema migration — called from App.tsx after sign-in
// ---------------------------------------------------------------------------
export async function initializeSchema(): Promise<void> {
  await authFetch('/api/schema', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Authenticated fetch with QuotaExceededError support
// ---------------------------------------------------------------------------
async function storageAuthFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers as Record<string, string>,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    if (body.error === 'QUOTA_EXCEEDED') {
      throw new QuotaExceededError(body.used, body.limit);
    }
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res;
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
  const id = docId || uuidv4();

  // Upload page images and thumbnail in parallel
  const thumbBase64 = extractThumbnailBase64(pageImages, pageResults);
  const [storedImages, thumbnailUrl] = await Promise.all([
    Promise.all(
      pageImages.map(async (img, i) => {
        // Cache base64 locally on-save to guarantee fast retrieval
        if (img && !isUrl(img)) {
          localforage.setItem(`aoe_img_${id}_${i}`, img).catch(console.warn);
        }

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

  const res = await storageAuthFetch('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      docId: docId || null,
      name,
      pageCount: pageImages.length,
      storedImages,
      pageResults,
      thumbnailUrl,
    }),
  });
  const { id: returnedId } = await res.json();

  // Update local IndexedDB cache with the newest document state for instant local loading
  const docToCache: SavedDocument = {
    id: returnedId || id,
    name,
    savedAt: new Date().toISOString(),
    pageCount: pageImages.length,
    pageImages: new Array(pageImages.length).fill(''),
    pageResults,
    thumbnailUrl: thumbnailUrl ?? undefined
  };
  localforage.setItem(`aoe_doc_${returnedId || id}`, docToCache).catch(console.warn);

  return returnedId || id;
}

// ---------------------------------------------------------------------------
// Load all documents — returns metadata stubs (no large content)
// ---------------------------------------------------------------------------
export async function loadAllDocuments(): Promise<SavedDocument[]> {
  const res = await storageAuthFetch('/api/documents');
  return res.json();
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

  const res = await storageAuthFetch(`/api/document-content?id=${encodeURIComponent(id)}`);
  const doc = await res.json();

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
    // If the image is locally cached and valid, skip remote fetch entirely
    if (cached && typeof cached === 'string') return cached;
  } catch (err) {
    console.warn('Local cache read failed:', err);
  }

  const res = await storageAuthFetch(`/api/page-image?docId=${encodeURIComponent(docId)}&page=${pageIndex}`);
  const { img } = await res.json();

  if (img) {
    try {
      await localforage.setItem(cacheKey, img);
    } catch (err) { }
  }

  return img;
}

// ---------------------------------------------------------------------------
// Delete a document (CASCADE removes document_content row)
// ---------------------------------------------------------------------------
export async function deleteDocument(id: string): Promise<void> {
  await storageAuthFetch('/api/document-delete', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });

  // Wipe associated data from the local IndexedDB cache safely
  try {
    const keys = await localforage.keys();
    const toRemove = [`aoe_doc_${id}`, ...keys.filter(k => k.startsWith(`aoe_img_${id}_`))];
    await Promise.all(toRemove.map(k => localforage.removeItem(k)));
  } catch (err) { }
}
