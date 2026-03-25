# Changelog

All notable changes to the Amharic OCR Extractor.

---

## [Unreleased]

### Added
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
