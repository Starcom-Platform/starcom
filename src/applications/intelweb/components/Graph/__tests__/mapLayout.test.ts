/**
 * IntelWeb's Map (decision D-IW, IW13): a note with a point at its point; a note stating only a
 * country gathered around that country's hub, at the country's middle; no note given a point it did
 * not state; a note stating neither in a strip of its own below the map.
 */
import { describe, expect, it } from 'vitest';
import { mapLayout, MAP_HEIGHT, MAP_WIDTH, project } from '../mapLayout';
import type { IntelNode } from '../IntelGraph';

const node = (id: string, type: IntelNode['type'], metadata: Record<string, unknown> = {}): IntelNode =>
  ({ id, type, confidence: 0.8, title: id, tags: [], metadata });
const centres = new Map([['ye', { lat: 15.5, lng: 47.5 }], ['sa', { lat: 24, lng: 45 }]]);
const centreOf = (code: string) => centres.get(code) ?? null;

describe('the Map', () => {
  const nodes = [
    node('pointed', 'report', { coordinates: [15.35, 44.2], jurisdictions: ['ye'] }),
    node('yemen-only', 'report', { jurisdictions: ['ye'] }),
    node('region', 'report', { jurisdictions: ['sa-01'] }),
    node('nowhere', 'report'),
    node('far', 'report', { jurisdictions: ['zz'] }),
    node('countries/ye.md', 'country', { key: 'ye' }),
    node('tags/x.md', 'tag', { key: 'x' }),
  ];
  const out = mapLayout(nodes, centreOf);

  it('puts a note with a point at its point', () => {
    expect(out.places.get('pointed')).toEqual(project(15.35, 44.2));
    expect(out.kinds.get('pointed')).toBe('point');
  });

  it('puts a country\'s hub at the country\'s middle', () => {
    expect(out.places.get('countries/ye.md')).toEqual(project(15.5, 47.5));
  });

  it('gathers a note stating only a country around that country, a region counted as its country, marked as gathered', () => {
    expect(out.places.get('yemen-only')).toEqual(project(15.5, 47.5));
    expect(out.kinds.get('yemen-only')).toBe('gathered');
    expect(out.places.get('region')).toEqual(project(24, 45));
  });

  it('puts a note stating no place, or a country with no known middle, in the strip below the map', () => {
    for (const id of ['nowhere', 'far']) {
      expect(out.kinds.get(id)).toBe('unplaced');
      expect(out.places.get(id)!.y).toBeGreaterThan(MAP_HEIGHT);
    }
    expect(out.places.get('nowhere')!.x).not.toBe(out.places.get('far')!.x);
  });

  it('draws notes and countries only', () => {
    expect(out.places.has('tags/x.md')).toBe(false);
  });

  it('projects longitude across and latitude down, the whole world in the map', () => {
    expect(project(90, -180)).toEqual({ x: 0, y: 0 });
    expect(project(-90, 180)).toEqual({ x: MAP_WIDTH, y: MAP_HEIGHT });
  });
});
