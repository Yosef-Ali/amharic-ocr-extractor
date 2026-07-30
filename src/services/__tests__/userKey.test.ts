import { describe, it, expect } from 'vitest';
import { redactKeys, isKeyRejected, upstreamDetail } from '../../../api/_ocrPrompt';

/**
 * Users supply their own API key, so anything that could carry it into a log
 * has to be scrubbed. Google's SDK echoes the key back in URLs and messages.
 */
describe('redactKeys', () => {
  it('removes a Google API key from an error message', () => {
    const msg = 'request failed with key AIzaSyB1234567890abcdefghijklmnop';
    const out = redactKeys(msg);
    expect(out).not.toContain('AIzaSyB1234567890abcdefghijklmnop');
    expect(out).toContain('[redacted]');
  });

  it('removes a key passed as a URL query parameter', () => {
    const url = 'https://generativelanguage.googleapis.com/v1/models?key=AIzaSyXYZ987654321abcdefgh&alt=json';
    const out = redactKeys(url);
    expect(out).not.toContain('AIzaSyXYZ987654321abcdefgh');
    expect(out).toContain('key=[redacted]');
    expect(out).toContain('alt=json');   // rest of the URL still readable
  });

  it('handles several keys in one string', () => {
    const s = 'AIzaAAAAAAAAAAAAAAAAAAA then AIzaBBBBBBBBBBBBBBBBBBB';
    const out = redactKeys(s);
    expect(out).not.toMatch(/AIza[A-Z]{10,}/);
  });

  it('leaves ordinary error text intact', () => {
    const msg = 'Quota exceeded for model gemini-3.1-flash-image';
    expect(redactKeys(msg)).toBe(msg);
  });
});

describe('isKeyRejected', () => {
  it('detects credential rejections, which the user must fix themselves', () => {
    expect(isKeyRejected({ status: 401 })).toBe(true);
    expect(isKeyRejected({ status: 403 })).toBe(true);
    expect(isKeyRejected({ message: 'API_KEY_INVALID' })).toBe(true);
    expect(isKeyRejected({ message: 'API key not valid. Please pass a valid API key.' })).toBe(true);
    expect(isKeyRejected({ message: 'API key expired' })).toBe(true);
    expect(isKeyRejected({ message: 'PERMISSION_DENIED' })).toBe(true);
  });

  it('does not mistake a rate limit for a bad key', () => {
    // Critical: a 429 must stay retryable. Treating it as a rejected key would
    // tell users to fix a key that is perfectly fine.
    expect(isKeyRejected({ status: 429, message: 'RESOURCE_EXHAUSTED' })).toBe(false);
    expect(isKeyRejected({ message: 'Quota exceeded' })).toBe(false);
  });

  it('does not mistake ordinary failures for a bad key', () => {
    expect(isKeyRejected({ status: 500, message: 'Internal error' })).toBe(false);
    expect(isKeyRejected(undefined)).toBe(false);
    expect(isKeyRejected(new Error('network timeout'))).toBe(false);
  });
});

describe('upstreamDetail', () => {
  it('surfaces which quota was hit, so a 429 is diagnosable', () => {
    const err = { message: 'You exceeded your current quota. Quota metric: generate_content_free_tier_requests, limit: 0' };
    const out = upstreamDetail(err);
    expect(out).toContain('generate_content_free_tier_requests');
    expect(out).toContain('limit: 0');
  });

  it('redacts any key before returning it to the caller', () => {
    const err = { message: 'failed for key AIzaSyLEAKED1234567890abcdefgh at /v1/models' };
    const out = upstreamDetail(err);
    expect(out).not.toContain('AIzaSyLEAKED1234567890abcdefgh');
    expect(out).toContain('[redacted]');
  });

  it('collapses whitespace and caps length', () => {
    const out = upstreamDetail({ message: 'a\n\n   b' + 'x'.repeat(900) });
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out.startsWith('a b')).toBe(true);
  });

  it('handles a non-Error value', () => {
    expect(upstreamDetail(undefined)).toBe('');
    expect(upstreamDetail('plain string')).toBe('plain string');
  });
});
