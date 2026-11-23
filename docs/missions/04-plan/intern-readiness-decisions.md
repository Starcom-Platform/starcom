# Intern readiness: decisions needed

Written 2026-09-25 from the code, for whoever decides how Starcom is set up for
the intern cohort. Each decision says what is true today, the options, what
each option costs and gives, a recommendation, and the case against it. The
build plan in [`intern-readiness-plan.md`](intern-readiness-plan.md) changes
shape with each answer. The audit behind all of this is
[`intern-readiness.md`](intern-readiness.md).

Sizes are rough: S is a day or less, M is two to five days, L is one week or
more.

## What was decided, on the night of 2026-09-25

The answers changed the premise. **There is no separate training site: interns
use the live app as testers,** as open agents who form their own teams. The
cohort is Starcom Academy's fourth: twelve weeks from 2026-12-01 to 2027-02-22,
with applications closing 2026-11-20
(`cadet-archangel-agency/public/llms.txt:23-26`).

| | Decision | What follows |
|---|---|---|
| **D1** | **Bundles now**, carried over the internal private relays on subdomains of cosmiccodex.app: the relay on the Jetson, or another instance beside it. A Raspberry Pi 4 relay is standing by if those prove not private enough. | Build signed bundles; declare the internal relays; relay sync only if needed later. |
| **D2** | **Ask every time.** Public relays stay allowed. Interns need accounts of some kind, so their keys can be registered and added to the internal relay. | No pre-selected distribution; a registration path onto the internal relay's allowlist. |
| **D3** | **No required approval.** Publishing is like posting from any Nostr app, and publishing does not mean verified. Verification comes from evidence and case-making. An **optional** team sign-off before publishing is wanted, so a report can carry verification from several peers, and so are reviews appended after publishing. | Research whether and how Nostr supports both; see "Peer sign-off and reviews" below. |
| **D4** | **No training site.** The internal relay on the Jetson is preferred, or another relay instance on it; the Pi 4 comes later. Starcom Academy (academy.starcom.app) trains interns but is not integrated yet. **An in-app tutorial mode** that explains the whole pipeline step by step is wanted. | Drop the training-site work; plan a tutorial mode. |
| **D5** | **Audit further first:** find out whether each candidate fails because it belongs to a bigger plan that still expects it, or because it is old work with no future. | A history audit of each candidate. |
| **D6** | **An app-wide interface upgrade,** with its own audit: sub-themes per section, colour coding that carries meaning, glyphs everywhere, careful fonts, loaders that show real progress, cyan and gunmetal, a streamlined professional "power tool" feel, with the EVA interface of *Tiberian Sun: Firestorm* as the mood. | A design-system audit and brainstorm. |
| **D7** | **Remake the scripts to work,** after analysing what they and NetRunner's other tools were meant for. | A NetRunner remake study. |
| **D8** | **Name the object:** "Publish Mission Package", with the destination named beneath it. | Settled. |

The sections below are the brief as it was put. Where a decision changed the
plan, the plan says so.

## D1 — How teammates share cases and missions

**True today.**

- Every report, case and mission lives in one record in this browser: IndexedDB
  `intel-workspace`, copied to localStorage (`IntelWorkspaceManager.ts:226-248`,
  `465-467`). Nothing reads another machine's work.
- Once a team exists, its name, description and member count are published
  unencrypted to five public relays every two minutes (kind 30090,
  `RealTimeTeamService.ts:651-669`, `nostrService.ts:623-644`). Nothing is read
  back.
- Team chat goes out unencrypted. It looks for an encryption key published under
  the channel's hashed name, which is nobody's key, and falls back to plain text
  (`SecureChatIntegrationService.ts:319-347`, `587-591`). The app calls it
  "Secure chat".
- An invite code cannot be redeemed on another machine even with a field for it:
  the invitee's browser has no copy of the team (`RealTimeTeamService.ts:848-888`).
- Only reports can be exported and imported, as unsigned JSON with new-id,
  overwrite or skip (`intelReportSerialization.ts`, `IntelReportService.ts:200-238`).
- The pieces for encrypted sync are installed and unused: nostr-tools 2.16.2
  (NIP-44 encryption, NIP-59 gift wrap, NIP-42 relay auth) and
  `@noble/post-quantum` (ML-KEM).

Whatever is chosen, the plan's Phase 0 stops the public team broadcast and makes
chat say what it is.

**Options.**

| | What it is | Builds | Size | Gives | Risks |
|---|---|---|---|---|---|
| **A. Encrypted team relay** | Each report, case and mission becomes its own encrypted event on a team relay. Every member's app reads and merges them. | One event per record in place of the single workspace record; a team key handed over at invite time and replaced when someone leaves; relay auth and an allowlist; delete markers; merge rules; team-wide case and mission numbers. | L, about 4–6 weeks, plus a relay (D4) | A real shared workspace. Assignment, review and notifications inside the app. | Key handling when people leave. Edit conflicts. The relay operator sees who talks to whom, and when. A half-built version leaks, as the team broadcast does today. |
| **B. Signed bundles** | "Export case" packs a case with its reports, missions and history into one signed file. "Import" shows what the file holds, then adds or updates. | Case and mission serializers; signing with the existing `exchange/` code; an import preview that adds a copy or updates if newer; "imported from" provenance; numbers that cannot collide. | M, about 1–1.5 weeks | Handoffs, and review before publishing, over any transport: a file, a drive, later the training relay. | Copies drift apart. Manual. Protected fields travel as ciphertext unless re-encrypted to the recipient. |
| **C. Local only, said plainly** | The app says where it matters that work stays on this device, adds a local backup, and teams share only what they publish. | Wording, and a backup export. | S, 1–2 days | Nothing new to leak. | "Team" means little. A reviewer sees work only over the author's shoulder. A cleared browser loses everything not backed up. |
| **D. Bundles now, sync later** | B, built so that each record in a bundle is already the signed per-record envelope A would publish. Decide on A after the pilot. | B, with the envelope designed for A. | M now | B's benefits now, without throwing it away later. | The same as B until A exists. |

**Recommendation: D.** The cohort needs handoffs and review before publishing.
B delivers both in about a week and a half. A takes a month or more and needs a
relay (D4) and a key design that is easy to get wrong. Designing B's records as
A's envelopes means B is not thrown away.

**Against.** If the programme is built around daily team exercises on shared
cases, passing files will feel clumsy from the first week, and A should start
now.

**Not proposed:** a central database. Starcom runs no server, and a team store
on one would reverse that.

## D2 — The starting distribution for new cases and missions

**True today.**

- Three values: Public ("publishable anywhere, including public relays"),
  Limited ("keep off public relays") and Private ("this workspace only").
  A missing value reads as Public (`IntelItemUI.ts:37-78`, `150-156`).
- New cases and missions start at Public (`CasesDashboard.tsx:111-121`,
  `MissionsPanel.tsx:407-408`). A mission's distribution cannot be changed after
  it is created.
- Limited and Private behave the same: a publish is refused unless every mission
  relay is private (`MissionService.ts:142-160`). "Private" means a local-network
  address only (`publishTargets.ts:142-161`), and the default relays are five
  public ones. So with today's settings a Limited mission can never be
  published, and a hosted training relay would count as public.
- A case's distribution is never checked. "Publish position" sends the case's
  verdict and counts to the findings relays whatever the case says
  (`CasesDashboard.tsx:1009-1060`, `caseAdjudication.ts:50-56`).

The plan's Phase 0 makes distribution editable after creation, lets a
deployment declare its own private relays, and applies distribution to every
publish path. This decision is only about the starting value.

**Options.**

- **A. Ask every time.** No value is pre-selected. The create form needs a
  choice, described in plain words. It teaches the choice, at the cost of a
  click, and people tend to pick the first option offered.
- **B. Limited to start.** Nothing can reach a public relay until someone
  deliberately changes it. The publish review offers the change, in words, when
  a Limited mission is published to public relays.
- **C. Public to start, as today,** guarded by the publish review alone. The
  least friction for experienced people. Newcomers start from the riskiest
  value.
- **D. Set by deployment.** The training site starts at Limited and production
  at Public. Two behaviours to explain.

**Recommendation: B.** It is safe by construction: a mistake leaves a mission
unpublished, not published. The publish review turns the change into one
deliberate step, so experienced people lose little.

**Against.** If most missions are meant to be public, B adds a step to nearly
every publish, and people learn to click through it. A makes the choice at a
calmer moment.

## D3 — Review before anything goes public

**True today.**

- Nobody reviews anything. The one real authority is signed dispatch
  delegation: a mission's creator may publish it and can delegate that right
  to named keys (kind 30081, `missionCapability.ts:93-107`, `258-326`). By
  default only the creator can publish.
- A report can be approved by its own author. The report service checks the
  order of steps but not who takes them (`IntelReportService.ts:96-102`,
  `181-188`).
- Delegation cannot say "this key approved this exact package". A grant
  carries no digest of the package, and the package is rebuilt, with a new
  timestamp, at publish time (`PackageComposer.ts:145`, `MissionService.ts:477`).
  Retry Publish can send different content from the attempt that failed.
- Mecha Jono publishes from its own node, not through Starcom
  (`TeamWorkspaceApplication.tsx:783-787`). No gate inside Starcom binds it;
  only a rule in the shared spec, checked by whoever receives, could.
- Starcom is local-first, so a determined person can approve their own work
  with a second key. A gate here guards against mistakes, not bad faith.

**Options.**

- **A. A second signature on the exact package.** Before a public publish, a
  different key signs the frozen package's digest, and the publish carries both
  signatures, so anyone can check. Needs: frozen packages, an approval format,
  verification, and a way for the approval to travel (D1). Size L. It binds
  Mecha Jono only if the spec adopts it for everyone.
- **B. Someone else releases it.** Nobody publishes their own work publicly. The
  author hands the mission over (bundle or sync), and a reviewer reads it in the
  publish review and publishes it. Uses delegation as it exists. Size M, plus
  D1's transport. It applies to anyone publishing from a Starcom workspace,
  leads included.
- **C. Hold, with a cancel window.** A public publish waits ten minutes in a
  visible outbox, where the author or anyone on the team can cancel it. No
  second person needed. Size M. Others see the outbox only with D1's option A.
- **D. No gate.** The publish review, the safer starting value (D2) and the
  training site (D4) carry the safety. No extra build.

**Recommendation: B.** An analyst drafting and someone else releasing is how
intelligence teams already work, it needs no new cryptography, and A can be
added later to make a release verifiable. B needs D1 to be A, B or D; with
local-only work, choose D here.

**Against.** A lead with no reviewer available is blocked. During training the
private relay already makes a mistake harmless, so B's friction may only be
worth it once interns publish for real.

## D4 — The training site

**True today.**

- A build can send mission publishing to a chosen relay only
  (`VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE`, `publishTargets.ts:124-132`), and the
  mission screen then says "Safe to practise on". That check covers the mission
  channel only. Findings, report publishing, chat, team updates, encryption-key
  publishing and IPFS each still reach public networks unless set separately,
  and several have no setting at all (`nostrService.ts:88`,
  `FederationIngestService.ts:27`, `ipfs-client.ts:14-21`).
- A relay on a hosted name counts as public (`publishTargets.ts:142-161`), and a
  browser will only connect from the HTTPS site to a `wss://` address with a
  trusted certificate. Private addresses cannot get one.
- The Record (`wss://record.cosmiccodex.app`) is reached through a Cloudflare
  tunnel, allowlists writes and advertises relay auth. The docs place "the
  internal Nostr relay" on the Jetson (`docs/ecosystem.md:147-150`).
- There is no reset. Workspace, keys and settings sit in 15 IndexedDB databases
  and dozens of localStorage keys, and the signing key is stored unencrypted as
  `nostr_secret_key` (`nostrService.ts:71`).

Whatever is chosen, the plan builds one network boundary for a training build:
a single setting that routes every write to the training relay and fails the
build if any path escapes it.

**Options.**

- **A. A training site, with a small hosted relay.** `training.starcom.app`,
  deployed from a branch with its own settings. A separate address means
  separate browser storage and separate keys, so nothing mixes with real work.
  A permanent banner, and a reset button for the trainer. The relay is a small
  server (strfry, relay auth, an allowlist of trainee keys, a real certificate)
  at roughly $5–10 a month, which the trainer can wipe.
- **B. The same site, with the relay on the Jetson.** No new server: a second
  relay instance beside The Record, through the existing tunnel. Tied to that
  device's uptime, and it must stay a separate instance so training traffic
  never reaches the real archive.
- **C. The same site, with no relay (dry run).** Every publish goes to a local
  "would have sent" list that shows exactly what would have left. Nothing
  leaves at all. Trainees cannot receive each other's packages; the trainer
  reviews through bundles (D1).
- **D. A practice switch in the main app.** Not recommended: training shares
  storage and keys with real work, and a switch can be switched off.

**Recommendation: A.** It is safe by construction and independent of any one
device, and a relay the trainer controls lets the cohort practise both halves:
publishing, and receiving each other's packages.

**Against.** It is one more thing to run and pay for. If the programme is short,
C gives most of the value at no cost, and A can follow.

**Decided without asking, reversible:** the training site still reads public
intel, so the globe looks real. Reads send nothing a trainee wrote; every write
goes to the training relay.

## D5 — What to retire

**The candidates**, with what the code shows:

| Candidate | What it is today | Size | Risk |
|---|---|---|---|
| **Cyber Investigation Hub, its Intel Packages, and the Mission Control panel** | The Hub (globe right rail) counts an old store nothing writes to. Intel Packages saves a made-up "APT29 Infrastructure Analysis" package the first time it opens, and creating one needs a wallet that cannot connect (`IntelPackageManager.tsx:202-248`). Mission Control shows the same missions as OpsCenter, under another name. | ~1,700 lines | Low |
| **Intelligence Dashboard popup** | Globe right rail. "0 intel processed" on every load; the green "system ready" light is hard-coded; it refreshes every 30 s even when closed. One real feature: "Analyze published reports" saves a summary report, to be moved first. | ~4,800 lines | Medium |
| **Demo and test routes** | `/auth-demo`, `/enhanced-app-demo`, `/test-ui`, `/ux-test`, and `routes.tsx.new`, which is never compiled. | ~3,300 lines become unused | None |
| **Wallet and Store** | A Solana devnet wallet. With a wallet connected, the globe's right-click "Create Intel Report" keeps the report only in memory, lost on refresh; offline reports cannot sync without a wallet, although it is used only as the author name. The Store is 12 merchandise links. Mecha Jono, asked directly (question B-03), recommended retiring the wallet and the Intel Market Exchange subsystem. | ~5,300 lines and six `@solana` packages | Medium: fix the two wallet paths first |

**Keep:** the Satellite Tracking, Threat Assessment, Timeline and Node Graph
panels, which read real sources; and the Exchange's "Intelligence Marketplace"
tab, the only screen that publishes a report package. Rename it and put it
behind the publish review.

**Recommendation:** retire all four groups, in the order of the table.

**Against.** The Intelligence Dashboard's summary feature and the IntelFusion
logic under it were flagged for porting in Phase 2. Retiring before porting
loses them.

## D6 — One look for the work screens

**True today.** Three visual languages: Cases is white Material UI cards on
black, OpsCenter is the cyan HUD, and NetRunner is a terminal. Uppercase labels,
glow and a display face run through long working screens.

**Options.**

- **A. A calm work theme, with the HUD kept for the globe.** Dark greys, one
  cyan accent, a readable sans in sentence case for Cases, OpsCenter, the report
  dashboard, IntelAnalyzer and NetRunner. The globe and the header keep the HUD
  look. Size L.
- **B. The Starcom HUD everywhere.** Restyle Cases and the others to match the
  globe. The most coherent brand; uppercase and glow are harder to read over a
  working day. Size L.
- **C. Shared components only.** Buttons, inputs, chips and empty states become
  one set; each app keeps its own look. Size M. Still three looks.

**Recommendation: A.** The globe is a display, while the work screens are
desks. Reading comfort matters more at a desk, and one shared accent keeps both
recognisably Starcom.

**Against.** The HUD is the brand's first impression, and your own rule is that
the best-looking option wins. If the HUD done well reads fine, B is one look
instead of two.

## D7 — NetRunner's personal-data scripts

**True today.** Four default scripts are real code
(`NetRunnerScriptRegistry.ts:62-65`): an email extractor, a domain parser, a
technology-stack analyzer, and a contact harvester that collects phone numbers,
street addresses and social profiles from a target site
(`ContactHarvesterScript.ts:34-37`, `139-145`). In the browser, the target page
is fetched through three public proxies, found dead on 2026-09-02
(`WebsiteScanner.ts:89-91`, `250-253`). Results go only to the browser console
and are never shown or saved (`NetRunnerLeftSideBar.tsx:176-182`). There is no
consent, retention or purpose handling.

**Options.**

- **A. Remove the two personal-data scripts.** Keep the domain parser and
  technology-stack analyzer, and make their results visible.
- **B. Keep all four behind a stated purpose.** Ask what the collection is
  for, show results in the app, never store or publish personal data by
  default, and log the use.
- **C. Hide them on the training site only,** and decide for production later.

**Recommendation: A.** They do not work in the browser today, and making them
work is a privacy-policy question before it is a code question. An intern
programme should not start with a contact harvester.

**Against.** Collecting published contact details is ordinary OSINT practice. B
keeps the capability and teaches the discipline around it.

## D8 — What the publish button says

**True today.** "PUBLISH TO NAVCOM". Navcom is the partner network, and a
newcomer will not know the name.

**Options.**

- **A. A plain verb, with Navcom as the destination.** The button says
  "Publish package". Under it: "Goes to Navcom: 5 public relays", linked to the
  glossary. It teaches the name where it matters.
- **B. Keep "Publish to Navcom",** and explain it in a tooltip and the glossary.
- **C. Plain words only.** Navcom appears in the docs, not in the app.

**Recommendation: A.** The button says what happens, and the destination line
names Navcom beside the relays it actually means.

**Against.** Starcom and Navcom are named as a pair on purpose, and B keeps
that pairing on the button itself.

## The next decisions, 2026-09-26

The research that D3, D5, D6 and D7 asked for is done. Each study ends with the
questions it needs answered:

| # | Question | Where it is set out | Recommendation |
|---|---|---|---|
| N1 | Relay software for the internal team relay, and relays that other organisations bring themselves | [`internal-relays-and-registration.md`](internal-relays-and-registration.md) | **zooid, after comparing seven relays,** with two gift-wrap patches, a pinned image and a mirror; haven as runner-up. Build Starcom to join **any** team's relay through signed invite links. The owner answered that zooid "makes sense (further brainstorm if that's the best option; probably, but make sure)", and asked whether Starcom could support others who set up their own relays: the "Relays" answer below. |
| N2 | How interns register | the same | **Decided 2026-09-26: request access in the app** (flow B), backed by the relay's own access requests (NIP-43) or remote allowlisting (NIP-86) |
| N3 | How chat is repaired | [`../00-current-state/chat.md`](../00-current-state/chat.md) | **Revised after the owner's challenge and a live test:** repair and complete the existing post-quantum chat. Do not rebuild it. |
| N4 | How browser users reach NetRunner's page tools | [`netrunner-remake.md`](netrunner-remake.md) | **Revised after a live test:** fix the small faults first. Keyless recon already works in the browser. Then choose desktop builds or a node fetch worker. *Chosen 2026-10-01 (B9): desktop builds.* |
| N5 | Team sign-off design | [`peer-sign-off-and-reviews.md`](peer-sign-off-and-reviews.md) | S1: labels signed over the exact event id |
| N6 | Whether Mission Packages carry sign-offs | the same | Reports and findings only, keeping Locked Decision #7 |
| N7 | Which reviews to build first | the same | Comments and verdicts first; corroboration and refutation already exist |
| N8 | Tutorial approach | [`tutorial-mode.md`](tutorial-mode.md) | A coach over real work now, a practice workspace later |
| N9 | Which old systems to retire | [`retirement-audit.md`](retirement-audit.md) | The four superseded or legacy groups, after their conditions |
| N10 | Type pairing | [`interface-upgrade.md`](interface-upgrade.md) | A: Oxanium, IBM Plex Sans, JetBrains Mono |
| N11 | Sub-themes | the same | A tint in the frame only |
| N12 | How much EVA | the same | Its behaviour, with restrained chrome |

### Corrections after the owner's challenge, 2026-09-26

The owner questioned the chat and NetRunner conclusions ("Audit yourself").
Both had come from reading the code without running it, against this
project's own rule. Running them changed the answers:

- **Chat.** Contacts can be added, and the direct-message window opens: the audit
  had said neither worked. The post-quantum core runs. What fails is narrower:
  - direct messages lose their encryption to a `dm-` prefix, and are never
    received;
  - team channels have no group encryption.

  The recommendation changed from rebuilding on NIP-17, which is not
  post-quantum, to repairing and completing the existing design.
- **NetRunner.** Keyless recon works well in the browser, and the scanner works on
  desktop. What fails is the browser page scan, whose public proxies really are
  dead, and the sidebar scripts' wiring. The fix is small; the remakes became
  later improvements.

### Decided later on 2026-09-26

- **Chat:** repair, keeping post-quantum, **and hide who talks to whom**: each
  post-quantum envelope wrapped in a NIP-59 gift wrap.
- **Relays:** Starcom is built to **join any team's relay,** with signed invite
  links, a join wizard and an admin panel. Archangel Agency's relay is the first
  team relay, not the only one. *Corrected 2026-09-28:* this record also said
  "a relay kit any organisation can run". That was the wording of the option,
  not the owner's decision: the owner chose "Any team's relay", meaning Starcom
  works with relays other people run. A kit built from it was removed. Relay
  software is not chosen yet: D1 says to use the internal relays already
  running, and the operator questions in `internal-relays-and-registration.md`
  come first.
- **NetRunner:** fix the small faults first. Browser users reach page tools
  through the desktop app (B9, 2026-10-01). This line said "then a fetch worker
  on the operator's node", which N4 had left open between that and desktop
  builds.
- **Team sign-off:** the owner asked for the existing post-quantum work to be
  audited first. The audit, in `../00-current-state/post-quantum.md`, confirms
  it by running it, and the sign-off options are revised around it in
  `peer-sign-off-and-reviews.md`: P1 recommended, a post-quantum attested claim.

### The remaining decisions, 2026-09-26

| # | Decision |
|---|---|
| N5 | **Team sign-off: P1, a post-quantum attested claim** (kind 30082) about the exact content digest, stating what the reviewer checked; the post-quantum prerequisites come first |
| N6 | **Sign-offs apply to reports and findings only.** Mission Packages stay free of analyst keys, keeping Locked Decision #7. |
| N7 | **Reviews:** comments and verdicts first, in one panel with the existing corroboration and refutation |
| N8 | **Tutorial:** a coach over real work before the cohort, then a practice workspace when trainers want repeatable exercises |
| N9 | **Retire all four,** each after its condition: the Hub, Intel Packages and Mission Control; the Intelligence Dashboard, once its summary and IntelFusion templates have moved; the demo routes; the wallet, once the two paths that need it are fixed. The Store and the Marketplace tab stay. |
| N10 | **Type: A,** Oxanium for display, IBM Plex Sans for text, JetBrains Mono for data; Aldrich for the wordmark only |
| N11 | **Sub-themes: a tint in the frame only,** never on data or status |
| N12 | **EVA: its behaviour with restrained chrome.** A job rail, a capacity gauge, live-or-down panels and EVA-style phrases; hairline frames; sound off by default. |

## The cohort's relay, decided 2026-09-28

The Jetson answered the operator questions: the cohort's relay is
`wss://crew.cosmiccodex.app`, zooid v0.2.5, and all six of Starcom's relay
checks hold there (details in
[`internal-relays-and-registration.md`](internal-relays-and-registration.md)).
The owner then decided:

| # | Decision |
|---|---|
| R1 | **Owner: the owner's personal npub,** `npub1n4ch3caz4w7gj3aswmvzmlj89grp390mnuu7yerlqecqx8999lmspgl00g` (hex `9d7178e3a2abbc8947b076d82dfe472a061895fb9f39e2647f0670031ca52ff7`), the key in Jono's Alby signer. He manages crew from Starcom's admin panel with it. Not Starcom's node key. |
| R2 | **Admins: Jono and Mecha Jono.** Mecha Jono holds the membership methods (invite codes, allow and remove, ban, the lists) and mints codes against the intake list; Jono, as owner, holds all of them. |
| R3 | **Gift wraps: patch now, offer upstream.** The Jetson runs zooid v0.2.5 with the two patches (a wrap is taken only from a signed-in member; served only to the key it tags), and offers them to zooid; they are dropped once zooid ships the fix. This keeps the chat decision of 2026-09-26, to hide who talks to whom, among members. |
| R4 | **Cohort end: access off on 2027-02-22, wipe on 2027-03-24.** Intern keys and open invite codes are removed on the last day; the data is kept 30 days for grading, credit and disputes, then deleted with every backup that holds it. Interns export their own work before the end. |

## The gaps, decided 2026-09-29

From the audit recorded as Phase 9 of the plan. The owner chose:

| # | Gap | Decision |
|---|---|---|
| G1 | Attachments (9.10) | **Encrypted on the team relay:** one encrypted upload to the relay's file storage (Blossom), members-only reads, the key sealed to each member, deleted with the relay. The paperclip that publishes in the clear goes now. |
| G2 | A second device (9.11) | **A post-quantum key per device,** sealed to all of a person's devices, and a screen to bring your key to a new device. History stays where it was. |
| G3 | Records a 9 Sep migration made Public (9.6) | **Review them once:** a list of every Public record made before 2026-09-09, to confirm or change. The migration leaves missing ones undecided from now on. |
| G4 | Team messages from outside the team (9.9) | **Show, flagged** "Not on this team's member list". |
| G5 | Notices (9.12) | **A notice and an unread count:** sender and team, never the text; once per message. |
| G6 | A received package on the globe (9.14) | **Honour peers' citations** of their public reports, and offer "what this key published", labelled as that. No spec change; D1 untouched. |
| G7 | Late joiners (9.7) | **Say so plainly:** messages before you joined were not sealed to you. Nothing is re-sent. |
| G8 | Bundles and distribution (9.13) | **Private stays put:** a Private record cannot be sent; Limited and Public can, to named people; undecided asks first. |

### G8, refined before it was built

G8 left three questions open. The owner answered them on 2026-09-29, before
9.13 was built, and a fourth, which G8c had caused, on 2026-09-30:

| # | Question | Decision |
|---|---|---|
| G8a | A Private record that a case or mission cites | **Left out, and said so.** The review lists it as staying here. The manifest names it by type and id only, never by title or content, so the people receiving the bundle can see that a record was kept back. |
| G8b | An undecided record that a case or mission cites | **Goes with it.** Only the case or mission is asked about. The review counts the undecided records it carries, and they stay undecided. |
| G8c | Export as a file | **Same rule as sending.** |
| G8d | Private work leaving with its owner (R4), decided 2026-09-30 | **A sealed copy for yourself.** G8c left no way to take Private cases and missions out, although R4 says interns export their own work before the end, while a report's own page still downloaded it in the clear whatever its distribution. "Export all my work" writes one file holding every case, mission, report and item, Private included, encrypted to the person's own key: only someone holding that key can open it, so it is no use without a backed-up key. Export as file and Send to… stay as G8c left them, and a report's plain download follows the same rule. |

## Decided while building, 2026-09-30

Questions the work raised, put to the owner with options and answered the
same day:

| # | Question | Decision |
|---|---|---|
| B1 | Companies only Wikidata describes read "LEI …" (3.6) | **Fetch names only:** one read of Wikidata's labels for the companies already in the snapshot, written beside the statements. Nothing the engine compares or weighs changes. |
| B2 | The analyzer graded GLEIF and Wikidata as unknown sources, F and never known genuine, so none of their 187 findings could be published (found during 3.6) | **Register both:** each is graded as itself, and their findings can be published through the review. |
| B3 | What moves into the report builder before the Intelligence Dashboard goes (4.3) | **Only what is real:** a board's Export draft says what its pinned reports rest on (sources, grades, places, times, what is missing), read from the reports. The analysis that found nothing, the canned sentences and the confidence on the wrong scale do not move. |
| B4 | The HUD corner that showed the dashboard engine's status (4.3) | **Removed:** it reported on analysis that found nothing, so nothing claims a status nobody measures. |
| B5 | A "Phase 5" button and dashboard of fixed numbers (CPU 0%, FPS 60, "Encryption: secure"), random ones and "vulnerabilities detected" alerts under a flag, and random scores for retired wallet checks (8.3b). The question said it showed on every visit; it never mounted, because the HUD layout's one caller embeds it and returns before the wrapper. Its flag being on was taken for it being shown | **Remove all of it:** the integration, its two panels and the six flags only they read, so nothing mounts them later. The browser's own tools show real performance. |
| B6 | A toast said "Settings loaded" on every visit and "Settings saved" only when another tab wrote a setting (8.3b) | **Remove it:** settings persist without a notice, as in most apps. |
| B7 | The "Phase 4" gaming layer (an RTS controller with sound and "holographic" effects, and an operator badge) never mounted, for the reason Phase 5 did; it dates from 2025 and its overlay was commented out (asked 2026-10-01) | **Remove it.** EVA behaviour for the restyle comes from `interface-upgrade.md`. |
| B8 | What follows 8.3, the last status claims, V1's chat stories and the first render, in the six weeks before the pilot (asked 2026-10-01) | **NetRunner's small faults, then the restyle and glyphs of the screens the pilot sees first, then team sign-off** during the cohort. |
| B9 | How browser users reach NetRunner's page tools for the cohort; N4 had left desktop builds or a fetch worker on the operator's node open (asked 2026-10-01) | **Desktop builds.** Interns who want page tools use the desktop app, and the browser says so. Platforms, hosting and signing are asked when the work starts. |
| B10 | The WebGL check before the globe mounts costs a whole context on every visit (1.7–3.4 s on a machine that draws in software). It was added because three.js once threw outside React; in Chromium the error boundary now holds without it (asked 2026-10-01) | **Test the other engines, then remove it.** It held in WebKit and Firefox too, and in Firefox with WebGL off by preference; removed. |
| B11 | The minimap's own WebGL context, as costly as the main globe's, landing as the main globe is revealed (asked 2026-10-01) | **Later, and a quality step:** created when the browser is idle after the globe appears, and given up on a device the governor steps down, shown as a still image. |
| B12 | Where interns get the desktop app for NetRunner's page tools; its repository is private (asked 2026-10-01) | **A public repository that holds only release files.** The app's source stays private. |
| B13 | Which desktop builds, and signed how (asked 2026-10-01) | **All platforms:** Mac, Windows and Linux. The owner provides machines, or a CI runner, for Windows and Linux. Signing was not chosen; builds are unsigned until it is. |

## The critique audit, decided 2026-10-01

The owner's critiques of 2026-10-01 were audited in
[critique-audit.md](../00-current-state/critique-audit.md). The fifteen decisions that
came out of it, numbered K1–K15, are recorded in that file's section 14 and not
repeated here.

In short:

- **Navigation:** one Missions button, five buttons and a More sheet on phones, a
  Symbol registry in place of emoji, one ticker.
- **Globe:** a Classic territories style with fine settings, true sizes and bloom for
  the solar system, sharper textures and then tiles, a menu at the click for groups.
- **Apps:** IntelWeb gets structure and then 3D; the Market Exchange becomes a lead desk
  with four new feeds; diplomacy is built for both education and investigation.
- **Data:** three EIA layers; Raver Watch's questions go to Mecha Jono, and its time
  handling is fixed now.
- **Order:** fixes, then navigation, then the globe.

## Mecha Jono's handoff, decided 2026-10-02

Mecha Jono's handoff of 2 October brought Raver Watch v1.2, Interchange 3.3.1 to
3.5.0, War & Conflict and the share handle v9 proposal. The owner chose every
recommended option.

| # | Question | Decision |
|---|---|---|
| RW12 | Where a scene event at a public venue is drawn | **At the venue, public ones only:** to 0.001°, named with its address. Every other point stays at 0.1°, and the share handle hands every position out at 0.1°. |
| RW13 | Where field missions go | **Raver ones on RaverMissions, all in Missions:** weekend harm reduction and heat relief on the layer; every field mission listed in the Missions app, and placed ones drawn. Built in block H. |
| RW14 | Whether `whenReady({ address })` and `renderBatch` ship before the rest of v9 | **Yes, those two now.** Shipped with v1.2, as contract v9. |
| — | What else of the handoff now | **Raver Watch v1.2 now, the rest later:** Interchange 3.x ingest and the rest of v9 in block H. |
| WC1 | When War & Conflict is built | **The layer and the war map now,** in F's free weeks before D; the brief view in D. |
| WC2 | How it sits beside Conflict Zones | **A new layer beside it,** the war map shaded under it. Conflict Zones stays as it is until K12. |
| WC3 | Where the daily brief is read | **A docked panel on the globe.** Picking a theatre lights up its war and its events. |
| WC4 | How an item that names only a country is drawn (47 of the first day's 57) | **One mark at the country's centre,** shared by that country's items, its hover saying they are about the country as a whole. An outline has no hover, and every line colour here already means something. |

RW12–RW14 are recorded in the globe record, section 19, and WC1–WC4 in section 20.

## Reading all The Record holds, decided 2026-10-03

The Record returns at most 500 events per filter. Raver Watch's single filter
lost every drug-check alert and most heat towns behind 460 venue nights. The read
now pages until it has everything (globe record, section 22), and the owner
decided how it stays bounded (recommended options):

| # | Question | Decision |
|---|---|---|
| RW15 | How venue nights (~430 a day, 240 of 558 already ended, none expiring) stay bounded | **Ask for expiration:** ask Mecha Jono to tag each venue night with NIP-40 `expiration` (its end plus a day). The Record runs strfry, which honours NIP-40 and drops ended nights, so the complete read stays at the nights still standing. Nothing changes on Starcom's side. |
| RW16 | Whether Mecha Jono hears of the cap and the fix | **A comment on their handoff doc,** shown to the owner before it is posted, carrying the RW15 ask. |

## Drift from Mecha Jono's spec, decided 2026-10-03

Their handoff doc lists Interchange 3.6.0–3.6.3 and Raver Watch v1.5–v1.6 since
Starcom's build. Read against the live notes on 3 October: five War & Conflict
event types without a glyph, drawn silently as plain reports (protest 4,
election_security 3, unrest 2, state_of_emergency 1, missile_launch 1); two
unnamed sources, which a card would print as `mofa_jp` (12) and `rferl` (4); and
16 scene-news notes refused, since no layer takes them. The owner chose the
recommended options:

| # | Question | Decision |
|---|---|---|
| WC5 | How the new event types are drawn | **One new glyph, `unrest`,** for protest and unrest; a missile launch takes the strike glyph; a state of emergency and election security take the warning glyph. |
| RW17 | What happens to scene news | **Listed, not drawn:** read, and listed in the Raver Watch key and on cards as context, with no globe marks. News is not a place-bound safety item, and several name no place. |
| IX1 | How drift from their spec is caught | **Both:** cards and the key say when items carry an event type or source this build does not know, and `npm run audit:interchange` lists unknown types, sources and refused notes on demand, read-only (a spot check, no schedule). |
| IM24 | When these are fixed | **Now, before the contact sheet:** they are live on starcom.app, and small. Block I resumes after. |

## The contact sheet, decided 2026-10-03

Five of Mecha Jono's nine templates can be drawn from the kept notes today:
critical intel, context report, conflict brief, hazard and Raver Watch alert,
at five sizes each. The owner chose the recommended options:

| # | Question | Decision |
|---|---|---|
| IM25 | How the contact sheet is delivered | **A script and, this once, a review page:** `npm run contact:cards -- <url>` writes a grid and its index for any build, from the kept notes; and a private review page of today's cards with their alt text and warnings, stamped with the build, for the owner to look over and share if they choose. |
| IM26 | How the templates that cannot be drawn yet appear | **A labelled empty slot each,** saying why and what unblocks it: actionable intel (no actionable item in the data), mission package and field mission (block H's ingest), declassified (no-globe cards, IM17). |
| IM27 | How each size reaches the exact shape Mecha Jono posts (the sheet showed every card but the 9:16 taller: embed 1280×1271–1423 for 1280×800, square 1080×1551–1703 for 1080×1080, portrait 1080×1821–1973 for 1080×1350, link preview 1200×1099–1251 for 1200×630) | **Side by side for the wide sizes, stacked for the tall:** at 1280×800 and 1200×630 the picture is a square on the left and the text a column on the right; square and portrait stack like the 9:16, the picture taking what the text leaves. Every card is exactly its size, with all its text and caveats. |
| IM28 | What happens to today's taller layout | **Replaced everywhere:** one meaning per size name; the share button's download takes the same exact sizes, and the golden cards are updated after looking. |
| IM29 | The exact-size cards' type sizes (compared on real cards, claude.ai/artifact/9Nar87cYHs6BRQgwmibyNn) | **Compact at every size:** headline/body/caveats/footer 26/15/13/12 at 1200×630, 30/17/14/13 at 1280×800, 36/19/15/14 square, 40/20/16/15 portrait; the 9:16 keeps IM18's. Every real card draws. One step larger refused three of four cards at square and the brief at portrait. |
| IM30 | How a card's QR code is encoded (IM13: only when a shot asks, `card.qr`) | **A small library, loaded only when asked:** `qrcode-generator` (MIT, no dependencies), imported when a shot asks for a QR, so the app's first load does not grow. |
| IM31 | What the QR code links to | **A short view link:** the place, altitude and layers, without the item's 64-character address, so the code is small and sparse enough to scan from a phone when the card is shown small. The full address stays in the provenance. |
| IM32 | Where the QR code sits | **With the footer, right-aligned:** under the text on stacked cards, at the foot of the column on the wide sizes. It takes text room, so the picture gives a little, as for any line. |

## Close-ups, decided 2026-10-03

Asked when block I reached item 4, with what the kept notes hold. From one globe
radius, San Francisco's venue nights of 3 October, 20 at 16 venues inside
4.2 × 5.7 km, are one cluster of marks, and California's 29 heat towns overlap
on its coast. (Asked with "20 public venues inside 5.5 × 6.2 km": the extent
was the week's, 48 nights at 29 venues; corrected here.)
Starcom's own coastlines have 1 to 6 points across a city; its state lines have
307 for California, about 11.5 km apart. The owner chose the recommended
options:

| # | Question | Decision |
|---|---|---|
| IM33 | The square critical card with a QR code, refused by 7 px on a clean build too (the code's 128 px, not the caveats beside it, set the corner's height; only the 9:16's code read at a half and a third of full size) | **Keep the refusal.** It already says to make the 9:16, which has the room and the code that reads when shown small. Only crowded square cards are affected. |
| IM34 | What the close-up inset draws | **The item among its neighbours.** A public venue: the night's public venues within about 25 km, on a 1 km grid, the featured one ringed and named, a scale bar and the 150 m it is placed to; no coastline, too coarse at that scale. A heat town: the day's heat towns in its state, coloured by level, inside Starcom's own state lines, with a scale bar. |
| IM35 | Where the inset sits | **In the picture's corner away from the item,** framed, with a thin leader from the globe's mark. It takes no text room, so it refuses no card; the linter warns when it covers marks. |
| IM36 | When a card draws it | **Only when a shot asks,** `card.inset: true`, as for the QR code. Refused, saying why, for anything but a public venue or a heat town, and never drawn for an Intel Report. |
| IM37 | The heat-town inset drew only state lines, so land across a border read as sea (asked after looking at the first real cards; for California only a strip about 9 px tall is Mexico, for Texas, Arizona and Florida much more) | **Every country in view,** outlined from the territory index Raver Watch already holds, except the one whose states are drawn finer. A country is in view when one of its edges enters the inset's box, not when its bounding box does: Canada's reaches under California's at an island in Lake Erie. |

## Mecha Jono's briefing asks, decided 2026-10-04

Their report of 3 October, "Drawing the whole day" (their daily 9:16 briefing,
made entirely through the share handle), asked four things. Each was audited
against the code and, read-only, The Record before asking:

- A: `listReports()` gave 47–50 Intel Reports whatever the window; they published
  128 that day. The globe draws at most `maxReports` (50, `useCyberCommandSettings`),
  and the handle lists what is drawn, saying nothing of the rest.
- B: a replay sweeps the times of every report drawn (12 February to 3 October),
  so a 24-hour replay showed nothing. The comment above it promised a window the
  caller names; none was ever read.
- C: of their 193 notes since 2 October, 180 carry no `g` tag: 32 carry `geo`
  and are drawn, 148 say where only by jurisdiction (36 of them a US state, which
  the country index cannot draw at all), and none can be featured.
- D: all 72 `heat_risk` notes on The Record are plain Raver Watch notes, which
  HeatRisk draws; the bulletin they could not feature was most likely not drawn
  because HeatRisk was off. No decision: `whenReady` and `renderBatch` name the
  layer that would draw an address and why it is not drawn.

| # | Question | Decision |
|---|---|---|
| BA1 | `listReports()` capped at 50 | **Say it, and make the cap a real setting.** `listReports` says when the cap cut the list and how many matched. The cap becomes a setting for people (higher presets, a maximum, unlimited, a custom number: machines differ, and so do people) and for Mecha Jono through the handle (their machine can take the most). What fits on a card's text is a separate limit, the card's own. Reports at one place, or about one country, are grouped: a click opens a list of them, scrolling when long, to pick one, in the app and through the handle. Optional settings, in the app and the handle with a spec for Mecha Jono: Intel Reports coloured more by what they are, and a glyph of their own for each category or type. |
| BA2 | How a replay is bounded | **Named, else the set window:** `replay: { from, until }` when given; otherwise the timeline's window when one is set; otherwise the reports' own span, as now. The clip states the span it swept. |
| BA3 | Notes placed only by jurisdiction | **Both:** a report about a territory is listed and can be featured as that territory, its outline lit and the card saying it is about the place as a whole, never a pin; US states are drawn from Starcom's own state lines. And Mecha Jono is asked for a coarse `g` (4–5 characters) where an item has a real place. Then new kinds of area: continents, spheres (the Anglosphere), unions (the European Union) and zones (the East African Rift Zone), the zones ours to define. |
| IM38 | Type size per card (their reply to IM29) | **One step larger where it fits:** each card tries the larger type first and falls back to IM29's compact type when the larger would be refused, and says which it used. |

The report cap (BA1's first part, block J item 2), asked 2026-10-04 with what the
code holds: the globe draws at most `maxReports` (50) with no control for it, the
"Showing N of M" notice reports the cut, and the ingest reads at most the newest
200 reports of the past year and keeps that many. The owner chose the
recommended options:

| # | Question | Decision |
|---|---|---|
| BA4 | Where people set the cap | **In the notice and the layer's settings:** a small menu in "Showing 50 of 128", where the cut is said, and the same choice in the Intel Reports layer's settings, to set it before anything is cut. |
| BA5 | Which choices | **50 · 100 · 250 · 500 · Max · Unlimited · Custom:** Max is 1,000; Unlimited draws everything read; Custom takes any number from 10. |
| BA6 | Reading more than 200 | **Reading follows the cap:** above 200 the app pages through the relays, as Raver Watch does, and keeps that many; Unlimited reads everything of the past year. More data, only when someone asks for it. |
| BA7 | The default, and the handle | **50, and the handle per page:** people start at 50 and keep what they choose; `setReportCap(n \| 'max' \| 'unlimited')` lasts for that page only and is never saved, so an agent never changes a person's setting. |

Groups at one place (BA1's second part, block J item 4), asked 2026-10-04 after
territories were featured (J3). K8 had already chosen the menu itself: one at
the click, listing each member, shared by every layer that groups. What the
code held: Intel Reports within about 11 m are drawn as one glyph with a count
(`reportPlaces.ts`); a click opens the most severe in a popup whose
Previous/Next run on past the place into every report on the globe; no
territory outline can be clicked, so none of the 140 reports about a territory
could be opened from the globe. J3 also found every territory outline drawn
under the cloud shell. The owner chose the recommended options:

| # | Question | Decision |
|---|---|---|
| BA8 | Paging after a pick | **Within the group:** Previous/Next move through this place's reports only ("2 of 4 here"), with a "4 here" button back to the menu. |
| BA9 | Opening a territory's reports | **Click inside:** a click anywhere inside an outlined territory opens its menu, or its report when it has one; a glyph on top wins, as the nearer thing; hovering names the territory and how many it holds. |
| BA10 | Groups through the handle | **Groups listed:** each listed report carries `group: { key, size, kind: 'place' \| 'territory' }`; `listGroups()` returns each group with its members' ids, most severe first; `focusReport` and `renderShot` feature any member, and its card says "1 of 4 here". |
| BA11 | Outlines under the clouds | **Over the clouds:** every territory outline is raised over the cloud shell, as the war map's fills were. A close-up of a territory report (an exception to IM2) was not chosen. |

Colour and glyphs by category (BA1's third part, block J item 5), asked
2026-10-04 with what The Record holds: its 269 Intel notes, all Mecha Jono's,
say what they are about in a two-level `category:` vocabulary, ten top-level
words (conflict 136, charity 42, health 17, funding 15, civic 8, cyber 8,
safety 7, intel 5, world 4, remedy 4) and some fifteen sub-kinds, and 13 state
none. A glyph's colour says how the report was assessed. K3 had chosen the
Symbol registry (each meaning an icon and a hue) for block D. The owner chose
the recommended options:

| # | Question | Decision |
|---|---|---|
| BA12 | Where J5 is built | **Now, as K3's first slice:** the Symbol registry is begun with the Intel categories as its first entries, each meaning an icon (Lucide, or a mark on the 24-unit grid) and a hue; D's K3 extends the same registry to the bar, rail and HUD. |
| BA13 | What a report's category is | **Its stated top-level tag:** the publisher's own `category:` word, ten today, and "uncategorised" for a report that states none; a word not yet given a glyph gets a generic one until it is. |
| BA14 | What the setting changes | **Category emblems:** each glyph keeps its colour for the assessment and carries its category's icon inside it, so no hue changes meaning. |
| BA15 | The default, and the handle | **On, and the handle per page:** everyone sees the emblems unless they turn them off in the Intel Reports settings; the handle sets its page's look only, never saved, as the cap (BA7); `listReports` gives each report's category. |

New kinds of area (BA3's last part, block J item 6), asked 2026-10-04 after J5.
What the code held: Natural Earth's country data carries `CONTINENT` (seven,
and the open seas), `REGION_UN` and `SUBREGION` for all 242 territories, and
ISO codes; `@turf/union` and topojson are installed, so an area can be drawn
as one outline. The owner chose the recommended options:

| # | Question | Decision |
|---|---|---|
| BA16 | What areas are for | **Both:** a report can name an area as what it is about, listed, featured with the area lit and opened by a click inside it, as a territory is; and the globe and the handle can look by area, filtering what is listed and framing or briefing a card to one. |
| BA17 | How a report names one | **Prefixed codes:** `continent:africa`, `union:eu`, `sphere:anglosphere`, `zone:east-african-rift` in its `jurisdiction` tag, never mistaken for a country's code; a bare `eu` is read as the European Union too. |
| BA18 | Which areas first | **A full first set:** the seven continents from the map's own data; unions the EU, the African Union, ASEAN, the Arab League, the GCC and Mercosur; spheres the Anglosphere (the US, the UK, Canada, Australia and New Zealand), the Francophonie, the Hispanosphere, the Lusosphere and the Sinosphere; zones the East African Rift, the Sahel, the Horn of Africa, the Pacific Ring of Fire, the Golden Triangle, the Balkans, the Caucasus and the Levant. Each drawn as one outline, faintly filled when featured; a zone a shape drawn from cited sources. |
| BA19 | The order of items 6 and 7 | **The spec now, areas after:** Mecha Jono is told now how to use what items 1–5 added, while their briefing runs daily; areas follow with an addendum of their own. |

*BA18 as built, 2026-10-04.* The map's own continent field files all of Russia
under Europe, Siberia with it, and draws French Guiana as part of France. Taken
as it stands, Europe would have reached the Pacific. So the continents are the
map's own with two cuts: Russia at the Urals and the Ural River (a line Starcom
drew, approximate), and French Guiana given to South America. The Seychelles,
Mauritius and the Maldives, which the map files under the open ocean, are given
to Africa and Asia. Each continent's note says so, and `listAreas` gives it. The
owner can undo either cut by deleting its entry in `CONTINENT_SPLITS`.

Asked while item 6 was built, 2026-10-04. An area takes the click inside it, as
a territory does (BA9, BA16). At a continent's size, that took every country's
panel on the continent while such a report was drawn. The owner chose the
recommended option:

| # | Question | Decision |
|---|---|---|
| BA20 | A click inside an area or territory that has reports | **The menu adds the country:** the menu at the click lists the reports there and, last, the country under the pointer, whose panel it opens. A click that would open one report alone opens the menu when a country is under it. This also closes the gap countries with reports have had since J4. |

Areas as lenses (BA16's second half, item 6b), asked 2026-10-04 once areas as
subjects were live. The owner chose every recommended option:

| # | Question | Decision |
|---|---|---|
| BA21 | Which reports are in an area | **Where each stands:** a report is in an area when its place is inside the area's outline: its point, or the middle of the territory or area it is about. A report naming the area is in it by construction; one about Russia as a whole stands in Siberia, so it is in Asia. |
| BA22 | An area too spread out for one card | **Its main part, saying what is out:** a card frames the area's largest part and every part that fits with it, and says what is outside the frame, such as French Guiana. |
| BA23 | What a card about an area says | **The count and the most severe:** the area's name as the headline; how many Intel Reports are in it, by assessment; the most severe by title; the area lit; its caveats, edges approximate and members as of a date. |
| BA24 | Looking by area in the app | **Search finds areas:** the header search lists areas beside countries, and picking one flies there and lights its outline until dismissed. The report form's finder offers areas too. |

## Block D, decided 2026-10-05

Asked when block J was done. K1–K4, K16 and WC3 already said what D holds; these
say how it goes. The owner chose the recommended options:

| # | Question | Decision |
|---|---|---|
| BD1 | The order inside D | **Shell, glyphs, then screens:** the shell first (one ticker, a tight shell, the overlays into the dock, the 9999 and 10000 z-indexes retired), then Missions as one app, then phone navigation, then the glyphs of the bar, rail, quick access and HUD with the emoji guard. Then the screens: the HUD, the War & Conflict Brief panel, the report form, Cases, Missions. A screen restyled after the shell is not redone when the shell changes. |
| BD2 | Which tint each section takes (the tint in the frame only, 2026-09-26) | **A swatch sheet first:** candidate tints on the real gunmetal and header, each checked against the semantic colours so that no tint reads as a status. The owner picks per section before the first restyled screen lands. |
| BD3 | When EVA's semantic components are built | **Each where D needs it:** relay health, the capacity gauge and the job rail with the HUD; the distribution chip and the severity badge with the report form; the provenance frame ("what the source said" and "what I assert") with Cases; the status stepper with Missions. Each is built once and used everywhere after. |

Asked during step 1, 2026-10-05, when the layout audit measured the Globe's left side.
The bottom-left dock needed 425 px and the clock and minimap 180 px, so any window
under about 850 px tall ran the camera buttons over the minimap. That is most laptops
(1280×720 and 1366×768). The owner chose the recommended option:

| # | Question | Decision |
|---|---|---|
| BD4 | How the Globe's left side fits | **Rows, and coverage folded:** the camera buttons in one row, the mark-style label beside its buttons, and coverage folded to one line (the relays, the cells, and how many lines it holds back) that opens on a click. The bottom dock on each side also leaves the room the top dock's fixed slots take, so on a window shorter still, coverage scrolls rather than overlaps. Not chosen: rows only; the minimap hiding on short windows; the rule alone, with the layout left to D5. |

Asked at the start of step 3, 2026-10-05. The owner chose the recommended options:

| # | Question | Decision |
|---|---|---|
| BD5 | What the phone bar's Intel button opens (K2's five: Globe, Cases, Missions, Intel, More) | **A sheet of the three:** IntelDashboard, IntelAnalyzer and IntelWeb, each with its line of description. More holds NetRunner, MarketExchange and Support. Not chosen: IntelDashboard directly; the last intel app used. |
| BD6 | How the Globe's corner panels share a phone | **Folded by default on phones:** the key starts folded to its one line, as coverage does, and the report notes fold to one line too; each opens on a tap and scrolls inside its corner. The camera buttons and the mark style stay out. Desktop is unchanged. Not chosen: one HUD sheet; the key inside the Layers panel. |

Asked at the start of step 4, 2026-10-05. The owner chose the recommended options:

| # | Question | Decision |
|---|---|---|
| BD7 | Which mark the header's SVG is (K3's "the Starcom mark as SVG") | **The winged mark, traced to SVG:** the star, wings and chevrons the header's 60-frame GIF (305 KB) shows, as one static path in the brand cyan; a slow CSS glint may stand in for the animation. The wingless star (the pinned-tab icon, RaveLite's star-commander) stays the small icon. Not chosen: the wingless star everywhere; the GIF kept on desktop. |
| BD8 | How the glyphs of the bar, rail, quick access and HUD are chosen | **Picked, then reviewed on a sheet:** one Lucide icon per meaning, closest to what it means, published as a glyph sheet with two alternatives beside each; the owner swaps any, then it ships. Later swaps are one line in the registry. Not chosen: the owner picking every one first; shipping unreviewed. |

The owner reviewed the glyph sheet on 2026-10-05
(https://claude.ai/artifact/Gd6ENU2GyP3pCPDQyp3D1A):

| # | Question | Decision |
|---|---|---|
| BD9 | The glyphs, after review | **Swaps, and eight marks drawn for Starcom.** Intel (phone bar) Eye; Cyber Command Radar; national territories LandPlot; NetRunner Terminal; chat in stealth mode Ghost, in emergency mode a speech bubble with a warning; drug-check alerts Pill; Support Ops HandHeart; Rescue Rangers a cross; Scene events the vinyl record (Disc3); a report with no stated time a calendar with an X (an hourglass said waiting). Drawn on Lucide's grid where it had nothing fitting: Raver Watch a raver in headphones (Music is kept for the app's music later); Cyber Threats a chip with a warning; War & Conflict a tank, beside Conflict Zones' crossed swords (no firearms in Lucide, no rockets, which may later mean launches; a helmet did not read at 16 px); Ecological Disasters a volcano; Space Weather the solar wind crossing to Earth; the aurora its curtains of light over the horizon; the bow shock its arc before the planet; the cursor trail a pointer leaving dots. The rest as picked. |

The section tints, picked on the swatch sheet on 2026-10-05
(https://claude.ai/artifact/98xJUEv2KUpf1QuJPczHLp). The owner chose the recommended one
in every section (BD10). Each is a grey at chroma 0.075 or less, 8.5:1 or better on the
frame, used only in a section's frame: its header rule, its workspace name, its marker in
the navigation.

| Section | Apps | Tint (BD10) |
|---|---|---|
| Situation | the Globe | **Slate** `#ABB8D2`, oklch(0.78 0.04 265) |
| Collect | NetRunner, IntelDashboard | **Steel blue** `#92BDE2`, oklch(0.78 0.07 245) |
| Investigate | Cases | **Parchment** `#BFB89B`, oklch(0.78 0.04 95) |
| Assemble | Missions | **Brass** `#CAB680`, oklch(0.78 0.075 90) |
| Analyse | IntelAnalyzer, IntelWeb | **Jade grey** `#9FC0B3`, oklch(0.78 0.04 170) |
| Publish | MarketExchange | **Rose** `#D4ABB6`, oklch(0.78 0.05 0) |

Asked before the globe HUD of step 5, 2026-10-05. The owner chose the recommended options:

| # | Question | Decision |
|---|---|---|
| BD11 | Where relay health shows, and what "answered" means | **On the coverage line, and listed when it opens:** one light a relay (● OK, ◐ degraded, ✕ down, ◌ stale) on the folded line; opened, each relay with its light, its word and when it last answered. The ingest records when each relay last answered (an event, or the end of what it holds); no answer for two minutes is stale, and a light greys by itself. The ticker's count stays. |
| BD12 | What the capacity gauge measures first | **Relays answering against the two a publish needs** (the config's unused `MIN_RELAY_CONNECTIONS`): green with room to spare, amber at exactly two, red below, each with its word. Beside the relay lights. Publishing below it warns, as now, and is not refused. |
| BD13 | How much of the job rail step 5 builds | **A job registry and four jobs:** findings publish (the outbox), case publish, mission dispatch and bundle import. NetRunner runs and clip recording join later. Cancel only where a job can really stop; hold only for the outbox. |
| BD14 | Where the job rail sits | **The bottom bar's right end, on every screen:** a compact tile a running job, opening to its detail; nothing when nothing runs. On a phone, a count on the More button. |
| BD15 | How the distribution chip labels a record (step 7, asked 2026-10-05) | **Our word in TLP's colours:** PUBLIC, LIMITED or PRIVATE in TLP 2.0's white, green and red on its black chip; the TLP label and what the choice does in the hover. A record nobody decided on reads UNDECIDED, grey and dashed, which means not judged, and goes nowhere. |
| BD16 | Whether the report form asks for a distribution (reports were created with none, and asked only at export) | **Asked in the form, optionally:** the three choices with none picked, as cases and missions ask (D2), and "Decide later". The chip shows the choice, or Undecided; an export still asks when nobody decided. The intel-item form had Public chosen in advance, against D2, and now chooses nothing. |
| BD17 | How the form chooses severity | **Five buttons, each a badge:** Not assessed, Low, Medium, High and Critical side by side, each with its pips and word, so every level reads before it is picked. |
| BD18 | How far the chip and the badge reach in step 7 | **Every display, now:** the report screens (form, edit, page, list rows, the globe's popup and tooltip) and every other place a distribution or a severity was drawn: the cases list and a case's page, the missions list, received packages, IntelAnalyzer's inspector, intel items and the cases' priority chip. |
| BD19 | Where the provenance frame is drawn (step 8, asked 2026-10-05) | **Cases' records:** each linked report or intel item on a case's page, a case that came in a bundle (beside its "From" line), and each row of the cases list that came from someone else. Solid cyan is yours, dashed cyan a peer's, a yellow "?" unknown, a red diamond impersonation (MIL-STD-2525's frames). Reports and missions take it as their screens are restyled. |
| BD20 | How a case's page takes "what the source said" and "what I assert" | **Two labelled columns:** on wide screens, "What the sources said" (linked evidence, contradicting evidence) on the left and "What I assert" (the position, what is still needed, the missions built from it) on the right; stacked in that order on phones. |
| BD21 | When the red diamond is drawn | **Only where it can be shown:** a record that names an author other than the key that signed it, as a received package's "Says it is from" beside "Signed by". Never on a guess. A report read from a relay cannot impersonate: its author is the key that signed it. |
| BD22 | How much of Cases step 8 restyles | **All of Cases:** the list, a case's page and their dialogs, onto the tokens, the type pairing and glyphs, and checked on a phone. |
| BD23 | The order of work after step 8 (asked 2026-10-05) | **Step 9, then the owner's list:** Missions first, finishing block D; then the sound glyphs (added by Mecha Jono's dev AI) on the glyph sheet for review; then one consolidated spec and schema for Mecha Jono; then the weather work (a shader heat map, real clouds, wind flow). Hero Watch waits for its spec sheet. |
| BD24 | How a status looks: the stepper, and one status chip in place of each app's colour map | **Meaning colours with shapes:** working states plain with an open ring; waiting states amber with a half ring (On hold, Packaged); done green with a check (Approved, Resolved, Dispatched); closed or archived grey with a filled square. The stepper marks passed steps with a green check, where it stands with a cyan ring (selected), the rest hollow grey. Cyan is never a status. |
| BD25 | When a received package's "Says it is from" is an impersonation | **A key, or a known name:** the red diamond when the claim is a key other than the signer, or a name already known to belong to another key (from a roster, a collaborator or a bundle). A name nobody here knows gets the yellow "?". |

## Imaging and viewing, decided 2026-10-02

Asked after War & Conflict was built: how the new layers are viewed and shared,
and how much control Mecha Jono has over the images it posts. The owner chose
every recommended option. The design is in the globe record, section 21.

| # | Question | Decision |
|---|---|---|
| IM1 | How Mecha Jono controls shared imaging | **One shot spec.** One declarative shot drives the screen, deeplink v2, the card and the clip. A dry run says what is in frame and warns before a render. v9's `focusEvent`, `composeFor`, `frameArea` and `renderMission` are thin wrappers. The guardrails cannot be overridden, and every card carries its shot. |
| IM2 | Close-ups of missions, public venues and heat towns, which are dots from one globe radius | **Locator plus inset.** The globe stays at one radius or above; a 2D inset draws the item's own geometry (a mission's area, objectives no finer than 1 km, venues, heat towns) with a scale bar, without tiles or network. Never for Intel Reports. This settles the framing-floor question section 18, item 4.1 left open. |
| IM3 | Which viewing experiences to build | **All four:** briefing playlists, the theatre lens and war depth, Raver nights, and trust and reach. |
| IM4 | When | **The core in weeks 2–3** (Oct 5–18): the shot spec, card templates, close-ups, the linter, golden cards and alt text. The viewing experiences go in G and H. D still starts Oct 19; what does not fit moves to G, not into D's weeks. |
| IM5 | Badge tones: Mecha Jono asked for seven hues | **Our tokens plus a glyph.** Critical intel in danger red and actionable intel in caution amber, the meanings they carry already; mission, field mission, brief and declassified on gunmetal badges with their own glyph and word; Raver Watch keeps its violet. No new hues. |
| IM6 | A vertical 9:16 format | **Composed, not cropped:** the shot frames it, the globe low with a title band above and the facts below, for clips and stills. |
| IM7 | When the asks go to Mecha Jono | **With the shot spec draft,** as one comment on their handoff doc: who made each casualty claim, links from a report or package to the war item it is about, mission geometry encoding, and per-theatre changes in the brief. |
| IM8 | Which experience comes first after the core | **Briefing playlists,** which are the auto-tour, and render Mecha Jono's daily brief clip. |
| IM9 | How a share card frames the planet by default, chosen from six rendered cards on a comparison page | **The view for a card about one item, the planet for a card about none.** An item card shows what the camera framed, cut to the card's shape, the subject large; a camera view, a front page or a playlist's opening shows the whole planet. Any shot can ask for the other. |
| IM10 | Where a card's badge and headline go | **In a band under the picture.** The picture stays clean and full width; the badge, a large headline and the key facts sit below it, readable at Discord's 400 px preview. |
| IM11 | How caveats read on a card (every one that applies stays, decision D-F) | **Short form, small, muted:** each in one short sentence in the strip's last block. The full wording stays in the image's provenance. |
| IM12 | What a card's key shows | **Only the layers drawing in the picture,** as their swatches with short labels; no explanatory sentences, which stay in the app's key. |
| IM13 | Whether cards carry a QR code to their view | **Off unless a shot asks** (`card.qr`): for images reposted where links do not survive. The share button's cards have none. |
| IM14 | Who decides a card's badge | **The item's role, else the shot.** An item that carries its role (War & Conflict items do: critical, actionable, context) gets that badge, and a shot asking for another is refused with the reason. For families Starcom does not read yet, the shot's template sets the badge and the provenance records that the shot chose it, until H's ingest brings their roles. |
| IM15 | How cards reach Discord's 1280×800, Mecha Jono's "wide" | **A new `embed` preset.** `wide` stays the 1200×630 link preview, so the share button's previews and every existing shot are unchanged. |
| IM16 | What the War & Conflict Brief card shows | **A front page by theatre:** the planet framed on the day's items with War & Conflict on, headed "War & Conflict Brief" and the date; its facts are how many items there are and each theatre with its count, worst first. The item-by-item story is the clip (briefing playlists, block G). |
| IM17 | When cards with no globe are built (declassified, items naming no place) | **With the Interchange ingest, in H.** A card of type alone needs the item's text from Starcom's own read of it. Until then `declassified` is refused with that reason. |
| IM18 | The type on the composed 9:16, chosen from two options rendered on three real cards | **The smaller step, for more planet:** headline 48 px at most two lines, body 24, caveats 20, footer 18. The pictures came out 1,114–1,150 px tall, about 100 px more than the larger option's. My first sizes left two of the three cards too little picture, and they were refused. |
| IM19 | The order of block I's last three items, once the shot spec was built | **6, then 5, then 4:** the shot spec draft and the four asks went to Mecha Jono first (posted 2026-10-03), then trust and reach, then close-ups, whose missions wait on the answer to ask 3. |
| IM20 | What a shot's `time.at`, a moment, does | **Pause there, sun there:** the shot pauses the shared timeline at that moment, as a person pausing it would (one cursor, D-E), and the sun lights the globe for that moment. |
| IM21 | Where golden cards' references live | **Small copies in the repo:** each a ~400 px WebP with its full text as JSON, beside the kept notes in the imaging docs; about 1 MB for 20 cards. |
| IM22 | When a golden card matches | **Text exact, picture close:** the card's words (its alt text and every line) exactly; its picture within a small difference on a downscaled copy, since SwiftShader and Chrome updates shift pixels. |
| IM23 | Motion in captures (pulsing glows, cloud drift, space-weather shaders) | **Still in every capture:** each card and clip frame holds glows at rest, and clouds and space weather at the moment's phase, so the same shot makes the same picture. The globe on screen keeps moving. |

## Limited work and team relays, decided 2026-10-19

Found by the audit of the build plan against the code (intern-readiness-plan.md, "Status, audited 2026-10-19"):
work marked Limited went only to the build's internal relays, never to a team relay someone had joined. The owner
chose the recommended option.

| # | Question | Decision |
|---|---|---|
| LW1 | Should Limited work also reach joined team relays? | **A team relay the person picks.** The review lists the person's joined team relays beside the internal ones as Limited destinations, and they pick which; nothing reaches a team they did not pick. Rejected: internal relays only (as it was), and every joined team relay at once. **Built 2026-10-19:** a mission or case keeps the team relays its author ticked under Limited (`limitedTo`); `relaysFor` adds those still joined here to the internal relays, so leaving a team stops what goes there; missions and findings are read on joined relays, so the team receives them; a bundle never carries the picked teams, and takes none in. |

