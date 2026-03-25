import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

// ── Amharic homophone / look-alike groups ──────────────────────────────────
// Each group contains characters that are phonetically identical or visually
// similar and are commonly confused by OCR engines.
export const HOMOPHONE_GROUPS = [
  {
    id: 'ha',
    label: 'ሀ – Ha variants',
    description: "All pronounced 'ha'. OCR most commonly swaps these. Modern Amharic print uses ሀ; religious texts may preserve ሐ.",
    chars: ['ሀ', 'ሁ', 'ሂ', 'ሃ', 'ሄ', 'ህ', 'ሆ',   // hä series
            'ሐ', 'ሑ', 'ሒ', 'ሓ', 'ሔ', 'ሕ', 'ሖ',   // hä (pharyngeal) series
            'ኀ', 'ኁ', 'ኂ', 'ኃ', 'ኄ', 'ኅ', 'ኆ'],  // ḫä series
    roots: ['ሀ', 'ሐ', 'ኀ'],  // base (1st order) characters to show as swap targets
  },
  {
    id: 'se',
    label: 'ሰ – Se variants',
    description: "ሠ is archaic (Ge'ez). Modern Amharic texts use ሰ. OCR trained on mixed data often substitutes one for the other.",
    chars: ['ሠ', 'ሡ', 'ሢ', 'ሣ', 'ሤ', 'ሥ', 'ሦ',
            'ሰ', 'ሱ', 'ሲ', 'ሳ', 'ሴ', 'ስ', 'ሶ'],
    roots: ['ሠ', 'ሰ'],
  },
  {
    id: 'a',
    label: 'አ – A (glottal) variants',
    description: "አ (aleph) and ዐ (ayin) look nearly identical in many fonts and are the #2 most confused pair in Amharic OCR.",
    chars: ['አ', 'ኡ', 'ኢ', 'ኣ', 'ኤ', 'እ', 'ኦ',
            'ዐ', 'ዑ', 'ዒ', 'ዓ', 'ዔ', 'ዕ', 'ዖ'],
    roots: ['አ', 'ዐ'],
  },
  {
    id: 'tsa',
    label: 'ጸ – Tsa variants',
    description: "Both represent the 'ts' sound. ፀ appears in some religious texts; modern Amharic standardizes on ጸ.",
    chars: ['ጸ', 'ጹ', 'ጺ', 'ጻ', 'ጼ', 'ጽ', 'ጾ',
            'ፀ', 'ፁ', 'ፂ', 'ፃ', 'ፄ', 'ፅ', 'ፆ'],
    roots: ['ጸ', 'ፀ'],
  },
  {
    id: 'za',
    label: 'ዘ / ዙ – Ze/Zu common misreads',
    description: 'Vowel-order forms within the same root are frequently swapped by OCR (e.g. ዘ misread as ዙ or ዚ).',
    chars: ['ዘ', 'ዙ', 'ዚ', 'ዛ', 'ዜ', 'ዝ', 'ዞ'],
    roots: [],  // no swaps — just show counts so user can spot anomalies
  },
];

// ── Types ──────────────────────────────────────────────────────────────────
interface Props {
  pageResults:  Record<number, string>;
  activePage:   number;
  onEdit:       (pageNumber: number, html: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function stripTags(html: string) {
  return html.replace(/<[^>]*>/g, '');
}

function countChar(text: string, char: string): number {
  let n = 0;
  for (const c of text) if (c === char) n++;
  return n;
}

function replaceCharsInHtml(html: string, fromChars: string[], toChar: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  for (const textNode of nodes) {
    if (!textNode.textContent) continue;
    let s = textNode.textContent;
    for (const fc of fromChars) {
      s = s.replaceAll(fc, toChar);
    }
    textNode.textContent = s;
  }
  return doc.body.innerHTML;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function HomophonePanel({ pageResults, activePage, onEdit }: Props) {
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({ ha: true });
  const [lastAction, setLastAction] = useState('');

  const pageNums = useMemo(
    () => Object.keys(pageResults).map(Number).filter(n => n > 0).sort((a, b) => a - b),
    [pageResults],
  );

  // Count occurrences of every character across all pages
  const allText = useMemo(
    () => pageNums.map(n => stripTags(pageResults[n] ?? '')).join(''),
    [pageNums, pageResults],
  );

  const currentText = useMemo(
    () => stripTags(pageResults[activePage] ?? ''),
    [pageResults, activePage],
  );

  const flash = (msg: string) => {
    setLastAction(msg);
    setTimeout(() => setLastAction(''), 2800);
  };

  // Replace one base-root set with another, e.g. all ሐ-series → ሀ-series
  const applySwap = (group: typeof HOMOPHONE_GROUPS[0], toRoot: string, scope: 'page' | 'all') => {
    // Build the mapping: every char in the group that shares the same vowel order
    // with toRoot gets mapped. E.g. if toRoot='ሀ' (order 1 of series ሀ),
    // we map ሐ→ሀ, ሑ→ሁ, ሒ→ሂ, ሓ→ሃ, etc.
    const roots = group.roots;
    const fromRoots = roots.filter(r => r !== toRoot);
    if (fromRoots.length === 0) return;

    // Map each "from" series char → corresponding "to" series char (same vowel order)
    const seriesSize = 7;
    const toRootIdx = group.chars.indexOf(toRoot);
    const toSeriesStart = toRootIdx - (toRootIdx % seriesSize); // snap to series start

    let totalReplaced = 0;
    const targetPages = scope === 'page' ? [activePage] : pageNums;

    for (const pn of targetPages) {
      const html = pageResults[pn];
      if (!html) continue;

      // Count replacements
      const text = stripTags(html);
      let replaced = 0;

      let newHtml = html;
      for (const fromRoot of fromRoots) {
        const fromRootIdx = group.chars.indexOf(fromRoot);
        const fromSeriesStart = fromRootIdx - (fromRootIdx % seriesSize);
        const fromChars: string[] = [];
        const toChars: string[] = [];

        for (let i = 0; i < seriesSize; i++) {
          const fc = group.chars[fromSeriesStart + i];
          const tc = group.chars[toSeriesStart  + i];
          if (fc && tc && fc !== tc) {
            fromChars.push(fc);
            toChars.push(tc);
            replaced += countChar(text, fc);
          }
        }

        if (fromChars.length === 0) continue;
        // Replace character by character (same vowel order)
        const parser = new DOMParser();
        const doc = parser.parseFromString(newHtml, 'text/html');
        const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) nodes.push(node as Text);
        for (const textNode of nodes) {
          if (!textNode.textContent) continue;
          let s = textNode.textContent;
          for (let i = 0; i < fromChars.length; i++) {
            s = s.replaceAll(fromChars[i], toChars[i]);
          }
          textNode.textContent = s;
        }
        newHtml = doc.body.innerHTML;
      }

      if (newHtml !== html) {
        onEdit(pn, newHtml);
        totalReplaced += replaced;
      }
    }

    flash(totalReplaced > 0
      ? `Replaced ${totalReplaced} character${totalReplaced !== 1 ? 's' : ''} ${scope === 'page' ? 'on page ' + activePage : 'across all pages'}`
      : 'No occurrences found to replace');
  };

  // Remove all chars from a set (e.g. wipe out ኀ-series entirely)
  const applyDelete = (chars: string[], scope: 'page' | 'all') => {
    const targetPages = scope === 'page' ? [activePage] : pageNums;
    let total = 0;
    for (const pn of targetPages) {
      const html = pageResults[pn];
      if (!html) continue;
      const newHtml = replaceCharsInHtml(html, chars, '');
      const n = chars.reduce((s, c) => s + countChar(stripTags(html), c), 0);
      if (n > 0) { onEdit(pn, newHtml); total += n; }
    }
    flash(total > 0 ? `Removed ${total} character${total !== 1 ? 's' : ''}` : 'None found');
  };

  return (
    <div className="hp-panel">
      <div className="hp-intro">
        Amharic OCR commonly confuses these character groups. Check counts, then
        standardize with one click.
      </div>

      {lastAction && (
        <div className="hp-toast">
          <CheckCircle2 size={13} /> {lastAction}
        </div>
      )}

      {HOMOPHONE_GROUPS.map(group => {
        const open = !!expanded[group.id];
        // Count each root across all text
        const rootCounts = group.roots.map(r => {
          const seriesStart = group.chars.indexOf(r);
          const slice = group.chars.slice(seriesStart, seriesStart + 7);
          const total = slice.reduce((s, c) => s + countChar(allText, c), 0);
          const current = slice.reduce((s, c) => s + countChar(currentText, c), 0);
          return { root: r, total, current };
        });
        const totalInDoc = rootCounts.reduce((s, r) => s + r.total, 0);

        return (
          <div key={group.id} className="hp-group">
            {/* Header */}
            <button
              className="hp-group-hd"
              onClick={() => setExpanded(e => ({ ...e, [group.id]: !e[group.id] }))}
            >
              <span className="hp-group-toggle">
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
              <span className="hp-group-label">{group.label}</span>
              {totalInDoc > 0 && (
                <span className="hp-group-ct">{totalInDoc}</span>
              )}
              {totalInDoc === 0 && (
                <span className="hp-group-ok">✓ none</span>
              )}
            </button>

            {open && (
              <div className="hp-group-body">
                <p className="hp-desc">{group.description}</p>

                {/* Counts per root */}
                <div className="hp-counts">
                  {rootCounts.map(rc => (
                    <div key={rc.root} className="hp-count-row">
                      <span className="hp-char">{rc.root}…</span>
                      <span className="hp-count-doc" title="Across all pages">
                        {rc.total} total
                      </span>
                      <span className="hp-count-page" title={`Page ${activePage}`}>
                        {rc.current} this page
                      </span>
                    </div>
                  ))}
                </div>

                {/* Swap actions — only when multiple roots */}
                {group.roots.length >= 2 && totalInDoc > 0 && (
                  <div className="hp-actions">
                    <div className="hp-actions-label">Standardize to:</div>
                    {group.roots.map(toRoot => {
                      const fromCount = rootCounts
                        .filter(r => r.root !== toRoot)
                        .reduce((s, r) => s + r.total, 0);
                      return (
                        <div key={toRoot} className="hp-swap-row">
                          <span className="hp-swap-target">→ <strong>{toRoot}</strong></span>
                          <button
                            className="hp-btn"
                            disabled={fromCount === 0}
                            onClick={() => applySwap(group, toRoot, 'page')}
                            title={`Replace on page ${activePage} only`}
                          >
                            Page
                          </button>
                          <button
                            className="hp-btn hp-btn--all"
                            disabled={fromCount === 0}
                            onClick={() => applySwap(group, toRoot, 'all')}
                            title="Replace across all pages"
                          >
                            All pages
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* For single-root groups (ዘ series) — just info */}
                {group.roots.length === 0 && (
                  <p className="hp-info-note">
                    Review manually — these are different vowel orders of the same root, not true homophones.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Ethiopic-only quick clean */}
      <div className="hp-group">
        <button
          className="hp-group-hd"
          onClick={() => setExpanded(e => ({ ...e, _extra: !e['_extra'] }))}
        >
          <span className="hp-group-toggle">
            {expanded['_extra'] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="hp-group-label">Extra cleanup</span>
        </button>
        {expanded['_extra'] && (
          <div className="hp-group-body">
            <p className="hp-desc">Remove stray non-Ethiopic noise characters that OCR sometimes inserts.</p>
            <div className="hp-actions">
              <div className="hp-actions-label">Remove from document:</div>
              {[
                { label: 'Lone hyphens between Amharic words', chars: ['\u002D'], note: '- hyphen' },
                { label: 'Soft hyphens', chars: ['\u00AD'], note: 'shy' },
                { label: 'Zero-width spaces', chars: ['\u200B', '\uFEFF'], note: 'ZWS/BOM' },
              ].map(item => (
                <div key={item.label} className="hp-swap-row">
                  <span className="hp-swap-target" style={{ fontSize: '0.7rem' }}>{item.label}</span>
                  <button className="hp-btn hp-btn--danger" onClick={() => applyDelete(item.chars, 'all')}>
                    <RotateCcw size={11} /> Clean all
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
