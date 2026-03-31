import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAccessToken, authFetch } from '../apiClient';

describe('apiClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setAccessToken(null);
  });

  describe('setAccessToken', () => {
    it('sets the token used by authFetch', async () => {
      setAccessToken('test-token-123');
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'ok' }),
      });

      await authFetch('/api/test');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      );
    });

    it('clears the token when set to null', async () => {
      setAccessToken('some-token');
      setAccessToken(null);

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await authFetch('/api/test');

      const headers = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('authFetch', () => {
    it('includes Content-Type application/json by default', async () => {
      setAccessToken('token');
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await authFetch('/api/data');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('throws on non-ok response with error message from body', async () => {
      setAccessToken('token');
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve(JSON.stringify({ error: 'Not found' })),
      });

      await expect(authFetch('/api/missing')).rejects.toThrow('Not found');
    });

    it('throws generic error when response body is not JSON', async () => {
      setAccessToken('token');
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('not json'),
      });

      await expect(authFetch('/api/broken')).rejects.toThrow('Request failed');
    });

    it('passes through custom options', async () => {
      setAccessToken('token');
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await authFetch('/api/save', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/save',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
        }),
      );
    });
  });
});
