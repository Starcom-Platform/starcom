#!/usr/bin/env node
/**
 * Accessibility checks that actually run, and actually look.
 *
 * Two separate defects sat behind `npm run test:a11y`:
 *
 * 1. IT RAN NOTHING AND CALLED THAT SUCCESS. The script was
 *    `playwright test --grep 'accessibility'`. There was no Playwright config,
 *    so testDir defaulted to the repo root and swept in the vitest suite and
 *    the visual specs; the run collapsed, printed "Total: 0 tests in 0 files",
 *    and exited 0. The grep could never have matched anyway — it filters test
 *    TITLES, the titles begin "Accessibility", and it is case-sensitive.
 *
 * 2. THE CHECK ITSELF DID NOT LOOK. The existing spec asserted over
 *    `snapshot.children` — the TOP LEVEL of the accessibility tree only. Every
 *    real image and input in this app is nested many levels below that, so the
 *    filter matched nothing, `missingAlt` was 0, and the assertion passed by
 *    inspecting almost none of the page. That is the same shape as a security
 *    check that reports a pass without running.
 *
 * 3. IT USED AN API THAT NO LONGER EXISTS. The spec called
 *    `page.accessibility.snapshot()`, which Playwright has since removed —
 *    `page.accessibility` is now undefined, so the test would have thrown had
 *    anything ever selected it. Three independent reasons it could not work,
 *    and none of them visible from a green run.
 *
 * The checks below query the DOM directly and compute accessible names from
 * the attributes that actually determine them. Slightly more code than a
 * snapshot call, and it does not rot when a helper API is retired.
 *
 * This runs as .mjs against the Playwright LIBRARY rather than its test
 * runner, matching scripts/smoke-app.mjs, because Playwright's TypeScript
 * loader requires Node >= 18.19 under "type": "module" and this project runs
 * 18.16 — so no .ts spec in this repo executes at all today.
 *
 * Exit codes, deliberately distinguishing the two ways this can end badly:
 *   0  checks ran and passed
 *   1  checks ran and found real accessibility defects
 *   2  the harness could not observe — says NOTHING about accessibility
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.A11Y_BASE_URL ?? 'http://localhost:4173';

const cannotObserve = (msg) => {
  console.error(`\n  HARNESS CANNOT OBSERVE: ${msg}`);
  console.error('  This says nothing about the application. Do not read it as a pass or a defect.');
  process.exit(2);
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  const response = await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!response || !response.ok()) cannotObserve(`${BASE} returned ${response ? response.status() : 'no response'}`);
} catch (e) {
  cannotObserve(`could not reach ${BASE} — is the preview server running? (${e.message})`);
}

// The app mounts asynchronously behind a preloader; checking too early would
// audit a loading screen and report it clean.
await page.waitForSelector('[data-testid="app-root"]', { timeout: 60_000 })
  .catch(() => cannotObserve('the app never mounted, so there was nothing to audit'));
await page.waitForTimeout(8000);

/**
 * Collect every element that needs an accessible name, and whether it has one.
 *
 * Queried across the WHOLE document. The bug this replaces read only the top
 * level of the accessibility tree, so it inspected almost nothing and reported
 * zero problems — a check that passes by not looking.
 *
 * Hidden elements are excluded: an element with display:none or aria-hidden is
 * not announced, so demanding a name for it would generate noise that trains
 * people to ignore the real findings.
 */
const audit = await page.evaluate(() => {
  const visible = (el) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  };
  const nameOf = (el) => {
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) {
      const t = labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (t) return t;
    }
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl?.textContent?.trim()) return lbl.textContent.trim();
    }
    if (el.closest('label')?.textContent?.trim()) return el.closest('label').textContent.trim();
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    if (el.tagName === 'IMG') return (el.getAttribute('alt') ?? '').trim();
    return (el.textContent ?? '').trim();
  };
  const describe = (el) =>
    `<${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ''}${el.className && typeof el.className === 'string' ? ` class="${el.className.slice(0, 40)}"` : ''}>`;

  const collect = (selector) => [...document.querySelectorAll(selector)]
    .filter(visible)
    .filter((el) => !nameOf(el))
    .map(describe);

  return {
    total: document.querySelectorAll('*').length,
    // An empty alt is a deliberate "decorative" marker and is CORRECT, so an
    // img is only a defect when the attribute is absent entirely.
    images: [...document.querySelectorAll('img')].filter(visible)
      .filter((el) => el.getAttribute('alt') === null).map(describe),
    inputs: collect('input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select'),
    buttons: collect('button, [role="button"]'),
    links: collect('a[href]'),
    controls: collect('[role="checkbox"], [role="radio"], [role="switch"], [role="slider"]'),
  };
});

if (!audit || audit.total < 50) cannotObserve(`only ${audit?.total ?? 0} elements in the DOM — the page had not rendered`);

console.log(`\n  harness: ${audit.total} elements in the rendered DOM\n`);

const findings = [];
const check = (name, bad, describe) => {
  if (bad.length === 0) { console.log(`  PASS  ${name}`); return; }
  console.log(`  FAIL  ${name} — ${bad.length}`);
  for (const b of bad.slice(0, 8)) console.log(`          ${describe(b)}`);
  if (bad.length > 8) console.log(`          …and ${bad.length - 8} more`);
  findings.push(`${name} (${bad.length})`);
};

check('every image has an alt attribute', audit.images,
  (d) => `${d} has no alt — use alt="" if it is decorative`);
check('every form control has an accessible name', audit.inputs,
  (d) => `${d} has no label, aria-label or aria-labelledby`);
check('every button has an accessible name', audit.buttons,
  (d) => `${d} announces only as "button" to a screen reader`);
check('every link has an accessible name', audit.links,
  (d) => `${d} announces only as "link"`);
check('every checkbox, radio, switch and slider has an accessible name', audit.controls,
  (d) => `${d} has no accessible name`);

// Keyboard reachability, checked by actually pressing Tab rather than by
// inspecting attributes: a positive tabindex or a focus trap does not show up
// in the tree.
const TAB_STEPS = 25;
const focused = new Set();
for (let i = 0; i < TAB_STEPS; i++) {
  await page.keyboard.press('Tab');
  const id = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return `${el.tagName}#${el.id || ''}.${(typeof el.className === 'string' ? el.className : '').slice(0, 40)}`;
  });
  if (id) focused.add(id);
}
check('keyboard focus moves between distinct elements',
  focused.size >= 2 ? [] : [{ n: focused.size }],
  (b) => `${TAB_STEPS} Tab presses reached ${b.n} distinct element(s) — focus is trapped or nothing is focusable`);

/**
 * A visible focus indicator is what makes keyboard navigation usable at all.
 *
 * Checked by focusing named elements DIRECTLY rather than by reading
 * document.activeElement after the tab loop above. My first version did the
 * latter, and against a page with `*:focus { outline: none; box-shadow: none }`
 * it PASSED — because after enough Tab presses focus had left the document,
 * activeElement was <body>, and the code returned "no-focus", which fell
 * through to a pass. "We could not tell" was being reported as "fine", which
 * is the exact substitution this whole file exists to remove.
 *
 * Inconclusive is now its own outcome and counts as a failure, because a check
 * that cannot reach its subject has not cleared it.
 */
const focusCheck = await page.evaluate(() => {
  const candidates = [...document.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), textarea, select, [tabindex]:not([tabindex="-1"])',
  )].filter((el) => el.getClientRects().length > 0).slice(0, 10);

  if (candidates.length === 0) return { outcome: 'inconclusive', reason: 'no focusable element was found to test' };

  const invisible = [];
  for (const el of candidates) {
    el.focus();
    if (document.activeElement !== el) continue;
    const s = getComputedStyle(el);
    const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth || '0') > 0;
    const hasShadow = !!s.boxShadow && s.boxShadow !== 'none';
    const hasBorderChange = s.borderStyle !== 'none' && parseFloat(s.borderWidth || '0') > 0;
    if (!hasOutline && !hasShadow && !hasBorderChange) {
      invisible.push(`<${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ''}>`);
    }
  }
  return { outcome: invisible.length ? 'invisible' : 'visible', invisible, tested: candidates.length };
});

check('the focused element is visibly indicated',
  focusCheck.outcome === 'visible' ? [] : [focusCheck],
  (f) => f.outcome === 'inconclusive'
    ? `INCONCLUSIVE — ${f.reason}. Not treated as a pass.`
    : `${f.invisible.length} of ${f.tested} focusable elements show no outline, shadow or border when focused: ${f.invisible.slice(0, 4).join(', ')}`);

// A document title and a language are the two things assistive technology
// reads before anything else.
const docInfo = await page.evaluate(() => ({ title: document.title, lang: document.documentElement.lang }));
check('the document has a title', docInfo.title?.trim() ? [] : [{}], () => 'document.title is empty');
check('the document declares a language',
  docInfo.lang?.trim() ? [] : [{}],
  () => '<html> has no lang attribute — screen readers cannot choose a pronunciation');

await browser.close();

if (findings.length) {
  console.log(`\n  ACCESSIBILITY DEFECTS: ${findings.join(', ')}\n`);
  process.exit(1);
}
console.log('\n  ACCESSIBILITY CHECKS PASSED\n');
