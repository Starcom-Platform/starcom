#!/usr/bin/env node
/**
 * @asserts Capabilities this project decided not to have are absent from the built bundle, not merely disabled by configuration.
 *
 * Asserts that capabilities this project has decided not to have are ABSENT
 * FROM THE BUILT BUNDLE — not merely disabled by configuration.
 *
 * ─── CONFIGURED OFF IS NOT THE SAME AS IMPOSSIBLE ──────────────────────────
 *
 * Google Analytics is a fair example of how thin the difference is. It is
 * correctly gated: main.tsx requires an enable flag, a measurement id, and for
 * that id not to be the placeholder, and production sets none of them. It never
 * fires today, and someone did that carefully.
 *
 * The loader is still in the bundle. One environment variable in a hosting
 * dashboard turns on third-party tracking of a tool people use to investigate
 * institutional corruption — sending every visitor's IP and page path to a
 * company that answers subpoenas. Nobody would have decided that. Somebody
 * would have set a variable.
 *
 * The distinction matters legally and it matters operationally:
 *
 *   CONFIGURED OFF   we could turn it on, so we could be asked what we
 *                    collected, and asked to start collecting
 *   ABSENT           the capability is not in the artefact. There is nothing to
 *                    turn on and nothing to produce.
 *
 * "We do not have that data" is a weak answer when the code to gather it ships
 * with the product. It is a very strong one when the code is not there and
 * anyone can check the bundle.
 *
 * So the list below is not a policy document. It is a build-time assertion
 * about what the shipped artefact can do, verifiable by anyone who downloads it.
 *
 * ─── WHY IT SCANS THE BUILD RATHER THAN THE SOURCE ─────────────────────────
 *
 * Source-level checks miss what a dependency drags in. A transitive package
 * that phones home is exactly the case where an assertion about our own code
 * would pass while the shipped artefact does the thing anyway.
 *
 * Usage: node scripts/guard-absent-capabilities.mjs [--dist dist] [--url origin]
 * Exit:  0 every forbidden capability is absent · 1 one is present
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : d; };
const DIST = flag('--dist', 'dist');
const URL_ORIGIN = flag('--url', null);

/**
 * Capabilities deliberately not shipped.
 *
 * Each entry says what it forbids, why, and — importantly — what would have to
 * change for it to be legitimately removed from this list. A guard with no exit
 * criteria becomes something people work around.
 */
const FORBIDDEN = [
  {
    name: 'third-party analytics',
    patterns: ['googletagmanager.com', 'google-analytics.com', 'analytics.google.com'],
    why: 'Sends visitor IPs and page paths to a third party that answers subpoenas. '
       + 'On a tool used to investigate corruption, that is an operational risk to '
       + 'the user before it is a liability risk to us — and being a GDPR controller '
       + 'over investigators is not a position worth holding for pageview counts.',
    removeWhen: 'Never, for this product.',
  },
  {
    name: 'error reporting that can capture content',
    patterns: ['sentry.io', 'bugsnag.com', 'rollbar.com', 'browser-intake', 'datadoghq.com'],
    why: 'Crash reporters capture surrounding state. On this app the surrounding '
       + 'state is somebody\'s investigation. A breadcrumb containing a subject '
       + 'identifier is a disclosure we cannot retract and did not intend.',
    removeWhen: 'Never for a hosted reporter. A self-hosted one that strips content '
       + 'is a different question and would need its own entry.',
  },
  {
    name: 'covert sign-in record',
    patterns: ['signin_receipt', 'serverless_pin_ok'],
    why: 'A receipt pinning a wallet address and timestamp to IPFS — public, permanent, '
       + 'content-addressed. That is "this person used this tool at this time", '
       + 'published irrevocably, and unlike a corporate analytics record there is '
       + 'nobody to ask to delete it.',
    // NARROWED. The first version of this entry also forbade '/api/pin', which
    // caught two unrelated call sites — IPFSService.pinContent and
    // IntelReportPackageManager — that pin content a USER CHOSE to pin. That is
    // a legitimate feature which happens to be broken, not a capability anyone
    // decided against, and stretching a guard to cover it would have made the
    // guard mean two things at once.
    //
    // Whether user content should transit a server at all is a separate
    // question, and guard-no-server-surface.mjs is where it belongs.
    removeWhen: 'Never. A record of who signed in is the thing this platform '
       + 'most specifically should not hold.',
  },
  {
    name: 'commerce through this project\'s infrastructure',
    patterns: ['/api/listings', '/api/purchases'],
    why: 'Listings and purchases handled by a server this project operates make it a '
       + 'party to payment regulation, consumer protection and tax nexus — the reason '
       + 'the handlers were deleted in b7283a86. The client outlived them: an app-wide '
       + 'provider fetched /api/listings for every visitor on every load, and an '
       + 'unrouted Buy button posted a hardcoded placeholder wallet address and '
       + 'displayed a "receipt". Nobody decided to run a marketplace. Somebody would '
       + 'only have had to route one.',
    removeWhen: 'A deliberate decision to support trading, with its regulatory position '
       + 'settled first, and a flow that does not transit this project\'s servers '
       + '(on-chain, peer to peer). Then this entry is rewritten for that flow — not '
       + 'deleted to make a build pass.',
  },
  {
    name: 'session replay',
    patterns: ['fullstory.com', 'hotjar.com', 'logrocket', 'clarity.ms', 'smartlook'],
    why: 'Records the screen. The screen contains the investigation.',
    removeWhen: 'Never.',
  },
  {
    name: 'an OSINT search backend this project would operate',
    patterns: ['/api/osint'],
    why: 'The /osint page sent search, graph, investigation, timeline, map, OPSEC, '
       + 'blockchain and dark-web lookups to /api/osint. No handler for that path was ever '
       + 'in this repository. In development each service returned made-up sample data; '
       + 'outside development every call failed. So the page looked like a working tool '
       + 'and never was one. A search backend run by this project would also see every '
       + 'query an investigator typed. The page was removed on 2026-09-12.',
    removeWhen: 'A decision to operate that backend, with where queries go and who can '
       + 'read them settled first. Rebuilding the page on sources a browser reaches '
       + 'directly would not need this path, and would leave this entry in place.',
  },
];

/**
 * Capabilities we intend to make absent and cannot yet.
 *
 * Listed so the gap is visible rather than forgotten, and so nobody reads this
 * file as a claim that it is already closed.
 */
const PENDING = [
  {
    name: 'signing on the user\'s behalf',
    patterns: ['generateSecretKey', 'finalizeEvent'],
    why: 'While the bundle can mint a key and sign an event, the app is capable of '
       + 'publishing as a user. Under NIP-07 the key lives in an extension and '
       + 'Starcom can only REQUEST a signature — at which point the signature is '
       + 'cryptographic proof of who published, rather than something we assert.',
    blockedBy: 'The SIWS to NIP-07 migration. Until then these symbols are expected '
       + 'in the bundle and their presence is not a regression.',
  },
];

const found = (haystack, pattern) => haystack.includes(pattern);

function scanLocal() {
  if (!fs.existsSync(DIST)) return null;
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|css|html)$/.test(e.name)) files.push(p);
    }
  };
  walk(DIST);
  return files.map((f) => ({ file: f, text: fs.readFileSync(f, 'utf8') }));
}

async function scanRemote(origin) {
  const html = await (await fetch(origin, { signal: AbortSignal.timeout(20000) })).text();
  const assets = [...html.matchAll(/\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g)].map((m) => m[0]);
  const out = [{ file: origin, text: html }];
  // Bounded: the entry bundle and the largest chunks carry anything that phones
  // home. Fetching every chunk on every run would make this too slow to keep.
  for (const a of [...new Set(assets)].slice(0, 12)) {
    try {
      const t = await (await fetch(origin + a, { signal: AbortSignal.timeout(30000) })).text();
      out.push({ file: origin + a, text: t });
    } catch { /* a chunk that will not load cannot ship a capability */ }
  }
  if (assets.length > 12) {
    console.log(`  note  ${assets.length} assets referenced, ${12} scanned — remote mode is a spot check.`);
    console.log('        The local --dist scan is the exhaustive one.');
  }
  return out;
}

console.log('');
const corpus = URL_ORIGIN ? await scanRemote(URL_ORIGIN) : scanLocal();

if (!corpus) {
  // As the bundle-secret and cache-policy guards beside it in `npm run gates` do: a caller with no build yet (a
  // fresh clone running `npm run verify` before its first `npm run build`) skips this on purpose and says so. The
  // build itself runs this guard after Vite, where a dist/ always exists, so nothing ships unscanned.
  if (process.env.ALLOW_NO_DIST === 'true') {
    console.log(`  absent-capabilities guard: no ${DIST}/ and ALLOW_NO_DIST=true — skipped ON PURPOSE.`);
    console.log('  Run after a build, or pass --url, for the scan.\n');
    process.exit(0);
  }
  console.log(`  No build at ${DIST}/ and no --url given. Run a build, or pass --url.`);
  console.log('  Skipping rather than passing: an unscanned bundle is not a clean one.');
  console.log('  Set ALLOW_NO_DIST=true to skip deliberately.\n');
  process.exit(1);
}

console.log(`  ABSENT-CAPABILITY GUARD — ${corpus.length} artefact(s)${URL_ORIGIN ? ` from ${URL_ORIGIN}` : ` in ${DIST}/`}\n`);

let failures = 0;
for (const cap of FORBIDDEN) {
  const hits = [];
  for (const { file, text } of corpus) {
    for (const p of cap.patterns) if (found(text, p)) hits.push({ file, p });
  }
  if (hits.length) {
    failures++;
    console.log(`  PRESENT  ${cap.name}`);
    for (const h of hits.slice(0, 4)) console.log(`             ${h.p}  in  ${h.file}`);
    console.log(`             ${cap.why.split('. ')[0]}.`);
  } else {
    console.log(`  absent   ${cap.name}`);
  }
}

console.log('');
for (const cap of PENDING) {
  const present = corpus.some(({ text }) => cap.patterns.some((p) => found(text, p)));
  console.log(`  ${present ? 'pending ' : 'absent  '} ${cap.name}${present ? '' : '  — now removable from PENDING'}`);
  if (present) console.log(`             blocked by: ${cap.blockedBy.split('.')[0]}.`);
}

console.log('');
if (failures) {
  console.log(`  ${failures} forbidden capability present in the shipped artefact.`);
  console.log('');
  console.log('  This is not a lint failure. "We do not collect that" is a weak answer');
  console.log('  while the code to collect it ships with the product, and a strong one');
  console.log('  when anyone can check the bundle and find it missing.\n');
  process.exit(1);
}
console.log('  Every forbidden capability is absent from the shipped artefact.');
console.log('  Not disabled — not present.\n');
