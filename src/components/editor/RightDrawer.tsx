import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Full-screen sheet on mobile */
  mobile?: boolean;
  /** Hide the drawer's built-in header (use when child has its own header) */
  hideHeader?: boolean;
  /** Optional short status line shown under the drawer title (e.g. "Page 2 · heading selected") */
  statusLine?: string | null;
}

export default function RightDrawer({ open, title, onClose, children, mobile = false, hideHeader = false, statusLine = null }: Props) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Scrim */}
      <div
        className={`rd-scrim${open ? ' rd-scrim--open' : ''}`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <aside
        className={`rd-panel${open ? ' rd-panel--open' : ''}${mobile ? ' rd-panel--mobile' : ''}`}
        aria-hidden={!open}
      >
        {!hideHeader && (
          <header className="rd-header">
            <div className="rd-title-wrap">
              <h3 className="rd-title">{title}</h3>
              {statusLine && <span className="rd-status">{statusLine}</span>}
            </div>
            <button className="rd-close" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </header>
        )}
        <div className={`rd-body${hideHeader ? ' rd-body--no-header' : ''}`}>
          {children}
        </div>
      </aside>
    </>
  );
}
