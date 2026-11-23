/**
 * A report is titled by what its publisher called it (decision D-F, step 1). A post
 * whose content is a JSON object was titled by its first line, which for such a post
 * is the whole object, so the first reports a new visitor saw were named
 * `{"title":"Backbone-Activation Cross-Node Verification …","ipfsCid":…`.
 */
import { describe, it, expect } from 'vitest';
import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const post = (content: string, kind = 1) => ({
  id: `evt-${Math.random().toString(36).slice(2, 10)}`,
  pubkey: 'c'.repeat(64),
  created_at: Math.floor(Date.parse('2026-08-06T14:17:48.000Z') / 1000),
  kind,
  tags: [['t', 'starcom_intel']],
  content,
  sig: 'sig',
});

/** The real handler, with the service marked active rather than opening relay sockets. */
async function ingest(raw: ReturnType<typeof post>): Promise<IntelReportUI[]> {
  const got: IntelReportUI[] = [];
  const off = nostrStarcomIntelIngest.subscribe((r) => got.push(r));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = nostrStarcomIntelIngest as any;
  const wasActive = svc.active;
  svc.active = true;
  try {
    await svc.handleEvent(raw, 'wss://test-relay');
  } finally {
    svc.active = wasActive;
    off();
  }
  return got;
}

describe('NostrStarcomIntelIngest: what a report is called', () => {
  it('names a JSON post by the title it carries', async () => {
    // The shape of the posts found on the relays on 2026-09-15.
    const reports = await ingest(post(JSON.stringify({
      title: 'Backbone-Activation Cross-Node Verification 1786025868340',
      ipfsCid: 'QmScratchVerificationCidPlaceholder1234567890abcdef',
      solanaTx: null,
      lat: 38.9072,
      lon: -77.0369,
    }), 30023));

    expect(reports).toHaveLength(1);
    expect(reports[0].title).toBe('Backbone-Activation Cross-Node Verification 1786025868340');
  });

  it('names a prose post by its first line, as before', async () => {
    const collection = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [10, 20] }, properties: {} }],
    });
    const reports = await ingest(post(`Convoy seen north of the bridge\n---GEOJSON---${collection}`));

    expect(reports).toHaveLength(1);
    expect(reports[0].title).toBe('Convoy seen north of the bridge');
  });
});
