/**
 * Starcom Uplink's build (decision D-EX, EX9 and E0): one source, a package for Chromium (Brave first,
 * then Chrome, Edge, Opera, Vivaldi) and one for Firefox.
 *
 * It asks for as little as it can at install: storage, for the activity log, and scripting, to add
 * the bridge to Starcom tabs already open when it is installed. Every site beyond
 * Starcom is an optional permission, asked for by a feature with its purpose when first needed; all
 * sites at once (power mode) is optional too (EX3). The bridge script runs on starcom.app alone, and
 * on localhost only in a development build.
 *
 * Every permission comes from permissions.json, with its reason; nothing is asked for here that is
 * not there (scripts/guard-uplink-permissions.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'wxt';
import uplink from './permissions.json';
import { bridgePages } from './lib/pages';

/**
 * The app's files Uplink is built from, as paths from the repository: found by following its imports
 * from its entrypoints, so the sources zip a store reviewer rebuilds from is never missing one, and
 * carries nothing else of the app. Found anew at each build, so it cannot go stale.
 */
function sharedSources(): string[] {
  const repo = path.resolve(__dirname, '..');
  const files = (dir: string) => fs.readdirSync(path.join(__dirname, dir), { recursive: true })
    .map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(__dirname, dir, f));
  const seen = new Set<string>();
  const follow = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    // Static imports and exports, and import() too: a language's words load as their own chunk (D-ML, L5).
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/(?:(?:import|export)\s[^'"]*?from\s+|import\(\s*)['"](\.[^'"]+)['"]/g)) {
      const base = path.resolve(path.dirname(file), m[1]);
      const found = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
      if (found) follow(found);
    }
  };
  [...files('entrypoints'), ...files('lib')].forEach(follow);
  return [...seen].map((f) => path.relative(repo, f)).filter((f) => !f.startsWith('extension/')).sort();
}

export default defineConfig({
  srcDir: '.',
  // How class fields compile, said here rather than read from the repository's tsconfig.json: the
  // sources zip does not carry the app's configs, and the rebuild must match the package byte for byte.
  // And nostr-tools, which the shared files import, taken from Uplink's own package: resolved by folder,
  // they would reach the repository's copy, which the sources zip does not carry.
  vite: () => ({
    esbuild: { tsconfigRaw: { compilerOptions: { useDefineForClassFields: true } } },
    resolve: {
      alias: [
        { find: /^nostr-tools$/, replacement: path.join(__dirname, 'node_modules/nostr-tools/lib/esm/index.js') },
        { find: /^nostr-tools\/([a-z0-9]+)$/, replacement: path.join(__dirname, 'node_modules/nostr-tools/lib/esm/$1.js') },
      ],
    },
  }),
  // The sources zip, for a store that rebuilds what it reviews: Uplink's own folder and the app's files
  // it imports, named one by one. Nothing else of the repository, and no dotfile.
  zip: {
    sourcesRoot: '..',
    includeSources: ['extension/**', ...sharedSources()],
    excludeSources: ['extension/node_modules/**', 'extension/.output/**', 'extension/.wxt/**'],
  },
  manifest: ({ browser, mode }) => ({
    name: 'Starcom Uplink',
    description: 'Connects your Starcom investigations to your browser. Asks before it touches any site, says why, and logs what it does.',
    // Firefox's sidebar needs no permission: what only Chromium uses is asked for there alone.
    permissions: Object.keys(uplink.permissions).filter((p) => browser !== 'firefox' || !uplink.chromium_only.includes(p)),
    // Starcom's own pages as hosts too, not only as where the bridge runs: a page a content script runs
    // on is not one the browser lets Uplink find among the open tabs, so the bridge reached no Starcom
    // tab already open at install (seen in Brave, 2026-10-12). The same pages, so no new warning.
    host_permissions: bridgePages(mode),
    optional_host_permissions: uplink.optional_host_permissions.patterns,
    action: { default_title: 'Starcom Uplink' },
    // Firefox asks every new add-on what it collects (from 2025-11-03), read from Firefox 140.
    ...(browser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'uplink@starcom.app', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } } } }
      : {}),
  }),
});
