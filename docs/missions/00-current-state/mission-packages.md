# Mission Packages

> **Superseded.** This audit (August 2026) found Mission Packages had no user interface. They have been built since:
> composing, reviewing, publishing, taking and reporting back on missions all work, and are walked in the browser by
> `scripts/audit-intern.mjs` (stories S20, S22, S26, S31 and S36, among others). It is kept as the record of the gap.

**This is the sprint's headline gap.** The backend is complete, tested, and
genuinely well-designed. There is no UI anywhere that calls it — not a stub,
not a placeholder, greenfield.

## The real, complete backend lifecycle

`DRAFT → PLANNING → READY_FOR_PACKAGE → PACKAGED → DISPATCHED`, enforced by `VALID_MISSION_STATUS_TRANSITIONS` (`src/types/intel/MissionUI.ts`).

`MissionUI` fields: title, briefing, objectives, classification, `relatedReports`/`relatedCases` (IDs only), `collaborators: Collaborator[]`, `comments`, `activityLog`, `assignedTo: string[]`.

`MissionService.publishToNavcom(id)` (`src/services/intel/MissionService.ts:117-167`), the actual "ship it" method:

1. Requires status `READY_FOR_PACKAGE`.
2. Decrypts the real briefing if classified — reads plaintext before packaging so a CONFIDENTIAL+ mission's ciphertext never leaks into the package.
3. Transitions `READY_FOR_PACKAGE → PACKAGED` — committed whether or not the broadcast later succeeds.
4. Builds the manifest via `MissionPackageBuilder.buildMissionPackageManifest()` — this **synthesizes package content purely from `briefing` + `objectives` text**, and enforces a real Navcom boundary ("Locked Decision #7"): `relatedReports`/`relatedCases` cross only as **counts** in metadata, never real content or IDs; redaction (mask emails/numbers/names) is always on, unconditionally. Feeds through the same `PackageComposer.compose()` MarketExchange uses.
5. Signs the manifest with a **persisted ML-DSA-65 (post-quantum) keypair** via `ManifestSigningKeyStore` — every Mission Package/Finding this instance ever publishes signs under the same public key, so a verifier who's seen it before can attribute later content to the same source.
6. Broadcasts via `MissionPackageBroadcastService` — publishes as a Nostr event, **kind 30079** (deliberately distinct from Intel Reports' kind 30023, so a Mission Package can't be mistaken for a report-feed item), tagged `['t','starcom_mission_package']`/`['t','navcom_handoff']`, content is the full signed JSON manifest, to the same 5-relay Nostr surface Starcom already uses.
7. Only on broadcast success does it advance `PACKAGED → DISPATCHED`; on failure it deliberately stays at `PACKAGED`, not silently reverted or advanced.

Test coverage (`MissionService.test.ts`, `MissionService.publishToNavcom.test.ts`, `MissionPackageBuilder.test.ts`, `MissionPackageBroadcastService.test.ts`) is thorough at the service level.

## The UI: does not exist

Grepped the entire `src/` tree for every import of `MissionService`, `missionService`, `MissionPackageBuilder`, `MissionPackageBroadcastService`, `PackageComposer`, `publishToNavcom`, `CreateMissionInput`, `MissionObjective`, `MissionStatus`. Results:

- **`ContributionBanner.tsx`** — the only `.tsx` touching `missionService` at all, and only a read-only `listMissions()` call for a leaderboard tally.
- **`MissionControlPanel.tsx`** — despite the name, unrelated. A HUD widget with hardcoded mock data (`NOAA-WATCH-001` etc.), its own local, unrelated `MissionData` type, no import of `MissionService` anywhere.
- No file named `MissionForm`, `MissionBuilder`, `MissionWorkspace`, `MissionDetail`, or `MissionPackage*.tsx` exists anywhere.
- Zero `.tsx` files call `createMission`, `saveMission`, `updateStatus`, `deleteMission`, or `publishToNavcom`.

The API is written human/AI-agnostic (`user?: string` params, doc comments referencing `nostrIdentityService.getPubkey()` as a stand-in caller) — built as a service contract with no screen ever wired to it.

## Closest existing pattern to build from

`ComposerWizard.tsx` (`src/applications/marketexchange/components/ComposerWizard.tsx`) — a real, working, 5-step MUI `Stepper` dialog: **Source → Metadata → Redaction → Review → Publish**. Reachable today via MarketExchange's "Compose & Publish Current Draft" button. Its "Source: manual" step (pick latest IntelAnalyzer draft / board pins / manual add-item form) and its redaction/sign/review pattern are the right *shape* for a Mission Package builder — but it operates on generic `ComposeInput`/`PackageManifest` built from `IntelReportService` drafts, and never touches `MissionUI`, `MissionService`, `MissionPackageBuilder`, or `MissionPackageBroadcastService`. It publishes through a *different* pipeline (`IntelPipelineOrchestrator`/`publishAdapter`, IPFS + Nostr kind 30023) than the Mission Package one (kind 30079).

**No mission-specific screen exists to extend instead** — not even a read/list view of `MissionUI` records. `ComposerWizard` is the nearest reusable *pattern*, not an in-progress version of the target.

## What must be built here (see `04-plan/sprint-1-mission-packages.md` — this is Sprint 1's core deliverable)

1. A real screen: create a Mission (title/briefing/objectives), attach related Intel Reports and Cases (from whichever becomes canonical per `intel-reports-and-dashboards.md` / `investigations-and-cases.md`), move it through the state machine, and call `publishToNavcom`.
2. A natural home for it — likely inside TeamWorkspace (given "Team Coordination for Operationalization" is explicitly the framing) or as its own reachable view, not buried behind Ctrl+K.
3. Surface `MissionUI`'s already-real `collaborators`/`comments`/`activityLog` fields in that screen — the data model for team coordination on a mission already exists; only the view is missing (see `team-coordination.md`).
4. Model the stepper/redaction/review pattern on `ComposerWizard` without reusing its wrong-pipeline internals — this is a genuinely new component wired to the genuinely-ready Mission backend.
