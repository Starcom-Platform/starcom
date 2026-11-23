#!/usr/bin/env node
/**
 * Audit the layout and hierarchy of every screen in the running app (decision D-F,
 * step 3, docs/missions/01-architecture-decisions/globe-visualization.md).
 *
 * ─── WHAT THIS IS FOR ──────────────────────────────────────────────────────
 *
 * The UI layout and hierarchy work starts the way the visualization work did: with
 * a worklist measured from the live app rather than written from memory. A
 * hand-written worklist is a narrative, and narratives go stale and start lying.
 * This is re-run rather than re-read; its output goes to a temporary folder and is
 * never committed.
 *
 * ─── WHAT IS MEASURED, PER SCREEN AND WINDOW SIZE ──────────────────────────
 *
 *   area        how much of the window the screen's own area gets, and what the
 *               shell takes: the header and status bar above, the navigation bar
 *               below, and on the globe the HUD's rails, from the work area the HUD
 *               publishes (--work-*)
 *   covered     controls a person can see but not click at their centre, by the
 *               rule smoke-reachability.mjs uses: the element at the centre must be
 *               the control, inside it, or around it
 *   cut off     controls clipped away by a box that hides what overflows it, which
 *               nobody can reach. Controls scrolled out of an area that scrolls are
 *               left out of every count: scrolling to them is how they are reached.
 *               Also how far the page itself is wider than the window.
 *   overlaps    pieces of text drawn over one another, neither containing the other
 *   clipped     text cut off by its own box
 *   type        the font families, sizes and colours in visible text, and text
 *               under 10 px
 *   targets     buttons, links and inputs under 24 × 24 px, the WCAG 2.2 minimum
 *   outline     the h1–h6 headings, and the page landmarks
 *   navigation  every group of controls that moves between screens
 *   errors      page errors and console errors while the screen loaded
 *   screenshot  the screen itself; the contact sheet is the verdict
 *
 * Numbers are triage, not verdicts. A clipped label may be clipped on purpose, and
 * a small target may be a link in a sentence. Look at the contact sheet.
 *
 * Every screen but one is measured as a returning visitor, with the first-visit
 * prompts dismissed, as smoke-reachability.mjs does: a panel that covers controls
 * while it is open is doing its job. The Globe is also measured as a first visit,
 * prompts and all, because that is the first impression.
 *
 * Since 2026-10-02 (K18) it also measures a phone, 390 × 844, and each screen
 * again with each popup, menu, panel and the chat window opened in turn (OPENERS),
 * which is where overlaps live. Relays are read and never written: EVENT and AUTH
 * frames are dropped, so a run cannot publish or sign in.
 *
 * Exit 2 when the app could not be observed; exit 0 otherwise. An audit reports.
 *
 * Usage (the dev server, whose sample data gives the screens something to lay out):
 *   npm run audit:layout -- http://localhost:5211/
 *   LAYOUT_AUDIT_OUT=/some/dir LAYOUT_AUDIT_ONLY=globe,cases node scripts/audit-ui-layout.mjs <url>
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { rendererNotice } from './lib/rendererLabel.mjs';
import path from 'node:path';
import { freshTempDir } from './lib/freshTempDir.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = (process.argv[2] || 'http://localhost:5211/').replace(/\/?$/, '/');
const OUT = process.env.LAYOUT_AUDIT_OUT || freshTempDir('starcom-layout-audit-');
const ONLY = process.env.LAYOUT_AUDIT_ONLY ? new Set(process.env.LAYOUT_AUDIT_ONLY.split(',')) : null;
const SETTLE_MS = Number(process.env.LAYOUT_AUDIT_SETTLE_MS || 8000);
/** Before opening something: long enough for the header and rails to be there. */
const OPENED_SETTLE_MS = Number(process.env.LAYOUT_AUDIT_OPENED_SETTLE_MS || 5000);
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/**
 * Every application at its address, and the addresses that folded into them, which
 * are measured only to show where each one sends a visitor (decision D-F, step 3.3).
 */
const SCREENS = [
  { id: 'globe', label: 'Globe', path: '' },
  { id: 'globe-first-visit', label: 'Globe, first visit', path: '', firstVisit: true },
  { id: 'netrunner', label: 'NetRunner', path: 'app/netrunner' },
  { id: 'cases', label: 'Cases', path: 'app/cases' },
  { id: 'inteldashboard', label: 'IntelDashboard', path: 'app/inteldashboard' },
  { id: 'intelanalyzer', label: 'IntelAnalyzer', path: 'app/intelanalyzer' },
  { id: 'intelweb', label: 'IntelWeb', path: 'app/intelweb' },
  { id: 'teamworkspace', label: 'Missions', path: 'app/missions' },
  { id: 'marketexchange', label: 'MarketExchange', path: 'app/marketexchange' },
  { id: 'page-intel', label: '/intel', path: 'intel' },
  { id: 'page-investigations', label: '/investigations', path: 'investigations' },
  { id: 'page-cases-dashboard', label: '/cases-dashboard', path: 'cases-dashboard' },
  { id: 'page-info-gathering', label: '/info-gathering', path: 'info-gathering' },
  { id: 'page-info-analysis', label: '/info-analysis', path: 'info-analysis' },
  { id: 'page-new-report', label: '/team/…/new-report', path: 'team/layout-audit/new-report' },
  // /intel/workspace goes where /intel goes, and /team/:teamId hands over to OpsCenter.
].filter((s) => !ONLY || ONLY.has(s.id));

/**
 * A small laptop, a large monitor, and a phone. The phone was added after the
 * critique audit of 2026-10-01 (K18): every overlap it found on a phone, the
 * Globe's covered by its own panels and OpsCenter's tabs cut off at both ends,
 * was invisible here because no window was narrower than 1280.
 */
const WINDOWS = [
  { id: '1280x720', width: 1280, height: 720 },
  { id: '1920x1080', width: 1920, height: 1080 },
  { id: '390x844', width: 390, height: 844, phone: true },
];

/**
 * What is opened in turn, on a fresh load of the screen, and measured open
 * (K18). Popups, menus, panels and the chat window are where overlaps live,
 * and none of them is open eight seconds after a page loads. The header's are
 * on every screen and are measured on two; the globe's own on the globe. A
 * control not offered at a size is recorded as such, not as a failure.
 */
const OPENERS = [
  { id: 'chat', screens: ['globe', 'cases'], open: (page) => page.keyboard.press('Control+Shift+C') },
  { id: 'community', screens: ['globe', 'cases'], control: 'button[aria-label="Community"]' },
  { id: 'your-key', screens: ['globe', 'cases'], control: 'button[aria-label="Your key"]' },
  // The command palette (D-CP): from the header's box on every screen, and with Ctrl+K, which absorbed Quick Access.
  { id: 'search', screens: ['globe', 'cases'], control: 'button[aria-label="Global search"]', open: async (page, el) => { await el.click(); await page.locator('[data-testid="command-palette-input"]').fill('a'); } },
  { id: 'palette', screens: ['globe', 'cases'], open: (page) => page.keyboard.press('Control+K') },
  { id: 'geopolitical-layers', screens: ['globe'], control: '[data-testid="cyber-right-rail-geopolitical-layers-popup"]' },
];

/** Labels of the controls that move between screens, wherever they appear. */
const SCREEN_LABELS = [
  'Globe', 'NetRunner', 'Cases', 'IntelDashboard', 'IntelAnalyzer', 'IntelWeb', 'OpsCenter', 'MarketExchange',
  'Teams', 'Investigations', 'Intel', 'Home', 'Dashboard',
];

const cannotObserve = (message) => {
  console.error(`\n  HARNESS CANNOT OBSERVE: ${message}\n  This says nothing about the application.\n`);
  process.exit(2);
};

/** Runs in the page. Everything it returns is measured from the DOM as drawn. */
function measureLayout(screenLabels) {
  const vw = innerWidth;
  const vh = innerHeight;
  const round = (n) => Math.round(n);
  const box = (r) => ({ x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height) });
  const inWindow = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    return inWindow(el.getBoundingClientRect());
  };
  /** Drawn at all, on screen or not: the outline is structure, not what is in view. */
  const rendered = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  /**
   * Where a visible element's centre falls among the ancestors that clip their content:
   * 'shown'; 'scrolled' out of an area a person can scroll, which is not a layout defect
   * (a table row scrolled away is not covered by whatever is drawn over that spot); or
   * 'cut' off by an area that hides what overflows it, where nobody can reach it. Each
   * axis is judged by its own overflow. A fixed element escapes its ancestors' clipping.
   */
  const clips = new Map();
  const clippingOf = (a) => {
    if (!clips.has(a)) {
      const s = getComputedStyle(a);
      const axis = (v) => (/auto|scroll/.test(v) ? 'scrolled' : /hidden|clip/.test(v) ? 'cut' : null);
      const x = axis(s.overflowX);
      const y = axis(s.overflowY);
      clips.set(a, x || y ? { x, y, r: a.getBoundingClientRect() } : null);
    }
    return clips.get(a);
  };
  const placement = (el) => {
    if (!visible(el)) return 'hidden';
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= vw || cy >= vh) return 'outside';
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') return 'shown';
      const a = node.parentElement;
      const clip = a && a !== document.body ? clippingOf(a) : null;
      if (!clip) continue;
      if (clip.x && (cx < clip.r.left || cx > clip.r.right)) return clip.x;
      if (clip.y && (cy < clip.r.top || cy > clip.r.bottom)) return clip.y;
    }
    return 'shown';
  };
  const shown = (el) => placement(el) === 'shown';
  const words = (el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || '')
    .replace(/\s+/g, ' ').trim().slice(0, 60);
  /** A readable name for an element: its tag and its CSS module class, without the hash. */
  const nameOf = (el) => {
    const cls = typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? '');
    const hint = cls.split(/\s+/).map((c) => c.replace(/^_/, '').replace(/_[A-Za-z0-9-]{5}_\d+$/, '')).find((c) => c && !/^css-|^Mui/.test(c));
    return `${el.tagName.toLowerCase()}${hint ? `.${hint}` : ''}`;
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();

  // ── area ──
  const main = document.querySelector('main[data-current-app]');
  const mainRect = main && visible(main) ? main.getBoundingClientRect() : null;
  const css = getComputedStyle(document.documentElement);
  const px = (name) => {
    const v = parseFloat(css.getPropertyValue(name));
    return Number.isFinite(v) ? v : null;
  };
  const workArea = px('--work-width') && px('--work-height') && main?.dataset.currentApp === 'cybercommand'
    ? { x: px('--work-left'), y: px('--work-top'), w: px('--work-width'), h: px('--work-height') }
    : null;
  let own;
  let shell;
  if (mainRect) {
    own = workArea ?? box(mainRect);
    shell = {
      above: round(mainRect.top),
      below: round(vh - mainRect.bottom),
      ...(workArea ? {
        hudTop: round(workArea.y - mainRect.top),
        hudBottom: round(mainRect.bottom - (workArea.y + workArea.h)),
        hudLeft: round(workArea.x - mainRect.left),
        hudRight: round(mainRect.right - (workArea.x + workArea.w)),
      } : {}),
    };
  } else {
    // A standalone page: whatever navigation sits across the top is its shell.
    const topBars = [...document.querySelectorAll('nav, header, [role="navigation"], [role="banner"]')]
      .filter(visible).map((el) => el.getBoundingClientRect())
      .filter((r) => r.top <= 2 && r.width >= vw * 0.5 && r.height < vh * 0.3);
    const above = topBars.length ? Math.max(...topBars.map((r) => r.bottom)) : 0;
    own = { x: 0, y: round(above), w: vw, h: round(vh - above) };
    shell = { above: round(above), below: 0 };
  }
  const ownShare = Math.round((Math.max(0, own.w) * Math.max(0, own.h)) / (vw * vh) * 100);

  // ── controls, and whether they can be clicked ──
  const CONTROL = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="link"]';
  const placed = [...document.querySelectorAll(CONTROL)].map((el) => [el, placement(el)]);
  const controls = placed.filter(([, p]) => p === 'shown').map(([el]) => el);
  const cutOff = placed.filter(([, p]) => p === 'cut')
    .map(([el]) => ({ control: `${nameOf(el)} "${words(el)}"`, at: box(el.getBoundingClientRect()) }));
  const covered = [];
  const smallTargets = [];
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx >= 0 && cy >= 0 && cx < vw && cy < vh) {
      const hit = document.elementFromPoint(cx, cy);
      const reachable = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      if (!reachable) covered.push({ control: `${nameOf(el)} "${words(el)}"`, by: hit ? `${nameOf(hit)} "${words(hit).slice(0, 40)}"` : 'nothing', at: box(r) });
    }
    if ((r.width < 24 || r.height < 24) && getComputedStyle(el).display !== 'inline') {
      smallTargets.push({ control: `${nameOf(el)} "${words(el)}"`, size: `${round(r.width)}×${round(r.height)}` });
    }
  }

  // ── text: what is drawn, how, and whether it collides or is cut off ──
  // Text kept for screen readers and not drawn: a box of a pixel or less, clipped
  // away, as the distribution chip names itself (step 7). It read as clipped text.
  const forScreenReaders = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return r.width <= 1 && r.height <= 1 && (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)');
  };
  const textEls = [...document.body.querySelectorAll('*')]
    // checkVisibility: a closed <details> keeps its content laid out, with real
    // sizes, and does not paint it; a popup's collapsed section read as text over
    // the section below it (K18, 2026-10-02).
    .filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'svg'].includes(el.tagName) && ownText(el) && shown(el)
      && (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true)
      && !forScreenReaders(el))
    .slice(0, 4000);
  const families = new Map();
  const sizes = new Map();
  const colours = new Map();
  const tiny = [];
  const clipped = [];
  const rects = [];
  for (const el of textEls) {
    const s = getComputedStyle(el);
    const family = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const size = parseFloat(s.fontSize);
    families.set(family, (families.get(family) ?? 0) + 1);
    sizes.set(size, (sizes.get(size) ?? 0) + 1);
    colours.set(s.color, (colours.get(s.color) ?? 0) + 1);
    if (size < 10) tiny.push({ text: ownText(el).slice(0, 40), size, at: nameOf(el) });
    const cuts = (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.textOverflow === 'ellipsis' || s.overflowX === 'clip')
      && el.scrollWidth > el.clientWidth + 2;
    if (cuts) clipped.push({ text: ownText(el).slice(0, 40), shows: `${el.clientWidth} of ${el.scrollWidth} px`, at: nameOf(el) });
    rects.push({ el, r: el.getBoundingClientRect() });
  }
  /*
   * Whether the lower of two texts is hidden where they meet, by something
   * opaque drawn over it, or either is cut away there by a box that clips its
   * content: then they do not collide on screen. A dialog over the
   * page made every one of its labels "overlap" the page's text beneath, which
   * is the dialog working (K18, 2026-10-02). Walks up from what is on top at the
   * point to the two texts' common ancestor; a background at least 85% opaque,
   * or a backdrop filter, on that path hides what is under it. elementFromPoint
   * cannot see an element with pointer-events: none, so text over such an
   * element is judged by what lies beneath it.
   */
  /**
   * Whether a box that clips its content cuts an element away at a point. The
   * ticker's text scrolls under the screen's title, and the ticker cuts it off
   * before it gets there; counting it read every scroll position as an overlap.
   */
  const cutAwayAt = (el, x, y) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') return false;
      const a = node.parentElement;
      const clip = a && a !== document.body ? clippingOf(a) : null;
      if (!clip) continue;
      if (clip.x && (x < clip.r.left || x > clip.r.right)) return true;
      if (clip.y && (y < clip.r.top || y > clip.r.bottom)) return true;
    }
    return false;
  };
  const hiddenUnder = (x, y, a, b) => {
    if (x < 0 || y < 0 || x >= vw || y >= vh) return true;
    if (cutAwayAt(a, x, y) || cutAwayAt(b, x, y)) return true;
    const top = document.elementFromPoint(x, y);
    if (!top) return false;
    const lower = a.contains(top) ? b : b.contains(top) ? a : null;
    for (let n = top; n && n !== document.body; n = n.parentElement) {
      if (lower && n.contains(lower)) break;
      const st = getComputedStyle(n);
      const m = st.backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(',').map((v) => parseFloat(v));
        if ((parts.length > 3 ? parts[3] : 1) >= 0.85) return true;
      }
      if (st.backdropFilter && st.backdropFilter !== 'none') return true;
    }
    return false;
  };
  const overlaps = [];
  for (let i = 0; i < rects.length && overlaps.length < 40; i += 1) {
    for (let j = i + 1; j < rects.length && overlaps.length < 40; j += 1) {
      const a = rects[i];
      const b = rects[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w <= 2 || h <= 2) continue;
      const smaller = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
      if (w * h < smaller * 0.3) continue;
      const cx = Math.max(a.r.left, b.r.left) + w / 2;
      const cy = Math.max(a.r.top, b.r.top) + h / 2;
      if (hiddenUnder(cx, cy, a.el, b.el)) continue;
      overlaps.push({ a: `${nameOf(a.el)} "${ownText(a.el).slice(0, 30)}"`, b: `${nameOf(b.el)} "${ownText(b.el).slice(0, 30)}"`, at: box({ left: Math.max(a.r.left, b.r.left), top: Math.max(a.r.top, b.r.top), width: w, height: h }) });
    }
  }
  const topCounts = (map, n) => [...map.entries()].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => `${k} (${v})`);

  // ── outline ──
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(rendered)
    .map((h) => ({ level: Number(h.tagName[1]), text: words(h).slice(0, 50) }));
  let skippedLevels = 0;
  for (let i = 1; i < headings.length; i += 1) if (headings[i].level > headings[i - 1].level + 1) skippedLevels += 1;
  const landmarks = {
    banner: document.querySelectorAll('header, [role="banner"]').length,
    navigation: [...document.querySelectorAll('nav, [role="navigation"]')].filter(visible).length,
    main: document.querySelectorAll('main, [role="main"]').length,
  };

  // ── navigation: groups of controls that move between screens ──
  const labelSet = new Set(screenLabels.map((l) => l.toLowerCase()));
  const byGroup = new Map();
  for (const el of controls) {
    // The accessible name first; an icon drawn as an emoji is not part of the label.
    const t = (el.getAttribute('aria-label') || el.innerText || '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!labelSet.has(t)) continue;
    const group = el.closest('nav, [role="navigation"], [role="tablist"], ul, ol') ?? el.parentElement?.parentElement ?? el;
    if (!byGroup.has(group)) byGroup.set(group, new Set());
    byGroup.get(group).add(t);
  }
  const navigation = [...byGroup.entries()]
    .filter(([, labels]) => labels.size >= 2)
    .map(([g, labels]) => ({ at: nameOf(g), where: box(g.getBoundingClientRect()), labels: [...labels] }));

  return {
    area: { ownSharePercent: ownShare, own, shell, pageScrollsSideways: Math.max(0, document.documentElement.scrollWidth - vw) },
    controls: controls.length,
    covered,
    cutOff,
    smallTargets: { count: smallTargets.length, examples: smallTargets.slice(0, 8) },
    text: {
      elements: textEls.length,
      families: topCounts(families, 8),
      familyCount: families.size,
      sizes: topCounts(sizes, 12),
      sizeCount: sizes.size,
      colourCount: colours.size,
      tiny: { count: tiny.length, examples: tiny.slice(0, 6) },
    },
    clipped: { count: clipped.length, examples: clipped.slice(0, 8) },
    overlaps,
    outline: { headings: headings.slice(0, 16), headingCount: headings.length, h1: headings.filter((h) => h.level === 1).length, skippedLevels, landmarks },
    navigation,
  };
}

// ── the run ──
if (!SCREENS.length) cannotObserve(`LAYOUT_AUDIT_ONLY (${process.env.LAYOUT_AUDIT_ONLY}) names no screen this audit knows`);
const browser = await chromium.launch({ args: GL_ARGS });
const probe = await browser.newPage();
try {
  await probe.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
} catch (error) {
  await browser.close();
  cannotObserve(`${BASE_URL} did not load (${String(error).split('\n')[0]})`);
}
await probe.close();

fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });
console.log(`\n  LAYOUT AUDIT — ${BASE_URL}\n  output: ${OUT}\n${rendererNotice(GL_ARGS)}\n`);

/**
 * Relays are read, never written: an audit loads real pages, and nothing it
 * does may publish or sign in. Every frame a page would send is passed on
 * except EVENT and AUTH.
 */
async function readOnlyRelays(context) {
  await context.routeWebSocket(/.*/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      try {
        const frame = JSON.parse(String(message));
        if (frame[0] === 'EVENT' || frame[0] === 'AUTH') return;
      } catch { /* not a relay frame */ }
      server.send(message);
    });
  });
}

/** One screen at one size with one thing opened: measured open, shot, and said. */
async function measureOpened(screen, win, opener) {
  const context = await browser.newContext({
    viewport: { width: win.width, height: win.height }, timezoneId: 'America/Chicago',
    ...(win.phone ? { isMobile: true, hasTouch: true } : {}),
  });
  await readOnlyRelays(context);
  await context.addInitScript(() => {
    try {
      localStorage.setItem('support_funnel_v1', JSON.stringify({ impressionSeen: true, snoozeUntil: null, dismissed: true, lastAction: null }));
      localStorage.setItem('starcom-pipeline-guide-dismissed', 'true');
    } catch { /* storage unavailable */ }
  });
  const page = await context.newPage();
  const result = { id: screen.id, label: screen.label, window: win.id, opened: opener.id };
  try {
    await page.goto(`${BASE_URL}${screen.path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !document.querySelector('[class*="starcom-preloader"]'), null, { timeout: 150000 }).catch(() => {});
    await page.waitForTimeout(OPENED_SETTLE_MS);
    const before = await page.evaluate(() => document.body.innerText.length);
    const el = opener.control ? page.locator(opener.control).first() : null;
    if (el && !(await el.count() && await el.isVisible())) {
      result.notOffered = true;
    } else {
      if (opener.open) await opener.open(page, el);
      else await el.click();
      await page.waitForTimeout(1500);
      result.changed = (await page.evaluate(() => document.body.innerText.length)) !== before;
      await page.screenshot({ path: path.join(OUT, 'screens', `${screen.id}.${win.id}.${opener.id}.png`) });
      Object.assign(result, await page.evaluate(measureLayout, SCREEN_LABELS));
    }
  } catch (error) {
    result.error = String(error).split('\n')[0].slice(0, 200);
  }
  await context.close();
  const name = `  ${screen.label.padEnd(20)} ${win.id.padEnd(10)} + ${opener.id.padEnd(20)}`;
  if (result.error) console.log(`${name} ✗ ${result.error}`);
  else if (result.notOffered) console.log(`${name} not offered at this size`);
  else {
    console.log(`${name} ${result.changed ? 'opened' : 'nothing changed'} · covered ${result.covered.length}`
      + ` · cut off ${result.cutOff.length} · overlaps ${result.overlaps.length}`
      + (result.area.pageScrollsSideways ? ` · page ${result.area.pageScrollsSideways}px too wide` : ''));
  }
  return result;
}

const results = [];
for (const screen of SCREENS) {
  for (const win of WINDOWS) {
    const context = await browser.newContext({
      viewport: { width: win.width, height: win.height }, timezoneId: 'America/Chicago',
      ...(win.phone ? { isMobile: true, hasTouch: true } : {}),
    });
    await readOnlyRelays(context);
    const page = await context.newPage();
    const pageErrors = [];
    let consoleErrors = 0;
    page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0].slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors += 1; });
    if (!screen.firstVisit) {
      await page.addInitScript(() => {
        try {
          localStorage.setItem('support_funnel_v1', JSON.stringify({ impressionSeen: true, snoozeUntil: null, dismissed: true, lastAction: null }));
          localStorage.setItem('starcom-pipeline-guide-dismissed', 'true');
        } catch { /* storage unavailable */ }
      });
    }
    const result = { id: screen.id, label: screen.label, window: win.id, path: `/${screen.path}` };
    try {
      await page.goto(`${BASE_URL}${screen.path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => !document.querySelector('[class*="starcom-preloader"]'), null, { timeout: 150000 }).catch(() => {});
      await page.waitForTimeout(SETTLE_MS);
      result.landedAt = new URL(page.url()).pathname;
      await page.screenshot({ path: path.join(OUT, 'screens', `${screen.id}.${win.id}.png`) });
      // A page that sends the visitor elsewhere is not measured: the numbers would be
      // the other screen's, under this one's name.
      if (result.landedAt.replace(/\/$/, '') !== result.path.replace(/\/$/, '')) {
        result.redirectedTo = result.landedAt;
      } else {
        Object.assign(result, await page.evaluate(measureLayout, SCREEN_LABELS));
      }
    } catch (error) {
      result.error = String(error).split('\n')[0].slice(0, 200);
    }
    result.pageErrors = pageErrors.slice(0, 5);
    result.consoleErrors = consoleErrors;
    results.push(result);
    await context.close();

    if (result.error) {
      console.log(`  ${screen.label.padEnd(20)} ${win.id.padEnd(10)} ✗ ${result.error}`);
    } else if (result.redirectedTo) {
      console.log(`  ${screen.label.padEnd(20)} ${win.id.padEnd(10)} → sent to ${result.redirectedTo}; not measured`);
    } else {
      const s = result.area.shell;
      const hud = s.hudLeft !== undefined ? ` hud ${s.hudTop}/${s.hudRight}/${s.hudBottom}/${s.hudLeft}` : '';
      console.log(`  ${screen.label.padEnd(20)} ${win.id.padEnd(10)} own ${String(result.area.ownSharePercent).padStart(3)}%`
        + ` · shell ${s.above}↑ ${s.below}↓${hud}`
        + ` · covered ${result.covered.length} · cut off ${result.cutOff.length}`
        + (result.area.pageScrollsSideways ? ` · page ${result.area.pageScrollsSideways}px too wide` : '')
        + ` · overlaps ${result.overlaps.length} · clipped ${result.clipped.count}`
        + ` · ${result.text.familyCount} fonts ${result.text.sizeCount} sizes · <10px ${result.text.tiny.count}`
        + ` · <24px ${result.smallTargets.count} · h1 ${result.outline.h1} · heading levels skipped ${result.outline.skippedLevels} · nav ${result.navigation.length}`
        + ` · errors ${result.pageErrors.length}/${result.consoleErrors}`);
    }
  }
}

// Then each screen again, with each popup, menu, panel or window opened in turn.
for (const screen of SCREENS) {
  for (const win of WINDOWS) {
    for (const opener of OPENERS.filter((o) => o.screens.includes(screen.id))) {
      results.push(await measureOpened(screen, win, opener));
    }
  }
}

fs.writeFileSync(path.join(OUT, 'layout.json'), `${JSON.stringify({ audited: new Date().toISOString(), baseUrl: BASE_URL, settleMs: SETTLE_MS, windows: WINDOWS, results }, null, 2)}\n`);
if (results.every((r) => r.error)) {
  await browser.close();
  cannotObserve(`no screen loaded; the first said: ${results[0].error}`);
}

// ── the contact sheet: one row per screen, one column per window size ──
const shots = results.filter((r) => !r.error && !r.opened).map((r) => ({
  label: `${r.label} · ${r.window}${r.redirectedTo ? ` · sent to ${r.redirectedTo}` : ''}`,
  url: `data:image/png;base64,${fs.readFileSync(path.join(OUT, 'screens', `${r.id}.${r.window}.png`)).toString('base64')}`,
}));
if (shots.length) {
  const sheetPage = await browser.newPage();
  const sheet = await sheetPage.evaluate(async (items) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const imgs = await Promise.all(items.map((it) => load(it.url)));
    const COLS = 2, W = 640, GAP = 14, LABEL = 26;
    const heights = imgs.map((i) => Math.round(i.height * (W / i.width)));
    const rows = Math.ceil(imgs.length / COLS);
    const rowH = [...Array(rows)].map((_, r) => Math.max(...heights.slice(r * COLS, r * COLS + COLS)));
    const c = document.createElement('canvas');
    c.width = COLS * W + (COLS + 1) * GAP;
    c.height = rowH.reduce((a, h) => a + h + LABEL + GAP, GAP);
    const x = c.getContext('2d');
    x.fillStyle = '#05070f'; x.fillRect(0, 0, c.width, c.height);
    let y = GAP;
    for (let r = 0; r < rows; r += 1) {
      for (let k = 0; k < COLS; k += 1) {
        const idx = r * COLS + k; if (idx >= imgs.length) break;
        const px = GAP + k * (W + GAP);
        x.fillStyle = '#e8eefc'; x.font = '16px system-ui, sans-serif'; x.textBaseline = 'top';
        x.fillText(items[idx].label, px, y + 4);
        x.drawImage(imgs[idx], px, y + LABEL, W, heights[idx]);
      }
      y += rowH[r] + LABEL + GAP;
    }
    return c.toDataURL('image/png');
  }, shots);
  fs.writeFileSync(path.join(OUT, 'contact-sheet.png'), Buffer.from(sheet.split(',')[1], 'base64'));
  await sheetPage.close();
}

await browser.close();

console.log('\n  Read the numbers as triage: a clipped label can be deliberate, and a small target can be');
console.log('  a link inside a sentence. The contact sheet is the verdict.');
console.log(`\n  wrote ${path.join(OUT, 'layout.json')}`);
console.log(`        ${path.join(OUT, 'contact-sheet.png')}   ← every screen, to look at`);
console.log(`        ${path.join(OUT, 'screens')}/<screen>.<window>.png\n`);
