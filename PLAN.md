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

## Key Constraints (Print-First Rules)
- All layout measurements in **mm** (converted to rem/px only for screen render)
- All element styles **inline only** (required for html2pdf.js)
- Amharic font: **Noto Serif Ethiopic** — never change unless user requests
- A4 safe zone: 20mm T/B, 22mm L/R margins minimum
- No responsive design, no hover states, no web-only CSS
- `data-canvas-id` on all editable elements (ignored by html2canvas)
- Print-safe colors (CMYK-safe hex values)
