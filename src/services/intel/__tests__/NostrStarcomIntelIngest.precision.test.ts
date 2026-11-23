/**
 * The intake keeps how precisely a report was placed (decision D-F, section 18,
 * item 3), and the marker the globe draws carries it.
 *
 * It was never filled: a report Mecha Jono placed only to its county, because
 * nothing resolves the filing address more finely, was drawn and captioned as
 * though it were exact.
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import { reportToMarker } from '../globe/reportMarker';
import { PRECISION_WORDS_M, geohashCellRadiusM } from '../../geoint/statedPrecision';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

type Handler = (event: unknown, relay: string) => void;
const handle = (ingest: NostrStarcomIntelIngest, event: unknown) =>
  (ingest as unknown as { readEvent: Handler }).readEvent(event, 'wss://test');

const event = (tags: string[][], content = 'Six charities lost their exemption.') => ({
  id: `evt-${Math.random().toString(36).slice(2, 9)}`,
  pubkey: 'a'.repeat(64), created_at: Math.floor(Date.now() / 1000), kind: 1, sig: '',
  tags: [['t', 'starcom_intel'], ...tags], content,
});

const collect = () => {
  const ingest = new NostrStarcomIntelIngest({ relays: [], searchRelays: [] });
  const seen: IntelReportUI[] = [];
  ingest.subscribe((r) => seen.push(r as IntelReportUI));
  return { ingest, seen };
};

describe('the precision a report was placed to', () => {
  it('keeps a stated precision', () => {
    const { ingest, seen } = collect();
    handle(ingest, event([['geo', 'lat:37.4,lon:-77.5'], ['geo_precision', 'county']]));
    expect(seen[0].geoPrecisionM).toBe(PRECISION_WORDS_M.county);
  });

  it('takes a geohash cell when that is where the position came from', () => {
    const { ingest, seen } = collect();
    handle(ingest, event([['g', 'dq8vt']]));
    expect(seen[0].geoPrecisionM).toBe(geohashCellRadiusM('dq8vt'));
  });

  it('states none when none was stated, rather than inventing one', () => {
    const { ingest, seen } = collect();
    handle(ingest, event([['geo', 'lat:37.4,lon:-77.5']]));
    expect(seen[0].geoPrecisionM).toBeUndefined();
  });

  it('reaches the marker the globe draws', () => {
    const { ingest, seen } = collect();
    handle(ingest, event([['geo', 'lat:37.4,lon:-77.5'], ['geo_precision', '12km']]));
    expect(reportToMarker(seen[0])!.geoPrecisionM).toBe(12_000);
  });
});
