# Intern readiness: Intel Report → Case → Mission Package

Audited on the evening of 2026-09-25 (US Central), build `9972311c`. Written for
the team preparing Starcom for the intern cohort. The people and the stories this
plan is measured against are in
[`../03-pipeline/user-stories.md`](../03-pipeline/user-stories.md). That file also
gives each story's status, which is the scoreboard for this plan.

This builds on [`intel-case-mission-ux.md`](intel-case-mission-ux.md) (2026-09-20),
which made the pipeline's records carry real work: objectives with a hand-back,
effort and evidence link, and cases that state a position. That plan asked what
the records need. This one asks whether a newcomer can use them.

## How this was done

The production build was driven the way an intern would use it: fresh browser
profile, 1366 × 768, clicking through report → case → mission → publish. Two
passes were made:

- **Offline:** every host but localhost blocked, so nothing could leave. This
  pass created a report, a case and a mission, and pressed publish.
- **Online:** a brand-new profile that only looked. Outgoing Nostr events were
  refused at the socket.

Findings were seen on screen, then traced to the code. A few cannot be seen on
any screen, such as a function nothing calls; those come from the code, and say
so. The app's clocks in the screenshots read 26 Sep because they show UTC.

This is a dated snapshot, not a status page. Plan item V1 turns the walkthrough
into a script that re-derives these statuses. Until then, re-run the steps
rather than trusting this list.

## The short version

The pipeline exists end to end, and parts of it are thoughtful: the case
position, the source-quality note, and the dispatch delegation. But an intern
meets it through four problems that have to be fixed before a cohort arrives:

1. **Publishing is one click, public, and irreversible.** The mission warns that
   it goes to public relays, but Public is the default, there is no preview and
   no review, and a place name or street address in the title crosses as
   written.
2. **The case flow is broken and hidden.** Opening a case starts a reload loop
   and never opens it. The real case workspace sits behind a chain-link icon
   called "Connections".
3. **Teams are a dead end.** Invite codes cannot be redeemed, team creation is
   buried in Admin, and cases and missions are not shared between teammates'
   machines at all.
4. **The screens talk to developers, not to interns.** Raw enums, hex keys, raw
   JSON, relay telemetry, debug output, hundreds of emoji and paragraphs of
   epistemology stand where a label, a name or an icon should be.

## Findings, by the questions asked

### 1. Do the buttons make sense?

- **Named for the wrong thing:**
  - "Connections" is the case's whole workspace: evidence, position, what is
    still needed, build a mission.
  - "View" opens nothing and blanks the list.
  - "PUBLISH TO NAVCOM" names a partner system interns will not know.
  - "SELECT WALLET" is a crypto wallet, and it is the most prominent button in
    the header.
  - "REFRESH" reloads a local list.
  - "STATE" and "RAISE".
  - Two buttons are named only "Open".
- **Raw codes as labels:** "MOVE TO READY_FOR_PACKAGE", and report status buttons
  SUBMITTED / REVIEWED / APPROVED / ARCHIVED.
- **Dangerous neighbours:**
  - Delete-case sits in the same icon row as view and edit, with no
    confirmation.
  - Remove-objective sits beside the completion checkbox, with no confirmation.
  - "Delete it" is one of three buttons on the signing-key panel that appears
    mid-task.
- **Buttons that lead to parallel, older systems:**
  - The globe's right rail opens a "Cyber Investigation Hub" with its own
    investigations, "Intel Packages" and teams. Its "Active Investigations"
    count reads 0 while a case is open. From the code: its Intel Packages
    screen saves a made-up "APT29 Infrastructure Analysis" package the first
    time it opens, and creating a real one needs a wallet that cannot connect.
  - An "Intelligence Dashboard" popup shows "0 INTEL PROCESSED · 0% QUALITY
    SCORE · INTELLIGENCE SYSTEM READY".
  - The command palette offers a "Mission Control" panel: a second, smaller
    view of the same missions OpsCenter shows, under another name.
- **The header, on every screen:** Store, Discord, Telegram (labelled "Secure
  Communications"), GitHub, a chat icon and the wallet — six buttons, none part
  of the work.

### 2. Is everything that is built actually visible?

No. Built, but out of reach or out of sight:

| Built | How a person finds it today |
| --- | --- |
| Redeeming a team invite code (`resolveInviteCode`) | They cannot. No screen calls it. |
| Creating a team | OpsCenter → Admin → INVITE NEW MEMBER, then a field inside that dialog. |
| The case workspace: evidence, position, still-needed, build a mission | The chain-link icon, "Connections". |
| Report status and review | The bottom of the Edit form. |
| Practice publishing to a private relay | Only as a build setting. The deployed app publishes to public relays. |
| The pipeline guide | Collapsed into "🎯 Pipeline · 4 left". |
| Acting on a received Mission Package | One verb, "Open a case about this". Claim, reply and see-on-globe do not exist. |
| A person's display name | No screen. People are "anonymous" or a hex key. |

### 3. What obvious things can people not do?

- Start a case from a report they are reading.
- Open a case and read it as a page.
- Find a report, case or mission by typing its name.
- Join the team they were invited to.
- Share a case or a mission with a teammate on another machine. **This is
  structural:** the workspace is stored per browser and the team service only
  publishes. See decision D1.
- Pick a place on a map, or search a place by name, for a report's location.
- Give an objective to a named teammate and have them hear about it.
- Preview what a package will say before it is published.
- Ask a reviewer to approve before something goes public.
- Undo a delete.

### 4. Where does the experience fail?

- **The case loop:** clicking a case blanks the list to a spinner, flashes it
  back and blanks it again, indefinitely, and the case never opens. `loadData`
  depends on the selected case and sets it every run, so each run starts the
  next (`useCaseManager.ts`).
- **Wrong empty states:**
  - Cases says "No cases match your search criteria — Try adjusting your
    search or filters" when there are simply none.
  - IntelWeb says to "Publish one from NetRunner, IntelAnalyzer, or the Intel
    Dashboard" and gives no way to get there.
- **Counts that contradict each other:**
  - The mission card says "0 reports" while its detail says "1 report behind
    this mission".
  - The globe says "missions resting on evidence: 1 of 1" above "3 unclaimed
    objective(s) … rest on nothing this globe can draw".
  - The top bar shows "1/6 UP" while the note below says "0 of 6 relays
    connected".
  - The page held two different values for the same count at once ("TOTAL 41"
    and "TOTAL 0"; "0/6 UP" and "1/6 UP"). The strip draws both of its scrolling
    copies from one list, so the second value most likely comes from the STATUS
    panel's own copy of the same data, sampled at another moment. This needs a
    browser repro before the fix.
- **A record that can lie:** after a failed broadcast the mission sits at
  PACKAGED and still offers "MOVE TO DISPATCHED".
- **Interruptions:** creating a first case opens a technical panel about signing
  keys, with a hex key and a delete button, in the middle of the task.
- **Own work treated as stale:** a person's own report is faded "until it arrives
  again", which a local report never does.
- **Help that contradicts behaviour:** "Only valid forward transitions are
  enabled here" above four buttons offering every status.

### 5. Where is the interface hard to use?

- **Three visual languages:**
  - Cases is white Material UI cards on black.
  - OpsCenter is cyan HUD.
  - NetRunner is a terminal ("OSINT_SCANNER", "RESULTS_DISPLAY_AREA ::").
- **Placeholder-only labels:** in the report form they vanish when typing.
- **Crushed layouts:**
  - The report detail wraps a title one word per line beside five buttons.
  - The case's "Still needed" boxes are about 24 px wide.
- **Unreadable identifiers:**
  - People are 64-character hex keys.
  - A received package shows a raw JSON block.
  - IntelAnalyzer's Entity Review asks a person to judge
    `31570010000000034433 ~ 31570010000000033463` with no names.
  - Single-source claims list `headquartersCity: Q169376`.
- **Inputs that ask for machine formats:** coordinates, a geohash, a "report or
  finding id".
- **Dates:** date pickers show US `mm/dd/yyyy` and a 12-hour clock beside a "Z",
  in an app that states times in UTC.
- **Keyboard:** a mission in the list cannot be reached with the keyboard.
- **A placeholder ships:** "Geo (placeholder) ADD PLACEHOLDER GEO AREA".
- **A search that invents:** the header search offers "Operation Firewall —
  Active investigation: Network breach", which does not exist.

### 6. Where should text become an icon, a symbol or a small visual?

| Today, as text | Instead |
| --- | --- |
| "1 report behind this mission, across 1 independent feed — nothing corroborated. Nothing known of the sources. All evidence is graded …" (four sentences) | A row of three chips — **Reports 1 · Feeds 1 · Corroborated 0** — plus a source-quality meter. The explanation moves behind a "?" link. |
| COVERAGE panel: five lines of "label: n of m" | Five small gauges with icons, each with its full sentence as a tooltip. |
| Status strip: "NOSTR RELAYS: 1/6 UP \| PROBE 0/6 OPEN", "NOSTR INGEST: SEEN 0 \| ACCEPT 0 \| DROP 0", "INGEST RATE: 0/0 MPM" | One network dot (green, amber or red) with a phrase such as "Connected to 4 of 6 sources". The detail stays in the STATUS panel. |
| Mission status as a word and "MOVE TO …" buttons | A five-step stepper — Draft → Planning → Ready → Packaged → Dispatched — with the current step lit and one "Next" button. |
| Report status buttons SUBMITTED / REVIEWED / APPROVED / ARCHIVED | The same stepper pattern, for reports. |
| "unclaimed" as text on every objective | A person icon, empty or filled with the claimant's initials. |
| "Audience worked out here from the record, not stated by the publisher." on every opportunity card | A small "inferred" icon with that sentence as its tooltip. |
| "0" drawn as a boxed "Ø" on the Exchange | The number 0, greyed. |
| 494 emoji and pictographic symbols (325 of them emoji) in the source of 78 pipeline, HUD, globe and NetRunner files | The SVG glyph set the iconography directive already specifies. |

### 7. Where is the wording fluffy, clever or indirect?

The app's commitment to stating what it does not know is right, and it should
stay. But much of the wording states it as an essay, a paradox or an aside to
the developer. Some of the worst examples are recent: the opportunity board's
copy was written on 2026-09-23.

| Where | Today | Plainer |
| --- | --- | --- |
| Case position | "Not yet adjudicated. A case with evidence and no position is a folder." | "No conclusion yet. Add one when the evidence supports it." |
| Mission sources | "Nothing known of the sources. … That is expected of a first-hand account from someone new, and it is not a verdict on the mission — only on what is known of who it came from." | "Sources not yet graded." (details behind "?") |
| Dispatch authority | "Being a collaborator does not confer the authority to publish this mission. That is delegated explicitly, signed, and can be checked by anyone." | "Only people you authorise can publish this mission. Authorise someone ▸" |
| Admin | 82 words on local-first authority and Mecha Jono's relay node | "Automation rules are coming. Team permissions work through signed authorisations — see Help." |
| OpsCenter overview | "…there is no project or chat backend wired up. These sections will activate once that data exists." | Remove the section until it exists. |
| Opportunity board | "Work that may carry a reward, indexed free. … Nothing here states an amount, an eligibility or a promise — those are the programme's to make, not ours." | "Paid-work leads from the reports we hold. Amounts and eligibility are set by each programme." |
| Opportunity board, empty | "No record currently held routes to an audience. This says what has arrived, not what exists — the board fills as intel does." | "No leads yet. They appear as reports arrive." |
| Case replay | "This case has no activity log. That is not the same as nothing having happened to it — the record is absent, so nothing here can be reconstructed." | "No history recorded for this case." |
| Refutations | "No refutation received. Not the same as agreement — a claim nobody has contested may be one nobody has read." | "Nobody has disputed this yet." |
| Mission list, empty | "No missions yet. A Mission assembles Intel Reports and Cases into a briefing with objectives, and — once ready — publishes as a signed Mission Package to Navcom." | "No missions yet. Build one from a case, or start one here." |
| Guide, step 4 | "Move a mission to READY_FOR_PACKAGE, then publish it signed" | "Mark a mission Ready, then publish it." |
| Publish failure | "Package built and signed, but the broadcast failed: wss://relay.wellorder.net: websocket error; …" (five relays) | "Nothing was published: no relay could be reached. Try again when you are online." (relay detail behind "Details") |
| Globe | "3 unclaimed objective(s) in 1 mission(s) rest on nothing this globe can draw." | "3 open objectives aren't linked to a place." |
| NetRunner | "Neural Commander · AI_AGENT · NO LOCAL MODEL" with a green light, and "All systems operational" | "AI assistant: not set up". No green light. |
| The globe, as the bar and the router describe it | "Global threat visualization with 3D interface" / "3D Globe interface with cyberpunk HUD" | "The globe: where reports, events and missions are." |

**The house style this implies.** Say what the person can do next. Lead with the
fact, and put the caveat behind a "?". Keep a sentence under 20 words. Name a
thing the way a newcomer would. Never show a code, a key or JSON where a word
fits. Never write "(s)". The honesty stays: a caveat that matters is shown,
just shorter, and never deleted.

## Found while planning, from the code

Reading the code behind each finding turned up more. None of this was on the
walk's screens; each item comes from the code, with the place it was read.

- **Ten paths publish, and most show nothing first.**
  - The Exchange's "Compose & Publish Current Draft" publishes the most
    recently edited draft to IPFS and Nostr in one click, with its exact
    coordinates (`MarketExchangeApplication.tsx:425-467`).
  - A case's "Publish position" ignores the case's distribution
    (`CasesDashboard.tsx:1009-1060`).
  - Delegation grants go to public relays whatever the mission's distribution
    (`capabilityDelegation.ts:42-67`).
  - The findings outbox sends queued items at start-up
    (`startOutboxDrain.ts`).
- **Team details leave by themselves, verified live.** 111 seconds after a team
  was created, its id, name, description and member count went unencrypted to
  five relays, and they repeat every two minutes
  (`RealTimeTeamService.ts:651-669`). The id is what anyone needs to find the
  team's chat channel.
- **Chat is sent in plain text, verified live with two browser profiles.** Team
  channels were never given group encryption. Direct messages lose their
  post-quantum encryption to a wiring gap (a `dm-` prefix on the recipient's
  key), and they are never received. The post-quantum core itself runs, and
  profiles publish ML-KEM-768 prekey bundles. Every message is labelled
  encrypted anyway, and the header's "Secure Communications" button is a public
  Telegram group. See `../00-current-state/chat.md`.
- **"Safe to practise on" checks one channel of several.** A build that sends
  mission publishing to a private relay still sends findings, chat, keys, team
  updates and IPFS traffic to public networks.
- **Limited cannot be published, and cannot be changed.** Limited and Private
  both refuse any relay that is not on a local network, so with default
  settings a Limited mission can never be published. A mission's distribution
  cannot be edited after it is created.
- **An invite could not work across machines** even with a field to redeem it:
  the invitee's browser has no copy of the team.
- **Case links do not work, verified live.** `/r/case/<id>` opens the case's
  dialog, which still showed "Loading reports and intel…" 15 seconds later, and
  the URL drops the case id. The Archived tab can never show anything (read
  from the code).
- **The record can be wrong in more ways.**
  - A retry can send different content from the attempt that failed.
  - The mission evidence check counts links to reports that were deleted.
  - One report can be a case's evidence and its contradiction at once.
- **With a wallet connected, the globe's "Create Intel Report" keeps the report
  only in memory,** and it is lost on refresh.
- **NetRunner's sidebar scripts are fed the wrong input,** and their results
  reach only the browser console. One of them is a contact harvester (phone
  numbers, street addresses, social profiles). NetRunner itself does a lot, as
  a live check showed: keyless recon works in the browser, and the scanner
  works on desktop. See `netrunner-remake.md`.

## The plan

The plan is in [`intern-readiness-plan.md`](intern-readiness-plan.md). Each work
item names the story it closes, the files it touches, the test to write first,
its size, and what could make it grow. In short:

- **Phase 0 makes the app safe,** starting with one publish review that every
  one of the ten paths must pass, and one network boundary for a training site.
- **Phase 1 fixes the core flow:** the case loop, a case page with working
  links, reports into cases, search, and counts that agree.
- **Phase 2 brings people and teams,** shaped by how work is shared (D1).
- **Phases 3 and 4** cover words, glyphs, one look, and clearing out.
- **Verification** is the walk as a script, then a pilot with people new to
  Starcom.

## Decisions

Eight decisions shape the plan: how work is shared, where distribution starts,
review before public publishing, the training site, what to retire, one look
for the work screens, NetRunner's personal-data scripts, and what the publish
button says. Each is set out with options, a recommendation and the case
against it in [`intern-readiness-decisions.md`](intern-readiness-decisions.md).

## Not verified in this audit

- NetRunner scans and bot runs.
- IntelWeb's graph with data.
- The globe's share card flow for a person.
- Chat.
- Dispatch delegation with a real team.
- Screen-reader output: only keyboard reach was tested.
- 1920 × 1080 and mobile widths.
- Anything behind a Nostr signer extension.
