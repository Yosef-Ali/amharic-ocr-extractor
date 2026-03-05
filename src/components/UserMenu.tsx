import { useState, useRef, useEffect } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';

interface Props {
  user: { id: string; email?: string; name?: string };
  onSignOut: () => void;
}

export default function UserMenu({ user, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const letter = (user.email?.[0] ?? user.name?.[0] ?? '?').toUpperCase();
  const displayEmail = user.email ?? user.name ?? 'Account';

  return (
    <div className="user-menu-wrap" ref={wrapRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        title={displayEmail}
      >
        <span className="user-avatar">{letter}</span>
        <ChevronDown size={10} className={`user-chevron${open ? ' user-chevron--open' : ''}`} />
      </button>

      {open && (
        <div className="user-dropdown">
          <div className="user-dropdown-email">{displayEmail}</div>
          <div className="user-divider" />
          <button
            className="user-signout-btn"
            onClick={() => { setOpen(false); onSignOut(); }}
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
