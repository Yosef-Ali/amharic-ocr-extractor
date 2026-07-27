import { describe, it, expect, afterEach } from 'vitest';
import {
  decideGuestGate,
  guestIdentity,
  guestLimitMessage,
  hashIp,
  GUEST_CONVERSIONS_PER_HOUR,
  GUEST_IP_CONVERSIONS_PER_HOUR,
  type GuestUsageRow,
} from '../../../api/_guestLimit';

const row = (r: GuestUsageRow): GuestUsageRow => r;

describe('guestIdentity', () => {
  it('prefers the per-browser id so shared networks are not one bucket', () => {
    expect(guestIdentity('abc-123', 'HASH')).toBe('g:abc-123');
  });

  it('falls back to the address when no browser id is sent', () => {
    expect(guestIdentity(undefined, 'HASH')).toBe('ip:HASH');
    expect(guestIdentity('', 'HASH')).toBe('ip:HASH');
    expect(guestIdentity('   ', 'HASH')).toBe('ip:HASH');
  });

  it('gives two browsers behind one address distinct identities', () => {
    expect(guestIdentity('browser-a', 'SAME')).not.toBe(guestIdentity('browser-b', 'SAME'));
  });

  it('truncates an over-long id rather than trusting client length', () => {
    expect(guestIdentity('x'.repeat(500), 'HASH')).toBe(`g:${'x'.repeat(64)}`);
  });
});

describe('decideGuestGate', () => {
  it('records the first conversion from a brand new visitor', () => {
    expect(decideGuestGate(row({}))).toEqual({ outcome: 'record' });
    expect(decideGuestGate(undefined)).toEqual({ outcome: 'record' });
  });

  it('allows further pages of a document already counted', () => {
    // The whole point of conversion ids: a 40-page PDF is one conversion.
    expect(decideGuestGate(row({ seen: true, browser_n: 99, network_n: 99 })))
      .toEqual({ outcome: 'allow' });
  });

  it('blocks the browser tier once its cap is reached', () => {
    const d = decideGuestGate(row({ browser_n: GUEST_CONVERSIONS_PER_HOUR, browser_mins: 12 }));
    expect(d).toEqual({ outcome: 'block', scope: 'browser', retryAfterMinutes: 12 });
  });

  it('still records right below the browser cap', () => {
    expect(decideGuestGate(row({ browser_n: GUEST_CONVERSIONS_PER_HOUR - 1 })))
      .toEqual({ outcome: 'record' });
  });

  it('lets a busy shared network through until the much looser ceiling', () => {
    // 29 conversions from one address, but this browser has used none of them.
    expect(decideGuestGate(row({ browser_n: 0, network_n: GUEST_IP_CONVERSIONS_PER_HOUR - 1 })))
      .toEqual({ outcome: 'record' });
  });

  it('blocks the network tier at its ceiling', () => {
    const d = decideGuestGate(row({ browser_n: 0, network_n: GUEST_IP_CONVERSIONS_PER_HOUR, network_mins: 40 }));
    expect(d).toEqual({ outcome: 'block', scope: 'network', retryAfterMinutes: 40 });
  });

  it('reports the browser tier when both are exhausted', () => {
    // The actionable message for the visitor is about their own usage.
    const d = decideGuestGate(row({
      browser_n: GUEST_CONVERSIONS_PER_HOUR,
      network_n: GUEST_IP_CONVERSIONS_PER_HOUR,
      browser_mins: 5, network_mins: 50,
    }));
    expect(d).toMatchObject({ scope: 'browser', retryAfterMinutes: 5 });
  });

  it('never tells the user to retry in zero or negative minutes', () => {
    for (const mins of [0, -3, null, undefined, NaN]) {
      const d = decideGuestGate(row({ browser_n: GUEST_CONVERSIONS_PER_HOUR, browser_mins: mins as number }));
      expect(d).toMatchObject({ outcome: 'block' });
      expect((d as { retryAfterMinutes: number }).retryAfterMinutes).toBeGreaterThanOrEqual(1);
    }
  });

  it('never promises a wait longer than the window itself', () => {
    const d = decideGuestGate(row({ browser_n: GUEST_CONVERSIONS_PER_HOUR, browser_mins: 5000 }));
    expect(d).toMatchObject({ retryAfterMinutes: 60 });
  });
});

describe('guestLimitMessage', () => {
  it('points a personally-capped visitor at signing in', () => {
    const m = guestLimitMessage('browser', 20);
    expect(m).toContain('Sign in');
    expect(m).toContain('20 minutes');
  });

  it('explains a network block as shared rather than personal', () => {
    const m = guestLimitMessage('network', 20);
    expect(m).toContain('network');
    expect(m).not.toContain(`${GUEST_CONVERSIONS_PER_HOUR} documents per hour`);
  });

  it('singularises one minute', () => {
    expect(guestLimitMessage('browser', 1)).toContain('1 minute.');
  });
});

describe('hashIp', () => {
  const original = process.env.GUEST_IP_SALT;
  afterEach(() => {
    if (original === undefined) delete process.env.GUEST_IP_SALT;
    else process.env.GUEST_IP_SALT = original;
  });

  it('is stable for the same address', () => {
    expect(hashIp('196.188.1.1')).toBe(hashIp('196.188.1.1'));
  });

  it('separates different addresses', () => {
    expect(hashIp('196.188.1.1')).not.toBe(hashIp('196.188.1.2'));
  });

  it('does not leak the address itself', () => {
    expect(hashIp('196.188.1.1')).not.toContain('196.188');
  });

  it('changes with the salt, so digests are not portable across deployments', () => {
    process.env.GUEST_IP_SALT = 'salt-a';
    const a = hashIp('196.188.1.1');
    process.env.GUEST_IP_SALT = 'salt-b';
    expect(hashIp('196.188.1.1')).not.toBe(a);
  });
});
