# Open items — sequenced plan

Planning pass over the four items left open by
[`cross-app-affordances.md`](cross-app-affordances.md): the IntelWeb deep-link,
focus-target identity, the D2 Case-location decision, and the Case
entity-linking UI.

**The planning found more than it was asked to plan.** Four live product
defects surfaced that were in nobody's brief, and one of them outranks every
feature listed here. The brief's own premise also inverted: the item the audit
called "the ONE genuinely small piece" turns out to sit on a component that
does not render.

Claims below carry a `file:line`. The four defects marked **verified here** were
reproduced or read directly during this pass, not taken on report.

---

## Live defects — these are not features

### L1 — IntelGraph re-renders without bound (verified here)

**Done in `e0c6edfa`** (2026-08-30). Checked against the code on 2026-09-13.

`IntelGraph.tsx:411-424` calls `setGraphData` with a freshly-built object in
**both** branches, and lists `graphData` in its own dependency array. Each run
schedules the next. Even an empty vault loops, because `[].map()` returns a new
array.

`IntelGraph` is rendered unconditionally in the main content pane
(`IntelWebApplication.tsx:391`), inside an app registered in the router and
present in the bottom nav bar. **One click, any user.**

*Reproduced:* rendering `<IntelGraph vault={emptyVault} />` in jsdom did not
complete in 200 seconds (`timeout` exit 124). A **5-second per-test vitest
timeout could not preempt it** either — the loop is synchronous, so CI stalls
with no named failure rather than reporting one.

Two consequences for the fix's test design, both learned the hard way here:

- A render-budget counter placed in a *parent wrapper* never fires — the parent
  renders once and the child loops beneath it. The counter must observe
  `IntelGraph`'s own renders.
- The primary guard must therefore be a **referential-identity unit test** on an
  extracted `applyFreezeState` helper, which can be written red-first. The
  render-completes smoke test can only land *with* the fix; it cannot fail
  informatively before it.

Fix by returning the same array reference when nothing changes and using the
functional bail-out, so React stops structurally rather than relying on a
trimmed dep array:

```ts
setGraphData(prev => {
  const nodes = applyFreezeState(prev.nodes, frozen);
  return nodes === prev.nodes ? prev : { ...prev, nodes };
});
```

**A second, dormant loop of the same shape:** `applyIsolate` (`:451-459`)
unconditionally calls `setIsolateState` with a fresh object literal, and the
effect at `:471-478` depends on `isolateState`. Dormant only because
`active` defaults to `false` (`:110`); reachable via the
`intelweb:requestIsolate` window listener (`:481-493`) and the controls
(`:592`). **The empty-vault smoke test renders exactly the state where this is
dormant, so it must not be treated as proof L1 is done.**

**Third: the SVG is rebuilt every render.** `initializeSimulation`'s dep array
(`GraphEngine2D.tsx:354`) holds ten entries, four of which are fresh identities
on every render — `sizeScale` (inline at `:37-39`), `selectedNodes`
(`IntelGraph.tsx:515`), `onEdgeClick` (inline arrow at `IntelGraph.tsx:625`),
and `onNodeClick`, whose `useCallback` depends on `onFileSelect`, supplied as an
inline arrow at `IntelWebApplication.tsx:394`. `:99` then does
`selectAll('*').remove()`. Hold the callbacks in refs and drop them from the
array entirely, so a future inline arrow at any call site cannot reopen it.

*Corollary worth stating in the commit:* user pan/zoom is already broken, not
merely un-programmable. The zoom handler writes `transform` on the `g` captured
in its closure (`:112`), but `:99` wipes the SVG and `:123` appends a fresh `g`
with no transform.

### L2 — "priority not stated" is being narrated as "low" (verified here)

**Done in `1fb9c0cf`** (2026-08-30): `unset` is its own value, shown by default, with a v3 settings migration.

`getIntelReportPriority` returns `'low'` as an unconditional fallthrough for any
marker without an `URGENT`/`CRITICAL`/`HIGH`/`MEDIUM` tag
(`src/utils/intelReportPriority.ts:15-27`). `showLow` defaults to **`false`**
(`useCyberCommandSettings.ts:160`). The pipeline maps the fallthrough straight
onto that flag (`useGlobeIntelReportPipeline.ts:202-209`).

Every report the app creates for itself lands in that bucket: the globe context
menu tags `['user-created','context-menu']` (`Globe.tsx:1164`), the offline
branch tags `['location','offline']` (`Enhanced3DGlobeInteractivity.tsx:297`),
and Nostr ingest tags by relay.

**So: right-click the globe, create a report, and it is immediately invisible on
that same globe — with no signal**, because a priority-filtered report is not
counted in `intelTotalMatching` either.

This is the codebase's own discipline being violated one file over.
`correlationUtils` states it directly: *"`undefined` when any of them never
said, because unmeasured is not the same claim as genuine."* The filter
conflates *priority not stated* with *priority stated as low*.

**The trap neither planner saw.** Settings persist through a versioned
migration with a **shallow top-level merge** (`useCyberCommandSettings.ts:273-302`).
A returning user's stored `intelReports` object survives whole, `showLow: false`
included. Changing `defaultConfig` alone reaches **nobody who has ever saved
settings**. `SETTINGS_VERSION` must go to 3 with a migration, in the style of the
existing v1→v2 `commHubs` one — which is documented at `:284-292` precisely
because of this trap.

### L3 — the truncation notice cannot fire, and the honest number is unwired (verified here)

**Done in `fae6b0e8`** (2026-08-30).

`applyFilters` records `lastMatchingCountBeforeCap` and *then* slices to
`maxReports` before returning (`IntelReportVisualizationService.ts:337-341`). The
pipeline computes `intelTotalMatching` from that already-capped array
(`useGlobeIntelReportPipeline.ts:220`). So `intelTotalMatching > intelReports.length`
— the condition gating the "Showing N of M intel reports" notice at
`Globe.tsx:1404` — **is false in steady state**.

`getLastMatchingCountBeforeCap()` (`:121`) exists, is computed on every call, is
tested, and has **zero non-test callers**. Its own comment states its purpose:
*"so callers can show an honest 'showing X of Y' indicator instead of silently
truncating."* An honesty affordance, fully built, unwired — the exact shape this
initiative keeps finding.

The existing test `caps at maxReports after filtering`
(`useGlobeIntelReportPipeline.test.ts:153-162`) asserts `intelTotalMatching === 3`,
a state the real service cannot produce, because the mock ignores the
`maxReports` option it is handed. **Any new cap test written against that mock
would pass regardless of the bug.**

### L5 — editing a classified Case destroys it, silently (verified here)

**Done in `51e2a033`** (2026-08-30).

`openEditDialog` seeds the description field directly from
`caseItem.description` (`CasesDashboard.tsx:130`), which for a CONFIDENTIAL+
case is the stored ciphertext blob. The dashboard also renders it in the table
(`:350`) and searches it (`:179`).

An **untouched** blob survives, because `encryptFieldIfClassified`'s idempotency
guard `JSON.parse`s it and recognises `__classifiedEncrypted`
(`IntelWorkspaceManager.ts:44-60`). Edit one character and it is no longer valid
JSON — the parse throws, the value is treated as real plaintext, it is encrypted
again, and `classifiedDataKeyStore.put` overwrites the original key.

The guard's own comment describes the outcome exactly: *"making the first layer
permanently unrecoverable even though the 'encryption' appears to succeed with
no error."*

`decryptCaseDescription` (`IntelWorkspaceManager.ts:869`) has **only test
callers**. No UI has ever exercised this boundary correctly.

Two details the fix must not miss:

- The table must say `"Description encrypted"`, **not** "open to view" —
  `decryptCaseDescription` returns `null` when the key is genuinely missing, so
  the table must not promise recoverability the dialog will retract.
- `handleSaveCase` hard-blocks on a non-empty description (`:147-148`). If
  decrypt returns `null` and the payload omits `description`, the case becomes
  **permanently uneditable** — title, priority, status and tags frozen forever.
  Require non-empty only when the field is actually editable.

### L6 — the lowest confidence round-trips to the highest

**Done in `62730619`** (2026-08-30).

`intelReportUIToReportData` does `Math.round(c * 100)`
(`IntelWebIntegrationService.ts:32`); `normalizeConfidence` then does
`v > 1 ? v / 100 : v` (`:63-67`). Any confidence in `[0.005, 0.015)` maps to
exactly `1`, fails the `> 1` test, and returns as **1.0 — maximum**. It then
passes the `[0.3, 1.0]` graph filter it should fail, and under
`sizingMode: 'confidence'` draws as one of the largest nodes on the canvas.

Narrow window, maximal failure. **One hour, not a day.**

### L7 — Nostr ingest silently discards up to 49 claims per event

**Superseded by `b758c520`** (2026-08-30), which ingests every feature once D-D was decided.

`NostrStarcomIntelIngest.ts:649` takes `parsed.features[0]` and drops the rest;
the parser slices collections at `maxFeaturesPerCollection: 50`. `accepted`
increments by 1 and **no metric records the loss** — `droppedNoGeo` fires only
when `features[0]` is absent. A second, smaller reduction at `:664-671` maps a
line to `coords[0]` and a polygon to `rings[0][0]`.

Characterize with tests and comments. **Do not change the behaviour** — that is
a decision, not a cleanup, and it pre-empts D2.

---

## Sequence

Three independent tracks; order is forced *within* each.

```
Track 1 (globe)              Track 2 (cases)           Track 3 (docs)
─────────────────            ────────────────          ──────────────
1. L1  IntelGraph loop       5. L5 ciphertext fix      7. D2/D2a doc
2. L2  priority semantics    6. L4 + entity-linking       + L6 fix
3. L3  pre-cap count            picker                    + L7 characterization
4. Focus disclosure
```

**Why L1 first and alone.** The only item broken for a user right now in one
click, with no prerequisites. Burying it in a deep-link PR hides both the defect
and the feature. It also *unmasks*: three effects have been re-running
continuously, so the saved-position restore (`:394-408`), the isolate recompute
and the degree/metrics pass have never run at their intended cadence. **Budget
for finding a second defect.**

**Why L2 before the disclosure.** The disclosure's job is to explain why a
report is not drawn. If the most common answer is "a filter you never set is
hiding reports nobody classified," the honest fix is to stop doing that — not to
narrate it. Building the explanation first ships a well-tested apology for a
bug.

**Why L3 before the disclosure.** The cap message needs a truthful pre-cap
count, and the number already exists unwired.

**Why L5 before the linking picker.** The picker adds a second writer to a
screen whose first writer already destroys classified data.

---

## What is genuinely gated

**IntelWeb deep-link — deferred, and the audit's premise was wrong.** Two of its
three sub-tasks sit on a component that does not render (L1). The third —
graph centering — is **dropped entirely**: no CSS rule exists anywhere in `src`
for `.intel-graph-container`, `.graph-engine-wrapper` or `.intelligence-graph`,
and `GraphEngine2D` sizes the SVG from the container's `clientHeight`, which is
itself derived from that SVG. That is circular. Someone must open IntelWeb in a
browser after L1 and read the number (**Q5**).

The mechanical half is still small. It is simply *fourth in line*, behind three
live defects that were never in the brief.

**Focus-target disclosure — gated on L2 and L3**, then trimmed hard. What
survives: identity on the request **by allowlist, never a spread** — two of the
five `setFocusLocation` call sites pass objects straight off the event bus from
payloads that are *cast, not validated* (`ContextBridge.tsx:140`, `:207`), so a
spread lets any emitter inject a `label` that renders verbatim on the globe.
Then three honest messages (layer inactive; capped, now truthful; not in the
delivered set), plus a fourth the plan omitted: `getIntelReportMarkers` catches
its own fetch error and returns stale cache or `[]` (`:322-331`), so a failed
load currently arrives as an ordinary short delivery. "We could not load the
reports" is a different sentence from "your report is not here."

Make the wire a **compile error, not a test** — required props, explicitly
`null` when absent. That is the only guard available: **no test anywhere renders
`Globe.tsx`.**

---

## Explicitly dropped

- **Graph centering** — no measurable container height (above).
- **`analyzerAdapter.linkAnalysisToCase`** (`analyzerAdapter.ts:691-720`) —
  delete, do not reconcile. Its only consumer `useAnalyzerData` has **zero
  importers**. It reads from `storageOrchestrator`, a different store from the
  one the Case UI reads, so it would throw for every case the UI can produce.
  And it writes an *analysis* id into a field `contradictionProducer` joins
  against *report/item* ids — precisely the type confusion
  `contradictionProducer.ts:9-19` records as having already shipped once on this
  exact field. Its only live effect is to make `relatedEntities` look like it
  already has a writer.
- **Wiring `CaseReplayPanel`** — already mounted at
  `IntelDashboardApplication.tsx:14,28`. This deletes a planned step, and
  upgrades a risk from latent to live: shipping the linking picker without
  activity writes puts a wrong reconstruction (`linkedEntities: []` on a
  populated case, **with no gap raised**) in front of a real user, in the one
  artifact whose stated purpose is not requiring trust.
- **A source-text smoke test** asserting a JSX attribute exists. That is a
  confession, not a check. Use required props.

---

## Corrections to earlier documents

1. **[`cross-app-affordances.md`](cross-app-affordances.md) is wrong about the
   centroid.** It says the repo's answer to "reduce N coordinates to a
   placement" is *don't*. True of `computePlaceClusters`, false of the repo:
   `findingForBucket` (`correlationUtils.ts:796-803`) computes `avgLat`/`avgLon`
   and publishes it as a finding's location. The real rule is a **conditional
   centroid** — average only across points already mutually within
   `CONFLICT_DISTANCE_THRESHOLD_KM`, from at least two independent feeds, and
   only when the entity has no unresolved conflict. D2 must therefore split
   **B-naive** from **B-guarded**, or this correction reads as a general licence
   to average.
2. `ApplicationRenderer.tsx:104` still names the pre-rename `'nodeweb'`, so
   IntelWeb alone *does* render the app-header block — a one-word fix that
   contradicts the stated reason for dropping reciprocal links wholesale.
3. `Enhanced3DGlobeInteractivity.test.tsx` is `describe.skip` at `:55` — 16
   tests, 16 skipped, with a module-level mock targeting a hook that no longer
   exists. Anything added inside it gets green CI and zero coverage.
   `src/testing/globeInteractivityHarness.tsx` already exists and is used by four
   files.
4. Path fixes: `src/services/intelweb/`, not
   `src/applications/intelweb/services/`; `src/types/IntelWorkspace.ts:163,166-167`,
   not `src/types/intel/`.

---

## Open questions

### Product decisions — these need a human answer

- **Q1. What should the globe do with a report whose priority nobody stated?** *Answered in `1fb9c0cf`: shown by default.*
  Today it hides it. *Recommendation: treat "not stated" as its own value and
  show it by default.* Counter-argument: a busy globe is worse than a quiet one.
  Gates L2 and shapes the disclosure.
- **Q2. Does a report's `latitude`/`longitude` mean the place the report is
  ABOUT, where it was COLLECTED, or where the ANALYST was?** Three writers behave
  as if the first; the globe path's own generated text says *"created at
  coordinates"* (`Globe.tsx:1159`); the raw item type files the pair under
  collection metadata. Cheaper than D2, and **D2 cannot be answered coherently
  without it**.
- **Q3. Should the globe chip name the report by title, or say "the report you
  opened"?** The title never reaches `focusLocation` and so never reaches the
  collaboration broadcast — but it does become on-screen text on a shared-screen
  surface.
- **Q4. D2 itself: A, B-naive, B-guarded, C, or D?** *Decided 2026-09-13: C (see `case-location-semantics.md`). Built for Cases in `68f106a9` and for Missions in `b94548a1`.* Option A is the only one
  unblocked today — and it is not free either: `GlobeMarkKind` is a closed
  two-value union (`globeIntelLayer.ts:22-26`) and a case pin is neither, while
  `weight` is documented *"DERIVED — never declared… a hardcoded value here
  would put a lie directly into what an analyst sees first."* Every other option
  requires the entity-linking UI to exist first.
- **Q5. Does IntelWeb's graph pane have a non-zero height in the running app?** *Answered: given its height in `b2e03375`, and the deep-link built in `a2e048ea`.*
  Someone must open it after L1 and read the number. Gates the deep-link.
- **Q6. Does linking belong in a case detail view rather than a fourth dialog?**
  There is no detail view; `selectedCase` exists in `useCaseManager` but
  `CasesDashboard` never destructures it, and its obvious entry point sets the
  **shared** `loading` flag, which would blank the table. Answering "yes"
  roughly doubles Track 2.

### Decided without asking

- "Priority not stated" becomes a distinct value in code, independent of what
  Q1 decides the *filter* should do with it.
- `SETTINGS_VERSION` → 3 with a migration; a default change without one reaches
  no existing user.
- Allowlists, not spreads, on both `focusLocation` and `focusRequest`.
- `nostrIdentityService.getPubkey() ?? ''` for new activity entries — **not**
  `currentActorId()`. `nostrService` initialises a keypair at module load
  (`nostrService.ts:210-213`), so an identity is essentially always available;
  defaulting to `''` would mark as unattributed something that *is* attributable.
  Only the `?? ''` half is the honesty guard.
- Delete `linkAnalysisToCase` and `useAnalyzerData`'s wrapper.
- Widen both guard scopes to cover `src/applications/intelweb` and
  `src/services/intelweb`; neither guard covers IntelWeb today.
- No report id in IntelWeb frontmatter — it would flow into `node.metadata` and
  out to the MetadataPanel as user-visible noise. An index on `BuildResult`
  instead, if and when the deep-link happens.
- `{ fromStatus, toStatus }` → `{ from, to }` (`caseManagerAdapter.ts:271` vs
  `replayCase.ts:167-168`) while in the file. Latent, not live — the write is
  gated on `actorId` and no caller supplies one.

---

## Size

| Item | Size | What blows it up |
|---|---|---|
| L1 IntelGraph loop | 0.5–1.5d | Unmasking — three effects have never run at cadence. Expect one more defect. |
| L2 priority semantics | 0.5d + Q1 | If Q1 says "keep hiding them," becomes a settings-UI ticket instead. |
| L3 pre-cap count | 0.5d | The real-service test may surface a subscribe-vs-refresh discrepancy. |
| Focus disclosure | 1d | Restructuring `GlobeIntelStatus`'s early return, with 12 silence tests depending on it. |
| L5 ciphertext fix | 0.5d | If a real IndexedDB already holds a corrupted case, this grows a recovery story. |
| L4 + entity-linking | 2d | Q6 answered "detail view" roughly doubles it. |
| D2 doc + L6 + L7 | 1–1.5d | Scope drift. Fixing the Nostr reduction "while we're here" pre-empts the decision the doc exists to enable. |
| **Total ready work** | **6–8 days** | |
| IntelWeb deep-link | deferred | Gated on L1 and Q5. Re-scope after L1. |
