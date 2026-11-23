#!/usr/bin/env node
/**
 * Strip insignificant whitespace from the JSON this deployment serves.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * `public/` ships 41MB of JSON and GeoJSON, and it is pretty-printed. The
 * indentation is 15MB of it — a quarter of the whole deployment, spent on
 * newlines no browser reads. Twenty deployments of that filled the account's
 * storage and nearly paused it.
 *
 * It runs on `dist/`, never on `public/`, and that distinction is the whole
 * design. The repository keeps readable, diffable bytes; only the served copy
 * is squeezed. Two digest systems depend on that:
 *
 *   - `scripts/lib/assetProvenance.mjs` records the sha256 of archived source
 *     snapshots, so a claim can be traced to the bytes it came from. Those
 *     digests are taken over the committed files, which this never touches.
 *
 *   - `public/geopolitical/manifest.json` records, per Natural Earth dataset,
 *     the digest of the file we publish. Nothing verifies it at runtime, which
 *     is exactly why it must stay true: a provenance record describing bytes
 *     we no longer serve is worse than none. Files it names are left alone —
 *     read from the manifest, not hardcoded, so adding a dataset keeps working.
 *
 * ─── THE ONE THING THAT MUST STAY IN STEP ──────────────────────────────────
 *
 * `src/geopolitical/integrity/verifyGeopoliticalAssets.ts` fetches artifacts
 * at runtime and compares sha256 of the *served* bytes against
 * `geopolitical-manifest.json`. Minifying an artifact it verifies, without
 * re-hashing, makes the app report its own assets as corrupt. So this rewrites
 * that manifest from the bytes it just produced. If you add another manifest
 * that digests served files, it has to be regenerated here too.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIST = path.resolve(process.cwd(), 'dist');
const INTEGRITY_MANIFEST = path.join(DIST, 'geopolitical/manifest/geopolitical-manifest.json');
const PROVENANCE_MANIFEST = path.join(DIST, 'geopolitical/manifest.json');

/** Files whose published digest is recorded as a provenance claim, so their bytes are fixed. */
function provenanceHeldFiles() {
  const held = new Set();
  if (!fs.existsSync(PROVENANCE_MANIFEST)) return held;
  try {
    const manifest = JSON.parse(fs.readFileSync(PROVENANCE_MANIFEST, 'utf8'));
    for (const dataset of manifest.datasets ?? []) {
      if (dataset.file && dataset.sha256) held.add(path.join(DIST, 'geopolitical', dataset.file));
    }
  } catch {
    // A provenance manifest we cannot read is a reason to minify nothing in
    // that directory, not a reason to guess which files it protects.
    throw new Error(`Could not read ${PROVENANCE_MANIFEST}; refusing to minify files it may protect.`);
  }
  return held;
}

function* jsonFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonFiles(full);
    else if (/\.(json|geojson)$/.test(entry.name)) yield full;
  }
}

function minify(file) {
  const before = fs.statSync(file).size;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return 0;
  }
  let compact;
  try {
    compact = JSON.stringify(JSON.parse(text));
  } catch {
    // Not our file to fix: a .json that does not parse is someone else's bug,
    // and failing the build over it would hide that behind this step.
    console.warn(`  skipped (unparseable): ${path.relative(DIST, file)}`);
    return 0;
  }
  // Compare bytes, not string length: `length` counts UTF-16 code units, so a
  // file full of accented place names looks shrinkable on every run and gets
  // rewritten forever, reporting a saving it never made.
  const after = Buffer.byteLength(compact, 'utf8');
  if (after >= before) return 0;
  fs.writeFileSync(file, compact);
  return before - after;
}

/** Re-hash every artifact the runtime verifier will fetch, from the bytes now on disk. */
function regenerateIntegrityManifest() {
  if (!fs.existsSync(INTEGRITY_MANIFEST)) {
    console.warn('  no geopolitical-manifest.json in dist; nothing to re-hash');
    return 0;
  }
  const manifest = JSON.parse(fs.readFileSync(INTEGRITY_MANIFEST, 'utf8'));
  let updated = 0;
  for (const artifact of manifest.artifacts ?? []) {
    // Manifest paths are repo-relative; the verifier serves them with `public/`
    // stripped. Artifacts outside `public/` never reach the deployment.
    if (!artifact.path.startsWith('public/')) continue;
    const served = path.join(DIST, artifact.path.replace(/^public\//, ''));
    if (!fs.existsSync(served)) continue;
    const bytes = fs.readFileSync(served);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha256 === artifact.sha256) continue;
    artifact.sha256 = sha256;
    artifact.sha1 = crypto.createHash('sha1').update(bytes).digest('hex');
    artifact.bytes = bytes.length;
    updated += 1;
  }
  if (manifest.summary) {
    manifest.summary.totalBytes = (manifest.artifacts ?? []).reduce((sum, a) => sum + a.bytes, 0);
  }
  fs.writeFileSync(INTEGRITY_MANIFEST, JSON.stringify(manifest));
  return updated;
}

if (!fs.existsSync(DIST)) {
  console.error('minify-dist-json: no dist/ to minify. Run after `vite build`.');
  process.exit(1);
}

const held = provenanceHeldFiles();
let saved = 0;
let touched = 0;
for (const file of jsonFiles(DIST)) {
  if (held.has(file)) continue;
  const freed = minify(file);
  if (freed > 0) {
    saved += freed;
    touched += 1;
  }
}

const rehashed = regenerateIntegrityManifest();

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)}MB`;
console.log(`minify-dist-json: ${mb(saved)} removed from ${touched} files`);
if (held.size > 0) console.log(`  left intact (provenance digest recorded): ${held.size}`);
console.log(`  re-hashed in geopolitical-manifest.json: ${rehashed}`);
