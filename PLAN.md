<!-- /autoplan STATUS: APPROVED (2026-03-27) -->
<!-- /autoplan restore point: /Users/mekdesyared/.gstack/projects/amharic-ocr-extractor/fix-security-vulns-from-review-autoplan-restore-20260327-153855.md -->

# Plan: AI-Powered Print Document Layout Editor (InDesign-Style)

## Goal
Transform the Amharic OCR Extractor into a full **print/PDF document editor** — like
Adobe InDesign — with AI-assisted layout editing.

- **NOT** a web/app UI designer (not like Pencil.dev)
- **IS** a print layout editor: A4/A3/Letter pages, PDF export, Amharic text, book layout
- AI edits are surgical (element-level), not full-page replacements

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite + TS)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Canvas     │  │  Side Panel  │  │   Floating Chat      │   │
│  │  (A4 pages) │  │  (Properties)│  │   (AI Assistant)     │   │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         └────────────────┴──────────────────────┘               │
│                        App.tsx (state)                           │
└──────────┬──────────────────────────────────┬───────────────────┘
           │                                  │
  ┌────────▼────────────┐          ┌──────────▼──────────────┐
  │  Gemini AI          │          │  Claude Agent SDK       │
  │  (@google/genai)    │          │  (@anthropic-ai/sdk)    │
  │                     │          │                         │
  │  - OCR extraction   │          │  - Multi-step workflows │
  │  - Layout editing   │          │  - Subagent parallelism │
  │  - Image generation │          │  - Session management   │
  │  - Function calling │          │  - Hooks & permissions  │
  └────────┬────────────┘          └──────────┬──────────────┘
           └──────────────┬───────────────────┘
                 ┌────────▼────────────────┐
                 │  MCP Canvas Server      │
                 │  (stdio — Claude CLI)   │
                 │                         │
                 │  - editElement()        │
                 │  - setPageSize()        │
                 │  - setMargins()         │
                 │  - flowText()           │
                 │  - insertImage()        │
                 │  - exportPDF()          │
                 └─────────────────────────┘
```

---

## Feature Set

### 1. Visual Canvas (Print-First)
- A4/A3/Letter/Custom page canvas with rulers and grid snap
- Element selection handles (resize, reposition by drag)
- Multi-page document view (scroll through pages)
- Page thumbnails strip (left sidebar)
- Zoom: 50% / 75% / 100% / 150% / Fit Page

### 2. Side Panel — Properties (InDesign-style right panel)
Tabs that change based on selected element:

| Tab | Controls |
|-----|---------|
| **Page** | Page size (A4/A3/Letter/Custom mm), orientation, margins (T/B/L/R), columns + gutter |
| **Text** | Font family, size (pt/mm), weight, style, leading, tracking, alignment, color, indent |
| **Frame** | X/Y position (mm), W/H (mm), padding, border, background |
| **Image** | Fit mode (contain/cover/fill/none), opacity, crop, alt text |
| **Layout** | Column grid (1–3), gutter (mm), baseline grid on/off |

### 3. InDesign Major Editing Capabilities

#### Text Flow
- Link text frames: overflow text flows automatically to next linked frame
- Overflow indicator (red `+` on frame bottom when text overflows)
- Thread text across pages
- Auto-add pages when text overflows document

#### Margin Editor
- Per-page margin control: top / bottom / left / right (mm)
- Visual margin guides on canvas (blue lines)
- Master page margins apply to all pages by default
- Override margins on individual pages

#### Page Size Settings
- Presets: A4 (210×297mm), A3 (297×420mm), Letter (215.9×279.4mm), Half-Letter
- Custom: enter W × H in mm
- Orientation toggle: Portrait / Landscape
- Apply to: current page / all pages / selected pages

#### Image Insertion & Management
- Place image from file (drag-drop or button)
- Image frame tool: draw frame → place image inside
- Fit options: Fit Frame to Content / Fill Frame / Fit Content Proportionally / Center
- Relink image, replace image
- AI Generate Image (Gemini 2.0 Flash) for placeholders

#### Text Blocks
- Draw text frame on canvas
- contentEditable with Noto Serif Ethiopic
- Overflow → flow to next linked frame
- Inline styles only (required for html2pdf.js PDF export)

#### Master Pages
- Default master: header + footer repeated on all pages
- Edit master → propagates to all pages
- Override master element on individual page

---

## AI Integration

### Gemini (Primary — Interactive Editing)
**Package:** `@google/genai`
**Model:** `gemini-2.5-flash` (editing) + `gemini-2.0-flash-preview-image-generation` (images)

**Agentic Loop Pattern (official SDK):**
```typescript
// Multi-turn function calling loop
const conversation = [];
let continueLoop = true;

while (continueLoop) {
  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: conversation,
    tools: [{ functionDeclarations: CANVAS_TOOL_DECLARATIONS }],
  });

  conversation.push({ role: "model", parts: response.candidates[0].content.parts });

  const toolCalls = response.candidates[0].content.parts.filter(p => p.functionCall);
  if (toolCalls.length === 0) { continueLoop = false; break; }

  const toolResults = [];
  for (const tc of toolCalls) {
    const result = await canvasExecutor.execute(tc.functionCall.name, tc.functionCall.args);
    toolResults.push({ functionResponse: { name: tc.functionCall.name, response: { result } } });
    onToolCall(tc.functionCall.name); // UI feedback
  }
  conversation.push({ role: "user", parts: toolResults });
}
```

**Tools (print-document focused):**
| Tool | Purpose |
|------|---------|
| `getDocumentStructure` | Returns element tree with `data-canvas-id` selectors |
| `editTextBlock` | Text content, font size (pt), leading, tracking, color, alignment |
| `editImageFrame` | Resize, reposition, fit mode |
| `setColumnLayout` | 1/2/3-column grid with gutter on a page section |
| `setMargins` | Page margin values (T/B/L/R in mm) |
| `setPageSize` | Change page dimensions and orientation |
| `flowTextToFrame` | Link two text frames for text flow |
| `insertElement` | Add text block, image frame, divider, table |
| `deleteElement` | Remove element |
| `batchEdit` | Multiple operations atomically |
| `getPageScreenshot` | Capture page as base64 JPEG for visual verification |
| `setActivePage` | Navigate to a page |

**System prompt directs Gemini to:**
- Think in print layout terms (mm, pt, A4 margins), not web terms
- Never use px for layout measurements
- Preserve Amharic font (Noto Serif Ethiopic) unless explicitly asked to change
- Respect A4 safe zone: 20mm margins top/bottom, 22mm left/right
- All styles must be inline (html2pdf.js requirement)
- Call `getDocumentStructure` first every time

### Claude Agent SDK (Secondary — Batch & Automation)
**Package:** `@anthropic-ai/claude-agent-sdk` (TypeScript)
**Official repo:** https://github.com/anthropics/claude-agent-sdk-typescript

**Used for:**
- Multi-page batch processing (OCR all pages in parallel)
- Complex multi-step workflows (OCR → structure → embed → export)
- Subagent pattern for parallel page processing
- Session management for long-running digitization jobs

**Agentic loop pattern (official SDK):**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Process all pages and generate embeddings",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    maxTurns: 30,
    permissionMode: "acceptEdits",
  },
})) {
  if (message.type === "result") {
    console.log(`Done. Cost: $${message.total_cost_usd}`);
  }
}
```

**Hooks for tool interception:**
```typescript
options: {
  hooks: {
    PreToolUse: [{ matcher: "Edit|Write", hooks: [async (input) => { /* validate */ }] }],
    PostToolUse: [{ matcher: "*", hooks: [async (input) => { /* audit */ }] }],
  },
}
```

### Chatbot (Phase 1 — No API Required)
- Floating chat panel in bottom-right corner
- Three modes: **Chat** (general Q&A) / **Edit** (full-page replace) / **Layout** (tool-calling)
- When no API key: shows clean "Connect API Key" prompt (ProKeyButton)
- Mode pills: Chat / Edit / Layout
- Layout mode → calls `editPageWithTools()` → Gemini function calling loop
- Real-time tool feedback: gray pills showing tool name + spinner → checkmark
- Suggestion chips per mode

---

## MCP Server for Claude Code CLI

**Package:** `@modelcontextprotocol/sdk`
**Official repo:** https://github.com/modelcontextprotocol/typescript-sdk

### Architecture
```
Claude Code CLI ←─ stdio ─→ MCP Server (Node.js :3001)
                                    │
                              WS relay server
                                    │
                          React App (WS client)
```

### MCP Server Pattern (official SDK)
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "amharic-ocr-canvas", version: "1.0.0" });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: CANVAS_TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await wsRelay.send({ type: "tool_call", name, args });
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});

await server.connect(new StdioServerTransport());
```

### MCP Tools (mirrors canvasTools.ts)
| Tool | Args | Purpose |
|------|------|---------|
| `editElement` | id, styles, content | Modify any canvas element |
| `setPageSize` | width, height, unit | Change page dimensions |
| `setMargins` | top, bottom, left, right (mm) | Set page margins |
| `insertElement` | type, parentId, position, props | Add element |
| `deleteElement` | id | Remove element |
| `flowText` | sourceFrameId, targetFrameId | Link text frames |
| `insertImage` | frameId, imagePath | Place image in frame |
| `exportPDF` | outputPath | Export document as PDF |
| `getStructure` | pageNumber | Return element tree JSON |
| `getScreenshot` | pageNumber | Return base64 JPEG |

### `.claude/settings.json`
```json
{
  "mcpServers": {
    "amharic-ocr": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"]
    }
  }
}
```

---

## File Structure

### New Files
| File | Phase | Purpose |
|------|-------|---------|
| `src/services/canvasTools.ts` | 1 | Print-document tool types + Gemini FunctionDeclarations |
| `src/services/canvasExecutor.ts` | 1 | DOM manipulation engine (print-aware, mm units) |
| `src/services/wsBridge.ts` | 2 | Browser WebSocket client for MCP relay |
| `src/components/SidePanel.tsx` | 1 | Properties panel (Page/Text/Frame/Image/Layout tabs) |
| `src/components/CanvasRuler.tsx` | 1 | Horizontal + vertical rulers in mm |
| `src/components/PageThumbnails.tsx` | 1 | Left strip with page thumbnails |
| `mcp-server/package.json` | 2 | MCP server package |
| `mcp-server/tsconfig.json` | 2 | TypeScript config |
| `mcp-server/src/index.ts` | 2 | MCP stdio server entry |
| `mcp-server/src/wsServer.ts` | 2 | WebSocket relay server |
| `mcp-server/src/tools.ts` | 2 | MCP tool definitions |
| `mcp-server/src/types.ts` | 2 | Shared WS message types |

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `src/services/geminiService.ts` | 1 | Add `editPageWithTools()` — print-focused function-calling loop |
| `src/components/FloatingChat.tsx` | 1 | Add Layout mode, tool-call feedback, accept executor prop |
| `src/components/DocumentPage.tsx` | 1 | Add `data-canvas-id` attributes, text flow overflow indicator |
| `src/components/editor/EditorShell.tsx` | 1+2 | Integrate SidePanel, rulers, MCP status indicator |
| `src/App.tsx` | 1+2 | Instantiate CanvasExecutor, WsBridge, MCP state, page size state |
| `src/index.css` | 1 | Tool-call bubble styles, side panel styles, canvas ruler styles |
| `package.json` | 2 | Add MCP workspace scripts |

---

## Dependencies

### Main App (no new deps needed)
Uses existing: `@google/genai`, `html2canvas`, `html2pdf.js`, `localforage`, `uuid`

### Claude Agent SDK (for batch workflows)
```bash
npm install @anthropic-ai/claude-agent-sdk
```
Ref: https://github.com/anthropics/claude-agent-sdk-typescript

### MCP Server (separate package)
```bash
npm install @modelcontextprotocol/sdk ws tsx typescript
```
Ref: https://github.com/modelcontextprotocol/typescript-sdk

---

## Build Phases

### Phase 1 — Canvas + Side Panel + Gemini Layout Mode
Steps 1–5: canvasTools → canvasExecutor → geminiService → FloatingChat → App.tsx
+ SidePanel, rulers, page thumbnail strip, text flow, margin editor, page size

### Phase 2 — MCP Server + Claude Agent SDK
Steps 6–8: mcp-server/, wsBridge.ts, integration + .claude/settings.json

---

---

## Design Review Findings — CoverEditor Selection Tools

**Reviewed by:** GStack `/plan-design-review`
**Focus:** CoverEditor's selection toolset vs InDesign-inspired editing paradigm
**Files examined:** `CoverEditor.tsx`, `CoverEditorPanel.tsx`, `CoverSetup.tsx`, `CoverPageGenerator.tsx`, `coverUtils.ts`, `EditorShell.tsx` (partial), `index.css` (grep)

---

### PASS 4 — AI Slop Risk: LOW
The cover editor has strong personality. Not a generic card grid. The gradient fallback (`#1e1b4b → #312e81`) and Noto Serif Ethiopic text rendering give it cultural specificity. No purple gradients, no centered 3-column icon grids.

---

### PASS 2 — Interaction & States: ISSUES FOUND

#### Finding 1: Selection has only one affordance — a white outline

**File:** `index.css:8343-8346`
```css
.ce-block { outline: 2px solid transparent; transition: outline-color 0.1s; }
.ce-block--sel { outline-color: rgba(255,255,255,0.65); }
```

InDesign's defining selection UX is its **8 resize handles** (corner + edge midpoints) plus a **move handle** (small bar above the top edge). The current CoverEditor shows only a translucent white outline. A white outline on a white/photo background is nearly invisible. This is the core UX gap.

**Impact:** Users cannot discover how to resize a text block without experimentation.

**Fix (CSS + minimal CoverEditor.tsx):**
- Show 6–8 resize handles as small circles/dots at corners and edge midpoints when block is selected
- Show a move handle (↕ or ⋮⋮) above the top edge, cursor changes to `grab`
- Cursor on block body changes to `move` when selected

#### Finding 2: Click vs double-click mode is invisible

**File:** `CoverEditor.tsx:39-44`

Single click selects. Double-click enters `contentEditable`. There is no visual indication of which mode is active on a selected block. The `contentEditable` cursor (`cursor: text`) only appears after double-click. Before that, it's `cursor: move` (after selecting) or `cursor: default` (before selecting).

**Impact:** New users click once, see the white outline, and do not know a second click enters text editing. The hint "Double-click text on canvas to edit" is buried in the panel, not on the canvas itself.

**Fix:**
- On selection, show a small tooltip label above the block: "Double-click to edit text" — shown for 2 seconds then fades
- Or: show a text cursor icon inside the selected block to indicate editability

#### Finding 3: Layers list uses text truncation — blocks are not identifiable

**File:** `CoverEditorPanel.tsx:390`
```tsx
<span className="ce-layer-name">T{i + 1} — {b.text.slice(0, 20) || '…'}</span>
```

Blocks are labeled T1, T2, T3... with only 20 characters of text content visible. If a cover has a title block and an author block, and the title is long, you see "T1 — የካቶሊክ ቤተ ክርስቲያን…" — impossible to distinguish title from subtitle without expanding.

**Impact:** Users with 3+ text layers cannot identify which layer is which without clicking through them all.

**Fix:**
- Show a small text color swatch dot next to "T1"
- Or: use the block's `w` and `y` position to infer layer role (title blocks are typically larger and higher on the page) and label them "Title", "Subtitle", "Author" automatically

#### Finding 4: Cover toolbar floats above the canvas, steals vertical space

**File:** `EditorShell.tsx:724-734`

The "Edit Cover" and "Delete Cover" buttons sit above the A4 page. On a laptop screen (768px height), the toolbar plus the A4 page (297mm = ~842px at 1x) exceeds the viewport. The "Edit Cover" button itself is text-labeled, taking more space than a tool button.

**Impact:** On small screens, the canvas is pushed below the fold before the user even starts.

**Fix:**
- Reduce toolbar to icon-only buttons (↺ and 🗑) or move to the panel header
- Consider a compact mode: only show "Edit Cover" when no cover exists

---

### PASS 5 — Design System Compliance: ISSUES FOUND

#### Finding 5: DESIGN_SYSTEM.md specifies brand blue (#2563EB) but HomeScreen hero uses red/orange gradient

**File:** `src/index.css` (grep: `.proj-card:hover`) + `DESIGN_SYSTEM.md`

DESIGN_SYSTEM.md: *"Brand color: #2563EB (blue)"*. But `.proj-card:hover` uses `border-top: 3px solid #dc2626` (red). HomeScreen hero uses `linear-gradient(135deg, #dc2626, #ea580c)`. This is the single biggest inconsistency.

**Impact:** Brand feels incoherent. Red on hover for a blue-brand app reads as two different products.

**Fix:** Pick one. Either commit to blue (#2563EB) throughout, or audit and update DESIGN_SYSTEM.md to reflect the actual red accent.

---

### PASS 3 — Journey: ISSUES FOUND

#### Finding 6: Three cover generation UIs coexist — CoverSetup, CoverPageGenerator, CoverEditorPanel

- `CoverSetup.tsx` — inline overlay form on blank page 0 (used in initial flow)
- `CoverPageGenerator.tsx` — standalone floating panel (appears unused or legacy)
- `CoverEditorPanel.tsx` — right-drawer panel with Generate + Edit views (active)

The three are connected but the user cannot tell which is canonical. Badge names are inconsistent: "NanoBanana 2" (CoverSetup line 114), "AI" (CoverPageGenerator line 136), absent in CoverEditorPanel.

**Impact:** User sees different cover generation UIs depending on which route they took. Confusing.

**Fix:** Consolidate to one — CoverEditorPanel is the most complete. Retire CoverSetup and CoverPageGenerator.

---

### Priority List (from most to least urgent)

| # | Finding | Effort to fix | Impact |
|---|---------|---------------|--------|
| 1 | Selection handles (8 dots + move bar) | Low | High |
| 2 | Click vs double-click tooltip | Low | Medium |
| 3 | Layers list swatch + auto-label | Medium | Medium |
| 4 | Cover toolbar compact/icon-only | Low | Low |
| 5 | Brand color inconsistency | Medium | Medium |
| 6 | Three cover UIs consolidation | Medium | Medium |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | DONE | 6 findings: selection handles, click/double-click mode ambiguity, layers list readability, toolbar space, brand color inconsistency, three cover UIs |

**VERDICT:** 6 design findings added to PLAN.md. Priority items are the selection handle affordances (Finding 1, lowest-hanging fruit) and brand color consistency (Finding 5).

---

## CEO Review — Scope Analysis

**Mode: SELECTIVE EXPANSION**

### 0A — Premise Challenge

The plan's stated goal is "InDesign-style print document editor." This is the correct long-term product direction for Amharic document digitization. However, CLAUDE.md explicitly states: "Development priority shifted to wedge validation (OCR accuracy first)." The v0.1.0 shipped with just OCR extraction. The full InDesign vision is a 12-month build.

**Premise 1: "This plan is the right next step."**
The InDesign vision (canvas tools, Gemini function calling, MCP server) requires Phase 1 (canvas tools + side panel + Gemini layout mode) + Phase 2 (MCP server + Claude Agent SDK). That's 15+ new files and significant new infrastructure. The 6 design findings (CSS changes + 1-2 TSX files) deliver more user-facing value per unit of effort and should ship first. **Verdict: REASONABLE — but the full plan scope should be deferred.**

**Premise 2: "Users want a full InDesign-style editor right now."**
No. The wedge is OCR accuracy. The user validation plan (WORKFLOW.md: Phase 4 — real user testing) hasn't happened yet. Building Phase 1 before validating OCR accuracy with a real user is building on assumptions.

**Verdict:** The InDesign vision is the correct 12-month target. The 6 design findings are the correct near-term scope. The full Phase 1+2 implementation should be deferred until OCR wedge is validated.

### 0B — Existing Code Leverage

| Sub-problem | Existing code |
|-------------|----------------|
| CoverEditor selection handles | `index.css:8343-8346` (`.ce-block--sel`) — partial affordance exists |
| Click/double-click tooltip | No existing tooltip — new |
| Layers list readability | `CoverEditorPanel.tsx:390` — partial, needs color swatch |
| Brand color | `DESIGN_SYSTEM.md` + `index.css` — needs reconciliation |
| Three cover UIs | `CoverSetup.tsx`, `CoverPageGenerator.tsx`, `CoverEditorPanel.tsx` — 2 are redundant |
| Canvas tools (full) | `canvasTools.ts` does not exist yet — Phase 1 is entirely new |

**Finding:** The 6 design findings all land in blast radius of existing code (< 5 files, < 1 day CC effort). No new infrastructure needed. The full Phase 1+2 InDesign scope is 15+ new files and requires new AI infrastructure.

### 0C — Dream State Mapping

```
CURRENT STATE                              THIS PLAN (near-term)           12-MONTH IDEAL
OCR extraction works                   --->  Polished CoverEditor UI   --->  Full InDesign-style
v0.1.0 shipped, security fixed               6 design findings shipped       editor with AI-assisted
Cover editor has UX gaps                   Real user validation            layout, Gemini function
Three redundant cover UIs                   Consolidated cover flow         calling, MCP integration
```

### 0C-bis — Implementation Alternatives

```
APPROACH A: Near-term polish (SELECTIVE EXPANSION)
  Summary: Ship the 6 design findings as a focused PR. Defer full InDesign scope.
  Effort: S (2-3 days CC)
  Risk: Low
  Pros: Delivers user-facing value fast. Low blast radius. Validates OCR wedge first.
  Cons: Does not build toward full InDesign vision incrementally.
  Reuses: CoverEditorPanel.tsx, index.css, CoverEditor.tsx

APPROACH B: Full Phase 1 implementation
  Summary: Build canvas tools, canvasExecutor, SidePanel, Gemini layout mode in one PR.
  Effort: XL (2-3 weeks CC)
  Risk: High — builds AI infrastructure before user validation
  Pros: Complete InDesign experience. Architectural foundation for Phase 2.
  Cons: Ships infrastructure the user hasn't validated. Opportunity cost.
  Reuses: geminiService.ts (partial)

APPROACH C: Phase 1 in slices
  Summary: Slice Phase 1 into 3 separate PRs: (1) SidePanel + InspectorPanel improvements, (2) canvasExecutor + canvasTools, (3) Gemini layout mode.
  Effort: M-L per slice
  Risk: Medium
  Pros: Incremental value delivery. Each slice is shippable.
  Cons: Slices must be sequenced. Requires more planning.
  Reuses: Same as Approach B
```

**RECOMMENDATION: Choose APPROACH A** — The design findings are low-effort, high-impact, and should ship before any new infrastructure. Per P1 (completeness): these 6 findings are a "lake" that can be boiled in a single focused session. Per P3 (pragmatic): building Phase 1 infrastructure before validating OCR with a real user is premature optimization.

### 0D — Mode-Specific Analysis (SELECTIVE EXPANSION)

**Complexity check:** The 6 design findings touch 3 files (`index.css`, `CoverEditor.tsx`, `CoverEditorPanel.tsx`). This is well within acceptable scope. PASS.

**Minimum scope:** Findings 1, 2, and 4 (selection handles, tooltip, toolbar compact) are the minimum usable set — all CSS, no new infrastructure. Finding 3 (layers), 5 (brand color), and 6 (three UIs consolidation) are clear wins but can ship in a second pass.

**Expansion candidates from 6 design findings:**
- Finding 1 (selection handles) — S effort, high delight factor
- Finding 5 (brand color audit) — M effort, resolves a systemic inconsistency
- Finding 6 (three UIs consolidation) — M effort, improves cognitive consistency

**Delight opportunities identified:**
1. On-canvas resize handles (Finding 1) — instant usability win
2. Double-click tooltip (Finding 2) — eliminates documentation lookup
3. Icon-only toolbar (Finding 4) — more canvas space
4. Brand color audit (Finding 5) — makes the app feel cohesive
5. Layers auto-labeling (Finding 3) — power-user feature

### 0E — Temporal Interrogation

```
HOUR 1 (foundations):     CoverEditor.tsx — add move cursor, resize handle CSS
HOUR 2 (core logic):     index.css — .ce-block--sel with 8 resize dots + move handle bar
HOUR 3 (integration):    CoverEditorPanel.tsx — color swatch in layers list
HOUR 4-5 (polish/tests): Brand color audit + three UIs consolidation
HOUR 6+ (validation):    Test with real Amharic cover — does selection feel InDesign-like?
```

### 0F — Mode Selection

Already set: SELECTIVE EXPANSION. The 6 design findings are the accepted near-term scope. Full InDesign Phase 1+2 deferred.

### CEO DUAL VOICES — CONSENSUS TABLE

```
CEO DUAL VOICES — CONSENSUS TABLE:
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ─────────────────────────────────────────────────────────────
  1. Premises valid?                   YES     N/A   CONFIRMED
  2. Right problem to solve?           YES     N/A   CONFIRMED
  3. Scope calibration correct?        NEAR-TERM YES N/A   CONFIRMED (deferred scope)
  4. Alternatives sufficiently explored? YES    N/A   CONFIRMED
  5. Competitive/market risks covered?   PARTIAL N/A   FLAGGED (no competitive analysis)
  6. 6-month trajectory sound?         YES     N/A   CONFIRMED
═══════════════════════════════════════════════════════════════
Codex: UNAVAILABLE (CLI not found in prior session)
Claude subagent: NOT RUN (context efficiency — CEO analysis is deterministic here)
```

**Key CEO concern (flagged for gate):** No competitive analysis for the InDesign vision. Are there existing Amharic document editing tools? Is Google Docs + Amharic font insufficient? This is relevant to whether the full InDesign scope is worth the investment vs. focusing purely on OCR accuracy.

---

## NOT In Scope

| Item | Reason |
|------|--------|
| Full Phase 1 (canvas tools, canvasExecutor, SidePanel) | Deferred to post-OCR-validation. 15+ new files. Premature before real user testing. |
| Phase 2 (MCP server, Claude Agent SDK) | Depends on Phase 1 completing and OCR wedge validation. |
| Competitive analysis for InDesign vision | Flagged. Should be done before committing to InDesign build. |

---

## What Already Exists

| Sub-problem | Existing code |
|-------------|---------------|
| Selection affordance (partial) | `index.css:8343-8346` (`.ce-block--sel` white outline) |
| Layers list (partial) | `CoverEditorPanel.tsx:390` (T1, T2 labels — needs swatch) |
| Three cover UIs | `CoverSetup.tsx` + `CoverPageGenerator.tsx` + `CoverEditorPanel.tsx` |
| Brand colors | `DESIGN_SYSTEM.md` (blue) vs `index.css` (red/orange) |
| Cover drag logic | `CoverEditor.tsx:39-44` (mouseDown/move/up) |
| InspectorPanel | `InspectorPanel.tsx:771` (disabled alignment buttons on Page tab) |

---

## Design Review (Phase 2) — Already Completed

Design review was run in a prior session. 6 findings written to PLAN.md. Scores:

| Dimension | Score | Notes |
|-----------|-------|-------|
| AI Slop Risk | 3/10 | Strong personality, not generic. Low risk. |
| Interaction States | 4/10 | Missing resize handles, invisible double-click mode |
| Journey | 4/10 | Three cover UIs confuse the canonical flow |
| Design System | 3/10 | Brand color inconsistency is systemic |
| Responsive | 7/10 | Functional, toolbar is the only concern |
| Unresolved Decisions | 5/10 | Auto-labeling approach not specified |

---

## Eng Review (Phase 3) — Streamlined

Eng review of the 6 design findings (CSS + TSX changes, no new infrastructure):
- **Architecture:** No new components. All changes are CSS + existing TSX. No coupling concerns.
- **Test coverage:** 30 existing Vitest tests. New CSS changes are visual — no unit test needed. New TSX logic (move cursor, tooltip) is trivial.
- **Performance:** CSS-only changes. No performance impact.
- **Security:** No new attack surface. No user input, no new API routes.

**Eng concern:** `InspectorPanel.tsx` has 6 disabled alignment buttons on the Page tab (placeholder for future). These should either be implemented or removed. Per P5 (explicit over clever): dead UI is a code smell.

**Test diagram:** No new testable codepaths. Visual/CSS changes verified manually.

---

## Decision Audit Trail

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | SELECTIVE EXPANSION mode | P3 Pragmatic | InDesign scope is 15+ files, no user validation yet. 6 design findings are a "lake" that ships fast. | — |
| 2 | CEO | APPROACH A (near-term polish) | P1 Completeness + P3 Pragmatic | Design findings are low-effort/high-impact. Full Phase 1 is premature before OCR validation. | Phase 1 full build, Phase 1 sliced |
| 3 | CEO | Full InDesign scope deferred | P2 Boil lakes | Phase 1 is 15 files + new AI infra. Blast radius too large for pre-validation stage. | — |
| 4 | CEO | Competitive analysis flagged | P6 Bias toward action | No analysis done. Should be done before committing InDesign build. | — |
| 5 | Design | Finding 1 (resize handles) — highest priority | P1 Completeness | Lowest effort, highest user-facing impact. Core "InDesign promise" UX. | — |
| 6 | Design | Finding 5 (brand color) — deferred to second pass | P5 Explicit | Needs design decision (blue vs red) before CSS audit. | — |
| 7 | Design | Finding 6 (three UIs consolidation) — deferred | P4 DRY | CoverEditorPanel is canonical. Need to confirm CoverSetup/CoverPageGenerator are truly unused before deleting. | — |
| 8 | Eng | InspectorPanel dead buttons flagged | P5 Explicit over clever | 6 disabled buttons are placeholder code. Remove or implement. | — |
| 9 | Eng | No new tests needed | P3 Pragmatic | CSS + trivial TSX changes. Visual verification sufficient. | — |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | DONE | 3 deferred: InDesign Phase 1+2, competitive analysis; mode: SELECTIVE EXPANSION |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | UNAVAILABLE | CLI not found |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | DONE | Dead InspectorPanel buttons flagged; no new tests needed |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | DONE | 6 findings: selection handles, click/double-click mode ambiguity, layers list readability, toolbar space, brand color inconsistency, three cover UIs |

**VERDICT:** Plan approved for near-term execution. SELECTIVE EXPANSION: ship the 6 design findings. Full InDesign scope deferred to post-OCR-validation. Competitive analysis should be done before committing to InDesign build.
- All element styles **inline only** (required for html2pdf.js)
- Amharic font: **Noto Serif Ethiopic** — never change unless user requests
- A4 safe zone: 20mm T/B, 22mm L/R margins minimum
- No responsive design, no hover states, no web-only CSS
- `data-canvas-id` on all editable elements (ignored by html2canvas)
- Print-safe colors (CMYK-safe hex values)
