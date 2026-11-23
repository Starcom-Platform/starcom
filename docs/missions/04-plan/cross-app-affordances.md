# Cross-app affordances — scoping

`phase-3-flow-and-ux.md` carried one line about this: *extend "View on Globe"
to Cases and Missions, add reciprocal "View in IntelWeb" links.* It read as
two buttons. It is not.

This document exists because the estimate was wrong in a specific, instructive
way, and the reason generalises: **it was anchored on "there's a working
example to copy."** The working example is `IntelWorkspaceConsole.tsx:349-352`
— two statements, `setFocusLocation(...)` then `navigateToApp('cybercommand')`.
Copying it to two more places would reproduce its gaps twice more.

Every code claim below is stated with a file:line so it can be checked rather
than believed. Where a claim is a *negative* ("nothing calls this"), the way to
re-check it is named.

## The shape of the mistake

Estimating the *button* and never checking the *prerequisite*. Reports carry
`latitude?`/`longitude?` (`IntelReportUI.ts:35-36`). Cases and Missions carry
no geo field of any kind — `IntelCaseUI.ts` and `MissionUI.ts` have only an
untyped `metadata: Record<string, unknown>` that nothing writes geo into. So
"View on Globe" for a Case is not a button; it is a question about what a Case's
location *is*, and nobody has answered it.

## It is two features, not one

They share no code and should not share a ticket.

**A. IntelWeb deep-linking** — hand IntelWeb a node to select and focus.
**B. Spatial placement of Cases and Missions** — invent a placement semantics.

A is small. B is not work yet; it is a product decision with work behind it.

## What is genuinely small — **superseded, see below**

> **Correction (planning pass, [`open-items-sequenced.md`](open-items-sequenced.md)).**
> This section called the IntelWeb deep-link "the ONE genuinely small piece."
> The mechanical half still is — but the *surface it attaches to is not sound*.
> `IntelGraph` re-renders without bound (reproduced: an empty-vault render did
> not complete in 200s, and a 5s per-test timeout could not preempt it, because
> the loop is synchronous). Two of the three sub-tasks below sit on that
> component. And **graph centering is dropped entirely**: no CSS rule exists for
> `.intel-graph-container`, `.graph-engine-wrapper` or `.intelligence-graph`, and
> `GraphEngine2D` sizes the SVG from a container height derived from that same
> SVG — circular, so there is nothing to centre within until someone opens it in
> a browser and reads the number. The deep-link is deferred behind three live
> defects that were never in this brief.

**IntelWeb forward deep-link for a report, from IntelDashboard only.** The
transport already works and the pattern is already proven for IntelDashboard
(`IntelReportPopup.tsx` → `IntelDashboardApplication.tsx`, tested in
`IntelWorkspaceConsole.deepLink.test.tsx`). Three mechanical pieces: export a
`reportId → vault-path` index from `BuildResult`
(`IntelWebIntegrationService.ts`; the report id is currently never written into
frontmatter), pass the target through `IntelWebApplicationWrapper`, and add a
once-only initial-selection effect.

Two things to budget as *part* of it, not as polish:

- **Graph centering.** There is no `zoom.transform` anywhere under
  `src/applications/intelweb` — selection is a CSS class and a stroke width. A
  link that selects an off-screen node reads as a broken button.
- **An honest state for a target that resolves to a real file with no rendered
  node.** `IntelGraph.tsx` defaults the confidence filter to `[0.3, 1.0]` and
  `filterGraphData` drops non-matching nodes outright, so a valid target can
  legitimately have nothing to select. Say so; don't fail silently.

## What was fixed while auditing

Two live defects, both found incidentally, both of the "green in CI, inert in
the product" class this initiative keeps turning up:

- **`TeamWorkspaceApplication`'s deep-link guard admitted only `chat` and
  `investigations`.** Every other tab fell through to Overview — including
  `missions`, the tab Sprint 1 built and the one most worth linking to. Nothing
  caught it because the caller's assertion is that `navigateToApp` fired with
  the right context, which stayed true while the destination ignored it. The
  guard now derives from the tab list itself, so adding a tab cannot leave it
  un-linkable, and the tab bar renders from that same list. Regression test
  covers all seven tabs plus an unknown value.
- **`IntelWebApplication` declared a `packageId` prop it never destructured**,
  which the wrapper dutifully forwarded with a type guard, and which no
  `navigateToApp` call anywhere passed. Deleted. It mattered because anyone
  scoping this work by reading the wrapper would conclude the intake half was
  already built.

## Decisions

### D1 — May a Mission carry a position at all? — **DECIDED**

This was a tradecraft release decision, not an engineering one, and it gated
every line of Mission→Globe code.

Missions are broadcast to public Nostr relays by `missionService.publishToNavcom`.
Locked Decision #7 (`MissionPackageBuilder.ts:1-11,35-38`) states that linked
reports and cases cross the boundary **as counts only** — "never as their real
content or ids, so nothing resolvable back to a specific Starcom-internal
record leaves the boundary."

A position *derived from those very reports* is strictly more resolvable than a
count, and a parameterized-replaceable relay event cannot be recalled.

The irony worth stating: Missions are the *only* half of this brief with real
link data behind them (`MissionsPanel.tsx:301-326` genuinely writes
`relatedReports`/`relatedCases`). The derivation would work. What it would
produce is the thing the boundary exists to strip.

**DECIDED — position stays internal only.** A Mission may carry a position for
in-app display; it does not cross the Navcom boundary. Recorded with its
verification and its one known gap in
[`../01-architecture-decisions/mission-position-boundary.md`](../01-architecture-decisions/mission-position-boundary.md),
and enforced by a `Navcom boundary — mission position (D1)` test block written
before the geo field exists, so adding one cannot route it into a package
silently.

**Two claims in the original audit overstated the risk and were corrected on
verification** — recorded because the corrections are the reason this was safe
to decide rather than a reason to relax the boundary:

- The audit said `PackageComposer` spreads metadata through unredacted. True of
  the *ComposeInput's* metadata — but `buildMissionPackageComposeInput` never
  routes `mission.metadata` into it. It composes an explicit **allowlist** of
  five fields, so the boundary already held by construction. An allowlist makes
  every future field opt-**in**.
- The audit flagged `ContextBridge.syncGlobeFocus` as a second egress, since it
  puts raw lat/lng into a chat message on every focus change. It does — but
  `useCollaboration().sendMessage` is a mock in *both* branches of
  `useUnifiedGlobalCommand.ts`, and `RealTimeEventSystem` is in-process pub/sub
  with no network egress. Nothing leaves the browser that way **today**; if the
  collaboration layer is ever given a real transport, this becomes real and D1
  applies to it.

The residual real gap is a coordinate typed into a **free-text briefing**, which
`maskDigits` (nine-or-more digit runs) does not catch. There is a test asserting
that real behaviour rather than hiding it.

### D2 — What is a Case's location?

At least four defensible answers, each a different product with a different
renderer and a different claim to the user: its own stored coordinate; the
centroid of linked evidence; one pin per linked report; the most-recent linked
report.

Two facts should weigh on that choice, because the codebase has already
answered adjacent questions and a Case rule must adopt or consciously overrule
them:

- **The repo averages coordinates, but only under a precondition.** *(Corrected
  — this bullet originally claimed the repo's answer was simply "don't", which is
  true of `computePlaceClusters` and false of the repo.)* `computePlaceClusters`
  (`correlationUtils.ts:92-110`) bins to a 1° grid, averages only *within* a bin,
  and emits nothing below count 3 — but `findingForBucket` (`:796-803`) does
  compute `avgLat`/`avgLon` and publish it as a finding's location. The real rule
  is a **conditional centroid**: average only across points already mutually
  within `CONFLICT_DISTANCE_THRESHOLD_KM`, from at least two independent feeds,
  and only when the entity has no unresolved conflict. So D2 must split
  **B-naive** from **B-guarded** — the precondition is the load-bearing half, and
  without that split this correction reads as a general licence to average.
- **The correlation engine treats multi-location as a finding, not noise.**
  Beyond 100km within 24h is a `LocationConflict` (`correlationUtils.ts:164-166`),
  rendered in the most saturated colour on the layer by explicit choice
  (`useGlobeIntelMarkers.ts:41-49`). Averaging would draw a confident pin where
  no source claimed anything, on the same globe where the contradiction is
  meant to be the loudest thing on screen. `globeIntelLayer.ts:96-101` refuses
  to jitter coincident marks for exactly this reason: *position IS the claim.*

**Recommendation: if the underlying user need is "see where this case's evidence
is," build it as a set of report pins with an explicit unplaceable count — what
the codebase's own discipline points at — rather than a single derived pin.**

### D2a — an unanswered question underneath D2

**What does a Report's `latitude`/`longitude` actually mean?** Never stated.
`IntelReportUI.ts:35-36` is a bare pair with no comment, while the temporal
fields two lines below got their ambiguity resolved explicitly. Event location,
collection location, or analyst location? All three read plausibly under a
single report title. Any aggregation rule requires picking a reading
retroactively for every existing report — or writing a tooltip that is false.

## Blocked on missing prerequisites

**Case placement is blocked on a link-writing UI that does not exist.** This is
the finding that most changes the estimate, and it kills the cheap route
("derive position from `relatedEntities`, no schema change needed").

`case.relatedEntities` has **no product writer**. The only writers into a
persisted case are `caseManagerAdapter.addCase` passthrough, `updateCase`, and
`linkEntitiesToCase` — and `linkEntitiesToCase` has five references in the
entire tree, all of them its own definition and hook plumbing
(`caseManagerAdapter.ts:301`, `useCaseManager.ts:39,279,281,627`), with zero
callers in `src/pages` or `src/components`. `CasesDashboard`'s save payload is
title/description/priority/classification/tags only. The investigations
migration sets none.

*To re-check:* `grep -rn "linkEntitiesToCase" src/ | grep -v __tests__` — if
that still returns only definition-and-hook lines, every Case in the running
app still has `relatedEntities === []`.

A derived-position resolver built today returns nothing for 100% of real
records — **and would pass its own unit tests against hand-built fixtures.**
`contradictionProducer.ts:9-19` documents a prior bug of exactly this shape on
exactly this field.

There is one writer that looks like an exception and is not:
`analyzerAdapter.linkAnalysisToCase` writes `relatedEntities` into
`storageOrchestrator`'s `CaseRecord` — a *different store* from the
`intelCaseService`/`intelWorkspaceManager` one the Case UI reads — and what it
writes is an *analysis* id, which no report-or-item lookup resolves to a
coordinate. Its only consumer is a hook method with no component caller.

**Building that linking UI is a feature with its own picker, persistence and
tests. It is not a sub-task of a globe affordance.**

**A Cases-dashboard button is blocked on a navigation mechanism with no
precedent.** `/cases-dashboard` is a standalone `BaseLayout` route
(`routes.tsx:148-153`); `ApplicationRenderer` is mounted only at
`MainPage.tsx:57`; and `navigateToApp`'s entire effect is a `setState` with no
react-router navigate. Copying the report button onto `CasesDashboard`
compiles, passes a test asserting `navigateToApp` was called, and changes
nothing on screen. Missions escape this — they live inside `teamworkspace`, a
registered app.

**Reciprocal links from IntelWeb are blocked on IntelWeb having no outbound
routing at all.** Zero matches for `navigateToApp`, `useNavigate` or
`useApplicationRouter` anywhere under `src/applications/intelweb/`. Same for
`marketexchange`, `teamworkspace`, and `netrunner` (whose one outbound is a URL
shim).

## Repair before extending

The existing Report→Globe affordance should be fixed before it is copied. This
is prerequisite to every additional producer, and it is the only way "copy the
existing pattern" becomes true rather than aspirational.

- **No layer activation.** The handler moves the camera and nothing else.
  Report markers are gated on visualization mode
  (`useGlobeIntelReportPipeline.ts:261`) and additionally subject to a priority
  filter and a `maxReports: 50` cap (`useCyberCommandSettings.ts:164`). The
  camera can therefore arrive at a location where the report it was sent to is
  not drawn.
- **No focus lifecycle.** Nothing anywhere passes `null` to `setFocusLocation`
  (*to re-check:* `grep -rn "setFocusLocation(null)" src/`). `GlobeProvider` is
  app-level while the Globe unmounts on app switch, so every subsequent return
  to the globe re-flies to a stale target, forever.
- **No consumer-side test.** Existing coverage asserts the two producer calls
  fired and stops. That is precisely the mechanism by which this affordance is
  simultaneously green in CI and blank in the product.

## Explicitly dropped — and why, so it is not re-proposed

- **Reciprocal returns from IntelWeb, marketexchange and teamworkspace.** No
  outbound routing exists in any of them, and there is no chrome surface to host
  a back control: `ApplicationRenderer.tsx:104` suppresses the app header for
  the whole app list, and the modal close button is the only `goBack()` trigger.
  That single fact — not neglect — is why 6 of 7 existing edges are one-way.
- **IntelWeb ontology extension for Cases, Missions and IntelItems.** The vault
  is built from reports alone (`IntelWebIntegrationService.ts:87`) and emits
  three node kinds. A fourth means a closed union plus four duplicated
  colour/type lookups. Two of the three named source apps have no coherent
  target to link to.
- **Globe marker-family restructure**, unless a second entity family is actually
  approved. `Globe.tsx:934-944` is an exclusive if-chain, not a merge, and two
  families already contend for one slot.

## Router transport — only if the count justifies it

`ApplicationContext` is `[key: string]: string | number | boolean | null |
undefined` (`EnhancedApplicationRouter.tsx:34-36`), which is exactly why the one
spatial handoff smuggles coordinates through `GlobeContext` instead. Context
also merges forever with no clear function and no restoration in `goBack`.

Widening it — plus a scoping model, a re-delivery signal, and `goBack`
restoration — is coherent work with a bounded blast radius. But for one or two
handoffs the existing side channel is survivable. **Do this only on committing
to more than two or three affordances.**

One trap to clear either way: `preserveState`/`restoreState` — the only
object-capable channel in the type surface — has zero call sites and is backed
by a module-level `Map` that would not re-render (*to re-check:*
`grep -rn "preserveState" src/ | grep -v __tests__` returning only
`EnhancedApplicationRouter.tsx` lines). Wire it or delete it; leaving it invites
someone to mistake it for the answer.

## Sequencing

1. **Ship alone:** IntelWeb report deep-link, forward only, from IntelDashboard
   — with centering and a hidden-by-filters state. Do not bundle it with
   anything geospatial.
2. **Repair, don't extend:** fix Report→Globe (layer activation, focus
   lifecycle, consumer-side test).
3. **Decide D2 before estimating** anything Case-spatial. If the answer is
   "derived from linked evidence," the entity-linking UI is the actual next
   ticket.
4. **Mission→Globe is unblocked for in-app display only** (D1 decided: the
   position never crosses the Navcom boundary, enforced by test). What still
   gates it is the same placement-semantics question as D2 — what a position
   derived from N attached reports actually claims. Missions at least have real
   link data behind them, which Cases do not, so this is the half where a
   derived position could be built once the semantics are chosen.

## The scoping ambiguity nobody resolved

"Cross-app affordances" is a product of source surface × entity type × target
surface. A disciplined minimum — camera-fly only, report nodes only, one
direction — is roughly six affordances. A face-value reading with "reciprocal"
honoured is roughly twenty-five. Nobody bounded which was meant, and the
estimate priced the bottom of that range.

That ambiguity, more than any single technical blocker, is why the estimate came
out small.
