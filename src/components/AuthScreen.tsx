import { useState } from 'react';
import { ScanSearch, Mail, Lock, Loader2 } from 'lucide-react';
import { authClient } from '../lib/neonAuth';

interface Props {
  onSuccess: () => Promise<void>;
}

export default function AuthScreen({ onSuccess }: Props) {
  const [mode, setMode]       = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [info, setInfo]       = useState('');

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
        } else {
          setInfo('Account created! Please sign in.');
          setMode('signin');
          setPassword('');
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
    <div className="auth-screen">
      <div className="auth-card">
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
        <p className="auth-title">
          {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
        </p>

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
