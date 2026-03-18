import { useState } from 'react';
import {
  X, Upload, Layers, Download,
  ImageIcon, RefreshCw, Trash2, GripVertical, Plus, MessageSquare,
  SlidersHorizontal, Home, Hand, ChevronRight,
  Keyboard, Lightbulb, Star,
} from 'lucide-react';

const SECTIONS = [
  { id: 'start',   icon: <Upload size={14} />,           label: 'Getting Started' },
  { id: 'pages',   icon: <Layers size={14} />,           label: 'Pages' },
  { id: 'cover',   icon: <ImageIcon size={14} />,        label: 'Cover Page' },
  { id: 'edit',    icon: <MessageSquare size={14} />,    label: 'Editing' },
  { id: 'export',  icon: <Download size={14} />,         label: 'Export & Save' },
  { id: 'tips',    icon: <Lightbulb size={14} />,        label: 'Tips & Shortcuts' },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

interface Props { onClose: () => void; }

export default function HelpModal({ onClose }: Props) {
  const [active, setActive] = useState<SectionId>('start');

  return (
    <div className="help-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="help-modal">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="help-header">
          <div className="help-header-left">
            <Star size={16} className="help-logo-icon" />
            <div>
              <p className="help-title">User Guide</p>
              <p className="help-subtitle">Amharic OCR Extractor — full feature reference</p>
            </div>
          </div>
          <button className="help-close" onClick={onClose} title="Close"><X size={16} /></button>
        </div>

        <div className="help-body">
          {/* ── Sidebar nav ──────────────────────────────────────────── */}
          <nav className="help-nav">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className={`help-nav-btn${active === s.id ? ' help-nav-btn--active' : ''}`}
                onClick={() => setActive(s.id)}
              >
                {s.icon}
                <span>{s.label}</span>
                {active === s.id && <ChevronRight size={12} className="help-nav-arrow" />}
              </button>
            ))}
          </nav>

          {/* ── Content ──────────────────────────────────────────────── */}
          <div className="help-content">
            {active === 'start' && <SectionStart />}
            {active === 'pages' && <SectionPages />}
            {active === 'cover' && <SectionCover />}
            {active === 'edit'  && <SectionEdit />}
            {active === 'export' && <SectionExport />}
            {active === 'tips'  && <SectionTips />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared primitives ────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="help-step">
      <div className="help-step-num">{n}</div>
      <div className="help-step-body">
        <p className="help-step-title">{title}</p>
        <div className="help-step-desc">{children}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="help-tip">
      <Lightbulb size={12} className="help-tip-icon" />
      <span>{children}</span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="help-kbd">{children}</kbd>;
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="help-section-title">
      {icon}
      <h2>{children}</h2>
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

function SectionStart() {
  return (
    <div className="help-section">
      <SectionTitle icon={<Upload size={18} />}>Getting Started</SectionTitle>
      <p className="help-intro">
        Turn any scanned PDF, image, Word, or text file into a fully editable, searchable document in three steps.
      </p>

      <Step n={1} title="Open or upload a file">
        From the <strong>Home screen</strong>, drag and drop a file onto the <em>New Project</em> zone, or click it to browse.
        <br /><br />
        Supported formats:
        <ul className="help-list">
          <li><strong>PDF</strong> — multi-page, scanned or digital</li>
          <li><strong>Images</strong> — PNG, JPEG, WebP</li>
          <li><strong>Word</strong> — .docx (converted to HTML automatically)</li>
          <li><strong>Text</strong> — .txt, .md (formatted as A4 pages)</li>
        </ul>
      </Step>

      <Step n={2} title="Choose extraction quality">
        In the bottom toolbar, toggle between:
        <ul className="help-list">
          <li><strong>⚡ Fast</strong> — quick scan, good for most documents</li>
          <li><strong>✨ Pro</strong> — slower but more accurate for complex layouts</li>
        </ul>
      </Step>

      <Step n={3} title="Extract pages">
        Click <strong>Extract</strong> in the bottom toolbar. The AI will process each page and generate editable HTML.
        A countdown timer between pages prevents API rate limits.
      </Step>

      <Step n={4} title="Review results">
        Extracted pages appear on the canvas. Use the <strong>Scan / Split / Edit</strong> tabs at the top to switch between:
        <ul className="help-list">
          <li><strong>Scan</strong> — original scanned image</li>
          <li><strong>Split</strong> — side-by-side scan + extracted text</li>
          <li><strong>Edit</strong> — extracted HTML only (fully editable)</li>
        </ul>
      </Step>

      <Tip>Use <strong>Fast</strong> for a quick preview first, then switch to <strong>Pro</strong> and click <strong>Re-extract all</strong> for the final quality pass.</Tip>
    </div>
  );
}

function SectionPages() {
  return (
    <div className="help-section">
      <SectionTitle icon={<Layers size={18} />}>Managing Pages</SectionTitle>
      <p className="help-intro">
        The left sidebar shows thumbnails of all pages. Use it to navigate, reorder, add, and remove pages.
      </p>

      <Step n={1} title="Navigate pages">
        Click any thumbnail to jump to that page. The active page is highlighted with a coloured border.
        Use <strong>← →</strong> arrows in the bottom toolbar or <Kbd>⌘←</Kbd> / <Kbd>⌘→</Kbd> to step through pages.
      </Step>

      <Step n={2} title="Reorder pages by dragging">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
          <GripVertical size={13} style={{ color: '#6366f1', flexShrink: 0 }} />
          <span>Grab the <strong>grip handle</strong> on any thumbnail and drag it to a new position.</span>
        </div>
        A blue drop indicator shows where the page will land. Release to confirm.
      </Step>

      <Step n={3} title="Insert a blank page">
        Hover between any two thumbnails — a <Plus size={11} style={{ display:'inline', verticalAlign:'middle' }} /> button appears in the gap.
        Click it to insert a blank page at that position. You can also click <strong>+ Add page</strong> at the bottom of the sidebar.
      </Step>

      <Step n={4} title="Delete a page">
        Hover over a thumbnail — a <Trash2 size={11} style={{ display:'inline', verticalAlign:'middle' }} /> button appears in the top-right corner.
        Click it to permanently delete that page and its extracted content.
        <br /><br />
        Alternatively, open the <strong>⋯ More</strong> menu in the bottom toolbar and choose <em>Delete page N</em>.
      </Step>

      <Step n={5} title="Re-extract a single page">
        Click the <RefreshCw size={11} style={{ display:'inline', verticalAlign:'middle' }} /> icon in the bottom toolbar to re-run OCR on the current page only — without affecting other pages.
      </Step>

      <Tip>Double-click any thumbnail to jump to that page <em>and</em> open the Inspector panel for immediate editing.</Tip>
    </div>
  );
}

function SectionCover() {
  return (
    <div className="help-section">
      <SectionTitle icon={<ImageIcon size={18} />}>Cover Page</SectionTitle>
      <p className="help-intro">
        Generate a professional AI-designed cover page and optional back cover for your document.
      </p>

      <Step n={1} title="Open the Cover Page editor">
        Click <strong>⋯ More → Cover Page</strong> in the bottom toolbar, or navigate to page <strong>0</strong> using the page arrows.
        The <strong>Cover</strong> panel opens automatically in the right sidebar.
      </Step>

      <Step n={2} title="Fill in book details">
        Enter your <strong>Title</strong>, <strong>Subtitle</strong>, <strong>Author</strong>, and a short <strong>Style description</strong>
        (e.g. "ancient Ethiopian manuscript, gold and crimson, ornate borders").
      </Step>

      <Step n={3} title="Choose a design mode">
        <ul className="help-list">
          <li><strong>Full AI Design</strong> (default) — AI generates the complete cover including typography baked into the image. Best visual result.</li>
          <li><strong>Background Only</strong> — AI generates a text-free background; your title/author are overlaid as editable HTML elements.</li>
        </ul>
      </Step>

      <Step n={4} title="Generate">
        Click <strong>Generate Cover</strong>. The AI creates an A4 portrait image. This takes 10–20 seconds.
        The result appears live on the canvas.
      </Step>

      <Step n={5} title="Improve or regenerate">
        Switch to the <strong>Improve</strong> tab to refine the cover with a text instruction.
        Use the chips to remove text from the background if it was baked in:
        <ul className="help-list">
          <li><strong>Keep text</strong> — keep as-is</li>
          <li><strong>Remove all text</strong> — strip all text from the image</li>
          <li><strong>Remove title only</strong> / <strong>Remove author only</strong></li>
        </ul>
      </Step>

      <Step n={6} title="Generate a Back Cover">
        Scroll to the <strong>Back Cover</strong> section in the panel. Click <strong>Generate Back Cover</strong> —
        the AI uses your front cover as a style reference to create a matching back cover.
        Navigate to it via the <em>Back</em> thumbnail at the bottom of the sidebar.
      </Step>

      <Tip>Use the <strong>Reference Image</strong> tab to upload your own image as a style reference for the AI.</Tip>
    </div>
  );
}

function SectionEdit() {
  return (
    <div className="help-section">
      <SectionTitle icon={<MessageSquare size={18} />}>Editing Content</SectionTitle>
      <p className="help-intro">
        Edit extracted text directly on the canvas, or use AI to make changes via natural language.
      </p>

      <Step n={1} title="Direct text editing">
        Switch to <strong>Edit</strong> tab (top toolbar). The page becomes a live <code>contentEditable</code> area.
        Click anywhere and type to edit text directly. Changes are saved to state on blur.
      </Step>

      <Step n={2} title="Inspect and style elements">
        Click any element on the canvas to select it — the <strong>Inspector</strong> panel opens on the right.
        Adjust:
        <ul className="help-list">
          <li>Font size, weight, colour, alignment</li>
          <li>Margins, padding, line height</li>
          <li>Page layout (single column, two columns)</li>
        </ul>
        Changes apply instantly to the selected element.
      </Step>

      <Step n={3} title="AI Chat editing">
        Click the <strong>Chat</strong> bubble icon (bottom-right) to open the floating AI assistant.
        Switch to <strong>Edit mode</strong> and describe your change:
        <ul className="help-list">
          <li><em>"Make the title larger and centred"</em></li>
          <li><em>"Change the font colour of all headings to dark red"</em></li>
          <li><em>"Remove the second paragraph"</em></li>
        </ul>
        The AI rewrites the page HTML and the canvas updates immediately.
      </Step>

      <Step n={4} title="AI Layout mode (surgical edits)">
        In the Chat panel, switch to <strong>⚡ Layout</strong> mode for surgical element-level edits.
        The AI calls individual tools to modify specific elements without rewriting the whole page.
      </Step>

      <Step n={5} title="Undo / Redo">
        Use <Kbd>⌘Z</Kbd> to undo and <Kbd>⌘⇧Z</Kbd> to redo any edit made on the current page.
        The undo / redo buttons are also in the top-right header toolbar.
      </Step>

      <Tip>Double-click any page on the canvas to immediately open the Inspector with that page's layout settings pre-loaded.</Tip>
    </div>
  );
}

function SectionExport() {
  return (
    <div className="help-section">
      <SectionTitle icon={<Download size={18} />}>Export & Save</SectionTitle>
      <p className="help-intro">
        Save your work to the library for later, or export a finished PDF at any time.
      </p>

      <Step n={1} title="Save to Library">
        Click <strong>Save</strong> in the bottom toolbar (<Kbd>⌘S</Kbd>).
        Your document — including all extracted pages, the cover, and the back cover — is saved to your personal library.
        A <em>"Saved ✓"</em> toast confirms success.
        <br /><br />
        <strong>Note:</strong> Each save creates a new snapshot. To avoid duplicates, save only when you're happy with the state.
      </Step>

      <Step n={2} title="Open a saved document">
        Click <Home size={11} style={{ display:'inline', verticalAlign:'middle' }} /> <strong>Home</strong> in the editor header to return to the landing page.
        Your saved projects appear as cards (Recent) and rows (All Projects), each showing a cover thumbnail.
        Click any card to reload the full document.
      </Step>

      <Step n={3} title="Download as PDF">
        Click <strong>PDF</strong> in the bottom toolbar. The entire document — front cover, content pages, back cover — is
        exported as a single A4 PDF. Cover pages have zero padding for a clean bleed edge.
        <br /><br />
        The button shows a spinner while generating. For large documents this may take 10–30 seconds.
      </Step>

      <Step n={4} title="Download from the library">
        On the Home screen, each project card and row has a <Download size={11} style={{ display:'inline', verticalAlign:'middle' }} /> download icon.
        Click it to export that saved document as a PDF without opening it in the editor.
      </Step>

      <Step n={5} title="Delete a project">
        On the Home screen, click the <Trash2 size={11} style={{ display:'inline', verticalAlign:'middle' }} /> icon on any card or row to permanently delete it.
        This cannot be undone.
      </Step>

      <Tip>The Library stores your documents in the cloud — they are accessible from any device when you sign in.</Tip>
    </div>
  );
}

function SectionTips() {
  return (
    <div className="help-section">
      <SectionTitle icon={<Keyboard size={18} />}>Tips & Keyboard Shortcuts</SectionTitle>

      <h3 className="help-h3">Keyboard Shortcuts</h3>
      <div className="help-shortcut-grid">
        {[
          ['⌘ S',       'Save document to library'],
          ['⌘ Z',       'Undo last edit'],
          ['⌘ ⇧ Z',    'Redo'],
          ['⌘ scroll',  'Zoom in / out on canvas'],
          ['⌘ ←',      'Previous page'],
          ['⌘ →',      'Next page'],
          ['⌘ P',      'Print current view'],
        ].map(([key, desc]) => (
          <div key={key} className="help-shortcut-row">
            <Kbd>{key}</Kbd>
            <span>{desc}</span>
          </div>
        ))}
      </div>

      <h3 className="help-h3" style={{ marginTop: '1.5rem' }}>Canvas Controls</h3>
      <div className="help-shortcut-grid">
        {[
          ['Zoom buttons', 'Use − / + in the header toolbar, or ⌘+scroll'],
          ['Fit to screen', 'Click the ⊞ icon to reset zoom and pan'],
          ['Hand tool', 'Click the ✋ icon (or hold Space) to pan by dragging'],
          ['Selection tool', 'Click the ↖ cursor icon to select and inspect elements'],
        ].map(([key, desc]) => (
          <div key={key} className="help-shortcut-row">
            <span className="help-shortcut-action">{key}</span>
            <span>{desc}</span>
          </div>
        ))}
      </div>

      <h3 className="help-h3" style={{ marginTop: '1.5rem' }}>Pro Tips</h3>
      <div className="help-tips-list">
        <Tip>Run <strong>Fast</strong> extraction first to get a quick preview, then use <strong>Re-extract all</strong> in Pro mode for the final result.</Tip>
        <Tip>For Amharic religious texts, include the book title and chapter structure in your Style description when generating a cover — the AI produces much better results with context.</Tip>
        <Tip>The <strong>Improve</strong> tab in the Cover editor accepts iterative instructions — you can refine the same cover multiple times without starting over.</Tip>
        <Tip>Use the <strong>Split</strong> view to compare the original scan with the extracted text side-by-side to spot any OCR errors.</Tip>
        <Tip>Save frequently — each Save creates an independent snapshot, so you can always re-open a previous version from the Library.</Tip>
        <Tip>The <SlidersHorizontal size={11} style={{ display:'inline', verticalAlign:'middle' }} /> <strong>Inspector</strong> works on any element: click to select, then adjust font, spacing, and colours in the right panel.</Tip>
        <Tip>The <Hand size={11} style={{ display:'inline', verticalAlign:'middle' }} /> <strong>hand tool</strong> is useful on tablets and touch screens for panning large pages without accidentally selecting text.</Tip>
      </div>
    </div>
  );
}
