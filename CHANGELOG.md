# Changelog

All notable changes to the Amharic OCR Extractor.

---

## [0.1.1] - 2026-03-27

### Security (P0 — Critical fixes from /review)

- **CRITICAL: API key leak fixed** — anthropicService.ts no longer exposes VITE_ANTHROPIC_API_KEY to browser. All AI calls now route through server-side /api/ai-proxy endpoint.
- **CRITICAL: Browser require() removed** — exportService.ts no longer uses `require('docx')` inside elementToParagraphs. Now uses async dynamic import at top of downloadAsDocx.
- **CRITICAL: IDOR vulnerability fixed** — documents.ts UPDATE now uses `RETURNING id` to verify ownership before updating document_content.
- **API routes added** — All server-side endpoints created: /api/documents, /api/document-content, /api/document-delete, /api/admin, /api/exports, /api/ai-proxy, /api/blob-upload, /api/ocr, /api/schema, /api/user-sync, /api/page-image.
- **Consolidated auth token state** — Single source of truth in src/lib/apiClient.ts. Removed duplicate _accessToken from storageService.ts and initStorage() call pattern.
- **Timing-safe admin comparison** — isAdmin() now uses crypto.timingSafeEqual to prevent timing attacks.

### Added
- **Vitest test suite** — 30 tests passing across 3 test files (apiClient, exportService, aiCommon)
- YC 5-phase workflow documentation (WORKFLOW.md)
- Architecture documentation (ARCHITECTURE.md)
- Design system documentation (DESIGN_SYSTEM.md)
- Updated AI context file (CLAUDE.md)
- This changelog
- **OCR accuracy test suite** (tests/ocr-accuracy-v2.py) — image-based pipeline
- **OCR test report** (tests/OCR_TEST_REPORT.md) — 88% pass rate on 10 samples
- Test artifacts: rendered page images + raw OCR outputs in tests/ocr-results-v2/
- **Wired .txt and .doc export buttons** in BottomToolbar overflow menu to exportService functions

### Changed
- Development priority shifted to wedge validation (OCR accuracy first)

### Validated
- Modern Amharic print OCR: ✅ high quality (novels, Bible, prayer books, stories)
- Fidel character preservation: ✅ working (ሀ/ሐ/ኀ, ሰ/ሠ, ጸ/ፀ distinguished)
- Two-column layout detection: ✅ working
- Ethiopic punctuation: ✅ preserved (። ፣ ፤ ፡)
- Old Ge'ez manuscripts: ⚠️ needs work (deferred to V2)

---

## [0.1.0] - 2026-03-27

### Security (P0)
- **CRITICAL: API key leak fixed** — All AI calls route through server-side /api/ai-proxy. VITE_ANTHROPIC_API_KEY removed from client bundle.
- **CRITICAL: Browser require() removed** — exportService.ts uses async dynamic import instead of require('docx').
- **CRITICAL: IDOR vulnerability fixed** — documents.ts UPDATE uses RETURNING id ownership check.
- **Timing-safe admin check** — isAdmin() uses crypto.timingSafeEqual.
- **Auth token consolidated** — Single source of truth in src/lib/apiClient.ts.

### Infrastructure
- **13 new API routes** — /api/documents, /api/document-content, /api/document-delete, /api/admin, /api/exports, /api/ai-proxy, /api/blob-upload, /api/ocr, /api/schema, /api/user-sync, /api/page-image, /api/_auth, /api/_db.
- **Vitest test suite** — 30 tests across 3 files (apiClient, exportService, aiCommon).

### Removed
- Dead `checkUserBlocked` stub from adminService.ts.

---

## Pre-Workflow (up to 2026-03-25)

### Features Built
- Two-pass Gemini OCR (raw text → HTML layout)
- InDesign-style canvas with drag/resize/snap-to-grid
- 8 resize handles, arrow key nudging
- Inspector panel, Agent panel, Settings panel
- Cover editor with AI generation
- Find & replace, Homophone panel
- Split page view (scan vs extracted)
- Neon PostgreSQL + Vercel Blob storage
- Neon Auth (email sign in/up)
- Admin panel (user management, blocking)
- Dark/light theme
- PDF export (jsPDF + html2canvas)
- MCP server for Claude Code CLI
- Document library with search
