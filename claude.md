# Amharic PDF OCR & Layout Extractor — Claude Build Spec

## Project Location
`~/amharic-ocr-extractor/` — standalone directory at Mac home root

## Tech Stack
- **React 18** + **Vite** + **TypeScript**
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **Lucide React** (icons)
- `pdfjs-dist` — PDF page → canvas → base64 JPEG
- `@google/genai` — Gemini AI (OCR + image generation)
- `html2pdf.js` — client-side PDF export
- `localforage` + `uuid` — IndexedDB document library

---

## Folder Structure

```
amharic-ocr-extractor/
├── .env                          # VITE_GEMINI_API_KEY
├── .gitignore
├── claude.md                     # This file
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx                   # Root — all state & orchestration
    ├── index.css                 # Tailwind + fonts + placeholder styles
    ├── html2pdf.d.ts             # Type shim for html2pdf.js
    ├── services/
    │   ├── pdfService.ts         # pdfjs-dist → base64 images
    │   ├── geminiService.ts      # OCR + image generation
    │   └── storageService.ts     # localforage CRUD
    └── components/
        ├── UploadZone.tsx        # Drag-and-drop upload
        ├── DocumentPage.tsx      # A4 contentEditable page
        ├── ActionBar.tsx         # Control buttons
        ├── LibraryModal.tsx      # Saved documents browser
        └── ProKeyButton.tsx      # AI Studio Pro Key connector
```

---

## 1. File Upload & Processing — `pdfService.ts`

- Use `pdfjs-dist` with CDN worker:
  ```ts
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  ```
- Render each page at **scale 2.0** → canvas → `toDataURL('image/jpeg', 0.92)`.
- Strip the `data:image/jpeg;base64,` prefix — store raw base64 only.
- For image files: use `FileReader` → `readAsDataURL` → strip prefix.

---

## 2. AI OCR — `geminiService.ts`

### Model
`gemini-2.5-flash`

### Function
```ts
extractPageHTML(base64Image: string, previousPageHTML?: string): Promise<string>
```

### CRITICAL Prompt Rules
Output **raw HTML only** — no markdown, no code fences, no `<html>/<head>/<body>` tags.

**Layout — use these inline styles exactly:**

```html
<!-- Two-column layout -->
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; width: 100%;">

<!-- Main header -->
<h2 style="text-align: center; font-weight: 900; color: #000000; font-size: 1.25rem; margin-bottom: 2rem;">

<!-- Subheader -->
<h3 style="text-align: center; font-weight: bold; color: #b91c1c; font-size: 1.1rem; margin-bottom: 1rem; letter-spacing: 0.1em;">

<!-- Body paragraph -->
<p style="line-height: 1.8; color: #1c1917; margin-bottom: 2rem; text-align: justify; font-size: 1rem;">
```

**Image placeholder — insert this EXACT HTML for any photo/graphic:**
```html
<div class="ai-image-placeholder" data-description="[brief English description]">
  <button class="generate-image-btn print:hidden">Generate Image</button>
</div>
```

Pass previous page HTML as context (first 2500 chars) to maintain consistent styling.

---

## 3. AI Image Generation — `geminiService.ts`

### Model
`gemini-2.0-flash-preview-image-generation`

### Function
```ts
generateImage(description: string): Promise<string> // data URL
```

- Pass `generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }`.
- Extract `part.inlineData.data` → return `data:${mimeType};base64,${data}`.
- Replace `.ai-image-placeholder` div with `<img src="..." />`.

### Global "Generate All Images"
- Iterate all `pageResults`.
- Parse HTML with `DOMParser`.
- Find all `.ai-image-placeholder` elements.
- Call `generateImage()` for each, replace with `<img>`.
- Update `pageResults` state.

---

## 4. State Management — `App.tsx`

### State Shape
```ts
fileName: string
pageImages: string[]            // raw base64 per page (0-indexed)
pageResults: Record<number, string>  // generated HTML, keyed by page number (1-indexed)
fromPage: number
toPage: number
isProcessing: boolean
processingStatus: string
isPdfExporting: boolean
showLibrary: boolean
```

### Smart Caching
`pageResults` is never wiped on page range change. Only pages not in cache (or when `force=true`) are re-processed.

### Rate Limiting
- 5-second countdown delay between each page API call.
- On `429` / `RESOURCE_EXHAUSTED`: insert styled error HTML into that page, break loop.
- Error HTML:
  ```html
  <div style="border:2px solid #ef4444;border-radius:8px;padding:1.5rem;text-align:center;background:#fef2f2;margin:2rem 0;">
    <p style="color:#dc2626;font-weight:700;">⚠️ Rate Limit Reached (429)</p>
    <p style="color:#991b1b;font-size:0.875rem;">Wait 60 seconds then click Regenerate.</p>
  </div>
  ```

---

## 5. Document Page — `DocumentPage.tsx`

- `contentEditable` div — sync HTML via `useEffect` + direct `innerHTML` assignment.
- `onBlur` → call `onEdit(pageNumber, ref.current.innerHTML)`.
- Event delegation for `.generate-image-btn` clicks.
- A4 styling:
  ```css
  width: 210mm;
  min-height: 297mm;
  padding: 20mm 22mm;
  font-family: 'Noto Serif Ethiopic', serif;
  box-sizing: border-box;
  ```

---

## 6. Action Bar — `ActionBar.tsx`

| Button | Condition | Action |
|---|---|---|
| Clear | always | Reset all state |
| Extract | `hasFile` | `processPages(false)` — skip cached |
| Regenerate | `hasResults` | `processPages(true)` — force all |
| All Images | `hasResults` | `handleGenerateAllImages()` |
| Save | `hasResults` | `saveDocument()` to localforage |
| Library | always | Open `LibraryModal` |
| Print | `hasResults` | `window.print()` |
| Download PDF | `hasResults` | `html2pdf.js` export with spinner |

All buttons disabled while `isProcessing === true`.

---

## 7. PDF Export

```ts
const html2pdf = (await import('html2pdf.js')).default; // lazy import
html2pdf().set({
  margin: 0,
  filename: `${name}.pdf`,
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
}).from(document.getElementById('document-output')).save();
```

---

## 8. Document Library — `storageService.ts`

```ts
interface SavedDocument {
  id: string        // uuid v4
  name: string
  savedAt: string   // ISO datetime
  pageCount: number
  pageImages: string[]
  pageResults: Record<number, string>
}
```

Functions: `saveDocument()`, `loadAllDocuments()`, `deleteDocument(id)`.

`localforage.createInstance({ name: 'amharic-ocr-extractor', storeName: 'documents' })`.

---

## 9. Pro Key — `ProKeyButton.tsx`

```ts
if (window.aistudio?.openSelectKey) {
  await window.aistudio.openSelectKey();
  reinitializeClient(); // re-creates GoogleGenAI with new credentials
}
```

---

## 10. Styling

- `index.css` imports Noto Serif Ethiopic + Noto Sans Ethiopic from Google Fonts.
- `.ai-image-placeholder` — dashed red border, light pink background.
- `.generate-image-btn` — solid red button.
- Print: `@media print` hides `.print:hidden`, removes shadows, adds page breaks.

---

## 11. Environment

```env
# .env
VITE_GEMINI_API_KEY=your_key_here
```

Initialize in `geminiService.ts`:
```ts
let client = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });
```

---

## Run

```bash
cd ~/amharic-ocr-extractor
# Edit .env with your Gemini API key
npm run dev
```

## Build

```bash
npm run build
```

---

## Known Gotchas

- `contentEditable` + React state: always set `innerHTML` via `useEffect` + direct DOM, read back via `onBlur`. Never use `value` or React's VDOM diffing for this.
- `html2pdf.js` has no official types — use the `html2pdf.d.ts` shim in `src/`.
- `pdfjs-dist` worker: use CDN URL matching the installed version (`pdfjsLib.version`).
- Amharic text: requires Noto Serif Ethiopic / Noto Sans Ethiopic — loaded via Google Fonts.
- Gemini image generation: `responseModalities` is not yet in official SDK types — use `// @ts-expect-error`.
