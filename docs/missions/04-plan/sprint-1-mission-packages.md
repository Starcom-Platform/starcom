# Sprint 1 — Mission Packages, End to End

**Status: shipped 2026-08-29.** All four phases below are done and
committed (`1ca74606` Phase 0, `56d9fdcf` Phases 1-2, `d464e11a` Phase 3).
The definition of done at the bottom of this document was verified live in
a running browser, including a real signed Mission Package reaching a real
Nostr relay. Left as-written below as the record of what was planned and
built, not rewritten into past tense — see each commit for exact diffs.
Phase 2 (the remaining consolidation work this phase deliberately deferred)
is next; see `phase-2-consolidation.md`.

**Goal**: Story 3 in `03-pipeline/user-stories.md` (Aisha assembles and
publishes a Mission Package) becomes real, verified, and usable by an
Intern/Cadet/Archangel Knight — not just by a test calling `MissionService`
directly. Everything in this document is scoped to fit inside the current
2-week sprint; everything else this audit found is deliberately deferred to
Phase 2/3 (see `README.md`'s sequencing logic for why that's safe).

Phases are independently shippable and independently revertible, same
discipline as the rest of this session's work: typecheck + tests + build +
a live check in a running browser before moving on, not before.

---

## Phase 0 — Small, high-leverage fixes that unblock everything else

Each of these is contained, low-risk, and either removes a blocker for
later phases or fixes something actively misleading. Do these first.

1. **`CasesDashboard`'s New Case / Edit buttons** (`src/pages/Cases/CasesDashboard.tsx`) — wire real `onClick` handlers via `caseManagerAdapter`/`useCaseManager()` (the plumbing already exists per `investigations-and-cases.md`; only the button handlers are missing). This gives Mission assembly a real, working Cases source to attach from. *Without this, Phase 1's "attach a Case" step has nothing real to attach.*
2. **Globe's `handleCreateIntelReport`** (`src/components/Globe/Globe.tsx`, wallet-connected branch) — change `addLocalReport()` (ephemeral local state) to actually call `intelReportService.createReport()`, matching the canonical path every other producer uses. See `globe-integration.md` for the exact current code. This is a one-function fix with an existing test file (`useGlobeIntelReportPipeline.test.ts`) to extend.
3. **IntelWeb's hardcoded "Demo Intelligence Vault" label** (`IntelWebLeftSideBar.tsx`) — two-line fix, but it's actively lying to users about whether they're looking at real data. Do it while in the area.

**Verify**: existing test suites pass; live-create a Case and an Intel Report from these fixed paths and confirm they appear in the canonical read surfaces (`IntelWorkspaceContext` consumers).

---

## Phase 1 — Mission Assembly UI (the core deliverable)

**Where it lives**: a new "Missions" tab inside `TeamWorkspaceApplication.tsx`. Reasoning: the user's own framing is "Team Coordination for Operationalization," TeamWorkspace is already the collaboration hub with real teams/chat/roster, and `MissionUI.collaborators`/`comments`/`activityLog` are the same shape as the Collaboration primitives TeamWorkspace-adjacent screens already use. This avoids inventing an eighth registered app for what is fundamentally a team activity.

**Build, modeled on `ComposerWizard.tsx`'s stepper pattern but wired to the real Mission types/services** (`MissionUI`, `MissionService`, `MissionPackageBuilder`, `MissionPackageBroadcastService` — see `mission-packages.md` for the full lifecycle):

1. **Mission list/detail view** — doesn't exist at all today (confirmed: no file reads `missionService.listMissions()` for display anywhere except a leaderboard tally). Build: a list of the team's missions with status chips (`DRAFT`/`PLANNING`/`READY_FOR_PACKAGE`/`PACKAGED`/`DISPATCHED`), and a detail view for one mission.
2. **Create step** — title, briefing, objectives, classification. Calls `missionService.createMission()`.
3. **Attach step** — select related Intel Reports (`intelReportService.listReports()`, reuse the existing list/filter UI patterns from `IntelWorkspaceConsole` or `ComposerWizard`'s source-picker) and related Cases (`IntelCaseService.listCases()`, unblocked by Phase 0.1). Stores as `relatedReports`/`relatedCases` ID arrays on the mission — remember `MissionPackageBuilder` deliberately only crosses these to Navcom as **counts**, never content; the UI attaching them doesn't change that boundary.
4. **State transitions** — buttons/actions to move `DRAFT → PLANNING → READY_FOR_PACKAGE`, matching `VALID_MISSION_STATUS_TRANSITIONS`. Surface transition errors honestly (the service already validates and rejects invalid transitions — don't swallow that).
5. **Publish step** — only enabled at `READY_FOR_PACKAGE`. Calls `missionService.publishToNavcom(id)`. Show real success/failure state — remember the service leaves status at `PACKAGED` (not reverted) on a broadcast failure, so the UI needs a retry affordance for that state, not just a one-shot button.

**Verify**: typecheck, a real test file for the new component(s) (render tests, not just service-layer — this audit found service-only test coverage is exactly how the original gap went unnoticed), and a live walkthrough in a running browser: create a mission, attach a real report and case, move it through every status, publish, confirm it reaches `DISPATCHED` and a Nostr broadcast attempt actually fires (verify against the dev relay config, or a mocked broadcaster if no live relay is reachable in the dev environment — same pattern as this session's own live-verification-with-network-limits handling).

---

## Phase 2 — Team coordination surface on missions

Piggybacks on Phase 1's detail view. `MissionUI` already has real `collaborators: Collaborator[]`, `comments: Comment[]`, `activityLog` — this phase is purely a UI surfacing what already exists in the data model (see `team-coordination.md`'s finding that this is the actual gap, not the model).

1. Comment thread on the mission detail view (add/list comments).
2. Activity log rendering (who did what, when — the transitions in Phase 1 should append to this).
3. Collaborator list with add/remove, using the existing `CollaboratorRole` (`VIEWER`/`COMMENTER`/`EDITOR`/`MANAGER`/`OWNER`) vocabulary — no new role system needed, per `03-pipeline/user-stories.md`'s recommendation against inventing one this sprint.

**Verify**: live walkthrough with two team members both interacting with the same mission (comments, activity log updates), confirming state is visible to both — remember `RealTimeTeamService` itself is publish-only with no cross-device subscribe (`team-coordination.md`), so scope this to "both team members' local views update after a manual refresh," not real-time sync, unless that's separately in scope.

---

## Phase 3 — NetRunner's silent report creation becomes a real, confirmed action

Currently `BotCard.tsx` creates a real Intel Report as an invisible side effect of "Run Mission," logged only to console (`netrunner.md`). This is the other end of the pipeline this sprint cares about — an Intern needs to *know* their scan produced something, and needs a direct path to it.

1. Replace the `console.log('📊 Intel Report created: ...')` with a real toast/notification carrying a direct link/deep-link to the new report.
2. *Stretch, if time allows*: a deliberate "Create Intel Report" action on the OSINT tab's scan result (currently local-state-only, no path to a report at all) — this is a should-have, not a must-have; NetRunner's Bot Roster path already gets an Intern to a real report today, just silently.

**Verify**: live scan/mission run in a running browser, confirm the toast appears and its link resolves to the real, newly-created report.

---

## Explicitly out of scope for Sprint 1 (see Phase 2/3 docs)

- The full 4-way Investigation/Case consolidation (beyond Phase 0.1's button fix) — needs a data-migration story, not a 2-week fit.
- Retiring `/intel` and `/intel/workspace` (the redundant dashboard duplicates) — safe to defer since Mission assembly reads from the correct canonical service regardless of which UI a human happens to browse reports through.
- Deleting the confirmed-dead-code inventory (`02-dead-code-and-redundancy-inventory.md`) — real cleanup, zero risk to Sprint 1's goal either way.
- Onboarding, deep-linking repair, the analysis→collection loop-back UI — `phase-3-flow-and-ux.md`.

## Definition of done for Sprint 1

An Intern/Cadet/Archangel Knight can, in one sitting, in the running app: find or receive intel → see it land as a real Intel Report → optionally review it in the canonical dashboard → attach it (with a real Case) to a new Mission → move the mission through its full lifecycle with visible team collaboration → publish a signed, broadcast Mission Package → see it marked `DISPATCHED`. Verified live, not just by passing tests.
