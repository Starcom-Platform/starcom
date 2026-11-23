# Building forward: Intel → Case → Mission

Written 2026-09-20, after reading the code rather than the plans. Every claim about
what exists carries a `file:line`; everything else is marked **proposed** and has not
been built. The distinction matters here more than usual, because this repository's
own audit found the app's structure "much messier than it looks" — several things
looked wired and had no reachable trigger.

The ask this answers: better UI, better and new globe visualisations, a clearer
Intel → Case → Mission flow, and Missions/Objectives/Packages thought through
properly. The order below is the recommendation; the reasoning for the order is
stated, so it can be argued with.

---

## What is already true

Stated plainly so the plan does not rebuild it.

- **The pipeline exists end to end.** A report can be created, attached to a case,
  a mission can be assembled from cases and reports, walked through its status
  machine, signed (ML-DSA-65) and broadcast (Nostr kind 30079).
- **A Case or a Mission can be shown on the globe**, and says what of it is not
  drawn — `linkedRecordPlacement.ts`, `GlobeShownRecord.tsx`. Neither has a
  location of its own; both borrow their linked reports' pins. That was decided as
  option C in `case-location-semantics.md`, because "a centre worked out from its
  evidence would mark a place where nothing was reported."
- **Foreign Mission Packages are received, verified and now listed** —
  `MissionPackageIngest.ts`, `ReceivedPackagesPanel.tsx`.
- **Nine globe layers honour a chosen marker style**, and the style system,
  including the shared glow object, is built (`markerStyles.ts`).
- **There is a shared vocabulary for stating absence** — `epistemicLanguage.ts`.
  It is the single most valuable asset for this work and every phase below leans
  on it rather than inventing wording.
- **Pipeline health is already measured**: evidence per mission, share of reports
  reaching one, missions resting on nothing (`pipelineMetrics.ts`).

## The five findings this plan is built on

**1. An objective carries nothing that makes work doable.**
`MissionObjective` is `{ id, description, completed }` (`MissionUI.ts:49`). No owner,
no expected artifact, no effort, no evidence link, no ordering. A mission is
therefore a title, a briefing and a checklist of sentences. Everything downstream —
who would do this, what they would hand back, whether it was worth doing — has
nowhere to live.

**2. ~~No lifecycle records an outcome.~~ — WRONG, withdrawn 2026-09-20.**
A case records exactly that, and with more rigour than this plan proposed.
`CasePosition` (`IntelCaseUI.ts:121`) carries a prose `statement`, a structured
`CaseVerdict` of `substantiated | unsubstantiated | inconclusive`, an `addressed`
map saying how each linked contradiction was dealt with, and who adjudicated when.
`IntelCaseService` gates RESOLVED on having one. It is written by
`statePosition`, wired adapter → `useCaseManager` → `CasesDashboard`, which also
renders it.

The proposed additions `superseded` and `not-worth-pursuing` were already
considered and refused, in a comment at the gate: CLOSED is deliberately NOT
gated, because "closing without concluding is a real and legitimate outcome …
forcing a position there would produce fabricated conclusions to satisfy a check."

Phase 2.2's Intel → Case gesture exists too: `FindingsPanel` and
`PeerClaimsPanel` both navigate to Cases with `openCaseAbout` seeded.

*This is the second withdrawn finding, and the two share a cause worth naming:
this plan was written by reading SCREENS and inferring the model behind them. In
this repository the model consistently leads the UI — so "the app does not do X"
reliably means "no screen surfaces X", and the fix is usually to surface what is
already there rather than to build it.*

**3. A mission's only spatial expression is borrowed pins.**
Point geometry works. A jurisdiction-level subject ("Virginia") and a subject with
no location at all have no representation — and the second is a whole class of
work: funding, congressional, self-audit.

**4. The live relay path is silent about what it refused.**
Events carrying `#starcom_intel` with no geo encoding are dropped before parsing and
counted only as `droppedNoGeo` (`NostrStarcomIntelIngest.ts:777`), surfaced as a
*quality ratio* in the marquee. The findings layer already does this properly —
`unplaceable: { count, reasons }` with a rendered disclosure
(`globeIntelLayer.ts:97`, `GlobeIntelStatus.tsx:83`). The precedent exists one layer
over.

**5. ~~App switches do not touch the URL.~~ — WRONG, withdrawn 2026-09-20.**
This was written after reading `navigateToApp` alone, which does only set React
state. It missed `useApplicationUrl` (`src/pages/MainPage/useApplicationUrl.ts`),
mounted in MainPage, which moves the URL when the app changes and the app when the
URL changes, and resolves the case where both move together. Eight tests cover it.
Back, Forward, reload and deep links all work across this flow today.

The router does additionally keep an in-memory `history: ApplicationId[]`, but it is
not a shadow of the browser's: it drives the marquee's "N APPS THIS SESSION"
readout (`usePrimaryMarqueeData.ts:424`), the demo navigator's Back button, and
`ApplicationRenderer`'s modal close. Deleting it breaks three live things — tried,
reverted.

*Kept in this document rather than quietly edited out, because the mistake is
instructive: a grep of one function, and a `head` that truncated the consumer list,
produced a confident finding about navigation being broken when it works.*

---

## Order of operations

The ordering rule: **things every later phase leans on come first; anything that
changes a shape already published to a peer comes last.** Phases 0–2 need no
coordination with anyone. Phase 4 does.

### Phase 0 — Make the flow honest (foundation)

**0.1 — ~~One history, the browser's.~~ Dropped.** See finding 5: navigation already
works in both directions and the in-memory history is load-bearing elsewhere. There
is nothing to do here, which makes Phase 0 half the size it looked.

**0.2 — Say what the globe refused.** Extend the ingest to report what arrived and
could not be placed, with reasons, and disclose it where the globe already discloses
such things. Reuse `unplaceableRecords`. *Why here:* it is small, it uses an existing
pattern, and it converts an invisible drop into a number that Phase 3's non-map
surface can then act on. *Check:* publish a `#starcom_intel` note with no geo
encoding; the globe states one was refused and why.

**Risk to watch:** `useGlobeIntelReportPipeline.ts:422` deliberately logs rather than
discloses the hydration path's skipped count, because "a count from here would be a
second answer to one question." 0.2 must answer a *different* question — what
arrived and was refused — not restate what is missing from the drawn set.

### Phase 1 — The objective becomes the unit of work

This is the centre of the whole plan. Missions do not feel real because the objective
is a sentence with a checkbox.

**1.1 — Enrich the model (proposed).** An objective gains: expected artifact (what
the doer hands back), effort (an honest estimate), limits (what must not be done),
who benefits, and an evidence link (which report or finding it rests on). Keep
`completed`, but let it be satisfied *by* an artifact rather than by a click.

Mecha Jono's published archetype model is worth reading here — not to adopt, but
because it is a peer's worked answer to the same question, with effort, artifact,
limits, presence and beneficiary per instrument. Their document is a proposal, not a
schema we owe conformance to.

**1.2 — The objective UI.** A mission detail view where each objective shows its
artifact and its evidence, and where an unmet objective explains what is missing
rather than sitting unchecked. Objectives become orderable.

**1.3 — Objectives carry into the package.** The builder already synthesises a single
entry from briefing and objective descriptions. With 1.1 in place, a package can
carry structured objectives — *within the position mask*, which is unchanged.

*Check:* create a mission, give an objective an expected artifact and an evidence
link, and see both survive into the published package (with positions still masked).

### Phase 2 — ~~A Case records what it concluded~~ Already built

See finding 2. The vocabulary, the gate, the writer and the view all exist, and
the two values this plan wanted to add were considered and refused on the record.
**Nothing to do.** If anything here is weak it is discoverability — stating a
position is reachable only from the case dialog — and that is a UI question to
raise on evidence, not a modelling gap.

### Phase 3 — Globe visualisations

Only now, because what the globe should *say* depends on Phases 1 and 2 existing.
Visual appeal decides ties; quality steps down on weak clients.

**Better (upgrade what is there):**

- **The shown-record state.** Today: linked pins plus a text panel. Proposed: the
  linked pins visually distinguished from the rest (the glow object already exists),
  the camera framing the evidence, and "what is not here" expressed on the globe
  rather than only in the panel — the count already exists in
  `placeLinkedRecords`.
- **Refused intel, visible.** Phase 0.2's count, shown as a badge that opens the
  non-map list rather than a line of text that dead-ends.

**New — all three, in the order their premises actually support.**
Each premise was verified at the model on 2026-09-20, after two findings in this
plan were withdrawn for having been inferred from screens. The order below is the
*reverse* of this plan's first recommendation, because checking changed the costs.

**C first — open work (cheapest, needs nothing new).** Where a mission's work is
open versus claimed. `placeLinkedRecords` is a pure function taking ids, reports
and items, so it can be run per mission in bulk; `missionService.listMissions()`
and `intelReportService.listReports()` both exist and `readShownRecord` already
uses the latter; and `claimedBy` landed with Phase 1. No model change, no new
machinery, and it is the first globe layer that invites action rather than
reporting state.

**A second — areas drawn as areas (needs a model change).** The parser yields
`point | line | polygon` and `representativePoint` reduces lines and polygons to
one pin, tagging the report `geometry:<how>` so the reduction is never silent
(D-F 17). But the rings themselves are **discarded at ingest**: `IntelReportUI`
holds `latitude`/`longitude` and no geometry, and the raw `content` is truncated
to 8000 characters, so re-deriving a large shape later is unreliable. Drawing
areas therefore means carrying geometry on the report — persistence, size and
encryption-at-rest all in scope. The rendering route exists either way:
territories are `THREE.Mesh` built from baked meshes, and react-globe.gl's
`polygonsData` is unused.

**B last — coverage and absence (needs a decision before it needs code).** This
plan called it the cheapest; that was wrong. Two things are missing. There is no
point-to-region machinery — `eventAggregation.ts` counts GDELT events per country,
but those events *arrive* naming a country, whereas an intel report is a bare
coordinate. And "coverage" needs a denominator: which regions are supposed to have
intel? A lat/lon grid is computable today and mostly meaningless over ocean; a
territory denominator needs point-in-polygon that does not exist. The denominator
is a product decision and should be taken deliberately rather than implied by
whichever is easier to compute.

Each new layer registers in the existing mode taxonomy
(`CyberCommand | GeoPolitical | EcoNatural`) and honours the marker-style contract,
so the switcher keeps working and `markerStyles.ts` stays the one place a layer's
alternatives are declared.

### Phase 4 — Packages as a two-way surface

**4.1 — Act on a received package.** The list and detail exist. The missing verb is
what an operator does next: acknowledge, decline with a reason, or open a local case
*referencing* it — never silently importing it, because a verified package is a true
statement by another node, not a record here.

**4.2 — Then, and only then, the coordination questions.** Two are open and both are
decisions rather than work:

- Our published interchange spec documents Mission Package, Dispatch Capability,
  Finding and Refutation, and **says nothing about the globe intel event**. A peer
  cannot reach the globe without guessing. Documenting it is small and unblocks
  anyone.
- Locked Decision #7 keeps mission position internal. Any geo-bearing package —
  inbound or outbound — runs into it. This plan does not touch it; it flags that
  Phase 3's region work and any peer's point data will eventually ask the question.

---

## Robustness passes, between phases

A phase is not finished when its feature works. Each of these runs *between*
phases, on the phase just completed, before the next one starts. They exist
because this document's own history supplies the failure modes: two findings were
withdrawn for being inferred from screens, one proposed vocabulary duplicated an
existing one, and two tests passed against the exact defect they were written to
prevent.

**R0 — Verify at the model, not the screen.** Before building anything, read the
type, the service and the guard that govern it. "The app does not do X" in this
repository reliably means "no screen surfaces X". Never conclude from an absence
in a truncated search: a `head` cut a consumer list short in Phase 0 and produced a
confident wrong finding.

**R0b — Trace the WHOLE lifecycle of a field, not the path you are building.**
Adding `outline` to a report, the path ingest → marker → globe was traced and the
path record → storage → record was not. `uiToWorkspaceReportData` writes an
explicit field list, so the shape was dropped the moment the report was persisted
and the globe drew the round-tripped copy — a shape that survived until it was
saved and never afterwards. Every unit test on both sides of that boundary passed.
For any new field, assert the ROUND TRIP: save it, read it back, compare. The same
question was then asked of the objective fields added in Phase 1, where the answer
happened to be yes, and is now pinned by a test that fails if a mapper is ever
introduced.

**R1 — Check for an existing vocabulary.** Before adding a type, enum or wording,
grep for what is already there. `CaseVerdict` already said
`substantiated | unsubstantiated | inconclusive` when this plan proposed
`supported | unsupported | undetermined`, and a fourth vocabulary would have been
added to a plan whose complaint was that there were three. `epistemicLanguage.ts`
owns absence wording; adding a sentence there is right, inventing one beside it is
not.

**R2 — Mutation-test every new assertion, and never assert an ABSENCE against
concatenated text.** `textContent` joins siblings with no separator, so a
word-boundary regex over it silently matches nothing: "…record" + "1 h" +
"unclaimed" reads as `record1 hunclaimed`, and "…about this" + "Import into
workspace" reads as `thisImport`. Both defeated a test written to prevent
exactly the thing that was then added. Assert over ELEMENTS — `queryByText` with
an anchored matcher, or `getAllByRole` enumerated and compared.

**R2 (original) — Mutation-test every new assertion.** A test that cannot fail is worse than
no test, because it reports safety. Break the behaviour deliberately and watch the
test fail; restore and watch it pass. Two tests this session passed against the
defect they were written for — one asserted over concatenated `textContent`, where
`"…record" + "1 h" + "unclaimed"` reads as `record1 hunclaimed` and a word-boundary
regex matches nothing.

**R3 — Re-read the decisions the change touches.** Locked Decision #7 (mission
position stays internal), option C (no case or mission has a location of its own),
D-C (no invented assessment), D-E (event time with stated fallback), D-F 17 (an
area stands at its centre, and says so). A change that contradicts one of these is
not a bug to be found later; it is a decision being reversed without anyone
deciding.

**R4 — Run the whole local gate, and `npm run build` IS the gate.**
`npm run typecheck`, `npm run lint`, `npm run guards`, the affected suites, and
`npm run build`. Not `npx vite build`: that compiles the app and skips the
chain around it — sixteen guards, the conformance vectors, publish-spec and
verify:netrunner. A console migration broke verify:netrunner and produced five
failed production deploys before anyone noticed, because every local check that
series ran was `vite build`. There is no CI: the local gate is the
only gate. `guard-untracked-imports` caught a file imported but never `git add`ed
this session — a build that works locally and dies on a clone.

**R5 — Run the thing. Not between phases: before any commit claiming a
user-visible behaviour.**

Promoted from a between-phases pass on evidence. Running the globe against a real
relay found three defects in one session that the tests structurally could not:

  A disclosure that could only speak alongside another disclosure, because the
  early return listed every reason but its own — and every test passed, since the
  default fixture always has a findings layer.

  A field lost at the storage boundary (R0b), where unit tests on both sides were
  green.

  A measurement that measured nothing: "the ingest saw zero events in 35s" was
  taken in node, where `start()` returns immediately without `window`.

`scripts/dev-relay.mjs` exists so this costs no public infrastructure: publish a
real signed event to a local relay, build pointing at it, load it headless, and
read what the page actually says. Where the network cannot supply the case, the
honest close is naming what was proven against the inputs and what was not proven
against traffic.

**R5b — For anything visual, confirm the PIXELS, not the text beside them.**
Region marks drew correctly and could not be seen: the layer was set to 0.38
opacity while the base borders render at 0.85, so the highlight was fainter
than the lines it sat on. Every test passed — they assert that geometry reaches
the scene, which it did. Several features in this series were signed off on a
disclosure sentence appearing in the DOM, which is not the same as a person
being able to see the thing the sentence describes. Screenshot it, and look.

**R6 — Read the diff as a stranger.** Does each comment still describe the code
beneath it? A stale comment two lines above a changed value is how the intake's
"Match Navcom's default/search relay surface" came to sit above a set that was no
longer Navcom's.

## What this plan deliberately does not do

- **No new rank or progression system.** `user-stories.md` recommends against it and
  nothing has changed.
- **No conformance to anyone else's schema**, and none claimed of ours.
- **No speculative architecture.** The audit's central lesson was structure built
  ahead of real need; every phase above is reachable from a screen that exists.

## How to check the whole thing

The honest end-to-end test is unchanged and still unmet: **a foreign claim reaching
the consumer.** `npm run ingest-check` reports it from the other end — today the only
attested claims on The Record are this node's own. No phase here can close that
alone; it needs someone else to publish. That is a fact about the network, not a
reason to wait: Phases 0–3 are all worth doing for a single operator working alone.
