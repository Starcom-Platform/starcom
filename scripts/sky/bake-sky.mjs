#!/usr/bin/env node
/**
 * The sky's data for Sky from a place (critique-2026-11-01, OR32, OR41; plan D5), baked once from two sources kept in
 * .local/sky/ and never fetched by the app:
 *   - the Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren 1991), as HEASARC serves it
 *     (heasarc_bsc5p.tdat.gz): every star to magnitude 6, its HR number, J2000 place, V magnitude and B−V colour;
 *   - the IAU's constellation figures, as the skymap project transcribed them from the IAU Office of Astronomy for
 *     Education's maps (data/constellations/iau/lines.csv, CC BY 4.0), each segment between two HR numbers, or the
 *     midpoint of two.
 * Each constellation's name stands at the middle of its stars brighter than magnitude 5, by the constellation the
 * catalogue's own Bayer or Flamsteed name gives each star; the names are the IAU's 88.
 *
 * Usage: node scripts/sky/bake-sky.mjs <bsc5p.tdat.gz> <lines.csv>  → public/data/sky/sky-mag6.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname } from 'node:path';

const [bscPath, linesPath, outPath = 'public/data/sky/sky-mag6.json'] = process.argv.slice(2);
if (!bscPath || !linesPath) { console.error('Usage: bake-sky.mjs <bsc5p.tdat.gz> <lines.csv> [out]'); process.exit(2); }

const MAG_LIMIT = 6;
const NAME_MAG = 5;

/** The IAU's 88, by abbreviation. */
const IAU = {
  And: 'Andromeda', Ant: 'Antlia', Aps: 'Apus', Aqr: 'Aquarius', Aql: 'Aquila', Ara: 'Ara', Ari: 'Aries', Aur: 'Auriga',
  Boo: 'Boötes', Cae: 'Caelum', Cam: 'Camelopardalis', Cnc: 'Cancer', CVn: 'Canes Venatici', CMa: 'Canis Major',
  CMi: 'Canis Minor', Cap: 'Capricornus', Car: 'Carina', Cas: 'Cassiopeia', Cen: 'Centaurus', Cep: 'Cepheus',
  Cet: 'Cetus', Cha: 'Chamaeleon', Cir: 'Circinus', Col: 'Columba', Com: 'Coma Berenices', CrA: 'Corona Australis',
  CrB: 'Corona Borealis', Crv: 'Corvus', Crt: 'Crater', Cru: 'Crux', Cyg: 'Cygnus', Del: 'Delphinus', Dor: 'Dorado',
  Dra: 'Draco', Equ: 'Equuleus', Eri: 'Eridanus', For: 'Fornax', Gem: 'Gemini', Gru: 'Grus', Her: 'Hercules',
  Hor: 'Horologium', Hya: 'Hydra', Hyi: 'Hydrus', Ind: 'Indus', Lac: 'Lacerta', Leo: 'Leo', LMi: 'Leo Minor',
  Lep: 'Lepus', Lib: 'Libra', Lup: 'Lupus', Lyn: 'Lynx', Lyr: 'Lyra', Men: 'Mensa', Mic: 'Microscopium',
  Mon: 'Monoceros', Mus: 'Musca', Nor: 'Norma', Oct: 'Octans', Oph: 'Ophiuchus', Ori: 'Orion', Pav: 'Pavo',
  Peg: 'Pegasus', Per: 'Perseus', Phe: 'Phoenix', Pic: 'Pictor', Psc: 'Pisces', PsA: 'Piscis Austrinus',
  Pup: 'Puppis', Pyx: 'Pyxis', Ret: 'Reticulum', Sge: 'Sagitta', Sgr: 'Sagittarius', Sco: 'Scorpius',
  Scl: 'Sculptor', Sct: 'Scutum', Ser: 'Serpens', Sex: 'Sextans', Tau: 'Taurus', Tel: 'Telescopium',
  Tri: 'Triangulum', TrA: 'Triangulum Australe', Tuc: 'Tucana', UMa: 'Ursa Major', UMi: 'Ursa Minor', Vel: 'Vela',
  Vir: 'Virgo', Vol: 'Volans', Vul: 'Vulpecula',
};
const ABBREVIATIONS = new Map(Object.keys(IAU).map((a) => [a.toLowerCase(), a]));

// ── The stars ───────────────────────────────────────────────────────────────
const text = gunzipSync(readFileSync(bscPath)).toString('latin1');
const columns = text.match(/^line\[1\] = (.+)$/m)?.[1].trim().split(/\s+/);
if (!columns) throw new Error('No column line in the catalogue file');
const at = (name) => { const i = columns.indexOf(name); if (i < 0) throw new Error(`No column ${name}`); return i; };
const [HR, RA, DEC, VMAG, BV, ALT] = ['hr', 'ra', 'dec', 'vmag', 'bv_color', 'alt_name'].map(at);
const body = text.slice(text.indexOf('<DATA>') + 6, text.indexOf('<END>'));
const all = [];
for (const row of body.split('\n')) {
  if (!row.trim()) continue;
  const f = row.split('|');
  const hr = Number(f[HR]);
  const ra = Number(f[RA]);
  const dec = Number(f[DEC]);
  const vmag = f[VMAG].trim() === '' ? NaN : Number(f[VMAG]);
  if (!Number.isFinite(hr) || !Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(vmag)) continue;
  const bv = f[BV].trim() === '' ? null : Number(f[BV]);
  // The constellation in a Bayer or Flamsteed name: its last word ("Sig Oct", "58 Ori").
  const word = f[ALT].trim().split(/\s+/).pop()?.toLowerCase() ?? '';
  all.push({ hr, ra, dec, vmag, bv, con: ABBREVIATIONS.get(word) ?? null });
}
const byHr = new Map(all.map((s) => [s.hr, s]));
const stars = all.filter((s) => s.vmag <= MAG_LIMIT).sort((a, b) => a.vmag - b.vmag);

// ── The figures ─────────────────────────────────────────────────────────────
const csv = readFileSync(linesPath, 'utf8').trim().split('\n');
if (csv[0].trim() !== 'constellation,from_hr,to_hr,weight') throw new Error(`Unexpected lines header: ${csv[0]}`);
/** An end of a segment: one star, or the midpoint of two ("5190 5193"); the place in RA and Dec, degrees. */
const endOf = (field) => {
  const hrs = field.trim().split(/\s+/).map(Number);
  const found = hrs.map((hr) => byHr.get(hr));
  if (found.some((s) => !s)) throw new Error(`An HR number not in the catalogue: ${field}`);
  if (found.length === 1) return [found[0].ra, found[0].dec];
  // The midpoint, on the sphere.
  const v = found.reduce((sum, s) => {
    const ra = (s.ra * Math.PI) / 180, dec = (s.dec * Math.PI) / 180;
    return [sum[0] + Math.cos(dec) * Math.cos(ra), sum[1] + Math.cos(dec) * Math.sin(ra), sum[2] + Math.sin(dec)];
  }, [0, 0, 0]);
  const ra = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  return [(ra + 360) % 360, (Math.atan2(v[2], Math.hypot(v[0], v[1])) * 180) / Math.PI];
};
const figures = {};
for (const row of csv.slice(1)) {
  const [con, from, to, weight] = row.split(',');
  if (!IAU[con]) throw new Error(`Not an IAU constellation: ${con}`);
  (figures[con] ??= []).push([...endOf(from), ...endOf(to), weight === 'bold' ? 2 : weight === 'thin' ? 0 : 1]);
}

// ── The names ───────────────────────────────────────────────────────────────
const round = (x, d) => Number(x.toFixed(d));
const constellations = Object.entries(IAU).map(([abbr, name]) => {
  const members = all.filter((s) => s.con === abbr && s.vmag <= NAME_MAG);
  const use = members.length ? members : all.filter((s) => s.con === abbr);
  if (!use.length) throw new Error(`No star names ${abbr}`);
  const v = use.reduce((sum, s) => {
    const ra = (s.ra * Math.PI) / 180, dec = (s.dec * Math.PI) / 180;
    return [sum[0] + Math.cos(dec) * Math.cos(ra), sum[1] + Math.cos(dec) * Math.sin(ra), sum[2] + Math.sin(dec)];
  }, [0, 0, 0]);
  const ra = ((Math.atan2(v[1], v[0]) * 180) / Math.PI + 360) % 360;
  const dec = (Math.atan2(v[2], Math.hypot(v[0], v[1])) * 180) / Math.PI;
  return { abbr, name, ra: round(ra, 3), dec: round(dec, 3), lines: (figures[abbr] ?? []).map((seg) => seg.map((x, i) => (i === 4 ? x : round(x, 4)))) };
});

const out = {
  v: 1,
  sources: {
    stars: 'Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren 1991), via NASA HEASARC (bsc5p)',
    lines: 'IAU constellation figures, adapted by the IAU Office of Astronomy for Education from the original by IAU/Sky & Telescope (Roger Sinnott, Rick Fienberg; patterns by Alan MacRobert); transcribed by the skymap project; CC BY 4.0',
  },
  magLimit: MAG_LIMIT,
  /** Each star [ra°, dec°, V, B−V or null], J2000, brightest first. */
  stars: stars.map((s) => [round(s.ra, 4), round(s.dec, 4), round(s.vmag, 2), s.bv === null ? null : round(s.bv, 2)]),
  /** Each constellation: its name's place, and its figure's segments [ra1, dec1, ra2, dec2, weight 0 thin | 1 | 2 bold]. */
  constellations,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out));
const segments = constellations.reduce((n, c) => n + c.lines.length, 0);
console.log(`sky: ${out.stars.length} stars to magnitude ${MAG_LIMIT}, ${constellations.length} constellations, ${constellations.filter((c) => c.lines.length).length} with figures, ${segments} segments → ${outPath}`);
