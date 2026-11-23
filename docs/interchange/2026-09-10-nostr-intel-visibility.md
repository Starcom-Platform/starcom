# Intel broadcast (NIP-23): `classification` → `visibility?`

**Landed** 2026-09-10, in the commit that carries this file.
**Affects** the JSON content body of the signed NIP-23 event built by
`services/intel/NostrIntelBroadcastService` (hashtag `starcom_intel`).
**Navcom action required:** if you read this field, read `visibility`; keep
accepting `classification`; treat absence as "not stated".

The second of two interchange changes. The first was
[`PackageManifest`](./2026-09-09-manifest-visibility.md).

## What changed

The content body was:

```json
{ "title": …, "ipfsCid": …, "solanaTx": …, "classification": "UNCLASSIFIED", "lat": …, "lon": … }
```

It is now:

```json
{ "title": …, "ipfsCid": …, "solanaTx": …, "visibility": "public", "lat": …, "lon": … }
```

with `visibility` **optional and omitted entirely when unstated** — an absent
key says the author did not say, which is the truth. The old field was
**required**, so every producer had to supply something.

## Why this one mattered more than a rename

`OsintNostrPublisher` stamped `classification: 'UNCLASSIFIED'` on every OSINT
item it broadcast, because the type demanded a value. Nobody had reviewed those
items. The marking was the publisher's invention and it was **published**, on a
signed event, to relays that keep what they receive.

That is the whole failure mode in one line: a required handling field
manufactures handling claims at the point of publication.

## Compatibility

**Old events remain valid and verifiable.** A Nostr event's signature covers
the serialized event as published, so nothing about this change touches an
event already on a relay.

**Starcom does not read this field back.** `NostrStarcomIntelIngest` subscribes
to `starcom_intel` events but never parses `classification` out of the content
body — checked before writing this. So the read-tolerance below is a statement
about *your* parser, not a code path we exercise.

**For Navcom:** accept both keys; `visibility` when present, `classification`
from older events, and neither as "not stated" rather than as a default. Do not
substitute a bottom rung for absence — that is the specific mistake this whole
migration was undoing.

## Note on digests

Unlike the manifest, there is no custom canonicalisation here — nostr-tools
hashes the serialized event — so the undefined-key hazard described in the
manifest note does not repeat. `JSON.stringify` drops an undefined key, which
is the behaviour we want.
