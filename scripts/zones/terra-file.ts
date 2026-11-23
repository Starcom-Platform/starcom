/**
 * A Terra's ZSP 2.0 file from its label grids (decision D-ZR, ZR7, ZR9): each Sector named, its IAU landform, its
 * plates, ecoregions and what each of its edges follows read from the grids; then every level traced from the same
 * arcs (vectorise.ts) into one FeatureCollection, the container first, then its Zones, then their Sectors.
 */
import { W, H, latOf, lonOf, cellKm2 } from './grid';
import { neighbours, SECTOR_MIN_KM2, SECTOR_MAX_KM2 } from './sectors';
import { outlines, type Arc, type Geometry } from './vectorise';

export interface ZspSourceOut { name: string; licence: string; url?: string; for?: string }
export interface EdgeOut { follows: 'plate' | 'divide' | 'ecoregion' | 'grid' | 'front' | 'margin'; name: string; source?: string }

/** What the grids say about each cell, for naming and describing the Sectors. */
export interface Grids {
  sectorOf: Int32Array; zoneOf: Int32Array; land: Uint8Array; relief: Int16Array;
  plateOf: Uint8Array; plateNames: string[];           // plateOf is 1-based into plateNames
  basinOf: Int32Array;
  ecoregionOf: Int32Array; ecoregions: Array<{ name: string; biome: string }>;   // 1-based
  marineOf: Int32Array; marineNames: string[];          // 1-based; 0 none
  lake: Uint8Array;
  countryOf: Int32Array; countryCodes: string[];        // 1-based ISO 3166-1 alpha-2, lower case
  /** Named places (Natural Earth's regions, lakes and seas), each grid 1-based into its names. */
  landmarks: Array<{ of: Int32Array; names: string[] }>;
}

/** RESOLVE's biomes in a few plain words, for a Sector's terrain. */
const TERRAIN_OF_BIOME: Record<string, string> = {
  'Tropical & Subtropical Moist Broadleaf Forests': 'tropical moist forest', 'Tropical & Subtropical Dry Broadleaf Forests': 'tropical dry forest',
  'Tropical & Subtropical Coniferous Forests': 'tropical conifer forest', 'Temperate Broadleaf & Mixed Forests': 'temperate broadleaf forest',
  'Temperate Conifer Forests': 'temperate conifer forest', 'Boreal Forests/Taiga': 'boreal forest',
  'Tropical & Subtropical Grasslands, Savannas & Shrublands': 'savanna', 'Temperate Grasslands, Savannas & Shrublands': 'steppe',
  'Flooded Grasslands & Savannas': 'flooded grassland', 'Montane Grasslands & Shrublands': 'montane grassland', 'Tundra': 'tundra',
  'Mediterranean Forests, Woodlands & Scrub': 'Mediterranean woodland', 'Deserts & Xeric Shrublands': 'desert', 'Mangroves': 'mangrove',
  'Rock and Ice': 'rock and ice',
};

export interface SectorFacts {
  slug: string; name: string; descriptor: string; km2: number; plates: string[]; ecoregions: string[];
  edges: EdgeOut[]; sizeReason?: string; countries: string[]; terrain: string[]; landmarks: string[];
}

const slugOf = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const top = <K>(m: Map<K, number>): K | undefined => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

/**
 * Each Sector's facts. `outsideEdge` names an edge to a cell outside the Terra; `zoneName` names a Zone, for the
 * edges a Sector shares with another Zone.
 */
export function describeSectors(
  g: Grids, count: number, zoneName: (zone: number) => string, outsideEdge: (cell: number, outside: number) => EdgeOut,
  /** Names a Sector takes from a point it holds, as a Zone's reference names its Sectors; the first point held wins. */
  namedPoints: ReadonlyArray<{ lat: number; lon: number; name: string }> = [],
): SectorFacts[] {
  type Acc = {
    km2: number; landKm2: number; lakeKm2: number; elev: number; elev2: number; landCells: number;
    plates: Map<number, number>; eco: Map<number, number>; marine: Map<number, number>; biome: Map<string, number>;
    lat: number; lon: number; edges: Map<string, EdgeOut>; zone: number; island: boolean;
    countries: Map<number, number>; marks: Map<string, number>;
  };
  const acc: Acc[] = Array.from({ length: count + 1 }, () => ({
    km2: 0, landKm2: 0, lakeKm2: 0, elev: 0, elev2: 0, landCells: 0, plates: new Map(), eco: new Map(), marine: new Map(), biome: new Map(),
    lat: 0, lon: 0, edges: new Map(), zone: 0, island: true, countries: new Map(), marks: new Map(),
  }));
  // How big each named place is, to keep only those a Sector holds a good part of.
  const markKm2 = new Map<string, number>();
  for (let c = 0; c < W * H; c++) {
    if (!g.sectorOf[c]) continue;
    const k = cellKm2(Math.floor(c / W));
    for (const m of g.landmarks) if (m.of[c]) { const n = m.names[m.of[c] - 1]; markKm2.set(n, (markKm2.get(n) ?? 0) + k); }
  }
  const add = (a: Acc, e: EdgeOut) => { const k = `${e.follows}|${e.name}`; if (!a.edges.has(k)) a.edges.set(k, e); };
  for (let c = 0; c < W * H; c++) {
    const s = g.sectorOf[c]; if (!s) continue;
    const a = acc[s]; const j = Math.floor(c / W); const k = cellKm2(j);
    a.km2 += k; a.zone = g.zoneOf[c]; a.lat += latOf(j) * k; a.lon += lonOf(c - j * W) * k;
    if (g.land[c]) {
      a.landKm2 += k; a.landCells++; a.elev += g.relief[c]; a.elev2 += g.relief[c] * g.relief[c];
      if (g.lake[c]) a.lakeKm2 += k;
    }
    if (g.plateOf[c]) a.plates.set(g.plateOf[c], (a.plates.get(g.plateOf[c]) ?? 0) + k);
    if (g.ecoregionOf[c]) {
      a.eco.set(g.ecoregionOf[c], (a.eco.get(g.ecoregionOf[c]) ?? 0) + k);
      const biome = g.ecoregions[g.ecoregionOf[c]].biome; a.biome.set(biome, (a.biome.get(biome) ?? 0) + k);
    }
    if (!g.land[c] && g.marineOf[c]) a.marine.set(g.marineOf[c], (a.marine.get(g.marineOf[c]) ?? 0) + k);
    if (g.countryOf[c]) a.countries.set(g.countryOf[c], (a.countries.get(g.countryOf[c]) ?? 0) + k);
    for (const m of g.landmarks) if (m.of[c]) { const n = m.names[m.of[c] - 1]; a.marks.set(n, (a.marks.get(n) ?? 0) + k); }
    for (const n of neighbours(c)) {
      if (n < 0 || g.sectorOf[n] === s) continue;
      if (!g.sectorOf[n]) { add(a, outsideEdge(c, n)); if (g.land[n]) a.island = false; continue; }
      a.island = false;
      if (g.zoneOf[n] !== g.zoneOf[c]) add(a, { follows: 'divide', name: `the edge of the ${zoneName(g.zoneOf[n])} Zone`, source: 'USGS, Geologic Provinces of Africa' });
      else if (g.plateOf[n] !== g.plateOf[c] && g.plateOf[n] && g.plateOf[c]) add(a, { follows: 'plate', name: `the ${[g.plateNames[g.plateOf[c] - 1], g.plateNames[g.plateOf[n] - 1]].sort().join('–')} plate boundary`, source: 'PB2002' });
      else if (g.land[c] && g.land[n] && g.basinOf[c] && g.basinOf[n] && g.basinOf[c] !== g.basinOf[n]) add(a, { follows: 'divide', name: 'a drainage divide', source: 'ETOPO 2022' });
      else if (g.ecoregionOf[c] !== g.ecoregionOf[n] && g.ecoregionOf[c] && g.ecoregionOf[n]) add(a, { follows: 'ecoregion', name: `the edge of the ${g.ecoregions[g.ecoregionOf[n]].name}`, source: 'RESOLVE Ecoregions 2017' });
      else add(a, { follows: 'grid', name: g.land[c] || g.land[n] ? 'an equal-area cut' : 'the open sea, cut where nothing divides it' });
    }
  }

  // Names: a sea's by its water body, land's by its ecoregion; two alike in a Zone told apart by where they lie.
  const facts: SectorFacts[] = [];
  const base: string[] = [];
  const namedTaken = new Set<number>();
  for (let s = 1; s <= count; s++) {
    const a = acc[s];
    const sea = a.landKm2 < a.km2 / 2;
    const marine = top(a.marine); const eco = top(a.eco);
    base.push(sea && marine ? g.marineNames[marine - 1] : eco ? g.ecoregions[eco].name : sea ? 'Open sea' : 'Unnamed land');
  }
  // A named point's Sector takes its name: the reference Zone's own words (the handoff, 17 October).
  for (const p of namedPoints) {
    const c = Math.floor((90 - p.lat) / 0.1) * W + Math.floor((p.lon + 180) / 0.1);
    const s = g.sectorOf[c];
    if (s && !namedTaken.has(s)) { base[s - 1] = p.name; namedTaken.add(s); }
  }
  const names = [...base];
  const byZoneName = new Map<string, number[]>();
  base.forEach((n, k) => { const key = `${acc[k + 1].zone}|${n}`; const m = byZoneName.get(key); if (m) m.push(k); else byZoneName.set(key, [k]); });
  for (const ks of byZoneName.values()) {
    if (ks.length < 2) continue;
    const at = ks.map((k) => ({ k, lat: acc[k + 1].lat / acc[k + 1].km2, lon: acc[k + 1].lon / acc[k + 1].km2 }));
    const latSpan = Math.max(...at.map((x) => x.lat)) - Math.min(...at.map((x) => x.lat));
    const lonSpan = Math.max(...at.map((x) => x.lon)) - Math.min(...at.map((x) => x.lon));
    const byLat = latSpan >= lonSpan;
    at.sort((x, y) => (byLat ? y.lat - x.lat : x.lon - y.lon));
    const words = byLat ? ['north', 'south'] : ['west', 'east'];
    at.forEach((x, idx) => {
      const where = at.length === 2 ? words[idx] : at.length === 3 ? [words[0], 'central', words[1]][idx] : `${idx + 1} of ${at.length}, ${byLat ? 'north to south' : 'west to east'}`;
      names[x.k] = `${base[x.k]}, ${where}`;
    });
  }
  const slugs = new Map<string, number>();
  for (let s = 1; s <= count; s++) {
    const a = acc[s];
    const mean = a.landCells ? a.elev / a.landCells : 0;
    const sd = a.landCells ? Math.sqrt(Math.max(0, a.elev2 / a.landCells - mean * mean)) : 0;
    const share = (biome: string) => (a.biome.get(biome) ?? 0) / a.km2;
    const descriptor = a.landKm2 < a.km2 / 2 ? (a.island && a.landKm2 > 0 ? 'Insulae' : 'Sinus')
      : a.island && a.km2 < SECTOR_MIN_KM2 ? 'Insulae'
        : a.lakeKm2 > a.landKm2 * 0.3 ? 'Lacus'
          : share('Flooded Grasslands & Savannas') >= 0.4 ? 'Palus'
            : mean >= 1800 || (mean >= 1200 && sd >= 450) ? 'Montes'
              : mean >= 900 ? 'Planum'
                : sd >= 300 ? 'Colles'
                  : share('Deserts & Xeric Shrublands') >= 0.6 ? 'Vastitas'
                    : mean < 400 ? 'Planitia' : 'Regio';
    let slug = slugOf(names[s - 1]);
    const key = `${a.zone}|${slug}`; const seen = (slugs.get(key) ?? 0) + 1; slugs.set(key, seen);
    if (seen > 1) slug = `${slug}-${seen}`;
    const sizeReason = a.km2 < SECTOR_MIN_KM2 && a.island ? 'An island group, as small as its land and shelf: nothing joins it to a neighbour.'
      : a.km2 < SECTOR_MIN_KM2 || a.km2 > SECTOR_MAX_KM2 ? 'Left by the cut as it is, for review.' : undefined;
    facts.push({
      slug, name: names[s - 1], descriptor, km2: a.km2,
      plates: [...a.plates.entries()].sort((x, y) => y[1] - x[1]).filter(([, k]) => k > a.km2 * 0.02).map(([p]) => g.plateNames[p - 1]),
      ecoregions: [...a.eco.entries()].sort((x, y) => y[1] - x[1]).filter(([, k]) => k > a.km2 * 0.05).map(([e]) => g.ecoregions[e].name),
      edges: [...a.edges.values()],
      ...(sizeReason ? { sizeReason } : {}),
      countries: [...a.countries.entries()].sort((x, y) => y[1] - x[1]).filter(([, k]) => k > a.km2 * 0.01).map(([n]) => g.countryCodes[n - 1]),
      terrain: [...new Set([
        ...[...a.biome.entries()].sort((x, y) => y[1] - x[1]).filter(([, k]) => k > a.km2 * 0.1).map(([b]) => TERRAIN_OF_BIOME[b] ?? b.toLowerCase()),
        ...(a.landKm2 < a.km2 * 0.9 ? ['sea'] : []), ...(a.lakeKm2 > a.km2 * 0.05 ? ['lakes'] : []),
      ])],
      // A named place the Sector holds most of, or that fills a tenth of it.
      landmarks: [...a.marks.entries()]
        .filter(([n, k]) => k > (markKm2.get(n) ?? Infinity) * 0.5 || k > a.km2 * 0.1)
        .sort((x, y) => y[1] - x[1]).slice(0, 4).map(([n]) => n),
    });
  }
  return facts;
}

/**
 * The container's FeatureCollection, every level outlined from the globe's one set of arcs (traced once for every
 * container), so neighbouring containers share every edge vertex for vertex. `local` maps the globe's label of a
 * Sector to this container's own number for it, 1-based, or 0 for another container's.
 */
export function containerDoc(args: {
  container: { id: string; name: string; level: 'terra' | 'mare'; principle: string; plates: string[]; sources: ZspSourceOut[] };
  zones: Array<{ id: string; name: string; system: string; principle: string; plates: string[]; countries: string[]; sources: ZspSourceOut[] }>;
  arcs: Arc[]; local: (label: number) => number; sectorZone: number[]; facts: SectorFacts[]; sectorSources: ZspSourceOut[];
}): { doc: Record<string, unknown>; points: number } {
  const { container, zones, arcs, local, sectorZone, facts, sectorSources } = args;
  const sectorShapes = outlines(arcs, local);
  const zoneShapes = outlines(arcs, (g) => { const s = local(g); return s ? sectorZone[s] : 0; });
  const whole = outlines(arcs, (g) => (local(g) ? 1 : 0)).get(1);
  if (!whole) throw new Error('the container traced to nothing');
  let points = 0;
  const count = (g: Geometry) => { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (const p of polys) for (const r of p) points += r.length; };
  const feature = (properties: Record<string, unknown>, geometry: Geometry) => { count(geometry); return { type: 'Feature', id: properties.id, properties, geometry }; };
  const features = [
    feature({ id: container.id, name: container.name, level: container.level, parent: null, precision: 'approximate', principle: container.principle, plates: container.plates, sources: container.sources }, whole),
    ...zones.map((z, k) => feature({ id: z.id, name: z.name, level: 'zone', parent: container.id, precision: 'approximate', system: z.system, principle: z.principle, plates: z.plates, countries: z.countries, sources: z.sources }, zoneShapes.get(k + 1)!)),
    ...facts.map((f, k) => {
      const zone = zones[sectorZone[k + 1] - 1];
      return feature({
        id: `${zone.id}/sector:${f.slug}`, name: f.name, level: 'sector', parent: zone.id, precision: 'approximate',
        descriptor: f.descriptor, area_km2: Math.round(f.km2), plates: f.plates, ecoregions: f.ecoregions, edges: f.edges,
        countries: f.countries, terrain: f.terrain, landmarks: f.landmarks,
        ...(f.sizeReason ? { size_reason: f.sizeReason } : {}), sources: sectorSources,
      }, sectorShapes.get(k + 1)!);
    }),
  ];
  return { doc: { type: 'FeatureCollection', zsp: '2.0', container: container.id, licence: 'CC-BY-4.0', features }, points };
}
