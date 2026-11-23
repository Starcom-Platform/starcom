/** The Spheres layer's state, and the reports a Sphere finds. */
import { describe, it, expect, beforeEach } from 'vitest';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import type { PolygonGeometry } from '../../../../services/geoint/pointInPolygon';
import { reportsInSphere } from '../sphereReports';
import { getSpheresState, resetSpheresStoreForTests, selectSphere, setSphereHover, setSpheresOn } from '../spheresStore';

const square: PolygonGeometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
const report = (id: string, at: Partial<IntelReportUI>, created = '2026-10-01T00:00:00Z') =>
  ({ id, title: id, createdAt: new Date(created), ...at }) as IntelReportUI;

describe('reportsInSphere', () => {
  it('lists the reports naming the Sphere, newest first, and counts those placed in its states', () => {
    const got = reportsInSphere('sphere:x', square, [
      report('named-old', { jurisdictions: ['sphere:x'] }, '2026-10-01T00:00:00Z'),
      report('named-new', { jurisdictions: [' SPHERE:X '] }, '2026-10-05T00:00:00Z'),
      report('inside', { latitude: 5, longitude: 5 }),
      report('outside', { latitude: 20, longitude: 5 }),
      report('country-only', { jurisdictions: ['ca'] }),
    ]);
    expect(got.named.map((r) => r.id)).toEqual(['named-new', 'named-old']);
    expect(got.inside).toBe(1);
  });

  it('counts nothing inside before the shapes are read', () => {
    expect(reportsInSphere('sphere:x', undefined, [report('inside', { latitude: 5, longitude: 5 })]).inside).toBe(0);
  });
});

describe('spheresStore', () => {
  beforeEach(() => { resetSpheresStoreForTests(); localStorage.clear(); });

  it('opening a Sphere turns the layer on and keeps the others at that place', () => {
    selectSphere('sphere:anglosphere', ['sphere:anglosphere', 'sphere:francophonie']);
    expect(getSpheresState()).toMatchObject({ on: true, selected: 'sphere:anglosphere', also: ['sphere:francophonie'] });
    expect(localStorage.getItem('starcom-spheres-layer')).toBe('on');
  });

  it('turning it off closes the panel and the hover', () => {
    selectSphere('sphere:nordic');
    setSphereHover({ codes: ['sphere:nordic'], x: 1, y: 2 });
    setSpheresOn(false);
    expect(getSpheresState()).toMatchObject({ on: false, selected: null, hovered: null, also: [] });
  });

  it('a hover that has not moved changes nothing', () => {
    setSphereHover({ codes: ['a', 'b'], x: 1, y: 2 });
    const before = getSpheresState();
    setSphereHover({ codes: ['a', 'b'], x: 1, y: 2 });
    expect(getSpheresState()).toBe(before);
  });
});
