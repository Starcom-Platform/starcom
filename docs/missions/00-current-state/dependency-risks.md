# Dependency risks: what is fixed, and what is accepted

Written 2026-11-20 for the owner and for anyone reviewing Starcom's security. It lists each
known advisory against Starcom's dependencies that is still open, whether it can reach a
visitor, and when to look again. It is a dated record: run `npm audit` for what holds now.

## What was fixed on 2026-11-20

- **Before:** `npm audit` found 25 advisories (6 high, 13 moderate, 6 low). GitHub's
  Dependabot showed 43 open alerts, 21 of them for `node-forge`.
- **Fixed without breaking changes (`npm audit fix`):**
  - `follow-redirects`, `node-forge` and `vite` (high);
  - `fast-uri`, `glob`, `postcss-selector-parser`, `qs`, `sucrase` and the
    `typescript-eslint` packages (moderate).
- **Zod 3 to Zod 4.6.7 (a major upgrade).** This was the one fix that mattered at run time.
  - Zod validates Mission Package manifests that arrive from relays, so its input is untrusted.
  - The advisory was memory exhaustion on oversized input.
  - The schema (`src/services/exchange/schema.ts`) needed three changes: `z.iso.datetime`,
    `z.record` with a key schema, and `error.issues`.
  - The typecheck passes, as do 52 test files (546 tests) that touch manifests, including the
    mission-package test vectors.
- **The Uplink extension's lockfile:** `vite` was fixed. The extension builds and `npm audit`
  finds nothing.
- **After:** 10 advisories (2 high, 2 moderate, 6 low), all below.

## Accepted, and why

| Advisory | Severity | Reaches a visitor? | Why it is accepted | Look again when |
| --- | --- | --- | --- | --- |
| `sharp` (libvips, libheif and librsvg CVEs), pulled in by `@huggingface/transformers` 3.8.1 | high | **No.** | `sharp` is a Node image library. Transformers runs only in the translation worker (`src/services/translation/nllb.worker.ts`) in the browser, where it uses its web build and never loads `sharp`. Nothing in `scripts/` runs transformers in Node. The fix is transformers 4, a major upgrade that would need the on-device translator re-tested. | Transformers 4 is adopted for its own reasons, or a script starts running transformers in Node. |
| `elliptic` and its chain: `browserify-sign`, `create-ecdh`, `crypto-browserify`, `node-stdlib-browser`, `vite-plugin-node-polyfills` | low | **No.** | The `crypto` polyfill that carried `elliptic` was removed from the build on 2026-10-16 (security audit SA4, `vite.config.ts`). The package is still installed with the polyfill plugin, but no code path bundles it. npm's suggested fix is version 0.2.0 of the plugin, an older release, not a fix. | The polyfill plugin is next touched. Removing it entirely is worth trying, since few Node built-ins are still used in `src/`. |
| `minimatch` via `depcheck` | moderate | **No.** | `depcheck` is a development tool run by hand. The advisory is slow matching on hostile glob patterns, and the only patterns it sees are this repository's own. | `depcheck` 1.4.6 or later is released without it, or the tool is dropped. |

## How "reaches a visitor" was checked

- **The bundle:** the production build was searched for each package's distinctive code.
  None of `sharp`, `elliptic`, `node-forge` or `follow-redirects` is in it. Minified code can
  hide a package, so this is a check, not a proof. The 2026-10-16 security audit
  (`security-audit-2026-10-16.md`) traced the same question through the import graph.
- **What the build is told to include:** read from `vite.config.ts`.
