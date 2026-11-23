import { describe, it, expect } from 'vitest';
import { buildFindingsLayer, buildConflictMarks, buildIntelLayer, marksWithinWindow, crossesAntimeridian, shortestLonDelta, INTEL_FINDINGS_OVERLAY, GLOBE_INTEL_LAYER_VERSION } from '../globeIntelLayer';
import type { CorroboratedFinding, LocationConflict } from '../../../../applications/intelanalyzer/state/correlationUtils';

const NOW = () => new Date('2026-08-20T00:00:00Z');

const findings: CorroboratedFinding[] = [
  { entityRef: 'Acme Corp', attribute: 'location', value: { lat: 10, lon: 20 }, confidence: 0.82, sourceCount: 3, algorithmVersion: 1 },
  { entityRef: 'Beta Ltd', attribute: 'location', value: { lat: -5, lon: 100 }, confidence: 0.61, sourceCount: 2, algorithmVersion: 1 },
];

const conflicts: LocationConflict[] = [
  { entity: 'Gamma Inc', sourceIdA: 'obs-1', sourceIdB: 'obs-2', distanceKm: 3400, hoursApart: 2, strength: 0.7 },
];

describe('buildFindingsLayer', () => {
  it('projects findings onto marks without inventing anything', () => {
    const layer = buildFindingsLayer(findings, { now: NOW });

    expect(layer.id).toBe(INTEL_FINDINGS_OVERLAY);
    expect(layer.version).toBe(GLOBE_INTEL_LAYER_VERSION);
    expect(layer.marks).toHaveLength(2);
    expect(layer.marks[0]).toMatchObject({
      kind: 'corroboration', lat: 10, lon: 20, label: 'Acme Corp', weight: 0.82, sourceCount: 3,
    });
  });

  it('carries derivation provenance, so the layer is not decoration', () => {
    const layer = buildFindingsLayer(findings, { now: NOW });

    expect(layer.provenance.derivedFrom).toBe('correlation-engine');
    expect(layer.provenance.algorithmVersion).toBe(1);
    expect(layer.provenance.computedAt).toBe('2026-08-20T00:00:00.000Z');
  });

  it('marks fabricated findings, because a pin looks equally authoritative either way', () => {
    const layer = buildFindingsLayer(findings, { mockEntityRefs: new Set(['Beta Ltd']), now: NOW });

    expect(layer.marks.find(m => m.label === 'Acme Corp')!.isMock).toBe(false);
    expect(layer.marks.find(m => m.label === 'Beta Ltd')!.isMock).toBe(true);
  });

  it('reports degraded when a source was unreachable', () => {
    // A sparse globe during an outage must not read as "little is happening".
    const layer = buildFindingsLayer(findings, { blindSpots: ['USGS'], now: NOW });

    expect(layer.degraded).toBe(true);
    expect(layer.provenance.blindSpots).toEqual(['USGS']);
  });

  it('is not degraded when every source reported', () => {
    expect(buildFindingsLayer(findings, { now: NOW }).degraded).toBe(false);
  });

  it('produces an empty layer, not a broken one, when there is nothing to show', () => {
    const layer = buildFindingsLayer([], { now: NOW });
    expect(layer.marks).toEqual([]);
    expect(layer.provenance.derivedFrom).toBe('correlation-engine');
  });

  it('derives weight from the finding rather than declaring one', () => {
    const layer = buildFindingsLayer(findings, { now: NOW });
    // Weight drives visual prominence — a hardcoded value here would put a lie
    // into the first thing an analyst looks at.
    expect(layer.marks.map(m => m.weight)).toEqual([0.82, 0.61]);
  });
});

describe('buildConflictMarks', () => {
  const positions: Record<string, { lat: number; lon: number }> = {
    'obs-1': { lat: 10, lon: 10 },
    'obs-2': { lat: 40, lon: 40 },
  };

  it('emits both halves of a contradiction with a shared id stem', () => {
    const { marks } = buildConflictMarks(conflicts, (id) => positions[id]);

    expect(marks).toHaveLength(2);
    expect(marks[0].id.replace(/:a$/, '')).toBe(marks[1].id.replace(/:b$/, ''));
    expect(marks.every(m => m.kind === 'contradiction')).toBe(true);
    expect(marks.every(m => m.label === 'Gamma Inc')).toBe(true);
  });

  it('emits neither half when only one side can be positioned', () => {
    // Drawing one half of a contradiction renders it as an ordinary sighting —
    // the exact opposite of what it means.
    const { marks, unplaceable } = buildConflictMarks(conflicts, (id) => (id === 'obs-1' ? positions[id] : undefined));
    expect(marks).toEqual([]);
    expect(unplaceable).toBe(1);
  });

  it('never invents a position for an unresolvable side', () => {
    const { marks } = buildConflictMarks(conflicts, () => undefined);
    expect(marks).toEqual([]);
  });

  it('carries conflict strength as weight on both halves', () => {
    const { marks } = buildConflictMarks(conflicts, (id) => positions[id]);
    expect(marks.every(m => m.weight === 0.7)).toBe(true);
  });
});

describe('degenerate geometry', () => {
  it('detects when the shorter path between two points crosses the antimeridian', () => {
    // A renderer interpolating naively from 179 to -179 draws 358 degrees
    // instead of 2 — the contradiction becomes a belt around the planet, which
    // changes what the picture asserts rather than merely looking wrong.
    expect(crossesAntimeridian(179, -179)).toBe(true);
    expect(crossesAntimeridian(-179, 179)).toBe(true);
    expect(crossesAntimeridian(10, -10)).toBe(false);
    expect(crossesAntimeridian(0, 179)).toBe(false);
  });

  it('measures longitude separation along the shorter arc', () => {
    expect(shortestLonDelta(179, -179)).toBe(2);
    expect(shortestLonDelta(0, 180)).toBe(180);
    expect(shortestLonDelta(-170, 170)).toBe(20);
  });

  it('flags an antimeridian-crossing conflict on its link', () => {
    const acrossDateLine: LocationConflict[] = [
      { entity: 'Delta Co', sourceIdA: 'x', sourceIdB: 'y', distanceKm: 300, hoursApart: 1, strength: 0.6 },
    ];
    const { links } = buildConflictMarks(acrossDateLine, (id) =>
      id === 'x' ? { lat: 0, lon: 179.5 } : { lat: 0, lon: -179.5 });

    expect(links[0].crossesAntimeridian).toBe(true);
  });

  it('handles polar coordinates without rejecting them', () => {
    const polar: CorroboratedFinding[] = [
      { entityRef: 'Station Alpha', attribute: 'location', value: { lat: 90, lon: 0 }, confidence: 0.9, sourceCount: 2, algorithmVersion: 1 },
      { entityRef: 'Station Omega', attribute: 'location', value: { lat: -90, lon: 135 }, confidence: 0.9, sourceCount: 2, algorithmVersion: 1 },
    ];
    expect(buildFindingsLayer(polar, { now: NOW }).marks).toHaveLength(2);
  });

  it('reports coincident marks rather than nudging them apart', () => {
    // Jittering a coordinate to make two pins visible puts a mark where
    // nothing was observed — on the surface where position IS the claim.
    const stacked: CorroboratedFinding[] = [
      { entityRef: 'A Corp', attribute: 'location', value: { lat: 5, lon: 5 }, confidence: 0.8, sourceCount: 2, algorithmVersion: 1 },
      { entityRef: 'B Corp', attribute: 'location', value: { lat: 5, lon: 5 }, confidence: 0.7, sourceCount: 2, algorithmVersion: 1 },
    ];
    const layer = buildFindingsLayer(stacked, { now: NOW });

    expect(layer.coincidentMarkIds).toHaveLength(2);
    expect(layer.marks.map(m => m.lat)).toEqual([5, 5]);
  });

  it('excludes AND counts findings it cannot place', () => {
    const broken = [
      ...findings,
      { entityRef: 'Nowhere Ltd', attribute: 'location', value: { lat: NaN, lon: 10 }, confidence: 0.5, sourceCount: 2, algorithmVersion: 1 },
      { entityRef: 'Offworld Ltd', attribute: 'location', value: { lat: 200, lon: 10 }, confidence: 0.5, sourceCount: 2, algorithmVersion: 1 },
    ] as CorroboratedFinding[];

    const layer = buildFindingsLayer(broken, { now: NOW });

    expect(layer.marks).toHaveLength(2);
    // Silently dropping these makes the globe look emptier than the analysis
    // was, with nothing to distinguish that from "nothing is there".
    expect(layer.unplaceable.count).toBe(2);
    expect(Object.values(layer.unplaceable.reasons)[0]).toBe(2);
  });
});

describe('buildIntelLayer — agreement and disagreement in one pass', () => {
  const positions: Record<string, { lat: number; lon: number }> = {
    'obs-1': { lat: 10, lon: 10 },
    'obs-2': { lat: 40, lon: 40 },
  };

  it('carries corroborations and contradictions together', () => {
    const layer = buildIntelLayer(findings, conflicts, (id) => positions[id], { now: NOW });

    // A globe showing only agreement is what every tool already ships.
    expect(layer.marks.filter(m => m.kind === 'corroboration')).toHaveLength(2);
    expect(layer.marks.filter(m => m.kind === 'contradiction')).toHaveLength(2);
    expect(layer.links).toHaveLength(1);
  });

  it('links a contradiction to both of its own marks', () => {
    const layer = buildIntelLayer(findings, conflicts, (id) => positions[id], { now: NOW });
    const link = layer.links[0];
    const ids = layer.marks.map(m => m.id);

    expect(ids).toContain(link.markIdA);
    expect(ids).toContain(link.markIdB);
  });

  it('accumulates unplaceable counts from both halves', () => {
    const layer = buildIntelLayer(findings, conflicts, () => undefined, { now: NOW });

    expect(layer.links).toHaveLength(0);
    expect(layer.unplaceable.count).toBe(1);
    expect(layer.unplaceable.reasons['conflict side could not be positioned']).toBe(1);
  });
});

describe('honest empty states', () => {
  it('reports null integrity when it has not been measured, never 0% real', () => {
    // A zeroed summary renders as "0% real", which is a different and worse
    // claim than "we have not measured this".
    expect(buildFindingsLayer(findings, { now: NOW }).integrity).toBeNull();
  });

  it('carries a measured integrity summary when one is supplied', () => {
    const layer = buildFindingsLayer(findings, {
      now: NOW,
      integrity: { totalObservations: 100, mockCount: 5, realRatio: 0.95 },
    });
    expect(layer.integrity!.realRatio).toBe(0.95);
  });

  it('distinguishes "nothing to analyse" from "analysed and found nothing"', () => {
    expect(buildFindingsLayer([], { now: NOW, hadNoObservations: true }).emptyReason).toBe('no-observations');
    expect(buildFindingsLayer([], { now: NOW, hadNoObservations: false }).emptyReason).toBe('nothing-qualified');
  });

  it('distinguishes a rendering failure from an analytical one', () => {
    // Findings existed; none could be placed. That is not the same fact as
    // "analysis found nothing", and a blank Earth shows both identically.
    const unplaceable = [
      { entityRef: 'X', attribute: 'location', value: { lat: NaN, lon: 0 }, confidence: 0.5, sourceCount: 2, algorithmVersion: 1 },
    ] as CorroboratedFinding[];

    const layer = buildFindingsLayer(unplaceable, { now: NOW });
    expect(layer.emptyReason).toBe('all-unplaceable');
    expect(layer.unplaceable.count).toBe(1);
  });

  it('reports no empty reason when the layer actually has marks', () => {
    expect(buildFindingsLayer(findings, { now: NOW }).emptyReason).toBeNull();
  });
});

describe('marksWithinWindow — overlap, not containment', () => {
  const mark = (id: string, from: string, to: string) => ({
    id, kind: 'corroboration' as const, lat: 0, lon: 0, label: id,
    weight: 0.8, sourceCount: 2, observedFrom: from, observedTo: to, isMock: false,
  });
  const win = (from: string, to: string) => ({ start: new Date(from), end: new Date(to) });

  it('keeps a mark whose span straddles the cursor window', () => {
    // A corroboration spanning six hours is present throughout those six
    // hours. Requiring containment would make longer-lived findings vanish
    // exactly when they are most established.
    const marks = [mark('long', '2026-08-20T00:00:00Z', '2026-08-20T06:00:00Z')];
    expect(marksWithinWindow(marks, win('2026-08-20T03:00:00Z', '2026-08-20T04:00:00Z'))).toHaveLength(1);
  });

  it('keeps a mark that merely touches the window edge', () => {
    const marks = [mark('edge', '2026-08-20T00:00:00Z', '2026-08-20T03:00:00Z')];
    expect(marksWithinWindow(marks, win('2026-08-20T03:00:00Z', '2026-08-20T05:00:00Z'))).toHaveLength(1);
  });

  it('drops a mark entirely before the window', () => {
    const marks = [mark('old', '2026-08-19T00:00:00Z', '2026-08-19T06:00:00Z')];
    expect(marksWithinWindow(marks, win('2026-08-20T00:00:00Z', '2026-08-20T06:00:00Z'))).toHaveLength(0);
  });

  it('drops a mark entirely after the window', () => {
    const marks = [mark('future', '2026-08-21T00:00:00Z', '2026-08-21T06:00:00Z')];
    expect(marksWithinWindow(marks, win('2026-08-20T00:00:00Z', '2026-08-20T06:00:00Z'))).toHaveLength(0);
  });

  it('keeps a mark with an unparseable timestamp rather than silently dropping it', () => {
    // Losing a real finding to a bad date is worse than showing it outside its
    // window, where at least it is visible and checkable.
    const marks = [mark('bad', 'not-a-date', 'also-not-a-date')];
    expect(marksWithinWindow(marks, win('2026-08-20T00:00:00Z', '2026-08-20T06:00:00Z'))).toHaveLength(1);
  });
});

describe('mark budget (I.A.4 — volume)', () => {
  const finding = (i: number, weight: number) => ({
    entityRef: `E${i}`, attribute: 'location', value: { lat: (i % 170) - 85, lon: (i % 350) - 175 },
    confidence: weight, sourceCount: 3, algorithmVersion: 1,
    observedFrom: '2026-01-01T00:00:00Z', observedTo: '2026-01-02T00:00:00Z',
  });
  const conflict = (i: number) => ({
    entity: `C${i}`, sourceIdA: `a${i}`, sourceIdB: `b${i}`, strength: 0.9,
    distanceKm: 500, observedFrom: '2026-01-01T00:00:00Z', observedTo: '2026-01-02T00:00:00Z',
  });
  const pos = (id: string) => ({ lat: id.charCodeAt(0) % 80, lon: id.length * 3 });

  it('emits everything, and truncated stays null, when under budget', () => {
    const l = buildIntelLayer(Array.from({ length: 10 }, (_, i) => finding(i, 0.5)) as never, [], pos, { maxMarks: 100 });
    expect(l.marks).toHaveLength(10);
    expect(l.truncated).toBeNull();
  });

  it('caps at the budget and reports what was left out', () => {
    const l = buildIntelLayer(Array.from({ length: 500 }, (_, i) => finding(i, 0.5)) as never, [], pos, { maxMarks: 100 });
    expect(l.marks).toHaveLength(100);
    expect(l.truncated).toEqual({ shown: 100, total: 500, budgetOverrun: false });
  });

  it('keeps the highest-weight corroborations, not an arbitrary slice', () => {
    // Ascending weight, so a naive slice(0, n) would keep the WEAKEST.
    const l = buildIntelLayer(Array.from({ length: 200 }, (_, i) => finding(i, i / 200)) as never, [], pos, { maxMarks: 10 });
    expect(Math.min(...l.marks.map((m) => m.weight))).toBeGreaterThan(0.9);
  });

  it('never drops a contradiction to make room for agreement', () => {
    // 400 corroborations, 20 contradictions (40 marks), budget 50.
    const l = buildIntelLayer(
      Array.from({ length: 400 }, (_, i) => finding(i, 0.99)) as never,
      Array.from({ length: 20 }, (_, i) => conflict(i)) as never,
      pos, { maxMarks: 50 },
    );
    expect(l.marks.filter((m) => m.kind === 'contradiction')).toHaveLength(40);
    expect(l.marks).toHaveLength(50);
  });

  it('overruns the budget rather than hiding contradictions, and says so', () => {
    const l = buildIntelLayer(
      Array.from({ length: 100 }, (_, i) => finding(i, 0.5)) as never,
      Array.from({ length: 30 }, (_, i) => conflict(i)) as never,
      pos, { maxMarks: 10 },
    );
    expect(l.marks).toHaveLength(60);            // all 30 conflicts, both sides
    expect(l.marks.every((m) => m.kind === 'contradiction')).toBe(true);
    expect(l.truncated?.budgetOverrun).toBe(true);
  });

  it('leaves no link pointing at a mark the budget removed', () => {
    const l = buildIntelLayer(
      Array.from({ length: 2000 }, (_, i) => finding(i, 0.99)) as never,
      Array.from({ length: 30 }, (_, i) => conflict(i)) as never,
      pos, { maxMarks: 100 },
    );
    const ids = new Set(l.marks.map((m) => m.id));
    for (const link of l.links) {
      expect(ids.has(link.markIdA)).toBe(true);
      expect(ids.has(link.markIdB)).toBe(true);
    }
  });

  it('reports coincidence over the marks it actually emitted', () => {
    const l = buildIntelLayer(Array.from({ length: 300 }, (_, i) => finding(i, 0.5)) as never, [], pos, { maxMarks: 50 });
    const ids = new Set(l.marks.map((m) => m.id));
    for (const id of l.coincidentMarkIds) expect(ids.has(id)).toBe(true);
  });
});
