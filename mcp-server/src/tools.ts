// MCP tool definitions — mirrors the canvas tools available in canvasTools.ts
// These are exposed to Claude Code CLI via the MCP stdio protocol.

export const MCP_TOOLS = [
  {
    name: 'getStructure',
    description: 'Return the element tree of a document page as JSON with data-canvas-id selectors. Always call this first before editing.',
    inputSchema: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page number (1-indexed)' },
      },
      required: ['pageNumber'],
    },
  },
  {
    name: 'editElement',
    description: 'Modify text content and/or inline styles of a canvas element identified by data-canvas-id. Use mm/pt units, never px for layout.',
    inputSchema: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page number (1-indexed)' },
        canvasId:   { type: 'string', description: 'data-canvas-id of the target element' },
        content:    { type: 'string', description: 'New inner text content (omit to keep existing)' },
        styles:     {
          type: 'object',
          description: 'Inline CSS properties to apply (e.g. fontSize, color, textAlign)',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['pageNumber', 'canvasId'],
    },
  },
  {
    name: 'setPageSize',
    description: 'Change the page dimensions. Supports A4, A3, Letter presets or custom mm values.',
    inputSchema: {
      type: 'object',
      properties: {
        pageNumber:   { type: 'number', description: 'Page number (1-indexed)' },
        preset:       { type: 'string', enum: ['a4', 'a3', 'letter', 'half-letter', 'custom'], description: 'Size preset' },
        widthMm:      { type: 'number', description: 'Custom width in mm (required if preset=custom)' },
        heightMm:     { type: 'number', description: 'Custom height in mm (required if preset=custom)' },
        orientation:  { type: 'string', enum: ['portrait', 'landscape'], description: 'Page orientation' },
        applyToAll:   { type: 'boolean', description: 'Apply size to all pages (default false)' },
      },
      required: ['pageNumber', 'preset'],
    },
  },
  {
    name: 'setMargins',
    description: 'Set page margins in mm. A4 minimum safe zone: 20mm top/bottom, 22mm left/right.',
    inputSchema: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page number (1-indexed)' },
        topMm:      { type: 'number', description: 'Top margin in mm' },
        bottomMm:   { type: 'number', description: 'Bottom margin in mm' },
        leftMm:     { type: 'number', description: 'Left margin in mm' },
        rightMm:    { type: 'number', description: 'Right margin in mm' },
        applyToAll: { type: 'boolean', description: 'Apply margins to all pages (default false)' },
      },
      required: ['pageNumber'],
    },
  },
  {
    name: 'setColumnLayout',
    description: 'Apply a 1, 2, or 3-column grid layout to a page section.',
    inputSchema: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page number (1-indexed)' },
        canvasId:   { type: 'string', description: 'data-canvas-id of the container element (or "page" for whole page)' },
        columns:    { type: 'number', enum: [1, 2, 3], description: 'Number of columns' },
        gutterMm:   { type: 'number', description: 'Gutter between columns in mm (default 8)' },
      },
      required: ['pageNumber', 'columns'],
    },
  },
  {
    name: 'insertElement',
    description: 'Insert a new element (text block, image frame, divider, or table) into the page.',
    inputSchema: {
      type: 'object',
      properties: {
        pageNumber:  { type: 'number', description: 'Page number (1-indexed)' },
        elementType: { type: 'string', enum: ['text', 'image', 'divider', 'table'], description: 'Type of element to insert' },
        position:    { type: 'string', enum: ['start', 'end', 'after'], description: 'Where to insert relative to afterId' },
        afterId:     { type: 'string', description: 'data-canvas-id to insert after (required if position=after)' },
        content:     { type: 'string', description: 'Initial text content for text elements' },
        styles:      { type: 'object', description: 'Initial inline styles', additionalProperties: { type: 'string' } },
      },
      required: ['pageNumber', 'elementType', 'position'],
    },
  },
  {
    name: 'deleteElement',
    description: 'Remove an element from the page. This is destructive — confirm with user first.',
    inputSchema: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page number (1-indexed)' },
        canvasId:   { type: 'string', description: 'data-canvas-id of the element to delete' },
      },
      required: ['pageNumber', 'canvasId'],
    },
  },
  {
    name: 'insertImage',
    description: 'Place an image inside an existing image frame element.',
    inputSchema: {
      type: 'object',
      properties: {
        pageNumber:  { type: 'number', description: 'Page number (1-indexed)' },
        canvasId:    { type: 'string', description: 'data-canvas-id of the image frame' },
        imageBase64: { type: 'string', description: 'Base64-encoded image data (JPEG/PNG)' },
        mimeType:    { type: 'string', description: 'MIME type e.g. image/jpeg', default: 'image/jpeg' },
        fitMode:     { type: 'string', enum: ['contain', 'cover', 'fill', 'none'], description: 'How image fits the frame' },
      },
      required: ['pageNumber', 'canvasId', 'imageBase64'],
    },
  },
  {
    name: 'getScreenshot',
    description: 'Capture a page as a base64 JPEG image. Use to visually verify edits.',
    inputSchema: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page number (1-indexed)' },
      },
      required: ['pageNumber'],
    },
  },
  {
    name: 'exportPDF',
    description: 'Trigger a PDF export of the full document. Returns confirmation when download starts.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Output filename without extension (default: document)' },
      },
    },
  },
  {
    name: 'extractPage',
    description: 'Order Gemini to run OCR extraction on a document page. The browser app calls the Gemini API to extract the page image into structured HTML. Use this before any editing tool — a page must be extracted first. Returns immediately if already extracted (use force=true to re-extract).',
    inputSchema: {
      type: 'object',
      properties: {
        pageNumber: { type: 'number', description: 'Page number to extract (1-indexed)' },
        force:      { type: 'boolean', description: 'Force re-extraction even if page already has content (default false)' },
      },
      required: ['pageNumber'],
    },
  },
  {
    name: 'extractAllPages',
    description: 'Order Gemini to extract ALL pages in the document sequentially. Useful for batch digitization. Returns a summary of which pages were extracted.',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Re-extract pages that already have content (default false)' },
      },
    },
  },
] as const;
