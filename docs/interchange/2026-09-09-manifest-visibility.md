# PackageManifest: `classification` → `visibility`

**Landed** 2026-09-09, in the commit that carries this file.
**Affects** Mission Package (Nostr kind `30079`) and anything else built
through `services/exchange/PackageComposer`.
**Navcom action required:** read `visibility`; keep accepting `classification`.

## What changed

`PackageManifest` carried a required four-value clearance tier:

```ts
classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
```

It now carries an optional distribution axis:

```ts
visibility?: 'public' | 'limited' | 'private';
```

`services/exchange/schema.ts` accepts **both**: `visibility` as the enum above,
and `classification` as a loose optional string, so a package produced by any
build validates.

## Why

The tier never constrained anything. It crossed the wire in plaintext, in the
same manifest as the content it appeared to protect, to relays that keep
whatever they receive. Starcom's own gate now refuses a restricted publish
outright rather than labelling it — see `MissionService.publicRelayRefusal`.

Three of the four values were also unreachable by policy: this is an
open-source intelligence network, so there was one legitimate value and three
that described a deployment that does not exist.

## Compatibility

**Already-signed packages still verify, unchanged.** `manifestDigest`
canonicalises the manifest *as received*, walking whatever keys are present, so
a manifest signed with `classification` in it produces the same digest after
this type change. Asserted in
`services/exchange/__tests__/signing.wireRoundTrip.test.ts`, including a
fixture carrying the legacy key — not assumed.

**Old → new:** a manifest with only `classification` validates. Starcom reads
no meaning from it.

**New → old:** a manifest with only `visibility` will fail a receiver that
requires `classification`. Starcom no longer emits that key, so this is the
direction that needs Navcom's side updated. `visibility` being optional means
an unmarked package now emits neither key.

## One defect this surfaced, worth knowing about

Making a manifest field optional broke signing, and would have broken it for
any optional field:

`stableStringify` built the canonical form with `Object.entries`, which
includes a key whose value is `undefined`. `JSON.stringify(undefined)` returns
the JS value `undefined`, which interpolated as the text `undefined`. So a
manifest carrying `visibility: undefined` hashed as
`{...,"visibility":undefined}` on the signing side, while the same manifest
received over the wire had lost the key entirely — JSON drops
undefined-valued properties — and hashed without it. Different digest, failed
signature, **a genuine package from a genuine node refused.**

Nothing hit it while every manifest field was required. It now filters
undefined-valued keys, matching `JSON.stringify`, which is the only behaviour
that makes the digest agree across the trip every package actually makes.

If Navcom has its own canonicalisation for this digest, it needs the same
filter.
