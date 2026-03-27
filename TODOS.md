# TODOS

> Last updated: 2026-03-27 | Source: `/plan-eng-review`

---

## P0 — Pre-Launch (build now)

### 1. Create Vercel API routes to move secrets server-side
**What:** Create `/api/ocr`, `/api/save`, `/api/load`, `/api/delete` Vercel serverless functions. Move Gemini API key, Anthropic API key, and Neon DB connection string to server-side env vars (non-VITE_ prefixed). Add auth middleware that validates Neon Auth session tokens server-side. Update client-side services to call API routes via fetch.
**Why:** All secrets (GEMINI_API_KEY, DATABASE_URL, ANTHROPIC_API_KEY) are currently exposed in the client-side bundle via `VITE_` env vars. Any user can extract them from browser devtools. DB queries run client-side with no server-side authorization — any authenticated user could read/modify other users' documents.
**Completed:** v0.0.0 (2026-03-26) — api/ routes created: _auth, _db, admin, ai-proxy, blob-upload, document-content, document-delete, documents, exports, ocr, page-image, schema, user-sync. Client refactored to authFetch + apiClient as single token source.
**Depends on:** Nothing
**Files:** `src/services/geminiService.ts`, `src/services/storageService.ts`, `src/services/anthropicService.ts`, `src/lib/neon.ts`, new `api/` directory

### 2. Set up Vitest + write essential tests
**What:** Install vitest + jsdom. Write tests for: exportService (txt/doc round-trip), storageService (save/load mock), OCR prompt structure validation (fidel preservation rules present), basic App rendering.
**Why:** Zero test coverage across the entire codebase. Can't verify regressions when building API routes or .docx export.
**Completed:** v0.0.0 (2026-03-26) — vitest installed, 3 test files, 30 tests passing (apiClient, exportService, aiCommon).
**Depends on:** Nothing (can parallel with #1)
**Files:** `vitest.config.ts`, `src/services/__tests__/`

### 3. Replace HTML-as-doc export with real .docx
**What:** Replace the current `new Blob([fullHtml], { type: 'application/msword' })` hack in `exportService.ts` with the `docx` npm package. Map HTML content to docx Paragraph objects with Noto Serif Ethiopic font. Handle headings, paragraphs, bold/italic. Two-column layout flattened to single-column.
**Why:** Current export produces an HTML file renamed to .doc. Word shows a security warning on open, formatting is wrong, and it won't round-trip. Real publishers will notice immediately.
**Completed:** v0.0.0 (2026-03-26) — docx npm package added, dynamic import used, downloadAsDocx function implemented with Noto Serif Ethiopic font, heading/paragraph/bold/italic support.
**Depends on:** Nothing (can parallel with #1 and #2)
**Files:** `src/services/exportService.ts`, `package.json`

---

## P1 — Post-Launch

### 4. OCR confidence indicator
**What:** Modify OCR extraction prompt in `geminiService.ts` to ask Gemini to wrap uncertain characters in `<mark class='uncertain'>` tags. Add CSS `.uncertain { background: #fef08a; }`. Add Pass 2 instruction to preserve `<mark>` tags during layout reconstruction. User clicks to review and accept/correct.
**Why:** Amharic fidel has confusable pairs (ሀ/ሐ/ኀ, ሰ/ሠ, ጸ/ፀ). Highlighting uncertain characters builds trust for fidel-sensitive content like religious manuscripts.
**Blocked by:** Needs testing against 10+ real documents to check false positive rate. If >30% false positives, defer further. Design doc testing gate applies.
**Files:** `src/services/geminiService.ts` (or `aiCommon.ts`), CSS

### 5. Extract useExtraction hook from App.tsx
**What:** Move processPages, regenerateSinglePage, cancel logic, and extraction-related state (isExtracting, extractionProgress, currentPage, totalPages, cancelRef) into a `useExtraction` custom hook. App.tsx drops from ~900 to ~750 lines.
**Why:** App.tsx has 20+ useState hooks. Extraction logic is self-contained (~150 lines) and would benefit from isolated testing. Improves readability and testability.
**Depends on:** Nothing, but lower priority than features
**Files:** `src/hooks/useExtraction.ts`, `src/App.tsx`

### 6. Rate limiting / retry improvements
**What:** Add exponential backoff on 429 errors (currently shows error HTML). Add per-page retry button for failed pages in batch processing. Add `beforeunload` warning during active batch.
**Why:** Users processing 50+ page manuscripts will hit rate limits. Current behavior shows an error page with no recovery path except re-extracting the entire batch.
**Depends on:** #1 (API routes, since retry logic should be server-side)
**Files:** `src/App.tsx`, `api/ocr.ts`
