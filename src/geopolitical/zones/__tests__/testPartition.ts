/**
 * A whole-globe ZSP 2.0 partition made for tests, never shipped (decision D-ZR, ZR12): the northern half is
 * `terra:borea` and the southern `mare:austra`, each cut at the prime meridian into two Zones, each Zone cut at its
 * middle latitude into two Sectors. Every edge is shared vertex for vertex, as the rules ask, and a ring that meets
 * a pole runs along it, as RFC 7946 draws one.
 */
import { createHash } from 'node:crypto';

type LngLat = [number, number];

/** A lon/lat box as a closed, counter-clockwise ring, with points every `every` degrees (10 unless said) along its sides. */
export function box(w: number, s: number, e: number, n: number, every = 10): LngLat[] {
  const along = (from: number, to: number): number[] => {
    const out: number[] = [];
    const step = Math.sign(to - from) * every;
    for (let x = from; step > 0 ? x < to : x > to; x += step) out.push(x);
    return out;
  };
  return [
    ...along(w, e).map((x): LngLat => [x, s]),
    ...along(s, n).map((y): LngLat => [e, y]),
    ...along(e, w).map((x): LngLat => [x, n]),
    ...along(n, s).map((y): LngLat => [w, y]),
    [w, s],
  ];
}

const feature = (properties: Record<string, unknown>, ring: LngLat[]) => ({
  type: 'Feature', id: properties.id, properties, geometry: { type: 'Polygon', coordinates: [ring] },
});

interface Half { id: string; name: string; level: 'terra' | 'mare'; s: number; n: number }

const HALVES: Half[] = [
  { id: 'terra:borea', name: 'Terra Borea', level: 'terra', s: 0, n: 90 },
  { id: 'mare:austra', name: 'Mare Austra', level: 'mare', s: -90, n: 0 },
];

/** One container's file, as Mecha Jono's export writes it. */
export function containerDoc(half: Half): Record<string, unknown> {
  const mid = (half.s + half.n) / 2;
  const slug = half.id.split(':')[1];
  const features = [feature({ id: half.id, name: half.name, level: half.level, parent: null, principle: `The ${half.level} for tests.`, plates: ['Test'] }, box(-180, half.s, 180, half.n))];
  for (const [w, e, side] of [[-180, 0, 'west'], [0, 180, 'east']] as const) {
    const zone = `zone:${slug}-${side}`;
    features.push(feature({ id: zone, name: `${half.name} ${side} Zone`, level: 'zone', parent: half.id, system: 'shield' }, box(w, half.s, e, half.n)));
    for (const [s, n, band] of [[half.s, mid, 'low'], [mid, half.n, 'high']] as const) {
      features.push(feature({
        id: `${zone}/sector:${band}`, name: `${side} ${band}`, level: 'sector', parent: zone,
        edges: [{ follows: 'grid', name: 'the test grid' }],
        size_reason: 'A test partition: a quarter of a hemisphere each.',
        sources: [{ name: 'Made for tests', licence: 'CC0-1.0' }],
      }, box(w, s, e, n)));
    }
  }
  return { type: 'FeatureCollection', zsp: '2.0', container: half.id, features };
}

/** The whole partition: its manifest and its files' text, the manifest naming each file by its hash. */
export function testPartition(): { manifest: Record<string, unknown>; files: Record<string, string> } {
  const files: Record<string, string> = {};
  const containers = HALVES.map((half) => {
    const file = `${half.id.replace(':', '-')}.zsp.geojson`;
    const text = JSON.stringify(containerDoc(half));
    files[file] = text;
    return { id: half.id, name: half.name, level: half.level, file, sha256: createHash('sha256').update(text).digest('hex'), bytes: new TextEncoder().encode(text).length };
  });
  const manifest = {
    zsp: '2.0', generated: '2026-10-18T00:00:00Z', generator: 'testPartition.ts', licence: 'CC-BY-4.0', containers,
    retired: [{ id: 'zone:sahel', name: 'Sahel Zone', covered_by: ['zone:borea-west', 'zone:borea-east'] }],
  };
  return { manifest, files };
}

/**
 * A larger whole-globe partition, for what must not grow with the number of Sectors: each half cut into Zones
 * `zoneDegrees` wide, each Zone into a grid of Sectors `sectorDegrees` square. Built as the files would be read.
 */
export function gridPartition(zoneDegrees = 45, sectorDegrees = 15, every = 10): { manifest: Record<string, unknown>; files: Record<string, string> } {
  const files: Record<string, string> = {};
  const containers = HALVES.map((half) => {
    const slug = half.id.split(':')[1];
    const features = [feature({ id: half.id, name: half.name, level: half.level, parent: null }, box(-180, half.s, 180, half.n, every))];
    for (let w = -180; w < 180; w += zoneDegrees) {
      const zone = `zone:${slug}-${w + 180}`;
      features.push(feature({ id: zone, name: `Zone ${w}`, level: 'zone', parent: half.id, system: 'shield' }, box(w, half.s, w + zoneDegrees, half.n, every)));
      for (let sw = w; sw < w + zoneDegrees; sw += sectorDegrees) {
        for (let ss = half.s; ss < half.n; ss += sectorDegrees) {
          features.push(feature({
            id: `${zone}/sector:${sw + 180}-${ss + 90}`, name: `Sector ${sw},${ss}`, level: 'sector', parent: zone,
            size_reason: 'A test grid.', sources: [{ name: 'Made for tests', licence: 'CC0-1.0' }],
          }, box(sw, ss, sw + sectorDegrees, ss + sectorDegrees, every)));
        }
      }
    }
    const file = `${half.id.replace(':', '-')}.zsp.geojson`;
    const text = JSON.stringify({ type: 'FeatureCollection', zsp: '2.0', container: half.id, features });
    files[file] = text;
    return { id: half.id, name: half.name, level: half.level, file, sha256: createHash('sha256').update(text).digest('hex'), bytes: new TextEncoder().encode(text).length };
  });
  return { manifest: { zsp: '2.0', licence: 'CC-BY-4.0', containers, retired: [] }, files };
}

