#!/usr/bin/env node
/**
 * @asserts The number of !important declarations does not grow.
 *
 * Counts `!important`, and fails when the count grows.
 *
 * ─── WHAT IT IS FOR ────────────────────────────────────────────────────────
 *
 * `!important` is not always wrong. There is exactly one thing it does that
 * nothing else can: override an inline style. SecureChatWindow is a draggable,
 * resizable window that writes left, top, width and height inline from its own
 * state, so its `.maximized` class has no other way to say "actually, fill the
 * screen". Four of that file's declarations are load-bearing for that reason.
 *
 * Everything else is a specificity problem wearing a disguise, and the disguise
 * is expensive: an !important cannot be answered by anything downstream except
 * another !important, so one of them tends to produce several.
 *
 * Measured before this guard: 74. Of the first fourteen examined, ten were
 * insurance against a fight that could not happen — single-class variants in
 * GlobalHeader that already beat their base on source order — two were copied
 * from neighbours that meant something, and one was on a property React sets
 * inline, so the rule could never apply at any weight.
 *
 * ─── WHY IT COUNTS RATHER THAN FORBIDS ─────────────────────────────────────
 *
 * Telling the two apart needs to know what the component sets inline, which is
 * not visible from the CSS. A guard that guessed would either block a real fix
 * or wave through the rest. So it holds the line and lets people turn it.
 *
 * Usage: node scripts/guard-important-ratchet.mjs
 * Exit:  1 if the count went up.
 */
import fs from 'node:fs';
import path from 'node:path';

/*
 * Lower this as declarations go. The only edit anyone should make to this
 * number without a reason in the commit message.
 */
const CEILING = 13;

let total = 0;
const byFile = [];

const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.css')) continue;

    const text = fs.readFileSync(p, 'utf8');
    // Only declarations. The word also appears in the comments explaining why a
    // particular one stays, and counting those would make documenting a
    // decision cost the same as making a mess.
    const n = (text.match(/!important\s*;/g) || []).length;
    if (n) { total += n; byFile.push({ file: p.replace(/^src\//, ''), n }); }
  }
};
walk('src');

byFile.sort((a, b) => b.n - a.n);

console.log('');
console.log(`  !IMPORTANT RATCHET — ${total} declaration(s)`);
console.log(`  ceiling: ${CEILING}`);
console.log('');

for (const f of byFile.slice(0, 8)) {
  console.log(`      ${String(f.n).padStart(3)}  ${f.file}`);
}
if (byFile.length > 8) console.log(`           …and ${byFile.length - 8} more file(s)`);
console.log('');

if (total > CEILING) {
  console.log('  FAILED — the count went up.');
  console.log('');
  console.log('  Before adding one, check what it is actually answering:');
  console.log('');
  console.log('    · An INLINE style the component sets from its own state?');
  console.log('      That is the one case only !important can handle. Keep it, and');
  console.log('      say so in a comment so the next person does not remove it.');
  console.log('');
  console.log('    · A base class it already beats on source order?');
  console.log('      Then it is doing nothing. Delete it.');
  console.log('');
  console.log('    · A more specific selector, like `.wrapper .thing`?');
  console.log('      Raise your own selector to match instead. That keeps the');
  console.log('      property answerable by whatever comes next.');
  console.log('');
  process.exit(1);
}

if (total < CEILING) {
  console.log(`  ${CEILING - total} fewer than the ceiling. Lower CEILING to ${total}`);
  console.log('  in this file to lock the improvement in — the ratchet only holds if it turns.');
} else {
  console.log('  Held. No new !important.');
}
console.log('');
