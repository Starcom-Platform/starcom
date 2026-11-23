// partitionTheme.ts — ZSP 2.0's colours: the whole globe in Terrae and Maria, Zones and Sectors (decision D-ZR).
//
// Colour carries the level. A Terra takes an earth hue and a Mare a deep sea blue, so land and sea read apart at a
// glance. Each container's Zones are shades of its hue, and each Zone's Sectors shades of the Zone's (zoneTheme.ts).
// Neighbours never share a colour: containers and Zones are coloured in turn, each taking the first colour no
// neighbour already has, neighbours being places that share an edge.
//
// Kept clear of the app's meanings, as zoneTheme.ts is: no cyan (the app's own, and "selected"), not Hero Watch's
// rescue orange, and no red, which is for conflict. Colour is never the only signal: the hover and the panel name
// the place and its level.
//
// Pure, with no scene or DOM, so it is tested alone.
import * as THREE from 'three';
import type { PolygonGeometry } from '../../services/geoint/pointInPolygon';
import type { ZoneIndex } from '../zones/zsp';
import { sectorColor } from './zoneTheme';

/** A Terra's hues, in degrees: sand, olive, moss, green, sea-green, violet, orchid, umber, ochre, sage, plum, rose-clay. */
const TERRA_COLORS = [0xc9a35a, 0x9c9b4a, 0x6f9a52, 0x4f9a64, 0x4e9a86, 0x8a74c4, 0xb070b0, 0x9a6a48, 0xc0883e, 0x8aa07a, 0x7a5a8e, 0xb07a6e] as const;
/** A Mare's: navy, steel, indigo, slate and a deep blue-violet, none near the app's cyan. */
const MARE_COLORS = [0x2f5f9e, 0x4a6f9a, 0x3e4f9e, 0x5a6a8e, 0x4b4a9a] as const;
/** A Zone's steps on its container's colour: lightness, then a small turn of hue. */
const ZONE_STEPS: ReadonlyArray<readonly [number, number]> = [[0, 0], [0.12, 0.012], [-0.1, -0.012], [0.2, 0], [-0.16, 0.02], [0.06, -0.022], [-0.04, 0.028], [0.16, -0.03]];

type LngLat = [number, number];
/** A point's key, the antimeridian one line: 180° and −180° are the same meridian, where two places can meet. */
const key = (p: LngLat): string => `${(p[0] >= 179.9999 ? -180 : p[0]).toFixed(4)},${p[1].toFixed(4)}`;

/** Every segment of a geometry's rings, by a key that is the same from either end; a pole's zero-length run left out. */
function segmentKeys(geometry: PolygonGeometry): Set<string> {
  const out = new Set<string>();
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as LngLat[][][];
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0; i + 1 < ring.length; i += 1) {
        const a = ring[i], b = ring[i + 1];
        if (Math.abs(a[1]) >= 89.9999 && Math.abs(b[1]) >= 89.9999) continue;
        const ka = key(a), kb = key(b);
        if (ka !== kb) out.add(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`);
      }
    }
  }
  return out;
}

/** Which of these places share an edge: each place's neighbours, by id. */
export function neighbours(places: ReadonlyArray<{ id: string; geometry: PolygonGeometry }>): Map<string, Set<string>> {
  const bySegment = new Map<string, string[]>();
  for (const place of places) {
    for (const k of segmentKeys(place.geometry)) {
      const ids = bySegment.get(k);
      if (ids) ids.push(place.id); else bySegment.set(k, [place.id]);
    }
  }
  const out = new Map<string, Set<string>>(places.map((p) => [p.id, new Set<string>()]));
  for (const ids of bySegment.values()) {
    for (const a of ids) for (const b of ids) if (a !== b) out.get(a)!.add(b);
  }
  return out;
}

/** Each place's colour, the first of `palette` no coloured neighbour has; round the palette again when all are taken. */
export function colourInTurn(ids: readonly string[], near: Map<string, Set<string>>, palette: readonly number[]): Map<string, number> {
  const out = new Map<string, number>();
  ids.forEach((id, n) => {
    const taken = new Set([...(near.get(id) ?? [])].map((o) => out.get(o)));
    out.set(id, palette.find((c) => !taken.has(c)) ?? palette[n % palette.length]);
  });
  return out;
}

/** A Zone's colour: a step from its container's, by the step's index. */
export function zoneShade(base: number, step: number): number {
  const [dl, dh] = ZONE_STEPS[((step % ZONE_STEPS.length) + ZONE_STEPS.length) % ZONE_STEPS.length];
  return new THREE.Color(base).offsetHSL(dh, 0, dl).getHex();
}

export interface PartitionColours {
  /** Each Terra's and Mare's colour, by id. */
  containers: Map<string, number>;
  /** Each Zone's colour, by id. */
  zones: Map<string, number>;
}

/** The colours a 2.0 index is drawn in: containers by level and in turn, Zones as shades of theirs, in turn. */
export function partitionColours(index: Pick<ZoneIndex, 'containers'>): PartitionColours {
  const roots = index.containers.map((c) => c.root);
  const near = neighbours(roots);
  const terrae = colourInTurn(roots.filter((r) => r.level === 'terra').map((r) => r.id), near, TERRA_COLORS);
  const maria = colourInTurn(roots.filter((r) => r.level === 'mare').map((r) => r.id), near, MARE_COLORS);
  const containers = new Map([...terrae, ...maria]);
  const zones = new Map<string, number>();
  for (const container of index.containers) {
    const base = containers.get(container.root.id)!;
    const zoneRoots = container.zones.map((z) => z.root);
    const zoneNear = neighbours(zoneRoots);
    const steps = colourInTurn(zoneRoots.map((z) => z.id), zoneNear, ZONE_STEPS.map((_, i) => i));
    for (const z of zoneRoots) zones.set(z.id, zoneShade(base, steps.get(z.id) ?? 0));
  }
  return { containers, zones };
}

/** The shades of a Zone's colour its Sectors step through (zoneTheme.ts's): neighbouring Sectors take different steps. */
const SECTOR_STEPS = [0, 1, 2, 3, 4, 5] as const;

export interface PartitionFills extends PartitionColours {
  /** Each Sector's fill, a shade of its Zone's colour, no two neighbours alike. */
  sectors: Map<string, number>;
}

const cache = new WeakMap<object, PartitionFills>();

/** Every colour a 2.0 index is drawn in, worked out once per index: the globe and the panel use the same. */
export function partitionFills(index: Pick<ZoneIndex, 'containers'>): PartitionFills {
  const known = cache.get(index);
  if (known) return known;
  const colours = partitionColours(index);
  const sectors = new Map<string, number>();
  for (const container of index.containers) {
    for (const zone of container.zones) {
      const base = colours.zones.get(zone.root.id)!;
      const steps = colourInTurn(zone.sectors.map((s) => s.id), neighbours(zone.sectors), SECTOR_STEPS);
      for (const s of zone.sectors) sectors.set(s.id, sectorColor(base, steps.get(s.id) ?? 0));
    }
  }
  const fills = { ...colours, sectors };
  cache.set(index, fills);
  return fills;
}

/** The colour a 2.0 place is drawn in: a Sector's fill, a Zone's colour, or a Terra's or Mare's. */
export function partitionColourOf(index: Pick<ZoneIndex, 'containers'>, id: string): number | undefined {
  const f = partitionFills(index);
  return f.sectors.get(id) ?? f.zones.get(id) ?? f.containers.get(id);
}
