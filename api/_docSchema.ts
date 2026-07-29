import { sql } from './_db.js';

/**
 * Columns added to document_content after it first shipped.
 *
 * `api/schema.ts` also applies these, but that route is admin-only and fires
 * on admin sign-in — so a non-admin deployment could otherwise read and write
 * documents before the column exists. Doing it lazily here means the first
 * request after deploy migrates, whoever makes it.
 *
 * Cached per warm instance: the ALTER is idempotent but not free.
 */
let ready = false;

export async function ensureDocumentSchema(): Promise<void> {
  if (ready) return;
  await sql`ALTER TABLE document_content ADD COLUMN IF NOT EXISTS page_dimensions JSONB`;
  ready = true;
}
