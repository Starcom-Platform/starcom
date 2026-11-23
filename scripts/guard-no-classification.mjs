#!/usr/bin/env node
/**
 * @asserts No clearance-tier classification vocabulary reaches a governed file,
 *          and the migration allowlist can only shrink.
 *
 * ─── WHY THIS GUARD EXISTS ──────────────────────────────────────────────────
 *
 * Starcom is an Open Source Intelligence application for the Earth Intelligence
 * Network, running on a Decentralized Intelligence Grid. Its proposition is
 * claims anyone can check. A clearance tier is the opposite of that, and this
 * repository accumulated one anyway — six separate systems' worth, none of
 * which enforced anything:
 *
 *   IntelItemUI's own comment      "all externally-sourced data must be
 *                                   UNCLASSIFIED. Additional levels retained
 *                                   in the type for future multi-tenant /
 *                                   classified deployments" — three of four
 *                                   values illegal by policy, kept for a
 *                                   product that does not exist.
 *   ClassificationUtils            compareClassificationLevel() returned 0 for
 *                                   EVERY pair of levels.
 *   securityConfig.isAllowed()     the only code reading clearanceLevel to make
 *                                   a decision, in a file imported by nothing.
 *   PQCryptoService           compared a label stored INSIDE the envelope
 *                                   being decrypted against a label the caller
 *                                   passed in, then threw "Access denied:
 *                                   insufficient clearance level". The caller
 *                                   supplied both sides.
 *   SecureLogger                   classification === 'TOP_SECRET' meant ALWAYS
 *                                   EMIT in production — backwards.
 *   SecureStorageManager           wrote the label into sessionStorage and never
 *                                   read it back.
 *
 * And the reason it is not merely wasteful: a mission marked SECRET was
 * encrypted at rest, decrypted for packaging, then published in plaintext to
 * five public relays with `classification: "SECRET"` in the manifest. The label
 * crossed the wire; the protection did not. That is worse than no label,
 * because it reads as though something enforced it — and a relay publish cannot
 * be recalled.
 *
 * ─── HOW THIS GUARD IS MEANT TO BE USED ─────────────────────────────────────
 *
 * It is a SHRINKING INVENTORY, not a pass/fail gate on day one. ALLOWLIST holds
 * every file that still carries the vocabulary. The migration deletes entries.
 * Two rules make it ratchet in one direction only:
 *
 *   1. A governed file carrying the vocabulary that is NOT allowlisted fails.
 *      Nothing new can be added.
 *   2. An allowlisted file that no longer carries it ALSO fails, demanding the
 *      entry be deleted. So the list cannot silently stop describing reality —
 *      which is the failure mode every stale plan in this repository has had.
 *
 * When ALLOWLIST is empty the guard becomes a plain prohibition and stays green.
 *
 * ─── WHAT IT DELIBERATELY DOES NOT GOVERN ───────────────────────────────────
 *
 * "Classification" is an ordinary English word and two subsystems use it
 * correctly. See EXEMPT_DOMAINS. The forbidden vocabulary below is deliberately
 * the TIER NAMES and the purged TYPE names rather than the word itself, which
 * is why those two currently match nothing — but they are named anyway, so a
 * future broadening of the patterns cannot quietly swallow them.
 *
 * The bare property name `classification` is also not forbidden here. Removing
 * it is a type-level change the TypeScript compiler enumerates exactly; a
 * regex over it is what destroyed a previous attempt at this migration.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
// Same shape the sibling guards use — `glob` is CommonJS, so a named ESM
// import of globSync fails at load.
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
const SCOPE = ['src/**/*.{ts,tsx}', 'scripts/**/*.{ts,mts,mjs}', 'test/**/*.{ts,tsx}', 'src/**/*.css'];

/**
 * Real domain vocabulary. These are NOT clearance tiers and must never be
 * rewritten — a blanket rename across them is a live risk, so the reasons are
 * recorded rather than left to be rediscovered.
 */
const EXEMPT_DOMAINS = [
  {
    dir: 'src/geopolitical/',
    reason: 'Border classification from Natural Earth FEATURECLA — CanonicalClassification '
      + 'maps disputed/indefinite/maritime line types. Cartography, not clearance.',
  },
  {
    dir: 'src/solar-system/',
    reason: 'Solar flare classification (X2.4, M-class). Astronomy, not clearance.',
  },
];

/**
 * Occurrences that are legitimate and PERMANENT, each with a stated reason.
 *
 * Distinct from ALLOWLIST, which is remaining work that must shrink to nothing.
 * These will still be here when the migration is finished, so they need a
 * justification rather than a deadline — and the justification is checked, both
 * for substance and for staleness, because an exemption nobody can explain is
 * how a guard becomes decoration.
 */
const JUSTIFIED = [
  {
    file: 'scripts/codemod-classification.mjs',
    reason: 'The type-aware migration tool itself. It resolves candidate sites through '
      + "the TypeChecker and must name the tier union it is looking for, so the "
      + 'vocabulary is its input rather than a claim. Kept rather than deleted because '
      + 'it is the only thing that can prove the exempt taxonomies are not tier-typed — '
      + 'the check that saved the geopolitical and solar-system domains from a regex.',
  },
  {
    file: 'src/services/intel/IntelWorkspaceManager.ts',
    reason: 'Holds LEGACY_RUNGS_REQUIRING_PROTECTION, the one-time migration that '
      + 'backfills visibility/sensitivity onto records stored with only a tier. A '
      + 'migration has to name the values it migrates FROM. It cannot be retired on '
      + 'a schedule either: state version 1 sits in real browsers, and there is no '
      + 'way to know when the last one has loaded — so this is permanent rather than '
      + 'remaining work, which is why it is justified and not allowlisted.',
  },
  {
    file: 'src/services/intel/__tests__/handlingBackfill.test.ts',
    reason: 'Seeds workspace state exactly as an older build wrote it — version 1, '
      + 'tiers, no axes — to prove the migration above fills the axes in with the '
      + 'same boundary the Stage 6a bridge used. The fixture must contain the legacy '
      + 'values or it is not testing the migration. Same permanence as the migration '
      + 'it covers.',
  },
  {
    file: 'src/services/exchange/__tests__/signing.wireRoundTrip.test.ts',
    reason: 'Signs a manifest carrying the LEGACY wire key to prove that packages '
      + 'produced before PackageManifest.classification became visibility still '
      + 'verify — the manifest digest walks the keys it finds, so this is what makes '
      + 'the interchange change safe to land ahead of Navcom updating. A signed '
      + 'package is immutable and can arrive at any time, so the fixture is '
      + 'permanent rather than remaining work.',
  },
  {
    file: 'src/services/crypto/PQCryptoService.test.ts',
    reason: 'Asserts read-tolerance for envelopes encrypted BEFORE the purge, which '
      + 'carry metadata.classification: "SECRET". The test has to contain the legacy '
      + 'value to prove old local records stay decryptable — dropping the field '
      + 'without this test would make them permanently unreadable.',
  },
];

/**
 * The vocabulary itself. Every entry was checked against the tree before being
 * listed: at the time of writing all 341 occurrences across 171 files are tier
 * usage, with no false positives.
 */
const FORBIDDEN = [
  { re: /\bIntelItemClassification\b/, why: 'the purged four-tier record type' },
  { re: /\bIntelReportClassification\b/, why: 'the purged four-tier record type' },
  { re: /\bIntelClassification\b/, why: 'the purged five-tier type, including a COMPARTMENTED tier for a compartment system that never existed' },
  { re: /\bClassificationLevel\b/, why: 'the purged crypto-envelope tier enum' },
  { re: /\bClassificationUtils\b/, why: 'a stub whose comparator returned 0 for every pair of levels' },
  { re: /\bclearanceLevel\b/, why: 'a clearance this network cannot grant, check, or revoke' },
  { re: /'UNCLASSIFIED'|"UNCLASSIFIED"/, why: 'a clearance tier' },
  { re: /'CONFIDENTIAL'|"CONFIDENTIAL"/, why: 'a clearance tier' },
  { re: /'TOP_SECRET'|"TOP_SECRET"/, why: 'a clearance tier' },
  { re: /'COMPARTMENTED'|"COMPARTMENTED"/, why: 'a clearance tier' },
  { re: /'UNRESTRICTED'|"UNRESTRICTED"/, why: 'a clearance tier' },
  // Added after Stage 2 found a gap: SettingsInitializer.tsx passed
  // `classification: 'PUBLIC'` and the guard could not see it, because the
  // original vocabulary omitted the bottom tier. All 7 occurrences were checked
  // and every one is tier usage — 'PUBLIC' only ever appears here as the floor
  // of a ladder. The new vocabulary's value is lowercase 'public', so this does
  // not collide with it.
  { re: /'PUBLIC'|"PUBLIC"/, why: "a clearance tier (the new vocabulary's value is lowercase 'public')" },
  // 'SECRET' last: the narrowest pattern, and the one most likely to acquire a
  // false positive later. Checked today — every occurrence is tier usage.
  { re: /'SECRET'|"SECRET"/, why: 'a clearance tier' },

  /*
   * ─── ADDED IN 7b, AFTER THE GUARD PROVED BLIND A SECOND TIME ─────────────
   *
   * Every pattern above matches an IDENTIFIER or a quoted tier constant. None
   * of them could see a clearance asserted in PROSE — and the app was asserting
   * one on screen, from WalletStatusMini, which GlobalHeader renders:
   *
   *   'CLEARANCE ACTIVATED'   a toast, on wallet sign-in
   *   'CLEARANCE REVOKED'     a toast, on disconnect
   *   'CLEARANCE ACTIVE'      the modal header, beside a status dot
   *   'Clearance Active'      the header button's tooltip
   *   ariaLabel="Starcom Security Clearance Status"
   *
   * All four were derived from `isAuthenticated`, which means one thing: this
   * device proved control of a wallet key. Nobody granted a clearance and there
   * is no body to grant one. A guard that governs the type system while the UI
   * says CLEARANCE ACTIVE to every visitor is measuring the wrong layer.
   *
   * Word-bounded and specific to the assertion, not to the word: "clearance"
   * alone would fire on any honest discussion of why there is no clearance
   * system, including these comments. What is forbidden is CLAIMING one.
   */
  { re: /CLEARANCE\s+(ACTIVE|ACTIVATED|REVOKED|GRANTED|DENIED|PENDING|LEVEL)/i,
    why: 'a clearance state asserted in user-facing text; nobody grants one here' },
  { re: /SECURITY\s+CLEARANCE/i, why: 'a clearance this network cannot grant, check, or revoke' },

  /*
   * CSS, added with the scope widening on 2026-09-10. Two stylesheets carried
   * `.classification.unclassified` through `.classification.top_secret` badge
   * rules whose only producer — a renderer that scanned report prose for tier
   * words — had been deleted in Stage 8b. Dead styling for a badge nobody
   * emits is one `className` away from being live again.
   */
  { re: /\.classification\.(unclassified|confidential|secret|top_secret)\b/i,
    why: 'a tier-modifier CSS selector; the badge it styles was removed in Stage 8b' },

  /*
   * ─── ADDED IN STAGE 5, AFTER THE GUARD PROVED BLIND ──────────────────────
   *
   * The original vocabulary caught UPPERCASE tiers and the purged type names.
   * It could not see three more ladders that were sitting in plain sight:
   *
   *   SecurityClearance = 'unclassified'|'alpha'|'beta'|'gamma'|'omega'|'command'
   *     — an INVENTED clearance system, in an OSINT application. Held as live
   *       React state in AuthContext.
   *   FolderIntelReportPackageService's own InformationVisibility
   *     = 'public'|'internal'|'confidential'|'restricted'|'top-secret'
   *     — a tier ladder wearing the honest vocabulary's NAME, which is worse
   *       than an honest ladder because it reads as already migrated.
   *   determineClearanceLevel()
   *     — maps TOP_SECRET->omega, SECRET->beta, CONFIDENTIAL->alpha. Two
   *       invented ladders translating between each other, gating nothing.
   *
   * Nothing anywhere compares or gates on a clearance value — checked by
   * grepping every ===/!==/>=/includes against requiredClearance, userClearance
   * and clearanceLevel, which returns nothing at all.
   *
   * Only unambiguous spellings are listed. 'confidential' and 'restricted'
   * lowercase are NOT forbidden: WebCrawlerResults uses
   * `security: 'open'|'protected'|'restricted'|'vulnerable'` to describe a
   * WEBSITE's access posture, which is a real observation, and 'confidential'
   * appears as free-text tag content in test data. 'alpha'/'beta'/'gamma' are
   * ordinary release-channel words. Those unions get removed along with their
   * type names rather than by matching their members.
   */
  { re: /\bSecurityClearance\b/, why: "an invented clearance ladder ('alpha'..'command')" },
  { re: /\bclassificationLevel\b/, why: 'a clearance tier field' },
  { re: /\brequiredClearance\b/, why: 'a clearance nothing checks' },
  { re: /\buserClearance\b/, why: 'a clearance nothing checks' },
  { re: /\bdetermineClearanceLevel\b/, why: 'maps one invented ladder onto another' },
  { re: /'top-secret'|'top_secret'/, why: 'a clearance tier, lowercased' },
  { re: /'unclassified'/, why: 'a clearance tier, lowercased' },
];

/**
 * Files that still carry the vocabulary. DELETE ENTRIES as they are migrated;
 * an entry that no longer matches fails this guard on purpose.
 *
 * Grouped by the concept each belongs to, which is also the migration order:
 * the independent leaves come out first, so the core record type is touched
 * last and its blast radius is not compounded by five other systems.
 */
const ALLOWLIST = [
  // EMPTY as of 2026-09-10. Every file that carried clearance-tier vocabulary
  // has been migrated, and this guard is now a plain prohibition rather than a
  // shrinking inventory — the same shape guard-no-institutional-claims reached.
  //
  // It began at 170 files. The count is in the commit history rather than here,
  // because a number in a comment goes stale and this one no longer has a job.
  //
  // Adding an entry here means reintroducing a clearance ladder. There is no
  // good reason to: Starcom is an open-source intelligence application, the
  // handling axes in src/types/intel/IntelItemUI.ts say everything the ladder
  // was reaching for, and every rule that ever read a tier turned out to be
  // either broken or unread. See JUSTIFIED above for the two permanent
  // exceptions, both of which exist to keep OLD DATA readable, not to mark new
  // data.
];

const stripComments = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const isExempt = (file) => EXEMPT_DOMAINS.some((d) => file.startsWith(d.dir));

/** Which forbidden patterns a file's CODE contains. Comments are stripped, so a
 *  note explaining what was purged does not itself trip the guard. */
function hits(file) {
  const code = stripComments(fs.readFileSync(file, 'utf8'));
  return FORBIDDEN.filter(({ re }) => re.test(code));
}

const allowset = new Set(ALLOWLIST);
const justifiedset = new Set(JUSTIFIED.map((j) => j.file));
const files = SCOPE.flatMap((pattern) =>
  globSync(pattern, { ignore: ['**/node_modules/**', 'scripts/guard-*.mjs'] }))
  .map((f) => f.replaceAll('\\', '/'));

const failures = [];

// ── 1. A stale exemption is itself a stale claim. ───────────────────────────
for (const d of EXEMPT_DOMAINS) {
  if (!fs.existsSync(d.dir)) {
    failures.push(`exempt domain no longer exists: ${d.dir} — delete the entry`);
  }
}

// ── 2. Nothing new may acquire the vocabulary. ──────────────────────────────
const incursions = [];
for (const file of files) {
  if (isExempt(file) || allowset.has(file) || justifiedset.has(file)) continue;
  const found = hits(file);
  if (found.length) {
    incursions.push({ file, found });
  }
}

// ── 2b. A justification must be real, and must still describe the tree. ────
for (const j of JUSTIFIED) {
  if (!j.reason || j.reason.trim().length < 40) {
    failures.push(`justified entry without a substantive reason: ${j.file}`);
    continue;
  }
  if (!fs.existsSync(j.file)) {
    failures.push(`justified entry names a file that no longer exists: ${j.file} — delete it`);
    continue;
  }
  if (hits(j.file).length === 0) {
    failures.push(`justified entry no longer carries the vocabulary: ${j.file} — delete it`);
  }
}

// ── 3. The allowlist may only shrink. An entry that no longer matches must be
//      deleted, or the list stops describing the tree — which is exactly how
//      every stale plan in this repository started.
const stale = [];
for (const file of ALLOWLIST) {
  if (!fs.existsSync(file)) continue; // deleted outright: handled below
  if (hits(file).length === 0) stale.push(file);
}
const vanished = ALLOWLIST.filter((f) => !fs.existsSync(f));

// ── Report ─────────────────────────────────────────────────────────────────
const remaining = ALLOWLIST.length - stale.length - vanished.length;

if (incursions.length) {
  console.error('\nClassification guard failed: forbidden vocabulary in files that are not allowlisted.\n');
  for (const { file, found } of incursions) {
    console.error(`  ${file}`);
    for (const f of found) console.error(`    ${f.re} — ${f.why}`);
  }
  console.error('\nStarcom does not operate a clearance system. Use `visibility`'
    + " ('public' | 'limited' | 'private') for where something may go, and"
    + " `sensitivity` ('open' | 'careful' | 'protected') for what publishing it"
    + ' could cost someone. Both live in src/types/intel/IntelItemUI.ts.\n');
  failures.push(`${incursions.length} file(s) with new occurrences`);
}

if (stale.length || vanished.length) {
  console.error('\nClassification guard failed: allowlist entries that no longer match.\n');
  for (const f of stale) console.error(`  ${f} — migrated; delete this entry`);
  for (const f of vanished) console.error(`  ${f} — file gone; delete this entry`);
  console.error('\nThe allowlist is an inventory of remaining work. An entry that no'
    + ' longer describes the tree makes the count a lie.\n');
  failures.push(`${stale.length + vanished.length} stale allowlist entry/entries`);
}

if (failures.length) {
  console.error(`Classification guard: ${failures.length} problem(s).`);
  process.exit(1);
}

if (ALLOWLIST.length === 0) {
  console.log('Classification guard: clean. No clearance-tier vocabulary in src/ outside'
    + ` ${JUSTIFIED.length} justified occurrence(s):`);
  for (const j of JUSTIFIED) console.log(`  ${j.file}\n    ${j.reason}`);
} else {
  console.log(`Classification guard: ${remaining} file(s) still carrying clearance-tier`
    + ' vocabulary, all accounted for in the allowlist. Nothing new has been added.');
  console.log('  Migrate a file, delete its allowlist entry, and this number falls.');
}
