/**
 * Corroboration, driven from real records through the real adapter.
 *
 * This file exists because of a structural gap, not just a bug. The
 * corroboration engine is thoroughly tested — and every one of those tests
 * builds `Event` objects by hand via a local `makeEvent`, setting `feedId`
 * directly. So the engine's semantics were pinned and the ADAPTER that
 * supplies them from real IntelReportUI/IntelItemUI records was never
 * exercised at all. The adapter set `feedId: report.id`, making every record
 * its own independent source, and no test could see it.
 *
 * That carve-out was deliberate once: the Event type's own `feedId` comment
 * recorded fixing this exact defect for observations — "1,795 records produced
 * 38 corroborated findings, every one of them from a single feed" — and then
 * exempted reports on the grounds that "each is authored independently, so the
 * record IS the source". One author writes many reports the same way one feed
 * publishes many rows, so the exemption reproduced the defect it was carved out
 * of.
 *
 * These go end to end: real records in, real corroboration out.
 */
import { describe, it, expect } from 'vitest';
import { adaptReportsToEvents, adaptIntelItemsToEvents } from '../eventsAdapter';
import { computeCorroboratedFindings } from '../../state/correlationUtils';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import type { IntelItemUI } from '../../../../types/intel/IntelItemUI';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: `r-${Math.random().toString(36).slice(2, 8)}`,
  title: 'Report',
  content: 'Body',
  summary: 'S',
  author: 'analyst-alice',
  category: 'GENERAL',
  tags: [],
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  status: 'DRAFT',
  version: 1,
  history: [],
  ...over,
});

const item = (over: Partial<IntelItemUI> = {}): IntelItemUI => ({
  id: `i-${Math.random().toString(36).slice(2, 8)}`,
  title: 'Item',
  type: 'OBSERVATION',
  source: 'feed-alpha',
  reliability: 'B',
  confidence: 0.8,
  tags: [],
  categories: ['GENERAL'],
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  ...over,
} as IntelItemUI);

describe('feed identity — reports', () => {
  it('gives two reports by the SAME author one feed, not two', () => {
    const events = adaptReportsToEvents([
      report({ author: 'analyst-alice' }),
      report({ author: 'analyst-alice' }),
    ]);

    expect(new Set(events.map(e => e.feedId)).size).toBe(1);
    // sourceId still separates the records, which is what stops a record
    // corroborating itself.
    expect(new Set(events.map(e => e.sourceId)).size).toBe(2);
  });

  it('gives two reports by DIFFERENT authors two feeds', () => {
    const events = adaptReportsToEvents([
      report({ author: 'analyst-alice' }),
      report({ author: 'analyst-bob' }),
    ]);

    expect(new Set(events.map(e => e.feedId)).size).toBe(2);
  });

  it('treats a Nostr publisher as one feed however many events they post', () => {
    // NostrStarcomIntelIngest sets author to the event pubkey, so all of one
    // publisher's reports share a feed. This is the case that matters once the
    // ingest starts emitting one report per geo feature.
    const pubkey = 'e0a67c34ab'.repeat(6).slice(0, 64);
    const events = adaptReportsToEvents([
      report({ author: pubkey, tags: ['nostr', 'relay:wss://a'] }),
      report({ author: pubkey, tags: ['nostr', 'relay:wss://b'] }),
      report({ author: pubkey, tags: ['nostr', 'relay:wss://a'] }),
    ]);

    expect(new Set(events.map(e => e.feedId)).size).toBe(1);
  });

  it('collapses unknown authorship into one feed rather than splitting it', () => {
    // The deflating error, chosen deliberately: two anonymous reports MIGHT be
    // the same person, so asserting independence we never established would
    // claim corroboration that may not exist.
    const events = adaptReportsToEvents([report({ author: '' }), report({ author: '   ' })]);

    expect(new Set(events.map(e => e.feedId)).size).toBe(1);
    expect(events[0].feedId).not.toBe(events[0].sourceId);
  });
});

describe('feed identity — intel items', () => {
  it('groups items by their source, not their record id', () => {
    const events = adaptIntelItemsToEvents([
      item({ source: 'feed-alpha' }),
      item({ source: 'feed-alpha' }),
      item({ source: 'feed-beta' }),
    ]);

    expect(new Set(events.map(e => e.feedId)).size).toBe(2);
  });
});

describe('end to end: real records through the adapter into corroboration', () => {
  it('does NOT corroborate a claim carried only by one author', () => {
    // The bug this file exists for. Two reports by one analyst used to clear
    // the "two independent feeds" bar simply by being two records.
    const events = adaptReportsToEvents([
      report({ author: 'analyst-alice' }),
      report({ author: 'analyst-alice' }),
    ]).map((e, i) => ({ ...e, entityRefs: ['Acme Corp'], claim: { attribute: 'jurisdiction', value: 'Berlin' }, id: `e${i}` }));

    expect(computeCorroboratedFindings(events)).toHaveLength(0);
  });

  it('DOES corroborate the same claim once a second author carries it', () => {
    const events = adaptReportsToEvents([
      report({ author: 'analyst-alice' }),
      report({ author: 'analyst-bob' }),
    ]).map((e, i) => ({ ...e, entityRefs: ['Acme Corp'], claim: { attribute: 'jurisdiction', value: 'Berlin' }, id: `e${i}` }));

    expect(computeCorroboratedFindings(events).length).toBeGreaterThan(0);
  });

  it('does not corroborate across one publisher posting the same claim twice', () => {
    const pubkey = 'deadbeef'.repeat(8);
    const events = adaptReportsToEvents([
      report({ author: pubkey }),
      report({ author: pubkey }),
    ]).map((e, i) => ({ ...e, entityRefs: ['Acme Corp'], claim: { attribute: 'jurisdiction', value: 'Berlin' }, id: `e${i}` }));

    expect(computeCorroboratedFindings(events)).toHaveLength(0);
  });
});
