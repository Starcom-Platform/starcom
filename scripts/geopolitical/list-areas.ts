/**
 * Writes src/features/globe/areas/listedAreas.json from Mecha Jono's Spheres and Organisations lists (decision D-ZR,
 * ZR10), for the area registry to merge over what it codes (listedAreas.ts). A list that is not there yet adds
 * nothing. Run by `npm run bake:areas` before the shapes are baked, so a listed body is baked with its members.
 *
 * And zoneAreas.json from the Zones manifest served: under ZSP 2.0 every Terra, Mare and Zone, and each retired id as
 * the Zones that cover it (zoneAreas.ts); under ZSP 1.0 none, so the coded Zones stand.
 *
 * Usage: tsx --tsconfig tsconfig.app.json scripts/geopolitical/list-areas.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listedAreasFrom } from '../../src/features/globe/areas/listedAreas';
import { zoneAreasFrom } from '../../src/features/globe/areas/zoneAreas';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = 'src/features/globe/areas/listedAreas.json';
const read = (file: string): unknown => {
  const full = path.join(ROOT, file);
  return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, 'utf8')) : null;
};

const listed = listedAreasFrom(read('public/geopolitical/spheres/manifest.json'), read('public/geopolitical/organisations/manifest.json'));
fs.writeFileSync(path.join(ROOT, OUT), `${JSON.stringify(listed, null, 2)}\n`);
console.log(`${listed.spheres.length} Spheres and ${listed.unions.length} Organisations listed into ${OUT}.`);

const ZONES = 'public/geopolitical/zones';
const ZONES_OUT = 'src/features/globe/areas/zoneAreas.json';
const zones = zoneAreasFrom(read(`${ZONES}/manifest.json`), (file) => read(`${ZONES}/${file}`));
fs.writeFileSync(path.join(ROOT, ZONES_OUT), `${JSON.stringify(zones, null, 2)}\n`);
console.log(`${zones.zones.length} Terrae, Maria and Zones and ${zones.retired.length} retired Zones listed into ${ZONES_OUT}.`);
