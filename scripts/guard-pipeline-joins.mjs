#!/usr/bin/env node
/**
 * @asserts pipeline.ts matches the source it claims to describe, and every stage declared unwired still has no consumer.
 *
 * PIPELINE JOINS GUARD
 *
 * Checks src/services/intel/pipeline/pipeline.ts against the source it claims
 * to describe. Without this the declaration is a document, and this repository
 * already has twenty-one guards precisely because documents describing what
 * connects to what go stale and start lying.
 *
 * Three things are checked, and each corresponds to a defect that actually
 * shipped here:
 *
 *   PRODUCER EXISTS AND IS USED   A capability referenced by nothing outside
 *                                 its own file and its tests. The ingest, the
 *                                 manifest verifier, delegation, getRelays —
 *                                 all shipped this way, all looked complete.
 *
 *   CONSUMER EXISTS AND IS USED   The other half. Corroboration was computed
 *                                 for a long time and read by no mission;
 *                                 conflicts are detected and reach no case.
 *                                 A write nobody reads is not a connection.
 *
 *   SURFACE IS REACHABLE          A stage claiming an app must name a
 *                                 registered ApplicationId. Cases lived at a
 *                                 standalone route inside no registered app,
 *                                 so every audit that enumerated applications
 *                                 correctly concluded the stage did not exist.
 *
 * DELIBERATE LIMIT, stated rather than discovered later: this greps for
 * references, and a reference is not proof of reachability — the same limit
 * guard-activity-action-coverage records about itself. A join whose consumer
 * is called behind a condition nothing satisfies reads as connected here. Only
 * a test that drives the real path can catch that, which is why the joins
 * below also have tests.
 *
 * Usage: node scripts/guard-pipeline-joins.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const DECL = 'src/services/intel/pipeline/pipeline.ts';
const APP_IDS = 'src/components/Router/EnhancedApplicationRouter.tsx';

const decl = readFileSync(join(ROOT, DECL), 'utf8');

/** Pull the declared joins without importing TypeScript. */
const joins = [];
for (const m of decl.matchAll(
  /name:\s*'((?:[^'\\]|\\.)*)',\s*producer:\s*'([^']+)',\s*consumer:\s*'([^']+)'/g,
)) {
  joins.push({ name: m[1].replace(/\\'/g, "'"), producer: m[2], consumer: m[3] });
}

const invariants = [...decl.matchAll(/advanceInvariants:\s*\[([^\]]*)\]/g)]
  .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));

const surfaces = [...decl.matchAll(/kind:\s*'app';?\s*app:\s*'([^']+)'|kind:\s*'app',\s*app:\s*'([^']+)'/g)]
  .map((m) => m[1] ?? m[2])
  .filter(Boolean);

if (joins.length === 0) {
  console.error(`\n  PIPELINE JOINS GUARD — FAILED\n\n  Parsed no joins from ${DECL}.\n`
    + `  The declaration's shape changed and this guard is now blind; fix the parser.\n`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(join(ROOT, 'src')).map((f) => ({
  rel: relative(ROOT, f).split('\\').join('/'),
  text: readFileSync(f, 'utf8'),
}));

/**
 * Referenced by product code somewhere other than its own declaration.
 *
 * ─── WHY REFERENCES AND NOT IMPORTS ────────────────────────────────────────
 *
 * The first version of this asked "is it used in a file other than the one
 * defining it", which is a different question and the wrong one. It failed
 * `attachCase` (a handler bound to an onChange twelve lines below itself) and
 * `assertRestsOnEvidence` (called at the READY_FOR_PACKAGE transition in its own
 * module) — both live, both reachable, neither cross-module. Same-file wiring is
 * ordinary code, not a disconnection.
 *
 * What actually indicates the defect is a symbol with NO call site anywhere:
 * declared, exported, typechecked, tested, and never once reached. So count
 * every reference in product code and subtract the declarations. Zero means
 * nothing calls it, wherever it lives.
 */
function usedInProduct(symbol) {
  const refRe = new RegExp(`\\b${symbol}\\b`, 'g');
  const declRe = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?(?:function|const|class|interface|type)\\s+${symbol}\\b`,
    'g',
  );
  let uses = 0;
  for (const f of files) {
    if (f.rel.includes('__tests__')) continue;
    if (f.rel.endsWith('.test.ts') || f.rel.endsWith('.test.tsx')) continue;
    if (f.rel === DECL) continue;
    uses += (f.text.match(refRe) ?? []).length - (f.text.match(declRe) ?? []).length;
  }
  return uses > 0;
}

/** Defined anywhere at all — distinguishes "renamed" from "never wired". */
function definedAnywhere(symbol) {
  const re = new RegExp(`(?:function|const|class|interface|type)\\s+${symbol}\\b|${symbol}\\s*[(:]`);
  return files.some((f) => re.test(f.text));
}

const failures = [];

for (const j of joins) {
  for (const [role, symbol] of [['producer', j.producer], ['consumer', j.consumer]]) {
    if (!definedAnywhere(symbol)) {
      failures.push(`${j.name}\n      ${role} "${symbol}" does not exist. Renamed, or removed without updating the declaration.`);
    } else if (!usedInProduct(symbol)) {
      failures.push(`${j.name}\n      ${role} "${symbol}" exists and no product code calls it.\n      A ${role === 'producer' ? 'write nobody reads' : 'reader waiting on nothing'} is not a connection.`);
    }
  }
}

for (const inv of invariants) {
  if (!definedAnywhere(inv)) {
    failures.push(`advance invariant "${inv}" is declared and does not exist.`);
  }
}

/**
 * The inverse check: everything declared UNWIRED must still be unwired.
 *
 * A known-gaps list is usually where work goes to be forgotten. This one cannot
 * be, because wiring an entry up breaks the build until somebody promotes it to
 * a declared stage with a real producer and a real consumer. The list can only
 * shrink, and only on purpose.
 */
const unwired = [...decl.matchAll(/symbol:\s*'([^']+)',\s*\n\s*module:\s*'([^']+)'/g)]
  .map((m) => ({ symbol: m[1], module: m[2] }));

for (const u of unwired) {
  if (!definedAnywhere(u.symbol)) {
    failures.push(`UNWIRED "${u.symbol}" no longer exists in ${u.module}.\n      `
      + `If it was deleted, drop the entry. If it was renamed, update it.`);
  } else if (usedInProduct(u.symbol)) {
    failures.push(`UNWIRED "${u.symbol}" is now called by product code.\n      `
      + `This is good news and it means the declaration is out of date: promote it\n      `
      + `to a stage with a named producer and consumer, then remove it from UNWIRED.`);
  }
}

const appIds = readFileSync(join(ROOT, APP_IDS), 'utf8');
for (const app of new Set(surfaces)) {
  if (!new RegExp(`id:\\s*'${app}'`).test(appIds)) {
    failures.push(`stage surface claims app "${app}", which is not a registered application.\n      A stage nobody can navigate to reads as absent from outside — see Cases.`);
  }
}

if (failures.length) {
  console.error(`\n  PIPELINE JOINS GUARD — FAILED\n`);
  for (const f of failures) console.error(`    ${f}\n`);
  console.error(`  Either the pipeline lost a connection, or ${DECL}\n`
    + `  is describing something that is no longer true. Do not silence this by\n`
    + `  deleting the claim — a join that stopped existing is the defect.\n`);
  process.exit(1);
}

console.log(`\n  PIPELINE JOINS GUARD\n\n  ${joins.length} declared join(s), ${invariants.length} advance invariant(s)\n`
  + `  and ${new Set(surfaces).size} stage surface(s) all present in src/.\n`
  + `  ${unwired.length} capability declared unwired and still unwired.\n`);
