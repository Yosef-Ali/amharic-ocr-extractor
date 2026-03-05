import { useState, useRef, useEffect } from 'react';
import { Settings, Key, ExternalLink } from 'lucide-react';
import { reinitializeClient } from '../../services/geminiService';

export default function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const connectProKey = async () => {
    const w = window as unknown as { aistudio?: { openSelectKey?: () => Promise<void> } };
    if (typeof w.aistudio?.openSelectKey === 'function') {
      await w.aistudio.openSelectKey();
      reinitializeClient();
      setOpen(false);
    } else {
      alert(
        'Pro Key integration is only available inside Google AI Studio.\n\n' +
        'Add your key to the VITE_GEMINI_API_KEY variable in your .env file.',
      );
    }
  };

  return (
    <div className="settings-wrap" ref={wrapRef}>
      {/* Gear trigger */}
      <button
        className={`editor-icon-btn${open ? ' editor-icon-btn--active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Settings"
      >
        <Settings size={15} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="settings-dropdown">
          <div className="settings-dropdown-header">Settings</div>

          {/* API Key section */}
          <div className="settings-section">
            <div className="settings-section-label">
              <Key size={11} />
              API Key
            </div>
            <button className="settings-prokey-btn" onClick={connectProKey}>
              <Key size={12} />
              Connect Pro Key
            </button>
            <p className="settings-hint">
              Remove rate limits by connecting your own Google Cloud billing project.
            </p>
          </div>

          {/* Divider */}
          <div className="settings-divider" />

          {/* Env var hint */}
          <div className="settings-section">
            <div className="settings-section-label">
              <ExternalLink size={11} />
              Environment Variable
            </div>
            <code className="settings-env-hint">VITE_GEMINI_API_KEY</code>
            <p className="settings-hint">
              Set this in your <code>.env</code> file to use your own key.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
