#!/usr/bin/env node
/**
 * How many companies at a shared registered address hold an LEI.
 *
 * A count over two complete populations: every company at an address, from a
 * national register, intersected with every entity holding an LEI, from the
 * GLEIF golden copy. Both are enumerations, so this is one too — no
 * corroboration is involved and none is claimed.
 *
 * WHY IT IS WORTH COUNTING. An LEI is what an entity needs to transact in
 * financial markets, so its density at an address separates two things that
 * look identical in a register: a concentration of active financial entities
 * from a concentration of dormant shells. Measured, the separation is real —
 * UK formation-agent addresses run about 1%, while central-Oslo addresses in
 * the Norwegian register reach 17-37%.
 *
 * WHAT IT IS NOT. "Holds an LEI" means an entity with this registration
 * number appears in the GLEIF snapshot under this registration authority. It
 * does not mean the company trades, is regulated, or is doing anything at all.
 * The claim is the count.
 *
 * TWO SNAPSHOTS, so the claim is only as current as the staler of them, and
 * the boundary names both.
 *
 * Usage:
 *   node scripts/fetch-lei-coverage.mjs --gleif <archived .csv.zip> [--out ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { requireFreeSpace } from './lib/diskGuard.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const GLEIF = arg('--gleif', '');
const RR = arg('--rr', '');
const OUT = arg('--out', 'public/data/lei-coverage.json');
if (!GLEIF) { console.error('Need --gleif <archived golden copy .csv.zip>'); process.exit(2); }
if (!RR) { console.error('Need --rr <archived relationship-records .csv.zip>'); process.exit(2); }
requireFreeSpace(32 * 1048576, 'the LEI coverage asset', path.dirname(OUT));

/**
 * The registers this joins against, and how each names a company.
 *
 * A UK company number is alphanumeric ("SC303142"); a Norwegian organisation
 * number is nine digits, which GLEIF stores as filed and Norwegian convention
 * writes in groups of three. So each register gets its own normalisation, and
 * neither is a fuzzy match: both are formatting, not judgement.
 */
const REGISTERS = [
  {
    asset: 'public/data/companies-house.json',
    label: 'Companies House register',
    authorities: new Set(['RA000585']),
    normalise: (v) => String(v ?? '').trim().toUpperCase().replace(/\s/g, ''),
  },
  {
    asset: 'public/data/brreg.json',
    label: 'Enhetsregisteret',
    authorities: new Set(['RA000472', 'RA000473']),
    normalise: (v) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 9 ? d : ''; },
  },
];

function splitCsv(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// ---- 1. every LEI registration number, per authority ------------------------
console.log('Reading the Global LEI Index…');
const holders = REGISTERS.map(() => new Set());
/** LEI -> jurisdiction, for every entity: needed to tell a foreign parent from a domestic one. */
const jurisdictionOf = new Map();
/** normalised registration number -> LEI, per register, to get from a cluster to its relationships. */
const leiOf = REGISTERS.map(() => new Map());
let gleifSnapshot = path.basename(GLEIF).replace(/\.csv\.zip$/, '');
let leiRecords = 0;

{
  const unzip = spawn('unzip', ['-p', GLEIF], { stdio: ['ignore', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: unzip.stdout, crlfDelay: Infinity });
  let idx = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = splitCsv(line);
    if (!idx) {
      const h = c.map((x) => x.trim());
      idx = {
        ra: h.indexOf('Entity.RegistrationAuthority.RegistrationAuthorityID'),
        id: h.indexOf('Entity.RegistrationAuthority.RegistrationAuthorityEntityID'),
        lei: h.indexOf('LEI'),
        jurisdiction: h.indexOf('Entity.LegalJurisdiction'),
      };
      if (Object.values(idx).some((v) => v === -1)) {
        console.error('Unexpected GLEIF CSV header — refusing to guess at column positions');
        process.exit(1);
      }
      continue;
    }
    leiRecords++;
    const lei = c[idx.lei]?.trim();
    if (lei) jurisdictionOf.set(lei, (c[idx.jurisdiction]?.trim() || '').slice(0, 2) || null);
    const ra = c[idx.ra]?.trim();
    const raw = c[idx.id]?.trim();
    if (!raw) continue;
    REGISTERS.forEach((r, i) => {
      if (!r.authorities.has(ra)) return;
      const n = r.normalise(raw);
      if (!n) return;
      holders[i].add(n);
      if (lei) leiOf[i].set(n, lei);
    });
  }
}
console.log(`  ${leiRecords.toLocaleString()} LEI records scanned`);

// ---- 1b. which LEI holders declare a parent in another jurisdiction ---------
//
// The one thing no national register can express. A register stops at its own
// jurisdiction, so a company's foreign parent is invisible to it — and 40% of
// the consolidation links whose child sits in these registers point at another
// country, with Bermuda, Jersey and the Marshall Islands among the commonest.
//
// Only ACTIVE consolidation links count. Fund-management and sub-fund
// relationships are a different thing from corporate control, and an inactive
// link records a parentage that has ended.
console.log('Reading the relationship records…');
const CONSOLIDATION = new Set(['IS_DIRECTLY_CONSOLIDATED_BY', 'IS_ULTIMATELY_CONSOLIDATED_BY']);
const foreignParentsOf = new Map();   // child LEI -> Set of parent jurisdictions
let rrRecords = 0;
const rrSnapshot = path.basename(RR).replace(/\.csv\.zip$/, '');

{
  const unzip = spawn('unzip', ['-p', RR], { stdio: ['ignore', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: unzip.stdout, crlfDelay: Infinity });
  let idx = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = splitCsv(line);
    if (!idx) {
      const h = c.map((x) => x.trim());
      idx = {
        child: h.indexOf('Relationship.StartNode.NodeID'),
        parent: h.indexOf('Relationship.EndNode.NodeID'),
        type: h.indexOf('Relationship.RelationshipType'),
        status: h.indexOf('Relationship.RelationshipStatus'),
      };
      if (Object.values(idx).some((v) => v === -1)) {
        console.error('Unexpected GLEIF RR header — refusing to guess at column positions');
        process.exit(1);
      }
      continue;
    }
    rrRecords++;
    if (!CONSOLIDATION.has(c[idx.type]?.trim())) continue;
    if (c[idx.status]?.trim() !== 'ACTIVE') continue;
    const child = c[idx.child]?.trim();
    const parentJur = jurisdictionOf.get(c[idx.parent]?.trim());
    const childJur = jurisdictionOf.get(child);
    if (!child || !parentJur || !childJur || parentJur === childJur) continue;
    if (!foreignParentsOf.has(child)) foreignParentsOf.set(child, new Set());
    foreignParentsOf.get(child).add(parentJur);
  }
}
console.log(`  ${rrRecords.toLocaleString()} relationships scanned; ${foreignParentsOf.size.toLocaleString()} entities with a foreign parent`);

// ---- 2. intersect with each register's clusters -----------------------------
const coverage = [];
const perRegister = [];

REGISTERS.forEach((r, i) => {
  if (!fs.existsSync(r.asset)) { console.log(`  ${r.label}: asset absent, skipped`); return; }
  const asset = JSON.parse(fs.readFileSync(r.asset, 'utf8'));
  if (asset.complete !== true) {
    // A count over an incomplete population is a false count, not a partial one.
    console.error(`  ${r.label}: asset does not assert completeness — refusing to join against it.`);
    process.exit(1);
  }

  let holdersFound = 0;
  let foreignFound = 0;
  for (const cl of asset.clusters ?? []) {
    const matched = cl.companyNumbers.filter((n) => holders[i].has(r.normalise(n)));
    holdersFound += matched.length;

    // Of the LEI holders here, which declare a parent in another jurisdiction.
    const foreign = [];
    const jurisdictions = new Set();
    for (const n of matched) {
      const lei = leiOf[i].get(r.normalise(n));
      const parents = lei && foreignParentsOf.get(lei);
      if (!parents) continue;
      foreign.push(n);
      for (const j of parents) jurisdictions.add(j);
    }
    foreignFound += foreign.length;

    coverage.push({
      addressLine1: cl.addressLine1,
      postcode: cl.postcode,
      register: r.label,
      registerSnapshot: asset.snapshot,
      companyCount: cl.companyCount,
      leiHolderCount: matched.length,
      leiHolders: matched.sort(),
      /**
       * Counted against the LEI HOLDERS, never against every company here.
       *
       * Only about 1% of companies at a UK formation-agent address hold an LEI
       * at all, so "12 of 86,035 have a foreign parent" would say the other
       * 86,023 do not — when the truth is that nothing is known about them.
       * The denominator is the population the data can actually speak about.
       */
      foreignParentedCount: foreign.length,
      foreignParented: foreign.sort(),
      parentJurisdictions: [...jurisdictions].sort(),
    });
  }
  perRegister.push({ register: r.label, snapshot: asset.snapshot, clusters: (asset.clusters ?? []).length, leiHolders: holdersFound, foreignParented: foreignFound, leiNumbersKnown: holders[i].size });
  console.log(`  ${r.label}: ${holdersFound.toLocaleString()} LEI holders, ${foreignFound.toLocaleString()} with a foreign parent, across ${(asset.clusters ?? []).length} clusters`);
});

if (coverage.length === 0) {
  console.error('No coverage entries — refusing to write an empty asset over a good one.');
  process.exit(1);
}

/**
 * The claim ages from the STALER snapshot.
 *
 * A joined count is only as current as its oldest input: a fresh LEI index
 * intersected with a register from last quarter describes last quarter. Taking
 * the newer date would publish a claim as fresher than the evidence behind it.
 */
const snapshots = [gleifSnapshot, rrSnapshot, ...perRegister.map((r) => r.snapshot)].filter(Boolean).sort();
const effectiveSnapshot = snapshots[0];

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  source: 'Companies registers joined to the GLEIF Global LEI Index',
  sourceUrl: [],
  license: 'Open Government Licence v3.0 / NLOD / CC0 1.0 — see each register asset',
  citation: [
    'Contains public sector information licensed under the Open Government Licence v3.0.',
    'Inneholder data under norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Brønnøysundregistrene.',
    'GLEIF Global LEI Index, https://www.gleif.org/ — CC0 1.0',
  ],
  complete: true,
  snapshot: effectiveSnapshot,
  gleifSnapshot,
  rrSnapshot,
  registers: perRegister,
  addressTerm: 'registered address',
  bounding:
    `Every company at each shared registered address in the joined registers that holds a Legal Entity Identifier, `
    + `counted by intersecting two complete enumerations: the register clusters `
    + `(${perRegister.map((r) => `${r.register} snapshot ${r.snapshot}`).join('; ')}) and every LEI in the `
    + `GLEIF Global LEI Index golden copy of ${gleifSnapshot} whose registration authority is that register. `
    + `Foreign parentage comes from the GLEIF relationship records of ${rrSnapshot}, counting only ACTIVE direct and `
    + 'ultimate consolidation links whose parent is in a different jurisdiction, and is counted against the LEI '
    + 'HOLDERS at each address rather than against every company there — most companies at these addresses hold no '
    + 'LEI, so nothing is known about their ownership either way. '
    + `Dated ${effectiveSnapshot}, the older of the inputs, because a joined count is only as current as its stalest part. `
    + 'Complete within that boundary. Holding an LEI means an entity with that registration number appears in the LEI index; '
    + 'it does not mean the company trades, is regulated, or is active at all.',
  entryCount: coverage.length,
  entries: coverage,
}, null, 2) + '\n');

console.log(`\nDated ${effectiveSnapshot} (the oldest of GLEIF ${gleifSnapshot}, relationships ${rrSnapshot}, and the registers)`);
console.log(`Wrote ${coverage.length} coverage entries to ${OUT}`);
