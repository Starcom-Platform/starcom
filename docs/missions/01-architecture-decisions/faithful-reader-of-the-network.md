# Decision D-D — Starcom is a faithful reader of the network

**Status:** decided and implemented (`b758c520`, and its prerequisite
`b41abeee`).

## The decision

What a publisher publishes, Starcom ingests. A `FeatureCollection` is a **set of
claims**, not a container from which one claim is selected. Where a reduction is
genuinely unavoidable, it is **counted and stated**, never silent.

## Why it needed deciding

`NostrStarcomIntelIngest` took `parsed.features[0]` and discarded the rest. It
incremented `accepted` by one, and every drop metric read zero — `droppedNoGeo`
fires only when `features[0]` is *absent*. So a ten-point collection became one
report and nothing anywhere recorded the other nine.

That is not only data loss. The correlation engine downstream computes
corroboration over a corpus it does not know is truncated, so the loss
propagates into conclusions rather than staying at the front door.

*(Figure correction: an earlier note said 49 features lost per event, taken from
the parser's default cap of 50. The ingest overrides
`maxFeaturesPerCollection` to 10, so it is up to nine.)*

## The prerequisite that made this dangerous to do first

**Ingesting every feature could not be done before feed identity was fixed**, and
doing it first would have been worse than the bug.

Corroboration counts distinct `feedId`s. `adaptReportsToEvents` set
`feedId: report.id`, so every report was its own independent source. Splitting
one event into N reports would therefore have let **a single publisher's single
event corroborate itself N times** — converting a data-loss bug into a
confidence-*fabrication* bug, which under [D-C](globe-is-an-evidentiary-display.md)
is worse, and worse in the direction that matters.

Feed identity is now the author, which for a Nostr-ingested report is the
publisher pubkey. A publisher is one feed however many events they post, and
however many features each event carries. `NostrStarcomIntelIngest.features.test.ts`
pins that end to end so the two cannot drift apart.

## What was implemented

- Every feature becomes a report.
- **Report identity.** The parser assigns every *point* feature the bare event
  id, so three points would have collided on one id. Multi-feature events get a
  `#index` suffix; single-feature events keep the bare event id, leaving existing
  stored reports and dedup keys untouched.
- **Dedup.** `seenIds` is keyed by event id and eviction deletes by report id —
  values that used to coincide and now do not. An event is forgotten only once
  none of its reports remain, or a multi-feature event would become
  re-importable while some of its reports were still held.
- **Metrics.** `accepted` (reports) is now separate from `acceptedEvents`.

## Reductions kept, but made legible

Two reductions remain. Both are now visible, because changing either is a
decision rather than a cleanup:

- **Geometry.** A line still reduces to its first vertex and a polygon to its
  first ring's first point. The report carries a `geometry:<kind>-vertex` tag, so
  a representative vertex is distinguishable from a coordinate somebody
  published as a point. Carrying real geometry would need a renderer that can
  draw it and a mark model that can express it.
- **The parser's feature cap.** `maxFeaturesPerCollection` was applied with a
  bare `.slice()` that nothing reported. `ParsedResult` now carries
  `cappedFeatures`, and the ingest counts and logs it. Raising the cap is a
  separate decision about ingest volume.

## Known gap

The parser boundary is covered by the geoint suite; the ingest tests drive
`handleEvent` directly. Raw relay socket → parser is not covered here, because
the service constructs its own `SimplePool` internally with no injection seam.

## What this decision does NOT say

It does not say every claim must be *rendered*. The globe's caps and filters
still apply — but under D-C they must say so, which is why the reduction metrics
above exist rather than being merely internal.
