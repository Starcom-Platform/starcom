/**
 * Coverage, and the refusals that keep it honest.
 *
 * Most of what is pinned here is an axis declining to answer: a grid that
 * refuses a percentage, and two axes that report they cannot be computed
 * rather than returning zero. A zero and an "unmeasured" look identical in a
 * UI and mean opposite things — zero says we looked, unmeasured says we could
 * not.
 */
import { describe, it, expect } from 'vitest';
import { measureCoverage, type CoverageInput } from '../coverage';
import { buildTerritoryIndex } from '../territoryIndex';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import type { MissionUI } from '../../../../types/intel/MissionUI';

const report = (id: string, lat?: number, lon?: number): IntelReportUI => ({
  id, title: id, content: '', author: 'a', category: 'GEOINT', tags: [],
  ...(lat !== undefined ? { latitude: lat } : {}),
  ...(lon !== undefined ? { longitude: lon } : {}),
  createdAt: new Date(), updatedAt: new Date(), status: 'SUBMITTED',
} as unknown as IntelReportUI);

const mission = (id: string, relatedReports: string[] = []): MissionUI => ({
  id, missionNumber: id, title: id, briefing: '', status: 'DRAFT',
  objectives: [], relatedReports, relatedCases: [], tags: [], metadata: {},
  createdAt: '', updatedAt: '', createdBy: 'op',
  collaborators: [], comments: [], activityLog: [], permissions: { isPublic: false },
} as unknown as MissionUI);

const input = (over: Partial<CoverageInput> = {}): CoverageInput => ({
  reports: [], cases: [], missions: [],
  relays: [{ url: 'wss://a', connected: true }, { url: 'wss://b', connected: false }],
  ...over,
});

const axis = (id: string, result = measureCoverage(input())) =>
  result.find((a) => a.id === id)!;

describe('measureCoverage', () => {
  it('reports every axis, including the ones it cannot compute', () => {
    const axes = measureCoverage(input());
    expect(axes.map((a) => a.id)).toEqual([
      'sources', 'questions', 'grid', 'stated-jurisdiction', 'derived-territory',
    ]);
  });

  it('counts relays that answered against relays configured', () => {
    const sources = axis('sources');
    expect(sources.result).toMatchObject({ expected: 2, covered: 1 });
  });

  it('counts missions resting on something against all missions', () => {
    const axes = measureCoverage(input({
      reports: [report('r1', 1, 2)],
      missions: [mission('m1', ['r1']), mission('m2')],
    }));
    expect(axis('questions', axes).result).toMatchObject({ expected: 2, covered: 1 });
  });

  it('refuses a denominator for the grid, and says why', () => {
    const axes = measureCoverage(input({
      reports: [report('r1', 10.2, 20.2), report('r2', 10.8, 20.8), report('r3', 40, 50)],
    }));
    const grid = axis('grid', axes);
    // Two reports share a 1° cell; the third does not.
    expect(grid.result).toMatchObject({ expected: null, covered: 2, items: 3 });
    expect(grid.blindSpot).toContain('No denominator');
  });

  it('counts a report with no coordinates as unplaced, never as covered', () => {
    const axes = measureCoverage(input({ reports: [report('r1'), report('r2', 5, 5)] }));
    expect(axis('grid', axes).result).toMatchObject({ covered: 1, items: 2, unplaced: 1 });
  });

  it('says an axis is unmeasured rather than returning zero', () => {
    // Zero and unmeasured look identical in a UI and mean opposite things.
    // The territory polygons are a megabyte fetched at runtime, so "not loaded
    // yet" is a real state and must not read as "no territories have intel".
    const a = axis('derived-territory');
    expect(a.result).toBeNull();
    expect(a.why).toBeTruthy();
  });

  it('gives the territory axis a REAL denominator once the polygons load', () => {
    const territories = buildTerritoryIndex([
      { properties: { ADMIN: 'Squareland' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
      { properties: { ADMIN: 'Farland' }, geometry: { type: 'Polygon', coordinates: [[[50, 50], [60, 50], [60, 60], [50, 60], [50, 50]]] } },
    ]);
    const axes = measureCoverage(input({
      reports: [report('r1', 5, 5), report('r2', 6, 6), report('r3', -40, -30)],
      territories,
    }));
    // Two reports in Squareland, one in open ocean: 1 of 2 territories.
    expect(axis('derived-territory', axes).result)
      .toMatchObject({ expected: 2, covered: 1, items: 3, unplaced: 1 });
  });

  it('counts ocean as having no territory, not as a coverage gap', () => {
    const territories = buildTerritoryIndex([
      { properties: { ADMIN: 'Squareland' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    ]);
    const axes = measureCoverage(input({ reports: [report('r1', -40, -30)], territories }));
    const result = axis('derived-territory', axes).result;
    expect(result).toMatchObject({ covered: 0, unplaced: 1 });
  });

  it('counts DISTINCT jurisdictions, not reports that named one', () => {
    // The counts must differ or this proves nothing: the first version used
    // two reports naming two jurisdictions, where counting reports and
    // counting jurisdictions both give 2, and a mutation that counted reports
    // passed straight through it.
    const axes = measureCoverage(input({
      reports: [
        { ...report('r1', 1, 2), jurisdictions: ['us', 'us-va'] } as IntelReportUI,
        { ...report('r2', 3, 4), jurisdictions: ['us'] } as IntelReportUI,
        { ...report('r3', 5, 6), jurisdictions: ['us-va'] } as IntelReportUI,
        report('r4', 7, 8),
      ],
    }));
    const stated = axis('stated-jurisdiction', axes);
    // Two distinct jurisdictions, named by three of four reports.
    expect(stated.result).toMatchObject({ expected: null, covered: 2, items: 4, unplaced: 1 });
  });

  it('refuses a denominator for stated jurisdictions, structurally', () => {
    // Not a gap to fill later: a jurisdiction nobody names cannot be counted
    // as missing, because nothing here knows it exists.
    const stated = axis('stated-jurisdiction');
    expect(stated.result?.expected).toBeNull();
    expect(stated.blindSpot).toContain('invisible here by construction');
  });

  it('states a blind spot for every axis, including the computable ones', () => {
    for (const a of measureCoverage(input())) {
      expect(a.blindSpot.length).toBeGreaterThan(20);
    }
  });

  it('does not let an answering relay imply it had anything to say', () => {
    expect(axis('sources').blindSpot).toContain('not a relay that has anything to say');
  });
});
