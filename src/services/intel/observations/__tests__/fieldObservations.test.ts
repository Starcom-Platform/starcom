/**
 * NavCom's field observations as a person reads them (D-MX, MX21), and the
 * report a person starts on one (MX19). Built from the adapter's own output, so
 * these rows are the ones the running app makes. The vocabulary members are
 * invented: NavCom's list is never copied into Starcom.
 */
import { describe, it, expect } from 'vitest';
import { createNavcomAdapter, NAVCOM_OBSERVATION_KIND, type NavcomRawEvent } from '../adapters/navcomAdapter';
import { fieldObservations, reportDraftFrom } from '../fieldObservations';
import type { Observation } from '../../../../types/intel/SourceObservation';
import { PLACE_PRECISIONS } from '../../placePrecision';

const OPERATOR = 'a'.repeat(64);
/** 2026-09-01T12:00:00Z, in unix seconds as NavCom writes `observed_at`. */
const SEEN = 1788264000;
const RELAY = 'wss://relay.example';

const raw = (id: string, over: Record<string, unknown> = {}): NavcomRawEvent => ({
  id, kind: NAVCOM_OBSERVATION_KIND, pubkey: OPERATOR, created_at: SEEN + 3600, sig: 'f'.repeat(128),
  tags: [['g', 'st-louis'], ['d', 'anchor-one']],
  content: JSON.stringify({
    anchor: 'anchor-one', observed_at: SEEN, tags: ['alpha_one', 'beta_one'], method: 'saw',
    callsign: 'Kestrel', precision: 'area', area: '9yzg', ...over,
  }),
});
const adapter = createNavcomAdapter({ verifySignature: () => true, vocabulary: () => null });
const observe = (...events: NavcomRawEvent[]) => adapter.toObservations(events).observations;
const none = () => undefined;

describe('fieldObservations', () => {
  it('reads each event as one row, whatever number of claims it made, newest seen first', () => {
    const older = raw('1'.repeat(64), { observed_at: SEEN - 86_400 });
    const newer = raw('2'.repeat(64));
    const rows = fieldObservations(observe(older, newer), (id) => (id === '2'.repeat(64) ? RELAY : undefined));
    expect(rows.map((r) => r.eventId)).toEqual(['2'.repeat(64), '1'.repeat(64)]);
    expect(rows[0]).toMatchObject({
      operator: OPERATOR, anchor: 'anchor-one', seen: ['alpha_one', 'beta_one'], method: 'saw',
      observedAt: '2026-09-01T12:00:00.000Z', relay: RELAY,
    });
    expect(rows[0].operatorLabel).toMatch(/^Kestrel · npub1/);
    expect(rows[0].precisionM).toBeGreaterThan(10_000);
    expect(rows[1].relay).toBeUndefined();
  });

  it('reads only NavCom observations, and only ones carrying what the adapter always gives', () => {
    const [obs] = observe(raw('1'.repeat(64)));
    expect(fieldObservations([{ ...obs, sourceId: 'gleif' }], none)).toEqual([]);
    for (const missing of ['sourceRecordId', 'upstreamSourceId', 'geo', 'geoPrecisionM'] as const) {
      const lacking: Observation = { ...obs };
      delete lacking[missing];
      expect(fieldObservations([lacking], none)).toEqual([]);
    }
  });
});

describe('reportDraftFrom', () => {
  const [row] = fieldObservations(observe(raw('1'.repeat(64))), () => RELAY);
  const draft = reportDraftFrom(row);

  it('cites the observation, with the relay that held it, and without one when none is known', () => {
    expect(draft.cites).toEqual([{ eventId: '1'.repeat(64), relay: RELAY }]);
    const [bare] = fieldObservations(observe(raw('2'.repeat(64))), none);
    expect(reportDraftFrom(bare).cites).toStrictEqual([{ eventId: '2'.repeat(64) }]);
  });

  it('places the report at the cell, and never more exactly than the cell', () => {
    expect(Number(draft.latitude)).toBeCloseTo(row.lat, 3);
    expect(Number(draft.longitude)).toBeCloseTo(row.lon, 3);
    expect(Number(draft.precisionM)).toBeGreaterThanOrEqual(row.precisionM);
    // One of the form's steps, so its choice shows it rather than "Not stated".
    expect(PLACE_PRECISIONS.map((p) => String(p.metres))).toContain(draft.precisionM);
  });

  it('dates it to the UTC day it was seen', () => {
    expect(draft.event).toEqual({ startDate: '2026-09-01', startTime: '', endDate: '', endTime: '', precision: 'day' });
  });

  it('says what was seen and how, and names neither the operator nor their key: the citation credits them', () => {
    expect(draft.title).toBe('Alpha one, beta one');
    expect(draft.content).toMatch(/alpha one, beta one, seen on 1 Sep 2026 \(UTC\)/);
    expect(draft.content).not.toMatch(/Kestrel|npub1|a{64}/);
    const told = reportDraftFrom(fieldObservations(observe(raw('3'.repeat(64), { method: 'told' })), none)[0]);
    expect(told.content).toMatch(/told to the observer on/);
  });
});
