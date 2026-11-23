#!/usr/bin/env node
/**
 * @asserts Every Nostr kind this project mints is narrowed by tag and validated by shape, so a foreign event at the same integer is filtered rather than misread.
 *
 * KIND COLLISION GUARD
 *
 * ─── THE SCENARIO THIS PREPARES FOR ────────────────────────────────────────
 *
 * Nostr kind numbers are a shared namespace with no registry that binds anyone.
 * A future NIP may allocate 30079, 30081, 30082, 30083, 30090 or 30091 to
 * something entirely unrelated. That is not a conflict to be won or lost; it is
 * two protocols sharing an integer, which the namespace has always permitted.
 *
 * It only becomes a defect if a kind number is ever SUFFICIENT to treat an
 * event as ours. Then a stranger's event at our number is admitted, verified
 * against the wrong shape, and either refused confusingly or — worse — read.
 *
 * ─── THE INVARIANT ─────────────────────────────────────────────────────────
 *
 * Every subscription for a kind this project MINTS must narrow further: by `d`
 * tag, `t` tag, `e`/`p` reference, author, or explicit ids. The kind is an
 * address; the tag namespace is the identity. Hold that, and a future
 * allocation costs nothing — foreign events are filtered rather than misread,
 * and no migration is needed.
 *
 * ─── WHY BORROWED KINDS ARE EXEMPT ─────────────────────────────────────────
 *
 * 30023 (NIP-23 long-form) and 30078 (NIP-78 app data) are not ours. At those
 * numbers this project is a guest in someone else's namespace, and reading
 * broadly is legitimate — the intel discovery filter deliberately pulls kind 1
 * and 30023 from the public firehose with only `since`/`limit`, then filters
 * client-side. Requiring narrowing there would forbid discovery, which is a
 * different activity from claiming a number.
 *
 * ─── WHAT IT DOES NOT CATCH ────────────────────────────────────────────────
 *
 * That the narrowing tag is the RIGHT one. A subscription narrowed by the wrong
 * `d` tag passes here and returns nothing, which fails visibly at runtime
 * rather than silently admitting strangers. This closes the admit-strangers
 * hole, not every filter bug.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
/**
 * The GENERATOR, not the file it emits.
 *
 * public/.well-known/starcom-node.json is a build artifact, gitignored, and
 * written at step 27 of the build — sixteen steps after this guard runs. Reading
 * it here passed locally only because a previous build had left one behind; on a
 * fresh clone it would not exist. The generator is also the file a human edits,
 * which is the one worth checking.
 */
const DESCRIPTOR = 'scripts/publish-node-descriptor.mjs';

/** Numbers this project minted. Borrowed kinds (30023 NIP-23, 30078 NIP-78) are absent by design. */
const MINTED = new Map([
  [30079, 'Mission Package'], [30081, 'Dispatch Capability'],
  [30082, 'Attested Claim'],  [30083, 'Refutation'],
  [30084, 'Roster Item'],
  [30090, 'Team State'],      [30091, 'Team Announcement'],
]);

/** Any of these in the same filter literal means the kind is not doing the work alone. */
const NARROWING = ["'#", '"#', 'authors', 'ids:'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(join(ROOT, 'src'))
  .map((f) => ({ rel: relative(ROOT, f).split('\\').join('/'), text: readFileSync(f, 'utf8') }))
  .filter((f) => !f.rel.includes('__tests__') && !/\.test\.tsx?$/.test(f.rel));

/** Identifiers bound directly to a minted number, so indirection cannot hide a subscription. */
const aliases = new Map();
for (const f of files) {
  for (const m of f.text.matchAll(/(?:export\s+)?const\s+([A-Z0-9_]+)\s*=\s*(\d{5})\b/g)) {
    if (MINTED.has(Number(m[2]))) aliases.set(m[1], Number(m[2]));
  }
}

const failures = [];
const subscribed = new Set();

for (const f of files) {
  const lines = f.text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/kinds:\s*\[([^\]]*)\]/);
    if (!m) continue;

    const kinds = m[1].split(',').map((s) => s.trim()).filter(Boolean)
      .map((tok) => (/^\d+$/.test(tok) ? Number(tok) : aliases.get(tok.replace(/.*\./, '')) ?? aliases.get(tok)))
      .filter((k) => MINTED.has(k));
    if (kinds.length === 0) continue;
    kinds.forEach((k) => subscribed.add(k));

    // The enclosing object literal: this line plus a bounded look-around.
    const window = lines.slice(Math.max(0, i - 4), i + 9).join('\n');
    if (!NARROWING.some((n) => window.includes(n))) {
      failures.push(`${f.rel}:${i + 1}\n      subscribes to ${kinds.map((k) => `${k} (${MINTED.get(k)})`).join(', ')} `
        + `with nothing but the kind.\n      A future NIP allocating that number would have its events admitted here.`);
    }
  }
}

/** The public claim must not under-report what this node reads. */
const descriptorSrc = readFileSync(join(ROOT, DESCRIPTOR), 'utf8');
const consumesBlock = descriptorSrc.match(/consumes:\s*\[([\s\S]*?)\n  \],/);
if (!consumesBlock) {
  console.error(`\n  KIND COLLISION GUARD — FAILED\n\n  Could not find the consumes block in ${DESCRIPTOR}.\n`
    + `  It was restructured and this guard is now blind; fix the parser.\n`);
  process.exit(1);
}
const declared = new Set([...consumesBlock[1].matchAll(/kind:\s*(\d+)/g)].map((m) => Number(m[1])));
for (const k of subscribed) {
  if (!declared.has(k)) {
    failures.push(`${DESCRIPTOR}\n      does not declare that this node consumes ${k} (${MINTED.get(k)}), and it does.\n`
      + `      A peer reads this file to learn what can be sent here.`);
  }
}

/**
 * The other half of the public claim: `publishes` must not advertise a kind
 * nothing can emit.
 *
 * `consumes` is already checked against real subscriptions. This side was a
 * promise a reader had to take on faith, and it was already false: the
 * descriptor advertised kind 30083 while buildRefutation had no product
 * importer at all. A peer reading that would wait for refutations this node
 * cannot send.
 *
 * A kind counts as publishable when the module defining its constant is
 * imported by product code. That is a proxy for reachability, not proof of a
 * publish call — but it is exactly the condition that separated 30083 (zero
 * importers) from the three kinds that do ship, and it is the same test UNWIRED
 * uses in the pipeline declaration.
 *
 * Enforced in both directions, so the marker cannot rot: an unmarked kind needs
 * a reachable definer, and a marked one must not have quietly acquired one.
 */
const publishesBlock = descriptorSrc.match(/publishes:\s*\[([\s\S]*?)\n  \],/);
if (!publishesBlock) {
  console.error(`\n  KIND COLLISION GUARD — FAILED\n\n  Could not find the publishes block in ${DESCRIPTOR}.\n`);
  process.exit(1);
}

const published = [...publishesBlock[1].matchAll(/kind:\s*(\d+)([\s\S]*?)(?=\n    \{|$)/g)]
  .map((m) => ({
    kind: Number(m[1]),
    builder: m[2].match(/builder:\s*'([^']+)'/)?.[1],
    notYetPublished: /notYetPublished:\s*true/.test(m[2]),
  }));

/**
 * Does product code CALL this symbol anywhere?
 *
 * The first version of this asked whether the module defining a kind's constant
 * had a value importer, and that conflated two different things. Wiring
 * refutation READING — RefutationStore imports refutationIdentifier and
 * contestedState from refutation.ts — made the module reachable while nothing
 * could still build a refutation. The guard reported the notYetPublished marker
 * as stale when it was exactly true: this node could receive disagreement and
 * not voice it.
 *
 * So the question is asked of the BUILDER named in the descriptor, not of the
 * module around it. Same counting rule as guard-pipeline-joins: references in
 * product code, minus declarations. Zero means nothing constructs the payload,
 * whatever else that file is imported for.
 */
/**
 * Files that NAME symbols without calling them. The pipeline declaration's
 * UNWIRED entries carry symbols in string literals precisely because nothing
 * calls them, so counting it made a capability look wired by virtue of being
 * recorded as unwired.
 */
const DECLARATIONS = new Set(['src/services/intel/pipeline/pipeline.ts']);

function builderIsCalled(symbol) {
  const refRe = new RegExp(`\\b${symbol}\\b`, 'g');
  const declRe = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?(?:function|const|class)\\s+${symbol}\\b`, 'g');
  let uses = 0;
  for (const f of files) {
    if (DECLARATIONS.has(f.rel)) continue;
    uses += (f.text.match(refRe) ?? []).length - (f.text.match(declRe) ?? []).length;
  }
  return uses > 0;
}

for (const p of published) {
  if (!p.builder) {
    failures.push(`${DESCRIPTOR}\n      advertises publishing ${p.kind} (${MINTED.get(p.kind)}) and names no builder.\n`
      + `      Add builder: '<symbol>' so this claim can be checked rather than believed.`);
    continue;
  }
  const emittable = builderIsCalled(p.builder);
  if (!p.notYetPublished && !emittable) {
    failures.push(`${DESCRIPTOR}\n      advertises publishing ${p.kind} (${MINTED.get(p.kind)}), but nothing calls\n`
      + `      ${p.builder}(). A peer would wait for events this node cannot construct.\n`
      + `      Either wire it up, or mark the entry notYetPublished: true.`);
  } else if (p.notYetPublished && emittable) {
    failures.push(`${DESCRIPTOR}\n      marks ${p.kind} (${MINTED.get(p.kind)}) notYetPublished, but ${p.builder}()\n`
      + `      now has product callers. Good news, and the claim is stale: remove the marker.`);
  }
}

if (failures.length) {
  console.error(`\n  KIND COLLISION GUARD — FAILED\n`);
  for (const f of failures) console.error(`    ${f}\n`);
  console.error(`  A kind number must never be sufficient to treat an event as ours.\n`
    + `  See kindPolicy in ${DESCRIPTOR}.\n`);
  process.exit(1);
}

const pending = published.filter((p) => p.notYetPublished).length;
console.log(`\n  KIND COLLISION GUARD\n\n  ${MINTED.size} minted kind(s); every subscription narrows past the kind.\n`
  + `  ${subscribed.size} consumed and all declared publicly.\n`
  + `  ${published.length - pending} published and reachable, ${pending} declared not-yet-published.\n`);
