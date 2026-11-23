# Investigations & Cases

"Investigations" and "Cases" are the same concept — an incident/inquiry
container with status, priority, classification, assignment, timeline —
implemented **four separate times**, each with its own backing store, none
aware of the others. A fifth, HUD-only view sits alongside them reading one
of the four stores directly.

## The four implementations

| # | Screen | File(s) | Backing store | Status |
|---|---|---|---|---|
| 1 | `/investigations` (list) | `src/pages/Investigations/InvestigationsDashboard.tsx` | `realTimeTeamService` (per-team investigations) | Real, but falls back to two **hardcoded mock investigations** shown as real data when a connected wallet has no teams with investigations |
| 2 | `/investigations/:id`, `/cyber-investigation` (detail) | `CyberInvestigationMVP.tsx` → `InvestigationDashboard.tsx` via `InvestigationContext` | `InvestigationApiService`, hardcoded to `http://127.0.0.1:8081/api/v1` | **RETIRED (`ef131f0b`).** Was broken by default in every normal environment. The `:8081` HTTP API turned out to be **early-prototype RelayNode work, not a live integration** — the AI Security Relay Node that actually shipped (the Jetson Orin AGX, Mk1/prototype) integrates over Nostr and IPFS, which `NostrStarcomIntelIngest`/`MissionPackageBroadcastService` already use. ⚠️ This row originally described it as a real external backend, on the strength of `docs/testing/test-auth.sh` hitting that endpoint; that was wrong, and the correction is worth remembering — **a test script proves someone once built something, not that it's live.** |
| 3 | HUD popup's Investigation Board | `src/components/Intel/InvestigationBoard.tsx`, opened via `InvestigationWorkflowPopup.tsx` | `CyberInvestigationStorage` → `secureStorage` (real browser-storage persistence) | Real, working. Same hardcoded mock-data fallback pattern as #1. Honestly documents a **dropped feature**: blockchain anchoring was removed because it needed wallet-signing UI that never existed — comment recommends OpenTimestamps as a free alternative, not yet built. |
| 4 | `/cases-dashboard` | `src/pages/Cases/CasesDashboard.tsx` via `caseManagerAdapter` → `IntelCaseService` | **The canonical Intel substrate** — `IntelWorkspaceManager` (same as Intel Reports) | Real, current, genuinely modernized — but its **"New Case" button and per-row "Edit" icon have no `onClick` handler at all.** You can read, search, filter, and delete real persisted cases here; you cannot create or edit one from this screen today. |

None of the four has a working path that creates or edits a formal `IntelReportUI` object — despite `intelPackages`/`relatedReports`-shaped fields existing on some of the type definitions, nothing resolves them to real report content anywhere in these files.

## The component whose name most directly promised the missing link — doesn't exist

`IntelReportSubmission.tsx` does not exist anywhere in the repo. Only its orphaned stylesheet survives: `src/components/CyberInvestigation/IntelReportSubmission.module.css`. Whatever "raw intel becomes a formal report from inside an investigation" workflow this implies was apparently removed at some point, leaving no trace but dead CSS.

## Existing precedent for consolidation

`routes.tsx` already retired `/case-manager` → redirect to `/cases-dashboard`, with an explicit comment that the old implementation was "an in-memory mock that never persisted anything." **The same argument applies to implementations #1, #2, and #3 above** — #4 (`CasesDashboard`) is the only one of the four built on real, current, unified persistence, making it the natural consolidation target once its Create/Edit buttons are wired up.

## What must be fixed here (see `01-architecture-decisions/canonical-investigation-case-system.md` and `04-plan/`)

1. Wire `CasesDashboard`'s New Case / Edit buttons to real handlers — this is the actual blocker to making #4 fully usable, and it's a small, contained fix.
2. Retire #1, #2, #3 the way `/case-manager` was retired — redirect their routes/entry points to `/cases-dashboard`, remove the hardcoded mock-data fallbacks along the way (don't carry them forward).
3. Decide the fate of #2's external-server dependency (`InvestigationApiService` / port 8081) — either this is a real, separate service that needs to be documented and started as part of local/deployed setup, or it's aspirational architecture that should be removed along with the route.
4. Once consolidated, make sure Mission Packages (see `mission-packages.md`) can genuinely reference real Cases from the one surviving implementation — this is part of what "assemble mission objectives" needs.
