import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  pageImages:      string[];
  pageResults:     Record<number, string>;
  regeneratingPages?: Set<number>;
  activePage:      number;
  onSelect:        (page: number) => void;
}

export default function PageThumbnailSidebar({
  pageImages,
  pageResults,
  regeneratingPages,
  activePage,
  onSelect,
}: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Scroll active thumbnail into view when page changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activePage]);

  return (
    <aside className="thumb-sidebar">
      <div className="thumb-sidebar-inner">
        {pageImages.map((img, idx) => {
          const pageNum    = idx + 1;
          const isActive   = pageNum === activePage;
          const hasResult  = !!pageResults[pageNum];
          const isRegen    = regeneratingPages?.has(pageNum) ?? false;

          return (
            <button
              key={pageNum}
              ref={isActive ? activeRef : null}
              className={[
                'page-thumb',
                isActive   ? 'page-thumb--active'  : '',
                !hasResult ? 'page-thumb--unextracted' : '',
              ].join(' ')}
              onClick={() => onSelect(pageNum)}
              title={`Page ${pageNum}${hasResult ? ' (extracted)' : ' — not extracted'}`}
            >
              {/* Thumbnail image */}
              <div className="page-thumb-img-wrap">
                {img
                  ? <img
                      src={`data:image/jpeg;base64,${img}`}
                      alt=""
                      className="page-thumb-img"
                      loading="lazy"
                    />
                  : <div className="page-thumb-blank" />
                }

                {/* Spinner overlay while re-extracting */}
                {isRegen && (
                  <div className="page-thumb-overlay">
                    <Loader2 size={14} className="animate-spin" style={{ color: '#22d3ee' }} />
                  </div>
                )}

                {/* Extracted checkmark */}
                {hasResult && !isRegen && (
                  <div className="page-thumb-check">✓</div>
                )}
              </div>

              {/* Page number label */}
              <div className="page-thumb-label">{pageNum}</div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
