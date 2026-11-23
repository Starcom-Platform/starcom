#!/usr/bin/env node
/**
 * Pins Starcom's durable artifacts to public IPFS, and publishes the result —
 * including when the result is "not pinned".
 *
 * WHY
 *
 * The ruling directs every node to adopt a real mirror path for the correlated
 * host risk. Starcom's specification is served from one hosting account and its
 * snapshots live only inside a git repository, and four nodes have now
 * committed to build against that specification. Content addressing fixes that
 * — but only if the bytes are actually somewhere. A CID for content nobody
 * holds is a string.
 *
 * USES THE IPFS RPC API, not S3. Filebase exposes a Kubo-compatible endpoint
 * that returns the real CID directly, which avoids hand-rolling SigV4 signing
 * for something whose failure mode would be silent and subtle.
 *
 * WHAT IT REFUSES TO DO
 *
 *  - Invent a CID. This repository shipped an IPFS client that hashed content
 *    locally, prefixed "Qm" and returned it as a successful upload, so callers
 *    held identifiers for bytes that had never left the machine.
 *  - Record a CID it has not seen resolve. Every pin is fetched back through a
 *    public gateway and byte-compared against the source, because a pin nobody
 *    has retrieved is a claim rather than a fact.
 *  - Report success it did not have. If pinning fails or credentials are
 *    absent, it writes a manifest saying so. A missing manifest looks like
 *    "not run yet"; a manifest that states `pinned: false` and why is a fact a
 *    consumer can act on. This is the ratified practice — make the dependency
 *    declare its own failure rather than degrade quietly.
 *
 * NOT A SINGLE-PINNER DEPENDENCY. The manifest records sha256 beside every CID,
 * so anyone can re-pin identical bytes and obtain an identical CID. Losing this
 * provider costs a re-pin, not the archive — which keeps the independence audit
 * honest, since it warns that fixing a hosting dependency by acquiring a
 * provider dependency is a trade rather than a win.
 *
 * CREDENTIALS: FILEBASE_IPFS_RPC_API_ENDPOINT, FILEBASE_IPFS_RPC_API_KEY.
 * Deliberately NOT VITE_-prefixed — that namespace is compiled into the browser
 * bundle, which is how a bot token ended up served publicly from production.
 *
 * Usage: node scripts/pin-to-filebase.mjs [--dry-run]
 * Exit:  0 pinned, or cleanly reported as unpinned · 1 malformed invocation
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DRY = process.argv.includes('--dry-run');

/**
 * Hard bounds, because this runs inside the deploy build.
 *
 * A third party being slow must never be able to hang a deployment. This
 * repository already lost five months of deploys to a build that failed on its
 * first command; a build that HANGS is the same outage with a longer timeout.
 * When the budget is spent, remaining artifacts are recorded as skipped and the
 * build proceeds — the manifest says what was not pinned, which is a fact a
 * consumer can act on, unlike a deploy that never happened.
 */
const REQUEST_TIMEOUT_MS = 10_000;
const TOTAL_BUDGET_MS = 90_000;
const startedAt = Date.now();
const budgetLeft = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);
const GATEWAYS = ['https://ipfs.filebase.io/ipfs/', 'https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/'];
const MANIFEST_REPO = 'docs/spec/pinned-cids.json';
const MANIFEST_SERVED = 'public/spec/pinned-cids.json';

/** What is worth outliving this deployment: the things other nodes build against. */
const ARTIFACTS = [
  'docs/spec/nip-draft-attested-claims.md',
  'docs/spec/starcom-navcom-interchange.spec.md',
  'public/.well-known/ein-refusals.json',
  ...(fs.existsSync('docs/spec/vectors')
    ? fs.readdirSync('docs/spec/vectors').filter((f) => f.endsWith('.json')).map((f) => `docs/spec/vectors/${f}`)
    : []),
].filter((f) => fs.existsSync(f));

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function writeManifest(body) {
  const json = JSON.stringify(body, null, 2) + '\n';
  // The SERVED manifest is written every build, so what the site publishes is
  // always the truth about the current deploy — including "not pinned".
  if (fs.existsSync(path.dirname(MANIFEST_SERVED))) fs.writeFileSync(MANIFEST_SERVED, json);
  // The REPO manifest is the durable record others re-pin from, so it is only
  // updated by a run that actually pinned something. Otherwise every local
  // build without credentials would rewrite it to "unpinned" and the record
  // would be destroyed by the act of building.
  if (body.pinned) fs.writeFileSync(MANIFEST_REPO, json);
}

const endpoint = (process.env.FILEBASE_IPFS_RPC_API_ENDPOINT ?? '').replace(/\/+$/, '');
const apiKey = process.env.FILEBASE_IPFS_RPC_API_KEY;

if (DRY) {
  console.log(`\n  Dry run — ${ARTIFACTS.length} artifact(s) would be pinned.`);
  console.log(`  Credentials present: ${Boolean(endpoint && apiKey)}\n`);
  process.exit(0);
}

if (!endpoint || !apiKey) {
  console.log('\n  No IPFS RPC credentials — recording the artifacts as UNPINNED.\n');
  writeManifest({
    pinned: false,
    reason: 'FILEBASE_IPFS_RPC_API_ENDPOINT and FILEBASE_IPFS_RPC_API_KEY were not set at build time.',
    note: 'Stated rather than omitted. A consumer reading this knows these bytes exist only on the origin, and that losing the host loses them.',
    artifacts: ARTIFACTS.map((f) => ({ path: f, sha256: sha256(fs.readFileSync(f)) })),
  });
  process.exit(0);
}

/** Kubo-compatible add. Returns the CID the service actually stored. */
async function addToIpfs(file, bytes) {
  const form = new FormData();
  form.append('file', new Blob([bytes]), path.basename(file));
  const res = await fetch(`${endpoint}/api/v0/add?cid-version=1&pin=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`add ${res.status}: ${(await res.text()).slice(0, 140)}`);
  const text = (await res.text()).trim().split('\n').pop();
  const cid = JSON.parse(text).Hash;
  if (!cid) throw new Error('service returned no CID — refusing to guess one');
  return cid;
}

/** A pin nobody has retrieved is a claim. Try gateways in order; one is enough. */
async function verify(cid, expectedDigest) {
  for (const gw of GATEWAYS) {
    try {
      const r = await fetch(gw + cid, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!r.ok) continue;
      const got = Buffer.from(await r.arrayBuffer());
      if (sha256(got) === expectedDigest) return gw;
    } catch { /* try the next gateway */ }
  }
  return null;
}

const pinned = [];
const failures = [];

const skipped = [];

for (const file of ARTIFACTS) {
  const bytes = fs.readFileSync(file);
  const digest = sha256(bytes);
  if (budgetLeft() < REQUEST_TIMEOUT_MS * 2) {
    skipped.push({ path: file, sha256: digest, reason: 'time budget exhausted' });
    continue;
  }
  try {
    const cid = await addToIpfs(file, bytes);
    const gateway = await verify(cid, digest);
    if (!gateway) throw new Error(`stored as ${cid} but no gateway returned matching bytes`);
    pinned.push({ path: file, cid, sha256: digest, bytes: bytes.length, verifiedVia: gateway });
    console.log(`  pinned   ${file}  ${cid}`);
  } catch (err) {
    failures.push({ path: file, sha256: digest, error: err.message });
    console.log(`  FAILED   ${file} — ${err.message}`);
  }
}

writeManifest({
  pinned: failures.length === 0 && skipped.length === 0,
  ...(failures.length ? { reason: `${failures.length} of ${ARTIFACTS.length} artifact(s) could not be pinned and verified.` } : {}),
  note: 'sha256 is recorded beside every CID so anyone can re-pin identical bytes and obtain an identical CID. Losing this pinning provider costs a re-pin, not the archive.',
  gateways: GATEWAYS,
  artifacts: pinned.sort((a, b) => a.path.localeCompare(b.path)),
  ...(failures.length ? { unpinned: failures } : {}),
  ...(skipped.length ? { skipped } : {}),
});

console.log(`\n  ${pinned.length} pinned and verified, ${failures.length} failed, ${skipped.length} skipped for time. Manifest records all three.\n`);
