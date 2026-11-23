#!/usr/bin/env node
/**
 * @asserts CaseReplayPanel's claim about which case-history actions it can account for matches the producers that actually exist.
 *
 * ACTIVITY-ACTION COVERAGE GUARD
 *
 * CaseReplayPanel tells a reader which parts of a case's history it can
 * account for. That claim is only worth making if it cannot drift.
 *
 * The obvious implementation — a hand-written list of "actions we don't
 * record" — is exactly the artefact that goes stale and starts lying: the day
 * someone adds a STATUS_CHANGED producer, the panel keeps telling readers
 * status changes are unrecorded, and now it understates the record instead of
 * overstating it. Wrong in the other direction is still wrong.
 *
 * So the list lives in one constant, and this guard checks it against the
 * actions that actually have producers in src/. Adding or removing a producer
 * without updating the constant fails the build, which is the only way the
 * panel's coverage sentence stays true by construction.
 *
 * A "producer" is a non-test reference to CaseActivityAction.X outside the
 * replay engine itself — the engine READS actions, it never writes them, and
 * counting it would mark every action as covered.
 *
 * KNOWN LIMIT, stated rather than implied: this greps for REFERENCES, and a
 * reference is not proof of reachability. An action whose write sits behind a
 * condition nothing satisfies reads as covered here. That is not hypothetical —
 * it is precisely how STATUS_CHANGED hid: the call existed, gated on an
 * `actorId` the hook's interface did not even expose, so the code was present
 * and unreachable and any grep would have called it a producer.
 *
 * So this guard catches the vocabulary drifting away from the code. It does NOT
 * catch a producer that exists but cannot run. Only a test that drives the real
 * path can, which is why caseManagerAdapter.test.ts asserts the STATUS_CHANGED
 * entry is written on a call that passes no actor at all.
 *
 * ─── A CHECK THAT WAS TRIED AND REMOVED ────────────────────────────────────
 *
 * REQUIREMENT_ANSWERED reached RECORDED_CASE_ACTIONS while answerRequirement
 * had no UI caller, so the panel briefly promised to explain an event nothing
 * could produce. The obvious repair — find the method enclosing each write and
 * require it to have a caller — was implemented here and then removed, because
 * it does not work and the reason generalises:
 *
 *   Reachability is TRANSITIVE. answerRequirement was referenced by its hook
 *   wrapper, so it had a caller; the hook had none, and the chain still read as
 *   reachable. Following the chain by name then fails the other way — createCase,
 *   addComment, shareCase and updateCaseStatus are all genuinely reachable and
 *   appear in no .tsx at all, because the component's handler is named something
 *   else. Four false positives out of fifteen writers.
 *
 * A check with that error rate is worse than no check: it gets an allowlist,
 * the allowlist gets entries, and the guard becomes noise that still cannot
 * answer the question. The remedy stays a test that drives the real path.
 * See CasesDashboard.requirements.test.tsx for the requirement actions.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const ENUM_FILE = 'src/types/intel/IntelCaseUI.ts';
const COVERAGE_FILE = 'src/services/intel/replay/activityCoverage.ts';
const REPLAY_DIR = 'src/services/intel/replay/';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function fail(msg) {
  console.error(`\n  ACTIVITY-ACTION COVERAGE GUARD — FAILED\n\n${msg}\n`);
  process.exit(1);
}

// 1. The enum's members, in declaration order.
const enumSrc = readFileSync(join(ROOT, ENUM_FILE), 'utf8');
const enumBlock = enumSrc.match(/export enum CaseActivityAction\s*\{([\s\S]*?)\}/);
if (!enumBlock) fail(`Could not find CaseActivityAction in ${ENUM_FILE}.`);
const allActions = [...enumBlock[1].matchAll(/^\s*([A-Z_]+)\s*=/gm)].map((m) => m[1]);
if (allActions.length === 0) fail('CaseActivityAction parsed as empty — the enum shape changed.');

// 2. Which of them anything actually writes.
const produced = new Set();
for (const file of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (/__tests__|\.test\.tsx?$|\.vitest\.ts$/.test(rel)) continue;
  if (rel.startsWith(REPLAY_DIR)) continue; // reads actions, never writes them
  if (rel === COVERAGE_FILE) continue;      // the declaration under test
  const src = readFileSync(file, 'utf8');
  for (const action of allActions) {
    if (src.includes(`CaseActivityAction.${action}`)) produced.add(action);
  }
}

// 3. What the constant claims.
const coverageSrc = readFileSync(join(ROOT, COVERAGE_FILE), 'utf8');
const claimed = (name) => {
  const block = coverageSrc.match(new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!block) fail(`Could not find ${name} in ${COVERAGE_FILE}.`);
  // Accepts either `CaseActivityAction.X` (preferred — typed) or a bare 'X'.
  return new Set([
    ...[...block[1].matchAll(/CaseActivityAction\.([A-Z_]+)/g)].map((m) => m[1]),
    ...[...block[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]),
  ]);
};
const claimedRecorded = claimed('RECORDED_CASE_ACTIONS');
const claimedUnrecorded = claimed('UNRECORDED_CASE_ACTIONS');

// 4. Compare.
const actualRecorded = new Set(allActions.filter((a) => produced.has(a)));
const actualUnrecorded = new Set(allActions.filter((a) => !produced.has(a)));
const problems = [];

const diff = (a, b) => [...a].filter((x) => !b.has(x));

for (const a of diff(actualRecorded, claimedRecorded)) {
  problems.push(
    `  ${a} now HAS a producer but is not in RECORDED_CASE_ACTIONS.\n` +
    `    The panel is understating what it can account for. Move it across.`
  );
}
for (const a of diff(claimedRecorded, actualRecorded)) {
  problems.push(
    `  ${a} is listed as RECORDED but nothing writes it.\n` +
    `    The panel is claiming coverage it does not have — the exact failure this guard exists for.`
  );
}
for (const a of diff(actualUnrecorded, claimedUnrecorded)) {
  problems.push(`  ${a} has no producer and is missing from UNRECORDED_CASE_ACTIONS.`);
}
for (const a of diff(claimedUnrecorded, actualUnrecorded)) {
  problems.push(
    `  ${a} is listed as UNRECORDED but a producer exists.\n` +
    `    Readers are being told this is not recorded when it is.`
  );
}

const missing = allActions.filter((a) => !claimedRecorded.has(a) && !claimedUnrecorded.has(a));
for (const a of missing) problems.push(`  ${a} appears in neither list — every action must be accounted for.`);

if (problems.length) {
  fail(
    `${COVERAGE_FILE} no longer matches what the code actually writes:\n\n` +
    problems.join('\n\n') +
    `\n\n  Producers found: ${[...actualRecorded].sort().join(', ') || '(none)'}` +
    `\n  No producer:     ${[...actualUnrecorded].sort().join(', ') || '(none)'}`
  );
}

console.log(
  `\n  ACTIVITY-ACTION COVERAGE GUARD\n\n` +
  `  ${actualRecorded.size}/${allActions.length} case actions have a producer.\n` +
  `  Recorded:   ${[...actualRecorded].sort().join(', ') || '(none)'}\n` +
  `  Unrecorded: ${[...actualUnrecorded].sort().join(', ') || '(none)'}\n\n` +
  `  CaseReplayPanel's coverage statement matches what the code writes.\n`
);
