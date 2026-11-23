# ADR-0003: Generic Source/Observation Envelope for Multi-Source Ingest (EIN-Readiness)

- Status: Accepted — **implemented and revised 2026-08-20**, see "Revision" below
- Date: 2026-08-18
- Owners: Intel Platform

## Context

M4IS2 — the frame the "Next Phase Roadmap" and `docs/ecosystem.md` both build toward — is
explicitly *multi-agency*: several independent institutional source types feeding one
sense-making layer, not one source plus a second. Starcom has exactly one real source today,
NetRunner's OSINT bots (`Intel` model, `BotMissionExecutor`). A second is proposed but
unbuilt: a Navcom Pattern feed (see
[`docs/spec/starcom-navcom-interchange.spec.md`](../spec/starcom-navcom-interchange.spec.md)'s
draft, non-normative "Pattern ingest" section).

Genuine EIN-readiness means onboarding a third source shouldn't be a bespoke rebuild. Right
now it would be: `computeReportConfidence.ts`, `computeLocationConflicts` /
`computeCorroboratedFindings` (`correlationUtils.ts`), and
`computeDataIntegritySummary.ts` each read NetRunner-shaped input (the dashboard already
generalized to `{isMock: boolean}[]` in Phase 1; the other two have not been generalized).

**The tension, stated rather than resolved by default**: build the generalized ingest
plumbing too early and it's speculative over-engineering against sources that don't exist
yet. Build it too late and the shape of the first two sources quietly becomes the permanent
shape of the API — this repo has direct precedent for exactly that mistake. The Coracle
reskin baked in one tool's assumptions and called it the architecture.

## Decision

Write the target interface now, cheaply, as real TypeScript types with zero runtime
behavior (`src/types/intel/SourceObservation.ts`) — not the generalized adapter/ingest
plumbing itself. NetRunner's `Intel` model and a future Navcom Pattern feed are **not**
migrated to this shape as part of this decision; existing confidence scoring, contradiction
detection, and the data-integrity dashboard continue reading their current inputs
unchanged.

Two envelopes, modeled on `NostrStarcomIntelIngest`'s already-proven ingest shape:

```ts
interface Source {
  id: string;
  kind: 'osint-bot' | 'watch-pattern' | string;   // open string, not a closed enum
  trustBaseline: IntelReliability;                 // A-F, same scale as computeReportConfidence.ts
  ingestMethod: 'poll' | 'subscribe' | 'manual';
}

interface Observation {
  sourceId: string;
  subjectEntityRef: string;      // opaque — see the type's own doc comment on why
  claim: { attribute: string; value: unknown };
  timestamp: string;              // ISO 8601
  schemaVersion: number;
}
```

## Consequences

### Positive

- The target shape is decided and reviewable now, while nothing is forcing a rushed
  decision — instead of being invented under time pressure alongside a real third source's
  integration work.
- A real third source's adapter becomes "map into `Observation`," not "extend three separate
  bespoke pipelines that were never designed to be extended."
- Costs nothing at runtime: pure types, zero behavior change, zero regression surface, `tsc`
  is the only thing that can possibly fail because of this file.

### Negative

- The shape is a guess informed by exactly two sources — one real (NetRunner), one proposed
  (Navcom Pattern). A genuinely different third source could reveal it needs revision before
  anything is actually built against it.
- Two interfaces now sit in the codebase unreferenced by any real code, which is an unusual
  state for this repo (most types here exist because something imports them) and needs this
  ADR to explain why that's deliberate, not abandoned or forgotten work.

## What this explicitly does NOT do

- Does not migrate NetRunner's `Intel` model or `IntelReportUI` to this shape.
- Does not build a `PatternIngestService`, or any adapter for a Navcom Pattern feed — no such
  feed exists yet on either side; see the interchange spec's own "draft, non-normative"
  framing of that section.
- Does not rewire `computeReportConfidence`, `computeLocationConflicts`,
  `computeCorroboratedFindings`, or `computeDataIntegritySummary` to read `Observation[]`
  generically.
- Does not implement a real opaque-entity-id registry. `subjectEntityRef` is typed as
  opaque, but `entityRefs` on `Event`/`IntelReportUI` remain raw display strings today —
  Phase 2's own future-proofing note recommended, but did not implement, that migration.
  This interface doesn't foreclose it; it doesn't perform it either.

## Compliance checks

A change is ADR-compliant when:

- It does not build a generalized ingest pipeline reading `Observation[]` without a second
  real source (beyond NetRunner) actually driving that work.
- A genuinely new source type maps into `Source`/`Observation` rather than adding a fourth
  bespoke shape alongside NetRunner's and whatever a Pattern feed eventually becomes.

## See also

- [`../spec/starcom-navcom-interchange.spec.md`](../spec/starcom-navcom-interchange.spec.md)
  — the draft Pattern-ingest section this ADR's `Source.kind: 'watch-pattern'` anticipates.
- `src/services/intel/NostrStarcomIntelIngest.ts` — the real, proven ingest shape this
  envelope is modeled on.
- `src/services/intel/confidence/computeReportConfidence.ts` — `IntelReliability`, reused
  here as `Source.trustBaseline`.
- `src/types/intel/SourceObservation.ts` — the actual interfaces.

---

## Revision — 2026-08-20 (build-passes II.A.1)

This ADR's own "Negative consequences" section predicted: *"The shape is a guess informed by
exactly two sources ... A genuinely different third source could reveal it needs revision
before anything is actually built against it."*

Wiring five real open-data sources (UCDP, GDACS, EONET, ReliefWeb, USGS) did exactly that.
Four fields were added, each forced by something concrete rather than anticipated:

| Field | Forced by |
|---|---|
| `id` | All five sources are **polled**, so the same record arrives repeatedly. Without a deterministic id derived from source + native id, re-ingest accumulates duplicates — and N duplicates of one event are indistinguishable from N-way independent corroboration to the correlation engine. That is the worst failure available to this system. |
| `isMock` (**required**, not optional) | `computeDataIntegritySummary` already consumes `{isMock: boolean}[]`, and optional would let an adapter omit it and have fabricated output silently counted as real. Inherited from `Source`, never set by the adapter. |
| `method` | Attestation weight is derived from method and age. Without a per-observation method there is nothing to derive from. |
| `geo` | Location is the spatial index the correlation engine reads, not one claim attribute among many. |

**A deliberate omission, restated:** there is no per-observation `confidence`. Weight is
derived from source trust, method, and age (`deriveWeight.ts`) and never declared by the
adapter that produced the record. An adapter asserting its own confidence is the same
failure as an instance asserting its own findings' confidence — the failure federation
cannot survive — just occurring earlier in the pipeline.

**The compliance check now has teeth.** `adapters/adapterContract.ts` is a shared suite every
adapter must pass, which is what stops "the shape of the first two sources quietly becoming
the permanent shape of the API." It earned its place immediately: on the first adapter it
caught a crash on null records inside an otherwise valid batch — a partial-failure response
shape that would have cost an entire ingest batch in production.
