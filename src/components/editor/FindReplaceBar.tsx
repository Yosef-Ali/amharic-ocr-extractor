import { useState, useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown, Replace, ReplaceAll } from 'lucide-react';

interface Props {
  pageResults:  Record<number, string>;
  activePage:   number;
  onEdit:       (pageNumber: number, html: string) => void;
  onChangePage: (page: number) => void;
  onClose:      () => void;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTags(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function countMatches(text: string, find: string, caseSensitive: boolean): number {
  if (!find) return 0;
  try {
    const re = new RegExp(escapeRegex(find), caseSensitive ? 'g' : 'gi');
    return (text.match(re) ?? []).length;
  } catch { return 0; }
}

function replaceInHtml(html: string, find: string, replace: string, caseSensitive: boolean): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  const re = new RegExp(escapeRegex(find), caseSensitive ? 'g' : 'gi');
  for (const textNode of nodes) {
    if (textNode.textContent) {
      textNode.textContent = textNode.textContent.replace(re, replace);
    }
  }
  return doc.body.innerHTML;
}

export default function FindReplaceBar({ pageResults, activePage, onEdit, onChangePage, onClose }: Props) {
  const [findText,      setFindText]      = useState('');
  const [replaceText,   setReplaceText]   = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace,   setShowReplace]   = useState(false);
  const [status,        setStatus]        = useState('');
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => { findRef.current?.focus(); }, []);

  const pageNums = Object.keys(pageResults).map(Number).filter(n => n > 0).sort((a, b) => a - b);

  const matchesPerPage = pageNums
    .map(n => ({ page: n, count: countMatches(stripTags(pageResults[n] ?? ''), findText, caseSensitive) }))
    .filter(m => m.count > 0);

  const totalMatches       = matchesPerPage.reduce((s, m) => s + m.count, 0);
  const currentPageMatches = countMatches(stripTags(pageResults[activePage] ?? ''), findText, caseSensitive);
  const matchPageIndex     = matchesPerPage.findIndex(m => m.page === activePage);

  const goToPrev = () => {
    if (!matchesPerPage.length) return;
    const prev = matchPageIndex <= 0
      ? matchesPerPage[matchesPerPage.length - 1]
      : matchesPerPage[matchPageIndex - 1];
    onChangePage(prev.page);
  };

  const goToNext = () => {
    if (!matchesPerPage.length) return;
    const next = matchPageIndex < 0 || matchPageIndex >= matchesPerPage.length - 1
      ? matchesPerPage[0]
      : matchesPerPage[matchPageIndex + 1];
    onChangePage(next.page);
  };

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 2500);
  };

  const handleReplacePage = () => {
    if (!findText || !pageResults[activePage]) return;
    const newHtml = replaceInHtml(pageResults[activePage], findText, replaceText, caseSensitive);
    onEdit(activePage, newHtml);
    showStatus(`Replaced on page ${activePage}`);
  };

  const handleReplaceAll = () => {
    if (!findText || totalMatches === 0) return;
    let total = 0;
    for (const pn of pageNums) {
      const html = pageResults[pn];
      if (!html) continue;
      const n = countMatches(stripTags(html), findText, caseSensitive);
      if (n > 0) { onEdit(pn, replaceInHtml(html, findText, replaceText, caseSensitive)); total += n; }
    }
    showStatus(`Replaced ${total} occurrence${total !== 1 ? 's' : ''} across all pages`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter') { e.shiftKey ? goToPrev() : goToNext(); }
  };

  return (
    <div className="fr-bar" onKeyDown={onKeyDown}>
      {/* Toggle replace */}
      <button className="fr-toggle" onClick={() => setShowReplace(r => !r)} title="Toggle replace">
        {showReplace ? '▾' : '▸'}
      </button>

      <div className="fr-fields">
        {/* Find row */}
        <div className="fr-row">
          <input
            ref={findRef}
            className="fr-input"
            placeholder="Find…"
            value={findText}
            onChange={e => setFindText(e.target.value)}
            spellCheck={false}
          />
          <button
            className={`fr-case${caseSensitive ? ' fr-case--on' : ''}`}
            onClick={() => setCaseSensitive(c => !c)}
            title="Case sensitive"
          >Aa</button>

          <span className="fr-count">
            {findText
              ? totalMatches === 0
                ? 'No matches'
                : `${currentPageMatches} / ${totalMatches}`
              : ''}
          </span>

          <button className="fr-nav" onClick={goToPrev} disabled={matchesPerPage.length === 0} title="Previous (Shift+Enter)">
            <ChevronUp size={13} />
          </button>
          <button className="fr-nav" onClick={goToNext} disabled={matchesPerPage.length === 0} title="Next (Enter)">
            <ChevronDown size={13} />
          </button>
        </div>

        {/* Replace row */}
        {showReplace && (
          <div className="fr-row">
            <input
              className="fr-input"
              placeholder="Replace with…"
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              spellCheck={false}
            />
            <button
              className="fr-btn"
              onClick={handleReplacePage}
              disabled={!findText || !pageResults[activePage]}
              title="Replace on current page"
            >
              <Replace size={12} /> Page
            </button>
            <button
              className="fr-btn fr-btn--all"
              onClick={handleReplaceAll}
              disabled={!findText || totalMatches === 0}
              title="Replace all pages"
            >
              <ReplaceAll size={12} /> All
            </button>
          </div>
        )}

        {/* Pages with matches */}
        {findText && matchesPerPage.length > 0 && (
          <div className="fr-pages">
            {matchesPerPage.map(m => (
              <button
                key={m.page}
                className={`fr-chip${m.page === activePage ? ' fr-chip--active' : ''}`}
                onClick={() => onChangePage(m.page)}
                title={`Page ${m.page}: ${m.count} match${m.count !== 1 ? 'es' : ''}`}
              >
                p.{m.page} <span className="fr-chip-ct">{m.count}</span>
              </button>
            ))}
          </div>
        )}

        {status && <div className="fr-status">{status}</div>}
      </div>

      <button className="fr-close" onClick={onClose} title="Close (Esc)">
        <X size={14} />
      </button>
    </div>
  );
}
