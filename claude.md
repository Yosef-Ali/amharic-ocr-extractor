# Amharic OCR Extractor — AI Coding Context

> **Last updated:** 2026-03-25
> **Update this file** at the start and end of every coding session.

---

## What This App Does

A web app that extracts Amharic (Ethiopic/ፊደል) text from scanned PDFs and images
using Google Gemini AI. Two-pass OCR pipeline (raw text extraction → HTML layout
reconstruction). Full editor with InDesign-style canvas, AI chat assistant, document
library with Neon PostgreSQL + Vercel Blob storage, admin panel, and auth.

## ✅ RESOLVED — OCR works in production (2026-07-30, verified)

**Root cause (confirmed 2026-07-30):** the default OCR model, `gemini-3.1-flash-image-preview`
("Nano Banana"), is an image-*generation* model, and Google bills those from the first
token — the account's free-tier allowance for it is `limit: 0`, not exhausted. No
amount of retrying or GA↔preview swapping on that model family would ever work.

**Fix (verified live, 2026-07-30):** `OCR_MODEL` is set in Vercel to a general multimodal
model, not the image-generation one, so it carries normal free-tier quota. Confirmed
end-to-end against production on three different real documents (a UI screenshot, a
dense two-column scanned Bible page, and an italicized novel dialogue page) — all
HTTP 200 with coherent, structurally-correct extraction (chapter/verse numbers, section
headers, page footers all landed correctly).

**Model history:**
- `gemini-3-flash-preview` — first verified-working fix (2026-07-30).
- `gemini-3.6-flash` — switched to this on 2026-07-30 for lower token usage (~17% fewer
  output tokens per Google) and confirmed faster in practice (~43s vs ~51s on the same
  test image). Re-verified end-to-end after the switch — still HTTP 200, coherent
  extraction. User also confirmed a clean guest-mode extraction live in the UI.
- Note: word-level output can vary slightly between models/runs on hard stylized fonts
  (structure and coherence held in testing, but nobody has done a rigorous
  character-level accuracy audit against source — worth doing if OCR fidelity becomes
  the bottleneck rather than "does it work at all").

**Do not revert `OCR_MODEL`** back to `gemini-3.1-flash-image-preview` (or unset it) —
that is the dead end, not this. If quota issues resurface, check the `model` field in
the `/api/ocr` response first before assuming code regression.

### Diagnosing quickly
`/api/ocr` returns `upstreamDetail` (Google's own error, key-redacted), `model`, and
`usingUserKey` on every 429/500. One request tells you the real cause — use it instead
of inferring from retry-delay patterns.

## Current Priority (YC Workflow — Wedge First)

**WEDGE = Upload scanned Amharic page → Get accurate editable text → Export.**

Completed:
1. ✅ OCR accuracy tested on 10 real Amharic documents (88% pass rate)
2. ✅ Fidel preservation verified (ሀ/ሐ/ኀ, ሰ/ሠ, ጸ/ፀ all distinguished)
3. ✅ .txt and .doc export wired to BottomToolbar overflow menu

Next:
4. Get ONE real user (publisher, scholar, church) to try the OCR flow
5. Ask: "Would you pay for this?"
6. Deploy to Vercel

See `WORKFLOW.md` for the full 5-phase YC development plan.

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | React 19 + TypeScript + Vite 7 | Single-page app |
| Styling | Tailwind CSS v4 + CSS custom properties | `@tailwindcss/vite` plugin |
| AI — OCR | Gemini 3.1 Flash Image Preview (`gemini-3.1-flash-image-preview`) | **DO NOT CHANGE** |
| AI — Agent/Chat | Gemini 3 Flash Preview (`gemini-3-flash-preview`) | Function calling model |
| AI — Images | Gemini 3 Pro Image Preview (`gemini-3-pro-image-preview`) | **DO NOT CHANGE** |
| Database | Neon PostgreSQL (serverless) | `@neondatabase/serverless` |
| File Storage | Vercel Blob | Page images uploaded via `/api/blob-upload` |
| Auth | Neon Auth | Email-based sign in/up |
| PDF Rendering | pdfjs-dist | PDF pages → base64 JPEG |
| PDF Export | jsPDF + html2canvas | Client-side |
| Icons | Lucide React | |
| Fonts | Noto Serif Ethiopic, Noto Sans Ethiopic | Google Fonts |

## CRITICAL — Gemini Model Rules

**NEVER change OCR or image generation model names.**
`gemini-2.5-*` models are **LEGACY/DEPRECATED** — never use them.
Tools/function declarations MUST go inside `config.tools`, not as top-level `tools` param.

| Role | Constant | Model String |
|---|---|---|
| Agent chat / function calling | `MODEL` | `gemini-3-flash-preview` |
| OCR extraction (Pass 1 & 2) | `OCR_FAST` | `gemini-3.1-flash-image-preview` |
| Image generation | `IMAGE_MODEL` | `gemini-3-pro-image-preview` |
| Cover page generation | `NANOBANANA2` | `gemini-3.1-flash-image-preview` |

## Architecture Overview

```
User uploads PDF/Image
       ↓
pdfService.ts — converts to base64 JPEG pages
       ↓
geminiService.ts — Pass 1: OCR raw text extraction (OCR_FAST model)
       ↓
geminiService.ts — Pass 2: HTML layout reconstruction (OCR_FAST model)
       ↓
App.tsx state — pageResults[pageNumber] = HTML string
       ↓
EditorShell.tsx → DocumentPage.tsx — renders as contentEditable A4 pages
       ↓
storageService.ts — save to Neon DB + Vercel Blob
       ↓
exportService.ts / downloadPDF.ts — export as PDF
```

## Key Files & Sizes

| File | Lines | Role |
|---|---|---|
| `src/services/geminiService.ts` | 1301 | All AI: OCR prompts, chat, image gen, function calling |
| `src/components/editor/EditorShell.tsx` | 925 | Full editor layout, toolbar, panels, zoom |
| `src/App.tsx` | 800 | Root state, auth, processing pipeline |
| `src/services/storageService.ts` | 329 | Neon DB + Vercel Blob CRUD |
| `src/services/canvasExecutor.ts` | — | DOM manipulation for AI tool calls |
| `src/services/canvasTools.ts` | — | Gemini FunctionDeclarations for canvas |
| `src/services/exportService.ts` | — | Document export (PDF, data) |
| `src/components/editor/AgentPanel.tsx` | — | AI agent chat panel |
| `src/components/editor/InspectorPanel.tsx` | — | Properties panel (layout, styles) |
| `src/components/DocumentPage.tsx` | — | A4 contentEditable page component |

## OCR Pipeline Details

Two-pass extraction in `geminiService.ts`:

1. **Pass 1 (OCR):** `extractPageHTML()` → sends page image to Gemini with Amharic-specific
   prompt. Returns raw text with column breaks, image markers, header markers.
2. **Pass 2 (Layout):** Takes Pass 1 text + page image → reconstructs styled HTML with
   inline styles (required for html2pdf.js export). Two-column grid, headers, body text.

**Amharic fidel preservation is critical:** The prompt explicitly forbids character
substitution (ሀ≠ሐ≠ኀ, ሰ≠ሠ, ጸ≠ፀ). Never modify these prompts without testing.

## Page State Invariant

A document is three parallel structures that MUST stay index-aligned:

```
pageImages[i]      → base64 scan for page i+1
pageDimensions[i]  → physical size of page i+1 (drives layout AND PDF export)
pageResults[n]     → extracted HTML for page n (1-based, SPARSE)
```

Anything that adds, removes or reorders pages must apply the **same** transform to
all three. Use the helpers in `src/lib/pageOps.ts` (`removeAt` / `insertAt` /
`moveItem` / `remapPageResults`) rather than hand-rolling splices — that is what
keeps them aligned.

Two traps, both of which were live bugs:
- `pageResults` is **sparse** — only extracted pages appear. Never derive the page
  count from its key count; pass `pageImages.length` in explicitly.
- Keys `0` (front cover) and `-1` (back cover) are not part of the page sequence
  and must survive every operation. `remapPageResults` handles this.

`pageDimensions` is persisted in `document_content.page_dimensions` (JSONB).
Documents saved before that column existed read back `NULL` — always pass loaded
dimensions through `normalizePageDimensions()`, which pads/repairs to A4.

## Known Issues

- `contentEditable` + React: always set `innerHTML` via `useEffect` + direct DOM, read
  back via `onBlur`. Never use React VDOM diffing for this.
- `html2pdf.js` has no types — use the `html2pdf.d.ts` shim.
- Rate limiting: 5-second delay between Gemini API calls. On 429 error, shows error HTML
  in page with retry guidance.
- Gemini image gen `responseModalities` not in SDK types — use `// @ts-expect-error`.

## DO NOT

- Change OCR_FAST or IMAGE_MODEL constants without testing on 10+ Amharic samples
- Remove Amharic fidel preservation logic from prompts
- Add new npm dependencies without justification
- Use px units for print layout (use mm)
- Modify auth/admin code without understanding Neon Auth flow
- Build new features before validating the OCR wedge with real users

## Environment Variables

```env
VITE_GEMINI_API_KEY=...       # Google Gemini API key
VITE_DATABASE_URL=...         # Neon PostgreSQL connection string
VITE_NEON_AUTH_URL=...        # Neon Auth URL
VITE_ADMIN_EMAIL=...          # Admin panel access email
GUEST_IP_SALT=...             # Optional; salts guest IP hashes in the OCR rate limiter
```

## Guest Rate Limiting

`api/ocr.ts` lets signed-out visitors run OCR, capped in two tiers (logic in
`api/_guestLimit.ts`, unit-tested in `src/services/__tests__/guestLimit.test.ts`):

| Tier | Key | Cap / hour |
|---|---|---|
| Per browser | `X-Guest-Id` header (localStorage) | 3 conversions |
| Per network | salted hash of client IP | 30 conversions |

One *conversion* = one uploaded document; every page shares a `conversionId`, so
a 40-page PDF counts once. **Do not collapse this back to an IP-only limit** —
carrier-grade NAT is normal in Ethiopia, so one visitor would lock out everyone
else on their network. Signed-in users skip both tiers. Both fail open if the
database is unreachable.

## Related Documents

- `ARCHITECTURE.md` — System design, data flow, component boundaries
- `DESIGN_SYSTEM.md` — Colors, typography, component patterns
- `WORKFLOW.md` — YC 5-phase development plan & action items
- `PLAN.md` — (Legacy) InDesign-style expansion plan

## Testing

- **Framework:** Vitest with jsdom environment
- **Run:** `npm run test` (headless), `npm run test:watch` (watch mode)
- **Files:** `src/services/__tests__/`, `src/lib/__tests__/`
- **Coverage goal:** 100% test coverage for new code paths
- **Conventions:** Unit tests for services, integration tests for API routes
