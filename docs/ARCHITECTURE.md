# Starcom architecture

For a developer who wants to change Starcom or build on it. Every path named here exists; open it to check what this
page says.

## The app in one paragraph

Starcom is the reference frontend of the Earth Intelligence Network (EIN). It is a static React, TypeScript and Vite
app with a Three.js globe, drawn through `react-globe.gl`. There is no server, and `scripts/guard-no-server-surface.mjs`
fails if server code appears. The browser reads public data sources and Nostr notes and draws them on the globe.
People write reports, cases and missions, which stay on the device until they publish. Publishing signs a Nostr event
and sends it to relays. The key is held in the browser, in the Starcom Uplink extension, or in any NIP-07 signer.

`src/main.tsx` mounts `src/App.tsx`, which composes the providers and mounts app-wide roots such as
`PublishReviewRoot`. Session services start in `src/hooks/useBootServices.ts`. Routes are in `src/routes/routes.tsx`.
The sub-apps at `/app/:appId` are registered in `src/components/Router/EnhancedApplicationRouter.tsx`.

## Code map

`src/` holds about 3,900 files, tests included. It grew by addition, so folders overlap. These are the places to know.

| Folder | What it holds |
|---|---|
| `src/services/nostr/` | Relay pool, relay sets, kind registry, sending, gift wraps, sealed inbox. |
| `src/services/publishing/` | The publish review, and one module per kind of publication. |
| `src/services/identity/` | Who signs: `NostrIdentityService.ts`, the key lock, the age answer. |
| `src/services/intel/` | Reports, cases, missions, findings, the Nostr intel ingest, the outboxes. |
| Other `src/services/` entries | One data source each, such as `quakes/`, `gdacs/`, `warConflict/`, `noaaSpaceWeather.ts`. |
| `src/config/` | `publicInfrastructure.ts` (every relay address), `publishers.json` (whose notes layers read), `env.ts`. |
| `src/legal/` | `sourceRegister.ts` (data sources and their terms), `peopleDataRegister.ts`, `buildProfile.ts`. |
| `src/components/Globe/` | `Globe.tsx` (about 3,500 lines) and `Hooks/`, about sixty `useGlobe*.ts` hooks. |
| `src/components/` (rest) | React UI: `HUD/` (rails, popups), `Publishing/`, `Identity/`, `Settings/`. |
| `src/features/` | Feature logic: `globe/rail/` (rail controls), `globe/capture/` (share cards, credits), `story/`. |
| `src/applications/` | Sub-apps: `cases/`, `intelanalyzer/`, `intelweb/`, `netrunner/`, `teamworkspace/` (missions) and others. |
| `src/globe-engine/`, `src/geopolitical/` | Globe textures and materials; borders, territories and zones. |
| `src/i18n/app/` | `en.ts` and its translations in `locales/`. |
| `src/extension/` | The app side of Starcom Uplink. The extension itself is `extension/`. |
| `src/context/`, `src/types/` | React providers; shared types, such as `src/types/intel/IntelReportUI.ts`. |

The overlapping folders:

- `src/core/` holds `AnimationEngine.ts` and `core/intel/`, the older "Intel Data Core", which boot still starts. Its
  README describes an older design. Reports are kept by `src/services/intel/IntelWorkspaceManager.ts`
  (`docs/missions/01-architecture-decisions/canonical-intel-report-path.md`).
- `src/lib/` holds chat provider adapters (`src/lib/chat/`, with a README) and `ipfs-client.ts`.
- `src/shared/` holds only `config/`, including the person's provider keys (`userCredentialStore.ts`).
- `src/systems/` holds only `interaction/`, globe input managers used by `Globe.tsx`.
- `src/utils/` holds helpers, including the logger (`@utils/logger`).
- `src/services/nostrService.ts` is older but central: it keeps the browser's own key and the chat pool.

`docs/missions/02-dead-code-and-redundancy-inventory.md` lists dead code and duplicates. It is a dated audit, and some
entries are already deleted. Before building on a file, check that something live imports it.

## Reading: from relays onto the globe

Every relay connection is made by `createRelayPool()` in `src/services/nostr/relayPool.ts`. The pool signs in
(NIP-42) only to relays declared internal or joined. It reads The Record's mirror when The Record does not answer. It
drops events signed by a retired key (`src/services/nostr/publisherKeys.ts`).

Relay addresses are written only in `src/config/publicInfrastructure.ts`. `src/services/nostr/publishTargets.ts`
turns them into sets:

| Set | Relays | Function |
|---|---|---|
| Publish default | `relay.primal.net`, `nostr.mom`, `relay.wellorder.net`, `relay.damus.io`, `nos.lol` | `publishRelays(channel)` |
| Read default | The Record (`wss://record.cosmiccodex.app`), then the five above | `readRelays(channel)` |
| Mirror | `wss://blackpi.cosmiccodex.app`, read only in The Record's place | `relayMirrors()` |
| Mecha Jono's desks | The Record only | `warConflictRelays()` and siblings |
| Chat provider | `relay.damus.io`, `relay.nostr.info`, `nostr-pub.wellorder.net` | `chatProviderRelays()` |

Mission and finding reads add internal and joined team relays. The channels are `MISSION`, `FINDING`, `INTEL` and
`CHAT`. Configuration, as `.env.example` describes it:

- `VITE_NOSTR_<CHANNEL>_RELAYS` adds comma-separated relays to a channel, for reading and publishing.
- `VITE_NOSTR_<CHANNEL>_RELAYS_EXCLUSIVE=true` uses only those relays.
- `VITE_NOSTR_INTERNAL_RELAYS` declares access-controlled relays. Declaring one sends nothing there.
- `VITE_NOSTR_INTEL_SEARCH_RELAYS` replaces the NIP-50 search set, used only with `VITE_NOSTR_INTEL_ENABLE_SEARCH=true`.

Read a variable with a literal `import.meta.env.VITE_…` access; `scripts/guard-env-access.mjs` checks this.

The globe's intel arrives through one ingest:

```
useBootServices()                          src/hooks/useBootServices.ts
 └ startIntelIngestAtBoot()                src/services/intel/startIntelIngestAtBoot.ts
    └ nostrStarcomIntelIngest.start()      src/services/intel/NostrStarcomIntelIngest.ts
        pool = createRelayPool(); relays = readRelays('INTEL')
        REQ kinds 1 and 30023, #t starcom_intel (and variants), last 365 days
        REQ kind 30023, #t retracted                     (withdrawals)
        parse geometry (src/services/geoint/parser.ts) -> IntelReportUI
         ├ startIntelPersistence()  -> intelReportService -> IndexedDB "intel-workspace"
         └ subscribe() / replayAccepted()
            └ useGlobeIntelReportPipeline       src/components/Globe/Hooks/
               └ intelReportVisualizationService.addMarker() -> markers on the globe
```

The ingest runs all session, on every screen. A report naming no place is stored and listed, never drawn. The
pipeline first draws what the last session stored (`src/services/intel/hydratePersistedIntel.ts`).

Other readers have the same shape, such as `src/services/intel/MissionPackageIngest.ts`. Desk layers read with
`src/services/nostr/readComplete.ts`, keeping keys listed in `src/config/publishers.json`. See
`src/services/warConflict/warConflict.ts`.

## Publishing

```
a screen ("Publish the report")
 └ reviewReportPublish(report)             src/services/publishing/reports.ts
    └ requestReview(spec)                  src/services/publishing/publishReview.ts
        freeze the payload, fingerprint it, label each destination,
        flag coordinates, addresses, emails and phone numbers
        PublishReviewRoot shows it         src/components/Publishing/PublishReviewRoot.tsx
        the person confirms -> spec.send(frozen)
         └ sendOrKeep(template, relays)    src/services/publishing/keepUnsent.ts
            └ sendSignedEvent()            src/services/nostr/sendSigned.ts
                sign: nostrIdentityService.asSigner().signEvent()
                send: createRelayPool().publish(relays, event)
            ├ a relay took it -> recorded  src/services/intel/publishedReports.ts
            └ none took it   -> eventOutbox.keep(event, relays)
```

**The review.** `requestReview` takes the act, the exact payload, how to show it, the destinations, the signer and a
`send` function. Nothing is sent until the person confirms. Sample records are refused, as is anyone who answered
under 13. A key's first public publish asks the person to acknowledge they are the publisher.

Each kind has its module beside the review: `reports.ts`, `missions.ts`, `findings.ts`, `bundles.ts`, `reviews.ts`
and others. Missions and cases pick relays by visibility, through `whereItGoes()` in `publishTargets.ts`. Public goes
to the channel's relays, limited only to relays that are not public, private nowhere.

**The guard.** `scripts/guard-publish-review.mjs` fails when:

1. a publishing entry point (`publishMissionPackage`, `sendSignedEvent`, `uploadToIPFS` and others) is called outside
   `src/services/publishing/` or its own module;
2. a raw `pool.publish(` appears outside the services it lists, each with a reason;
3. `src/App.tsx` does not mount `<PublishReviewRoot />`.

Chat messages and prekey bundles are on that list, and skip the review.

**The signer.** `asSigner()` in `src/services/identity/NostrIdentityService.ts` uses, in order: Uplink when it holds
the key (`src/extension/uplinkSigner.ts`); a NIP-07 extension on `window.nostr`; the browser's own key
(`src/services/nostrService.ts`). A key is made only when the person first does something that needs one.
`signWithExisting()`, used for relay sign-ins, never makes a key and never asks for a passphrase.

**When no relay takes it.** `sendOrKeep` keeps the signed event in `src/services/intel/outbox/EventOutbox.ts`, unless
every relay refused it for good (`src/services/nostr/relayRefusal.ts`). A drain started at boot retries it: at
start-up, when the connection returns, and after five minutes, doubling up to six hours. It never re-signs. After ten
failed tries, the note waits for the person. Findings use `src/services/intel/outbox/PublishOutbox.ts` and are signed
again when they go.

**The kind registry.** `src/services/nostr/kindRegistry.ts` lists every kind Starcom uses. `PROTOCOL_KINDS` are
specified for peers: 30079 Mission Package, 30081 Dispatch Capability, 30082 Attested Claim, 30083 Refutation.
`APP_KINDS` are Starcom's own. `KIND_USE` says what Starcom does with each; its test fails when a kind in the code is
missing there. A published report is kind 30023, addressed by its id: relays keeping the newest version replace it.
[`docs/spec/kinds.md`](spec/kinds.md) is the same registry as a table, generated from it; `npm run guards` fails when
they differ. Wire formats are in `docs/spec/starcom-navcom-interchange.spec.md` and
`docs/spec/nip-draft-attested-claims.md`.

## Keys and identity

- The browser's own key sits in `localStorage` under `nostr_secret_key`, as plain text unless locked.
- The passphrase lock (D-KL, `docs/missions/01-architecture-decisions/key-lock.md`) keeps it as a NIP-49 `ncryptsec`
  under `nostr_locked_key`. It asks once a visit, only for the person's own act; automatic paths wait. See
  `src/services/identity/keyLock.ts` and `src/components/Identity/KeyUnlockRoot.tsx`.
- `src/extension/moveKey.ts` moves the key into Uplink; the page then keeps only the public key.
- `src/services/chat/sealedChat.ts` seals each message to each recipient as a NIP-59 gift wrap
  (`src/services/nostr/giftWrap.ts`). It uses ML-KEM-768 when the recipient published a prekey bundle, else NIP-44.
  `src/services/nostr/sealedInbox.ts` opens wraps addressed to this key.

## What is kept on the device

`src/legal/peopleDataRegister.ts` records every store: what it holds, whose data, where, who can read it, how long,
and which files. Its test, `src/legal/__tests__/peopleDataRegister.test.ts`, fails when a file using `localStorage`,
`sessionStorage` or `indexedDB` is named by no entry. Add an entry when you add a store.

Reports, cases and boards are in IndexedDB `intel-workspace` (`IntelWorkspaceManager.ts`). Outboxes use
`src/services/intel/outbox/OutboxStore.ts`. Settings, This device, clears everything (`src/services/device/clearThisDevice.ts`).

## Adding a globe layer or a feature

**The volcano catalogue, end to end:**

1. Data: `npm run eco:bake:volcanoes` (`scripts/eco-natural/bake-volcanoes.ts`) writes
   `public/eco-natural/volcanoes-baked.json`. The public repository holds that file back until its terms are
   confirmed (`scripts/publish-public-mirror.mjs`), so run the script to make it.
2. Source: entry `gvp` in `src/legal/sourceRegister.ts`; credit `gvp` in `src/features/globe/capture/sourceCredits.ts`.
3. Hook: `src/components/Globe/Hooks/useGlobeVolcanoCatalog.ts`. While `isLayerActive('EcologicalDisasters')`, it
   fetches the file and adds a `THREE.Group` to `globeRef.current.scene()`. Teardown disposes it. It publishes a
   legend with `publishLegend()` (`src/services/globe/globeLegendStore.ts`), and withdraws it with `null`.
4. Wiring: `src/components/Globe/Globe.tsx` calls the hook with `shown: ecoVolcanoes && sourceAllowed('gvp')`.
5. Rail: the `eco:volcanoes` toggle in `src/features/globe/rail/railSpecs.ts`, read with `layerChoice()`.

**A new layer touches:**

1. its id: the sub-mode union in `src/context/VisualizationModeContext.tsx`; `GlobeLayerId` and `LAYER_CATALOG_ALL`
   in `src/components/Globe/Hooks/useGlobeLayerControl.ts`; `src/context/visualizationModeFromUrl.ts` and
   `src/context/deeplinkV1.ts`;
2. the rail: `SECONDARY_RAIL_MODES` in `src/components/HUD/Bars/CyberCommandRails/railModeConfig.ts`, a `layer:<Id>`
   glyph in `src/symbols/uiSymbols.ts`, controls in `railSpecs.ts` with words in `src/i18n/app/en.ts`;
3. its data: a service under `src/services/`; for Nostr notes, a relay-set function in `publishTargets.ts`;
4. its source: a `sourceRegister.ts` entry (`sourceAllowed()` throws for an unknown id) and a credit;
5. its hook in `src/components/Globe/Hooks/`, called from `Globe.tsx`;
6. the `layers` list in `src/features/globe/capture/shareHandleContract.ts`, if the share handle should reach it.

To find every list, search for a recent small layer's id, such as `'Lifeboats'`.

**A feature that publishes** adds its kind to `kindRegistry.ts` and a module in `src/services/publishing/` calling
`requestReview()`. A new entry point or raw publish must be listed in `guard-publish-review.mjs`, with its reason.

**Guards that catch common mistakes** (`npm run guards`, `npm run gates`), each in `scripts/`:

| Guard | Fails when |
|---|---|
| `guard-hardcoded-relays.mjs`, `guard-retired-relays.mjs` | A relay address is written outside the registry, or a retired relay returns. |
| `guard-publish-review.mjs` | A publish skips the review. |
| `guard-kind-collision.mjs` | A subscription to a kind Starcom mints is not narrowed by tag or author. |
| `guard-untracked-imports.mjs` | An import points to a file git does not have. |
| `guard-orphan-exports.mjs`, `guard-unrendered-components.mjs` | An export only its tests use, or a component nobody can reach. |
| `guard-copy-length.mjs` | A sentence of app copy is over 20 words. |
| `guard-hardcoded-colors.mjs`, `guard-font-families.mjs`, `guard-small-type.mjs` | Colours, fonts or small text bypass the tokens. |
| `guard-public-claims.mjs` | Text a visitor reads first claims a feature the code lacks. |

## Checks

`npm run verify` runs `scripts/verify.mjs`, stopping at the first failure:

1. `npm run guards`: about thirty guard scripts;
2. `npm run typecheck`: `tsc -b` (`tsc -p tsconfig.json` checks nothing, since the root config lists no files);
3. `npm run gate:conformance`: the published test vectors, fed to every consumer here;
4. `npm run conformance:mission`: the Mission Package and Dispatch Capability vectors;
5. `npm run gates`: the other guards; `scripts/guard-gate-coverage.mjs` checks each is reachable from here;
6. the unit tests, with `vitest.stable.config.ts`; `npm run verify -- --quick` skips them.

It ends by naming what it did not check, such as the app in a browser and a production build. There is no CI: Actions
are off and there are no workflow files, so this command is the check. Use Node 22 (`.nvmrc`); under Node 18 some
tests hang.

## Where decisions are recorded

`docs/missions/01-architecture-decisions/` holds one record per area, each with an ID and numbered items: D-RP
(`report-publishing.md`), D-KL (`key-lock.md`), D-EX (`browser-extension.md`), D-MX (`mission-interchange.md`). Code
and commits cite them, as in "D-RP, RP7"; search the folder for the ID. "Plan item 0.1" refers to
`docs/missions/04-plan/intern-readiness-plan.md`, and "W1" to `docs/missions/04-plan/relay-capability-work.md`. The
audit behind the decisions is `docs/missions/00-current-state/`. A few cited IDs, such as D-CS (the commercial
build), have records not published in the public repository.
