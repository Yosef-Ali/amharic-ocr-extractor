# Amharic OCR Extractor

A modern web application that extracts and digitizes Amharic (Ethiopian) text from PDF and image files using Google Gemini AI. Features a full document editor, AI chat assistant, dark/light theme, and an admin panel for user management.

---

## Screenshots

### Home Screen — Project Library
![Home Screen](./docs/screenshots/home.png)

### Editor — Extracted Document with Floating Dock
![Editor](./docs/screenshots/editor.png)

### Admin Panel — User Management
![Admin Panel](./docs/screenshots/admin.png)

### Dark Mode
![Dark Mode](./docs/screenshots/dark-mode.png)

---

## Features

### OCR & Document Extraction
- Upload PDF or image files (PNG, JPEG, WebP)
- Gemini 2.5 Flash AI extracts Amharic text with original layout
- Two-column layout detection and preservation
- Page-by-page extraction with rate-limit handling
- Re-extract individual pages or force-regenerate all

### Editor
- A4 contentEditable pages with Noto Serif Ethiopic font
- Figma-inspired floating dock (bottom-center) with grouped tools:
  - **Tools** — Select mode, Inspector
  - **OCR** — Fast/Pro quality toggle, Extract, Re-extract All
  - **Page** — Re-extract page, Delete page
  - **Export** — Save to library, Open library, Download PDF
  - **AI** — AI Chat assistant
- Real-time processing status bubble above the dock

### AI Chat Assistant
- Canvas-aware: reads the current page as context
- Two modes: **Chat** (ask questions) and **Edit** (apply changes to page HTML)
- Image attachment support (paste, drag & drop, file picker)
- Suggestion chips for common queries
- Markdown rendering with copy button

### Document Library
- Projects saved to Neon PostgreSQL database
- Page images stored on Vercel Blob
- Download any saved project as PDF directly from the home screen
- Search, recent vs. all projects views

### Theme
- Dark / Light mode toggle in every screen
- CSS custom properties for consistent theming
- Anti-flicker inline script prevents flash on load

### Admin Panel
- Visible only to the email set in `VITE_ADMIN_EMAIL`
- **Overview** — total users, documents, pages
- **Users** — list with join date, doc count, block/unblock button
- **Documents** — full document list across all users, filterable by user, with delete
- Blocked users see a "Account Suspended" screen instead of the app

### Authentication
- Neon Auth (email-based sign in / sign up)
- User profile menu with sign out in every screen

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v4 + CSS custom properties |
| AI — OCR | Gemini 2.5 Flash (`gemini-2.5-flash`) |
| AI — Chat | Gemini 2.5 Flash with canvas context |
| AI — Images | Gemini 2.0 Flash image generation |
| Database | Neon PostgreSQL (serverless) |
| File Storage | Vercel Blob |
| Auth | Neon Auth |
| PDF Export | jsPDF + html2canvas |
| Icons | Lucide React |
| Fonts | Noto Serif Ethiopic, Noto Sans Ethiopic |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Google Gemini API key
- Neon database (with Auth enabled)
- Vercel Blob storage (optional — falls back to base64 in local dev)

### Installation

```bash
git clone https://github.com/Yosef-Ali/amharic-ocr-extractor.git
cd amharic-ocr-extractor
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Google Gemini AI
VITE_GEMINI_API_KEY=your_gemini_api_key

# Neon Database
VITE_DATABASE_URL=postgresql://...

# Neon Auth
VITE_NEON_AUTH_URL=https://...neonauth...

# Admin panel access (only this email sees the Admin button)
VITE_ADMIN_EMAIL=your@email.com
```

### Database Setup

The app auto-creates required tables on first login:

```sql
-- Auto-created on first login
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT,
  blocked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Required — create manually or via migration
CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  page_count INT NOT NULL,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_content (
  document_id  TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  page_images  JSONB NOT NULL,
  page_results JSONB NOT NULL
);
```

### Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Build

```bash
npm run build
```

---

## Project Structure

```
src/
├── App.tsx                        # Root — auth, state, orchestration
├── index.css                      # Theme tokens + all component styles
├── hooks/
│   └── useTheme.ts                # Dark/light mode hook
├── services/
│   ├── geminiService.ts           # OCR, chat, image generation
│   ├── storageService.ts          # Neon DB + Vercel Blob CRUD
│   └── adminService.ts            # Admin queries (users, block/unblock)
├── utils/
│   └── downloadPDF.ts             # Off-screen PDF export utility
├── lib/
│   ├── neon.ts                    # Neon SQL client
│   └── neonAuth.ts                # Neon Auth client
└── components/
    ├── HomeScreen.tsx             # Landing / project library
    ├── AuthScreen.tsx             # Sign in / sign up
    ├── AdminPanel.tsx             # Admin panel modal
    ├── FloatingChat.tsx           # AI chat panel (controlled + self-managed)
    ├── ThemeToggleButton.tsx      # Shared Sun/Moon toggle
    ├── UserMenu.tsx               # Avatar dropdown with sign out
    ├── LibraryModal.tsx           # Document library browser
    ├── Toast.tsx                  # Notification toasts
    └── editor/
        ├── EditorShell.tsx        # Full editor layout + floating dock
        ├── DocumentPage.tsx       # A4 contentEditable page
        └── PageThumbnailSidebar.tsx
```

---

## Deployment

The app is configured for Vercel deployment. The `/api/blob-upload` serverless function handles image uploads to Vercel Blob.

```bash
vercel deploy
```

Set all `VITE_*` environment variables in your Vercel project settings.

---

## License

MIT
