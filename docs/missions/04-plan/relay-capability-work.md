# Relay capability: the work, scoped

Written 21 November 2026 against `84e1b879`. It scopes decision D-DR
([`desktop-relay.md`](../01-architecture-decisions/desktop-relay.md)): stage 1, the desktop's personal relay, and
the in-browser part the owner agreed Uplink takes later (DR8). Every package ends in a check, and the claims about
today's code carry the file they were read from.

## What the code has today

- **Only findings waited when no relay took them** (before W1). `PublishOutbox` (`src/services/intel/outbox/`)
  queues a finding and retries it; its record type says "only findings today". A Mission Package no relay takes is
  kept with its mission, which stays Packaged and offers to try again by hand (`MissionService.retryPublish`).
  Reports, withdrawals, labels, inbox lists and Psi Watch calls went through `sendSignedEvent`
  (`src/services/nostr/sendSigned.ts`), which threw "No relay took it" and kept nothing, so a report published
  offline was lost.
- **No NIP-77 anywhere in the app.** Every read is a plain subscription (`src/services/nostr/relayPool.ts`).
- **The desktop app can reach a relay on loopback; the web build cannot, and need not.** The desktop serves the app
  from its own `starcom:` scheme with a policy that leaves `connect-src` open (`desktop/src/main/index.ts`). The web
  build allows `wss:` only (`vercel.json`), so `ws://127.0.0.1` is out of its reach.
- **The desktop has Zones 0 to 4** (`desktop/docs/security/browsing-key-boundary.md`), a capability IPC contract in
  one file (`desktop/src/shared/ipc.ts`) and the web app's view of it (`src/services/native/nativeHost.ts`). It
  ships for macOS only; Windows and Linux targets are in `desktop/package.json` but unbuilt and unsigned (B13).
- **Uplink** has 13 capabilities (`src/extension/protocol.ts`), a background service worker
  (`extension/entrypoints/background.ts`), unlimited storage and an activity log. It has no `alarms` permission and
  opens no relay connection.

## The order, and why

1. **W1 first, before the cohort starts on 1 December.** Interns will publish from cafés and trains, and an offline
   report was simply lost. W1 fixes that for everyone, and it is the queue that both the desktop relay and Uplink
   later keep a durable copy of. Built 21 November for reports and their withdrawals; see W1 below.
2. **Then the desktop's personal relay (D1 to D7).** It is a real relay, and the base for the node stages.
3. **Uplink (U1, U2) only if lost publishes are still seen after W1.** That means a publish lost when a tab closed
   or site data was cleared.

## Track W: the web app, for everyone

### W1. A reviewed publish waits and retries when no relay takes it

**Built 21 November for reports and their withdrawals** (decision D-RP, RP8; walk story S35).

- **How it was built:** a queue of its own beside the findings outbox, not a widening of it.
  - **Why separate:** a finding is kept unsigned and signed again when it goes. A report is kept exactly as signed
    (`src/services/intel/outbox/EventOutbox.ts`), so sending it later needs no key. A locked key, or Uplink, never
    asks again, possibly days later and with no review on screen.
  - **When no relay takes it:** `sendSignedEvent` throws `NoRelayTookIt` carrying the signed event.
    `src/services/publishing/keepUnsent.ts` then keeps that event, with the relays its review named.
  - **When it goes:** at the next start, when the connection returns, and every five minutes while it waits,
    doubling to six hours (`startEventOutboxDrain.ts`).
  - **Not kept:** a note every relay refused for good, in NIP-01's lasting words (`blocked:`, `invalid:`,
    `restricted:`, `pow:`, `mute:`; `relayRefusal.ts`). Trying again would only fail again, so the person is shown
    the relays' reasons, as before (walk story S22). A kept note refused that way on a later try is given up at once.
  - **Order:** oldest signature first. A newer version of the same note replaces one still waiting.
  - **Safety check:** its signature is checked again before it goes.
  - **What the person sees:**
    - the report says it waits on this device, not that it was published, and offers Cancel;
    - after ten failed tries it says so and offers Try again;
    - the job rail counts what waits, and holds or cancels it.
- **Done:** unit tests for keeping, replacing, order, the ten-try limit, the signature check, hold and a double
  drain; the report review and panel; the drain's triggers; the job rail. Walk story S35 publishes with the network
  cut, sees "Waiting to send", restores the network and finds the report in a second browser.
- **W1b, built 21 November:** labels on a report (a mission's Settle and Challenge) and the inbox list, whether
  posted on their own or with a Mission Package or a roster post. Before W1b, the inbox list sent with a package or
  a post was dropped without a word when no relay took it. Each screen that sends one says it waits, in place of
  its button, with Cancel, and Try again once given up (`KeptNoteLine`). This covers a mission's received reports
  and an adventure's returns.
- **W1c, built 22 November (walk story S36):** a Mission Package no relay takes.
  - **Before:** it stayed Packaged, under a line of raw websocket errors, until someone pressed Retry Publish.
  - **Now:** the event, as signed, waits in the same queue, and the mission says so in place of Retry Publish, with
    Cancel.
  - **When it goes:** the mission is dispatched with that send's receipt and address
    (`MissionService.recordKeptDispatch`, called by the drain).
  - **When it is let go:** if the mission is moved back to change it, deleted, or sent another way.
- **Not yet, and why:**
  - **Psi Watch seals and reveals:** never kept, by design. What a seal proves rests on reaching a relay before its
    window opens, so it must fail where the person can see it.
  - **Mission Package closings, capability grants and revocations:** they still fail where the person sees it, and
    are sent again by hand.
  - **Roster posts:** they have their own sending path.

## Track D: the desktop's personal relay (D-DR stage 1)

### D1. Measure the relay software (DR3)

- **What:** build and run each candidate on macOS, Windows and Linux: nostr-rs-relay, khatru, and any other proven
  relay found that meets the list. Measure:
  - whether it builds on all three;
  - NIP-77;
  - a write policy hook;
  - **refusing a connection by its `Origin` header (DR9)**;
  - binding to 127.0.0.1 on a port it is given;
  - memory and disk at rest, and with 100,000 notes;
  - start time;
  - its licence against AGPL-3.0.
- **Done when:** the measured table is in D-DR, with the choice and the reason, and the build commands are written
  down so anyone can repeat them.
- **Size:** 3 to 5 days. **Who:** a good intern task for someone at home with Rust or Go builds, reviewed by core.

### D2. Zone 5: the helper's life

- **What:** the chosen relay ships per operating system in `extraResources`, and the main process spawns it as a
  child process. It is a native program, so `utilityProcess`, which runs Node code, does not fit.
  - It binds to 127.0.0.1 on a port chosen at start, with its database in `userData/relay/`.
  - It restarts on a crash, with a backoff, and stops with the app.
  - It is off until the person turns it on.
  - It holds no key and no capability, and talks only to the main process (DR2).
  - The helper is signed with whatever signs the app: ad hoc today, Developer ID when B13 lands.
- **Where:** `desktop/src/main/relay/` (new), `desktop/package.json` (`extraResources`), and the security document's
  zone diagram, which gains Zone 5.
- **Done when:** the desktop smoke run (51 checks today) starts it, sees it answer NIP-11 on loopback, kills it,
  sees it come back, turns it off, and finds no listening port.
- **Size:** 3 to 4 days. **Who:** core.

### D3. Loopback is not private (DR9)

- **What:** any program on the computer, and any web page open in any browser on it, can try to open
  `ws://127.0.0.1:<port>`. The relay therefore:
  - refuses every connection whose `Origin` is not `starcom://app` (a browser cannot forge `Origin`);
  - takes a random token in its path, made fresh at each start and handed to the app over IPC only;
  - accepts writes only on the app's own connection.

  Chromium's own prompts for local-network access are a second wall, not one to rely on. A program running as the
  person can read the database files anyway, so this lock is against web pages, not against local malware; the
  security document says so.
- **Done when:** a smoke check opens the relay from an ordinary `https:` page and is refused, opens it without the
  token and is refused, and opens it from the app and is accepted.
- **Size:** 1 to 2 days, if D1's choice can refuse by `Origin`; otherwise a small proxy in Zone 5 in front of it,
  3 days. **Who:** core.

### D4. The app uses it, and says so (DR5)

- **What:**
  - New IPC channels: `relay.status`, `relay.setEnabled`, `relay.usage` and `relay.clear`, validated in the broker.
  - `nativeHost()` gains `relay()`.
  - When the relay is on:
    - `publishRelays` adds it as a destination of its own, which the publish review names as "This computer";
    - `readRelays` asks it first.
  - Counting is fixed: **a publish that only this computer took has not been published.** `sendSignedEvent` counts
    public relays apart from it. Without this fix, an offline publish would report success.
  - What this computer holds but no public relay has taken is W1's queue, so it goes when the network is back.
- **Where:** `desktop/src/shared/ipc.ts`, `desktop/src/main/security/broker.ts`, `desktop/src/preload/app.ts`,
  `src/services/native/nativeHost.ts`, `src/services/nostr/publishTargets.ts`, `src/services/nostr/sendSigned.ts`,
  `src/services/publishing/destinations.ts`.
- **Done when:** unit tests for the destination, the read order and the count. A desktop walk publishes with the
  network cut and sees "Kept on this computer and this device; it goes when a relay answers". It quits, restarts
  with the network back, and finds the note on The Record.
- **Size:** 3 to 4 days. **Who:** core.

### D5. Settings > This device

- **What:** turn the relay on and off; set its disk allowance (DR4); show what it holds (your notes, others' notes,
  waiting); clear it. Others' notes age out first, and the person's own notes are never dropped to make room.
- **Done when:** a component test and the desktop walk.
- **Size:** 2 days. **Who:** an intern, with core reviewing the pruning rule.

### D6. Copies of what the app reads, then Zones, then NIP-77

- **D6a:** what the app reads is copied into the relay as it arrives, so the next start opens from it. 2 days.
- **D6b:** the Zones the person watches are kept in step. This **waits on audit finding 9**, reading by Zone and
  time (plan Phase 2), because today's reads are by topic and publisher, not by place.
- **D6c:** keeping in step by NIP-77 with relays that speak it, The Record first (it runs strfry). The sync tool is
  whichever D1 shows: the relay's own, or a NIP-77 client in the app.
- **Who:** core, after D4.

### D7. Said where it matters (DR7)

- **What:**
  - the people's data register entry, saying what it holds and where;
  - the privacy policy, for the desktop's section;
  - the node descriptor names it when it is on;
  - the desktop README;
  - the release notes for the version that carries it.
- **Size:** 1 day. **Who:** an intern, with core checking every sentence against the code.

### D8. Platforms

macOS first, in the next desktop release after D1 to D5. The relay software is chosen to build on all three
systems, so Windows and Linux add a build and a signing step, never a second relay. Those builds wait on B13.

## Track U: Uplink keeps; it does not relay (DR8)

Started only if lost publishes are still seen after W1. That means a publish lost when a tab closed or site data was
cleared.

### U1. Uplink keeps the queue and the person's own notes

- **What:**
  - New capabilities: `outbox.keep`, where the page hands Uplink a signed event and the relays its review named;
    `outbox.status`; and `kept.list`, so the page can restore the person's own notes after its site data was
    cleared.
  - While the browser runs, the background sends what waits:
    - on an `alarms` timer (every minute) and when the browser comes back online;
    - over WebSocket, **only to the relays the review named, and only events already signed**;
    - each send recorded per relay and written in the activity log.
  - Uplink never signs anything for this.
- **Where:** `src/extension/protocol.ts`, `src/extension/uplink/handlers.ts` (decided and tested there, as today),
  `extension/entrypoints/background.ts`, `src/extension/uplinkClient.ts`, W1's outbox (a second, durable store).
- **Done when:**
  - handler tests;
  - a browser walk publishes offline, closes the Starcom tab, restores the network and finds the note on the relay;
  - Firefox is checked too.
- **Size:** 4 to 5 days. **Who:** core.

### U2. What Uplink promises, reworded

- **What:**
  - `alarms` added to `permissions.json`, with its reason.
  - Whether a WebSocket from the background needs a host permission, measured on Chrome and on Firefox and not
    assumed.
  - The privacy page and the store listing say that Uplink now connects to relays itself: only to send what the
    person already published, and only to relays they already chose.
  - Whether `data_collected` stays "None" is checked against each store's definition.
  - `guard-uplink-permissions.mjs` holds all of it.
  - Then store review, on both Chrome and Firefox.
- **Size:** 1 day, plus the stores' review time. **Who:** an intern, with core reviewing the words.

## For the owner

1. **The default disk allowance (DR4).** I recommend 1 GB, changeable in Settings.
2. **macOS first (D8).** I recommend yes; the alternative is to hold the relay until B13.
3. **W1 before the cohort.** Done: reports and their withdrawals (W1), labels and inbox lists (W1b), Mission Packages
   (W1c).
