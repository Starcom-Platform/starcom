#!/usr/bin/env node
/**
 * Generates public/.well-known/starcom-health.json at build time.
 *
 * The EIN ruling extended canary/health polling to every node's published
 * health endpoint. Starcom had none, so it was the one node in the network
 * that could not be monitored — a gap nobody noticed for three rounds because
 * every reviewer could read the repository directly.
 *
 * Two constraints, borrowed from NavCom's statement of the same thing, because
 * they are the right ones and there is no reason to restate them differently:
 *
 *   - It carries NO operator state. No presence, no activity, no counts of
 *     people, nothing about anyone using the software.
 *   - It is a BUILD ARTIFACT. It reports what the deployed code is, never what
 *     anyone is doing with it. Schema drift and provenance decay are exactly
 *     what it is for.
 *
 * A third, specific to this node: the provenance distribution here comes from
 * the same module the freshness guard fails builds on, so this endpoint cannot
 * report an asset as reproducible while the gate calls it UNREPRODUCIBLE.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { surveyAssets, HALF_LIFE_DAYS } from './lib/assetProvenance.mjs';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public/.well-known/starcom-health.json');

const sha = process.env.VERCEL_GIT_COMMIT_SHA
  ?? process.env.GITHUB_SHA
  ?? (() => {
    try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); }
    catch { return 'unknown'; }
  })();

/*
 * Whether the tree this was built from had uncommitted changes.
 *
 * A commit sha alone lets a build claim a commit that does not describe it: every
 * local build from a working tree names HEAD, and a share card then says "build
 * 341ecd4e" about code that only partly is that commit. A reader who fetches the
 * commit to check the image gets something else. Null means the question could not be
 * asked (no git available), which is a different answer from "clean".
 */
const treeDirty = (() => {
  try { return execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0; }
  catch { return null; }
})();

const vectorsDir = path.join(ROOT, 'docs/spec/vectors');
const vectorCount = fs.existsSync(vectorsDir)
  ? fs.readdirSync(vectorsDir).filter((f) => f.endsWith('.json') && f !== 'index.json').length
  : 0;

const assets = surveyAssets();

// The distribution, which is the number another node actually wants: how much
// of what this node publishes can still be checked by anyone.
const provenance = { archived: 0, 'upstream-dated': 0, UNREPRODUCIBLE: 0, absent: 0, undated: 0 };
for (const a of assets) {
  if (!a.present) provenance.absent++;
  else if (!a.dated) provenance.undated++;
  else provenance[a.retention.state]++;
}

const health = {
  node: 'starcom',
  role: 'sense-making — attested claims over public record',
  buildSha: sha,
  /** True when the build came from a tree with uncommitted changes; null if unknown. */
  buildTreeDirty: treeDirty,
  builtAt: new Date().toISOString(),
  format: {
    name: 'NIP-XX Attested Claims',
    schemaVersion: 2,
    eventKinds: [30082, 30083],
    specification: '/spec/nip-draft-attested-claims.md',
    vectors: '/spec/vectors/index.json',
    vectorCount,
    externalImplementations: 0,
  },
  provenance: {
    halfLifeDays: HALF_LIFE_DAYS,
    distribution: provenance,
    assets: assets.map((a) => (a.present && a.dated
      ? {
          label: a.label,
          snapshot: a.snapshot.slice(0, 10),
          ageDays: Math.round(a.ageDays),
          recency: Number(a.recency.toFixed(3)),
          retention: a.retention.state,
          stale: a.stale,
        }
      : { label: a.label, retention: a.present ? 'undated' : 'absent' })),
  },
  refusals: '/.well-known/ein-refusals.json',
  carries: 'build state only — no operator state, no activity, no counts of people',
  note: 'A green build says the deployed code is current and its assets are within tolerance. It does NOT say Starcom has published anything recently; the verify half of the cycle can run indefinitely while nothing new is fetched or emitted.',
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(health, null, 2) + '\n');
console.log(`publish-health: ${OUT.replace(ROOT + '/', '')} (${vectorCount} vectors, provenance ${JSON.stringify(provenance)})`);
