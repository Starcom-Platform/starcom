/**
 * A received report keeps where its information was published (decision D-CT, CT2; Interchange
 * 3.19): its `r` tags in order, placed or not, http and https only. And its big-three lens tags
 * stay readable among its hashtags (CT5).
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { lensesOf } from '../bigThreeLenses';

type Handler = (event: unknown, relay: string) => void;
const handle = (ingest: NostrStarcomIntelIngest, event: unknown) =>
  (ingest as unknown as { readEvent: Handler }).readEvent(event, 'wss://test');

const event = (tags: string[][]) => ({
  id: `evt-${Math.random().toString(36).slice(2, 9)}`,
  pubkey: 'b'.repeat(64), created_at: Math.floor(Date.now() / 1000), kind: 1, sig: '',
  tags: [['t', 'starcom_intel'], ...tags], content: 'An authority acted against a cartel.',
});

const collect = () => {
  const ingest = new NostrStarcomIntelIngest({ relays: [], searchRelays: [] });
  const seen: IntelReportUI[] = [];
  ingest.subscribe((r) => seen.push(r as IntelReportUI));
  return { ingest, seen };
};

describe('a received report and its sources', () => {
  it('keeps its r tags in tag order, the original first, when it is placed', () => {
    const { ingest, seen } = collect();
    handle(ingest, event([
      ['geo', 'lat:51.5,lon:-0.1'],
      ['r', 'https://www.nationalcrimeagency.gov.uk/news/one'],
      ['t', 'lens:tcs'],
      ['r', 'javascript:alert(1)'],
      ['r', 'https://archangel.agency/intel/one'],
    ]));
    expect(seen[0].sourceLinks).toEqual(['https://www.nationalcrimeagency.gov.uk/news/one', 'https://archangel.agency/intel/one']);
    expect(lensesOf(seen[0].hashtags)).toEqual(['tcs']);
  });

  it('keeps them when it names only a territory', () => {
    const { ingest, seen } = collect();
    handle(ingest, event([['jurisdiction', 'gb'], ['r', 'https://www.occ.gov/news/two'], ['t', 'lens:cbc'], ['t', 'lens:tcs']]));
    expect(seen[0].sourceLinks).toEqual(['https://www.occ.gov/news/two']);
    expect(lensesOf(seen[0].hashtags)).toEqual(['tcs', 'cbc']);
  });

  it('has none when it names no source', () => {
    const { ingest, seen } = collect();
    handle(ingest, event([['geo', 'lat:51.5,lon:-0.1'], ['r', 'data:text/html,hi']]));
    expect(seen[0].sourceLinks).toBeUndefined();
  });

  it('never reads a lens from its text, only from its t tags', () => {
    const { ingest, seen } = collect();
    handle(ingest, { ...event([['geo', 'lat:51.5,lon:-0.1']]), content: 'Tagged #lens:tcs in the words only.' });
    expect(lensesOf(seen[0].hashtags)).toEqual([]);
  });
});
