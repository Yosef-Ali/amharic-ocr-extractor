// ── Shared Cover Types & Utilities ────────────────────────────────────────────

export interface CoverBlock {
  id:      string;
  text:    string;
  x:       number;
  y:       number;
  w:       number;
  color:   string;
  size:    number;
  weight:  400 | 600 | 700 | 900;
  italic:  boolean;
  align:   'left' | 'center' | 'right';
  shadow:  boolean;
}

// ── Parse HTML → state ────────────────────────────────────────────────────────
export function parseCover(html: string): { bgUrl: string; blocks: CoverBlock[] } {
  // Support both <img src="..."> (new) and background-image:url('...') (legacy)
  const imgMatch = html.match(/<img[^>]+src="(data:image\/[^"]+)"/);
  const bgMatch  = html.match(/url\('(data:image\/[^']+)'\)/);
  const bgUrl    = imgMatch?.[1] ?? bgMatch?.[1] ?? '';

  const doc       = new DOMParser().parseFromString(html, 'text/html');
  const editables = Array.from(doc.querySelectorAll('[contenteditable]')) as HTMLElement[];

  const blocks: CoverBlock[] = editables
    .filter(el => !el.style.writingMode)
    .map((el, i) => {
      const s = el.style;
      let x = 10;
      if (s.left?.endsWith('%')) {
        x = parseFloat(s.left);
        if (s.transform?.includes('translateX(-50%)')) x -= 40;
      }
      let y = 18 + i * 20;
      if (s.top?.endsWith('%'))         y = parseFloat(s.top);
      else if (s.bottom?.endsWith('%')) y = 100 - parseFloat(s.bottom) - 8;

      const size  = s.fontSize?.endsWith('rem') ? parseFloat(s.fontSize) : 1.5;
      const wNum  = Number(s.fontWeight) || 700;
      const weight = ([400, 600, 700, 900].includes(wNum) ? wNum : 700) as CoverBlock['weight'];

      return {
        id:     `blk-${i}-${Date.now()}`,
        text:   el.textContent?.trim() || '',
        x:      Math.max(0, Math.min(x, 75)),
        y:      Math.max(0, Math.min(y, 88)),
        w:      80,
        color:  s.color || '#ffffff',
        size,
        weight,
        italic: s.fontStyle === 'italic',
        align:  (['left', 'center', 'right'].includes(s.textAlign)
          ? s.textAlign
          : 'center') as CoverBlock['align'],
        shadow: !!(s.textShadow && s.textShadow !== 'none'),
      };
    });

  if (blocks.length === 0) {
    blocks.push(
      { id: 'title',  text: 'Book Title',  x: 10, y: 18, w: 80, color: '#ffffff', size: 2.2, weight: 900, italic: false, align: 'center', shadow: true },
      { id: 'author', text: 'Author Name', x: 15, y: 80, w: 70, color: '#d4a574', size: 1.0, weight: 600, italic: false, align: 'center', shadow: true },
    );
  }
  return { bgUrl, blocks };
}

// ── Serialise state → HTML ────────────────────────────────────────────────────
const TS   = '0 2px 8px rgba(0,0,0,0.7),0 0 2px rgba(0,0,0,0.5)';
const FONT = "'Noto Serif Ethiopic','Noto Sans Ethiopic',serif";

export function serialiseCover(bgUrl: string, blocks: CoverBlock[]): string {
  const items = blocks.map(b =>
    `<div contenteditable="true" style="position:absolute;left:${b.x.toFixed(1)}%;top:${b.y.toFixed(1)}%;width:${b.w.toFixed(1)}%;font-family:${FONT};font-size:${b.size}rem;font-weight:${b.weight};font-style:${b.italic ? 'italic' : 'normal'};color:${b.color};text-align:${b.align};text-shadow:${b.shadow ? TS : 'none'};line-height:1.35;box-sizing:border-box;padding:4px 8px;cursor:text;">${b.text}</div>`
  ).join('\n  ');

  return `<div style="position:relative;width:210mm;height:297mm;overflow:hidden;padding:0;margin:0 auto;box-sizing:border-box;">
  <img src="${bgUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:top center;display:block;" />
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.28) 0%,rgba(0,0,0,0.06) 35%,rgba(0,0,0,0.06) 65%,rgba(0,0,0,0.32) 100%);pointer-events:none;z-index:1;"></div>
  ${items}
</div>`;
}
