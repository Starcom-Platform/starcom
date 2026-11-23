# Plan after the four decisions

Four decisions were taken (recorded individually in
`01-architecture-decisions/`). This is what they imply, audited rather than
assumed — including one live defect the audit found that would have made the
first item actively harmful if built in the obvious order.

## The decisions

| | Decision | Taken |
|---|---|---|
| **D-A** | The case replay states its coverage rather than implying completeness | ✅ shipped (`45e4160c`) |
| **D-B** | A Mission is **downstream of** a Case: Report → Case → Mission | recorded (`99b76db9`) |
| **D-C** | The globe is an **evidentiary display**; honesty wins over density | recorded (`99b76db9`) |
| **D-D** | Starcom is a **faithful reader** of the network: ingest every feature | recorded (`99b76db9`), built (`b758c520`) |

---

## The thing that changes the order

**D-D cannot be built first. Built first, it makes the app worse.**

`adaptReportsToEvents` sets `feedId: report.id`
(`eventsAdapter.ts:235`), commented *"A report is its own independent source:
authored separately, by a person."* Corroboration then requires **two
independent `feedId`s** (`correlationUtils.ts:485-493`).

So today, **every report is its own feed** — "corroborated by two independent
sources" means only "two reports exist". Two posts from the same Nostr pubkey
already corroborate each other.

Now apply D-D naively: one 50-feature event becomes 50 reports, each with its
own `feedId`. **A single publisher's single event would corroborate itself
fifty times over.** That converts a data-loss bug into a
confidence-*fabrication* bug — strictly worse under D-C, and worse in the
direction that matters, since it inflates rather than deflates.

The contrast that proves this is a defect rather than a choice: the
**observations** pipeline models feeds correctly. `observationsToEvents.ts:59`
uses `feedId: obs.upstreamSourceId ?? obs.sourceId`, and its adapters populate
`derivesFrom` (`naturalEventAdapter` → `['usgs-earthquakes']`, `gleifAdapter` →
national registers). The corroboration tests assume exactly that model —
`feedId: 'ucdp-ged'` shared across `sourceId: ucdp-row-1/2/3`, counting as
**one** feed.

Two pipelines feed one corroboration engine. One of them is rigorous. The other
makes every record a source.

---

## Must do — live correctness

### M1. Feed identity for reports *(prerequisite for M2)*

**Done in `b41abeee`** (2026-08-30).

`feedId` should answer *"what could be independently wrong?"*, not *"which
record is this?"* Two reports by one analyst share a failure mode; so do two
events from one pubkey.

- **Nostr-ingested** → the publisher: `nostr:${pubkey}`. `author` already holds
  it (`NostrStarcomIntelIngest.ts` sets `author: safeEvent.pubkey`).
- **Hand-authored** → the author.
- **Features from one event** (after M2) → additionally share the event, so
  `derivesFrom: [eventId]` collapses them even if publisher identity is ever
  loosened.

**Consequence to state plainly:** this *reduces* corroboration counts, and for a
solo operator with no ingest, nothing will ever be corroborated — because
nothing is. That is correct and it is stark. Corroboration becomes meaningful
exactly when there are genuinely multiple publishers, which is the real use
case (a local analyst plus the Beu's feeds).

`CorroborationGapsPanel` will correspondingly list *more* single-source claims.
Also correct: they were always single-source.

**Risk:** existing corroboration tests encode the report-side behaviour. Expect
to rewrite assertions, and treat any that resist as a finding.

**Size:** ~1 day.

### M2. Ingest every feature *(D-D)*

**Done in `b758c520`** (2026-08-30).

`parsed.features[0]` is taken and the rest discarded; the parser slices
collections at 50. `accepted` increments by 1 and every drop metric reads zero,
so up to 49 claims vanish with the metrics clean. A polygon becomes one corner
vertex (`rings[0][0]`).

Pieces:

- **Report identity.** `id: safeEvent.id` today — the report id *is* the event
  id, so N features collide on one id. Needs a compound id
  (`${eventId}#${featureIndex}`), which touches `seenIds` and `reportIds`
  eviction.
- **Feed identity** from M1, so the N reports are one source.
- **Geometry.** A line and a polygon are not points. Either keep reducing to a
  representative vertex *and say so per record*, or carry the geometry. Reducing
  silently is the current defect in miniature.
- **Metrics** that make any remaining reduction legible, rather than a clean
  `accepted: 1`.

**Size:** ~1–1.5 days. **Blows up if:** the parser's 50-cap turns out to matter
in practice, or if compound ids break an existing dedup assumption.

---

## Must do — record the decisions

### M3. Decision records for D-B, D-C, D-D

**Done in `99b76db9`** (2026-08-30).

D-A is already recorded in code and guard. The other three are currently only in
conversation, which is the least durable place they could be. Same shape as
`mission-position-boundary.md`: the decision, why it needed deciding, what was
verified, and the known gap.

**Size:** ~0.5 day.

---

## Should do — structural consequences of D-B

### S1. Case → Mission back-link

**Done in `99b76db9`**: derived by `useCaseMissions`.

`MissionUI.relatedCases` points Mission → Case. `IntelCaseUI.relatedCases`
points at **other Cases**. So a Case cannot see what was built from it, which
under D-B is backwards: the Case is upstream and should show its output.

**Derive it, do not store it.** `missionService.listMissions()` filtered on
`relatedCases.includes(caseId)`, with `onChange` for updates. A stored
back-reference is a second source of truth that can desync from the forward one;
a derived lookup cannot. `MissionsPanel` already does the mirror-image filter,
so the pattern exists.

**Size:** ~0.5 day.

### S2. Make the pipeline say Report → Case → Mission

**Done in `99b76db9`**.

D-B contradicts what the app currently tells people, in three places:

- `03-pipeline/README.md:4` describes *"Report → Case/Mission attachment"* —
  Case and Mission as **parallel** targets.
- `usePipelineProgress` tracks report → mission → packaged, with **no Case
  step**. Adding one keeps the derived-not-narrated property (a real count from
  `intelCaseService`), so it stays honest.
- `03-pipeline/user-stories.md` walks Priya/Marcus/Aisha through the old shape.

**Size:** ~0.5 day.

### S3. The Case-location decision doc (D2)

**Written in `99b76db9`; decided 2026-09-13 (option C).**

Now writable, because D-B settles the relationship and Q2 settled that a
report's coordinate means *where the report is about*.

**Recommendation to put in it, not to assume silently:** neither a Case nor a
Mission gets a synthesized pin. A Case shows *its reports' actual pins* with an
explicit unplaceable count; a Mission shows *its Cases'*. The codebase's own
rule is that averaging separated points draws a confident mark where no source
claimed anything, and `globeIntelLayer` refuses to jitter coincident marks
because *position IS the claim*. Under D-C that settles it. Two derivation hops
(Report → Case → Mission) makes a single derived dot even less defensible.

**Size:** ~0.5 day.

---

## Design first — the consequence of D-C

### D1. An epistemic vocabulary

**Built in `7d3fd04f`** and extended since (the last three commit surfaces in `e13220df`). On 2026-09-13 (`d089d3a8`) `RLSHPopup`, `IntelReportTooltip`, `IntelReportPopup` and the HUD `TimelineView` moved onto it; re-check with `grep -L epistemicLanguage` on those four files. Two surfaces stay without it on purpose. `App` renders no statement about missing data. `ConnectionStatusDashboard` keeps its own feed-health wording, by decision: it reports whether a service connection is up, not what a view leaves out, so a data screen affected by an outage says so in this vocabulary and the dashboard does not.

D-C's real implication is not "more badges". It is that the app already computes
a rich epistemic state and presents it **sixteen different ways**.

Rendering surfaces that already show some epistemic status: `App.tsx`,
`DataIntegrityBanner`, `CaseReplayPanel`, `RLSHPopup`, `IntelReportTooltip`,
`GlobeIntelStatus`, `Globe`, `SpaceWeatherStatusCard`,
`SpaceWeatherMetricsPanel`, `ConnectionStatusDashboard`, `TimelineView`,
`CyberCommandRightSideBar`, `StructuralFindingsPanel`,
`CorroborationGapsPanel`, `CorrelationContext`, OSINT `ResultsPanel`. There is
no shared component — `DataIntegrityBanner` is single-purpose and rendered in
one place.

The axes the code already computes, which a vocabulary would name once:

| Axis | Fields | The distinction that must not collapse |
|---|---|---|
| Fabricated vs real | `isMock`, `integrity.realRatio` | synthetic record ≠ inaccurate content |
| Placed vs unplaceable | `unplaceable.reasons` | "no coordinates" ≠ "not found" ≠ "wrong store" |
| Shown vs withheld | `truncated`, `hiddenByPriority`, `hiddenByTimeWindow`, `expiredLayers` | "not shown" ≠ "nothing found" |
| Stated vs derived vs absent | `confidenceBasis.source`, priority `unset`, position | **nobody said ≠ someone said low** |
| Corroboration | `independentFeeds`, contested | single-source ≠ contested ≠ corroborated |
| Attribution | `unattributed` | unknown actor ≠ a name |
| Freshness | `ageMs`, `stale`, `expiredLayers` | stale ≠ absent |
| Completeness | `degraded`, `blindSpots` | sparse ≠ quiet |

Deliverable is a small shared family plus a **language rule set**, since the
recurring defect this session was linguistic before it was visual (`showLow`
never meant "someone said low"; "Description encrypted" not "open to view";
"matched / showing" not "showing N of M").

**Sketch before code.** Sixteen surfaces is a migration, so the first tranche
should be the three that already carry the most state — `GlobeIntelStatus`,
`CorroborationGapsPanel`, `CaseReplayPanel` — and the rest follow only once the
vocabulary has survived contact.

**Size:** sketch ~half a day; first tranche ~2 days.

### D2. Focus-target disclosure — *after* D1, not before

Previously planned as its own surface. Under D-C that is wrong: building it
first adds a **seventeenth** bespoke presentation of "why can't I see this",
immediately before deciding what those should look like. It is the vocabulary's
first real consumer, so it should be built *in* the vocabulary.

**Size:** ~0.5 day once D1 exists.

---

## Blocked

**IntelWeb report deep-link** — *no longer blocked: height given in `b2e03375`, deep-link built in `a2e048ea`.* Was gated on **Q5**: does the graph pane have
a non-zero height in the running app? No CSS rule exists for
`.intel-graph-container`, `.graph-engine-wrapper` or `.intelligence-graph`, and
`GraphEngine2D` sizes the SVG from a container height derived from that SVG.
Now that the render loop is fixed, opening IntelWeb and reading that number is a
two-minute check that decides whether the feature is viable. It needs a browser.

---

## Order

```
M1 feed identity ──► M2 ingest every feature
                     (M1 is a hard prerequisite)

M3 decision records    ─┐
S1 Case → Mission      ─┼── independent, any order
S2 pipeline says C→M   ─┤
S3 case-location doc   ─┘

D1 vocabulary sketch ──► D1 first tranche ──► D2 focus disclosure
```

M1 → M2 first: it is the only live *correctness* work, and the only ordering
that is genuinely forced. M3 next because undocumented decisions evaporate. The
S-items are independent and small. The D-track is largest and starts with a
sketch rather than code.

**Total: roughly 7–9 days**, of which ~2.5 is the live-defect track.
