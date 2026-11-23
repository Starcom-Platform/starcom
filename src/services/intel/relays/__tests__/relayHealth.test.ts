/**
 * A relay's light and the capacity gauge (BD11, BD12; interface-upgrade.md,
 * "Relay health"): ● OK, ◐ degraded, ✕ down, ◌ stale, each with its words, and
 * a light that greys by itself when its check is old.
 */
import { describe, it, expect } from 'vitest';
import { relayLight, relayCapacity, STALE_AFTER_MS, RELAYS_NEEDED } from '../relayHealth';

const now = Date.UTC(2026, 9, 5, 12);
const relay = (over: Record<string, unknown>) => ({ url: 'wss://relay.example', connected: true, ...over });

describe('relayLight', () => {
  it('is down for a relay not connected', () => {
    expect(relayLight(relay({ connected: false }), now)).toMatchObject({ light: 'down', words: 'down' });
  });

  it('is OK for one that answered its last check, saying when', () => {
    expect(relayLight(relay({ lastAnsweredAt: now - 40_000 }), now)).toMatchObject({ light: 'ok', words: 'answered 40 s ago' });
  });

  it('greys by itself once its last answer is older than two minutes', () => {
    expect(STALE_AFTER_MS).toBe(120_000);
    expect(relayLight(relay({ lastAnsweredAt: now - 180_000 }), now)).toMatchObject({ light: 'stale', words: 'last answered 3 min ago' });
  });

  it('is degraded when connected but its last check went unanswered', () => {
    expect(relayLight(relay({ lastAnsweredAt: now - 70_000, lastCheckFailedAt: now - 5_000 }), now))
      .toMatchObject({ light: 'degraded', words: 'connected, did not answer the last check' });
  });

  it('is degraded when connected and not yet answered', () => {
    expect(relayLight(relay({}), now)).toMatchObject({ light: 'degraded', words: 'connected, not answered yet' });
  });
});

describe('relayCapacity', () => {
  const ok = relay({ lastAnsweredAt: now - 1_000 });
  it('needs two relays answering for a publish', () => {
    expect(RELAYS_NEEDED).toBe(2);
  });

  it('is green with room to spare, amber at exactly enough, red below', () => {
    expect(relayCapacity([ok, ok, ok], now)).toMatchObject({ answering: 3, needed: 2, level: 'ok', words: '3 answering, 2 needed' });
    expect(relayCapacity([ok, ok, relay({ connected: false })], now)).toMatchObject({ answering: 2, level: 'caution' });
    expect(relayCapacity([ok, relay({ connected: false })], now)).toMatchObject({ answering: 1, level: 'danger', words: '1 answering, 2 needed' });
  });

  it('counts only relays whose light is OK', () => {
    expect(relayCapacity([ok, relay({ lastAnsweredAt: now - 300_000 }), relay({})], now).answering).toBe(1);
  });
});
