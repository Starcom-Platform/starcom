#!/usr/bin/env node
/**
 * @asserts No field this codebase requires on receipt is missing from the specification a peer implements from.
 *
 * SPEC DRIFT GUARD
 *
 * ─── WHAT THIS CATCHES ─────────────────────────────────────────────────────
 *
 * A field this codebase REQUIRES on receipt, missing from a specification a
 * peer implements from. That combination has exactly one outcome: the peer
 * builds to the document, publishes something we reject, and the rejection
 * reads as a bug on their side rather than a hole in ours.
 *
 * It had already happened. `modality` and `weakBacking` are mandatory in
 * ForeignFindingStore's REQUIRED_FIELDS and in the NIP, and appeared NOWHERE in
 * starcom-navcom-interchange.spec.md — the document handed to Navcom. Anyone
 * implementing kind 30082 from it would have had every attestation refused.
 *
 * ─── WHY A GUARD AND NOT A REVIEW ──────────────────────────────────────────
 *
 * The interchange spec's own header already says the two documents must not
 * drift, and names the NIP as the one that wins. They drifted anyway, because a
 * sentence of intent is not a check. This is the check.
 *
 * ─── WHAT IT DOES NOT CATCH ────────────────────────────────────────────────
 *
 * Presence of a field name, not agreement about its meaning. A spec could name
 * `weakBacking` and describe it wrongly and this would pass. It closes the
 * silent-omission hole, which is the one that actually occurred; it does not
 * make the documents equivalent.
 */
import { readFileSync, existsSync } from 'node:fs';

const ROOT = process.cwd();
const SOURCE = 'src/services/intel/federation/ForeignFindingStore.ts';
const SPECS = [
  'docs/spec/starcom-navcom-interchange.spec.md',
  'docs/spec/nip-draft-attested-claims.md',
];

const src = readFileSync(`${ROOT}/${SOURCE}`, 'utf8');
const block = src.match(/const REQUIRED_FIELDS = \[([\s\S]*?)\] as const;/);

if (!block) {
  console.error(`\n  SPEC DRIFT GUARD — FAILED\n\n`
    + `  Could not find REQUIRED_FIELDS in ${SOURCE}.\n`
    + `  It was renamed or restructured and this guard is now blind; fix the parser.\n`);
  process.exit(1);
}

/** "method.modality" -> "modality". The specs document leaves, not paths. */
const required = [...block[1].matchAll(/'([^']+)'/g)]
  .map((m) => m[1].split('.').pop())
  .filter((f, i, a) => a.indexOf(f) === i);

if (required.length === 0) {
  console.error(`\n  SPEC DRIFT GUARD — FAILED\n\n  Parsed no fields from REQUIRED_FIELDS.\n`);
  process.exit(1);
}

/*
 * The specs may not be in the tree this is running against.
 *
 * `.vercelignore` excludes `docs/*` and `*.md` and re-includes `docs/spec/**`,
 * and the deploy build's export did not contain them — readFileSync threw
 * ENOENT and took the whole production build down, for a document that is not
 * a build input. The local gate is where this check earns its keep: there is
 * no CI, `npm run guards` runs on the full tree, and a spec that has drifted
 * is caught before anything is pushed.
 *
 * Absent in a DEPLOY EXPORT is reported and skipped — the same shape
 * guard-untracked-imports uses when it finds no git repository. Absent with a
 * repository present is still a failure, because locally the file must exist.
 * A MISSING spec is a different fact from a DRIFTED one, and conflating them
 * cost a deploy.
 */
const missingSpecs = SPECS.filter((spec) => !existsSync(`${ROOT}/${spec}`));
const inDeployExport = !existsSync(`${ROOT}/.git`);
if (missingSpecs.length === SPECS.length && inDeployExport) {
  console.log(`\n  Spec-drift guard: no specification in this tree (a deploy build export).`);
  console.log(`  ${SPECS.length} spec(s) are checked by the local gate, which reads the full tree.\n`);
  process.exit(0);
}

const failures = [];
for (const spec of SPECS) {
  if (missingSpecs.includes(spec)) continue;
  const text = readFileSync(`${ROOT}/${spec}`, 'utf8');
  const missing = required.filter((f) => !new RegExp(`\\b${f}\\b`).test(text));
  if (missing.length) failures.push({ spec, missing });
}

if (failures.length) {
  console.error(`\n  SPEC DRIFT GUARD — FAILED\n`);
  for (const f of failures) {
    console.error(`    ${f.spec}\n      does not mention: ${f.missing.join(', ')}\n`);
  }
  console.error(`  These are required on receipt by REQUIRED_FIELDS in\n`
    + `  ${SOURCE}, so a node implementing from the\n`
    + `  document above publishes attestations this one refuses. Add the field to\n`
    + `  the spec, or stop requiring it — but do not leave a peer building to a\n`
    + `  document that cannot succeed.\n`);
  process.exit(1);
}

console.log(`\n  SPEC DRIFT GUARD\n\n  ${required.length} required attestation field(s) documented in all `
  + `${SPECS.length} specification(s).\n`);
