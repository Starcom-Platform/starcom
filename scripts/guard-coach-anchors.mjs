#!/usr/bin/env node
/**
 * @asserts Every control the coach points at exists in the app: a test id the coach names is rendered by some source file, literally or by a template that makes it.
 *
 * COACH ANCHORS GUARD (plan item 6.1)
 *
 * The coach (src/components/Coach/coachSteps.ts) points an intern at the next
 * control by its data-testid. Rename or remove that control and the coach
 * points at nothing, for every intern, with no error anywhere: it simply
 * offers "Go to…" forever on a screen that has moved. That is the drift
 * tutorial-mode.md chose a derived coach to avoid, so the build fails.
 *
 * A test id counts when a source file (not a test) renders it:
 *   data-testid="new-record"                  literally;
 *   'data-testid': 'link-candidate-input'     as an MUI inputProps entry;
 *   data-testid={`transition-to-${status}`}   by a template whose fixed start
 *                                             the coach's id begins with.
 * An anchor ending in "*" is a prefix, matched by a template that starts
 * with it (open-mission-* by data-testid={`open-mission-${id}`}).
 *
 * A coach file with no anchors, or none at all, fails: a guard that reads
 * nothing must not pass.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const COACH = 'src/components/Coach/coachSteps.ts';

function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (/\.[jt]sx?$/.test(entry) && !/\.(test|spec|vitest)\.[jt]sx?$/.test(entry)) yield full;
  }
}

if (!existsSync(join(ROOT, COACH))) {
  console.error(`\n  COACH ANCHORS GUARD: ${COACH} is missing, so there is nothing to check. Failing rather than passing on nothing.\n`);
  process.exit(1);
}
const coachText = readFileSync(join(ROOT, COACH), 'utf8');
const anchors = [...coachText.matchAll(/anchors:\s*\[([^\]]*)\]/g)]
  .flatMap((m) => [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((a) => a[1]));
if (anchors.length === 0) {
  console.error(`\n  COACH ANCHORS GUARD: ${COACH} names no anchors. Failing rather than passing on nothing.\n`);
  process.exit(1);
}

const literal = new Set();
const templates = new Set();
for (const file of sources(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (rel === COACH) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/data-testid=["']([^"']+)["']/g)) literal.add(m[1]);
  for (const m of text.matchAll(/['"]data-testid['"]\s*:\s*['"]([^'"]+)['"]/g)) literal.add(m[1]);
  for (const m of text.matchAll(/data-testid=\{`([^`$]*)\$\{/g)) if (m[1]) templates.add(m[1]);
}

const missing = anchors.filter((anchor) => {
  if (anchor.endsWith('*')) {
    const prefix = anchor.slice(0, -1);
    return ![...templates].some((t) => t.startsWith(prefix) || prefix.startsWith(t)) && ![...literal].some((l) => l.startsWith(prefix));
  }
  return !literal.has(anchor) && ![...templates].some((t) => anchor.startsWith(t));
});

if (missing.length > 0) {
  console.error('\n  COACH ANCHORS GUARD\n');
  console.error(`  ${missing.length} control(s) the coach points at no longer exist in src/:\n`);
  for (const m of missing) console.error(`    ${m}`);
  console.error(`\n  Give the control its test id back, or point the coach (${COACH}) at what replaced it.\n`);
  process.exit(1);
}
console.log(`Coach-anchors guard passed: every control the coach points at exists (${anchors.length} anchor(s) in ${COACH}).`);
