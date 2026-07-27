import { useState, useEffect, useRef } from 'react';
import { ScanSearch, Mail, Lock, Loader2, X } from 'lucide-react';
import { authClient } from '../lib/neonAuth';

interface Props {
  onSuccess: () => Promise<void>;
  /** When provided the screen is dismissible — Escape, backdrop and a close
   *  button all return the user to whatever they were doing. Guests who are
   *  asked to sign in mid-document must never be trapped here. */
  onCancel?: () => void;
  /** Contextual explanation of why sign-in is being asked for right now. */
  reason?: string;
}

export default function AuthScreen({ onSuccess, onCancel, reason }: Props) {
  const [mode, setMode]       = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [info, setInfo]       = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape closes (when dismissible). Registered in capture phase so it wins
  // over the editor's global Escape handler behind the overlay.
  useEffect(() => {
    if (!onCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || loading) return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel, loading]);

  // Keep Tab inside the dialog while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll<HTMLElement>(
        'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        const result = await (authClient as any).signUp.email({
          name: email.split('@')[0],
          email,
          password,
        });
        if (result?.error) {
          setError(result.error.message ?? 'Sign up failed.');
          return;
        }
        // Sign the new account straight in — making someone re-type the
        // credentials they just chose is the single biggest drop-off in the
        // guest→account funnel. Fall back to the manual step if it fails.
        const signIn = await (authClient as any).signIn.email({ email, password });
        if (signIn?.error) {
          setInfo('Account created! Please sign in.');
          setMode('signin');
          setPassword('');
        } else {
          await onSuccess();
        }
      } else {
        const result = await (authClient as any).signIn.email({ email, password });
        if (result?.error) {
          setError(result.error.message ?? 'Sign in failed.');
        } else {
          await onSuccess();
        }
      }
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`auth-screen${onCancel ? ' auth-screen--modal' : ''}`}
      onMouseDown={onCancel ? e => { if (e.target === e.currentTarget && !loading) onCancel(); } : undefined}
    >
      <div
        className="auth-card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        {onCancel && (
          <button
            type="button"
            className="auth-close"
            onClick={onCancel}
            disabled={loading}
            aria-label="Close and go back"
            title="Close and go back"
          >
            <X size={16} />
          </button>
        )}

        {/* Brand */}
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <ScanSearch size={22} />
          </div>
          <div>
            <div className="auth-brand-name">
              Amharic <span className="auth-brand-accent">OCR</span>
            </div>
            <div className="auth-brand-sub">Document Extractor</div>
          </div>
        </div>

        {/* Title */}
        <p className="auth-title" id="auth-title">
          {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
        </p>

        {/* Why the user is being asked, right now */}
        {reason && <div className="auth-reason">{reason}</div>}

        {/* Banners */}
        {error && <div className="auth-error">{error}</div>}
        {info  && <div className="auth-info">{info}</div>}

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">Email</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon"><Mail size={14} /></span>
              <input
                id="auth-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">Password</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon"><Lock size={14} /></span>
              <input
                id="auth-password"
                className="auth-input"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? <><Loader2 size={15} className="animate-spin" /> {mode === 'signin' ? 'Signing in…' : 'Creating account…'}</>
              : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Toggle */}
        <div className="auth-toggle">
          {mode === 'signin'
            ? <>No account? <button type="button" onClick={() => { setMode('signup'); setError(''); setInfo(''); }}>Create one</button></>
            : <>Already have an account? <button type="button" onClick={() => { setMode('signin'); setError(''); setInfo(''); }}>Sign in</button></>}
        </div>
      </div>
    </div>
  );
}
