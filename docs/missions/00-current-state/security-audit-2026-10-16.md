# Dependency audit, 16 October 2026

Measured read-only, before anything is changed (the owner's request of 13
October, taken up first on 16 October, ahead of the critique's work). Node
22.23.2, npm 10.9.8.

## The counts

- **npm audit:** 94 vulnerable packages of 1,809 installed: 5 critical, 68
  high, 15 moderate, 6 low. With dev dependencies left out, 49 (2 critical,
  30 high), but this repo keeps build tools (vite, typescript, tailwindcss)
  in `dependencies`, so "prod" here is not "shipped".
- **GitHub Dependabot:** 43 open alerts on 20 packages: 6 critical, 20 high,
  15 medium, 2 low, the figure the remote prints on every push.

## What reaches a visitor's browser

A one-off build with sourcemaps (`vite build --sourcemap`, into a scratch
folder) lists every module bundled: 341 packages. Of the 20 alerted, **six
ship**:

| Package (installed) | Severity | What | Fixed in | Where it runs here |
|---|---|---|---|---|
| maplibre-gl 5.24.0 | critical | XSS: its HTML sanitizer can be bypassed (GHSA-jrc7-96c5-q579) | 6.4.1, a major | Only the Intel Analyzer's map view. No popup takes our HTML, but the style comes from a third party (demotiles.maplibre.org), and a style's attribution is the HTML it sanitizes. The enforced CSP is a second line. |
| axios 1.19.0 | 7 high, 5 medium | Header injection and redirect SSRF in the fetch adapter, prototype-pollution gadgets; the rest are Node-only (HTTP/2, proxies) | 1.20.0, a minor | Many services' fetches. |
| @libp2p/kad-dht 15.1.11 | high | Unvalidated PUT_VALUE fills a DHT server's disk | through helia 7, two majors | The in-browser IPFS node (helia 5.5.1), started only when something uploads (IPFSService, NetRunner's OsintIntelBridge). A browser node is a DHT client, not a server. |
| @libp2p/peer-store 11.2.7 | high | Accepts attacker-signed peer records, poisoning a peer's addresses | through helia 7 | The same node. Content is checked by its hash, so a poisoned address misroutes, not corrupts. |
| pbkdf2 3.1.5 | medium | Long passwords rehashed each round: a slow-down | 3.1.7, a patch | The `crypto` polyfill vite.config.ts adds "for IPFS" (crypto-browserify). Nothing of ours calls it directly. |
| elliptic 6.6.1 | low | A risky primitive | none published | The same polyfill. Nostr signing uses noble's curves, not this. |

**The other fourteen never ship:** handlebars (from ts-jest), shell-quote
(from react-native, below), tinypool and @vitest/mocker (vitest), sharp
(transformers' Node side), undici, node-forge (libp2p's Node TLS),
brace-expansion, braces, source-map-js, postcss-selector-parser, smol-toml,
sprintf-js. They run on a developer's machine or a build server.

## Found on the way

- **react-native is installed, and never used:** helia's WebRTC transport
  (`@libp2p/webrtc`) depends on react-native-webrtc, which brings
  react-native 0.87 and its tooling; shell-quote's critical comes with it.
- **Jest is left over:** `jest` 29, `ts-jest` and `jest.config.cjs` remain,
  one source file uses Jest's API, and 435 use vitest's. ts-jest brings
  handlebars' critical and most of the 68 highs.
- **A non-forced `npm audit fix`** would apply the fixes that stay within the
  declared ranges (axios, pbkdf2, handlebars, shell-quote, undici and the
  glob and brace packages); every other fix is a major version. It also moves
  typescript-eslint from 8.41 to 8.71 and tailwindcss from 3.4.17 to 3.4.19,
  both inside their ranges.
- **The whole IPFS stack loads on a first visit.** The node starts only when
  something uploads, but `ipfs-client.ts` imports helia statically, and the
  chat context and the exchange's publish import it, so helia, libp2p, WebRTC
  and their certificate libraries sit in the entry chunk: 922 KB of its
  2,672 KB minified, about 230 KB of its 670 KB compressed.
- **The `crypto` polyfill is built but never fetched.** Its chunk (697 KB,
  elliptic and pbkdf2 in it) is reached only by mlkem's fallback for a browser
  without `globalThis.crypto`, which no browser able to run the globe lacks.
- **The enforced CSP allows no inline script** (`script-src 'self'
  'wasm-unsafe-eval'`), which defangs the usual payloads of maplibre's
  sanitizer bypass. maplibre is 1,033 KB of the Intel Analyzer's 1,277 KB
  chunk, loaded only there; its style comes from MapLibre's demo tile server.
- **A browser upload lives only as long as its tab.** helia starts with an
  in-memory blockstore, so a report published "on IPFS" from the browser has
  its CID computed and its bytes held in that tab; a gateway can fetch it only
  while the tab stays open and reachable.

## Decisions

| | Decision |
|---|---|
| SA1 | (2026-10-16.) **The fixes within range go in:** a plain `npm audit fix`, never `--force`; newer lint rules fixed or reported. |
| SA2 | (2026-10-16.) **maplibre-gl to 6.14**, the Intel Analyzer's map checked on the build: points, clusters, the selection halo, drawing a polygon, a click. |
| SA3 | (2026-10-16.) **The IPFS node loads on demand, and helia goes to 7.** The first visit no longer carries it; behaviour is unchanged. Durable uploads (a pinning service, BYOK) are not part of this. |
| SA4 | (2026-10-16.) **The tooling is cleaned:** Jest removed, its one file ported to vitest; the `crypto` polyfill dropped; vitest to 5, last and on its own; the full suite run once at the end. |

## Build order

Each step: the change; types; lint on what it touched; the affected tests
(the full suite once, at the end); a build; a probe where it ships; commit.

1. SA1, the fixes within range.
2. SA4, the `crypto` polyfill dropped.
3. SA4, Jest removed.
4. SA2, maplibre-gl 6.
5. SA3, the IPFS node on demand, then helia 7.
6. SA4, vitest 5.
7. The full suite; `npm audit` and the alerts measured again.

## Done

- **Step 1, SA1** (1d7bf81f): a plain `npm audit fix`; 94 vulnerable
  packages became 78. The whole repo linted with typescript-eslint 8.41 and
  with 8.71 gives the same 265 errors and 276 warnings, finding for finding.
- **Step 2, SA4** (9b5791c4): `crypto` gone from the polyfills, the alias,
  the pre-bundled list and our dependencies. elliptic's and pbkdf2's code is
  absent from the build. crypto-browserify stays installed through the
  polyfill plugin's own dependency (node-stdlib-browser), so elliptic's
  alert stays open in the lockfile though nothing of it ships.
- **Step 3, SA4** (62c87364): Jest gone, 217 packages with it; 78 became 49.
  `src/setupTests.ts` was Jest's own setup and went with it; the two configs
  that named tests matched no file. The lockfile only lost packages.
- **Step 4, SA2** (0279c9b2): maplibre-gl 6.14. It has no default export,
  and it looks for its worker beside its own module, which a bundle does not
  keep: on the first build the map drew its ocean and never loaded. The view
  hands it the worker file the build emits. On the build, under the
  production CSP: tiles, points, clusters, a polygon, a point clicked into
  the inspector with its halo.
- **Step 5, SA3** (cbced31a, f5ad761d): the IPFS stack imported on the first
  upload, and helia 7, whose node must be started (helia 5 started it
  itself). The chunk rule leaves out of the eager crypto chunk the noble
  copies only libp2p reaches. A first visit's scripts: the entry chunk
  2,748 → 1,684 KB minified, the crypto chunk 140 → 86 KB; 3,936 KB in all,
  976 KB compressed. An upload ran in a browser on helia 7 (bytes added
  locally and read back, nothing pinned or announced), through the dev
  server and through this config's chunking under the production CSP.
  48 vulnerable packages became 44.
- **Step 6, SA4** (74093242): vitest 5. Six changes reached tests and
  setup. `poolOptions` became `maxWorkers`; `--minWorkers` went. The spy
  registry setupVitest pruned no longer leaks, and the prune went. A mock
  called with `new` must be a function, not an arrow (13 files). A
  function returned from `beforeEach` now runs as its cleanup, so
  `beforeEach(() => mock.mockReset())` ran the mock after each test (24
  hooks). An error thrown in cleanup fails the test (one mock lacked
  `dispose`). jest-dom's matchers lost their way into the types, and
  `src/types/vitest-jest-dom.d.ts` puts them back. 44 became 41, and no
  critical is left.
- **Step 7:** the full suite, sharded, run once, on vitest 5: 22 files
  failed. Run on vitest 3, 19 of them passed, so those were vitest 5's;
  all pass now, with the 18 other files the hook rewrite touched. The other
  three failed on vitest 3 too, standing since earlier work because the
  affected-tests runner cannot see a test that scans the source (d8d90f67):
  an undefined token in Diplomacy, number formatting flagged as time
  formatting in eight files, a CountryFinder test listing the other
  session's growing area registry.

## What is left (`npm audit`, 41 packages, six advisories)

None reaches a visitor's browser: each one's code is absent from the
build.

| Advisory | Severity | Through | Where it runs |
|---|---|---|---|
| node-forge | high | libp2p's Node TLS | Node only |
| sharp | high | @huggingface/transformers | Node only |
| braces | high | knip | a developer's machine |
| sprintf-js | moderate | depcheck | a developer's machine |
| postcss-selector-parser | moderate | the CSS build; no fix published | the build |
| elliptic | low | vite-plugin-node-polyfills' node-stdlib-browser | the build, no longer bundled |

**GitHub's Dependabot, after the push (a5c5361e, live):** 8 open alerts on
these six packages (5 high, 2 medium, 1 low), down from 43 on 20. On the
live site the entry chunk carries no IPFS code, a first visit's scripts
are 3,935 KB (1,225 KB as sent), and the Intel Analyzer's map loads its
worker from starcom.app and draws.

## Re-audit, 23 October 2026

GitHub's push banner on d191cbbe said 10 alerts; the API lists 9 open: 7 high, 1 medium, 1 low.

**What changed since the 16 October audit:**
- Two new high alerts: follow-redirects 1.16.0, through axios. They concern credential headers kept across a
  cross-origin redirect.
- sprintf-js's alert is gone.

`npm audit` lists 21 packages, three advisories of them new:
- **zod** (high): validating a large array can exhaust memory.
- **vite 6.4.3** (high, dev server only): launch-editor on Windows, a file outside `server.fs.allow` served on
  macOS, and cross-origin script execution through custom middleware.
- **follow-redirects**, as above.

**What ships.** Marker strings were searched in the local build of 23 October, including the lazy Helia chunk and
the NLLB worker. None of follow-redirects, node-forge, acme-client, elliptic, crypto-browserify or sharp is in it.
One "ERR_FR_TOO_MANY_REDIRECTS" is axios's error-code constant, and one "sharp:" is MUI's easing curve. No script
in `scripts/` uses axios or sharp.

**The one finding in shipped code: zod and other people's Mission Packages.**
- Every package read for Missions passes `validateManifest`. That is the globe's Missions mode, the Missions panel,
  Operations and Market Exchange.
- They are read from every author on The Record and the five NavCom relays.
- Its `reports`, `intel` and `assets` arrays have no length cap, and zod 3 parses every element and keeps an issue
  for each failure. A `.max()` would not help: zod 3 records the length issue and still parses every element.

Measured on zod 3.25.76 (M2, Node 22), with every element failing:

| Content | Elements | Issues | Time | Memory |
|---|---|---|---|---|
| 64 KB | 21,831 | 65,493 | 53 ms | +21 MB |
| 512 KB | 174,747 | 524,241 | 315 ms | +155 MB |
| 2 MB | 699,036 | 2,097,108 | 1,708 ms | +508 MB |

The relays' own limits (NIP-11, read 23 October):
- relay.primal.net and relay.damus.io accept 1,000,000-byte messages.
- The Record, nos.lol and nostr.mom accept 131,072.
- relay.wellorder.net states none.

So one signed 1 MB event, from any key, costs each reader about 250 MB and most of a second on an M2, more on a
phone. Many such events multiply it.

Real packages are small. The Record's 118 have content of at most 37,742 bytes (median 18,254), and no array
longer than 1 entry. A cap on content and array length before the schema check refuses nothing real.

**No fix in the current lines:**
- node-forge: Helia, then libp2p-auto-tls, then acme-client. Node-only, never run.
- elliptic: the node polyfills plugin. Not bundled.
- postcss-selector-parser 6: Tailwind 3. Build time, our own CSS.
- braces: the advisory is withdrawn.

**Fixes in range:**
- vite 6.4.5 and follow-redirects 1.16.1.
- sharp 0.35.5, needed by all three sharp alerts. It comes either through an override under transformers 3, or
  with transformers 4.3.1, a major.

Any of these changes `package-lock.json`, which makes `test:affected` select every test: the full suite.

**GitHub's scanning:**
- Secret scanning and code scanning are both off. The repository is private.
- A tracked-files scan for private-key patterns (nsec, PEM, AWS, GitHub, Slack, Google, API-key shapes, 64-hex
  secrets) printed counts only, never values. It found two hits, both harmless: a test's throwaway key (RS58's
  held-back check) and a news URL slug.
- The history's five prototype keys are already listed for the mirror sweep.

### Found later the same day: the dev server, and live keys in the history

The owner asked why each option was offered. Answering that found two problems no alert names. Both are written up
for the owner in [Security review: why each option](https://claude.ai/artifact/FvvBM7RSpPscVcyf6Etqic).

**The dev server serves secrets.** `vite.config.ts` has had three settings since c0a8b4b71 (19 July 2025):
- `host: '0.0.0.0'`
- `cors: true`
- `fs.strict: false`, which turns off Vite's allow list and its deny list together.

The probe ran a dev server on 127.0.0.1 and sent an `Origin: https://evil.example` header. Only my own probe files
were read back; real files were checked by length only, never read.

| File | Answer |
|---|---|
| `.starcom-identity.json` | Served, 4,614 bytes |
| `.env.local` | Served, 1,385 bytes |
| `.env.production` | Served |
| `~/.config/gh/hosts.yml` | Served |
| `/etc/hosts` | Served |

Every answer carried `Access-Control-Allow-Origin: *`. No key value is in the build, including its lazy chunks, nor
in the live entry scripts.

**Live keys in the history.** A read-only scan compared every added line of every commit with today's values,
printing names only. These are still valid today:

| Keys | Where | When |
|---|---|---|
| Telegram and Discord bot tokens | A committed heap snapshot, `artifacts/memory-smoke/…heapsnapshot` | f3019f5e3, removed 5e1b92a4f |
| Shodan, VirusTotal | `docs/CENSYS-API-POLICY-UPDATE.md` | a33dc0c35, since edited out |
| ACLED, Alpha Vantage, EIA, OpenWeatherMap | The prototype's `.env` | 2025 |
| Alpha Vantage | `docs/foundation-establishment/04-security/audit/SECURITY.md` | In today's tree |

Starcom's identity keys are in no commit. The repository is private, with one collaborator, no deploy keys and no
forks. None of these keys is used by the built app.

### The owner's decisions, 23 October

| Finding | Decision |
|---|---|
| The dev server | **Not this workspace's.** In the owner's words: "They are dealing with the problem/solution of the .env leak file; this project workspace no longer, and never will be in need, of dealing with such problems." Starcom App is "focused on the UX/UI and the Client-Side experience". The dev server is "still an expansion of multiple Decentralized systems that each need to be either internal/private/public/other". No change to `vite.config.ts` here. |
| The exposed keys | **Dated for 2 and 13 November, through Mecha Jono:** "out-source key problems to MJ (only client-side keys stored in the vercel prod env vars is what really matters for this particular app)". |
| Starcom's identity key | **Checked for misuse, and kept.** The Record holds one event signed by `b778a0d1…`: a kind 30082 attested claim of 28 August (an organisation's headquarters country, schema 2), Starcom's own. nos.lol, Primal, Damus, nostr.mom, wellorder, oxtr, bitcoiner and snort hold none. relay.nostr.band did not answer. |
| Other people's packages | **Size and count caps, built:** content over 131,072 bytes is refused as `content-too-large`, and a list over 1,000 entries as `list-too-long`, both before the schema check. Nine mutants were killed. Spec rev 19 records the limits. |
