/**
 * Every caveat, as the card prints it (decision IM11; capture schema 12).
 *
 * Every caveat that applies stays on the card (decision D-F); the card prints
 * each in one short sentence, small and muted, and the full wording stays in
 * the provenance. The two lists are made together, caveat by caveat, so they
 * can never disagree about which caveats apply.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildGlobeViewProvenance,
  EMPTY_REASON_CAVEAT,
  EMPTY_REASON_CAVEAT_SHORT,
  GLOBE_CAPTURE_SCHEMA_VERSION,
  type BuildProvenanceInput,
} from '../shareCardProvenance';

const AT = new Date('2026-09-10T12:00:00.000Z');
const input = (over: Partial<BuildProvenanceInput> = {}): BuildProvenanceInput => ({
  capturedAt: AT,
  camera: { lat: 38.9, lon: -77, altitude: 2.5 },
  frame: { width: 1200, height: 630 },
  layers: [{ label: 'Intel Reports', active: true, implemented: true }],
  feeds: [{ name: 'NOAA', lastUpdated: AT.toISOString() }],
  build: { sha: 'a'.repeat(40), builtAt: AT.toISOString() },
  now: AT,
  ...over,
});
const LONG_NAME = 'War & Conflict from US State Department travel advice, UN News and Wikipedia\'s Current events portal, via Mecha Jono on The Record';

describe('the short caveats', () => {
  it('is schema 12', () => {
    expect(GLOBE_CAPTURE_SCHEMA_VERSION).toBeGreaterThanOrEqual(12);
  });

  it('pairs each caveat with its short form, in the same order, whatever applies', () => {
    const everything = buildGlobeViewProvenance(input({
      layers: [{ label: 'Satellites', active: true, implemented: false }],
      feeds: [
        { name: LONG_NAME, shortName: 'War & Conflict', lastUpdated: null, error: 'socket closed' },
        { name: 'NOAA', lastUpdated: '2026-09-01T00:00:00.000Z' },
        { name: 'CelesTrak', lastUpdated: null, loading: true },
        { name: 'EIA', lastUpdated: null },
        { name: 'GDELT', lastUpdated: 'not a date' },
        { name: 'Grid', lastUpdated: null, unreported: true },
      ],
      marks: { shown: 3, fabricated: null, totalObservations: null } as never,
      build: { sha: 'b'.repeat(40), builtAt: AT.toISOString(), treeDirty: true },
      appearance: { skin: 'Blue Marble', lightMode: 'headlamp', quality: { setting: 'auto', detail: 'low', clouds: false, atmosphere: false } } as never,
    }));
    expect(everything.caveatsShort).toHaveLength(everything.caveats.length);
    everything.caveatsShort.forEach((short, i) => {
      expect(short.length, short).toBeLessThanOrEqual(everything.caveats[i].length);
      expect(short.length, short).toBeLessThanOrEqual(90);
    });
  });

  it('names a feed by its short name, and keeps what matters of each state', () => {
    const p = buildGlobeViewProvenance(input({
      feeds: [{ name: LONG_NAME, shortName: 'War & Conflict', lastUpdated: null, error: 'socket closed' }],
    }));
    expect(p.caveatsShort[0]).toBe('War & Conflict did not load; that is not an all-clear.');
    expect(p.caveats[0]).toContain(LONG_NAME);
  });

  it('says the ones every card carries in short', () => {
    const p = buildGlobeViewProvenance(input({
      appearance: { skin: 'Blue Marble', lightMode: 'sun', quality: { setting: 'auto', detail: 'low', clouds: false, atmosphere: true } } as never,
    }));
    expect(p.caveatsShort).toContain('Drawn without clouds on this device; the data is unchanged.');
    expect(p.caveatsShort.at(-1)).toBe('Unsigned capture: one browser\'s view at one moment.');
  });

  it('prints a standing note in its short form, once however many feeds share it', () => {
    const feed = (name: string) => ({ name, lastUpdated: AT.toISOString(), note: 'A long note about the nature of this data, as the layer states it in full.', noteShort: 'Short note.' });
    const p = buildGlobeViewProvenance(input({ feeds: [feed('A'), feed('B')] }));
    expect(p.caveatsShort.filter((c) => c === 'Short note.')).toHaveLength(1);
    expect(p.caveats.filter((c) => c.startsWith('A long note'))).toHaveLength(1);
  });

  it('says an empty analysis in short beside its full sentence, naming the browser, never "you"', () => {
    for (const reason of ['no-observations', 'nothing-qualified', 'all-unplaceable'] as const) {
      const p = buildGlobeViewProvenance(input({ marks: { shown: 0, fabricated: null, totalObservations: null, emptyReason: reason } }));
      const at = p.caveats.indexOf(EMPTY_REASON_CAVEAT[reason]);
      expect(at, reason).toBeGreaterThanOrEqual(0);
      expect(p.caveatsShort[at], reason).toBe(EMPTY_REASON_CAVEAT_SHORT[reason]);
      expect(EMPTY_REASON_CAVEAT_SHORT[reason], reason).not.toMatch(/\byours?\b/i);
    }
    expect(EMPTY_REASON_CAVEAT_SHORT['no-observations']).toMatch(/browser/);
  });

  it('prints a note with no short form as it is', () => {
    const p = buildGlobeViewProvenance(input({ feeds: [{ name: 'GDELT', lastUpdated: AT.toISOString(), note: 'GDELT events are machine-coded from news reports; any single event can be miscoded.' }] }));
    expect(p.caveatsShort).toContain('GDELT events are machine-coded from news reports; any single event can be miscoded.');
  });
});
