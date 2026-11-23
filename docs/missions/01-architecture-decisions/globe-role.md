# Decision: The 3D Globe's Role

Full evidence: [`00-current-state/globe-integration.md`](../00-current-state/globe-integration.md).

## The Globe is a peer app and spatial anchor — not a pipeline gate

This matches what the user already suspected going in: "not really a
starting point... but the obvious thing to have for a Cyber Command Center
UX." The audit confirms this is also what the *code* already does, whether
or not it was deliberate: the Globe is one of 7 registered peer
applications, fully unmounts when you navigate away, and is the bootstrap
default only for a first visit — not a required step in the pipeline
afterward.

**Decision: keep it that way.** Do not make the Globe a required gate
between steps (e.g. "you must place a marker before creating a report") —
that would fight the app's actual multi-entry-point structure (NetRunner,
IntelAnalyzer, and manual creation are all legitimate starting points too)
and would regress the flexibility the current peer-app model already gives
for free.

## What the Globe *should* be: the connective tissue for anything spatial

The audit found the right shape already half-built: two real bridges out
(marker click → report detail → "Open in Dashboard"; context menu →
NetRunner/Cases) and one real bridge in (report's "View on Globe" →
`GlobeContext.focusLocation`, which survives app switches because
`GlobeProvider` sits above the app router). This is the correct pattern —
extend it, don't replace it:

1. **Fix the Globe's own broken creation path first** (see `globe-integration.md`'s fix list) — its context-menu "Create Intel Report" is currently the one place on the Globe that doesn't actually connect to the rest of the app, which undercuts the "central visual anchor" framing in the one spot where a user would expect it to work most.
2. **Repoint the "Open in Dashboard" bridge** at whichever Intel Report UI becomes canonical (see `canonical-intel-report-path.md`).
3. **Extend "View on Globe" to Cases and Missions**, not just Intel Reports, once those have real coordinates to anchor to — this is what makes the Globe feel like the shared substrate the user described ("the central node from which we span out from as we work") without requiring it to gate anything.

## What this means for the pipeline description in `03-pipeline/`

The target flow is written as a graph with the Globe as one of several
possible entry/return points, not a single line the Globe sits at the head
of. See `03-pipeline/README.md`.
