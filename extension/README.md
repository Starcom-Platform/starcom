# Starcom Uplink

Starcom Uplink is Starcom's browser extension. Its single purpose, as
[`permissions.json`](permissions.json) states it: "Starcom Uplink connects Starcom
(starcom.app) to your browser, so your Starcom investigations can reach the sites
you allow, one site at a time, each asked for with its reason, and everything it
does logged where you can read it."

In practice, version 0.1.0 does these things for the Starcom web app:

- **Send to Starcom.** A right-click item sends a selection, a link, an image or
  a page to Starcom. Uplink keeps it until Starcom takes it into the person's
  cases, and the toolbar icon counts what waits.
- **Capture as evidence.** A right-click item, or the popup, keeps a screenshot,
  the page's HTML and its text, each with its SHA-256. If the person turns
  timestamps on, each capture also gets an OpenTimestamps proof.
- **Read a site for NetRunner.** Uplink fetches a site the person has allowed,
  without their cookies. It asks for each site in its own window, with the
  feature and the reason. It never asks for a private or local address.
- **Hold the person's key.** The key is sealed under a passphrase (NIP-49).
  Uplink signs with it, asking first before anything public, and encrypts and
  decrypts with NIP-44. Starcom's page never sees the key or the passphrase.
- **Show Starcom beside the page.** This uses the side panel in Chromium
  browsers and the sidebar in Firefox.
- **Keep an activity log.** Every request is logged with its purpose and
  outcome, refusals included. The person reads it on Uplink's options page.

Why it was built, and in what order, is decision D-EX:
[`docs/missions/01-architecture-decisions/browser-extension.md`](../docs/missions/01-architecture-decisions/browser-extension.md).
That record starts as a plan. Its step notes (E0, W1–W12, E3) say what was
actually built. Where the plan and the code differ, the code is what runs. For
example, the plan's `externally_connectable` became the bridge content script
described below.

## Where the code is

The code is split in two. The browser wiring lives in `extension/`. The
decisions live in `src/extension/`, where the app's own tests cover them.

**`extension/`** is the browser wiring, built with [WXT](https://wxt.dev) 0.21:

| Path | What it is |
|---|---|
| `wxt.config.ts` | The build. The manifest is made here from `permissions.json`. It also says which app files go into the sources zip a store reviewer rebuilds from. |
| `permissions.json` | Every permission Uplink asks for, each with its reason. It is the single source (see [Permissions](#permissions)). |
| `entrypoints/background.ts` | Wires the browser to the decisions in `src/extension/uplink/handlers.ts`. It decides nothing itself. It also sets up the right-click items and the icon's count. |
| `entrypoints/starcom-bridge.content.ts` | The bridge on Starcom's pages (see [How the page and Uplink talk](#how-the-page-and-uplink-talk)). |
| `entrypoints/popup/` | The toolbar popup. It shows the version, what Uplink may reach, "send this page" and "capture as evidence". |
| `entrypoints/options/` | The options page, in a tab. It holds the activity log, each allowed site with a way to take it back, power mode, timestamps, and the key. |
| `entrypoints/sidepanel/` | The side panel or sidebar. It frames Starcom's own `/panel` page. |
| `entrypoints/grant/`, `key/`, `sign/` | Uplink's own windows. They ask the person to allow a site, to set or type the passphrase, or to agree to a signature. |
| `lib/pages.ts` | Which pages the bridge runs on, and which Starcom the side panel frames, for a development or production build. |
| `lib/theme.ts`, `lib/words.ts` | Starcom's colours, and Uplink's words in the language Starcom last showed, for Uplink's own pages. |
| `public/icon/` | The icons. |
| `store/` | The store listing, screenshots, promo tile, and the script that made the screenshots (see [The store](#the-store)). |

**`src/extension/`** holds the decisions and the app's side of the connection,
in plain TypeScript, tested with vitest like the rest of the app:

| Path | What it is |
|---|---|
| `src/extension/protocol.ts` | The protocol both sides import: the messages, the capabilities, the purpose rule and the kinds of refusal. Because both sides use this one file, a change breaks the build on both at once. It uses no browser APIs. |
| `src/extension/uplink/` | The extension's own decisions: `handlers.ts` (what Uplink answers), `bridge.ts` (the bridge's logic), `captures.ts`, `evidence.ts`, `keyStore.ts`, `signerRules.ts`, `siteFetch.ts`, `opentimestamps.ts`. They are pure. The browser is handed in as an `UplinkHost`, so they run under the app's tests. |
| `src/extension/*.ts` (the rest) | The app's side: `uplinkClient.ts` talks to the bridge, `useStarcomUplink.ts` and the other hooks are used by the app's screens, and `takeCaptures.ts`, `keepEvidence.ts`, `completeTimestamps.ts`, `siteFetcher.ts`, `uplinkSigner.ts` and `moveKey.ts` do the rest. |
| `src/extension/__tests__/` | The tests for all of the above. |
| `src/i18n/uplink/` | Uplink's words: `en.ts`, and the other languages under `locales/`. |

The rule the code follows: a decision goes in `src/extension/uplink/` with a
test, and the entrypoints only connect the browser to it. The extension
imports these files by relative path (`../../src/extension/...`). The sources
zip carries exactly the app files those imports reach, which `sharedSources()`
in `wxt.config.ts` finds by following them.

## Install and build

Use Node 22. The repository's `.nvmrc` says 22.23.2, and its `package.json`
asks for 22.13 or later.

Run every script below **inside `extension/`**. Uplink has its own
`package.json` and `node_modules`, separate from the app's.

```sh
cd extension
npm install          # also runs `wxt prepare` (postinstall), which writes extension/.wxt
```

The scripts in `extension/package.json`:

| Script | Runs | Writes |
|---|---|---|
| `npm run dev` | `wxt` | A development build for Chromium in `extension/.output/chrome-mv3-dev`, rebuilt as you edit |
| `npm run dev:firefox` | `wxt -b firefox` | A development build for Firefox (see the note on Manifest V3 below) |
| `npm run build` | `wxt build` | A production build for Chromium in `extension/.output/chrome-mv3` |
| `npm run build:firefox` | `wxt build -b firefox` | A production build for Firefox |
| `npm run zip` | `wxt zip` | The Chromium build and `extension/.output/starcom-uplink-<version>-chrome.zip` |
| `npm run zip:firefox` | `wxt zip -b firefox` | The Firefox build, its zip, and `starcom-uplink-<version>-sources.zip` for the reviewer's rebuild |
| `npm run typecheck` | `tsc --noEmit` | Nothing (it checks against the types in `extension/.wxt`) |

`extension/.output/` and `extension/.wxt/` are both in the repository's
`.gitignore`.

**Firefox and Manifest V3.** WXT 0.21 builds Firefox as Manifest V2 unless it
is told otherwise. In that case it writes `firefox-mv2` and `firefox-mv2-dev`.
The Firefox build checked in D-EX (E0, 2026-10-11) is Manifest V3. To get
that build, pass `--mv3` through npm:
`npm run build:firefox -- --mv3` (writes `.output/firefox-mv3`), or
`npm run dev:firefox -- --mv3` (writes `.output/firefox-mv3-dev`). The
manifest asks for Firefox 140 or later (`strict_min_version`). That is because
it declares to Firefox's add-on site that it collects no data
(`data_collection_permissions`).

Building needs only `extension/`'s own dependencies. `wxt.config.ts` points
`nostr-tools` at `extension/node_modules`. The tests run from the repository
root, though, so they need the app's dependencies too (`npm install` at the
root).

### Development and production builds differ

| | Development (`dev`, `dev:firefox`) | Production (`build`, `zip`, and their Firefox forms) |
|---|---|---|
| Bridge runs on, and is granted at install | `https://starcom.app/*`, `https://www.starcom.app/*`, `http://localhost/*`, `http://127.0.0.1/*` | `https://starcom.app/*`, `https://www.starcom.app/*` only |
| Side panel frames | `WXT_STARCOM_ORIGIN` + `/panel`, or `http://localhost:5210/panel` when that is unset | `https://starcom.app/panel` |

The switch is in `lib/pages.ts`. `WXT_STARCOM_ORIGIN` is read when the
extension is built. WXT takes `WXT_`-prefixed variables from the environment
and from `.env` files in `extension/`. Port 5210 is where the repository's
notes serve a production build of the app with
`npx vite preview --port 5210 --strictPort`. The app's dev server
(`npm run dev` at the root) listens on 5174 (`vite.config.ts`). So to frame
the dev server instead, build Uplink with
`WXT_STARCOM_ORIGIN=http://localhost:5174`.

## Load it in a browser

**`npm run dev` does not open a browser by itself here.** WXT does that through
the `web-ext` package. Uplink's `package.json` does not install it, so WXT
falls back to printing the folder to load. Load the build unpacked as below.

**Chrome, Brave and other Chromium browsers:**

1. Open the browser's extensions page: `chrome://extensions`, or
   `brave://extensions` in Brave.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**, and pick `extension/.output/chrome-mv3-dev` for a
   development build or `extension/.output/chrome-mv3` for a production build.
4. After a production rebuild, press the reload button on Uplink's card. A
   Starcom tab that was already open gets the bridge without a reload, because
   Uplink adds it to open Starcom tabs when it is installed or updated.

**Firefox (140 or later):**

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…** and pick the `manifest.json` in the build
   folder (`extension/.output/firefox-mv3-dev`, `firefox-mv3`, or the `-mv2`
   folders if you built without `--mv3`).
3. A temporary add-on is removed when Firefox quits. Load it again after a
   restart, or press **Reload** on its entry after a rebuild.

Then open Starcom (starcom.app for a production build, or your local Starcom
for a development build). Starcom's header shows Uplink as connected.

## How the page and Uplink talk

The app and the extension meet through a content script, the bridge, and not
through `externally_connectable`. Chromium's `externally_connectable` would put
the extension's ID in the app, and Firefox does not have it (D-EX, E0 step
notes). One request goes like this:

1. **The page posts to its own window.** `src/extension/uplinkClient.ts` posts
   `{ channel: 'starcom-uplink', direction: 'to-uplink', body }` with
   `window.postMessage`. A hello that gets no answer within 800 ms means Uplink
   is not installed, and the app carries on without it. A request that gets no
   answer within 30 s is "could not reach".
2. **The bridge carries it.** `entrypoints/starcom-bridge.content.ts` runs
   `startBridge` (`src/extension/uplink/bridge.ts`) at `document_start` in every
   frame of the bridge pages, so the side panel's framed Starcom gets it too.
   The bridge passes only messages from the page's own window and origin that
   `isBridgeMessage` (in `protocol.ts`) accepts. It forwards them to the
   background with `runtime.sendMessage({ via: 'bridge', body })`. When it
   starts, it posts `present`, so a page that was open at install notices
   Uplink without a reload. While it runs, it posts `captured` with a count
   when captures are waiting.
3. **The background checks and hands over.** `background.ts` accepts a
   `bridge` message only from Uplink itself (`sender.id`). It works out the
   Starcom page with `starcomSenderUrl`: a Starcom frame inside another site
   is not Starcom asking. It then calls `handleToUplink(body, senderUrl, host)`.
4. **The handlers decide.** `src/extension/uplink/handlers.ts` refuses
   anything whose page fails `isStarcomPage` with "Uplink answers only
   starcom.app". It answers a hello with its version, the protocol version,
   the capabilities, and the captures waiting. Any other request runs its
   capability, and one line goes into the activity log with the purpose, what
   was touched, and the outcome, refusals included.
5. **The answer goes back** the same way, as a `from-uplink` message on the
   page's window.

**Which pages it answers, today.** `isStarcomPage` accepts
`https://starcom.app`, `https://www.starcom.app`, and `http://localhost` or
`http://127.0.0.1` on any port. Plain `http://starcom.app` and look-alike
hosts are refused (`handlers.test.ts`). A production build, though, runs the
bridge and holds host access on starcom.app alone. So in practice a production
Uplink answers starcom.app only, and a development build also answers a local
Starcom.

**The protocol** (`src/extension/protocol.ts`):

- `CAPABILITIES` lists what Uplink can be asked to do. Today that is the
  activity log, permissions status and requests, the captures and their
  files, the inbox count, `site.fetch`, and the `signer.*` group.
  `CAPABILITY_MEANS` says each one in words.
- Every request carries a `purpose`: 8 to 200 characters, plain words, no
  markup (`purposeProblem`). The purpose is shown where Uplink asks the
  person, and it is kept in the log.
- A refusal is one of six kinds: `declined`, `not-granted`, `unreachable`,
  `not-found`, `refused` or `unsupported`, each with a reason. "The person
  said no", "not allowed", "could not reach" and "found nothing" are never the
  same answer.
- `UPLINK_PROTOCOL` is 1. Raise it on any change a peer must know about.

**To add a capability:**

1. Add it to `CAPABILITIES`, `CAPABILITY_MEANS`, `ArgsOf` and `ResultOf` in
   `protocol.ts`.
2. Answer it in the `answer` switch in `handlers.ts`, with tests in
   `src/extension/__tests__/handlers.test.ts`.
3. If it needs the browser, add a method to `UplinkHost` and implement it in
   `background.ts`.
4. Call it from the app with `uplinkClient.request(capability, purpose, args)`.
5. If it needs a permission, see the next section.

## Permissions

[`permissions.json`](permissions.json) is the single source. The manifest is
made from it in `wxt.config.ts`, and nothing is asked for there that the file
does not list. The reasons below are short forms. The file has each one in
full.

| Permission | Why |
|---|---|
| `storage` | Keeps the activity log and the person's settings in this browser. |
| `scripting` | Adds the bridge to Starcom tabs already open when Uplink is installed or updated, and reads a page's HTML and text when the person captures it as evidence. |
| `contextMenus` | "Send to Starcom" and "Capture as evidence" on the right-click menu. |
| `activeTab` | Reads the one tab the person sends or captures, at that moment only. |
| `sidePanel` | Shows Starcom in the side panel. Chromium only (`chromium_only`): Firefox's sidebar needs no permission. |
| `unlimitedStorage` | Holds an evidence capture's picture and page copy, which can pass the browser's usual 10 MB, until Starcom takes them. |
| Host access to Starcom's pages (`bridge_pages`) | Runs the bridge on starcom.app and www.starcom.app. It is also listed as host permissions, so Uplink can find Starcom tabs already open at install. |
| Every other site (`optional_host_permissions`: `https://*/*`, `http://*/*`) | Optional, and never granted at install. A feature asks for one site, in Uplink's grant window, with its reason. Power mode, which only the person can turn on, asks for all sites at once. The person can take any site back on the options page. |

The file also states the remote-code answer ("None") and the data-collection
answer that the stores ask for.

**The guard.** `scripts/guard-uplink-permissions.mjs` holds everything to that
file. It runs in `npm run guards` at the root, or alone as
`node scripts/guard-uplink-permissions.mjs`. It checks that:

- `wxt.config.ts` reads `permissions.json` and writes no permission list of
  its own;
- no content script writes its own `matches` list (the bridge takes its
  pages from `lib/pages.ts`, which reads `permissions.json`);
- every reason is 40 to 500 characters of plain words;
- the privacy page ([`public/uplink/privacy.html`](../public/uplink/privacy.html),
  served at starcom.app/uplink/privacy.html) and the store listing
  ([`store/listing.md`](store/listing.md)) name each permission and give each
  reason word for word;
- every production package present in `extension/.output/` (`chrome-mv3`,
  `firefox-mv3`, `firefox-mv2`) asks for exactly what the file lists.

Development builds are left out of that last check, because they add
localhost by design. With no build present, the guard checks the sources only
and says so.

**To change a permission or its reason:** edit `permissions.json`. Then copy
the new reason word for word into `public/uplink/privacy.html` and
`store/listing.md`, run a production build, and run the guard.

## Testing

Run these from the **repository root**.

- **The shared logic** (protocol, bridge, handlers, captures, evidence, key,
  signer, site fetch, and the app's hooks):

  ```sh
  npx vitest run --config vitest.stable.config.ts src/extension
  ```

  `npm test` runs the suite in shards of named folders
  (`scripts/run-sharded-tests.sh`), and `src/extension` is not among them
  today. Run it by path as above, or run the tests your changes reach with
  `node scripts/test-affected.mjs`.
- **The guard and its own tests:**

  ```sh
  node scripts/guard-uplink-permissions.mjs
  npx vitest run --config vitest.stable.config.ts scripts/__tests__/guardUplinkPermissions.test.ts
  ```

- **Types**, inside `extension/`: `npm run typecheck`.
- **In a real browser:** load a development build as above and use it against
  a local Starcom. Starcom's header chip, the popup, and the options page's
  activity log show whether each request arrived and what came of it.
  `extension/store/shots.mjs` drives the development build in Brave with
  Playwright (the usage line is at the top of the file). It was written for
  the store screenshots, and it is also the one script in the repository that
  runs Uplink end to end.

There is no CI. Everything is checked locally, as the app is.

## The store

- [`store/listing.md`](store/listing.md) has what goes into the Chrome Web
  Store dashboard, field by field, and what Firefox's add-on site asks beyond
  it. Brave installs from the Chrome Web Store. The listing's description
  should say only what the uploaded version does.
- `store/screenshots/` and `store/promo-440x280.png` were made by
  `store/shots.mjs`, from the real extension and the real app, against the
  sample page `store/sample/flood-watch.html`.
- `npm run zip:firefox` also writes the sources zip. It holds `extension/`
  (without `node_modules`, `.output` and `.wxt`) and the app files Uplink
  imports, so a reviewer can rebuild the package from it.
