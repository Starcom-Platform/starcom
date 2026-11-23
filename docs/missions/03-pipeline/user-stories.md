# People, and what they need to do

> **For what holds now, run `npm run audit:intern` against a build** (plan
> item V1). It walks each story below, and the chat stories, the way the
> person would, and prints its status. The statuses in this file are the
> record of the walk on 2026-09-25, kept so what changed can be seen.

Rewritten 2026-09-25 for the intern cohort arriving in a few months. The August
version described three people and four stories framed around "Sprint 1 builds
mission assembly". Mission assembly now exists, so those stories no longer say
where the pipeline breaks. This version was written by using the production
build as each person would, at 1366 × 768 with a fresh browser profile. Each
status below is what happened on screen; where a cause is named, it was then
found in the code. The findings, the evidence and the plan are in
[`../04-plan/intern-readiness.md`](../04-plan/intern-readiness.md).

## What changed about the people

The August profiles mapped Intern, Cadet and Archangel Knight onto
`TeamMember.role` and clearance levels. Both are gone: roles and permission lists
were removed on 2026-09-13 because nothing could enforce them in local-first
storage, and the clearance tiers were purged as security theatre. The only
authority that is real is signed — a mission's dispatch delegation. So the
profiles below describe what a person needs, not a role the code checks.

The three original people stay. Three are added, because an intern programme
does not work without the person who trains and reviews interns, and because two
conditions cut across every role: needing to work without a mouse, and being an
AI agent rather than a person. Per this project's rule, a restriction describes
the work, never the actor, so the AI operator meets the same rules as everyone.

## The people

| Who | Where they are | What they need from Starcom |
| --- | --- | --- |
| **Priya — intern, first weeks** | New to intelligence work, capable, careful. On a 1366 × 768 laptop. Reads every label literally. Worried about making a public mistake. English may be her second language. | An obvious first step. Plain words. Her name on her work. A way to join her team. Safety nets: drafts, a preview before anything leaves, undo. |
| **Marcus — cadet analyst** | Months in. Works across many reports and cases a day. Wants speed. | Search that finds records. Keyboard flow. Counts he can trust. Moving from a report to a case to a mission without hunting. |
| **Aisha — team lead (Archangel Knight)** | Turns cases into missions, gives objectives to interns, publishes packages. | Assigning work to named people. Seeing who is doing what. Knowing exactly what a package will say before it goes out. |
| **Dana — trainer and reviewer** | Runs training exercises. Reviews intern work before it is published. | A practice environment where nothing leaves the building. A review step before anything public. A view of what each intern did. |
| **Sam — works without a mouse** | Keyboard only, sometimes a screen reader, colour-blind, zooms to 200 %. Any role above. | Every action reachable by keyboard, every control named, no meaning carried by colour alone. |
| **Mecha Jono — the AI operator** | Files reports, reads and publishes packages, drives captures. Counts as a user. | The same verbs a person has, through the share handle and the protocol, under the same rules. |

## The stories, walked on 2026-09-25

Status is what the screen did:

- **WORKS**: the person can do it without help.
- **HIDDEN**: it works, but nothing leads the person there.
- **PARTIAL**: it can be done, but with a trap or a workaround.
- **BROKEN**: the screen fails.
- **MISSING**: there is no way to do it.
- **UNSAFE**: it can be done, and doing it the obvious way causes harm.

### Arriving

| # | Story | Status | What happened |
| --- | --- | --- | --- |
| S1 | Priya opens Starcom and understands what it is for and where to start. | PARTIAL | The guide to the pipeline is collapsed into a pill reading "🎯 Pipeline · 4 left". What fills the screen is relay telemetry ("PROBE 0/6 OPEN", "0/0 MPM"), a ticker repeating "needs an EIA key", 18 icon-only buttons down the two rails, and a SELECT WALLET button. |
| S2 | Priya's work carries her name. | MISSING | A new report says "Author: anonymous". Elsewhere a person is a 64-character hex key. There is no screen to set a display name. |
| S3 | Priya joins her team with the invite code her lead sent. | MISSING | Invite codes are generated and signed, and the dialog tells the lead the new member will "redeem it to join". Nothing in the app accepts a code: `resolveInviteCode` has no caller outside its service. |
| S4 | Aisha creates the team. | HIDDEN | Possible only from OpsCenter → Admin → INVITE NEW MEMBER, where a team-name field appears when no team exists. Overview says "No registered teams yet.", Operatives says operatives "will appear here once a team is created", and Chat says "Create a team first to start chatting." None of them offers a button. |
| S5 | Dana sets up a practice run where nothing leaves the building. | MISSING (config only) | A build can publish only to a private relay (`VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE`), and the mission screen then says "Safe to practise on". The deployed app publishes to five public relays, and no practice deployment has been set up. |

### Reports

| # | Story | Status | What happened |
| --- | --- | --- | --- |
| S6 | Priya writes a report about a place without knowing its coordinates. | PARTIAL | Location is two number boxes, Latitude and Longitude. No place search, no "pick on the globe". |
| S7 | Priya says how serious the report is. | PARTIAL | The create form has no field for it. Edit has Priority: ROUTINE, PRIORITY or IMMEDIATE. The globe draws a report as critical, actionable, standard or raw, taken first from a hashtag like `#critical` that she cannot know to type. Cases use LOW, MEDIUM, HIGH or CRITICAL. That is three vocabularies on screen for one idea. |
| S8 | Priya fills in the form and knows what is required. | PARTIAL | Every field is labelled only by a placeholder that disappears when typing. Create stays disabled until both Title and Content are filled, and nothing says so. |
| S9 | Priya submits her report for review. | PARTIAL | Status controls exist only at the bottom of Edit, as raw codes: SUBMITTED, REVIEWED, APPROVED, ARCHIVED, all offered at once. The help text says "only valid forward transitions are enabled", but all four are offered. An author can approve their own report. |
| S10 | Marcus starts a case from the report he is reading. | MISSING | The report says "Not yet used by any case or mission." and offers View on Globe, View in IntelWeb, Export and Edit — no way to add it to a case. He has to go to Cases and search for it. |

### Cases

| # | Story | Status | What happened |
| --- | --- | --- | --- |
| S11 | Marcus opens a case to work on it. | BROKEN | Clicking a case, or its eye icon, starts a reload loop. The list blanks to a spinner, flashes back and blanks again for as long as the page stays open; a progress bar was present at every check over 25 seconds, and no case ever opened. `useCaseManager.loadData` depends on `selectedCase` and sets it on every run, so each run starts the next. There is no case page to open even without the loop. |
| S12 | Marcus attaches evidence, records what is still needed, and states a position. | HIDDEN | All of this lives in a dialog opened by a chain-link icon labelled "Connections". Inside it, the two "Still needed" text boxes are crushed to about 24 px wide, and "Where" asks for a geohash. |
| S13 | Priya's first case is on screen with no search typed. | BROKEN | An empty case list says "No cases match your search criteria — Try adjusting your search or filters" with a CLEAR FILTERS button. |
| S14 | Marcus deletes the wrong case by mistake and gets it back. | UNSAFE | The red trash icon in each row deletes the case, its position and its links in one click, with no confirmation and no undo. |

### Missions

| # | Story | Status | What happened |
| --- | --- | --- | --- |
| S15 | Aisha builds a mission from a case. | HIDDEN | "BUILD A MISSION FROM THIS CASE" works and lands in OpsCenter with the case attached. It exists only inside the "Connections" dialog. |
| S16 | Aisha gives an objective to Priya. | PARTIAL | "Claimed by" is free text: no list of team members, no notification to the person named. |
| S17 | Aisha links the report an objective rests on. | PARTIAL | The field asks for a "report or finding id". |
| S18 | Sam opens a mission with the keyboard. | BROKEN | A mission in the list is a `div` with a click handler, not a button: Tab never reaches it. |
| S19 | Aisha moves the mission forward and understands each step. | PARTIAL | Buttons read "MOVE TO READY_FOR_PACKAGE". The mission's source-quality note is a four-sentence paragraph. |
| S20 | Aisha sees exactly what will be published before publishing. | UNSAFE | A ready mission warns that this build publishes to public relays, lists them, and says the package cannot be recalled. Then "PUBLISH TO NAVCOM" publishes on one click, with no preview of what will be sent and no confirmation. New missions and cases default to "Public". Coordinates are masked everywhere. The title gets no name mask, so "Newark DE" or "12 Main St" in a title crosses as written. The briefing and objectives also mask any two capitalised words in a row, which catches "Main St" but not a one-word place such as "Newark" or an all-caps one such as "DE". The builder's own comment says closing this needs "an operator-facing preview of exactly what will cross", which was never built. |
| S21 | Dana approves Priya's mission before it goes public. | MISSING | No review step exists. |
| S22 | Priya's publish fails and she understands what happened. | PARTIAL | The message lists five raw websocket errors, then says the mission stays at PACKAGED and to use Retry Publish. Retry is offered, but so is "MOVE TO DISPATCHED", so the record can say it was dispatched when nothing left. |
| S23 | Aisha removes an objective. | UNSAFE | One click on a trash icon placed beside the completion checkbox, no confirmation. |

### Finding, sharing and coming back

| # | Story | Status | What happened |
| --- | --- | --- | --- |
| S24 | Marcus finds a case, mission or report by name. | MISSING | The header search finds countries and a hard-coded list of apps and commands, never records: typing "mission" with a mission saved shows nothing. The list includes "Operation Firewall — Active investigation: Network breach", an investigation that does not exist, and "/search — Search across all data sources", which only writes to the browser console. |
| S25 | Priya's case is visible to Aisha on her own laptop. | MISSING | Reports, cases and missions live in each browser's IndexedDB. The team service only publishes, so one device never sees another's cases or missions. Only what is published to the network crosses. This is structural, and it is a decision, not a fix. |
| S26 | Marcus acts on a Mission Package another node sent. | PARTIAL | The package opens as a wall of text with a raw JSON block. The only action is "OPEN A CASE ABOUT THIS": no claiming an objective, no reply, no showing its report on the globe. |
| S27 | Priya comes back the next day and her own report looks normal. | BROKEN | Her own report is drawn faded, and the globe calls it "1 mark from an earlier session … drawn faded until it arrives again". A report made on this device never arrives again. |
| S28 | Marcus uses IntelAnalyzer's Entity Review to judge whether two records are one organisation. | BROKEN | Each pair is two bare numbers, like `31570010000000034433 ~ 31570010000000033463 — 97% match`, with SAME ENTITY / DIFFERENT buttons and no names. |
| S29 | Anyone learns what a term means: Navcom, adjudicated, geohash, READY_FOR_PACKAGE, relay. | MISSING | There is no glossary, and tooltips are inconsistent between the two places each app is defined. |
| S30 | Mecha Jono does what a person can. | PARTIAL | Contract v7 covers reports, framing, featuring, describing and clips. It has no verbs for cases, missions, claiming an objective or replying to a package. |
| S31 | Aisha reports back on Priya's mission, and Priya settles her report. | WORKS (walked 2026-10-23) | A mission made in Starcom asked for no counts and its publisher named no inbox, so no report could reach them (MX32). Walked by `npm run audit:intern`. |
| S32 | Priya publishes her report, and Aisha reads it on her own laptop. | WORKS (walked 2026-11-20) | A report had no working way out: the Exchange sent only its title and a checksum, by way of IPFS, which nothing pinned. Decision D-RP: Publish on the report sends the report itself as a note, through the review. Walked by `npm run audit:intern`. |
| S33 | Priya withdraws her report, and it leaves Aisha's dashboard. | WORKS (walked 2026-11-20) | A public note cannot be recalled, and nothing in the app could take a report back. Decision D-RP, RP7: Withdraw sends a deletion request and a notice in the report's place; every Starcom reader takes the report off. A copy someone already took stays. Walked by `npm run audit:intern`. |
| S34 | Dana, whose key is locked, publishes a Mission Package. | WORKS (walked 2026-11-21) | The unlock prompt sat outside the mission dialog, whose focus trap took every keystroke: a locked key could not be unlocked there, and no package could go. It is a dialog of its own now, stacked above (D-KL); the post-quantum signing key is kept sealed to her key (KL7). Walked by `npm run audit:intern`. |
| S35 | Priya publishes a report on a train with no connection, and it goes when she is back. | WORKS (walked 2026-11-21) | Only findings waited for a relay. A report published with no connection failed with "No relay took it", and nothing was kept. Work package W1: the note, signed after its review, waits on this device with the relays the review named; the report says it waits and can cancel it; it goes by itself when the connection returns, with no second signature. Walked by `npm run audit:intern`. |
| S36 | Priya publishes a Mission Package with no connection, and it is dispatched when she is back. | WORKS (walked 2026-11-22) | A package no relay took stayed Packaged until someone pressed Retry Publish, under a line of raw websocket errors (S22). Work package W1c: the package, as signed, waits on this device; the mission says so in place of Retry Publish, with Cancel; it goes by itself when the connection returns, and the mission is dispatched with that send's receipt. Walked by `npm run audit:intern`. |

## The edge cases the stories must survive

Each is a condition, not a separate story. The pipeline should hold under all of them.

- **Relays unreachable.** Everything local must keep working, and every screen that depends on the network must say so plainly, once. Today the offline globe shows three different relay counts at once: "1/6 UP", "0 of 6 relays connected" and "relays answering: 0 of 6".
- **An empty workspace.** The first screen of every app is an empty state. Today they range from correct (Missions) to wrong (Cases) to debug output (IntelAnalyzer: "Events loaded: 0 / Selected: None / Histogram brush active").
- **Long titles.** Network reports arrive with titles up to 280 characters, the cap ingest applies. The report detail already crushes a 49-character title to one word per line beside its buttons.
- **The smallest laptop.** At 1366 × 768 the report editor's Delete / Cancel / Save row sits on the bottom edge.
- **A key the person did not ask for.** Creating a first case or mission mints a signing key and opens a panel mid-task, with "Delete it" as one of its three buttons.
- **Browser data cleared, or a new laptop.** The key and every local case and mission are gone. The key panel warns about the key; nothing warns about the workspace.
- **A report with no place,** or only a jurisdiction. The model supports it, and the pipeline must not treat it as an error.
- **Contradicting evidence, and closing without a conclusion.** Both are supported on purpose. They must stay reachable and explained.
- **A mission with no case.** Allowed on purpose. It must not look broken.
- **Counts that disagree.** A mission card says "0 reports" while its detail says "1 report behind this mission". Admin says "Active Investigations: 0" beside an open case. The page held "TOTAL 41" and "TOTAL 0" for the same count at once. A newcomer trusts none of them after the first contradiction.
- **Two copies of the same app definition.** App names, icons and tooltips are defined once in the router and again in the bottom bar, and they disagree.

## The August version

Older plans cite this file's August stories by number: "Story 3", Aisha
assembling a Mission Package, was Sprint 1's goal. Read that version with:

```sh
git show 9972311c:docs/missions/03-pipeline/user-stories.md
```

Its advice not to build a rank or progression system still stands. The mapping
it suggested instead, onto `TeamMember.role` and clearance levels, does not:
both were removed, as described above.
