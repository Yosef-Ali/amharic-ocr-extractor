import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Regression guard for a production outage.
 *
 * `new GoogleGenAI({ apiKey: '' })` throws "API key must be set". The client was
 * being constructed at module scope, so once the bundled project key was removed
 * the module threw on import and the entire app rendered a blank page for every
 * visitor without a personal key.
 *
 * The client must therefore be created lazily, and only the browser-side extras
 * may require it. OCR runs server-side and must work with no key at all.
 */
/** jsdom's localStorage isn't reliably usable here, so supply a real one. */
function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  });
}

describe('geminiService module initialisation', () => {
  beforeEach(() => {
    vi.resetModules();
    installLocalStorage();
  });

  it('imports cleanly with no API key configured', async () => {
    await expect(import('../geminiService')).resolves.toBeDefined();
  });

  it('exposes the OCR entry point without a key', async () => {
    const mod = await import('../geminiService');
    expect(typeof mod.extractPageHTML).toBe('function');
  });

  it('reports no browser key when none is stored', async () => {
    const mod = await import('../geminiService');
    expect(mod.hasBrowserKey()).toBe(false);
  });

  it('sees a key once the user supplies one', async () => {
    const mod = await import('../geminiService');
    mod.setApiKey('test-key-value');
    expect(mod.hasBrowserKey()).toBe(true);
    mod.setApiKey('');
    expect(mod.hasBrowserKey()).toBe(false);
  });

  it('browser-only features fail with a message the key UI recognises', async () => {
    const mod = await import('../geminiService');
    // chatWithAI needs the browser client; with no key it must produce an error
    // isApiKeyError matches, so the app routes it to the "connect a key" flow
    // rather than surfacing a raw SDK failure.
    await expect(
      mod.chatWithAI([{ role: 'user', text: 'hello' }]),
    ).rejects.toSatisfy((err: unknown) => mod.isApiKeyError(err));
  });

  it('reinitializeClient is safe to call with no key', async () => {
    const mod = await import('../geminiService');
    expect(() => mod.reinitializeClient()).not.toThrow();
  });
});
