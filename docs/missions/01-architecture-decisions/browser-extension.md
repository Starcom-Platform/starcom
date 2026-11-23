# Decision D-EX — the Starcom browser extension

**Status:** planned and decided 2026-10-11. The owner wants everything in the
capability list below, and took EX1–EX8 the same day. This record says what to build and in
what order. Its step notes, once work starts, say what was built; `git log`
and the code say what is done.

## The ask (the owner, 2026-10-11)

- A Chrome Web Store developer account is paid for, so extensions can be
  published for Chrome and Brave.
- A desktop "Starcom App" is not viable: most people, the owner included, do not
  use Linux as their main system, and Starcom is browser-native. Extensions that
  super-power the web app fit it better.
- The app gets an easy path to download and install the extension.
- The biggest gain is NetRunner, held back today mostly by the browser's
  cross-origin rule (CORS). With an extension, its advanced features work.
- Everything in the capability list is wanted: sections 1–15 as features, and
  section 16 as the rules the extension keeps.

## What it answers

- **NetRunner's route (question N4 in `04-plan/netrunner-remake.md`).** The
  options were desktop builds, a fetch worker on the operator's node, or recon
  only. The extension is a fourth answer, and the owner's: the person's own
  browser fetches the page.
- **Sources a browser could not read.** The AI Incident Database, OECD's AI
  Incidents Monitor, Epoch AI's data centres and Kyoto's Dst index refuse other
  sites. They were to come through Mecha Jono; with the extension, Starcom can
  read them itself, and Mecha Jono stays a second path.
- **Clips.** Frame-by-frame recording takes 7 minutes for 83 seconds of footage.
  Recording the tab in real time takes the footage's own length.
- **Key custody.** Keys can live in the extension, out of reach of any script
  that runs in the page.

## Rules the extension keeps

These come from section 16 of the capability list, NetRunner's published
refusals, and the Web Store's policies. A guard checks each in code where it
can.

- **Nothing about a private person.** No tracking, profiling or re-linking of
  pseudonyms to people (R-4); no claim naming a private individual is published
  (R-7). The same line Starcom holds for RLSH.
- **No acting as anyone.** It never reads cookies or sessions to act as someone,
  and never harvests browsing history.
- **Nothing collected without asking.** Every collection states its purpose,
  shows in the activity log, and needs the person's own action or a rule they
  set. Nothing is ever auto-published.
- **Pages are left as they are.** It never changes a page someone visits, nor
  injects ads or trackers. Highlighting is opt-in per site and only adds marks
  that can be removed.
- **"Could not look" is never "found nothing"** (NetRunner's rule), and weak
  backing is always stated (R-9).
- **No remote code.** Everything that runs ships in the package, as Manifest V3
  requires. Recipes, watch rules and desks are data the extension reads.
- **No telemetry.** Nothing leaves the browser except what the person sends,
  to the places they choose.
- **The app stays whole without it.** Phones and other browsers get no
  extension; every feature it adds is an addition, found by asking the
  extension, never assumed.

## Architecture

### Where it lives

In this repository, as `extension/`, built with Vite into a Manifest V3
package. The protocol between app and extension is typed once, in
`src/extension/protocol.ts`, and both sides import it, so a change breaks the
build on both sides at once. The manifest is generated from a typed source,
so every permission it asks for is listed with its reason, and a guard holds
the two together.

### Its parts

| Part | Runs | Does |
|---|---|---|
| Service worker | in the background, woken by events | routes requests from the app, fetches, holds relay sockets, runs alarms and watch rules, shows notifications |
| Offscreen document | hidden, on demand | parses HTML, records the tab, speaks alerts, runs workers |
| Content scripts | in pages the person allows | the bridge on starcom.app, highlights and capture on other sites, the Nostr signer for pages |
| Side panel | beside any page | the open case, quick capture, the current mission and its limits, chat |
| Popup | from the toolbar icon | capture in one click, counts, the extension's state |
| Options page | a tab of its own | permissions, keys and personas, API keys, rules, the activity log |
| Native helper (EX6) | a small program beside the browser | local tools, local AI, hardware, the MCP bridge |

### The protocol

- **Finding each other.** The manifest lists starcom.app (and localhost for
  development) under `externally_connectable`. The app pings the extension by
  its ID; no answer within a moment means no extension, and the app carries on
  as it is.
- **A handshake** returns the extension's version, the protocol version and the
  capabilities it can offer now (each with whether its permission is granted).
- **Every request** names its capability, its purpose in words, and its
  arguments. The answer is the result, or a refusal with its reason. "The
  person declined", "not granted", "could not reach" and "found nothing" are
  four different answers.
- **Versions.** The protocol is versioned. A newer app asks less of an older
  extension; a newer extension answers an older app as it asked.

### Permissions

- **Required at install: as few as possible**: storage, the side panel, context
  menus, alarms, notifications, offscreen, and access to starcom.app.
- **Optional, asked at first use**: each other site, by feature, in plain words
  ("NetRunner wants to read example.com to scan this page"). Tab capture,
  downloads, proxy, privacy and native messaging are optional too.
- **Broad access (all sites)** only if the owner chooses it (EX3). It means a
  slower store review, 1–3 weeks rather than about a day.

### Security

- Only starcom.app's pages and the extension's own pages may call it; every
  sender is checked.
- The fetch broker refuses private and local addresses (no requests into the
  person's own network), limits size and rate per host, and honours robots.txt
  when crawling.
- Keys are kept encrypted under a passphrase (NIP-49), and unlocked for a
  session.
- Extension pages carry a strict CSP. Nothing is evaluated from data.
- The activity log is the person's record: what was asked, why, what was
  fetched, and what was sent where.

### Brave, and other browsers

- **Brave** runs Chrome Web Store extensions and supports the side panel
  (Brave 1.55 and later).
- **Notifications in Brave** cannot use Google's push service, so alerts come
  over the extension's own relay sockets, not push.
- **Brave's Shields** can block requests, so the broker reports a blocked
  request as blocked.
- **Firefox** needs its own build later (E8). Safari needs a separate app.
- **Phones** run no Chrome extensions.

### Testing and release

- **Unit tests** in vitest, failing first, as every piece of Starcom is built.
- **Playwright with the unpacked extension loaded**, against a local stand-in
  web (fixture sites, a stand-in relay), so nothing reaches a real site in a
  test.
- **The intern walk gains the extension's stories.**
- **A release script** builds, versions and zips the package. Uploads go
  through the developer dashboard, first as Unlisted for testers (EX7).
- **No CI:** everything is verified locally, as the app is.

## The build, by phase

Each item names the capability-list entries it delivers (L1–L16). Sizes are
working days for one person at this repository's pace, and are estimates.

### E0. Foundation (6–8 days)

1. The package: `extension/`, Vite, TypeScript, React for its pages, a typed
   manifest source with each permission's reason, and icons from Starcom's
   glyphs.
2. The protocol (`src/extension/protocol.ts`) and the bridge: handshake,
   capabilities, requests with purpose, and the four kinds of answer.
3. The app's side: `services/extension/` and `useStarcomExtension()`, which
   detect the extension, read its capabilities, and light features up
   (L14).
4. The install path in the app: a panel saying what the extension adds,
   feature by feature, with the store link, and what changes once it is in
   (L14).
5. Permissions asked at first use, in plain words (L14).
6. The activity log in the options page.
7. Store readiness: a privacy page on starcom.app, the listing, the single
   purpose and each permission's justification (L15).
8. Tests and guards: Playwright with the extension loaded, and a guard that
   holds the manifest's permissions to their stated reasons.

### E1. Reach the web, and NetRunner unlocked (10–14 days)

1. The fetch broker: any granted site, returning status, final URL, headers,
   body and timing, with the address, size and rate guards (L1).
2. Cross-origin headers added for starcom.app's own requests to granted sites,
   where streaming through messages is clumsy (L1).
3. Panes that show sites refusing to be framed, by removing the framing
   headers for chosen sites only when Starcom frames them (L1; store policy).
4. Hidden-document parsing for pages with no API, by recipes that are data
   (L1).
5. NetRunner's page scan through the broker: its scripts get the real page and
   headers, and their results go to the panel and "File to case" (L2).
6. Domain and network lookups: RDAP and WHOIS, DNS over HTTPS, certificate
   logs, subdomains, and Wayback snapshots with diffs between them (L2).
7. A site's fingerprint: headers, server, frameworks, trackers, third parties,
   redirect chain (L2).
8. Image forensics: EXIF and GPS, hashes, and reverse-image searches opened in
   tabs (L2).
9. A vault for the person's own API keys (Shodan, Censys, VirusTotal, URLscan,
   GreyNoise), and OAuth sign-in through the browser's own flow (L2).
10. A polite crawler: scoped, rate-limited, honouring robots.txt (L2).
11. NetRunner's remake (D7) moved onto the broker, tool by tool, under its
    rules (L2).

### E2. Collect while browsing, and evidence (8–10 days)

1. Right-click "Send to Starcom": a selection, link, image or page, as a draft
   report, evidence, or "add to case…" (L3).
2. The side panel: the open case, quick capture, the current mission and its
   limits, and chat (L3, L6).
3. The popup, and counts on the toolbar icon (L3, L6).
4. Search from the address bar: a keyword, then a place, a case or an indicator
   (L3).
5. Keyboard shortcuts: capture, search, "fly the globe here" (L3).
6. Highlighting on chosen sites: IPs, domains, hashes, CVEs, coordinates, place
   names and wallets, with hover cards from Starcom's own records only (L3).
7. Place hints: a page's place names and coordinates offered to a report's
   jurisdiction or point (L3).
8. Evidence capture: the page whole (MHTML), a screenshot and its network
   record, hashed, timestamped and signed, into the case with its chain of
   custody, pinned where Starcom pins (L4).

### E3. Keys, identity and OPSEC (8–10 days)

1. The Nostr signer for pages (NIP-07), the key kept encrypted (L7).
2. Personas: a key per role or team, switched from the toolbar (L7).
3. Signing rules: silent for chat, a prompt before publishing, set per persona
   (L7).
4. The post-quantum keys (ML-DSA, ML-KEM) held and used in the extension (L7).
5. Recovery and moving a key to another device (L7).
6. Routing chosen traffic through a proxy or a local Tor, by rule (L8).
7. WebRTC kept from leaking the IP address (L8).
8. Investigation mode: for a session, which identity, which route, and every
   site touched (L8).
9. A warning before a lookup would touch the target itself (L8).

### E4. Always on, and getting attention (6–8 days)

1. Relay sockets in the background: chat and direct messages arrive and
   notify, the outbox delivers when back online, and team relays stay in sync
   (L5).
2. Scheduled jobs: feeds refreshed, alerts watched (L5).
3. Watch rules, as data the person sets, for example:
   - an aurora at Kp 6 or more;
   - a CME arriving;
   - a drug-check alert in a region;
   - a field mission opening near them;
   - a theatre's new events;
   - a case gaining evidence. (L5)
4. A local mirror of The Record's events: instant start, offline reading, no
   500-event cap per read (L5).
5. Notifications with actions, counts on the icon, spoken alerts in the EVA
   manner, and the side panel as a mini-HUD (L6).

### E5. Data, recording, and offline (10–14 days)

1. Blocked sources read directly, each after its terms are read against the
   licensing record:
   - the AI Incident Database and OECD's monitor;
   - Epoch AI's data centres;
   - Kyoto's Dst index. (L9)
2. Heavy feeds prefetched on a schedule (L9).
3. No-API sites read through recipes (L9).
4. Real-time recording of the Starcom tab for clips and tours, with audio
   (L10).
5. Screen or window capture for briefings (L10).
6. Screenshots of other sites, for evidence and card insets (L10).
7. The offline kit: textures, feeds and the Record's mirror, kept against
   clean-ups (L11).
8. Pre-warmed caches, so the first view of the day is instant (L11).
9. The machine's CPU, memory and displays read to choose globe quality at the
   start; heavy work paused when idle; the machine kept awake during long
   renders (L11).

### E6. The collective (6–8 days)

1. An opt-in collection grid: the person's browser runs desk recipes and posts
   signed intel to The Record under their key, saying it was collected by a
   person's browser (L13).
2. Shared recipes and watch rules, published by teams as signed data (L13).
3. Cross-checking: independent fetches of one source compared, and agreement
   shown as evidence of integrity (L13).

### E7. Beyond the browser: the native helper (15–25 days)

1. The helper and its installers for macOS, Windows and Linux, signed, talking
   to the extension by native messaging (L12).
2. Local tools on an allowlist, each run with a purpose and under NetRunner's
   rules:
   - network tools: nmap, dig and whois;
   - file and download tools: exiftool and yt-dlp;
   - OSINT frameworks. (L12)
3. Local AI models for summaries, translation and entities, with nothing
   leaving the machine (L12).
4. Hardware: software-defined radios (ADS-B aircraft, AIS ships, weather
   satellites), GPS and sensors, as live globe layers (L12).
5. An MCP bridge, so desktop AI agents can drive Starcom's share handle (L12).
6. Watch folders: files dropped in become evidence (L12).

### E8. Other browsers (4–6 days)

1. A Firefox build from the same source (L15).
2. Safari, later and only if wanted (L15).

**In all, about 75–105 working days.** The phases are in dependency order, and
E3–E6 can interleave once E0–E2 stand.

## Against the cohort (2026-12-01)

The interns use the live app, and an extension under review is not available
to them. A broad-access extension takes 1–3 weeks to review, so whatever is
meant for the first day should go to the store by early November. The
recommendation (EX5): E0, the core of E1 (the broker, the page scan, lookups,
fingerprint, the key vault) and E2's capture and evidence, uploaded as Unlisted
by 2026-11-07, with interns installing it from the link. Everything else follows
during the cohort, and the pilot (V2) walks the extension too.

## Decisions (the owner, 2026-10-11)

| # | Question | Decided |
|---|---|---|
| EX1 | Its name | **Starcom Uplink.** |
| EX2 | One extension or several | **One,** its features asking for permissions as they are first used. |
| EX3 | Site access | **Per site at first use, with an opt-in "power mode" for all sites.** Power mode is an optional permission, so its in-depth review does not hold up the rest. |
| EX4 | Where keys live | **The extension signs when installed; the app's keys stay as the fallback,** and moving a key into the extension is offered. |
| EX5 | What lands before 2026-12-01 | **E0, E1's core (the broker, the page scan, lookups, fingerprint, the key vault) and E2's capture and evidence,** uploaded as Unlisted by 2026-11-07. |
| EX6 | The native helper's language | **Go:** one static binary for each system. |
| EX7 | Store visibility | **Unlisted first, public later.** |
| EX8 | The collection grid's posts | **Under the person's own key,** saying a person's browser collected them. |
| EX9 | The language, and which browser first | **TypeScript for the extension, sharing Starcom's own types and code; Go for the native helper. Brave is the primary target,** other browsers secondary: one source, built for Chromium first (Brave, Chrome, Edge, Opera and Vivaldi take the same package) and Firefox as a second build. Browsers run only JavaScript and WebAssembly in an extension; a Go core in WebAssembly was weighed and left out (2–10 MB, awkward bridging to the browser's promise-based APIs, slower review). Asked 2026-10-11. |

| EX10 | What the first wave leads with | **Capture and the side panel,** with evidence capture, then NetRunner's scan and lookups. Every intern captures daily; both tracks need it. |
| EX11 | "Report what broke" | **In the first wave:** one action captures the screen, the page, the build stamp and the steps into a feedback item. Interns are the live app's testers, and replying when a report is fixed keeps them. |
| EX12 | A portfolio of each intern's own work | **Before the cohort, in the app** (not the extension, so it works for everyone): their cases, reports and reviews, exported for their college credit. Placed in the cohort plan. |

### The first wave, as it now stands

| Order | Item | Days |
|---|---|---|
| 1 | E0, the foundation | 6–8 |
| 2 | E2's capture: "Send to Starcom", the side panel, the popup | 3–4 |
| 3 | E2's evidence capture, with its chain of custody | 2–3 |
| 4 | "Report what broke" (EX11) | 1–2 |
| 5 | E1's core: the broker, the page scan, lookups, fingerprint, the key vault | 6–8 |

The extension's part comes to 18–25 days, and the portfolio (EX12) is 2–3 more in
the app. There are 20 working days to 2026-11-07. Items 1–4 go up by then.
Item 5 goes up with them if the estimates hold; otherwise it follows in the
first update after review, which takes about a day once broad access has been
reviewed.

## The first wave, planned (EX13–EX20, 2026-10-11)

### Decided

| # | Question | Decided |
|---|---|---|
| EX13 | How the side panel is built | **A slim Starcom page, framed in the panel:** the same cases, chat and keys as the app, one codebase. starcom.app lets only Uplink frame it. Chrome documents that a site framed by an extension page holding host permission for it keeps its own storage; a spike proves it in Brave first, and Uplink's own panel is the fallback. |
| EX14 | Where captured copies live | **On the capturer's device only.** The case keeps their hashes, so a copy can be checked later. Sending the files, or pinning them, is a separate, deliberate act: a captured page is someone else's content and may hold personal data. |
| EX15 | Who an evidence record names | **Signed with the capturer's Starcom key,** with the address, time, hashes and Uplink's version, and **no device details**: browser, screen, language or IP would fingerprint the investigator. The app's anonymous intake keeps its own rule (records evidence, never submitter identity); an investigator's own evidence is attributed on purpose. |
| EX16 | A capture with no case chosen | **The case open in the side panel, else a Captures inbox** to file later. Capturing never stops to ask. |
| EX17 | Where "Report what broke" goes | **Sealed to one maintainer key** over The Record, by the app's gift-wrap path; the reply "fixed in build X" returns the same way. The owner names the key. |
| EX18 | How a capture's time is vouched for | **OpenTimestamps besides the signed time:** only the hash goes to its public calendars, and the proof anchors in Bitcoin within hours. |
| EX19 | The network record | **Not in the first wave.** It needs the debugger permission, whose warning would frighten interns; it can come later, asked at first use. |
| EX20 | The portfolio's form (EX12) | **One self-contained HTML page plus the same records in JSON:** it opens anywhere, prints to PDF, and can be checked. |
| EX21 | How evidence copies the page (2026-10-12) | **The page's HTML and text, with no prompt:** read at the person's click with the access that click gives (activeTab), beside the screenshot. Works in Firefox too. The full archive (MHTML) was left out: its permission warns "read and change all your data on all websites", as the network record's did (EX19). |
| EX22 | An evidence screenshot's size (2026-10-12) | **Scaled to 1280 px wide,** so its size never tells the capturer's screen, window or zoom (EX15). The record says it was scaled, and its hash is of the picture kept. |
| EX23 | The evidence exit (2026-10-12) | **In the first wave, right after timestamps.** Checked against the collective-value directive, the wave so far gave nothing outward: evidence stays on the device (EX14) and custody records are never published, so a finding resting on captured evidence carried nothing a reader could check. Now a published finding carries its evidence's SHA-256s in `method.inputFingerprints`, as the attested-claims draft provides ("do I hold the same evidence?" without revealing content or sources), with their timestamp proofs; the files stay home, and sharing them stays a deliberate act. |
| EX24 | The shared spec (2026-10-12) | **Revision 12, drafted for the owner's review** before it goes to Mecha Jono (first proposed as "revision 7" by mistake; the interchange spec stood at revision 11): an evidence file's fingerprint is the full SHA-256 of its bytes, and an optional `method.inputTimestamps` carries each fingerprint's OpenTimestamps proof, so anyone can check that evidence existed before the claim, without the files. |
| EX25 | NetRunner core's lookups (W10) | **Free public sources first:** domain registration (RDAP), DNS over HTTPS, certificate transparency (crt.sh), the Wayback Machine, each with its terms read against the licensing record first. Paid services come after, each person's own key in Uplink's encrypted vault; none is ever required. |
| EX26 | The portfolio's contents (W11) | **All work under the intern's key:** reports, the cases they opened, reviews, published claims, and evidence listed by fingerprint and timestamp (files only if they choose), each item's signature shown so an advisor can check it is theirs. |
| EX27 | When to submit to the store | **Once W9 is in,** so review (1–3 weeks) ends well before 2026-12-01; NetRunner core and the portfolio follow as updates, which clear in about a day once the first review is done. |
| EX28 | Work not marked Public, in a portfolio (2026-10-12) | **Listed, not shown:** by kind and date, saying why ("A Private case, opened 2 Dec 2026"), never its title or text. Careful means "redact before emitting", and a portfolio is emitted, so careful work is listed too, and so is work not yet marked. |
| EX29 | How an advisor checks a portfolio (2026-10-12) | **The page checks itself:** it carries its own Schnorr verifier, hashes the portfolio, compares that with what the key signed, and checks every signed event in it, offline, sending nothing. |
| EX30 | Where a portfolio finds published work (2026-10-12) | **Read from the public relays when it is made,** as the signed events they hold, so a portfolio made on a new laptop is whole. Never the team's internal relays, which carry Limited work. A read that ends early says so. |
| EX31 | Where the portfolio is made (2026-10-12) | **In "Your key", beside the key export:** it is the work under that key. |
| EX32 | How Uplink reaches sites for NetRunner (2026-10-12) | **It fills the desktop app's fetch slot.** NetRunner's page scan, real headers, technologies and keyless recon already run through `nativeHost().fetch` when the desktop app is there; Uplink offers the same fetch, so they work in a browser with no tool rewritten. The desktop app still wins when present. GET and HEAD only, never with the person's cookies, private and local addresses refused, each site asked for at first use. |
| EX33 | Where registration lookups go (2026-10-12) | **To each registry directly, found from IANA's bootstrap files** (RFC 9224), not through rdap.org, a third party that sees every query and allows 10 in 10 seconds. Each answer shows its registry's own terms notice, as ARIN's terms require of anyone passing its data on. |
| EX34 | How far Wayback goes (2026-10-12) | **Snapshots, diffs, credit:** a page's snapshots listed, two the person picks compared. The Archive allows "scholarship and research purposes only" and bars collecting or storing "personal data about anyone", so nothing about a person is stored from a snapshot automatically. A published finding citing one credits the Archive. |
| EX35 | When the encrypted key vault comes (2026-10-12) | **After the first wave.** W10 uses free sources only (EX25); people's own keys stay in the browser's storage until the vault is built. |
| EX36 | What is built while W9 and the store item wait (2026-10-12) | **Timestamp upgrades, then W12's screenshots and promo tile (made with the development build against a local Starcom, so the package is ready the day the store item exists), then E3 (Uplink holds the person's key), then the multilingual work, early.** The owner added W12 after first choosing the other three. |
| EX37 | When Uplink goes to Firefox's add-on store (2026-10-12) | **After Chrome's review,** once it shows what reviewers ask. The owner makes the Mozilla account. The package and its sources are ready: the sources rebuild it byte for byte. |
| EX38 | Whether other Starcom sites may use Uplink (2026-10-12) | **Not until one asks.** Uplink answers starcom.app alone; a partner instance that wants it is the time to decide how. |
| EX39 | How far the key moves into Uplink (E3, 2026-10-12) | **The full move.** With Uplink installed it holds the only copy: chat and sealing are reworked to ask the signer, so Starcom's page never holds the key. Devices without Uplink keep the app's key. |
| EX40 | How Uplink protects the key (2026-10-12) | **A passphrase, unlocked once per browser session** (NIP-49), locked when the browser closes. A forgotten passphrase is recovered from the person's own backup. |
| EX41 | When Uplink asks before signing (2026-10-12) | **Before anything public:** published reports, claims, packages and posts ask, showing what and why. Chat, private records and team messages sign quietly. Every signature is logged. |
| EX42 | Who may use Uplink's signer (2026-10-12) | **Starcom only,** as EX38 keeps Uplink to Starcom. |

### The steps

There are 20 working days to 2026-11-07.

| # | Step | Days |
|---|---|---|
| W1 | Spike: a slim Starcom page framed by Uplink sees the same storage as a starcom.app tab, in Brave and Chromium | 0.5 |
| W2 | Permissions, each with its reason in `permissions.json`: `contextMenus`, `activeTab` and `sidePanel` (no warnings); no `pageCapture` (EX21) | 0.5 |
| W3 | The capture queue in Uplink: a capture waits while no Starcom page is open, and the app takes it when one connects | 1 |
| W4 | "Send to Starcom" on right-click: a selection, link, image or page | 1 |
| W5 | In the app: a capture becomes an intel item linked to a case, or a draft report; the Captures inbox | 1.5 |
| W6 | The side panel: the open case, recent captures, filing, the mission and its limits | 2 |
| W7 | The popup's "capture this page", and the inbox's count on the toolbar icon | 0.5 |
| W8 | Evidence capture: a screenshot (scaled, EX22), the page's HTML and its text (EX21), hashed, signed and timestamped (EX15, EX18), kept on the device (EX14), in Starcom's storage beside the case, so removing Uplink loses none of it | 2.5 |
| W8e | The evidence exit (EX23): a published finding carries its evidence's hashes and timestamp proofs, never the files | 1.5 |
| W9 | "Report what broke" (EX11, EX17) | 1.5 |
| W10 | E1's core: the fetch broker, the page scan, lookups, fingerprint (re-planned 2026-10-12, below: 2–3 days; the key vault moved after the wave, EX35) | 3 (planned 6–8) |
| W11 | The portfolio export, in the app (EX12, EX20) | 2 |
| W12 | Store screenshots and promo tile, the package zipped; the owner uploads it Unlisted | 0.5 |

W1–W9, W11 and W12 come to about 14 days. W10 goes up with them if the estimates
hold; otherwise it follows in the first update after review.

## How the app and extension meet (EX10–EX12, 2026-10-11)

The program the cohort joins is Archangel Agency's Cyber Investigations and
Strategic Intelligence. Two of its four open tracks are the extension's:

- **Cyber Investigator:** "gather, verify, and package intelligence into reports
  that hold up", and "tell us where the tooling gets in your way".
- **Net Runner:** threat analysis, forensics and incident response, "pointed at
  our own stack first… document what breaks".

### Seamless

- **The same buttons, reaching further.** No second interface: NetRunner's Scan
  stays where it is and works once Uplink is in. Its result says "fetched by your
  browser through Uplink".
- **A status chip in the header:** connected, not installed, or needs permission
  for this, with what each part adds.
- **Asked for where it is needed, never by a banner:** "This scan needs Uplink.
  Install, about a minute". The app notices the install itself, without a reload.
- **Permission prompts in Starcom's words, with the purpose:** remembered per site,
  granted for a case's sites at once, revoked in one place.
- **One state on two surfaces:** the side panel and the app share the open case and
  the current mission. A capture shows in the app at once, and waits in a queue
  while offline.
- **Four answers, never a spinner:** declined, not granted, could not reach,
  found nothing.
- **The activity log is readable from the app,** so an intern and their lead see
  the same record.

### The person

- **Nothing to set up first.** Keys, personas and power mode come when wanted.
- **Few prompts:**
  - a case's sites are granted together;
  - the signer is silent for chat and asks before a publish.
- **Notifications that matter:**
  - only what is addressed to the person: an objective given to them, a
    direct message, their team's channel;
  - everything else in a daily digest;
  - quiet hours.
- **Starcom's own look and words:** the EVA palette, the glyph registry, and the
  glossary's "?" in the extension's pages.
- **Provenance always shown, and accessibility:** keyboard paths, screen-reader
  labels, reduced motion.
- **Desktop only, said plainly:** a phone says these need desktop Brave or Chrome,
  and the rest of Starcom works.

### What keeps interns

- **A win in the first hour:** a first report on the globe in about 15 minutes,
  where the coach leads.
- **Their reports answered:** "Report what broke", then a reply when it is fixed.
- **Progress on the work, never a score of a person.** Starcom keeps no score
  of a person (MX20): no leaderboards. Progress is the team's cases and
  missions.
- **Credit they can show:** the portfolio (EX12).
- **Their time respected:** the notifications above.

### Brave first, and the others

- **Brave:** the package is tested in Brave first, which the Playwright harness
  drives as it drives any Chromium. Its differences that matter: no Google push
  (alerts come over the extension's relay sockets) and Shields (a blocked
  request is reported as blocked).
- **Firefox, the second build:**
  - its background is an event page, not a service worker;
  - it has no `externally_connectable`, so the app reaches it through a small
    content-script bridge on starcom.app, behind the same typed protocol;
  - it has a sidebar in place of the side panel, and needs no offscreen
    document.
- **The build:** one source with a target per browser; WXT, a Vite-based
  framework that builds Chromium and Firefox packages from one source, is
  weighed in E0.
- **The native helper (Go)** registers itself with each browser where that
  browser looks: Brave's folder, Chrome's, Edge's and Firefox's.

### The four weeks to 2026-11-07

E0 (6–8 days), E1's core (items 1, 5, 6, 7 and 9: 6–8 days) and E2's capture
(items 1–3 and 8: 4–5 days) come to 16–21 working days, and there are 20. It
holds if the estimates do. If they slip, E2 waits for the first update after
review, and E0 with the NetRunner core goes up on time. The cohort plan's own
items were done ahead of time, which is what makes room for this.

## Step notes

### E0, first steps (2026-10-11)

- **The bridge is a script on starcom.app in every browser,** not
  `externally_connectable`. Chromium's would need the extension's ID in the
  app, and Firefox lacks it. The trust is the same: only starcom.app's own page
  reaches Uplink.
- **The shared protocol** is `src/extension/protocol.ts` (8f0cba1f):
  - the capabilities, each with its meaning in words;
  - a purpose on every request: 8–200 characters, plain words;
  - refusals of six kinds, keeping "declined", "not granted", "could not reach"
    and "found nothing" apart.

  The app's side is `src/extension/uplinkClient.ts`: no answer to a hello means
  no Uplink, and an unanswered request is "could not reach".
- **The extension's decisions are pure and tested with the app's tests,** in
  `src/extension/uplink/handlers.ts` (4a9eadb1, 838d2459):
  - it answers starcom.app alone (and localhost in development);
  - it asks the person before reaching any site;
  - it never asks for a private or local address;
  - all sites only as power mode, whole;
  - every request goes into the activity log, refusals included.

  Two mutations, dropping the page check and the private-network guard, each
  failed a test.
- **The package** is `extension/`, built with WXT, the owner's choice
  (cffd60bc).
  - At install it asks only for storage; every other site is an optional
    permission.
  - A site is asked for in Uplink's own grant window, which shows the purpose.
    The browser grants a site only on the person's click, and that window gives
    them one.
  - The popup says what it may reach. The options page, in a tab, holds the
    activity log, each allowed site with "Take back", and power mode.
  - The icons are Starcom's emblem.
  - The production build runs the bridge on starcom.app alone; a development
    build also runs it on localhost.
- **Seen in real browsers:** the development build loaded into Brave and into
  Chromium, headless. A Starcom page on the local preview said hello through
  the bridge, read what Uplink may reach, had `192.168.1.1` refused with its
  reason, and read both requests back from the log.
  - Probe: `.local/scripts/uplink-bridge-check.mjs <url> <extension dir>
    [chromium|brave]`.
  - Playwright runs extensions headless only in its full Chromium build
    (`channel: 'chromium'`); Brave runs them headless as it is.
- **Found on the way:** the browser counts the bridge's own pages as sites
  the extension may reach, so the popup said "may reach 4" with none allowed.
  Starcom's own pages are now left out wherever Uplink says what it may reach.
- **Next in E0:**
  - the app's side on screen: the header chip, and asking for Uplink where a
    feature needs it;
  - the Firefox build checked;
  - the store's privacy page and listing;
  - the guard holding the manifest's permissions to their reasons.

### E0, the store and Firefox (2026-10-11)

- **The header chip is live.** Starcom's header shows Uplink as connected
  or not installed, says what it does now and which sites it may reach, and
  notices an install without a reload (0f6c3442). Checked on starcom.app in
  Brave, with the store build loaded and without it.
- **One source of permission reasons:** `extension/permissions.json`.
  - The manifest is made from it.
  - The privacy page (`starcom.app/uplink/privacy.html`) and the store
    listing (`extension/store/listing.md`) give each reason word for word.
  - `scripts/guard-uplink-permissions.mjs`, in `npm run guards`, holds all
    three to it, along with every content script's pages and any built
    production package. Its nine tests each watch a check fail.
- **The privacy page** is a plain page of its own. It loads nothing from
  anywhere else, and was checked under the site's Content Security Policy at
  desk and phone widths.
- **The manifest's description** promised capture and evidence, which 0.1.0
  does not do. It now says what 0.1.0 does.
- **Firefox, checked:**
  - The MV3 build has an event page and installs in Firefox 152 as a
    temporary add-on, over WebDriver BiDi, with no new dependency.
  - A page open before the install noticed Uplink and said hello. Uplink
    answered what it may reach, refused a private address, and logged both.
    After an update, the page still reached it, through one bridge.
  - Firefox's add-on site requires every new add-on to declare what it
    collects, so the manifest declares none (`data_collection_permissions`),
    and the build needs Firefox 140 or later.
  - Probe: `.local/scripts/uplink-firefox-check.mjs <firefox-mv3-dev>`.
- **Found: the bridge after an update.**
  - In Brave, Uplink reloaded under an open tab, and the bridge left in the
    page answered "Uplink is not running". The app reads that as not
    installed.
  - The bridge is now `startBridge` (`src/extension/uplink/bridge.ts`),
    tested with the app's tests:
    - one bridge answers a page;
    - a bridge added again takes the place of the one before;
    - a bridge cut off from Uplink goes quiet and stops listening.
  - Two mutations each failed a test. In Brave, the cut-off bridge is now
    silent.
  - Not checked in a real browser: a new bridge taking over after a Chromium
    update. Brave and Chromium do not bring back an extension loaded from
    the command line after it reloads. The tests cover it, and Firefox showed
    it end to end.
- **Found: the offline shell.**
  - The service worker kept any page a visitor opened as the app's offline
    start. A spec, or the privacy page, opened once became what an offline
    launch showed.
  - Now only the app's own paths are kept (`isAppPath`), with failing tests
    first.
- **Next in E0:**
  - asking for Uplink at the point of need comes with the first feature that
    needs a site (E2's capture, E1's broker); built before then, it would have
    no user;
  - the store's screenshots and promo tile;
  - the owner reads the privacy page and listing, and names a contact for
    the page;
  - the upload, Unlisted, by 2026-11-07, with the first wave.

### The first wave: W1–W5 (2026-10-11)

- **W1, the spike, passed.**
  - A page framed by an extension page shared localStorage and IndexedDB, both
    ways, with the same site open in its own tab. That held in Brave and
    Chromium, with host access from the bridge's pages alone.
  - A control framing the same page from an ordinary other site was
    partitioned, so the test can tell.
  - Playwright switches storage partitioning off by default
    (`ThirdPartyStoragePartitioning`); the first runs could not tell, and the
    spike turns it back on.
  - EX13 stands: the side panel will frame a slim Starcom page.
- **W2–W3: "Send to Starcom" and the capture queue** (5f576f65).
  - Right-click a selection, link, image or web page. The capture is kept in
    Uplink's storage (EX14) until a Starcom page takes it.
  - It is never taken from the browser's own pages or the person's files.
  - A full queue (500) refuses a new capture and says so on the icon; none is
    dropped.
  - Every capture, kept or refused, goes in the activity log.
  - The bridge watches Uplink's storage and tells every Starcom page how many
    wait: a tab or the side panel's frame. There is nothing to track and
    nothing woken.
  - The page takes them (`captures.read`), then lets them go once kept
    (`captures.kept`).
  - `contextMenus` and `activeTab` joined the permissions, with their reasons.
- **Found: IntelWeb rendered a record's markup** (63cd1d66).
  - Its markdown went through `marked`, which passes raw HTML through, and the
    renderer's sanitizer returned it untouched.
  - The CSP stopped scripts, but not fake links, forms, overlays, or remote
    images reporting who read a record.
  - `sanitizeRecordHtml` now keeps only what reads as text. Captured words
    would otherwise have reached it from any page.
- **W5: captures in the app.**
  - Each capture becomes an intel item:
    - type `CAPTURE`, graded F (an unassessed page), never verified;
    - no distribution chosen, so it goes nowhere until someone decides;
    - timed when it was captured, not when it was taken in;
    - its words escaped to read as themselves: no formatting, markup, or links
      made from bare addresses.
  - Taking goes one at a time across tabs and the side panel (the browser's
    lock). Taken captures are remembered, so none is kept twice, and Uplink
    lets go only after they are saved.
  - A capture goes to the case open in the side panel (EX16, set in W6), else
    to the Captures inbox on the Cases page. From there it is filed to a case,
    drafted into a report that cites it, or discarded with Undo; intel items
    joined the deletion holding.
  - Hello says how many wait, so a page that missed the bridge's notice still
    takes them.

### W6: the side panel (2026-10-11)

- **Starcom's `/panel` page, framed by Uplink's side panel** (EX13).
  - It holds the case open for captures (EX16), chosen in the panel. Whichever
    Starcom page takes a capture files it there, a tab or the panel.
  - It opens again with the case it had, and lets the case go when it closes.
  - It lists what was sent to the case as it arrives, and the open objectives
    of the missions resting on it, each with its limits.
  - Everything else opens in a Starcom tab.
- **Uplink's side panel page frames it.**
  - `sidePanel` joined the permissions with its reason; it is Chromium-only,
    since Firefox's sidebar needs none.
  - The bridge now runs in frames, to reach the framed page.
  - The popup opens the panel on the person's click.
  - A message counts as Starcom asking only when its frame is a Starcom page
    and its tab is Starcom, Uplink's own page, or none (`starcomSenderUrl`).
    Starcom framed by any other site is refused.
- **Found: two copies of Starcom erased each other's work.**
  - A tab and the panel each held the whole workspace in memory and saved it
    whole. A copy open since morning, saving anything, wrote back the
    workspace as it was when it opened. Two tabs always could; the panel made
    two copies the usual case.
  - Now a copy lays only its own changes, record by record, over what is
    stored (`workspaceMerge.ts`). It hears the other copies' saves on a
    channel and takes them in without a reload.
  - Tests first; two mutations each failed them.
  - One gap stays, documented in the code: two copies saving in the same
    instant, or a workspace too big for the quick localStorage copy.
- **The panel starts no relays.** App's boot started the relay ingest, IPFS
  and chat on every page. On `/panel` it opened the same 7 relay sockets as
  the tab beside it; now it opens none.
- **Seen in Brave**:
  - A case was made from a capture in the inbox.
  - Uplink's panel page, framing the local `/panel`, listed the case and held
    it open. The tab read the same.
  - A second capture went to that case and showed in the panel at once.
  - Closing the panel let the case go, and a third capture waited to be filed.
  - Probe: `.local/scripts/uplink-panel-check.mjs <starcom> <chrome-mv3-dev>
    <out>`. The panel page is opened as a tab, since automation cannot make
    the gesture that opens a real side panel.
- **Waiting on the owner: Uplink's store ID.** starcom.app sends
  `frame-ancestors 'none'`. Once the owner creates the store item (EX13
  follow-up, chosen 2026-10-11), `/panel` will allow exactly that ID, and the
  panel works on starcom.app. Until then it works against a local Starcom.

### W7: the popup and the icon's count (2026-10-12)

- **"Send this page to Starcom"** in the popup captures the page it was opened
  on, as the right-click does. Opening the popup lets Uplink read that one tab.
- **The icon counts every capture not yet filed:**
  - those waiting for Starcom to open;
  - those in Starcom's inbox, which Starcom says (`inbox.count`) when Uplink
    connects and again only when it changes, so the log is not filled with
    the same number.

  The title says what the count is made of.
- **Seen in Brave:**
  - After Starcom took a capture in, the badge read 1 to file, then 2.
  - The popup's button reached the background and back. Opened as a tab, its
    page is the browser's own, so it was refused with that reason, as it
    should be.

### W8: evidence capture (2026-10-12)

- **"Capture as evidence"**, on the right-click menu and in the popup, keeps
  three things, each with its size and SHA-256:
  - the tab's picture, scaled to 1280 px wide (EX22);
  - the page's HTML;
  - its text, read at the click with the access the click gives (EX21).

  Each file waits in Uplink's storage under a key of its own, apart from the
  queue. A page over 25 MB is refused, never cut. `unlimitedStorage` joined
  the permissions with its reason.
- **Starcom takes it in one file at a time** (`captures.file`):
  - Each file is kept only if its hash is the one the capture names; one that
    did not arrive whole keeps nothing, and Uplink still holds it all.
  - The files go in Starcom's own storage (`starcom-evidence`) beside the
    case, so removing Uplink loses none of them.
  - The custody record (EX15) names what, where, when, by which Uplink, and
    each hash, and nothing of the device. As an event it is of the custody
    kind 20097: ephemeral, never published.
  - Taking a capture in happens on its own, so the record is signed only with
    a key the browser already has. With none, it is kept unsigned and says
    so.
- **The evidence viewer**, from the inbox and from a case's evidence:
  - shows the picture, where and when, and each file with its hash;
  - "Check again" re-hashes what is kept;
  - "Sign with your key" signs an unsigned record at the person's click,
    which may make the key;
  - each file and the custody record can be saved.

  The page's HTML is a file to save, never drawn: a page's HTML can carry
  scripts.
- **Found: Uplink's bridge never reached a Starcom tab already open.**
  - A page a content script runs on is not one the browser lets an extension
    find among open tabs. `tabs.query` by URL found nothing, so the bridge
    added at install reached no open Starcom tab in Brave or Chrome. It was
    only ever seen in Firefox.
  - Starcom's pages are now named as host permissions too: the same pages,
    so no new warning.
- **Found: a checked signature could be a copy's.** nostr-tools marks an event
  it has verified, and a copy carries the mark. The viewer checks a plain
  copy, so an altered record never reads as checked.
- **Seen in Brave:**
  - A local page was captured: a 1280 × 843 picture, 255 KB, its HTML and
    its text.
  - Starcom took it in, checked all three hashes, and kept the files and the
    record, unsigned, since the fresh profile had no key.
  - Uplink then held nothing.
  - Probe: `.local/scripts/uplink-evidence-check.mjs`. A real click on Uplink
    grants activeTab, which automation cannot, so a copy of the build allowed
    every site stands in for it.
- **OpenTimestamps (EX18) goes through Uplink.**
  - The public calendars send no CORS headers, so a starcom.app page cannot
    read their answers, and Starcom has no server.
  - Uplink reaches them under its optional site access. It asks once, in its
    own window, at the first evidence capture, then stamps each capture's
    hash of hashes at capture time. Only that hash leaves.
  - Terms: the calendars are free, need no registration, receive only hashes,
    and are run on donations; none publish terms.

### W8c: timestamps (2026-10-12)

- **Each evidence file gets an OpenTimestamps proof**, in the official client's
  format (python-opentimestamps 0.7, read from its source):
  - each file's hash takes a random nonce and is hashed again;
  - the results are joined in the client's merkle tree;
  - only the tip goes to two independent public calendars (alice, finney).

  A calendar never sees a file's hash. That matters because those hashes are
  published with findings (EX23), and a calendar's log could otherwise tie a
  capture to a claim.
- **Checked with the official client.**
  - Proofs made by Starcom's module for three real files, and the proofs
    Uplink itself made in a Brave run, were read by `ots info`.
  - `ots verify` hashed each file, replayed the proof, and asked both
    calendars: every one answered "Pending confirmation in Bitcoin
    blockchain". A calendar says that only when every operation is exact.
  - The proofs are kept in `.local/ots-check` to see them complete once
    Bitcoin confirms them.
- **Asked once.** The calendars sit under Uplink's optional site access:
  - The first evidence capture asks in Uplink's own window, with the purpose,
    and the answer is remembered.
  - Uplink's options turn timestamps on or off. A calendar taken back there
    is a "no".
  - Each stamp is a line in the activity log.
  - The privacy page and listing now say what leaves: one blinded hash per
    capture, when timestamps are on.
- **In Starcom:** the item and the evidence viewer say who timestamped it, or
  why not. Each file's `.ots` proof can be saved and checked with any client.
- **Not checked in automation:** the first-use window ends in the browser's
  own permission prompt, which a headless browser cannot answer. The owner
  checks it once by hand.

### W8e: the evidence exit (2026-10-12)

- **A published case position carries its evidence's fingerprints.**
  - These are the SHA-256 of each evidence file the case holds, as evidence or
    against it, in `method.inputFingerprints`.
  - A reader holding the same files can confirm they match, and the spec's
    echo test works: two analysts who captured the same page text share a
    fingerprint.
  - The claim says where the files are: kept by the capturer, shared with
    their timestamp proofs only on request.
  - They show in the publish review before anything goes.
- **Only from a case marked open.** A fingerprint confirms a guess about what
  was used (reproducibility.ts). A case marked careful or protected, or not
  marked, publishes none, and says so in its weak backing.
- **What the shared spec does not yet say:**
  - Starcom's evidence fingerprint is the full SHA-256 of a file's bytes (64
    hex), beside the 16-byte observation fingerprints (32 hex). A peer holding
    the same file needs to know that to match it.
  - There is no place in a claim for timestamp proofs.

  Both are a spec revision for the owner to decide on, and for Mecha Jono to
  agree to.
- **Not driven in a test:** the case page's publish click, which passes the
  hashes into the review. The builder and the gathering of hashes are tested,
  and the wiring typechecks.

### W11: the portfolio (2026-10-12)

- **"Make my portfolio" in Your key** saves one HTML page, and offers its
  record as JSON beside it (EX20, EX31).
  - Cases, missions and reports made under the key in this browser, by the
    rule in EX28: in full when marked Public, listed otherwise.
  - Evidence the key signed for: its fingerprints and which calendars
    timestamped it, never its files. Evidence not signed is counted as left
    out.
  - What the key published (reports, claims, refutations, mission packages,
    comments and verdicts), read from the public relays when the portfolio is
    made (EX30). The read stops after 45 s; if it was cut short, the page
    and Your key both say published work may be missing.
  - Nothing someone else made, nothing received from others, and no sample
    material.
- **Signed at the person's click.** The key signs a portfolio attestation
  (kind 20098, ephemeral, never published) whose `x` tag is the SHA-256 of
  the portfolio's exact JSON text. A browser with no key is told so, and no
  key is made for it.
- **The page checks itself** (EX29). It carries the text as base64, and the
  same BIP-340 verifier the tests run, inlined. "Check every signature" says
  whether the portfolio is exactly as its key signed it, and whether each
  signed event in it checks. Changing one word of a case's title makes it
  say "NOT as its key signed it".
- **What a listed item must not carry.** A signed record can say more than
  the item it backs:
  - an evidence custody record names the page and its title;
  - a report's published event holds its text.

  So a listed evidence item carries no custody record. A report its author
  now lists carries no event, even when that event is on the public relays.
  A portfolio follows the person's own marking. Each rule has a test that
  fails without it.
- **Checked end to end on the built app** (`.local/scripts/portfolio-check.mjs`).
  The probe made a Public case and a Private one, then a portfolio, and
  opened the saved page from disk as an advisor would. The Private case's
  title is nowhere in the page, its embedded record or the JSON file. The
  check passes, and fails once one word is changed. The run drops relay
  EVENT and AUTH frames.
- **Not driven end to end:** evidence and published events in a portfolio.
  The probe's key had published nothing, and evidence needs Uplink. The
  gatherer's tests cover both; the page's tests cover a published claim, but
  not an evidence item.

### W10, re-planned (2026-10-12)

Reading the sources' terms showed W10 was planned on a stale premise.

- **The lookups exist.** NetRunner's keyless recon (2026-09-02,
  `src/services/intel/recon/keylessRecon.ts`) already reads Certificate
  Transparency, DNS over HTTPS from two resolvers, and RDAP.
- **CORS does not block them.** Probed 2026-10-12, every RDAP server tried
  (ARIN, RIPE, APNIC, Verisign), IANA's bootstrap files, both resolvers,
  crt.sh and the Wayback availability API answer
  `access-control-allow-origin: *`. Starcom's CSP allows any `https:`
  connection. Only arbitrary sites, and the Wayback CDX index, need Uplink.
- **The page scan and fingerprint exist too.** WebsiteScanner reads the
  target's own headers, technologies and security headers whenever
  `nativeHost().fetch` is there, which today means the desktop app.

So W10 is now:

| # | Step | Days |
|---|---|---|
| W10a | Uplink's fetch broker: GET and HEAD, no cookies, private and local addresses refused, a size cap and a pace per site, each site asked at first use (or power mode), every fetch in the activity log | 1 |
| W10b | The app's fetch slot: the desktop app's fetch, else Uplink's, else none; the scanner and recon read it, and say which they used | 0.5 |
| W10c | RDAP from each registry via IANA's bootstrap, with its terms notice (EX33) | 0.5 |
| W10d | Wayback: snapshots, a diff of two, and the Archive's credit (EX34) | 1 |

Evidence fixed with each answer stays the desktop app's (it captures as it
fetches). Through Uplink an answer is not kept as evidence, and says so.


### W10a–b: Uplink reads sites for NetRunner (2026-10-12)

- **`site.fetch`, Uplink's new capability** (EX32). The rules are pure and
  tested, in `src/extension/uplink/siteFetch.ts`:
  - **Public sites only.** Private, loopback, link-local, carrier-grade and
    multicast addresses are refused, in IPv4 and IPv6, as are local names
    (`localhost`, `.local`, `.lan`, `.home.arpa`) and Starcom itself. The
    browser's URL parser has already turned `2130706433` and `0x7f.1` into
    `127.0.0.1`.
  - **Read plainly.** GET or HEAD, no cookies, no referrer, nothing from
    the cache, and only an Accept header.
  - **Within limits.** The body is capped at 2 MB (5 MB at most) and cut
    beyond it, the time limit is 15 s (30 s at most), and two reads of one
    site keep a second apart.
  - **Only a site the person allowed.** A read of any other site is "not
    allowed", and the site is not touched. The app then asks for it in
    Uplink's window, with the tool's purpose, and reads once it is allowed.
  - Every read is in the activity log: status, size, whether it was cut,
    and where a redirect ended.
- **The app's one fetch slot** (`src/extension/siteFetcher.ts`): the desktop
  app's fetch, else Uplink's, else none. Uplink's answer arrives in the
  desktop's shape, so the page scan and its scripts needed no second path.
  NetRunner's three scan controls (the OSINT tab, the right sidebar's
  scans, the left sidebar's scripts) are offered with either route. In a
  plain browser with neither, they say so before any click.
- **What Uplink cannot do that the desktop app does:**
  - A browser follows redirects without saying through where, so only the
    end is known; the desktop records each hop.
  - A browser resolves names itself, so a name that resolves to a private
    address is requested before Uplink can see it. A redirect that ends on
    one has its answer refused, but the request was sent, as any web page's
    could be.
  - An answer is not kept as evidence as it arrives; the desktop keeps it.
- **The privacy page, the listing and `permissions.json`** now say that
  NetRunner's reads of sites the person allowed go without their cookies, to
  Starcom's page alone. No new permission was needed: the optional site
  access asked at first use already covers it.
- **Checked end to end in Brave** (`.local/scripts/uplink-fetch-check.mjs`).
  A copy of the build allowed every site stood in for power mode, since the
  browser's own prompt cannot be clicked by automation:
  - NetRunner's SCAN read example.com through Uplink.
  - A cookie the person held for httpbin.org was not sent (`{"cookies": {}}`),
    and no Referer or Origin went with the request.
  - A 5000-byte answer was cut at a 1000-byte cap.
  - The next read of the same site waited 1002 ms.
  - 192.168.1.1, localhost and starcom.app were refused in words, and every
    read was logged with its purpose.

  With the build as it ships, a scan of a site not yet allowed opened
  Uplink's window naming the site and "NetRunner page scan you started, of
  example.org". Declining it ended the scan with "You declined: you did
  not allow it".
- **Not checked by automation:** "Allow" in that window, and the browser's
  own prompt after it. The owner checks it by hand, as for timestamps.

### W10c: registration from each registry (2026-10-12)

- **Asked of the registry itself** (EX33). NetRunner's recon reads IANA's
  bootstrap file (`data.iana.org/rdap/dns.json`, CC0; the browser keeps it
  a day, as its headers say). It finds the registry by the longest matching
  suffix, over https, and asks that registry. rdap.org, which answered
  before, no longer sees the query.
- **Each registry's notices are shown with its answer**, as it sent them:
  its terms of use, its status codes, where to report an inaccuracy. Only
  web links in them are kept, since a notice is the registry's data.
- **A registry with no RDAP service** (IANA lists 1,203 of the top-level
  domains as having one) is "could not look", never "found nothing".
- **Checked live**: Verisign for .com, Public Interest Registry for .org,
  and Nominet for .uk each answered and sent their terms notice; a made-up
  .zz said it could not look. In a sample of 40 of the 592 registry
  services, 38 allow other sites to read them. The two that do not (.kg,
  which offers only http, and .na) cannot be read from a browser. There,
  recon says it could not reach the registry; the desktop app reads them.

### W10d: the Wayback Machine (2026-10-12)

- **NetRunner's Scanner tab lists a page's snapshots** (EX34).
  - Through Uplink or the desktop app, it reads the full index: the
    latest 200 distinct contents, newest first, each with the Archive's
    digest. "Same as the one before" shows where nothing changed.
  - In a plain browser it gets only the closest snapshot, from the one
    Archive address that allows other sites, and says the full list needs
    Uplink or the desktop app.
  - A failed read is "could not look", never "nothing archived".
- **Two snapshots the person picks are compared.**
  - Matching digests mean the same content, so nothing is read.
  - Otherwise both pages are read through Uplink, reduced to the lines a
    reader sees (scripts and styles left out, nothing rendered), and
    aligned. Removed and added lines are shown.
  - Pages too large to align are listed by lines found on one side only,
    and the panel says so. Same words in different markup are named as
    such.
  - The comparison is shown and never kept.
- **The Archive's terms, kept** (record D-L): "scholarship and research
  purposes only", and "not to collect or store personal data about anyone".
  - The panel names the Archive and its research use.
  - "file" keeps a snapshot as a capture in the Captures inbox: its
    address, time, status and digest, sourced to web.archive.org. Nothing
    of the page is kept, and only at the person's click.
  - A case position published from a case resting on a snapshot says so in
    its criteria: "Some of its evidence is from the Internet Archive's
    Wayback Machine (web.archive.org)."
- **Not shown:** the index's `length`, which is the Archive's compressed
  record, not the page's size.
- **Checked end to end in Brave against the real Archive**
  (`.local/scripts/uplink-wayback-check.mjs`). IANA's root zone page,
  26 Jul against 10 Oct 2026: 4 lines removed, 2 added, all changes of
  registry operator. Both 369 KB pages were read through Uplink, each read
  logged with its purpose, and one snapshot was filed.

### W8c, followed up: the proofs completed (2026-10-12)

- **The sample proofs are complete in Bitcoin.** These are the proofs made
  at 04:48Z, by the module and by Uplink itself. `ots upgrade` (the
  official client) fetched each calendar's completed attestation. All six
  are anchored in block 971047, mined 05:02:23Z. Its merkle root,
  `33918556…1d64`, was checked on a public block explorer. So the files
  existed before 05:02:23Z, 14 minutes after capture. The upgraded proofs
  are in `.local/ots-check/upgraded/`.
- **Starcom keeps its proofs as they were at capture: pending.** A pending
  proof is completed by asking a calendar later. Until then, checking it
  depends on the calendars staying online. Starcom does not yet upgrade
  its proofs itself. That needs:
  - a reader for whole proofs in `opentimestamps.ts`;
  - a request to each calendar (`/timestamp/<commitment>`) through
    Uplink's `site.fetch`, since the calendars send no CORS (the
    calendars' sites are already allowed for timestamps);
  - the completed proof written back beside the evidence.

  A follow-up, for the owner to place.

### Timestamp upgrades: evidence proven in Bitcoin (2026-10-12, EX36)

- **"Complete in Bitcoin", in the evidence viewer, at the person's click.**
  It asks each calendar for the finished part of each file's proof and lays
  it over the proof. Then it checks the block the proof reaches with two
  block explorers: mempool.space and blockstream.info, their terms read
  (record D-L). Only when both show the same merkle root does the viewer
  say "Proven in Bitcoin: its picture, page HTML and page text existed by
  …, block …", naming only the files whose proofs were completed.
- **Kept beside the signed custody record, which never changes.** The
  completed proofs and the block checked are saved with the evidence. "Save
  the proof" then gives the completed .ots file. Signing a record later
  keeps them: signing used to rebuild the record from three of its fields,
  which would have dropped them. Fixed, with a test.
- **Only the calendars Starcom knows are asked**, whatever a proof names:
  a test plants another address in a proof, and it is never asked. The
  calendars get the blinded commitment they already hold; the explorers
  get a block's height.
- **In the app, with or without Uplink.** The calendars' finished answers
  and both explorers send CORS `*`. A calendar's "not yet" (404) does not,
  so a browser cannot tell it from a failure. Then the viewer says "No
  finished proof yet: Bitcoin may not have confirmed it, or a calendar
  could not be read", and claims neither.
- **Checked on real data.** This morning's pending proof, completed with
  the calendars' real answers, matches the official client's own
  completed proof byte for byte (the tests hold both). Run live, it
  reached block 971047, and both explorers showed its merkle root. The
  official client reads Starcom's completed proof. From a page in Brave, a
  finished answer read as 200; a "not yet" threw "Failed to fetch".

### W12: store screenshots and promo tile (2026-10-12, EX36)

- **Made from the real extension and app** by `extension/store/shots.mjs`,
  with the development build in Brave against a local Starcom. It captures
  a made-up sample page served alongside (`store/sample/flood-watch.html`;
  its footer says it is made up). The shots are 1280×800, full bleed:
  1. the side panel beside the page, filing into the open case;
  2. the Captures inbox;
  3. the evidence viewer: hashes, timestamps, custody record;
  4. NetRunner's Wayback comparison, read through Uplink;
  5. Uplink's own pages: its window asking for a site with the purpose,
     the popup, and the activity log.

  The side panel, popup and permission window are the browser's own
  surfaces, which automation cannot picture. Shots 1 and 5 set Uplink's
  real pages side by side.
- **Shot 5 comes from the build as it ships, in a fresh profile.** A page
  scan asks for example.com in Uplink's window, the person declines, and
  sends a selection. The popup says "May reach no site yet", and the log
  shows exactly that. The other shots use a copy allowed every site,
  standing in for the person's allowing; that copy's site list (`<all_urls>`)
  is never pictured.
- **Shot 3 is retaken once Bitcoin confirms the capture** (`shots.mjs …
  evidence`), so the store shows evidence really proven, not staged.
- **The promo tile** (`store/promo-440x280.png`) has no words, as the store
  asks: Starcom's emblem linked to a browser.
- **Found on the way, and fixed:**
  - Starcom said the inbox count from every open page, and from each page
    on connecting. The activity log filled with "inbox.count" lines, and
    once a passing count (1, 0, 1) from a page still catching up. Uplink's
    hello now says what its icon shows; Starcom's pages share the count
    last said; a count is said only once it has held half a second.
  - The not-allowed reason repeated its outcome. It now names the site:
    "example.com is not among the sites you allowed".


### E3, the key in Uplink: the plan (2026-10-12, EX39–EX42)

Found first: chat sending, team and channel events, and NIP-44 sealing sign
with the app's stored key directly (`nostrService`, 25 uses inside it, and the
chat adapter, secure chat and the identity service's fallback outside it).
Twenty-six files already ask the async signer. So the move is:

| # | Step |
|---|---|
| K1 | Uplink's key store: the key encrypted with NIP-49 under the person's passphrase; once unlocked, held in the browser's session storage, cleared when the browser closes, and kept while Uplink's background sleeps |
| K2 | The signer protocol: status, sign, NIP-44 encrypt and decrypt, and import, each with its purpose and in the activity log |
| K3 | Prompts (EX41): public kinds ask in Uplink's own window, showing the kind, the words and the purpose; the rest sign quietly |
| K4 | The app's signer: Uplink becomes a source beside a NIP-07 extension and the app's own key |
| K5 | Chat, sealing and `nostrService`'s direct uses moved onto the async signer |
| K6 | The move, in Your key: Uplink takes the key under a passphrase set in its own window, proves it signs as the same key, and only then is the app's copy deleted. After that, the app never makes a new key while Uplink is away: it would split the person's identity |
| K7 | Uplink's options: the key, lock now, change the passphrase, export the encrypted key |

Checked end to end in Brave: the move, a chat message signed through Uplink,
a publish asking first, the lock at a new browser session.


### E3: the key in Uplink, built (2026-10-12)

- **K1, the key store** (`src/extension/uplink/keyStore.ts`). The key is
  sealed with NIP-49: scrypt at cost 16, then XChaCha20-Poly1305, under the
  person's passphrase of at least ten characters. Its security byte says it
  was handled insecurely, since it sat in Starcom's page before. Opened, it
  waits in the browser's session storage: cleared when the browser closes,
  kept while Uplink's background sleeps, unreadable by content scripts.
- **K2, the signer protocol:** `signer.status`, `signer.import`,
  `signer.sign`, `signer.encrypt`, `signer.decrypt`, each with its purpose
  and in the log. One person, one key: Uplink refuses a second, different
  key. A key is never written to the log.
- **K3, prompts** (EX41, `signerRules.ts`). Reports, claims, refutations,
  packages, notes, profile, comments and verdicts ask in Uplink's window:
  the kind in words, its title, its first words and the purpose. So does
  any kind Uplink cannot name. Direct and sealed messages, relay sign-in
  and Starcom's ephemeral kinds sign quietly. A locked key asks for its
  passphrase; a wrong one is said, and three tries end it.
- **K4, the app's signer** (`src/extension/uplinkSigner.ts`). Uplink is
  offered in a NIP-07 extension's shape, ahead of any other extension, so
  every path that already preferred one uses it unchanged. It counts only
  when the page holds no key of its own, or the same key.
- **K5, chat and sealing.** `nostrService` signs everything through one
  `sign()`: Uplink when it holds the key, else the page's own. Its NIP-28
  events are built by nostr-tools with a throwaway key, and only the
  template is kept and signed, so no event construction is copied.
- **K6, the move, in "Your key".** It is offered only once the key is
  backed up, since Uplink cannot recover a forgotten passphrase. Uplink
  takes the key under a passphrase set in its own window. Then it signs a
  check that must verify as the same key, and only then does the page
  forget it, keeping whose it was. After that, signing or sealing with
  Uplink away says where the key is, and no second key is ever made.
  Importing the key from a backup ends that.
- **K7, Uplink's options:** the key, locked or not, "Lock now", and the
  sealed key to copy as a backup.
- **Also:** the log counts a run of the same use within a minute on one
  line ("×N"), so a chat opening many messages is one line. The privacy
  page says what Uplink keeps of the key.
- **Reproducible still.** Uplink now takes nostr-tools from its own package
  for the shared files too. Before, they reached the repository's copy,
  which the sources zip does not carry. Rebuilt from the zip, all 24 files
  match the package exactly.
- **Checked end to end in Brave** with the build as it ships
  (`.local/scripts/uplink-key-check.mjs`):
  - a key made and backed up, then moved through Uplink's window; the page
    then held none;
  - a portfolio signed quietly by the moved key;
  - a report asked first and signed, a note declined;
  - after a browser restart, the key locked; a wrong passphrase refused in
    words, the right one opening it for a quiet signature.
- **Not yet:** changing the passphrase in Uplink's options. Personas,
  post-quantum keys and the OPSEC items (E3.2, E3.4, E3.6–E3.9) remain.
