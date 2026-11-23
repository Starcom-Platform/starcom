# Intel broadcast (NIP-23): optional event time

**Landed** 2026-09-14, in the commit that carries this file.
**Affects** the JSON content body of the signed NIP-23 event built by
`services/intel/NostrIntelBroadcastService` (hashtag `starcom_intel`).
**Navcom action required:** none to keep working. If you place intel in time,
read `startDate`, `endDate` and `timePrecisionMs` when present, and treat their
absence as "not stated".

The third interchange change, after
[`PackageManifest` visibility](./2026-09-09-manifest-visibility.md) and
[intel broadcast visibility](./2026-09-10-nostr-intel-visibility.md).

## What changed

The content body was:

```json
{ "title": …, "ipfsCid": …, "solanaTx": …, "visibility": "public", "lat": …, "lon": … }
```

It may now also carry when the reported event happened:

```json
{ "title": …, "ipfsCid": …, "solanaTx": …, "lat": …, "lon": …,
  "startDate": "2026-07-27T21:24:04.800Z",
  "endDate": "2026-07-27T21:24:09.000Z",
  "timePrecisionMs": 1000 }
```

All three are **optional and omitted entirely when unstated**, as `visibility`
is. An absent key says the publisher did not say.

## What the fields mean

- `startDate`: ISO 8601, UTC. When the reported event happened, not when the
  event was published. The Nostr `created_at` stays what it always was: when the
  note was signed.
- `endDate`: ISO 8601, UTC, when the event was a span rather than a moment.
- `timePrecisionMs`: how closely those are known, in milliseconds. Each stated
  time is the **start** of a window this wide that the moment falls in. A date
  known only to the day is sent as `00:00Z` with `86400000`: the whole of that
  UTC day, not its midnight. This is the reading Starcom's own observations use
  (`SourceObservation.timePrecisionMs`).

Today the one producer is NetRunner's OSINT publisher. It sends the mission's
collection window: from when its tools started reading the target to when they
finished, known to the second. That is when the state they found held.

## Compatibility

**Old events remain valid and verifiable.** A Nostr event's signature covers the
serialized event as published, so nothing about this change touches an event
already on a relay, and an event without these keys means what it always meant.

**Starcom does not read these fields back yet.** `NostrStarcomIntelIngest`
subscribes to `starcom_intel` events but does not parse this content body into
event time. Reading it is later work in decision D-E
(`docs/missions/01-architecture-decisions/time-model.md`).

**For Navcom:** parse tolerantly. Use a field only when it is well formed (an
ISO date that parses, a finite positive number); treat anything else as not
stated. Do not substitute `created_at` for a missing `startDate`: publication
time is a different fact, and treating it as event time is the error this
decision exists to remove.
