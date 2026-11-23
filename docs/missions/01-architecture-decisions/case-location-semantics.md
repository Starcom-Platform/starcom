# D2 — what a Case's location is

**Status:** **DECIDED 2026-09-13: option C** — a Case shows its linked reports' own pins, with an explicit unplaceable count, and never a synthesized dot. **Built for Cases in `68f106a9` and for Missions in `b94548a1`:** "Show on the globe", on a Case row or in a mission's detail dialog, draws only the pins of its linked reports (for a Mission, those its cases link to and those attached to it directly), names what is not drawn and why, and aims the camera at the pins' centre without drawing it. Was: recommendation, not yet decided. Unblocked by
[D-B](mission-downstream-of-case.md) and by the answer to D2a below.

## D2a — what a report's coordinate means: **DECIDED**

A report's `latitude`/`longitude` is **where the report is ABOUT** — the subject
or event location. Not where it was collected, and not where the analyst was.

This was never stated. `IntelReportUI.ts:35-36` is a bare pair with no comment,
while the temporal fields two lines below had their ambiguity resolved
explicitly. The evidence pointed at *subject*: the globe context menu writes the
point you clicked, Nostr ingest takes the publisher's geometry and stamps
`category: 'GEOINT'`, and the editor labels the section "GEOINT Coordinates".

Counter-evidence, recorded because it is real and will confuse the next reader:
the globe path's own generated content says *"Intelligence report created at
coordinates"* — an analyst-location reading inside the same function that writes
a subject-location value. And `src/types/IntelWorkspace.ts:163,166-167` files
`latitude`/`longitude` directly under `collectedAt`/`source`, which reads as
collection metadata.

**Follow-up owed:** an `UNRESOLVED` → resolved comment at
`IntelReportUI.ts:35-36`, and the globe path's generated wording corrected, so
the type says what the decision says.

## The question this leaves

A Case has no coordinate of its own and no writer for one. What should
"where is this Case" mean?

## The options

**A — a Case carries its own stated coordinate.** An analyst types it.
*Claims:* someone asserted this location for the investigation.
*Costs:* a geo field on `IntelCaseUI`, a picker, and — verified — a mark model
that does not exist. `GlobeMarkKind` is a closed two-value union
(`'corroboration' | 'contradiction'`) and a case pin is neither; `weight` is
documented *"DERIVED — never declared"* and drives visual prominence;
`sourceCount` means independent sources behind the mark, of which a case pin has
zero. So A needs a new mark kind with its own `provenance.derivedFrom`, not just
a field.

**B-naive — the centroid of linked evidence.** Average the reports' coordinates.
*Claims:* the investigation is *there*. **Rejected below.**

**B-guarded — a conditional centroid.** Average only across reports already
mutually close, from ≥2 independent feeds, and only when the entity has no
unresolved location conflict.
*Claims:* these sources agree on a place.
*Note:* this is not hypothetical — `findingForBucket` already does exactly this
(`correlationUtils.ts:796-803`), and the precondition is the load-bearing half.

**C — one pin per linked report, plus an explicit unplaceable count.**
*Claims:* here is where this case's evidence is, and here is how much of it
could not be placed.
*Costs:* needs a fourth `GlobeEmptyReason` — the union is closed at
`'no-observations' | 'nothing-qualified' | 'all-unplaceable'`, and none of those
describes "this case has no linked evidence yet".

**D — the most recent linked report.** *Claims:* the investigation's current
focus. Cheapest; also the least defensible, since recency is not location.

## Recommendation: **C**, and explicitly not B-naive

Three things in the codebase already answer this, and a Case rule must adopt or
consciously overrule them:

1. **`globeIntelLayer` refuses to jitter coincident marks** because *position IS
   the claim*. A centroid is that objection at continental scale: it draws a
   confident mark where **no source claimed anything**.
2. **The correlation engine treats multi-location as a finding, not noise.**
   Beyond 100km within 24h is a `LocationConflict`, rendered in the most
   saturated colour on the layer by explicit choice. Averaging would draw a
   calm pin on the same globe where the contradiction is meant to be the loudest
   thing on screen.
3. **[D-C](globe-is-an-evidentiary-display.md)** settles ties toward honesty.

D-B sharpens it further: Report → Case → Mission means a Mission's position
would derive through **two** hops. A single synthesized dot two derivations away
from any actual observation is the least defensible mark the globe could draw.

So: **a Case shows its reports' actual pins; a Mission shows its Cases'. Never a
synthesized dot.** The unplaceable count is not a footnote — it is the part that
makes the display honest, since a case whose evidence cannot be placed must not
look like a case with no evidence.

## The prerequisite, which is not optional

**Any derived-position work is blocked on linked evidence actually existing.**
`case.relatedEntities` had no product writer until `9cc1f3bd`; every case
created before it has `relatedEntities === []`. A resolver built against that
returns nothing for every pre-existing record **while passing its own fixture
tests** — the exact failure shape `contradictionProducer` documents as having
shipped once on this same field.

So option C is worth building only once real cases have linked evidence. Until
then it would render an empty state for every record and look broken.

## What would change this recommendation

If the need turns out to be *"give me one place to fly the camera to for this
case"* rather than *"show me where this case's evidence is"*, C is the wrong
shape — a camera target is not a claim, and could be the bounding box of the
report pins with no mark drawn at all. That is a different feature and a cheaper
one. Worth asking before building either.
