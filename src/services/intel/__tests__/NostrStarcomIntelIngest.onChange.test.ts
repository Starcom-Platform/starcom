/**
 * The ingest says when what it reports has changed, so a readout can follow it
 * rather than guess on a timer (decision D-F, step 1). The header read the ingest
 * once at load, before the globe had started it, and then every 60 seconds while
 * it looked idle, so every first visit was told the ingest was on standby for a
 * minute that it spent receiving reports.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// start() opens a pool on every configured relay; this one opens nothing.
vi.mock('nostr-tools', () => ({
  SimplePool: class {
    subscribeMany() { return { close() {} }; }
    close() {}
  },
}));

import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

const pointEvent = () => ({
  id: `evt-${Math.random().toString(36).slice(2, 10)}`,
  pubkey: 'b'.repeat(64),
  created_at: Math.floor(Date.parse('2026-06-01T00:00:00.000Z') / 1000),
  kind: 1,
  tags: [['t', 'starcom_intel']],
  content: `Sighting report ---GEOJSON---${JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [10, 20] }, properties: {} }],
  })}`,
  sig: 'sig',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internals = nostrStarcomIntelIngest as any;

afterEach(() => {
  nostrStarcomIntelIngest.stop();
  internals.active = false;
});

describe('NostrStarcomIntelIngest: telling a readout what changed', () => {
  it('tells its listeners when it starts, and when it stops', async () => {
    const heard: boolean[] = [];
    const off = nostrStarcomIntelIngest.onChange(() => heard.push(nostrStarcomIntelIngest.isActive()));
    try {
      await nostrStarcomIntelIngest.start();
      expect(heard).toContain(true);

      nostrStarcomIntelIngest.stop();
      expect(heard[heard.length - 1]).toBe(false);
    } finally {
      off();
    }
  });

  it('tells its listeners when an event changes what it has seen', () => {
    const heard = vi.fn();
    const off = nostrStarcomIntelIngest.onChange(heard);
    internals.active = true;
    try {
      const before = nostrStarcomIntelIngest.getMetrics().seen;
      internals.handleEvent(pointEvent(), 'wss://test-relay');
      expect(nostrStarcomIntelIngest.getMetrics().seen).toBe(before + 1);
      expect(heard).toHaveBeenCalled();
    } finally {
      off();
    }
  });

  it('tells its listeners when a relay connects or drops', () => {
    const heard = vi.fn();
    const off = nostrStarcomIntelIngest.onChange(heard);
    try {
      internals.markRelay('wss://test-relay', true);
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it('tells its listeners when an event is dropped before it reaches a relay', () => {
    // A duplicate is counted and dropped before the relay is marked, so nothing but the
    // ingest's own signal says that what it has counted changed.
    internals.active = true;
    const duplicate = pointEvent();
    internals.handleEvent(duplicate, 'wss://test-relay');
    const heard = vi.fn();
    const off = nostrStarcomIntelIngest.onChange(heard);
    try {
      const before = nostrStarcomIntelIngest.getMetrics().deduped;
      internals.handleEvent(duplicate, 'wss://test-relay');
      expect(nostrStarcomIntelIngest.getMetrics().deduped).toBe(before + 1);
      expect(heard).toHaveBeenCalled();
    } finally {
      off();
    }
  });

  it('stops telling a listener that has left', () => {
    const heard = vi.fn();
    nostrStarcomIntelIngest.onChange(heard)();
    internals.markRelay('wss://test-relay', false);
    expect(heard).not.toHaveBeenCalled();
  });
});
