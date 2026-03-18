import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, GripVertical } from 'lucide-react';

interface Props {
  pageImages:       string[];
  pageResults:      Record<number, string>;
  regeneratingPages?: Set<number>;
  activePage:       number;
  onSelect:         (page: number) => void;
  onDoubleClick?:   (page: number) => void;
  onReorder?:       (fromPage: number, toPage: number) => void;
  onInsert?:        (afterPage: number) => void;   // afterPage = 0 means before page 1
  onDelete?:        (pageNumber: number) => void;
}

export default function PageThumbnailSidebar({
  pageImages, pageResults, regeneratingPages,
  activePage, onSelect, onDoubleClick,
  onReorder, onInsert, onDelete,
}: Props) {
  const activeRef  = useRef<HTMLButtonElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);   // page number
  const [dropAt,   setDropAt]   = useState<number | null>(null);   // insert-before page number (1-indexed), or totalPages+1 = append at end
  const [hoverId,  setHoverId]  = useState<number | null>(null);

  const hasCover     = !!pageResults[0];
  const hasBackCover = !!pageResults[-1];
  const totalPages   = pageImages.length;

  const coverBgUrl = (() => {
    if (!hasCover) return null;
    const m = pageResults[0].match(/<img[^>]+src="(data:image\/[^"]+)"/) ?? pageResults[0].match(/url\('(data:image\/[^']+)'\)/);
    return m?.[1] ?? null;
  })();

  const backCoverBgUrl = (() => {
    if (!hasBackCover) return null;
    const m = pageResults[-1].match(/<img[^>]+src="(data:image\/[^"]+)"/) ?? pageResults[-1].match(/url\('(data:image\/[^']+)'\)/);
    return m?.[1] ?? null;
  })();

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activePage]);

  // ── Drag handlers ────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, pageNum: number) => {
    setDragFrom(pageNum);
    e.dataTransfer.effectAllowed = 'move';
    // Transparent drag image so the drop indicator is the focus
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:absolute;left:-9999px;width:60px;height:80px;background:#6366f1;border-radius:4px;opacity:0.9;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 30, 40);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragOver = (e: React.DragEvent, insertBefore: number) => {
    if (dragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropAt(insertBefore);
  };

  const handleDrop = (e: React.DragEvent, insertBefore: number) => {
    e.preventDefault();
    if (dragFrom === null || !onReorder) return;
    setDragFrom(null);
    setDropAt(null);
    // insertBefore is the page number to insert before (1-indexed)
    // toPage = insertBefore if insertBefore <= fromPage, else insertBefore - 1
    let toPage = insertBefore;
    if (insertBefore > dragFrom) toPage = insertBefore - 1;
    if (toPage < 1) toPage = 1;
    if (toPage > totalPages) toPage = totalPages;
    if (toPage !== dragFrom) onReorder(dragFrom, toPage);
  };

  const handleDragEnd = () => { setDragFrom(null); setDropAt(null); };

  // ── Drop zone (gap between pages) ────────────────────────────────────────
  const DropZone = ({ insertBefore }: { insertBefore: number }) => (
    <div
      className={`pts-drop-zone${dropAt === insertBefore && dragFrom !== null ? ' pts-drop-zone--active' : ''}`}
      onDragOver={e => handleDragOver(e, insertBefore)}
      onDrop={e => handleDrop(e, insertBefore)}
    >
      {/* Show insert button when NOT dragging */}
      {dragFrom === null && onInsert && (
        <button
          className="pts-insert-btn"
          onClick={() => onInsert(insertBefore - 1)}
          title={`Insert page ${insertBefore > 1 ? 'after page ' + (insertBefore - 1) : 'at beginning'}`}
        >
          <Plus size={9} />
        </button>
      )}
    </div>
  );

  return (
    <aside className="thumb-sidebar">
      <div className="thumb-sidebar-inner">

        {/* ── Cover thumbnail (page 0) — not draggable ── */}
        {hasCover && (
          <button
            ref={activePage === 0 ? activeRef : null}
            className={['page-thumb', activePage === 0 ? 'page-thumb--active' : ''].join(' ')}
            onClick={() => onSelect(0)}
            onDoubleClick={() => onDoubleClick?.(0)}
            title="Cover page — double-click to open editor"
          >
            <div className="page-thumb-img-wrap">
              {coverBgUrl
                ? <img src={coverBgUrl} alt="" className="page-thumb-img" />
                : <div className="page-thumb-blank" style={{ background: 'linear-gradient(135deg,#1a1a2e,#16213e)' }} />
              }
              <div className="page-thumb-check">✓</div>
            </div>
            <div className="page-thumb-label" style={{ fontWeight: 700 }}>Cover</div>
          </button>
        )}

        {/* Drop zone before page 1 */}
        {totalPages > 0 && <DropZone insertBefore={1} />}

        {/* ── Regular pages ── */}
        {pageImages.map((img, idx) => {
          const pageNum   = idx + 1;
          const isActive  = pageNum === activePage;
          const hasResult = !!pageResults[pageNum];
          const isRegen   = regeneratingPages?.has(pageNum) ?? false;
          const isDragging = pageNum === dragFrom;
          const isHovered  = pageNum === hoverId;

          return (
            <div key={pageNum} style={{ position: 'relative' }}>
              <button
                ref={isActive ? activeRef : null}
                className={[
                  'page-thumb pts-thumb',
                  isActive    ? 'page-thumb--active'      : '',
                  !hasResult  ? 'page-thumb--unextracted'  : '',
                  isDragging  ? 'pts-thumb--dragging'      : '',
                ].join(' ')}
                draggable
                onDragStart={e => handleDragStart(e, pageNum)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelect(pageNum)}
                onDoubleClick={() => onDoubleClick?.(pageNum)}
                onMouseEnter={() => setHoverId(pageNum)}
                onMouseLeave={() => setHoverId(null)}
                title={`Page ${pageNum}${hasResult ? ' — double-click to inspect' : ' — not extracted'}`}
              >
                {/* Drag grip */}
                <div className="pts-grip" title="Drag to reorder">
                  <GripVertical size={10} />
                </div>

                <div className="page-thumb-img-wrap">
                  {img
                    ? <img src={`data:image/jpeg;base64,${img}`} alt="" className="page-thumb-img" loading="lazy" />
                    : <div className="page-thumb-blank" />
                  }
                  {isRegen && (
                    <div className="page-thumb-overlay">
                      <Loader2 size={14} className="animate-spin" style={{ color: '#22d3ee' }} />
                    </div>
                  )}
                  {hasResult && !isRegen && <div className="page-thumb-check">✓</div>}

                  {/* Delete button — shown on hover */}
                  {(isHovered || isActive) && onDelete && !isRegen && (
                    <button
                      className="pts-delete-btn"
                      onClick={e => { e.stopPropagation(); onDelete(pageNum); }}
                      title={`Delete page ${pageNum}`}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>

                <div className="page-thumb-label">{pageNum}</div>
              </button>

              {/* Drop zone after each page */}
              <DropZone insertBefore={pageNum + 1} />
            </div>
          );
        })}

        {/* Quick-add at the bottom when no pages are dragging */}
        {dragFrom === null && onInsert && totalPages > 0 && (
          <button
            className="pts-add-page-btn"
            onClick={() => onInsert(totalPages)}
            title="Add page at end"
          >
            <Plus size={12} /> Add page
          </button>
        )}

        {/* ── Back cover thumbnail (page -1) ── */}
        {hasBackCover ? (
          <button
            ref={activePage === -1 ? activeRef : null}
            className={['page-thumb', activePage === -1 ? 'page-thumb--active' : ''].join(' ')}
            onClick={() => onSelect(-1)}
            onDoubleClick={() => onDoubleClick?.(-1)}
            title="Back cover — double-click to open editor"
          >
            <div className="page-thumb-img-wrap">
              {backCoverBgUrl
                ? <img src={backCoverBgUrl} alt="" className="page-thumb-img" />
                : <div className="page-thumb-blank" style={{ background: 'linear-gradient(135deg,#1a1a2e,#16213e)' }} />
              }
              <div className="page-thumb-check">✓</div>
            </div>
            <div className="page-thumb-label" style={{ fontWeight: 700 }}>Back</div>
          </button>
        ) : hasCover && (
          <button
            className="pts-add-page-btn"
            onClick={() => { onSelect(-1); }}
            title="Generate a back cover"
            style={{ marginTop: '0.25rem', borderColor: 'rgba(129,140,248,0.4)', color: '#818cf8' }}
          >
            <Plus size={12} /> Back cover
          </button>
        )}

      </div>
    </aside>
  );
}
