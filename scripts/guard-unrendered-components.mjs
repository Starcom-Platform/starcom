#!/usr/bin/env node
/**
 * @asserts No component is exported, imported into a live tree, and still unreachable by a user.
 *
 * Fails when a React component is exported, imported into a live tree, and
 * still cannot be reached by any user.
 *
 * ─── WHY THIS EXISTS, SEPARATELY FROM guard-orphan-exports ─────────────────
 *
 * That guard asks "does anything reference this symbol?" and catches the case
 * where a capability exists only in the test suite. It cannot catch the shape
 * that actually keeps happening here, because these components ARE referenced:
 *
 *   OfflineIntelReportsManager   imported into Enhanced3DGlobeInteractivity's
 *                                live render tree, gated on a `showOfflineManager`
 *                                state that nothing ever set true. Fully built,
 *                                fully tested, no way in. Users who created
 *                                reports offline could not reach the only screen
 *                                that syncs them.
 *   StorageStatusBadge           exported, self-contained, rendered by nothing.
 *   UnifiedIPFSNostrService      constructed as a field of the live
 *                                SecureChatIntegrationService, then never called
 *                                once. (Not a component, same shape.)
 *
 * Each passed typecheck, passed tests, shipped in the bundle, and did nothing.
 * The audit that found them was manual and will not run again by itself.
 *
 * ─── THE TWO SHAPES IT CATCHES ─────────────────────────────────────────────
 *
 * 1. NEVER RENDERED — a component whose name never appears as `<Name` or in a
 *    lazy/dynamic import anywhere outside its own file and tests. It exists in
 *    the bundle and in nobody's browser.
 *
 * 2. UNREACHABLE TOGGLE — a `useState` boolean whose setter is called only with
 *    `false` (or never), while something renders on the truthy branch. That is
 *    a door that can be closed and never opened, which is exactly how
 *    OfflineIntelReportsManager hid.
 *
 * A component rendered only inside its own file is still reported: that is the
 * "renders itself in a story/demo" case, and if the demo is the only caller the
 * component is not shipped functionality.
 *
 * SCOPE started narrow, like guard-orphan-exports, and for the same reason: a
 * whole-repo sweep would have reported enough legitimate cases to get switched
 * off. On 2026-09-12 it was widened to every component, page and application,
 * after each of the ten things the wider sweep flagged was resolved. Four were
 * this guard misreading (two constants and two React contexts, now skipped), one
 * was a render under an alias (now followed), two files were dead and deleted, and
 * two are exemptions with reasons below.
 *
 * Usage: node scripts/guard-unrendered-components.mjs
 * Exit:  0 clean · 1 at least one unreachable component or toggle
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { sync: globSync } = require('glob');

/** Directories this guard governs. Add to it as areas get wired. */
const SCOPE = [
  'src/components/**/*.tsx',
  'src/pages/**/*.tsx',
  'src/applications/**/*.tsx',
];

/** Everywhere a render could legitimately come from, including route tables. */
const ALL_SOURCES = 'src/**/*.{ts,tsx}';

const IGNORE = [
  '**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx',
  '**/__tests__/**', '**/__mocks__/**', '**/__fixtures__/**', 'src/testing/**',
];

/**
 * Exemptions. Each MUST state why, and the reason is checked — an exemption
 * without a justification is how a guard becomes decoration.
 *
 * Checked for staleness too: an exemption naming a component that no longer
 * exists is itself a stale claim, which is the failure this guard family
 * exists to prevent.
 */
const ALLOWLIST = [
  {
    symbol: 'EnhancedAdaptiveInterfaceProvider',
    reason: 'Rendered, but not as JSX that names it: CyberCommandHUDLayout picks it into '
      + 'an alias (AdaptiveProvider) when enhancedContextEnabled is on, which it is by '
      + 'default. The "Phase 4" wrapper, removed in plan item 8.3b (B7), named it as JSX.',
  },
  {
    symbol: 'GeomagneticPanel',
    reason: 'Rendered, but not as JSX: SpaceWeatherControlSurface puts it in its own panel '
      + 'table (geomagneticIndex: GeomagneticPanel) and renders from the table. Exported '
      + 'for its own test.',
  },
  {
    symbol: 'InteractionModeSelector',
    reason: 'Not imported by anything, so not in the bundle. Kept on purpose with the '
      + 'interaction mode system it belongs to; the comment in Globe.tsx beside '
      + 'setIntelModels explains why it was unmounted and why it was not deleted.',
  },
];

const stripComments = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Components only. A `.tsx` file can export helpers; this guard is about things
 * that render, so it looks for the PascalCase export shapes React uses.
 */
const COMPONENT_RE =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|const)\s+([A-Z][\w$]*)/gm;

/*
 * Two shapes that match that pattern and are not components. The widened scope
 * found both:
 *   an ALL_CAPS constant (CORNERS, MAX_OBSERVATION_EVENTS) has no lowercase letter;
 *   a React context (BoardsContext, GraphContext) is rendered as <Name.Provider>
 *   and read with useContext, never rendered as <Name>.
 */
const isConstantName = (name) => !/[a-z]/.test(name);
const isContextDeclaration = (text, name) =>
  new RegExp(`^export\\s+const\\s+${name}\\b[^=\\n]*=\\s*(?:React\\.)?createContext\\b`, 'm').test(text);

const scopeFiles = SCOPE.flatMap((p) => globSync(p, { ignore: IGNORE }));
const allFiles = globSync(ALL_SOURCES, { ignore: IGNORE });

const unjustified = ALLOWLIST.filter((a) => !a.reason || a.reason.trim().length < 20);
if (unjustified.length) {
  console.error('\nUnrendered-component guard failed: allowlist entries without a stated reason:');
  for (const a of unjustified) console.error(` - ${a.symbol}`);
  process.exit(1);
}

const bodies = new Map();
for (const f of allFiles) {
  bodies.set(f.replaceAll('\\', '/'), stripComments(fs.readFileSync(f, 'utf8')));
}

// Staleness: every allowlisted component must still be declared somewhere.
const declared = new Set();
for (const [, body] of bodies) {
  for (const m of body.matchAll(COMPONENT_RE)) declared.add(m[1]);
}
const stale = ALLOWLIST.filter((a) => !declared.has(a.symbol));
if (stale.length) {
  console.error('\nUnrendered-component guard failed: allowlist names components that no longer exist:');
  for (const a of stale) console.error(` - ${a.symbol}`);
  console.error('\nDelete these entries — an exemption for deleted code is a stale claim.\n');
  process.exit(1);
}
const exempt = new Set(ALLOWLIST.map((a) => a.symbol));

/*
 * ─── REACHABILITY ──────────────────────────────────────────────────────────
 *
 * Matching names was fooled twice, and both times dead code passed. A component
 * exported as `export default X` was invisible to COMPONENT_RE. And dead files that
 * render each other looked alive: src/pages/MainPage/Screens passed for as long as
 * this guard existed, because its screens referenced one another. Walking the
 * import graph from src/main.tsx answers the first question properly — can the app
 * load this file at all — and only files it can load are then judged by name.
 *
 * This enforces one slice of what scripts/survey-reachability.mjs reports (orphans,
 * test-only files, unrendered components, frozen props, unwired scripts). The survey
 * looks at each file's direct importers, so a chain of dead files that import one
 * another reads as used there. Cross-checked on 2026-09-13: of the 136 source files
 * the survey flagged orphan or test-only, this walk found 134 unreachable, and it found
 * 77 more that only dead files import. The two it did not flag are .eslintrc.js and
 * performanceOptimizationManager.ts, which storageOrchestrator imports — the survey
 * was wrong about that one.
 */
const ENTRY = 'src/main.tsx';
const aliases = (() => {
  try {
    const ts = require('typescript');
    const cfg = ts.parseConfigFileTextToJson('tsconfig.app.json', fs.readFileSync('tsconfig.app.json', 'utf8')).config;
    return Object.entries(cfg?.compilerOptions?.paths ?? {}).map(([k, v]) => [k.replace(/\*$/, ''), String(v[0]).replace(/\*$/, '')]);
  } catch {
    return [];
  }
})();
const RESOLVE_EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
function resolveImport(from, spec) {
  let base = null;
  if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(from), spec);
  else for (const [alias, target] of aliases) if (spec.startsWith(alias)) { base = path.posix.normalize(target + spec.slice(alias.length)); break; }
  if (!base) return null;
  for (const ext of RESOLVE_EXTS) if (bodies.has(base + ext)) return base + ext;
  return null;
}
const IMPORT_RES = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?['"]([^'"\n]+)['"]/g,
  /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /new\s+URL\(\s*['"]([^'"\n]+)['"]\s*,\s*import\.meta\.url/g,
];
const reachable = new Set();
if (bodies.has(ENTRY)) {
  const queue = [ENTRY];
  while (queue.length) {
    const file = queue.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);
    for (const re of IMPORT_RES) {
      for (const m of bodies.get(file).matchAll(re)) {
        const target = resolveImport(file, m[1]);
        if (target && !reachable.has(target)) queue.push(target);
      }
    }
  }
}

const DEFAULT_EXPORT_RE = /^export\s+default\s+([A-Z][\w$]*)\s*;?\s*$/gm;
const componentsDeclaredIn = (text) => [...new Set([...text.matchAll(COMPONENT_RE), ...text.matchAll(DEFAULT_EXPORT_RE)].map((m) => m[1]))]
  .filter((name) => !isConstantName(name) && !isContextDeclaration(text, name));

if (scopeFiles.length && !bodies.has(ENTRY)) {
  console.error(`\nUnrendered-component guard failed: ${ENTRY} was not found, so no component can be shown to be reachable.\n`);
  process.exit(1);
}
const unreachableFiles = [];
for (const file of scopeFiles) {
  const f = file.replaceAll('\\', '/');
  if (reachable.has(f)) continue;
  const names = componentsDeclaredIn(bodies.get(f) ?? '');
  if (!names.length || names.some((n) => exempt.has(n))) continue;
  unreachableFiles.push({ file: f, names });
}

/**
 * Every name a component is known by: its own, and any `Name as Alias` it is
 * re-exported or imported under. App.tsx renders the router provider only as
 * <ApplicationRouterProvider>, an alias, which this guard used to miss.
 */
function namesOf(symbol) {
  const names = new Set([symbol]);
  const alias = new RegExp(`\\b${symbol}\\s+as\\s+([A-Za-z_$][\\w$]*)`, 'g');
  for (const [, body] of bodies) for (const m of body.matchAll(alias)) names.add(m[1]);
  return names;
}

/** `<Name`, `<Name/>`, lazy(() => import('...Name')), or a route element reference. */
function isRenderedSomewhere(symbol, ownFile) {
  for (const name of namesOf(symbol)) {
    const jsx = new RegExp(`<${name}[\\s/>]`);
    const lazyOrRef = new RegExp(`\\b${name}\\b`);
    for (const [file, body] of bodies) {
      if (file === ownFile) continue;
      if (jsx.test(body)) return true;
      // A lazy import or a router table entry names the symbol without JSX.
      if (/lazy\(|element:|component:/.test(body) && lazyOrRef.test(body)) return true;
    }
  }
  return false;
}

const unrendered = [];
for (const file of scopeFiles) {
  const f = file.replaceAll('\\', '/');
  if (!reachable.has(f)) continue; // reported above, as unreachable
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  for (const m of text.matchAll(COMPONENT_RE)) {
    const symbol = m[1];
    if (exempt.has(symbol) || isConstantName(symbol) || isContextDeclaration(text, symbol)) continue;
    if (!isRenderedSomewhere(symbol, f)) unrendered.push({ file: f, symbol });
  }
}

/**
 * Shape 2: a boolean useState whose setter is never called with anything that
 * could be true. Deliberately conservative — it only reports a setter that is
 * called EXCLUSIVELY with `false`, or never called at all while the state is
 * read. Anything less strict reports every legitimately-conditional dialog.
 */
const deadToggles = [];
for (const file of scopeFiles) {
  const f = file.replaceAll('\\', '/');
  if (!reachable.has(f)) continue;
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  const decl = /const\s*\[\s*(\w+)\s*,\s*(set\w+)\s*\]\s*=\s*useState(?:<[^>]*>)?\(\s*false\s*\)/g;
  for (const m of text.matchAll(decl)) {
    const [, stateName, setter] = m;
    const calls = [...text.matchAll(new RegExp(`${setter}\\s*\\(([^)]*)\\)`, 'g'))]
      .map((c) => c[1].trim());
    if (!calls.length) continue;
    const everTruthy = calls.some((arg) => arg !== 'false' && arg !== '');
    const isRead = new RegExp(`\\b${stateName}\\b`).test(text.replace(decl, ''));
    if (!everTruthy && isRead) deadToggles.push({ file: f, stateName, setter });
  }
}

if (unrendered.length || deadToggles.length || unreachableFiles.length) {
  console.error('\nUnrendered-component guard FAILED.\n');
  if (unreachableFiles.length) {
    console.error(`${unreachableFiles.length} component file(s) the app cannot reach from ${ENTRY}:\n`);
    for (const u of unreachableFiles) console.error(`  ${u.file}\n    ${u.names.join(', ')}\n`);
  }
  if (unrendered.length) {
    console.error(`${unrendered.length} component(s) that nothing renders:\n`);
    const byFile = new Map();
    for (const o of unrendered) byFile.set(o.file, [...(byFile.get(o.file) ?? []), o.symbol]);
    for (const [file, symbols] of byFile) console.error(`  ${file}\n    ${symbols.join(', ')}\n`);
  }
  if (deadToggles.length) {
    console.error(`${deadToggles.length} toggle(s) that can be closed but never opened:\n`);
    for (const t of deadToggles) {
      console.error(`  ${t.file}\n    ${t.stateName} — ${t.setter}() is never called with a truthy value\n`);
    }
  }
  console.error('These ship in the bundle and cannot be reached by a user.');
  console.error('Wire it, delete it, or add it to ALLOWLIST in this file WITH a reason.\n');
  process.exit(1);
}

console.log(
  `Unrendered-component guard passed: ${scopeFiles.length} files in scope, all reachable from ${ENTRY}, `
  + `${ALLOWLIST.length} justified exemption(s).`
);
