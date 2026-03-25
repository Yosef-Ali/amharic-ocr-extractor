# Layout Extraction Bug — Handoff Brief for Multimodal LLM

## The Problem (with images)

We have an Amharic OCR app that extracts text from scanned book pages and reconstructs the layout in HTML. **The extracted HTML layout does not match the original scan.**

### What the original scan looks like:
- A **book spread** (two physical pages scanned side-by-side)
- Each physical page has **2 columns** of dense Amharic text → **4 columns total**
- Columns contain **flowing paragraphs** with numbered Bible verses
- Page numbers at top corners (e.g., "2" on left, "3" on right)
- Running headers at top (e.g., "ኦሪት ዘፍጥረት 1-2" / "ኦሪት ዘፍጥረት 2-3")
- Small font, tight line-height, justified text — dense Bible typesetting

### What the extracted HTML looks like (BROKEN):
- Text fragments scattered across the page in a table-like grid
- Words broken apart into individual cells instead of flowing paragraphs
- Column structure is wrong — either too many narrow columns or no columns at all
- Font size too large for the content density
- No visual resemblance to the original scan

---

## Architecture

**File:** `src/services/geminiService.ts`

Two-pass extraction pipeline:
1. **Pass 1 — OCR** (`buildOcrPrompt`): Sends the scan image to Gemini AI → gets raw extracted text
2. **Pass 2 — Layout** (`buildLayoutPrompt`): Sends the scan image + extracted text to Gemini AI → gets HTML that should reproduce the original layout

Both passes use model `gemini-3.1-flash-image-preview` (OCR_FAST).

The HTML is rendered inside a `contentEditable` div in `src/components/DocumentPage.tsx`.

**In compare mode** (`src/components/SplitPageView.tsx`), the original scan is shown on the left and the extracted HTML on the right, side by side. The right panel uses `compact` mode where the document page fills `width: 100%` of its panel (not fixed A4 dimensions).

---

## What Has Been Tried (and failed)

### Attempt 1: CSS Grid with manual column splitting
- OCR marks columns with `---COLUMN BREAK---`
- Layout prompt tells AI to put each column's text in a grid cell
- **Result:** AI fragments words into individual grid cells instead of flowing paragraphs

### Attempt 2: Dynamic column detection with [LAYOUT:] header
- OCR outputs `[LAYOUT: columns=4, spread=yes, pages=14,15]` on first line
- Layout prompt parses this and builds grid-template-columns
- **Result:** Same fragmentation problem — AI can't map text to grid cells properly

### Attempt 3: CSS column-count (current)
- OCR extracts all text as one continuous flow (no column markers)
- Layout prompt tells AI to use `column-count: N` on a container div
- **Result:** Still broken — AI either ignores column-count or produces wrong structure. The text comes out as a long single column or fragments.

### Attempt 4: Various prompt engineering
- Tried explicit examples, strict rules, different formatting
- Told AI to "study the image" and match it
- Added font-size guidance (0.7-0.85rem for dense Bible text)
- **Result:** No significant improvement

---

## The Core Challenge

The fundamental difficulty is getting the Gemini model to:

1. **Look at a dense 4-column Bible spread** and understand its structure
2. **Produce HTML** where text flows naturally across 4 columns using CSS
3. **Match the visual density** — small font, tight spacing, justified text
4. **Preserve complete paragraphs** — not fragment sentences into word-level chunks
5. **Work universally** — the app handles ANY document (1-col, 2-col, 4-col, newspapers, etc.)

The model consistently produces one of these failures:
- **Word salad grid**: breaks text into individual words in a table/grid
- **Single fat column**: ignores multi-column structure entirely
- **Wrong column count**: e.g., 2 columns when the original has 4
- **Giant font**: uses 1rem when the original needs 0.7rem for 4 columns to fit

---

## Key Files

| File | Purpose |
|------|---------|
| `src/services/geminiService.ts` | OCR + Layout prompts (lines 56-185) — **THIS IS WHERE THE FIX GOES** |
| `src/config/editorDefaults.ts` | Shared style defaults (font size, colors, margins) |
| `src/components/DocumentPage.tsx` | Renders the HTML in a contentEditable div |
| `src/components/SplitPageView.tsx` | Side-by-side compare (scan left, HTML right) |
| `src/components/editor/EditorShell.tsx` | Main editor with zoom, page navigation |
| `src/components/editor/InspectorPanel.tsx` | Style inspector (margins, columns, font size) |

---

## Constraints

- **Model**: Must use `gemini-3.1-flash-image-preview` for OCR (fast model — DO NOT CHANGE)
- **Output**: Raw HTML with inline styles only — no external CSS classes
- **Text integrity**: Every Amharic character must be preserved exactly
- **Universal**: Must work for 1-col, 2-col, 3-col, 4-col, any document type
- **Rendering container**: In compare mode, the HTML renders in a panel that's ~50% of viewport width. In document mode, it renders at the actual page dimensions.

---

## What a Fix Might Look Like

### Option A: Single-pass approach
Skip the two-pass OCR→Layout pipeline. Send the image directly and ask the model to output HTML in one shot. This eliminates the "text mapping to columns" problem because the model sees the image and writes HTML simultaneously.

### Option B: Better layout prompt
Keep two passes but radically simplify the layout prompt. Perhaps:
- Don't mention columns at all in the prompt
- Just say "reproduce this page exactly as HTML with inline styles"
- Let the model figure out the layout strategy on its own

### Option C: Post-processing
Extract text in one column, then use a separate step to apply CSS `column-count` based on analyzing the original image dimensions and text density. Don't ask the AI to handle columns — do it programmatically.

### Option D: Image-to-HTML directly
Use a vision model that's better at structured HTML generation. The problem may be that Gemini Flash is not strong enough at producing complex multi-column HTML from dense document images.

---

## Visual QA System (already built)

The app has a `visualQA()` function (`geminiService.ts`) that:
1. Takes a screenshot of the rendered HTML
2. Compares it with the original scan
3. Returns a quality score (1-10) and list of issues
4. Auto-generates fixed HTML if score < 7

This can be used in a verify-and-fix loop, but the underlying layout generation needs to be good enough for the fix loop to converge.

---

## How to Test

```bash
cd ~/amharic-ocr-extractor
npm run dev
```

1. Open `localhost:5173`
2. Upload the Amharic Bible PDF (700 pages)
3. Navigate to any page (e.g., page 10)
4. Click "Extract" — compare left (scan) vs right (extracted HTML)
5. The extracted HTML should visually match the scan's column structure, font size, and spacing
