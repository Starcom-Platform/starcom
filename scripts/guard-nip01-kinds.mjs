#!/usr/bin/env node
/**
 * @asserts Every event kind this project declares falls within the NIP-01 range its behaviour requires.
 *
 * Checks every event kind this project declares against NIP-01's ranges.
 *
 * ─── THE CHECK THAT WAS MISSING ────────────────────────────────────────────
 *
 * The Attested Claims spec calls refutation a "regular" event and puts it at
 * kind 30083, which is addressable. Relays derive retention from the kind NUMBER
 * and ignore what a document says about it — so every refutation an author
 * published would have silently replaced their previous one, defeating the exact
 * property that section of the spec argues for.
 *
 * Four independent implementations agreed with each other and all four were
 * wrong together, because none of them implemented refutation and agreement
 * between silent parties is not evidence. 21 conformance vectors passed, and
 * three of them cover retraction while none covers refutation — the defect sat
 * precisely where the verification was not.
 *
 * What all of that verification has in common is that it checks INTERNAL
 * CONSISTENCY: do our implementations agree, do the vectors match the prose.
 * Nothing checked the prose against the standard underneath it. This does.
 *
 * ─── WHY IT IS STANDALONE ──────────────────────────────────────────────────
 *
 * It imports nothing from this project and parses the published document. Any
 * peer in the network can copy this file and run it against their own spec —
 * the failure it catches is not specific to Starcom, and a network where five
 * projects allocate kinds independently will hit it again. Sharing the check
 * costs nothing and is worth more than reporting our own fix.
 *
 * Usage: node scripts/guard-nip01-kinds.mjs [path/to/spec.md ...]
 * Exit:  0 every declared kind is consistent with its range · 1 otherwise
 */
import fs from 'node:fs';

/**
 * NIP-01 storage semantics, derived from the kind number alone.
 *
 * "parameterized replaceable" is the older name for addressable and is accepted
 * as a synonym: several documents in this network still use it, and failing
 * them over vocabulary would bury the defects that actually matter.
 */
const RANGES = [
  { lo: 0, hi: 0, kind: 'replaceable' },
  { lo: 3, hi: 3, kind: 'replaceable' },
  { lo: 1000, hi: 9999, kind: 'regular' },
  { lo: 10000, hi: 19999, kind: 'replaceable' },
  { lo: 20000, hi: 29999, kind: 'ephemeral' },
  { lo: 30000, hi: 39999, kind: 'addressable' },
];
const SYNONYMS = new Map([
  ['parameterized replaceable', 'addressable'],
  ['parameterised replaceable', 'addressable'],
  ['parameterized-replaceable', 'addressable'],
  ['addressable', 'addressable'],
  ['regular', 'regular'],
  ['replaceable', 'replaceable'],
  ['ephemeral', 'ephemeral'],
]);

function retentionOf(kind) {
  for (const r of RANGES) if (kind >= r.lo && kind <= r.hi) return r.kind;
  // 1 and 2 and other low kinds outside the table are regular in practice.
  if (kind < 1000) return 'regular';
  return 'unknown';
}

/** Rows of a markdown table shaped `| kind | type | name |`. */
function kindsDeclaredIn(markdown) {
  const out = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^\|\s*`?(\d{1,5})`?\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (!m) continue;
    out.push({ kind: Number(m[1]), declared: m[2].trim().toLowerCase(), name: m[3].trim() });
  }
  return out;
}

const files = process.argv.slice(2);
const targets = files.length ? files : ['docs/spec/nip-draft-attested-claims.md'];

let failures = 0;
let checked = 0;
console.log('');

/*
 * A SKIP that exits 0 is a guard that verifies nothing and says it passed.
 *
 * Both branches below used to `continue`. So renaming or restructuring
 * docs/spec/nip-draft-attested-claims.md made this guard pass forever, reading
 * no kind table at all — and it is the only check here that reads the STANDARD
 * rather than checking this repo's implementations against each other. Its own
 * header explains that four implementations agreeing with one another is
 * exactly what let the original kind collision through.
 *
 * That failure mode is not hypothetical: scripts/__tests__/guardHarness.ts
 * exists because "a guard shipped here that printed 'skipping' and exited 0".
 * The same defect was live in this guard the whole time.
 *
 * The distinction that matters is WHO named the target. A file passed on argv
 * is a deliberate request — if it is missing or has no table, that is worth
 * failing over. The DEFAULT target is this repository's own spec, and its
 * absence is a repository-level fault, so that fails too. Nothing here should
 * be able to report success without having read a table.
 */
const targetsWereRequested = files.length > 0;

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.log(`  MISSING  ${file} — not found, so no kind table was checked`);
    failures++;
    continue;
  }
  const declared = kindsDeclaredIn(fs.readFileSync(file, 'utf8'));
  if (!declared.length) {
    console.log(
      `  NO TABLE ${file} — the kind table could not be parsed`
      + `${targetsWereRequested ? '' : ' (this is the repository\'s own spec)'}`,
    );
    failures++;
    continue;
  }
  console.log(`  ${file}`);

  const seen = new Map();
  for (const row of declared) {
    checked++;
    const actual = retentionOf(row.kind);
    const normalized = SYNONYMS.get(row.declared);

    // A kind claimed twice in one document is its own defect.
    const prior = seen.get(row.kind);
    if (prior) {
      failures++;
      console.log(`    COLLISION  ${row.kind} declared for both "${prior}" and "${row.name}"`);
    } else seen.set(row.kind, row.name);

    if (!normalized) {
      console.log(`    note       ${row.kind} ${row.name} — retention "${row.declared}" not recognised, skipped`);
      continue;
    }
    if (normalized !== actual) {
      failures++;
      console.log(`    MISMATCH   ${row.kind} ${row.name}`);
      console.log(`               document says "${row.declared}", NIP-01 range says "${actual}"`);
      console.log(`               Relays follow the range. A document cannot opt out of it.`);
      if (actual === 'addressable' && normalized === 'regular') {
        console.log(`               Consequence: each new event REPLACES the author's previous one`);
        console.log(`               at the same d-tag. If no d-tag is specified, that is all of them.`);
      }
    } else {
      console.log(`    ok         ${row.kind} ${row.name} — ${actual}`);
    }
  }
}

console.log('');
if (failures) {
  console.log(`  ${failures} problem(s) across ${checked} declared kind(s).`);
  console.log('');
  console.log('  This check exists because a spec in this network declared a kind\'s');
  console.log('  retention class in prose and the number said otherwise. Four independent');
  console.log('  implementations agreed with the prose and all four were wrong, because');
  console.log('  agreement between implementations cannot catch a shared misreading of');
  console.log('  the standard underneath them.');
  console.log('');
  process.exit(1);
}
console.log(`  ${checked} declared kind(s) consistent with NIP-01 ranges.`);
console.log('');
