#!/usr/bin/env node
/**
 * Finds components that place themselves at the same point on screen.
 *
 * ─── WHAT THIS IS FOR ──────────────────────────────────────────────────────
 *
 * "Components do not respect each other's placement" is a visual report, and
 * visual reports are hard to act on. This turns it into a list.
 *
 * A component that sets `position: fixed` with an offset is claiming a specific
 * point on the viewport, and nothing in CSS stops two of them claiming the same
 * one. When they do, both render there and the one later in DOM order covers the
 * other — silently, with no error, and differently depending on which mounted
 * first.
 *
 * Measured when this was written: eight components at `top: 20px` and twelve at
 * `right: 20px`, which is roughly ten things stacked in one corner. Combined
 * with fifty-seven components sharing z-index 1000, the arrangement on screen is
 * decided by mount order rather than by anyone's intent.
 *
 * ─── THE SYSTEM THAT ALREADY EXISTS AND IS BEING BYPASSED ──────────────────
 *
 * src/components/HUD/Corners holds CyberCommandTopLeft, TopRight, BottomLeft and
 * BottomRight — an anchor system, and the right answer. Components inside the
 * HUD tree use it. Components outside it — widgets, popups, status indicators,
 * chat windows — mostly do not, and hardcode their own offsets instead.
 *
 * So this is not a missing architecture. It is an architecture that stops at a
 * directory boundary.
 *
 * Usage: node scripts/audit-layout-collisions.mjs [--all]
 * Exit:  0 always — this reports, it does not gate. Placement is a design
 *        question and a script should not fail a build over one.
 */
import fs from 'node:fs';
import path from 'node:path';

const SHOW_ALL = process.argv.includes('--all');

/** A rule that pins itself to the viewport, and where. */
const collect = () => {
  const claims = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.css')) continue;

      const text = fs.readFileSync(p, 'utf8');
      // Crude block split. Precise enough to associate a `fixed` rule with the
      // offsets in the same declaration block, which is all this needs.
      for (const block of text.split('}')) {
        if (!/position:\s*fixed/.test(block)) continue;
        const offsets = {};
        // A layer can say "cover everything" two ways: pin all four edges, or
        // pin the top-left and set 100vw/100vh. Both need to be visible here or
        // the second form reads as a corner claim.
        offsets._fullSize = /width:\s*100vw/.test(block) && /height:\s*100vh/.test(block);
        for (const edge of ['top', 'right', 'bottom', 'left']) {
          const m = block.match(new RegExp(`(?:^|[;{\\s])${edge}:\\s*(-?[\\d.]+(?:px|rem|%|vh|vw)|auto|0)`));
          if (m) offsets[edge] = m[1];
        }
        // _fullSize is metadata, not an edge claim; counting it as one made
        // every sized-but-unpinned rule look like a viewport claim and inflated
        // the total from 46 to 60.
        if (!['top', 'right', 'bottom', 'left'].some((e) => offsets[e])) continue;
        const selector = (block.split('{')[0] || '').trim().split('\n').pop().trim();
        claims.push({ file: p.replace(/^src\//, ''), selector, offsets });
      }
    }
  };
  walk('src');
  return claims;
};

/**
 * Two claims collide when they pin the same edges to the same values.
 *
 * ─── WHAT IS NOT A COLLISION ───────────────────────────────────────────────
 *
 * An element pinned to all four edges is not claiming a POINT, it is claiming
 * the whole viewport — a modal backdrop, a preloader, a passthrough layer. Those
 * are supposed to cover everything, they are mutually exclusive in practice, and
 * their order is settled by the z-index scale rather than by where they sit.
 *
 * Counting them produced the audit's largest and most alarming finding — "22
 * components claim top:0 right:0 bottom:0 left:0" — which was every modal in the
 * app doing exactly what a modal does. It buried the six real corner collisions
 * underneath a number that could never go down.
 *
 * The same applies to `top: 50%; left: 50%`, which is not an anchor either: it
 * is how you centre something, and two centred dialogs are two dialogs, not a
 * layout bug.
 */
const isFullViewport = (c) =>
  ['top', 'right', 'bottom', 'left'].every((e) => c.offsets[e] === '0') ||
  (c.offsets.top === '0' && c.offsets.left === '0' && c.offsets._fullSize);

const isCentred = (c) => c.offsets.top === '50%' && c.offsets.left === '50%';

const anchorKey = (c) => {
  if (isFullViewport(c) || isCentred(c)) return '';
  return ['top', 'right', 'bottom', 'left']
    .filter((e) => c.offsets[e] && c.offsets[e] !== 'auto')
    .map((e) => `${e}:${c.offsets[e]}`)
    .join(' ');
};

const claims = collect();
const byAnchor = new Map();
for (const c of claims) {
  const k = anchorKey(c);
  if (!k) continue;
  if (!byAnchor.has(k)) byAnchor.set(k, []);
  byAnchor.get(k).push(c);
}

const collisions = [...byAnchor.entries()]
  .filter(([, cs]) => new Set(cs.map((c) => c.file)).size > 1)
  .sort((a, b) => b[1].length - a[1].length);

const inHud = (f) => f.startsWith('components/HUD/') || f.startsWith('layouts/');

console.log('');
const layers = claims.filter((c) => isFullViewport(c) || isCentred(c)).length;

console.log(`  LAYOUT COLLISION AUDIT — ${claims.length} viewport-pinned rule(s) in ${new Set(claims.map(c => c.file)).size} file(s)`);
console.log(`  ${layers} of them cover the whole viewport or centre themselves — layers, not anchors.`);
console.log('');

if (!collisions.length) {
  console.log('  No two components claim the same anchor.\n');
  process.exit(0);
}

console.log(`  ${collisions.length} anchor point(s) claimed by more than one component:\n`);

for (const [anchor, cs] of collisions.slice(0, SHOW_ALL ? 999 : 8)) {
  const files = [...new Set(cs.map((c) => c.file))];
  console.log(`    ${anchor}   — ${files.length} components`);
  for (const f of files.slice(0, SHOW_ALL ? 99 : 6)) {
    console.log(`        ${inHud(f) ? ' ' : '!'} ${f}`);
  }
  if (files.length > 6 && !SHOW_ALL) console.log(`          …and ${files.length - 6} more (--all)`);
  console.log('');
}

const outsiders = new Set(
  collisions.flatMap(([, cs]) => cs.map((c) => c.file)).filter((f) => !inHud(f)),
);

console.log('  ! marks a component OUTSIDE components/HUD/ and layouts/.');
console.log('');
console.log(`  ${outsiders.size} of the colliding components sit outside the HUD tree.`);
console.log('');
console.log('  Corner placement now has an answer: components/Dock. <Docked slot="x">');
console.log('  portals a component into one of four corners positioned from --work-*,');
console.log('  and dockOrder.ts holds the whole arrangement in one list.');
console.log('');
console.log('  An earlier version of this file pointed at components/HUD/Corners as the');
console.log('  existing anchor system. That was wrong: those four files are content');
console.log('  components the layout happens to place in corner slots, with no primitive');
console.log('  for anything else to join — which is exactly why nothing else joined.');
console.log('');
console.log('  Reported, not gated. Which component belongs in which corner is a design');
console.log('  decision, and a script that guessed would be worse than one that lists.');
console.log('');
