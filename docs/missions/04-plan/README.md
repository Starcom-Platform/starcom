# Execution Plan — Overview

Three tiers, sized to reality. "Do everything we can" is the right
appetite for the *documentation* in this directory — the audit and
decisions cover the whole app deliberately. Execution is phased, because
several of the fixes found here have real dependencies on each other (you
can't safely delete a redundant dashboard before its unique features are
ported; you can't consolidate 4 Investigation stores without a data
migration story), and because the 2-week sprint has one actual deadline
attached to it.

| Tier | Timeframe | Doc | Goal |
|---|---|---|---|
| **Sprint 1** | Current 2-week sprint | [`sprint-1-mission-packages.md`](sprint-1-mission-packages.md) | One real, verified, end-to-end path: find/receive intel → report → case → mission → **published, signed Mission Package**. This was Story 3 in the August `03-pipeline/user-stories.md`; that file's last section says how to read it. |
| **Phase 2** | Near-term backlog, not date-boxed | [`phase-2-consolidation.md`](phase-2-consolidation.md) | Execute the rest of the `01-architecture-decisions/` consolidations Sprint 1 didn't need to touch: delete confirmed-dead code, retire the remaining duplicate Investigation/Case and Intel Report screens, fix the wiring stubs Sprint 1 didn't require. |
| **Phase 3** | Longer-term | [`phase-3-flow-and-ux.md`](phase-3-flow-and-ux.md) | The UX-flow rework proper: onboarding, the analysis→collection and team→reports loop-backs from `03-pipeline/`, navigation/deep-linking repair, cross-app "View on Globe"/"View in IntelWeb" affordances. |
| **Building forward** | Next, supersedes Phase 3's UX half | [`intel-case-mission-ux.md`](intel-case-mission-ux.md) | The Intel → Case → Mission flow rebuilt around what makes work doable: objectives that carry an artifact, cases that record what they concluded, globe layers for region and absence, and packages you can act on. Written 2026-09-20 against the code. |
| **Intern readiness** | Before Starcom Academy's cohort starts on 2026-12-01 | [`intern-readiness.md`](intern-readiness.md), [`intern-readiness-plan.md`](intern-readiness-plan.md), [`intern-readiness-decisions.md`](intern-readiness-decisions.md) | Whether a newcomer can use the pipeline. The audit of the running app against the stories in `03-pipeline/user-stories.md`; the build plan, with a nine-week road to the cohort; and the decisions that shape it. Written 2026-09-25, reworked 2026-09-26. |
| Its studies | Written 2026-09-26 | [`internal-relays-and-registration.md`](internal-relays-and-registration.md), [`peer-sign-off-and-reviews.md`](peer-sign-off-and-reviews.md), [`tutorial-mode.md`](tutorial-mode.md), [`netrunner-remake.md`](netrunner-remake.md), [`retirement-audit.md`](retirement-audit.md), [`interface-upgrade.md`](interface-upgrade.md) | The internal relay and registration; team sign-off and reviews on Nostr; a tutorial mode; making NetRunner's tools work; what each old system was built for; and the app-wide interface upgrade. The chat and visual-system audits are in `00-current-state/`. |
| **Relay capability** | Scoped 2026-11-21 | [`relay-capability-work.md`](relay-capability-work.md) | Decision D-DR as work packages: every reviewed publish waits when no relay takes it (W1, before the cohort), the desktop's personal relay (D1 to D8), and Uplink keeping the queue later if still needed (U1, U2). |
| **Intern tasks** | Ready 2026-11-22, for the cohort of 2026-12-01 | [`intern-tasks.md`](intern-tasks.md) | Six tasks an intern can start on the first day, each with why, what to read, what to do and the check that says it is done; and how work is checked here. |
| **Open source and many instances** | Scoped 2026-11-22 | [`open-source-release.md`](open-source-release.md) | The first public release (O1 to O7) and running many Starcom instances (O8 to O13), from the "Many Starcoms" tab of the EIN plan, which holds the incentives behind each rule. |

## Sequencing logic (why this order)

Sprint 1 deliberately does **not** wait for the full consolidation in
Phase 2. Mission assembly can be built directly against the services that
are *already* canonical in practice (`intelReportService`, `IntelCaseService`)
without first deleting every redundant screen that also happens to read
from them — the redundant screens are a discoverability/confusion problem
for *people*, not a correctness problem for *new code built against the
right service*. This lets Sprint 1 focus entirely on the one thing that
has zero implementation today (the Mission Package UI) instead of spending
its two weeks on cleanup that, while necessary, doesn't unblock the
sprint's actual goal.

Phase 2 exists precisely because that cleanup is still real and still
matters — every week it's deferred is another week someone (human or AI)
can land on the wrong dashboard, the wrong Investigation screen, or the
wrong `IntelReportService` and build on it by mistake, the same way this
sprint's earlier Mecha Jono work found speculative architecture built on a
misunderstanding. Phase 2 is the payment on that risk.

## Verification standard for every phase

Matching the pattern already established this session for the Globe.tsx
extraction work: **typecheck clean, tests pass, build clean, and a live
check in a running browser before any task is considered done** — this
audit found multiple features that were "done" by every static signal
(imported, tested, no TODOs) and still unreachable by an actual user. Don't
trust the static signals alone here; this codebase has already demonstrated
they're not sufficient.
