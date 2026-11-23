/**
 * Starcom as a faithful reader of what the network publishes.
 *
 * The ingest took `parsed.features[0]` and discarded the rest. `accepted`
 * incremented by one and every drop metric read zero, so up to nine claims per
 * event vanished with the metrics completely clean — a FeatureCollection of ten
 * points became one report and nothing recorded the other nine. A
 * FeatureCollection is a set of claims, not a container from which one claim is
 * selected.
 *
 * WHY THIS IS SAFE TO FIX ONLY NOW. Splitting one event into N reports is a
 * confidence-fabrication bug unless feed identity is right first: corroboration
 * counts distinct feedIds, and while eventsAdapter set `feedId: report.id`, a
 * single publisher's single event would have corroborated itself N times. That
 * is fixed (feedId is the author, so a publisher is one feed), and the last
 * test here pins the property end to end so the two cannot drift apart.
 *
 * The ingest builds its own SimplePool internally, so these drive the parser
 * boundary and assert on what reaches ingest.subscribe(). parser → feature is
 * covered by the geoint suite, not here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import { adaptReportsToEvents } from '../../../applications/intelanalyzer/adapters/eventsAdapter';
import { computeCorroboratedFindings } from '../../../applications/intelanalyzer/state/correlationUtils';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const PUBKEY = 'a'.repeat(64);

const collection = (coords: Array<[number, number]>) =>
  JSON.stringify({
    type: 'FeatureCollection',
    features: coords.map(([lon, lat]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {},
    })),
  });

const event = (content: string, id = `evt-${Math.random().toString(36).slice(2, 10)}`) => ({
  id,
  pubkey: PUBKEY,
  created_at: Math.floor(Date.parse('2026-06-01T00:00:00.000Z') / 1000),
  kind: 1,
  tags: [['t', 'starcom_intel']],
  // Navcom format: prose, then the delimiter, then the payload. Raw JSON also
  // works, but the delimiter is what real posts use and what the prefilter
  // hasGeoIntEncoding recognises.
  content: `Sighting report ---GEOJSON---${content}`,
  sig: 'sig',
});

/**
 * Feeds one event through the real handler and collects what it emits.
 *
 * `handleEvent` returns early unless the service is active, and start() would
 * open real relay sockets — so the flag is set directly rather than mocking the
 * pool. Everything downstream of that check is the real code path.
 */
async function ingest(raw: ReturnType<typeof event>): Promise<IntelReportUI[]> {
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

describe('NostrStarcomIntelIngest — every feature becomes a report', () => {
  // There is no resetMetrics, and the ingest is a module singleton, so metrics
  // accumulate across tests in this file. Assert on deltas rather than absolute
  // values — an absolute assertion here would pass or fail on test ORDER.
  afterEach(() => vi.restoreAllMocks());

  it('emits one report per point in a FeatureCollection', async () => {
    const reports = await ingest(event(collection([[10, 20], [11, 21], [12, 22]])));

    expect(reports).toHaveLength(3);
    expect(reports.map((r) => [r.longitude, r.latitude])).toEqual([
      [10, 20], [11, 21], [12, 22],
    ]);
  });

  it('gives each report a distinct id, so they do not collide', async () => {
    // The parser assigns every POINT feature the bare event id, so without a
    // per-feature suffix three points would be one id three times.
    const reports = await ingest(event(collection([[10, 20], [11, 21], [12, 22]])));

    expect(new Set(reports.map((r) => r.id)).size).toBe(3);
  });

  it('keeps the bare event id when there is only one feature', async () => {
    // Backwards compatibility: existing stored reports and dedup keys use the
    // event id, so the common single-feature case must not change shape.
    const raw = event(collection([[10, 20]]), 'evt-single');
    const reports = await ingest(raw);

    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe('evt-single');
  });

  it('marks a coordinate that is a reduced vertex rather than a published point', async () => {
    const raw = event(JSON.stringify({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[10, 20], [11, 21]] },
      properties: {},
    }));

    const reports = await ingest(raw);

    expect(reports).toHaveLength(1);
    // Reducing a line to one point is lossy. Saying so is the difference between
    // a representative point and one somebody published as a point. It stands at
    // the halfway point now, not the first vertex (D-F step 17).
    expect(reports[0].tags).toContain('geometry:line-midpoint');
    expect(reports[0].latitude).toBeCloseTo(20.5);
    expect(reports[0].longitude).toBeCloseTo(10.5);
  });

  it('does not mark a genuine point as reduced', async () => {
    const reports = await ingest(event(collection([[10, 20]])));

    expect(reports[0].tags.some((t) => t.startsWith('geometry:'))).toBe(false);
  });

  it('counts reports and events separately, since they are no longer 1:1', async () => {
    const before = nostrStarcomIntelIngest.getMetrics();

    await ingest(event(collection([[10, 20], [11, 21], [12, 22]])));

    const after = nostrStarcomIntelIngest.getMetrics();
    expect(after.accepted - before.accepted).toBe(3);
    expect(after.acceptedEvents - before.acceptedEvents).toBe(1);
  });

  it('a publisher posting one multi-feature event does NOT corroborate itself', async () => {
    // The property that makes splitting safe, pinned end to end. Three reports
    // from one event share an author, so eventsAdapter gives them one feedId
    // and corroboration sees a single source — not three.
    const reports = await ingest(event(collection([[10, 20], [11, 21], [12, 22]])));
    expect(reports.length).toBeGreaterThan(1);

    const events = adaptReportsToEvents(reports).map((e, i) => ({
      ...e,
      id: `e${i}`,
      entityRefs: ['Acme Corp'],
      claim: { attribute: 'jurisdiction', value: 'Berlin' },
    }));

    expect(new Set(events.map((e) => e.feedId)).size).toBe(1);
    expect(computeCorroboratedFindings(events)).toHaveLength(0);
  });
});
