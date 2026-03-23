import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';

// Use the locally bundled worker (CDN doesn't carry v5.x .mjs files)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// Page dimension in mm (extracted from PDF's native coordinate system)
export interface PageDimension {
  widthMm:  number;
  heightMm: number;
}

// 1 PDF point = 1/72 inch = 25.4/72 mm ≈ 0.3528 mm
export async function pdfToImages(file: File): Promise<{ images: string[]; dimensions: PageDimension[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];
  const dimensions: PageDimension[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    // Always use A4 for the output page size regardless of original document dimensions
    dimensions.push({ widthMm: 210, heightMm: 297 });

    const maxDimension = 2560;
    const currentMax = Math.max(unscaledViewport.width, unscaledViewport.height);
    const scale = currentMax > maxDimension ? maxDimension / currentMax : 2.0;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    // Strip the data:image/jpeg;base64, prefix — store raw base64
    images.push(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
  }

  return { images, dimensions };
}

export async function imageFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDimension = 2560;
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      // Fill with white to avoid transparent PNGs turning black when forced to JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file'));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Document file type detection
// ---------------------------------------------------------------------------
export type DocFileType = 'pdf' | 'image' | 'docx' | 'text' | 'unknown';

export function detectFileType(file: File): DocFileType {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file.type.startsWith('image/')) return 'image';
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) return 'docx';
  if (
    file.type === 'text/plain' ||
    file.type === 'text/markdown' ||
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.text')
  ) return 'text';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// DOCX → HTML pages (using mammoth)
// Text content is already digital — no OCR needed.
// Returns an array of HTML strings, one per "page" (split by headings or length).
// ---------------------------------------------------------------------------
const A4_CHARS_PER_PAGE = 2800; // approximate characters that fit an A4 page

export async function docxToHtmlPages(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h3:fresh",
        "p[style-name='Heading 3'] => h4:fresh",
      ],
    },
  );

  const rawHtml = result.value;
  if (!rawHtml.trim()) return ['<p style="color:#94a3b8;text-align:center;">Document is empty.</p>'];

  // Parse into DOM to split into pages
  const doc = new DOMParser().parseFromString(`<div id="root">${rawHtml}</div>`, 'text/html');
  const root = doc.getElementById('root')!;
  const children = Array.from(root.children) as HTMLElement[];

  // Apply inline styles for print compatibility
  const pages: string[] = [];
  let currentPage: string[] = [];
  let currentLen = 0;

  const flushPage = () => {
    if (currentPage.length > 0) {
      pages.push(currentPage.join('\n'));
      currentPage = [];
      currentLen = 0;
    }
  };

  for (const el of children) {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent ?? '';

    // Apply inline styles based on tag
    if (tag === 'h1') {
      el.setAttribute('style', 'text-align:center;font-weight:900;color:#0f172a;font-size:1.4rem;margin:0 0 1rem;font-family:"Noto Serif Ethiopic","Noto Sans Ethiopic",serif;');
    } else if (tag === 'h2') {
      // Page break before h2 headings (chapter starts)
      if (currentPage.length > 0) flushPage();
      el.setAttribute('style', 'text-align:center;font-weight:700;color:#b91c1c;font-size:1.15rem;margin:0 0 0.75rem;letter-spacing:0.05em;font-family:"Noto Serif Ethiopic","Noto Sans Ethiopic",serif;');
    } else if (tag === 'h3') {
      el.setAttribute('style', 'font-weight:700;color:#1c1917;font-size:1.05rem;margin:0 0 0.5rem;font-family:"Noto Serif Ethiopic","Noto Sans Ethiopic",serif;');
    } else if (tag === 'h4') {
      el.setAttribute('style', 'font-weight:600;color:#44403c;font-size:0.95rem;margin:0 0 0.4rem;font-family:"Noto Serif Ethiopic","Noto Sans Ethiopic",serif;');
    } else if (tag === 'p') {
      el.setAttribute('style', 'line-height:1.75;color:#1c1917;margin:0 0 0.85rem;text-align:justify;font-size:1rem;font-family:"Noto Serif Ethiopic","Noto Sans Ethiopic",serif;');
    } else if (tag === 'ul' || tag === 'ol') {
      el.setAttribute('style', 'line-height:1.75;color:#1c1917;margin:0 0 0.85rem;padding-left:1.5rem;font-size:1rem;font-family:"Noto Serif Ethiopic","Noto Sans Ethiopic",serif;');
    } else if (tag === 'table') {
      el.setAttribute('style', 'width:100%;border-collapse:collapse;margin:0 0 1rem;font-size:0.9rem;font-family:"Noto Serif Ethiopic","Noto Sans Ethiopic",serif;');
      for (const cell of Array.from(el.querySelectorAll('td, th'))) {
        (cell as HTMLElement).setAttribute('style', 'border:1px solid #e2e8f0;padding:0.4rem 0.6rem;');
      }
    }

    const elHtml = el.outerHTML;
    currentLen += text.length;
    currentPage.push(elHtml);

    // Split into pages when content exceeds A4 size
    if (currentLen >= A4_CHARS_PER_PAGE) {
      flushPage();
    }
  }

  flushPage();

  return pages.length > 0 ? pages : ['<p style="color:#94a3b8;text-align:center;">No content extracted from document.</p>'];
}

// ---------------------------------------------------------------------------
// Plain text → HTML pages
// Splits text into A4-sized chunks with proper formatting.
// ---------------------------------------------------------------------------
export function textToHtmlPages(text: string): string[] {
  if (!text.trim()) return ['<p style="color:#94a3b8;text-align:center;">File is empty.</p>'];

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const pages: string[] = [];
  let currentPage: string[] = [];
  let currentLen = 0;

  const flushPage = () => {
    if (currentPage.length > 0) {
      pages.push(currentPage.join('\n'));
      currentPage = [];
      currentLen = 0;
    }
  };

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Detect if this looks like a heading (short, possibly all caps or numbered)
    const isHeading = trimmed.length < 80 && (
      /^#{1,4}\s/.test(trimmed) ||           // Markdown headings
      /^[A-Z\u1200-\u137F\s]{5,}$/.test(trimmed) || // ALL CAPS or Ethiopic
      /^(ምዕራፍ|ክፍል|በዓል|ጾም|ጸሎት)\s/i.test(trimmed)  // Amharic section markers
    );

    // Strip markdown heading markers
    const cleanText = trimmed.replace(/^#{1,4}\s+/, '');

    let html: string;
    if (isHeading) {
      html = `<h2 style="text-align:center;font-weight:700;color:#b91c1c;font-size:1.15rem;margin:0 0 0.75rem;letter-spacing:0.05em;font-family:'Noto Serif Ethiopic','Noto Sans Ethiopic',serif;">${escapeHtml(cleanText)}</h2>`;
    } else {
      // Handle single line breaks within paragraphs
      const lines = trimmed.split('\n').map(l => escapeHtml(l.trim())).join('<br>');
      html = `<p style="line-height:1.75;color:#1c1917;margin:0 0 0.85rem;text-align:justify;font-size:1rem;font-family:'Noto Serif Ethiopic','Noto Sans Ethiopic',serif;">${lines}</p>`;
    }

    currentLen += trimmed.length;
    currentPage.push(html);

    if (currentLen >= A4_CHARS_PER_PAGE) {
      flushPage();
    }
  }

  flushPage();

  return pages.length > 0 ? pages : ['<p style="color:#94a3b8;text-align:center;">No content found.</p>'];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
