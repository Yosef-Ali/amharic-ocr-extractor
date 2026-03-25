# Architecture — Amharic OCR Extractor

> **Last updated:** 2026-03-25

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (React 19 / Vite 7)              │
│                                                             │
│  ┌───────────┐  ┌──────────────┐  ┌───────────────────┐    │
│  │ HomeScreen│  │ EditorShell  │  │ AdminPanel        │    │
│  │ (library) │  │ (full editor)│  │ (user management) │    │
│  └─────┬─────┘  └──────┬───────┘  └───────────────────┘    │
│        │                │                                    │
│  ┌─────▼────────────────▼──────────────────────────────┐    │
│  │              App.tsx — Central State                 │    │
│  │  fileName, pageImages[], pageResults{}, auth,       │    │
│  │  processingStatus, zoomLevel, activeDocId           │    │
│  └──────────┬──────────────────────┬───────────────────┘    │
│             │                      │                         │
│  ┌──────────▼─────────┐  ┌────────▼──────────────────┐     │
│  │ geminiService.ts   │  │ storageService.ts         │     │
│  │ - OCR (2-pass)     │  │ - Neon PostgreSQL CRUD    │     │
│  │ - AI chat          │  │ - Vercel Blob uploads     │     │
│  │ - Image generation │  │ - Document save/load      │     │
│  │ - Function calling │  │ - Quota management        │     │
│  └────────────────────┘  └───────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
          │                            │
          ▼                            ▼
   Google Gemini API           Neon DB + Vercel Blob
```

---

## Data Flow: Upload → Extract → Save

```
1. User uploads PDF or image file
   ├─ PDF → pdfService.ts: pdfToImages() renders each page at scale 2.0
   │        → canvas → toDataURL('image/jpeg', 0.92) → base64 string
   └─ Image → pdfService.ts: imageFileToBase64() via FileReader
       ↓
2. base64 page images stored in App.tsx state: pageImages[]
       ↓
3. Processing loop (App.tsx: processPages):
   For each page in range [fromPage..toPage]:
   ├─ Skip if cached (unless force=true)
   ├─ Call geminiService.extractPageHTML(base64Image, previousHTML)
   │   ├─ Pass 1 (OCR): raw text with column markers, image markers
   │   └─ Pass 2 (Layout): HTML with inline styles from raw text + image
   ├─ Store result: pageResults[pageNumber] = html string
   └─ Rate limit: 5-second delay between API calls
       ↓
4. EditorShell renders DocumentPage components (contentEditable A4 pages)
       ↓
5. User edits in-place → onBlur saves back to pageResults state
       ↓
6. Save to library:
   ├─ storageService.saveDocument() → Neon PostgreSQL (metadata)
   ├─ Page images → Vercel Blob via /api/blob-upload endpoint
   └─ Page HTML results → Neon document_content table (JSONB)
       ↓
7. Export: jsPDF + html2canvas → PDF download
```

---

## Component Architecture

```
App.tsx (root state + auth + processing)
├── AuthScreen           — Neon Auth sign in/up
├── HomeScreen           — Project library, search, recent docs
├── AdminPanel           — User/document management (admin email only)
├── LibraryModal         — Browse saved documents
├── Toast                — Notification system
└── EditorShell          — Full editor layout
    ├── PageThumbnailSidebar  — Left: page thumbnails
    ├── DocumentPage          — Center: A4 contentEditable pages
    ├── SplitPageView         — Split view: original scan + extracted
    ├── BottomToolbar         — Floating dock (tools, OCR, export)
    ├── ViewModeTabs          — Edit/Split/Preview mode toggle
    ├── CoverEditor           — Book cover editing
    ├── CoverEditorPanel      — Cover properties
    ├── FindReplaceBar        — Text find & replace
    ├── HomophonePanel        — Amharic homophone suggestions
    ├── InspectorPanel        — Element properties (layout, styles)
    ├── AgentPanel            — AI agent chat (function calling)
    ├── RightDrawer           — Right panel container
    ├── RightAIPanel          — AI suggestions panel
    ├── SettingsPanel         — App settings
    └── HelpModal             — Keyboard shortcuts, help
```

---

## File Structure

```
src/
├── App.tsx                          # Root: auth, state, processing pipeline
├── main.tsx                         # Entry point
├── index.css                        # Theme tokens, all component styles
├── html2pdf.d.ts                    # Type shim for html2pdf.js
│
├── components/
│   ├── HomeScreen.tsx               # Project library / landing
│   ├── AuthScreen.tsx               # Neon Auth sign in/up
│   ├── AdminPanel.tsx               # Admin panel (users, docs, stats)
│   ├── DocumentPage.tsx             # A4 contentEditable page
│   ├── SplitPageView.tsx            # Side-by-side scan vs extracted
│   ├── FloatingChat.tsx             # AI chat (legacy, pre-AgentPanel)
│   ├── FloatingToolbar.tsx          # Floating toolbar
│   ├── UploadZone.tsx               # Drag-and-drop file upload
│   ├── LibraryModal.tsx             # Saved documents browser
│   ├── ImageEditModal.tsx           # Image editing modal
│   ├── DeleteConfirmModal.tsx       # Deletion confirmation
│   ├── ActionBar.tsx                # Legacy action buttons
│   ├── ProKeyButton.tsx             # AI Studio Pro Key connector
│   ├── UserMenu.tsx                 # Avatar dropdown + sign out
│   ├── ThemeToggleButton.tsx        # Dark/light toggle
│   ├── Toast.tsx                    # Notification toasts
│   └── editor/
│       ├── EditorShell.tsx          # Main editor layout (925 lines)
│       ├── BottomToolbar.tsx        # Floating dock (tools, OCR, export)
│       ├── ViewModeTabs.tsx         # Edit/Split/Preview modes
│       ├── PageThumbnailSidebar.tsx # Left page list
│       ├── InspectorPanel.tsx       # Element properties panel
│       ├── AgentPanel.tsx           # AI agent with function calling
│       ├── RightDrawer.tsx           # Right panel container
│       ├── RightAIPanel.tsx         # AI suggestions
│       ├── SettingsPanel.tsx        # App settings
│       ├── FindReplaceBar.tsx       # Find & replace
│       ├── HomophonePanel.tsx       # Amharic homophone tool
│       ├── CoverEditor.tsx          # Cover page editor
│       ├── CoverEditorPanel.tsx     # Cover properties
│       ├── CoverSetup.tsx           # Cover setup wizard
│       ├── CoverPageGenerator.tsx   # AI cover generation
│       ├── HelpModal.tsx            # Help & shortcuts
│       └── coverUtils.ts           # Cover block utilities
│
├── services/
│   ├── geminiService.ts             # All Gemini AI (1301 lines)
│   ├── storageService.ts            # Neon DB + Vercel Blob (329 lines)
│   ├── adminService.ts              # Admin queries
│   ├── pdfService.ts                # PDF → base64, DOCX/text import
│   ├── exportService.ts             # Document export
│   ├── canvasExecutor.ts            # DOM manipulation for AI tools
│   ├── canvasTools.ts               # Gemini FunctionDeclarations
│   ├── projectMemory.ts             # Project memory/context
│   └── wsBridge.ts                  # WebSocket bridge for MCP
│
├── hooks/
│   ├── useTheme.ts                  # Dark/light mode
│   ├── useMediaQuery.ts             # Responsive breakpoints
│   ├── useResizable.ts              # Resizable panels
│   └── useScrub.ts                  # Scrub interaction
│
├── lib/
│   ├── neon.ts                      # Neon SQL client
│   └── neonAuth.ts                  # Neon Auth client
│
├── types/
│   └── a2ui.ts                      # Agent UI types
│
├── utils/
│   ├── downloadPDF.ts               # PDF export utility
│   └── markdownRenderer.tsx         # Markdown → React
│
└── config/
    └── editorDefaults.ts            # Editor default settings
```

---

## Database Schema (Neon PostgreSQL)

```sql
-- Users (auto-created on first login)
users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  blocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
)

-- Documents (metadata)
documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  page_count INT NOT NULL,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Document content (page data as JSONB)
document_content (
  document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  page_images JSONB NOT NULL,    -- array of Vercel Blob URLs or base64
  page_results JSONB NOT NULL    -- {pageNumber: htmlString}
)
```

---

## Error Handling

| Scenario | Response |
|---|---|
| Gemini 429 / rate limit | Show styled error HTML in page, break loop, user retries |
| Gemini API key invalid | `isApiKeyError()` check, prompt user to set key |
| Vercel Blob unavailable | Falls back to base64 storage (local dev) |
| User blocked by admin | Shows "Account Suspended" screen |
| Quota exceeded | `QuotaExceededError` with used/limit counts |
| Network offline | No specific handling (TODO: add offline queue) |

---

## MCP Server (Optional — for Claude Code CLI)

Separate package in `mcp-server/` directory. Communicates with the React app
via WebSocket relay. Exposes canvas manipulation tools to Claude Code.

```
Claude Code CLI ←─ stdio ─→ MCP Server (Node.js)
                                  │
                            WS relay server
                                  │
                          React App (WS client via wsBridge.ts)
```

Tools: editElement, setPageSize, setMargins, insertElement, deleteElement,
flowText, insertImage, exportPDF, getStructure, getScreenshot.

---

## Key Technical Constraints

1. **Inline styles only** — html2pdf.js requires all styles inline for PDF export
2. **Amharic font** — Noto Serif Ethiopic for content, Noto Sans Ethiopic for UI
3. **A4 dimensions** — 210×297mm, safe zone: 20mm top/bottom, 22mm left/right
4. **contentEditable** — innerHTML via useEffect + direct DOM, read via onBlur
5. **Rate limiting** — 5-second delay between Gemini calls, graceful 429 handling
6. **Base64 images** — Page images stored as raw base64 (prefix stripped)
7. **Print-first** — Layout uses mm internally, converted to rem/px for screen
