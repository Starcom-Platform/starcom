#!/usr/bin/env node
/**
 * @asserts No source file claims affiliation with, endorsement by, or
 *          compliance certified by a real government or military institution.
 *
 * ─── WHY THIS IS A DIFFERENT GUARD FROM guard-no-classification ────────────
 *
 * The clearance tiers that guard purges were an internal fiction: they cost
 * complexity and enforced nothing, but they described only this application.
 * These names describe OTHER PEOPLE. A field typed
 *
 *   agency: 'SOCOM' | 'SPACE_FORCE' | 'CYBER_COMMAND' | 'NSA' | 'DIA' | 'CIA'
 *
 * asserts a relationship with six real institutions, none of which uses this
 * application. Starcom is not governmental. The exposure is mis-association
 * and false claim, and it does not depend on the UI rendering anything —
 * this repository is open source, so the source itself is the publication.
 *
 * What was found when this guard was written:
 *
 *   agency / AgencyType     the six-agency union, declared TWICE, with
 *                           'CYBER_COMMAND' hardcoded as the runtime default on
 *                           every Nostr message's senderAgency.
 *   sourceAgency: 'NSA'     fabricated market listings marked SECRET with
 *   sourceAgency: 'DIA'     verificationLevel: 95 — invented intelligence
 *                           products attributed to real agencies as their source.
 *   aiService               a generated recommendation reading "Coordinate
 *                           response across CYBER, SPACE, and SOCOM for
 *                           synchronized attack", confidence 0.88, scope GLOBAL.
 *   "SOCOM/NIST Compliant"  a compliance claim about a US combatant command,
 *                           including one written to the startup log.
 *   PQCryptoService    a service whose FILENAME asserted the affiliation.
 *
 * ─── WHAT IS NOT FORBIDDEN, AND WHY THE LINE IS HERE ───────────────────────
 *
 * Two kinds of institutional name are legitimate and must survive:
 *
 * STANDARDS. `FIPS 203`, `FIPS 204`, `ML-KEM-768`, `ML-DSA-65`, `NIST-1/3/5`.
 * "We implement FIPS 203" is a checkable technical claim about an algorithm,
 * and anybody can verify it from the source. NIST is therefore absent from the
 * vocabulary below. Note the difference from "SOCOM/NIST Compliant", which
 * bundled a real standard with a combatant command and claimed a certification
 * neither body issued — that phrase is forbidden by the COMPLIANCE_CLAIMS rule.
 *
 * ATTRIBUTION. NOAA (95 files), EIA (42), CelesTrak (6), Natural Earth (1).
 * These are real providers whose feeds this application actually consumes.
 * Naming them is required attribution, and removing it would be the dishonest
 * direction.
 *
 * A THIRD legitimate use, which nearly got destroyed: "agency" in the
 * philosophical sense. src/services/intel/harm/HarmAccount.ts branches on
 * `account.distribution.agency === 'unknown'` and `=== 'no-say'` — whether the
 * people bearing a harm had any say in it. That is real harm-accounting logic
 * and has nothing to do with institutions. It is why this guard's vocabulary
 * lists INSTITUTION NAMES and not the word "agency": a blanket rename of the
 * field would have silently broken it.
 *
 * The test for whether a name belongs here: does it assert something about the
 * INSTITUTION's relationship to us, or about OUR OWN behaviour? The first is a
 * claim we cannot support. The second is what this whole codebase exists to be
 * checkable about.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { sync: globSync } = require('glob');

/*
 * ─── SCOPE WAS 'src/**' AND THAT WAS A HOLE ────────────────────────────────
 *
 * Widened on 2026-09-10, after a whole-repo scan run before pushing found
 * what the src-only scope could not see:
 *
 *   scripts/test-nostr-keys.ts       published ['agency', 'CYBER_COMMAND']
 *                                    and ['clearance', 'UNCLASSIFIED'] as
 *                                    tags on a real Nostr event
 *   scripts/activate-distributed-comms.ts  agency: 'SOCOM' x2, 'NSA'
 *   scripts/test-distributed-comms.ts      'SOCOM' positional argument
 *   scripts/smoke/civilian-nr-smoke.ts     asserted the invented
 *                                    'UNCLASSIFIED' default this migration
 *                                    removed — so the smoke script was
 *                                    broken and nothing said so
 *   test/services/*.ts               fixtures under a top-level test/ dir
 *   two CSS files                    .classification.top_secret selectors
 *
 * A script that publishes to a relay is as public as the app, and a smoke
 * test outside the guard's reach is a check nobody is checking. `src/**` was
 * a convenient boundary, not a meaningful one.
 */
/*
 * WIDENED AGAIN on 2026-11-20 to the text people read first. The README said
 * "SOCOM standards" and nothing here could see it: every file in scope was code.
 * guard-public-claims reads the same files for retired product claims.
 */
const SCOPE = [
  'src/**/*.{ts,tsx}', 'scripts/**/*.{ts,mts,mjs}', 'test/**/*.{ts,tsx}',
  'README.md', 'index.html', 'docs/README.md', 'extension/store/*.md',
  'public/*.{html,md,txt,json,webmanifest,xml}', 'public/.well-known/*', 'public/**/*.{html,md}',
];

const FORBIDDEN = [
  { re: /\bSOCOM\b/, why: 'US Special Operations Command — asserts affiliation' },
  { re: /\bSPACE_FORCE\b/, why: 'US Space Force — asserts affiliation' },
  { re: /\bCYBER_COMMAND\b/, why: 'US Cyber Command — asserts affiliation' },
  /*
   * ADDED 2026-11-07: the words as a person reads them. The view that opens Starcom was named "Cyber Command",
   * U.S. Cyber Command's name, shown to the people a post about Starcom is for; the operator renamed it Intel
   * Watch. Its id stays CyberCommand (links, saved workspaces, the share handle), which this does not match:
   * it needs the space.
   */
  { re: /\bcyber command\b/i, why: "US Cyber Command's name — Starcom's view is Intel Watch" },
  { re: /\bNSA\b/, why: 'National Security Agency — asserts affiliation or sourcing' },
  { re: /\bDIA\b/, why: 'Defense Intelligence Agency — asserts affiliation or sourcing' },
  { re: /\bCIA\b/, why: 'Central Intelligence Agency — asserts affiliation or sourcing' },
  { re: /\bNRO\b/, why: 'National Reconnaissance Office — asserts affiliation' },
  /*
   * Added after the first sweep missed it. Word-boundary matched, which is
   * required: "coordiNATOr" and "denomiNATOr" both contain the letters and are
   * ordinary words. The occurrence that prompted this was a test using
   * 'NATO-COSMIC' as a junk value — COSMIC TOP SECRET is a real NATO marking,
   * so even a deliberately-invalid fixture was borrowing a real one.
   */
  { re: /\bNATO\b/, why: 'a real alliance and its markings — use a non-institutional placeholder' },
  { re: /\bInterpol\b|\bEuropol\b|\bGCHQ\b|\bFive Eyes\b/, why: 'asserts affiliation' },
  // The compliance phrasing specifically, since NIST alone is legitimate.
  { re: /SOCOM\s*\/\s*NIST|NIST\s*\/\s*SOCOM/, why: 'claims a certification neither body issued' },

  /*
   * ─── ADDED IN 7b, AFTER TWO COPIES OF A STANDARDS LIST GOT PAST ──────────
   *
   * IPFSService and AuthContext both carried
   *
   *   COMPLIANCE_STANDARDS: ['NIST-CSF-2.0', 'STIG', 'CNSA-2.0', 'CISA-PQC']
   *
   * and this guard saw none of it. Every pattern above names an ORGANISATION;
   * none named a STANDARD, and a standards list is the same claim by another
   * route — listing STIG says you have been assessed against a US DoD/DISA
   * implementation guide.
   *
   * ─── THE DISTINCTION THAT MATTERS HERE ───────────────────────────────────
   *
   * A published ALGORITHM SPECIFICATION is a checkable technical claim and
   * stays legitimate: this app really implements ML-KEM-768 (FIPS 203) and
   * ML-DSA-65 (FIPS 204), and saying so is verifiable by reading the code.
   *
   * A COMPLIANCE FRAMEWORK is an assertion about an audit that some body
   * performed on you. Nobody has audited this. So the patterns below match
   * frameworks and programmes, and deliberately do NOT match bare 'NIST' or
   * 'FIPS' — which is why 'NIST-CSF' is spelled out rather than caught by a
   * broad /NIST/.
   */
  { re: /\bSTIG\b|\bDISA\b/, why: 'a US DoD implementation guide / agency — asserts assessment against it' },
  { re: /\bCNSA\b/, why: "NSA's Commercial National Security Algorithm suite — asserts an NSA-approved posture" },
  { re: /\bCISA\b/, why: 'US Cybersecurity and Infrastructure Security Agency — asserts affiliation or endorsement' },
  { re: /\bFedRAMP\b|\bFISMA\b/, why: 'US federal authorisation programmes — nothing here has been authorised' },
  { re: /NIST[- ]CSF/, why: 'a framework organisations are audited against; bare NIST/FIPS algorithm references stay legitimate' },
  { re: /\bSOC\s?2\b|\bHIPAA\b|\bPCI[- ]DSS\b/, why: 'compliance regimes this app has not been assessed against' },
];

/**
 * Files that still carry a claim. DELETE ENTRIES as they are fixed; an entry
 * that no longer matches fails this guard, so the list cannot stop describing
 * the tree. Same ratchet as guard-no-classification.
 */
const ALLOWLIST = [
  // EMPTY. Every institutional claim found on 2026-09-09 has been removed, so
  // this guard is now a plain prohibition rather than a shrinking inventory.
  // Anything added here in future needs the same justification any exemption
  // does — and there is no good one: Starcom is not governmental.
];

/**
 * ─── COMMENTS ARE NOT STRIPPED, UNLIKE guard-no-classification ─────────────
 *
 * That guard strips them, because a comment explaining a purged defect must
 * not itself trip the check.
 *
 * Here the opposite is required. Two of the worst claims found were comments:
 *
 *   IPFSService.ts:1   // IPFS Service for Cyber Investigation Platform -
 *                      //   SOCOM/NIST Compliant Version
 *   nostrService.ts:5  // Uses SOCOM cybersecurity standards as baseline
 *
 * This repository is open source, so a comment is published text. A file
 * header claiming compliance with a US combatant command is the exposure,
 * whether or not any code reads it.
 *
 * The consequence for whoever finishes this migration: a note recording what
 * was removed must NOT name the institutions. Describe them — "six US
 * government and military institutions" — rather than listing them, or the
 * removal note reintroduces the claim it is documenting. This guard will say
 * so if you forget.
 */
const hits = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  return FORBIDDEN.filter(({ re }) => re.test(text));
};

const allowset = new Set(ALLOWLIST);
const files = SCOPE.flatMap((pattern) =>
  globSync(pattern, { dot: true, nodir: true, ignore: ['**/node_modules/**', 'scripts/guard-*.mjs'] }))
  .map((f) => f.replaceAll('\\', '/'));

const failures = [];
const incursions = [];
for (const file of files) {
  if (allowset.has(file)) continue;
  const found = hits(file);
  if (found.length) incursions.push({ file, found });
}

const stale = ALLOWLIST.filter((f) => fs.existsSync(f) && hits(f).length === 0);
const vanished = ALLOWLIST.filter((f) => !fs.existsSync(f));

if (incursions.length) {
  console.error('\nInstitutional-claims guard failed: a real institution is named in a file that is not allowlisted.\n');
  for (const { file, found } of incursions) {
    console.error(`  ${file}`);
    for (const f of found) console.error(`    ${f.re} — ${f.why}`);
  }
  console.error('\nStarcom is not governmental, and none of these institutions uses it.'
    + ' Naming one asserts a relationship we cannot support, in an open-source repository'
    + ' where the source is the publication.\n'
    + '  Standards are fine: FIPS 203/204, ML-KEM, ML-DSA, NIST-1/3/5 are checkable claims about algorithms.\n'
    + '  Attribution is fine: NOAA, EIA, CelesTrak and Natural Earth are feeds we actually consume.\n');
  failures.push(`${incursions.length} file(s) with new claims`);
}

if (stale.length || vanished.length) {
  console.error('\nInstitutional-claims guard failed: allowlist entries that no longer match.\n');
  for (const f of stale) console.error(`  ${f} — fixed; delete this entry`);
  for (const f of vanished) console.error(`  ${f} — file gone; delete this entry`);
  console.error('');
  failures.push(`${stale.length + vanished.length} stale entry/entries`);
}

if (failures.length) {
  console.error(`Institutional-claims guard: ${failures.length} problem(s).`);
  process.exit(1);
}

if (ALLOWLIST.length === 0) {
  console.log('Institutional-claims guard: clean. No source file claims affiliation with a'
    + ' government or military institution.');
} else {
  console.log(`Institutional-claims guard: ${ALLOWLIST.length - stale.length - vanished.length}`
    + ' file(s) still naming a real institution, all accounted for. Nothing new has been added.');
  console.log('  Fix a file, delete its allowlist entry, and this number falls.');
}
