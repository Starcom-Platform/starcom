/**
 * Bakes IGRF-14 for Psi Watch's magnetic shield (decision D-PW, PW7, PW58): every epoch from 1900 to 2025 and the
 * secular variation to 2030, as NOAA NCEI serves the IAGA Working Group V-MOD's coefficients (public data), and both
 * dip poles' tracks, a point a year from 1900 to 2030, each found where the field stands vertical. Written to
 * public/data/psi-igrf14.json, read only while the layer shows. Geopack's own table (igrf14.ts) holds 2000 on only.
 *
 * Usage: npm run data:psi-igrf [-- <igrf14coeffs.txt>]   (no file: fetched from NOAA NCEI once)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { poleTracks, readCoefficients } from '../../src/services/psiWatch/shield/igrfField';

const SOURCE = 'https://www.ngdc.noaa.gov/IAGA/vmod/coeffs/igrf14coeffs.txt';
const OUT = 'public/data/psi-igrf14.json';

const path = process.argv[2];
const text = path ? readFileSync(path, 'utf8') : await (await fetch(SOURCE)).text();
const igrf = readCoefficients(text);
const poles = poleTracks(igrf);
writeFileSync(OUT, `${JSON.stringify({
  source: { name: 'IAGA IGRF-14, as NOAA NCEI serves it', url: SOURCE, licence: 'public data' },
  epochs: igrf.epochs,
  terms: igrf.terms,
  poles,
})}\n`);
console.log(`bake-igrf: ${igrf.epochs.length} epochs (${igrf.epochs[0]}–${igrf.epochs.at(-1)}), ${igrf.terms.length} terms; `
  + `poles ${poles.north[0][0]}–${poles.north.at(-1)?.[0]} → ${OUT}`);
