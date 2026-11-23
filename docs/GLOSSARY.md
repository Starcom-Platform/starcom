# Glossary

The project's own words, A to Z, for a developer new to Starcom. Each entry says where the term is defined or used.
Codes such as D-RP are decision records: see [Decision record](#decision-record).

The words the app explains to its own users are in the in-app glossary, `src/services/help/glossary.ts`. Where an
entry here and the code disagree, the code is right.

### AI Security Relay Node

The first AI Relay Node's hardware: a Jetson Orin AGX, as a first ("Mk1") prototype, also called "RelayNode". It
hosts the internal relay that Mecha Jono publishes to, and Starcom works with it over Nostr and IPFS only, never
through an HTTP API. Its software is not in this repository. The relay plan's `ai-security-relaynode` is a separate
codebase and not that internal relay: it stores any valid event without asking who signs in, so it cannot serve as a
team relay. See [Node](#node).

Where: [`missions/04-plan/phase-2-consolidation.md`](missions/04-plan/phase-2-consolidation.md),
[`missions/04-plan/internal-relays-and-registration.md`](missions/04-plan/internal-relays-and-registration.md),
`.env.example` (`VITE_NOSTR_MISSION_RELAYS`).

### AI Watch

A globe mode for AI incidents, drawn from Mecha Jono's "Terminator Watch" desk on The Record. Its notes carry facets
such as frontier, incident and autonomous weapons (D-AW).

Where: [`missions/01-architecture-decisions/ai-watch.md`](missions/01-architecture-decisions/ai-watch.md),
`src/components/Globe/Hooks/useGlobeAiWatch.ts`.

### Aisha

The team lead in the people's stories. She creates the team, builds missions from cases, gives objectives to interns
and publishes packages. See [Personas](#personas).

### Attested claim

A claim published with how it was reached: how many sources, the method and its version, the kind of observation, and
its own weak points. It carries no confidence score, so each reader weighs it. It is kind 30082 and a refutation is
kind 30083; a retraction is not a separate kind.

Where: [`spec/nip-draft-attested-claims.md`](spec/nip-draft-attested-claims.md) ("NIP-XX"),
`src/services/intel/findings/`. See also [Finding](#finding).

### blackpi

A read-only mirror of The Record at `wss://blackpi.cosmiccodex.app`, on a Raspberry Pi. Starcom reads it only when
The Record does not answer, and never writes to it (D-MX, MX27).

Where: `src/config/publicInfrastructure.ts` (`THE_RECORD_MIRROR`), `src/services/nostr/relayPool.ts`.

### Case

An investigation: reports and evidence gathered toward a position, which is a statement with a verdict
(substantiated, unsubstantiated or inconclusive). A case's position can be published as a finding. A case can also be
sent, sealed, to people its author chooses.

Where: `src/pages/Cases/CasesDashboard.tsx`, `src/services/intel/IntelCaseService.ts`,
`src/types/intel/IntelCaseUI.ts`, `src/services/help/glossary.ts`.

### Claim

See [Attested claim](#attested-claim).

### Dana

The trainer and reviewer in the people's stories. She runs practice where nothing leaves the building, and reviews
interns' work before it is published. See [Personas](#personas).

### Decision record

A file in `docs/missions/01-architecture-decisions/` saying what was decided about one area, by whom, and why. Each
has an ID such as D-RP (report publishing), D-ML (languages) or D-ZR (Zones), and numbers the decisions inside it,
such as RP8 or ML12. Commit messages and code comments cite these IDs; some older records use D1, D2 or K-numbers.

Where: [`missions/01-architecture-decisions/`](missions/01-architecture-decisions/README.md),
[`../CONTRIBUTING.md`](../CONTRIBUTING.md) ("How changes are written").

### Distribution

Who may receive a record: Public (public relays, and it cannot be recalled), Limited (the team's internal relays) or
Private (never sent). It is chosen for each case, mission and report.

Where: `src/services/help/glossary.ts` (entry `visibility`), `src/services/intel/bundles/bundleDistribution.ts`.

### EIN (Earth Intelligence Network)

A decentralized, public, free-to-use network for open-source intelligence. It is made of frontends, which people use
(Starcom is the reference one), and [nodes](#node), and anyone may run either, publicly or privately. It has no
membership and no body that issues roles: authority comes from signed grants, such as a Dispatch Capability, and a
claim is meant to be weighed by the method and sources it discloses. Its open standards are being set up in
[Earth-Intelligence-Network/ein-standards](https://github.com/Earth-Intelligence-Network/ein-standards); until they
move, they are in [`spec/`](spec/README.md). `ein-refusals.json` cites "EIN consensus, SITREP-EIN-008", a document not
published here.

Where: [`spec/README.md`](spec/README.md),
[`spec/starcom-navcom-interchange.spec.md`](spec/starcom-navcom-interchange.spec.md) ("Dispatch Capability"),
[`missions/00-current-state/ein-transition-audit-2026-11-21.md`](missions/00-current-state/ein-transition-audit-2026-11-21.md),
`public/.well-known/ein-refusals.json`.

### Finding

Starcom's name for an attested claim it publishes, from IntelAnalyzer or from a case's position. The interchange spec
calls kind 30082 "Finding"; the NIP draft calls the same kind "Attested Claim".

Where: `src/services/intel/findings/`,
[`spec/starcom-navcom-interchange.spec.md`](spec/starcom-navcom-interchange.spec.md) ("Finding — 30082").

### Guard

A script in `scripts/guard-*.mjs` that fails when the code breaks a project rule, such as publishing around the
review. Each opens with an `@asserts` line saying what it checks, and many
have a self-test in `scripts/__tests__/`. `npm run guards`, `npm run gates` and `npm run build` run them.

Where: `scripts/`, `scripts/guard-gate-coverage.mjs`, [`TESTING.md`](TESTING.md#guards-and-gates). The list is
published at `/.well-known/starcom-guards.json` by `scripts/publish-guard-manifest.mjs`.

### Hero Watch

A globe mode for relief and rescue, from Mecha Jono's notes: lifeboat stations, Red Cross and Red Crescent operations,
field missions and RLSH heroes (D-HW). The week's summary is shown in a panel.

Where: [`missions/01-architecture-decisions/hero-watch.md`](missions/01-architecture-decisions/hero-watch.md),
`src/components/Globe/Hooks/useGlobeHeroWatch.ts`.

### Intel Watch

The globe's first mode: intel reports published to Nostr, plus cyber threats, satellites and submarine cables. Its id
in the code is still `CyberCommand`, because links, saved workspaces and the share handle use it (D-IWN).

Where: `src/components/HUD/Bars/CyberCommandRails/railModeConfig.ts`,
[`missions/01-architecture-decisions/intel-watch-name.md`](missions/01-architecture-decisions/intel-watch-name.md).

### IntelAnalyzer

The analysis workbench, with graph, map, table and timeline views over reports and observations. Findings,
refutations and retractions are published from it.

Where: `src/applications/intelanalyzer/`, [`../README.md`](../README.md).

### IntelWeb

A graph of reports, linked only by what they state: citations, linked intel, and hubs for countries, tags and
publishers (D-IW, IW1). It lays them out as clusters, a timeline, a map or a radial view.

Where: `src/applications/intelweb/`,
[`missions/01-architecture-decisions/intelweb.md`](missions/01-architecture-decisions/intelweb.md).

### Kept notes

See [Outbox](#outbox).

### Kind

The number on a Nostr event that says what it is. Under NIP-01 the number also decides how relays store it: every
one, only the newest, or none. The kinds Starcom specifies include 30079 (Mission Package), 30081 (Dispatch
Capability), 30082 (Finding), 30083 (Refutation) and 30084 (Roster Item); it uses many standard kinds besides.

Where: `src/services/nostr/kindRegistry.ts` (every kind the app uses), `docs/spec/kinds.md` (a table generated from
it), `scripts/guard-kind-collision.mjs`.

### Marcus

The cadet analyst in the people's stories: months in, working across many reports and cases a day, and wanting speed
and keyboard flow. See [Personas](#personas).

### Mare, Maria

See [Terra and Mare](#terra-and-mare).

### Mecha Jono

An AI agent run by the project's owner. It publishes notes, claims and Mission Packages under its own keys, to The
Record among other relays, and several globe layers read them. Its keys, and which layers read each, are in
`src/config/publishers.json`.

Where: [`../README.md`](../README.md), `src/config/publishers.json`,
[`missions/03-pipeline/user-stories.md`](missions/03-pipeline/user-stories.md) ("the AI operator").

### Mission

The deliverable built from a case: a briefing, and objectives given to named people (D-B). Its status runs DRAFT,
PLANNING, READY_FOR_PACKAGE, PACKAGED, DISPATCHED, CLOSED. "Missions" is also the name of the app that builds them
(see [TeamWorkspace](#teamworkspace)), and of a globe mode showing missions others published.

Where: `src/types/intel/MissionUI.ts`, `src/services/intel/MissionService.ts`,
[`missions/01-architecture-decisions/mission-downstream-of-case.md`](missions/01-architecture-decisions/mission-downstream-of-case.md).

### Mission Package

A mission as published: its briefing and objectives, signed twice, with ML-DSA-65 and with the publisher's Nostr key.
It counts the reports and cases behind it but carries neither, and never names the analysts. It is kind 30079, and
NavCom reads it.

Where: `src/services/intel/MissionPackageBuilder.ts`, `src/services/publishing/missions.ts`,
[`spec/starcom-navcom-interchange.spec.md`](spec/starcom-navcom-interchange.spec.md).

### NavCom

A separate application, at navcom.app, where missions are read and acted on; it is not in this repository. It reads
the Mission Packages Starcom publishes, and Starcom reads its observations (kind 1911). The files spell it both "NavCom"
and "Navcom".

Where: `src/services/help/glossary.ts`, `src/config/publicInfrastructure.ts` (`NAVCOM_ORIGIN`),
[`spec/starcom-navcom-interchange.spec.md`](spec/starcom-navcom-interchange.spec.md).

### NetRunner

The investigation and lookup tool. Its lookups work in the browser; scanning a page needs Uplink or the desktop app.

Where: `src/applications/netrunner/`, [`../README.md`](../README.md).

### NIP

A numbered Nostr specification, from the list at https://github.com/nostr-protocol/nips. The code cites them by
number: NIP-01 (events and relays), NIP-07 (browser signers), NIP-42 (signing in to a relay), NIP-44 (encryption) and
NIP-59 (sealed messages). Starcom's own draft is "NIP-XX", in
[`spec/nip-draft-attested-claims.md`](spec/nip-draft-attested-claims.md).

### Node

A machine that serves the network rather than one person's screen: a relay, an archive such as
[The Record](#the-record), a mirror such as [blackpi](#blackpi), an indexer or a curator. An AI agent that publishes
signed notes, such as [Mecha Jono](#mecha-jono), is part of a node too, and the network's plan
asks that each have an operator of record. A node describes itself;
Starcom does so in its descriptor, `/.well-known/starcom-node.json`. "Starcom AI Relay Node" is the project's
name for a node that pairs a relay with AI agents publishing to it: the
[AI Security Relay Node](#ai-security-relay-node) is the first. No node software is published yet. The first anyone
will be able to run is planned as a personal relay inside Starcom Desktop (D-DR).

Where: [`missions/01-architecture-decisions/desktop-relay.md`](missions/01-architecture-decisions/desktop-relay.md),
[`missions/04-plan/internal-relays-and-registration.md`](missions/04-plan/internal-relays-and-registration.md),
`scripts/publish-node-descriptor.mjs`.

### Outbox

Where a reviewed, signed note waits when no relay takes it; screens call it a kept note. It is kept on the device
exactly as signed, and sent when a relay answers. After ten failed tries, or a refusal for good, it waits for the
person to retry or cancel.

Where: `src/services/intel/outbox/EventOutbox.ts`, `src/services/intel/outbox/keptNotes.ts`,
[`missions/01-architecture-decisions/report-publishing.md`](missions/01-architecture-decisions/report-publishing.md)
(D-RP, RP8). Findings wait in a queue of their own, `src/services/intel/outbox/PublishOutbox.ts`.

### Personas

The people the stories are written for: Priya (intern), Marcus (cadet analyst), Aisha (team lead), Dana (trainer and
reviewer), Sam (works without a mouse) and Mecha Jono (the AI operator). They describe what a person needs, not a role
the code checks. The walk drives a browser profile for each of Priya, Aisha, Marcus and Dana.

Where: [`missions/03-pipeline/user-stories.md`](missions/03-pipeline/user-stories.md), `scripts/audit-intern.mjs`.

### Priya

The intern in her first weeks: careful, on a 1366 × 768 laptop, and worried about making a public mistake. Most of
the stories are hers. See [Personas](#personas).

### Psi Watch

An experimental globe mode, labelled "Experimental" in the app. It builds on a psionic field model and astrological
sky data, and explores correlations, never causations, with reports and events (D-PW). Adding `?psi=off` to the
address hides it for that browser tab.

Where: [`missions/01-architecture-decisions/psi-watch.md`](missions/01-architecture-decisions/psi-watch.md),
`src/services/psiWatch/psiKitSwitch.ts`, `src/components/Globe/psiWatch/`.

### Publish review

The one screen every publish passes through. It shows exactly what will be signed and where it will go, points out
coordinates, addresses and the like, and sends nothing until the person confirms. A guard fails the build if any code
publishes around it.

Where: `src/services/publishing/publishReview.ts`, `src/components/Publishing/PublishReviewRoot.tsx`,
`scripts/guard-publish-review.mjs`.

### Raver Watch

A globe mode for safety in the rave scene, from Mecha Jono's notes: drug-checking alerts, scene events in the coming
days, and heat risk by town. A venue is named only when it is public and licensed.

Where: [`missions/01-architecture-decisions/raver-watch/RAVER_WATCH_V1_1.md`](missions/01-architecture-decisions/raver-watch/RAVER_WATCH_V1_1.md),
`src/components/Globe/Hooks/useGlobeRaverWatch.ts`.

### Refusals

What Starcom will not do, R-1 to R-9, served at `/.well-known/ein-refusals.json` from
`public/.well-known/ein-refusals.json`. Among them: no gating on a credential (R-1), no trust or scoring API (R-6), no
claim naming a private individual (R-7). The file says that a later document which seems to relax one is the bug.

Where: `public/.well-known/ein-refusals.json`, [`../CONTRIBUTING.md`](../CONTRIBUTING.md) ("What is refused").

### Relay

A server that stores signed Nostr events and passes them on; Starcom reads and publishes through relays. A public
relay serves anyone, while a team relay asks who you are (NIP-42) and keeps a signed member list (NIP-43). Every relay
address in the app is in one file, and a guard keeps addresses out of all others.

Where: `src/config/publicInfrastructure.ts`, `src/services/help/glossary.ts`, `scripts/guard-hardcoded-relays.mjs`.

### Report

An intel report: a titled text that may carry a place and a time, written in the Intel Reports workspace
(`inteldashboard`). It stays on the device until its author publishes it. Then it goes out as a kind 30023 note that
other globes read (D-RP).

Where: `src/types/intel/IntelReportUI.ts`, `src/services/intel/IntelReportService.ts`,
`src/services/publishing/reports.ts`.

### RLSH

Real Life Super Hero, as `src/components/Globe/Hooks/useGlobeLayerControl.ts` spells it out. Hero Watch shows RLSH
markers from a curated registry, heroes sign up with a NavCom profile card (kind 10911), and some missions address
them. The files do not define who counts as one.

Where: `src/components/Globe/Hooks/useGlobeRLSH.ts`,
[`missions/01-architecture-decisions/rlsh-signup.md`](missions/01-architecture-decisions/rlsh-signup.md) (D-RF),
[`missions/01-architecture-decisions/rlsh-recurrence.md`](missions/01-architecture-decisions/rlsh-recurrence.md) (D-RR).

### Sector

The smallest area of the Zone and Sector Protocol: every point on Earth is in one Sector, and every Sector in one
Zone. A Sector covers 50,000 to 500,000 km² and records what each of its edges follows (D-ZR, ZR7). The served
partition has 2,632 Sectors, as `scripts/guard-zsp.mjs` reported on 23 Nov 2026.

Where: [`missions/01-architecture-decisions/zones-reslice.md`](missions/01-architecture-decisions/zones-reslice.md),
`public/geopolitical/zones/`.

### Sphere

A domain of influence, such as the Russophone world or the Swahili sphere, made of whole members by a cited list.
Spheres overlap, have no Sectors, and are drawn as a layer of their own (D-ZS, ZS4).

Where: `src/features/globe/areas/areaRegistry.ts`, `src/components/Globe/GlobeSpherePanel.tsx`,
[`missions/01-architecture-decisions/zones-and-spheres.md`](missions/01-architecture-decisions/zones-and-spheres.md).

### Starcom (the frontend)

This repository: a static React, TypeScript and Vite web app with a Three.js globe, served at starcom.app with no
server of its own. A person's identity is a Nostr key they hold, and what they publish goes to relays. It describes
itself to other nodes in `/.well-known/starcom-node.json`, written at build time.

Where: [`../README.md`](../README.md), `scripts/publish-node-descriptor.mjs`, `scripts/guard-no-server-surface.mjs`.

### Starcom AI Relay Node

See [Node](#node).

### TeamWorkspace

The app shown as "Missions" in the navigation; its id stays `teamworkspace`, so old links still open it. It holds the
missions list and the Overview, Chat, Operatives and Admin tabs.

Where: `src/applications/teamworkspace/`, `src/components/Router/EnhancedApplicationRouter.tsx`.

### Terra and Mare

The top level of the Zone and Sector Protocol: 12 Terrae (lands) and 5 Maria (seas) cover the globe. They are named
in Latin, as the IAU names planetary surfaces, with ids such as `terra:africana` and `mare:pacificum` (D-ZR, ZR2).

Where: [`missions/01-architecture-decisions/zones-reslice.md`](missions/01-architecture-decisions/zones-reslice.md),
`public/geopolitical/zones/manifest.json`.

### The Record

A relay at `wss://record.cosmiccodex.app`, the first of the registered Starcom relay nodes. It is an archive where
Mecha Jono publishes claims and intel notes, and the globe reads it. It is not Starcom's internal relay.

Where: `src/config/publicInfrastructure.ts` (`THE_RECORD_RELAY`), `src/legal/sourceRegister.ts`.

### Uplink

Starcom Uplink, the browser extension in `extension/`. It keeps the person's key encrypted, asks before it signs or
reaches a site, and sends pages and selections to Starcom as captures. NetRunner's page scans need it, or the desktop
app. It is not in any browser store yet.

Where: `extension/`, `src/extension/`,
[`missions/01-architecture-decisions/browser-extension.md`](missions/01-architecture-decisions/browser-extension.md)
(D-EX).

### Walk, the

`scripts/audit-intern.mjs`, which drives headless browsers through the people's stories and the chat stories,
against a built copy of the app. A stand-in relay inside the script answers every relay connection, so nothing
reaches a real relay. Each story is reported as WORKS, PARTIAL, MISSING, BROKEN, DECIDED or NOT CHECKED.

Where: `scripts/audit-intern.mjs`, `scripts/lib/twoBrowserHarness.mjs`,
[`missions/03-pipeline/user-stories.md`](missions/03-pipeline/user-stories.md),
[`TESTING.md`](TESTING.md#the-browser-walk).

### Zone

The middle level of the Zone and Sector Protocol: a whole region shaped by one system, such as a rift, a basin or an
ocean gyre. Zones tile their Terra or Mare, and country borders set no edge (D-ZR, ZR6).
The served partition has 251 Zones.

Where: [`missions/01-architecture-decisions/zones-reslice.md`](missions/01-architecture-decisions/zones-reslice.md),
`src/components/Globe/GlobeZonePanel.tsx`.

### ZSP (Zone and Sector Protocol)

The format and rules for dividing the globe into Terrae and Maria, Zones and Sectors, as an alternative to nation
states. Version 1.0 had eleven Zones; the manifest served now is version 2.0, which covers the whole globe. The build
refuses a 2.0 partition with a gap, an overlap or a Sector out of size.

Where: `public/geopolitical/zones/`, `src/geopolitical/zones/zsp.ts`, `src/geopolitical/zones/zspChecks.ts`,
`scripts/guard-zsp.mjs`.
