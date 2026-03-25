// Print-document AI tool definitions for Gemini function calling.
// These are surgical DOM edit tools for A4/print layout — NOT web UI design.

// ── UI feedback type (shown in FloatingChat during tool execution) ─────────
export interface ToolCallFeedback {
  id:      string;
  name:    string;
  status:  'running' | 'done' | 'error';
  summary?: string;
  args?:    Record<string, unknown>;
}

// ── Tool parameter interfaces ──────────────────────────────────────────────

export interface GetDocumentStructureParams {
  pageNumber: number;
}

export interface EditTextBlockParams {
  selector:       string;
  content?:       string;   // new innerHTML
  fontSize?:      string;   // e.g. "1.1rem"
  lineHeight?:    string;   // e.g. "1.8"
  color?:         string;   // e.g. "#1c1917"
  textAlign?:     'left' | 'center' | 'right' | 'justify';
  fontWeight?:    string;   // "400" | "700" | "900"
  fontStyle?:     string;   // "normal" | "italic"
  marginTop?:     string;   // e.g. "0.5rem"
  marginBottom?:  string;   // e.g. "1rem"
  letterSpacing?: string;   // e.g. "0.05em"
  textTransform?: string;   // "none" | "uppercase" | "lowercase" | "capitalize"
  border?:        string;   // e.g. "none" or "1px solid #ccc"
  borderRadius?:  string;   // e.g. "0" or "8px"
  padding?:       string;   // e.g. "0" or "0.5rem 1rem"
  background?:    string;   // e.g. "none" or "transparent" or "#f5f5f5"
  display?:       string;   // e.g. "block" or "inline-block"
  width?:         string;   // e.g. "100%" or "auto" or "fit-content"
}

export interface EditImageFrameParams {
  selector:   string;
  width?:     string;   // e.g. "100%" or "80mm"
  maxWidth?:  string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none';
  display?:   string;   // "block" | "inline-block"
}

export interface SetColumnLayoutParams {
  selector: string;     // data-canvas-id or "root"
  columns:  1 | 2 | 3;
  gap?:     string;     // e.g. "2rem"
}

export interface InsertElementParams {
  parentSelector:   string;
  position:         'prepend' | 'append' | 'before' | 'after';
  siblingSelector?: string;
  elementType:      'p' | 'h2' | 'h3' | 'div' | 'hr' | 'ul';
  content?:         string;
  styles?:          Record<string, string>;
}

export interface DeleteElementParams {
  selector: string;
}

export interface BatchEditParams {
  operations: Array<{ tool: string; params: Record<string, unknown> }>;
}

export interface GetPageScreenshotParams {
  pageNumber: number;
}

export interface SetActivePageParams {
  pageNumber: number;
}

// ── Gemini FunctionDeclarations ────────────────────────────────────────────
// Matches @google/genai SDK function calling format

export const CANVAS_TOOL_DECLARATIONS = [
  {
    name: 'getDocumentStructure',
    description:
      'Returns the element tree of the current page with stable data-canvas-id selectors. ' +
      'ALWAYS call this first before making any edits so you understand the document structure.',
    parameters: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page number to inspect (1-indexed)' },
      },
      required: ['pageNumber'],
    },
  },
  {
    name: 'editTextBlock',
    description:
      'Edit a text element: change content, font size, line height, color, alignment, weight, ' +
      'margins, letter spacing, borders, padding, background. Use border:"none" to remove boxed titles. ' +
      'All styles must be inline (required for PDF export).',
    parameters: {
      type: 'object',
      properties: {
        selector:      { type: 'string', description: 'data-canvas-id of the element' },
        content:       { type: 'string', description: 'New HTML content (preserves inline markup)' },
        fontSize:      { type: 'string', description: 'e.g. "1.1rem". Body: 1rem, headings: 1.2–1.5rem' },
        lineHeight:    { type: 'string', description: 'Unitless ratio e.g. "1.8". Body: 1.5–1.8, headings: 1.2' },
        color:         { type: 'string', description: 'Hex e.g. "#1c1917" — use CMYK-safe values for print' },
        textAlign:     { type: 'string', description: '"left"|"center"|"right"|"justify" — justify for Amharic body' },
        fontWeight:    { type: 'string', description: '"400" regular | "700" bold | "900" black' },
        fontStyle:     { type: 'string', description: '"normal" | "italic"' },
        marginTop:     { type: 'string', description: 'e.g. "0.5rem"' },
        marginBottom:  { type: 'string', description: 'e.g. "1rem"' },
        letterSpacing: { type: 'string', description: 'e.g. "0.05em"' },
        textTransform: { type: 'string', description: '"none"|"uppercase"|"lowercase"|"capitalize"' },
        border:        { type: 'string', description: '"none" to remove borders, or "1px solid #ccc" etc.' },
        borderRadius:  { type: 'string', description: '"0" to remove rounded corners, or "8px" etc.' },
        padding:       { type: 'string', description: '"0" to remove padding, or "0.5rem 1rem" etc.' },
        background:    { type: 'string', description: '"none" or "transparent" to remove, or "#f5f5f5" etc.' },
        display:       { type: 'string', description: '"block"|"inline-block"|"flex"|"grid"' },
        width:         { type: 'string', description: '"100%"|"auto"|"fit-content"' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'editImageFrame',
    description: 'Modify an image placeholder or placed image: resize, change object-fit mode.',
    parameters: {
      type: 'object',
      properties: {
        selector:  { type: 'string', description: 'data-canvas-id of the image element' },
        width:     { type: 'string', description: 'Width e.g. "100%" or "80mm"' },
        maxWidth:  { type: 'string', description: 'Max width e.g. "100%"' },
        objectFit: { type: 'string', description: '"contain"|"cover"|"fill"|"none"' },
        display:   { type: 'string', description: '"block"|"inline-block"' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'setColumnLayout',
    description:
      'Apply a 1, 2, or 3-column grid to a container element. ' +
      'For print documents — sets CSS column-count and column-gap.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'data-canvas-id of the container, or "root" for whole page' },
        columns:  { type: 'number', description: '1, 2, or 3' },
        gap:      { type: 'string', description: 'Column gap e.g. "2rem". Default "2rem"' },
      },
      required: ['selector', 'columns'],
    },
  },
  {
    name: 'insertElement',
    description: 'Insert a new element at a position relative to an existing element or its parent.',
    parameters: {
      type: 'object',
      properties: {
        parentSelector:  { type: 'string', description: 'data-canvas-id of parent, or "root" for page root' },
        position:        { type: 'string', description: '"prepend"|"append"|"before"|"after"' },
        siblingSelector: { type: 'string', description: 'For before/after: data-canvas-id of sibling' },
        elementType:     { type: 'string', description: '"p"|"h2"|"h3"|"div"|"hr"|"ul"' },
        content:         { type: 'string', description: 'HTML content for the new element' },
      },
      required: ['parentSelector', 'position', 'elementType'],
    },
  },
  {
    name: 'deleteElement',
    description: 'Remove an element from the document.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'data-canvas-id of the element to remove' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'batchEdit',
    description:
      'Execute multiple edit operations atomically. ' +
      'Preferred for coordinated changes across multiple elements.',
    parameters: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Operations to execute in sequence',
          items: {
            type: 'object',
            properties: {
              tool:   { type: 'string', description: 'editTextBlock|editImageFrame|setColumnLayout|insertElement|deleteElement' },
              params: { type: 'object', description: 'Parameters for the tool' },
            },
            required: ['tool', 'params'],
          },
        },
      },
      required: ['operations'],
    },
  },
  {
    name: 'getPageScreenshot',
    description: 'Capture the current rendered page as a JPEG to visually verify your edits.',
    parameters: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page number to capture (1-indexed)' },
      },
      required: ['pageNumber'],
    },
  },
  {
    name: 'setActivePage',
    description: 'Navigate to a specific page number in the document.',
    parameters: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page to navigate to (1-indexed)' },
      },
      required: ['pageNumber'],
    },
  },
  {
    name: 'extractPage',
    description:
      'OCR-extract a scanned page and place the result in the document canvas. ' +
      'YOU DO NOT NEED THE PAGE IMAGE — this tool fetches it automatically by page number. ' +
      'Works for ANY page in the document, not just the currently visible one. ' +
      'ALWAYS use this tool when the user says "extract", "scan", or "digitize" a page — never say you cannot access a page. ' +
      'If the page is already extracted and force is false, returns immediately (cached). ' +
      'After success the content is live in the editor — do NOT echo or display it.',
    parameters: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page number to extract (1-indexed)' },
        force:      { type: 'boolean', description: 'Re-extract even if already done. Default false.' },
      },
      required: ['pageNumber'],
    },
  },
  {
    name: 'extractAllPages',
    description:
      'Extract ALL pages in the document using Gemini OCR, one by one. ' +
      'Reports progress page by page. Skips already-extracted pages unless force=true.',
    parameters: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Re-extract all pages even if already done. Default false.' },
      },
    },
  },
  {
    name: 'autoFillImages',
    description:
      'Find all image placeholders on an already-extracted page, locate those images in the ' +
      'original page scan using AI vision, crop them out, and replace the placeholders with ' +
      'the real cropped images. Call this after extractPage if images are still showing as placeholders.',
    parameters: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page to process (defaults to active page)' },
      },
    },
  },
  {
    name: 'openCoverSetup',
    description:
      'Opens the cover page setup UI so the user can configure and generate a book cover. ' +
      'Call this IMMEDIATELY whenever the user asks to generate, create, make, design, or build a cover page. ' +
      'Do NOT attempt to generate cover details yourself — this tool opens an interactive form that collects title, author, style, and design mode from the user. ' +
      'If the user mentions a title in their request, pass it as suggestedTitle so the form pre-fills it.',
    parameters: {
      type: 'object',
      properties: {
        suggestedTitle: { type: 'string', description: 'Optional title extracted from the user\'s request to pre-fill the form.' },
      },
      required: [],
    },
  },
] as const;
