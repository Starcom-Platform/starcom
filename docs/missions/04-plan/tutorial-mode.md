# Tutorial mode

Written 2026-09-26. The ask: an in-app tutorial mode that explains the whole
process step by step. That means collecting intel, writing an Intel Report,
building a case with evidence and a position, assembling a mission, publishing
a Mission Package, and reading what others publish. Interns use the live app
(decision D4), so the tutorial runs there too.

## Rules it has to keep

- **Derived, not narrated.** The onboarding guide's standing decision is that
  steps come from the real stores, because a scripted tour drifts when a screen
  moves (`phase-3-flow-and-ux.md:6-27`).
- **Tutorial content is never published,** by anyone, by accident.
- **Academy stays one-way.** Starcom may tell Starcom Academy that a lesson was
  finished, but it never unlocks anything because of a credential (refusal R-1).

## What exists to build on

- **The pipeline guide** (`NewUserHint.tsx`) has four hand-written steps and
  derives progress from counts (`usePipelineProgress.ts:56-84`).
  - `pipeline.ts` holds the canonical stages, with the app each one happens in
    and what it rests on. No runtime code reads it yet.
  - The guide and `pipeline.ts` disagree about where "collect" happens.
- **Anchors for highlights** already exist as test ids on the key controls:
  - missions: `create-mission-dialog`, `transition-to-*`, `publish-to-navcom`,
    `publish-destination`;
  - cases: `attach-action`, `state-position`, `publish-position`,
    `create-mission-from-case`;
  - reports: `new-record`, `create-record`.

  NetRunner has none.
- **Navigation:** `navigateToApp` with a context, and `/r/:kind/:id` record links.
- **No tour library** is installed; `focus-trap-react` and MUI are.
- **Exercise material:**
  - `trainingPrograms/docs/ops/labs/datasets/` holds 15 synthetic items with an
    answer key;
  - the spec's conformance vectors;
  - the demo seed of 15 cases.

**The hazard.** Reports, cases and missions have no "sample" flag. The demo seed
writes into the real workspace. Two places hard-code evidence as real:
`eventsAdapter.ts:354`, `373` and `CasesDashboard.tsx:1042`. Mission publishing
has no synthetic-data check. So sample data put into the real workspace would
pass every gate as real intel. Whatever option is chosen, that flag comes first.

## Options

| | What the intern experiences | Builds | Keeps tutorial content private by | Size |
|---|---|---|---|---|
| **A. A coach over real work** | A step-by-step coach beside the real screens. It highlights the next control, explains it in plain words and links the glossary. A step completes when the real record changes: a case gains evidence, a mission rests on a case. At the publish step it explains the destination, and the intern chooses. | A stage-to-anchor table from `pipeline.ts`; completion checks on real records; a popover; a guard that fails the build when an anchor disappears; NetRunner test ids | Seeding nothing: it is the intern's own work. Publishing stays a deliberate choice with the publish review (plan 0.1). | M, 5–8 days |
| **B. A practice workspace** | "Start practice" opens a separate workspace holding a scenario, for example the Newark food banks. The intern works it end to end, and "publishing" produces the exact package with a "would have been sent to…" note. "Leave practice" returns to real work. | A second storage namespace for about eight stores and the identity; the sample flag; a dry-run publish; scenario files; a reset | Separate storage, sample flags that the publish review refuses, and a guard. It is a switch at runtime in the live app, which is the weakest of the guarantees. | L, 15–25 days |
| **C. A now, B for exercises** | A from the first day; B arrives when the trainers want repeatable exercises | A, then B | As above | M now, L later |
| **D. Lessons in Academy, links into Starcom** | Lessons live in Starcom Academy, and each step deep-links into Starcom with a "lesson" banner | Deep links and the banner in Starcom; the lessons in Academy | Nothing in Starcom is seeded | S in Starcom |

**Decided 2026-09-26: C.** A is the plan's item 1.10 done properly, it teaches with
the intern's own work, and it can never drift. B earns its cost once trainers
want the same exercise run by every intern, and it needs the sample flag
anyway.

**Against.** If the cohort's first weeks are exercises rather than real work, B
matters from day one, and A alone leaves practice mistakes in the real
workspace.

## First steps in every option

1. **A sample flag** on reports, cases and missions. Remove the hard-coded
   "real" values. The publish review refuses anything flagged as sample.
2. **Fix the case loop** (plan 1.1). A tutorial cannot walk anyone through a
   case that will not open.
3. **One source for the steps.** The guide reads `pipeline.ts` (plan 1.10).
