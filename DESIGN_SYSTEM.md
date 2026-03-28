# Design System — Amharic OCR Extractor

> **Last updated:** 2026-03-25

---

## Design Principles

1. **Document is the hero** — The scanned page and extracted text take center stage.
   UI chrome stays minimal and recedes.
2. **Amharic-first typography** — Fidel characters need generous line-height (≥1.6)
   and clear rendering. Never compromise Ethiopic readability.
3. **Professional, not generic** — Avoid default Material UI / Bootstrap look.
   The tool should feel purpose-built for Amharic document work.
4. **Print-aware** — Everything maps back to A4 paper. Layout in mm, not px.

---

## Typography

```
Primary Font (UI):          Inter, system-ui (Latin elements)
Amharic Content Font:       Noto Serif Ethiopic (extracted text on A4 pages)
Amharic UI Font:            Noto Sans Ethiopic (labels, buttons, menus)
Monospace:                  JetBrains Mono, monospace (code, export preview)

Base Size:    16px (1rem)
Line Height:  1.6 minimum for Amharic content (fidel readability)
              1.5 for Latin UI text
Scale:        Major Third (1.25)
              H1: 31px | H2: 25px | H3: 20px | Body: 16px | Small: 13px
```

---

## Color Palette

### Light Theme
```
-- Backgrounds --
Background:         #FAFAF8   (warm off-white, easy on eyes for long document work)
Surface:            #FFFFFF   (cards, panels, modals)
Canvas:             #E5E7EB   (neutral gray behind A4 pages)

-- Text --
Text Primary:       #1A1A1A   (near-black, high contrast for Amharic)
Text Secondary:     #6B7280   (labels, hints, metadata)
Text Muted:         #9CA3AF   (placeholders, disabled)

-- Brand --
Primary:            #EF4444   (brand red — urgency, precision, Amharic energy)
Primary Hover:      #DC2626
Primary Light:      #FEF2F2   (selected states, highlights)
Primary Gradient:   linear-gradient(135deg, #EF4444, #DC2626)

-- Functional --
Success:            #059669   (confirmed OCR, high confidence text)
Warning:            #D97706   (low confidence characters, needs review)
Error:              #DC2626   (OCR failure, rate limit, errors — same as brand)
Error Light:        #FEF2F2   (error backgrounds)

-- Editor --
Selection Red:      #EF444420 (12% opacity — selected elements)
Bounding Box:       #EF4444   (solid 2px — element outlines)
Grid Lines:         #D1D5DB   (subtle, non-distracting)
```

### Dark Theme
```
-- Backgrounds --
Background:         #0F0F0F
Surface:            #1A1A1A
Canvas:             #262626

-- Text --
Text Primary:       #F5F5F5
Text Secondary:     #A1A1AA
Text Muted:         #71717A

-- Brand --
Primary:            #F87171   (brand red — dark theme variant)
Primary Hover:      #EF4444
Primary Light:      #450A0A

-- Functional --
(Same hues, slightly adjusted for dark backgrounds)
Success:            #10B981
Warning:            #F59E0B
Error:              #EF4444
```

---

## Component Patterns

| Component | Style Rule |
|---|---|
| **Buttons (Primary)** | `rounded-lg`, solid fill, 40px height, font-weight 600 |
| **Buttons (Secondary)** | `rounded-lg`, 1px border, transparent fill, same height |
| **Buttons (Ghost)** | No border, no fill, hover shows subtle background |
| **Cards / Panels** | 1px border `#E5E7EB`, `rounded-xl`, subtle shadow |
| **Inspector Panel** | Right drawer, 320px width, collapsible |
| **Toolbar (Bottom)** | Floating dock, center-bottom, rounded-full, shadow-lg |
| **Page Thumbnails** | Left sidebar, 200px width, collapsible |
| **A4 Page** | White, `210mm × 297mm`, padding `20mm 22mm`, drop shadow |
| **Modals** | Centered overlay, `rounded-2xl`, max-width 600px |
| **Toast** | Bottom-right, auto-dismiss, rounded-lg |
| **Input Fields** | `rounded-lg`, 1px border, 40px height, focus ring blue |

---

## Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│  Top Bar (48px) — Home, Title, Theme, User Menu          │
├─────────┬──────────────────────────┬─────────────────────┤
│  Page   │                          │   Right Drawer      │
│  Thumb  │    Document Canvas       │   (Inspector /      │
│  Sidebar│    (scrollable, zoomable)│    Agent / AI /     │
│  (200px)│                          │    Settings)        │
│         │   ┌──────────────────┐   │   (320px)           │
│  [pg 1] │   │   A4 Page        │   │                     │
│  [pg 2] │   │   contentEditable│   │                     │
│  [pg 3] │   │   Noto Serif     │   │                     │
│         │   │   Ethiopic        │   │                     │
│         │   └──────────────────┘   │                     │
│         │                          │                     │
├─────────┴──────────────────────────┴─────────────────────┤
│  ┌─────────────────────────────┐                         │
│  │  Floating Dock (bottom)     │   Status bubble above   │
│  │  Tools│OCR│Page│Export│AI   │                         │
│  └─────────────────────────────┘                         │
└──────────────────────────────────────────────────────────┘
```

---

## Spacing Scale

```
4px   (0.25rem)  — tight gaps, icon padding
8px   (0.5rem)   — compact spacing, button icon gap
12px  (0.75rem)  — default inner padding
16px  (1rem)     — standard gap between elements
24px  (1.5rem)   — section spacing within panels
32px  (2rem)     — major section breaks
48px  (3rem)     — large spacing (between A4 pages in canvas)
```

---

## Icons

Using **Lucide React** exclusively. Key icons in use:

| Context | Icons |
|---|---|
| Navigation | `Home`, `ChevronLeft`, `ChevronRight` |
| Editor tools | `MousePointer2`, `Hand`, `Maximize`, `Search` |
| OCR actions | `Sparkles`, `FileText`, `FileImage` |
| Panels | `SlidersHorizontal`, `Bot`, `Layers` |
| Actions | `Trash2`, `Undo2`, `Redo2`, `Plus`, `Minus` |
| State | `Loader2` (spinner), `X` (close) |

Size: 16px for toolbar icons, 20px for panel headers, 24px for primary actions.

---

## Amharic-Specific Design Rules

1. **Line height ≥ 1.6** for any Amharic text display. Fidel characters have
   complex shapes with descenders and ascenders that clip at smaller heights.

2. **Font size ≥ 16px** for body Amharic text. Fidel is less legible than Latin
   at small sizes due to character complexity.

3. **Noto Serif Ethiopic** for document content (matches printed book feel).
   **Noto Sans Ethiopic** for UI elements (cleaner, more modern).

4. **Two-column layouts** must have ≥2rem gap. Amharic text in narrow columns
   creates awkward breaks due to word length.

5. **Never auto-hyphenate** Amharic text. CSS `hyphens: none` on all
   Ethiopic content blocks.

6. **Ethiopic punctuation** renders wider than Latin — account for this in
   horizontal spacing: ። ፣ ፤ ፡ all take more horizontal space.

7. **Text alignment**: Justify works well for Amharic body text. Center for
   headers. Never right-align Amharic (it reads left-to-right).

---

## CSS Custom Properties (index.css)

The app uses CSS custom properties for theming, defined in `index.css`.
Dark/light mode is toggled via the `useTheme` hook which sets a class on
the document root. All components should reference these variables rather
than hardcoding colors.

Anti-flicker: An inline script in `index.html` sets the theme class before
first paint to prevent flash of wrong theme on load.
