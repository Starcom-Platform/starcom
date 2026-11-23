#!/usr/bin/env node
/**
 * Copies the published format into public/ so it is FETCHABLE.
 *
 * The EIN consensus ratified Starcom's attested-claim protocol as the network
 * wire format, and three nodes committed to implement against it — one of them
 * blocking on it. The document and its conformance vectors lived in `docs/`,
 * which is not served by the deployed site. So the network agreed to build
 * against a specification nobody outside this repository could actually
 * retrieve.
 *
 * That is the cheapest possible failure and it survived three rounds of
 * review, because every reviewer had the repo checked out.
 *
 * This runs at build time rather than being a committed copy, so the served
 * spec cannot drift from the one the conformance gates check. A copy that can
 * go stale would be worse than no copy: an implementer would build against it
 * and pass nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'docs/spec');
const OUT = path.join(ROOT, 'public/spec');

// Only the parts a stranger needs to implement and prove conformance. The
// harm-accounting and interchange notes are internal design records.
const FILES = ['nip-draft-attested-claims.md', 'starcom-navcom-interchange.spec.md'];

if (!fs.existsSync(SRC)) {
  console.error('publish-spec: docs/spec not found');
  process.exit(2);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'vectors'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'mission-vectors'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'observation-vectors'), { recursive: true });

let copied = 0;
/*
 * ─── THE COMMITTED COPY THAT SHOULD NOT EXIST ──────────────────────────────
 *
 * public/spec/ is generated here at build time, for the reason in the header:
 * a committed copy can go stale, and an implementer who builds against a stale
 * spec passes nothing.
 *
 * Some of these files are nonetheless TRACKED — added before the directory was
 * ignored, and git does not stop tracking a file just because a later rule
 * would have excluded it. So the generated copy is committed, regenerated, and
 * free to drift from its source in between.
 *
 * That is not hypothetical. The kind-30083 resolution was written into
 * public/spec/, staged, and committed — while docs/spec/ still said the
 * opposite. The build then overwrote the working copy from the unchanged
 * source, so the repo held a spec that said two different things depending on
 * which file you opened.
 *
 * This reports it before overwriting anything, because after the copy the two
 * always agree and the evidence is gone.
 */
const trackedDrift = () => {
  let tracked = [];
  try {
    tracked = execFileSync('git', ['ls-files', 'public/spec'], { encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch { return; }
  if (!tracked.length) return;

  /*
   * Compared against git's COMMITTED copy, not the file on disk.
   *
   * The first version compared against the working file and always found
   * nothing, because this script clears public/spec before it runs — there was
   * no file left to compare. It reported "no drift" for the same reason a
   * scale reports zero with nothing on it.
   *
   * The committed blob is also the thing the question is actually about: the
   * working copy is regenerated on every build and cannot be stale for long,
   * while the committed one persists in the repository until someone rebuilds
   * and commits again.
   */
  const drifted = tracked.filter((t) => {
    const src = path.join(SRC, path.relative('public/spec', t));
    if (!fs.existsSync(src)) return false;
    let committed;
    try {
      committed = execFileSync('git', ['show', `HEAD:${t}`], { encoding: 'utf8' });
    } catch { return false; }
    return fs.readFileSync(src, 'utf8') !== committed;
  });

  if (!drifted.length) return;
  console.log('');
  console.log(`  SPEC DRIFT — ${drifted.length} tracked file(s) in public/spec differ from docs/spec:`);
  for (const d of drifted) console.log(`      ${d}`);
  console.log('');
  console.log('  public/spec is generated. The copy about to be overwritten was edited');
  console.log('  directly, or its source was changed without rebuilding. Whichever it');
  console.log('  was, the committed spec and the source spec disagreed until now.');
  console.log('');
  console.log('  Edit docs/spec. Consider `git rm --cached public/spec/*` so the');
  console.log('  generated copy stops being committed at all — which is what the');
  console.log('  header of this file assumes is already true.');
  console.log('');
};

trackedDrift();

for (const f of FILES) {
  const from = path.join(SRC, f);
  if (!fs.existsSync(from)) {
    console.error(`publish-spec: missing ${f}`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(OUT, f));
  copied++;
}

for (const f of fs.readdirSync(path.join(SRC, 'vectors'))) {
  if (!f.endsWith('.json') && f !== 'README.md') continue;
  fs.copyFileSync(path.join(SRC, 'vectors', f), path.join(OUT, 'vectors', f));
  copied++;
}

// The INGEST side: what Starcom does with a Navcom field observation. Published
// because Navcom is building a producer against a contract they could read and
// not test — twenty-odd accept/reject decisions, several non-obvious from the
// prose, discoverable otherwise only by having events silently dropped.
//
// Their index.json is generated by make-observation-vectors.ts alongside the
// vectors, so it is copied like any other file here.
for (const f of fs.readdirSync(path.join(SRC, 'observation-vectors'))) {
  if (!f.endsWith('.json') && f !== 'README.md') continue;
  fs.copyFileSync(path.join(SRC, 'observation-vectors', f), path.join(OUT, 'observation-vectors', f));
  copied++;
}

// The dispatch side: Mission Package + Dispatch Capability vectors. Published
// for the same reason as the attested-claim vectors — a second node was asked
// to implement dispatch against a document it could read but not test against.
for (const f of fs.readdirSync(path.join(SRC, 'mission-vectors'))) {
  if (!f.endsWith('.json') && f !== 'README.md') continue;
  fs.copyFileSync(path.join(SRC, 'mission-vectors', f), path.join(OUT, 'mission-vectors', f));
  copied++;
}

/*
 * ─── AN INDEX, BECAUSE THE POINTER LED NOWHERE ─────────────────────────────
 *
 * starcom-node.json advertises `interchange.conformanceVectors` and pointed at
 * `/spec/mission-vectors/` — a directory. Static hosting serves no listing for
 * a directory, so the path a peer was told to use returned 404 while eighteen
 * vectors sat behind it, each individually fetchable and none discoverable.
 *
 * Navcom is the audience for exactly these vectors, and was asked to implement
 * dispatch against a document it could read but not enumerate.
 *
 * Generated here rather than committed, for the reason the whole file exists:
 * an index listing eighteen files is wrong the moment a nineteenth is added,
 * and a stale index is worse than none because it reads as complete. The
 * attested-claim vectors get theirs from make-vectors.ts the same way.
 */
const missionVectors = fs.readdirSync(path.join(OUT, 'mission-vectors'))
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort()
  .map((file) => {
    const v = JSON.parse(fs.readFileSync(path.join(OUT, 'mission-vectors', file), 'utf8'));
    if (!v.name || !v.description) {
      // A blank row in an index is worse than a missing one: it looks like
      // coverage. Refuse rather than publish a vector nobody can identify.
      console.error(`publish-spec: ${file} has no name/description — cannot be indexed`);
      process.exit(1);
    }
    return { name: v.name, description: v.description, file };
  });

if (missionVectors.length === 0) {
  console.error('publish-spec: no mission vectors found — refusing to publish an empty index');
  process.exit(1);
}

fs.writeFileSync(
  path.join(OUT, 'mission-vectors', 'index.json'),
  JSON.stringify({
    format: 'Starcom-Navcom interchange: Mission Package and Dispatch Capability',
    specification: '/spec/starcom-navcom-interchange.spec.md',
    generatedBy: 'scripts/publish-spec.mjs',
    note: 'Each vector states what a conforming implementation must decide. A vector named ...-refused MUST be refused; refusing nothing is not conformance.',
    count: missionVectors.length,
    vectors: missionVectors,
  }, null, 2) + '\n',
);
copied++;

// An index a machine can start from without guessing filenames.
const manifest = {
  format: 'NIP-XX Attested Claims',
  schemaVersion: 2,
  specification: '/spec/nip-draft-attested-claims.md',
  vectors: '/spec/vectors/index.json',
  refusals: '/.well-known/ein-refusals.json',
  interchange: {
    specification: '/spec/starcom-navcom-interchange.spec.md',
    vectors: '/spec/mission-vectors/',
    kinds: { missionPackage: 30079, dispatchCapability: 30081, finding: 30082, refutation: 30083 },
  },
  // How an agent makes pictures and clips of the globe: the readable page
  // (written by publish-share-spec.mjs later in the build) and the contract.
  shareHandle: {
    specification: '/spec/starcom-share-handle.spec.md',
    contract: '/.well-known/starcom-share-contract.json',
  },
  note: 'Conformance vectors are the contract. An implementation that passes all of them is conformant; one that agrees with Starcom but fails a vector is not.',
};
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`publish-spec: ${copied} files served at /spec/`);
