/**
 * ZSP 2.0, Stage 1: the land–sea line at the continental margin, on the 0.1° grid (decision D-ZR, ZR4, ZR16–ZR18;
 * docs/missions/01-architecture-decisions/zones-reslice.md).
 *
 *   npx tsx scripts/zones/build-container-mask.ts <data dir> <out dir>
 *
 * The data dir holds what the record's sources give (licences in zones-reslice.md, "Sources"):
 *   ne/ne_10m_land, ne_10m_minor_islands, ne_10m_antarctic_ice_shelves_polys (.geojson; Natural Earth, public
 *   domain): the dry land;
 *   etopo/etopo2022-0.1.i16: ETOPO 2022's 60″ ice-surface relief (NOAA NCEI, CC0), every sixth sample from NOAA's
 *   ERDDAP, metres as int16 on this grid: the depths. Natural Earth's own 2,000 m layer, which Mecha Jono's draft
 *   used, marks the Arctic shelves, Hudson Bay, the Baltic and the Caspian deeper than 2,000 m (ETOPO: the Barents
 *   Sea −158 m, Hudson Bay −142 m), so the line takes ETOPO's depths, as ZR17 asks it be checked against;
 *   ContinentalPolygons/.../Global_EarthByte_GPlates_PresentDay_ContinentalPolygons.shp (EarthByte, Müller et al.
 *   2019, CC BY 3.0).
 *
 * The rules, in order:
 * 1. A continent's side runs to its margin: what is shallower than 2,000 m inside EarthByte's continental polygons and
 *    joined to one of the six continents (ZR4).
 * 2. A detached fragment keeps only its dry land and its shelf, shallower than 200 m (ZR18): New Zealand, New
 *    Caledonia, Madagascar, the Seychelles; its submerged plateau is at sea. Island arcs, and the volcanic plateaus the
 *    polygons count as continental ("loose", their README says), are at sea with their islands (S7).
 * 3. A mostly enclosed sea belongs to the lands around it: deep water reached from the open ocean only through straits
 *    between lands, or islands, narrower than about 300 km (an opening by 150 km from five seeds, one in each ocean;
 *    a seamount or a ridge under water closes nothing), with the owner's own calls over the rule (the seas listed in
 *    Mecha Jono's thread of 24 Oct).
 * 4. The sea is what the five oceans reach through all that is left, ocean islands included; anything unreached
 *    (inland water) is land.
 *
 * Then the sea is split into the five Maria (ZR16, the owner's lines of 24 Oct): Mare Australe from Antarctica to
 * the Polar Front (Park and Durand 2019, CC BY 4.0, in fronts/polar-front.json), the Kerguelen Plateau north of the
 * Fawn Trough bent out of it into Indicum; Atlanticum and Indicum parted along the Agulhas–Falkland Fracture Zone and
 * the Agulhas Ridge, Indicum and Pacificum along the Tasman Fracture Zone, Pacificum and Atlanticum at Cape Horn's
 * meridian, Atlanticum and Arcticum across the Fram Strait. Lines from approximate points are marked so, for review.
 *
 * Cells: 3,600 × 1,800, row 0 the northernmost (centre 89.95° N), column 0 from −180° (centre −179.95°), each cell
 * decided at its centre. Out: `containers-0.1.u32.bin.gz` (little-endian uint32 codes, gzip), its sidecar with the
 * code list, and a preview map.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  W, H, CELL, KM_PER_DEG, lonOf, latOf, colOf, rowOf, newMask, fillRings, fillGeoJson, readShapefile, flood, components,
  within, drawLine, writePng, type Ring, type Mask,
} from './grid';

/**
 * Polygons EarthByte counts as continental that are not, for this line: volcanic plateaus and intra-oceanic arcs
 * (their README: "continental" includes "volcanically-modified oceanic crust (including island arcs)").
 */
const NOT_CONTINENTAL = new Set([
  'Kerguelen Plateau', 'Elan Bank', 'Sandwich Plate', 'New Hebrides', 'Vitiaz Trench', 'Lau-Colville Ridge', 'Kermadec Ridge',
  'Tonga Ridge', 'Yap Arc', 'Southern Palau Arc', 'Palau Kyushu Ridge', 'Oki Daito Ridge', 'Mariana Arc, Philippine Sea',
  'Mariana-Caroline Arc', 'West Mariana Remnant Arc', 'Izu-Bonin Arc', 'Izu-Bonin Remnant Arc', 'Fiji', 'Java Trench',
]);

/** Each ocean's seed, and the six continents', for joining and reaching (lat, lon). */
const OCEAN_SEEDS: Array<[number, number]> = [[0, -140], [0, -25], [-20, 75], [-60, 0], [86, 30]];
const CONTINENT_SEEDS: Array<[number, number]> = [[5, 20], [55, 90], [45, -100], [-15, -60], [-25, 135], [-80, 0]];

/**
 * The owner's calls (Mecha Jono's thread, 24 Oct) over rule 3: water forced to sea, or to its lands. A forced sea is
 * only let through, so a rough box does; a forced land follows its arc, so no open ocean goes with it. Rings in
 * [lon, lat].
 */
const box = (s: number, w: number, n: number, e: number): Ring => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const FORCED_SEA: Array<{ name: string; ring: Ring }> = [
  { name: 'the Scotia Sea', ring: box(-62, -60, -52, -25) },
  { name: 'the Gulf of Oman', ring: box(22, 56, 26.5, 62) },
  { name: 'the Mozambique Channel', ring: box(-26, 33, -11, 45) },
  { name: 'the Tasman Sea', ring: box(-47, 147, -28, 168) },
  { name: 'the Fram Strait', ring: box(76, -20, 83, 15) },
];
const FORCED_LAND: Array<{ name: string; ring: Ring }> = [
  // West of Bab-el-Mandeb's line to the line from Ras Asir (Guardafui) to Ras Fartak.
  { name: 'the Gulf of Aden', ring: [[43.3, 12.6], [51.28, 11.83], [52.23, 15.63], [43.3, 15.63], [43.3, 12.6]] },
  { name: 'the South China Sea', ring: [[105, 3], [117, 3], [119.5, 7.5], [120.6, 13.5], [120.6, 18.5], [121.0, 21.9], [120.7, 23.5], [105, 23.5], [105, 3]] },
  // North and west of the Kuril arc.
  { name: 'the Sea of Okhotsk', ring: [[135, 43], [145.5, 43.4], [146.5, 43.8], [148.3, 45.2], [150.4, 46.2], [152.3, 47.2], [154.0, 48.6], [155.5, 50.0], [156.7, 50.9], [156.7, 62], [135, 62], [135, 43]] },
  // North of the Aleutian arc and the Komandorski Islands.
  { name: 'the Bering Sea', ring: [[162.5, 56.3], [165.8, 55.2], [167.9, 54.6], [172.6, 52.9], [177.0, 51.6], [180, 51.6], [180, 66.5], [162.5, 66.5], [162.5, 56.3]] },
  { name: 'the Bering Sea, east of 180°', ring: [[-180, 51.6], [-176.5, 51.6], [-172.5, 52.2], [-168.0, 53.2], [-164.8, 54.3], [-162.5, 55.0], [-157.5, 57.0], [-157.5, 66.5], [-180, 66.5], [-180, 51.6]] },
];
/**
 * Continental islands EarthByte's polygons leave out: dry land of a continent's crust all the same, and so a
 * fragment's (ZR18).
 */
const CONTINENTAL_ISLANDS: Array<{ name: string; ring: Ring }> = [
  { name: 'Socotra', ring: box(12.0, 52.0, 12.9, 54.7) },
  { name: 'South Georgia', ring: box(-55.0, -38.5, -53.6, -35.5) },
];
/** Submerged plateaus joined to a continent's margin that lie at sea (ZR18 names them): out of the land side. */
const PLATEAUS_AT_SEA: Array<{ name: string; ring: Ring }> = [
  { name: 'the Rockall–Hatton plateau', ring: box(54.2, -25, 62, -12.2) },
];
const ringMask = (rings: Array<{ ring: Ring }>) => { const m = newMask(); for (const { ring } of rings) fillRings(m, [ring]); return m; };


/** The Maria, their codes and seeds (lat, lon); 0 is the land side, its Terrae drawn with them. */
const MARIA = [
  { code: 1, id: 'mare:pacificum', name: 'Mare Pacificum', seed: [0, -140] as [number, number], rgb: [120, 170, 225] },
  { code: 2, id: 'mare:atlanticum', name: 'Mare Atlanticum', seed: [0, -25] as [number, number], rgb: [240, 165, 140] },
  { code: 3, id: 'mare:indicum', name: 'Mare Indicum', seed: [-20, 75] as [number, number], rgb: [125, 205, 175] },
  { code: 4, id: 'mare:arcticum', name: 'Mare Arcticum', seed: [86, 30] as [number, number], rgb: [240, 200, 110] },
  { code: 5, id: 'mare:australe', name: 'Mare Australe', seed: [-65, 0] as [number, number], rgb: [235, 175, 200] },
];
/**
 * The lines between the Maria north of the Polar Front, [lon, lat]. Each runs from land past the Front, so it closes;
 * the Front's own latitude there is read from the data. `approximate`: drawn from approximate points, pending review.
 */
const LINES: Array<{ name: string; between: string; points: Ring; approximate: boolean; source: string }> = [
  { name: 'the Agulhas–Falkland Fracture Zone and the Agulhas Ridge', between: 'Atlanticum | Indicum', approximate: true,
    source: 'approximate points along the fracture zone (GSFML traces, Matthews et al. 2011) and the ridge; pending review',
    points: [[20.0, -34.6], [19.8, -36.5], [17.7, -38.8], [11.7, -41.3], [7.5, -43.0], [7.5, -50.5]] },
  { name: 'the Tasman Fracture Zone', between: 'Indicum | Pacificum', approximate: true,
    source: 'approximate points, 145.1–146.4° E (Hasterok et al. 2022, as Mecha Jono read it; GSFML traces); pending review',
    points: [[146.6, -43.4], [146.3, -46.5], [145.8, -50.0], [145.4, -54.0]] },
  { name: 'Cape Horn\'s meridian across the Drake Passage', between: 'Pacificum | Atlanticum', approximate: false,
    source: 'Cape Horn, 67.27° W', points: [[-67.27, -55.9], [-67.27, -60.5]] },
  { name: 'the Fram Strait at 79° N', between: 'Atlanticum | Arcticum', approximate: false,
    source: 'the strait between Greenland and Svalbard', points: [[-21, 79.0], [13, 79.0]] },
];
/** Kerguelen north of the Fawn Trough: in Indicum, though south of the Polar Front (the owner, 24 Oct). Approximate. */
const KERGUELEN_BEND: Ring = [[62, -46], [88, -46], [88, -54.5], [81, -57.2], [78.5, -57.6], [76, -57.0], [72, -55.8], [66, -54.2], [62, -52.5], [62, -46]];


/** Gives every sea cell with no Mare the Mare of its nearest labelled sea cell (breadth first, 4-neighbours). */
function fillFromNeighbours(labels: Uint32Array, sea: Mask): number {
  let queue: number[] = [];
  for (let c = 0; c < W * H; c++) if (sea[c] && labels[c]) queue.push(c);
  let filled = 0;
  while (queue.length) {
    const next: number[] = [];
    for (const c of queue) {
      const j = Math.floor(c / W); const i = c - j * W;
      for (const n of [j > 0 ? c - W : -1, j < H - 1 ? c + W : -1, j * W + ((i + 1) % W), j * W + ((i + W - 1) % W)]) {
        if (n >= 0 && sea[n] && !labels[n]) { labels[n] = labels[c]; filled++; next.push(n); }
      }
    }
    queue = next;
  }
  return filled;
}

const seedCells = (seeds: Array<[number, number]>) => seeds.map(([la, lo]) => rowOf(la) * W + colOf(lo));

function main(): void {
  const [dataDir, outDir] = process.argv.slice(2);
  if (!dataDir || !outDir) throw new Error('usage: build-container-mask.ts <data dir> <out dir>');
  const ne = (f: string) => join(dataDir, 'ne', `${f}.geojson`);
  const t0 = Date.now();
  const say = (what: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${what}`);

  const land = fillGeoJson(ne('ne_10m_land'));
  fillGeoJson(ne('ne_10m_minor_islands'), land);
  fillGeoJson(ne('ne_10m_antarctic_ice_shelves_polys'), land);
  const relief = new Int16Array(readFileSync(join(dataDir, 'etopo', 'etopo2022-0.1.i16')).buffer.slice(0));
  if (relief.length !== W * H) throw new Error(`ETOPO grid has ${relief.length} cells, not ${W * H}`);
  const deeper200 = newMask(); const deeper2000 = newMask();
  for (let c = 0; c < W * H; c++) { deeper200[c] = relief[c] < -200 ? 1 : 0; deeper2000[c] = relief[c] < -2000 ? 1 : 0; }
  const continental = ringMask(CONTINENTAL_ISLANDS); const arcs = newMask();
  let kept = 0; let left = 0;
  for (const { rings, attrs } of readShapefile(join(dataDir, 'ContinentalPolygons/ContinentalPolygons/Shapefile/Global_EarthByte_GPlates_PresentDay_ContinentalPolygons'))) {
    if (attrs.TYPE === 'IA' || NOT_CONTINENTAL.has(attrs.NAME)) { fillRings(arcs, rings); left++; } else { fillRings(continental, rings); kept++; }
  }
  say(`rasterised: ${kept} continental polygons, ${left} arcs and volcanic plateaus left at sea`);

  // Dry land joined to a continent's dry land, over land or its shelf (shallower than 200 m), is the continent's,
  // where its polygon stops short: the Niger delta, built out over ocean crust, and Bioko on Cameroon's shelf.
  const landParts = components(land);
  const onShelf = newMask();
  for (let c = 0; c < W * H; c++) onShelf[c] = land[c] || !deeper200[c] ? 1 : 0;
  const shelfOf = components(onShelf);
  const continentalShelves = new Set<number>();
  for (let c = 0; c < W * H; c++) if (land[c] && continental[c] && !arcs[c]) continentalShelves.add(shelfOf[c]);
  const continentalLand = newMask();
  for (let c = 0; c < W * H; c++) if (land[c] && continentalShelves.has(shelfOf[c])) continentalLand[c] = 1;
  const atSea = ringMask(PLATEAUS_AT_SEA);

  // 1. Continents to their margins.
  const margin = newMask();
  for (let c = 0; c < W * H; c++) {
    margin[c] = continentalLand[c] || (continental[c] && !arcs[c] && !deeper2000[c] && !atSea[c]) ? 1 : 0;
  }
  const marginParts = components(margin);
  const continents = new Set(seedCells(CONTINENT_SEEDS).map((c) => marginParts[c]).filter(Boolean));
  const side = newMask();
  for (let c = 0; c < W * H; c++) if (continents.has(marginParts[c])) side[c] = 1;
  // 2. Fragments: dry land and its shelf.
  const fragmentShelf = newMask();
  for (let c = 0; c < W * H; c++) if (margin[c] && !side[c] && (land[c] || !deeper200[c])) fragmentShelf[c] = 1;
  const shelfParts = components(fragmentShelf);
  const withLand = new Set<number>();
  for (let c = 0; c < W * H; c++) if (shelfParts[c] && continentalLand[c]) withLand.add(shelfParts[c]);
  let fragmentCells = 0;
  for (let c = 0; c < W * H; c++) if (withLand.has(shelfParts[c])) { side[c] = 1; fragmentCells++; }
  say(`continents ${continents.size} of 6 joined; fragments: ${withLand.size} with dry land, ${fragmentCells} cells`);

  // 3. Enclosed seas: water behind straits narrower than about 300 km. All water off the land side, at any depth: the
  // Greenland and Norwegian seas reach the Atlantic over the shallow Greenland–Scotland Ridge, by no deep channel.
  const open = newMask();
  for (let c = 0; c < W * H; c++) open[c] = !side[c] && !land[c] ? 1 : 0;
  // The shores: the land side and every island. Under water, shallow or not, is no shore.
  const notOpen = newMask();
  for (let c = 0; c < W * H; c++) notOpen[c] = side[c] || land[c] ? 1 : 0;
  const nearShore = within(notOpen, 150);
  const core = newMask();
  for (let c = 0; c < W * H; c++) core[c] = open[c] && !nearShore[c] ? 1 : 0;
  const reachedCore = flood(core, seedCells(OCEAN_SEEDS));
  const opened = within(reachedCore, 150);
  const enclosed = newMask();
  for (let c = 0; c < W * H; c++) enclosed[c] = open[c] && !opened[c] ? 1 : 0;
  const forcedSea = ringMask(FORCED_SEA); const forcedLand = ringMask(FORCED_LAND);
  for (let c = 0; c < W * H; c++) {
    if (forcedSea[c]) enclosed[c] = 0;
    if (open[c] && forcedLand[c]) enclosed[c] = 1;
  }
  // An enclosed sea belongs to the lands around it (ZR4): water hemmed in by ocean islands alone, touching no land
  // side, is the islands' sea, not land. Found drawing Terra Africana: the channels between the Cape Verde, Canary
  // and Azores islands, and their kin, had gone to the land side.
  const pockets = components(enclosed);
  const touchesLand = new Set<number>();
  for (let c = 0; c < W * H; c++) {
    if (!pockets[c]) continue;
    const j = Math.floor(c / W); const i = c - j * W;
    for (const n of [j > 0 ? c - W : -1, j < H - 1 ? c + W : -1, j * W + ((i + 1) % W), j * W + ((i + W - 1) % W)]) if (n >= 0 && side[n]) touchesLand.add(pockets[c]);
  }
  let islandPockets = 0;
  for (let c = 0; c < W * H; c++) if (pockets[c] && !touchesLand.has(pockets[c])) { enclosed[c] = 0; islandPockets++; }
  say(`enclosed seas found; ${islandPockets} cells between ocean islands alone left at sea`);
  if (process.env.ZSP_DEBUG) {
    mkdirSync(outDir, { recursive: true });
    for (const [name, m] of Object.entries({ core, reachedCore })) writePreview(join(outDir, `debug-${name}.png`), m, newMask(), newMask(), newMask());
  }

  // 4. The sea: what the oceans reach through everything that is left.
  const pass = newMask();
  for (let c = 0; c < W * H; c++) pass[c] = !side[c] && !enclosed[c] ? 1 : 0;
  const sea = flood(pass, seedCells(OCEAN_SEEDS));
  let seaCells = 0; let seaKm2 = 0; let landKm2 = 0;
  for (let c = 0; c < W * H; c++) {
    const j = Math.floor(c / W);
    const km2 = (CELL * KM_PER_DEG) ** 2 * Math.cos((latOf(j) * Math.PI) / 180);
    if (sea[c]) { seaCells++; seaKm2 += km2; } else landKm2 += km2;
  }
  say(`sea ${seaCells} cells, ${(seaKm2 / 1e6).toFixed(1)} M km²; land side ${(landKm2 / 1e6).toFixed(1)} M km²`);

  // Dry land at sea (ocean islands and arcs), the larger ones, for the record to name.
  const islandsAtSea: Array<{ lat: number; lon: number; km2: number }> = [];
  {
    const area = new Map<number, { km2: number; lat: number; lon: number }>();
    for (let c = 0; c < W * H; c++) {
      if (!(sea[c] && land[c])) continue;
      const j = Math.floor(c / W); const i = c - j * W; const part = landParts[c];
      const km2 = (CELL * KM_PER_DEG) ** 2 * Math.cos((latOf(j) * Math.PI) / 180);
      const held = area.get(part) ?? { km2: 0, lat: latOf(j), lon: lonOf(i) };
      held.km2 += km2; area.set(part, held);
    }
    for (const a of area.values()) if (a.km2 >= 300) islandsAtSea.push({ lat: +a.lat.toFixed(1), lon: +a.lon.toFixed(1), km2: Math.round(a.km2) });
    islandsAtSea.sort((a, b) => b.km2 - a.km2);
    say(`dry land at sea, ${islandsAtSea.length} pieces of 300 km² or more: ${islandsAtSea.slice(0, 40).map((x) => `${x.lat},${x.lon} ${x.km2}`).join('; ')}`);
  }

  // 5. The five Maria.
  const front = newMask();
  const frontDoc = JSON.parse(readFileSync(join(dataDir, 'fronts', 'polar-front.json'), 'utf8')) as { points: Ring };
  drawLine(front, frontDoc.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  const labels = new Uint32Array(W * H);
  const southPass = newMask();
  for (let c = 0; c < W * H; c++) southPass[c] = sea[c] && !front[c] ? 1 : 0;
  const australe = flood(southPass, seedCells([MARIA[4].seed]));
  const bend = newMask(); fillRings(bend, [KERGUELEN_BEND]);
  for (let c = 0; c < W * H; c++) if (australe[c] && !bend[c]) labels[c] = 5;
  const cuts = newMask();
  for (const line of LINES) drawLine(cuts, line.points);
  const northPass = newMask();
  for (let c = 0; c < W * H; c++) northPass[c] = sea[c] && !front[c] && !cuts[c] && labels[c] !== 5 ? 1 : 0;
  for (const mare of MARIA.slice(0, 4)) {
    const reached = flood(northPass, seedCells([mare.seed]));
    for (let c = 0; c < W * H; c++) if (reached[c] && !labels[c]) labels[c] = mare.code;
  }
  // Kerguelen north of the Fawn Trough: Indicum's, though the Front leaves it south.
  let bent = 0;
  for (let c = 0; c < W * H; c++) if (sea[c] && bend[c] && (australe[c] || front[c])) { labels[c] = 3; bent++; }
  const filled = fillFromNeighbours(labels, sea);
  const mareKm2: Record<string, number> = {};
  for (let c = 0; c < W * H; c++) {
    if (!labels[c]) continue;
    const j = Math.floor(c / W); const id = MARIA[labels[c] - 1].id;
    mareKm2[id] = (mareKm2[id] ?? 0) + (CELL * KM_PER_DEG) ** 2 * Math.cos((latOf(j) * Math.PI) / 180);
  }
  say(`Maria: ${Object.entries(mareKm2).map(([id, km2]) => `${id} ${(km2 / 1e6).toFixed(1)} M km²`).join(', ')}; ${filled} line and pocket cells given their nearest Mare; ${bent} Kerguelen cells bent into Indicum`);

  // The checks (ZR17: against ETOPO 2022 and ZR4), counted for the sidecar.
  const checks = { seaWithoutMare: 0, deepOnLandSide: 0, deepOnLandSideEnclosedOrInland: 0, continentalLandAtSea: 0 };
  for (let c = 0; c < W * H; c++) {
    if (sea[c] && !labels[c]) checks.seaWithoutMare++;
    if (!sea[c] && deeper2000[c] && !land[c]) {
      if (enclosed[c] || !pass[c] || !side[c]) checks.deepOnLandSideEnclosedOrInland++; else checks.deepOnLandSide++;
    }
    if (sea[c] && continentalLand[c]) checks.continentalLandAtSea++;
  }
  say(`checks: ${JSON.stringify(checks)}`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'containers-0.1.u32.bin.gz'), gzipSync(Buffer.from(labels.buffer)));
  writeFileSync(join(outDir, 'containers-0.1.json'), `${JSON.stringify({
    zsp: '2.0', stage: 1, draft: true,
    grid: { width: W, height: H, cell: CELL, origin: { lat: 90, lon: -180 }, rows: 'row 0 the northernmost', values: 'at cell centres' },
    file: 'containers-0.1.u32.bin.gz', dtype: 'uint32', endianness: 'little', compression: 'gzip',
    codes: { 0: 'the land side: the Terrae, drawn with them', ...Object.fromEntries(MARIA.map((m) => [m.code, m.id])) },
    lines: LINES.map(({ name, between, approximate, source }) => ({ name, between, approximate, source })),
    kerguelen: 'the Kerguelen Plateau north of the Fawn Trough in Indicum, south of the Polar Front (approximate points)',
    mareKm2: Object.fromEntries(Object.entries(mareKm2).map(([k, v]) => [k, Math.round(v)])),
    islandPockets,
    checks: {
      ...checks,
      means: 'seaWithoutMare: sea cells in no Mare (0 expected). deepOnLandSide: water deeper than 2,000 m (ETOPO) on a continent\'s margin or a fragment\'s shelf (0 expected). deepOnLandSideEnclosedOrInland: deep water given to the land as an enclosed sea or inland water. continentalLandAtSea: dry land joined to a continent coded as sea (0 expected).',
    },
    rules: ['ZR4', 'ZR16', 'ZR17', 'ZR18'],
    forced: { sea: FORCED_SEA.map((f) => f.name), land: FORCED_LAND.map((f) => f.name) },
    notContinental: [...NOT_CONTINENTAL],
    areaKm2: { sea: Math.round(seaKm2), land: Math.round(landKm2) },
    sources: [
      { name: 'Altimetry-derived Antarctic Circumpolar Current fronts, the Polar Front (Park and Durand 2019, SEANOE, doi:10.17882/59800)', licence: 'CC BY 4.0', url: 'https://www.seanoe.org/data/00486/59800/' },
      { name: 'Natural Earth 1:10m land, minor islands, Antarctic ice shelves', licence: 'public domain', url: 'https://www.naturalearthdata.com/' },
      { name: 'ETOPO 2022 60 arc-second ice surface (NOAA NCEI), every sixth sample, via ERDDAP', licence: 'CC0', url: 'https://www.ncei.noaa.gov/products/etopo-global-relief-model' },
      { name: 'EarthByte continental polygons (Müller et al. 2019)', licence: 'CC BY 3.0', url: 'https://www.earthbyte.org/gplates-2-3-software-and-data-sets/' },
    ],
  }, null, 2)}\n`);
  writePreview(join(outDir, 'mask-0.1-preview.png'), sea, land, enclosed, side);
  writeMariaPreview(join(outDir, 'containers-0.1-preview.png'), labels, land);
  if (process.env.ZSP_DEBUG) {
    const crops: Record<string, [number, number, number, number]> = {
      norwegian: [55, -45, 84, 40], bering: [38, 128, 68, 212], seasia: [-14, 88, 26, 160], guinea: [-8, -2, 12, 18],
      caribbean: [5, -100, 33, -55], tethys: [8, -12, 48, 62], tasman: [-56, 140, -20, 185], drake: [-66, -80, -45, -20],
    };
    for (const [name, [s, w, n, e]] of Object.entries(crops)) writeCrop(join(outDir, `crop-${name}.png`), [s, w, n, e], sea, land, enclosed, side);
  }
  say(`written to ${outDir}`);
}

/** The Maria at half size, each its colour, the land side grey, dry land darker. */
function writeMariaPreview(path: string, labels: Uint32Array, land: Mask): void {
  const w = W / 2; const h = H / 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = (y * 2) * W + x * 2; const code = labels[c];
      const rgb = code ? MARIA[code - 1].rgb : land[c] ? [150, 145, 135] : [205, 200, 190];
      raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  writePng(path, w, h, raw);
}

/** A full-resolution crop, [south, west, north, east] (east may pass 180°), in the preview's colours. */
function writeCrop(path: string, [s, w, n, e]: [number, number, number, number], sea: Mask, land: Mask, enclosed: Mask, side: Mask): void {
  const j0 = rowOf(n); const j1 = rowOf(s); const i0 = colOf(w); const span = Math.round((e - w) / CELL);
  const cw = span; const ch = j1 - j0 + 1;
  const raw = Buffer.alloc((cw * 3 + 1) * ch);
  for (let y = 0; y < ch; y++) {
    raw[y * (cw * 3 + 1)] = 0;
    for (let x = 0; x < cw; x++) {
      const c = (j0 + y) * W + ((i0 + x) % W);
      const rgb = sea[c] ? (land[c] ? [40, 80, 140] : [125, 170, 215])
        : land[c] ? [150, 145, 135] : enclosed[c] ? [196, 205, 214] : side[c] ? [215, 208, 192] : [185, 180, 172];
      raw.set(rgb, y * (cw * 3 + 1) + 1 + x * 3);
    }
  }
  writePng(path, cw, ch, raw);
}

/** A preview at half size: sea blue, land side grey, dry land darker, enclosed seas a pale grey-blue. */
function writePreview(path: string, sea: Mask, land: Mask, enclosed: Mask, side: Mask): void {
  const w = W / 2; const h = H / 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = (y * 2) * W + x * 2;
      const rgb = sea[c] ? (land[c] ? [70, 110, 150] : [125, 170, 215])
        : land[c] ? [150, 145, 135] : enclosed[c] ? [196, 205, 214] : side[c] ? [205, 200, 190] : [185, 180, 172];
      raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  writePng(path, w, h, raw);
}

main();
