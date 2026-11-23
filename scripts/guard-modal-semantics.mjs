#!/usr/bin/env node
/**
 * @asserts No component renders a modal without being one.
 *
 * Counts components that render a modal without being one.
 *
 * ─── WHAT IT LOOKS FOR ─────────────────────────────────────────────────────
 *
 * A component that renders a full-viewport `position: fixed` backdrop is making
 * a modal. A modal has obligations: it announces itself (`role="dialog"`,
 * `aria-modal`), it keeps Tab inside itself, it stops the page behind from
 * scrolling, and Escape closes it.
 *
 * Measured when this was written: twenty such backdrops, and not one of them set
 * `aria-modal` or locked scroll. Most handled neither Escape nor focus. For
 * anyone not using a mouse they were not dialogs at all — Tab walked straight
 * out the back into the page behind, where the focused control sat invisible
 * under the backdrop, and a screen reader was never told anything had opened.
 *
 * ─── WHY A RATCHET AND NOT A BAN ───────────────────────────────────────────
 *
 * Not every full-viewport fixed element is a modal. A loading overlay, a
 * `pointer-events: none` passthrough layer and a fullscreen view mode all match
 * the same CSS shape and would be actively harmed by a focus trap — trapping
 * keyboard focus inside a loading spinner is worse than the problem.
 *
 * Telling those apart needs judgement, so this counts rather than forbids, and
 * fails only when the count goes UP. Migrating one turns the ratchet; adding one
 * fails the build.
 *
 * Usage: node scripts/guard-modal-semantics.mjs
 * Exit:  1 if the number of unmigrated backdrops grew.
 */
import fs from 'node:fs';
import path from 'node:path';

/*
 * Zero. Every full-viewport backdrop in this app now either delegates its modal
 * behaviour or carries a written reason why it is not a dialog.
 *
 * Raising this is not forbidden, but it means shipping a modal that a keyboard
 * cannot leave and a screen reader is not told about, so the reason belongs in
 * the commit message where someone will read it.
 */
const CEILING = 0;

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '__tests__'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (e.name.endsWith('.css')) files.push(p);
  }
};
walk('src');

/**
 * A rule that covers the viewport and sits above the page.
 *
 * `inset: 0` is checked because the first version only looked for the four
 * longhand offsets and silently missed eleven files that use the shorthand —
 * including four popups in components/ui that had exactly the problem this
 * guard exists to catch. A guard with a hole in it is worse than no guard: it
 * reports a clean count and everyone believes it.
 */
const coversViewport = (block) =>
  /inset:\s*0(px)?\s*[;}]/.test(block) ||
  (/top:\s*0/.test(block) &&
   (/bottom:\s*0/.test(block) || /height:\s*100(vh|%)/.test(block)) &&
   (/right:\s*0/.test(block) || /width:\s*100(vw|%)/.test(block)));

const isBackdrop = (block) =>
  /position:\s*fixed/.test(block) && coversViewport(block);

/**
 * Whether the component has handed its modal duties to something that does them.
 *
 * Three acceptable answers: wrap in <Modal>, go through PopupManager, or — for a
 * component that needs its own markup and attributes — use the shared hooks
 * directly. What is NOT acceptable is a fifth hand-rolled focus trap, which is
 * what this codebase had before: Modal, PopupManager, StorePopupModal and
 * SupportFunnelModal each carried their own copy of the same rule.
 */
const isDelegated = (src) =>
  /from\s+['"][^'"]*Shared\/Modal['"]/.test(src) ||
  // focus-trap-react is a real library doing the real job; a component using it
  // has not hand-rolled anything.
  /from\s+['"]focus-trap-react['"]/.test(src) ||
  /from\s+['"][^'"]*Popup\/modalBehavior['"]/.test(src) ||
  /\busePopup\b/.test(src) ||
  /\bshowPopup\s*\(/.test(src);

/**
 * Things that match the CSS shape and are correctly not dialogs.
 *
 * A `pointer-events: none` layer is self-evidently not a dialog — it cannot be
 * interacted with. Everything else has to say so, in the CSS, with a reason:
 *
 *     .fullscreen {
 *       /* not-a-dialog: a view mode the user switches into, not something
 *          that interrupts them — trapping focus here would strand them. *\/
 *       position: fixed;
 *       inset: 0;
 *     }
 *
 * A marker with no reason after the colon does not count. The point is not to
 * let people silence the guard; it is to make the claim reviewable, because
 * "this is not a dialog" is a judgement and judgements should be written down
 * where the next person reads them.
 */
const NOT_A_MODAL = /pointer-events:\s*none|not-a-dialog:\s*\S+/;

const unmigrated = [];

for (const file of files) {
  const css = fs.readFileSync(file, 'utf8');
  const tsx = file.replace(/\.module\.css$|\.css$/, '.tsx');
  if (!fs.existsSync(tsx)) continue;

  const src = fs.readFileSync(tsx, 'utf8');
  if (isDelegated(src)) continue;

  for (const block of css.split('}')) {
    if (!isBackdrop(block) || NOT_A_MODAL.test(block)) continue;
    const sel = (block.split('{')[0] || '').trim().split('\n').pop().trim();
    if (!sel.startsWith('.') || sel.includes(' ')) continue;

    const cls = sel.slice(1).replace(/[:,].*$/, '');
    if (!new RegExp(`styles\\.${cls}\\b`).test(src)) continue;

    unmigrated.push({ file: tsx.replace(/^src\//, ''), cls });
    break; // one finding per component is enough to act on
  }
}

console.log('');
console.log(`  MODAL SEMANTICS RATCHET — ${unmigrated.length} backdrop(s) not using Modal or PopupManager`);
console.log(`  ceiling: ${CEILING}`);
console.log('');

for (const u of unmigrated) console.log(`      .${u.cls.padEnd(22)} ${u.file}`);
if (unmigrated.length) console.log('');

if (unmigrated.length > CEILING) {
  console.log('  FAILED — the count went up.');
  console.log('');
  console.log('  A full-viewport backdrop is a modal, and a modal has to announce');
  console.log('  itself, keep Tab inside, lock the page behind it and close on Escape.');
  console.log('  Wrap it:');
  console.log('');
  console.log('    <Modal isOpen={open} onClose={close} ariaLabel="..." className={styles.overlay}>');
  console.log('');
  console.log('  If it is genuinely not a dialog — a loading overlay, a passthrough');
  console.log('  layer, a fullscreen view — say so in the CSS with pointer-events: none,');
  console.log('  or leave it and raise CEILING with the reason in the commit message.');
  console.log('');
  process.exit(1);
}

if (unmigrated.length < CEILING) {
  console.log(`  ${CEILING - unmigrated.length} fewer than the ceiling. Lower CEILING to ${unmigrated.length}`);
  console.log('  in this file to lock the improvement in — the ratchet only holds if it turns.');
} else {
  console.log('  Held. No new hand-rolled modal.');
}
console.log('');
