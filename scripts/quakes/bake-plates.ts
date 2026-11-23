/**
 * Bakes the plate boundaries the quake kit draws (decision D-EQ, EQ8): PB2002's 241 boundaries (Bird 2003), each a run
 * of [lng, lat] to a hundredth of a degree, with its two plates by name (PB2002's plates file) and whether it is a
 * subduction zone, the one kind the file names. Credited as the Psi Finder credits it (sourceCredits.ts).
 *
 *   npm run data:quake-plates      (PB2002 in .local/zsp2-data/pb2002/, as the ZSP 2.0 bake used it)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const PB2002 = '.local/zsp2-data/pb2002/PB2002_boundaries.json';
const PLATES = '.local/zsp2-data/pb2002/PB2002_plates.json';
const OUT = 'public/data/quakes/plate-boundaries.json';

interface Feature {
  properties: { Name: string; PlateA: string; PlateB: string; Type: string };
  geometry: { type: string; coordinates: number[][] };
}

const source = JSON.parse(readFileSync(PB2002, 'utf8')) as { features: Feature[] };
const named = new Map((JSON.parse(readFileSync(PLATES, 'utf8')) as { features: { properties: { Code: string; PlateName: string } }[] })
  .features.map((f) => [f.properties.Code, f.properties.PlateName]));
const plateName = (code: string) => named.get(code) ?? code;
const round = (n: number) => Math.round(n * 100) / 100;
const boundaries = source.features
  .filter((f) => f.geometry.type === 'LineString' && f.geometry.coordinates.length >= 2)
  .map((f) => {
    const line: Array<[number, number]> = [];
    for (const [lng, lat] of f.geometry.coordinates) {
      const point: [number, number] = [round(lng), round(lat)];
      const last = line[line.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) line.push(point);
    }
    return {
      name: f.properties.Name,
      plates: [plateName(f.properties.PlateA), plateName(f.properties.PlateB)],
      subduction: f.properties.Type === 'subduction',
      line,
    };
  })
  .filter((b) => b.line.length >= 2);

mkdirSync('public/data/quakes', { recursive: true });
writeFileSync(OUT, `${JSON.stringify({
  credit: 'Bird, P. (2003), An updated digital model of plate boundaries, Geochemistry, Geophysics, Geosystems 4(3); GeoJSON by Hugo Ahlenius, Nordpil (fraxen/tectonicplates), Open Data Commons Attribution License',
  boundaries,
})}\n`);
console.log(`${boundaries.length} boundaries, ${boundaries.reduce((n, b) => n + b.line.length, 0)} points → ${OUT}`);
