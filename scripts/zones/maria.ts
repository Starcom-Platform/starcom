/**
 * The five Maria in the globe's one trace (decision D-ZR, ZR16, ZR18): Mecha Jono makes them as labels on the 0.1°
 * grid, and Starcom's vectoriser traces them in the same pass as the Terrae, so every Mare–Terra edge matches.
 *
 * Mecha Jono's files, in data/zsp2/maria/:
 *   maria-sectors-0.1.u32.bin.gz  little-endian uint32, gzip: each sea cell's Sector code (1-based), 0 elsewhere;
 *   maria-0.1.json                the manifest: `containers` (each Mare: id, name, principle, plates, sources),
 *                                 `zones` (id, name, container, system, principle, plates, countries, sources) and
 *                                 `sectors` (code, id, zone, name, and any of a Sector's fields: descriptor, edges,
 *                                 area_km2, plates, ecoregions, countries, terrain, landmarks, size_reason, sources),
 *                                 and `reserved`, Zone ids held for later. The manifest may come before the labels:
 *                                 its Zone ids are then held from the Terrae (S8), so no Terra takes one.
 *
 * Until they land, `syntheticMaria` cuts each Mare of Stage 1 into Sectors of equal area, one Zone a Mare, to prove
 * the whole set closes; it is written only to a scratch folder, never served.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { W, H } from './grid';
import { cutSectors } from './sectors';
import { outlines, type Arc, type Geometry } from './vectorise';
import { servedPlace } from '../../src/geopolitical/zones/zsp';

type Props = Record<string, unknown>;
export interface MariaInput {
  /** Each sea cell's Sector code, 1-based; 0 elsewhere. */
  labels: Uint32Array;
  containers: Array<Props & { id: string; name: string }>;
  zones: Array<Props & { id: string; name: string; container: string }>;
  sectors: Array<Props & { code: number; id: string; zone: string; name: string }>;
  synthetic: boolean;
}

/** Mecha Jono's Maria labels, when they are on the branch; null until then. */
export function readMaria(dir: string): MariaInput | null {
  const manifest = join(dir, 'maria-0.1.json'); const grid = join(dir, 'maria-sectors-0.1.u32.bin.gz');
  if (!existsSync(manifest) || !existsSync(grid)) return null;
  const labels = new Uint32Array(gunzipSync(readFileSync(grid)).buffer.slice(0));
  if (labels.length !== W * H) throw new Error(`the Maria labels hold ${labels.length} cells, not the grid's ${W * H}`);
  const m = JSON.parse(readFileSync(manifest, 'utf8')) as Omit<MariaInput, 'labels' | 'synthetic'>;
  return { labels, containers: m.containers, zones: m.zones, sectors: m.sectors, synthetic: false };
}

/** The Zone ids Mecha Jono's manifest holds, its Zones' and its `reserved`, as soon as the manifest is on the branch. */
export function mariaZoneIds(dir: string): Set<string> {
  const manifest = join(dir, 'maria-0.1.json');
  if (!existsSync(manifest)) return new Set();
  const m = JSON.parse(readFileSync(manifest, 'utf8')) as { zones?: Array<{ id: string }>; reserved?: string[] };
  return new Set([...(m.zones ?? []).map((z) => z.id), ...(m.reserved ?? [])]);
}

/** Test Maria from Stage 1's raster: one Zone a Mare, cut into Sectors of equal area. For proving coverage only. */
export function syntheticMaria(args: {
  containers: Uint32Array; land: Uint8Array; relief: Int16Array; plateOf: Uint8Array; ecoregionOf: Int32Array;
  mareIds: string[]; mareNames: string[]; say: (what: string) => void;
}): MariaInput {
  const zoneOf = new Int32Array(W * H);
  for (let c = 0; c < W * H; c++) if (args.containers[c] >= 1) zoneOf[c] = args.containers[c];
  const { sectorOf, pieces } = cutSectors({ zoneOf, land: args.land, relief: args.relief, plateOf: args.plateOf, ecoregionOf: args.ecoregionOf, say: args.say });
  const labels = new Uint32Array(W * H); for (let c = 0; c < W * H; c++) labels[c] = sectorOf[c];
  const source = [{ name: 'Made for tests', licence: 'CC0-1.0' }];
  return {
    labels, synthetic: true,
    containers: args.mareIds.map((id, k) => ({ id, name: args.mareNames[k], principle: 'A test Mare, cut into equal areas, never served.', plates: [], sources: source })),
    zones: args.mareIds.map((id, k) => ({ id: `zone:test-${id.split(':')[1]}`, name: `${args.mareNames[k]} test Zone`, container: id, system: 'basin', sources: source })),
    sectors: pieces.map((p, k) => ({
      code: k + 1, id: `zone:test-${args.mareIds[p.zone - 1].split(':')[1]}/sector:s${k + 1}`, zone: `zone:test-${args.mareIds[p.zone - 1].split(':')[1]}`,
      name: `Test Sector ${k + 1}`, edges: [{ follows: 'grid', name: 'a test cut' }], size_reason: 'A test Sector, cut for coverage only.', sources: source,
    })),
  };
}

/** Each Mare's FeatureCollection from the globe's arcs; `local` maps the globe's label to the Maria's Sector code. */
export function mariaDocs(maria: MariaInput, arcs: Arc[], local: (label: number) => number): Array<{ id: string; doc: Props }> {
  const sectorByCode = new Map(maria.sectors.map((s) => [s.code, s]));
  const zoneIndex = new Map(maria.zones.map((z, k) => [z.id, k + 1]));
  const containerIndex = new Map(maria.containers.map((c, k) => [c.id, k + 1]));
  const zoneOfCode = (code: number) => zoneIndex.get(sectorByCode.get(code)?.zone ?? '') ?? 0;
  const containerOfZone = (z: number) => containerIndex.get(maria.zones[z - 1]?.container ?? '') ?? 0;
  const sectorShapes = outlines(arcs, local);
  const zoneShapes = outlines(arcs, (g) => { const s = local(g); return s ? zoneOfCode(s) : 0; });
  const containerShapes = outlines(arcs, (g) => { const s = local(g); return s ? containerOfZone(zoneOfCode(s)) : 0; });
  // A place the trace gave no shape is a hole in the set: refuse it here, not at the reader, which drops it quietly.
  const feature = (properties: Props, geometry: Geometry | undefined) => {
    if (!geometry) throw new Error(`${String(properties.id)}: its labels traced to nothing`);
    // Only what Starcom's reader reads is served; the rest stays in Mecha Jono's manifest (ZR27).
    return { type: 'Feature', id: properties.id, properties: servedPlace({ precision: 'approximate', ...properties }), geometry };
  };
  return maria.containers.map((c, k) => {
    const features: Props[] = [feature({ ...c, level: 'mare', parent: null }, containerShapes.get(k + 1))];
    maria.zones.forEach((z, zk) => {
      if (z.container !== c.id) return;
      const { container: _container, ...rest } = z;
      features.push(feature({ ...rest, level: 'zone', parent: c.id }, zoneShapes.get(zk + 1)));
    });
    for (const s of maria.sectors) {
      if (containerOfZone(zoneOfCode(s.code)) !== k + 1) continue;
      const { code: _code, zone, ...rest } = s;
      features.push(feature({ ...rest, level: 'sector', parent: zone }, sectorShapes.get(s.code)));
    }
    return { id: c.id, doc: { type: 'FeatureCollection', zsp: '2.0', container: c.id, licence: 'CC-BY-4.0', features } };
  });
}
