import { useState, useRef, useEffect } from 'react';
import { Settings, Key, ExternalLink, Database } from 'lucide-react';
import { setApiKey, getUserApiKey } from '../../services/geminiService';

export const AI_DATA_EXPORT_KEY = 'amharic-ocr:aiDataExport';

/** Show enough to recognise the key, never enough to use it. */
function maskKey(key: string): string {
  return key.length <= 12 ? '••••' : `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export default function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [savedKey, setSavedKey] = useState<string | undefined>(() => getUserApiKey());
  const [draftKey, setDraftKey] = useState('');
  const [keyError, setKeyError] = useState('');

  const saveKey = () => {
    const k = draftKey.trim();
    // Shape check only — Google is the authority on whether it actually works,
    // and a wrong-but-plausible key surfaces as a clear error on first use.
    if (k.length < 20) { setKeyError('That looks too short to be an API key.'); return; }
    setApiKey(k);
    setSavedKey(k);
    setDraftKey('');
    setKeyError('');
  };

  const clearKey = () => {
    setApiKey('');
    setSavedKey(undefined);
    setKeyError('');
  };
  const [aiDataExport, setAiDataExport] = useState(
    () => localStorage.getItem(AI_DATA_EXPORT_KEY) === 'true',
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  const toggleAiDataExport = () => {
    const next = !aiDataExport;
    setAiDataExport(next);
    localStorage.setItem(AI_DATA_EXPORT_KEY, String(next));
  };

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
              Your Gemini API key
            </div>

            {savedKey ? (
              <>
                <div className="settings-key-row">
                  <code className="settings-env-hint">{maskKey(savedKey)}</code>
                  <button className="settings-key-clear" onClick={clearKey}>Remove</button>
                </div>
                <p className="settings-hint">
                  Extraction runs on your own quota, so the shared limit no longer applies.
                </p>
              </>
            ) : (
              <>
                <input
                  className="settings-key-input"
                  type="password"
                  value={draftKey}
                  onChange={e => { setDraftKey(e.target.value); setKeyError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') saveKey(); }}
                  placeholder="AIza…"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Gemini API key"
                />
                {keyError && <p className="settings-key-error">{keyError}</p>}
                <button className="settings-prokey-btn" onClick={saveKey}>
                  <Key size={12} /> Save key
                </button>
                <p className="settings-hint">
                  Free keys are limited to a few requests per minute, which is what
                  stalls long books. Adding your own gives you your own quota.
                  {' '}
                  <a
                    className="settings-key-link"
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get a free key <ExternalLink size={9} />
                  </a>
                </p>
                <p className="settings-hint settings-hint--muted">
                  Stored only in this browser and sent with your own extraction
                  requests. Never saved on the server.
                </p>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="settings-divider" />

          {/* AI Data Export */}
          <div className="settings-section">
            <div className="settings-section-label">
              <Database size={11} />
              AI Data Export
            </div>
            <label className="settings-toggle-row">
              <span className="settings-toggle-label">Save AI data on document save</span>
              <button
                role="switch"
                aria-checked={aiDataExport}
                className={`settings-toggle${aiDataExport ? ' settings-toggle--on' : ''}`}
                onClick={toggleAiDataExport}
              >
                <span className="settings-toggle-thumb" />
              </button>
            </label>
            <p className="settings-hint">
              Extracts structured text chunks from each saved document — usable
              for AI training, RAG pipelines, embeddings, and search indexing.
              Off by default.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
