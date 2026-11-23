# Conformance vectors — Attested Claims

Signed example events for [the NIP draft](../nip-draft-attested-claims.md).
A format nobody can test against is a description; these are what make it
checkable.

## Using them

Each `<name>.json` holds:

```jsonc
{
  "name": "...",
  "description": "what this vector is for",
  "expect": {
    "canonical": "...",   // the exact canonical JSON string
    "digest": "...",      // SHA-256 of that string, hex
    "signatureValid": true,
    "rejectReason": null, // or why a conforming consumer must refuse it
    "evaluatedAt": "...", // pinned, where a weight is expected
    "weight": { ... }
  },
  "event": { "content": { ... }, "signature": { ... } }
}
```

Run your implementation over `event` and compare against `expect`.

**Start with `canonical` and `digest`.** Canonicalization — not ML-DSA — is
where independent implementations actually diverge: key ordering, unicode
escaping, number formatting. If your digest differs, diff against the published
canonical string rather than suspecting your signature library. Note in
particular that non-ASCII stays as literal UTF-8; escaping it to `\uXXXX`
produces a different digest and therefore a failed signature.

`canonicalization-edge` exists solely for this, and `tampered-value` publishes
the canonical form of the *tampered* content — what a consumer actually
receives — so you can confirm you parsed it correctly before concluding the
signature is bad.

## The three things a valid signature does not tell you

Generating these vectors found the same hole in three separate consumers of
this format, including the production one. Each verified the ML-DSA signature
and treated that as sufficient. It is not:

| Vector | Signature | Must still be rejected because |
|---|---|---|
| `declared-confidence` | **valid** | The payload asserts its own confidence. The format forbids it — that assertion is the whole thing derived weight exists to refuse. |
| `missing-required-fields` | **valid** | Fields are absent. Deriving from them yields `NaN`, which sorts as neither high nor low and quietly poisons every ranking it reaches. |
| `tampered-value` | invalid | Edited after signing. |

A signature proves the bytes are **authentic**. It does not prove they are
**complete**, and it does not prove the format **permits** them. Conflating the
three is the easiest mistake to make here, and every consumer written so far
made it.

## The two things `sourceCount` does not mean

Three of these vectors have a `sourceCount` a naive consumer reads exactly
wrong, and each one cost a shipped implementation a wrong number before it
became a vector.

| Vector | On the wire | What a naive consumer derives | Why that is wrong |
|---|---|---|---|
| `relayed-sources` | `sourceCount: 3`, `relayedVia: ["wikidata"]` | corroboration `0.75` | The three sources reached the publisher through one aggregator. They are distinct observers sharing a single point of failure, and the count cannot express that: one editor citing three registries is indistinguishable downstream from three registries agreeing. |
| `enumeration-census` | `sourceCount: 1`, `matchedBy: "enumeration"` | corroboration `0.25` | It is a **census, not an agreement**. A complete count of one authoritative register has no independent observers to count, and scoring it through a term built to reward agreement understates a national register fourfold. |
| `enumeration-no-boundary` | `sourceCount: 1`, no `enumeratedBoundary` | some weight | Rejected outright. A count *is* the entire claim, so one whose boundary nobody can determine is not weakly supported — it cannot be re-run, which makes it indistinguishable from an invented number. |

`enumeration-census` also separates two ageing bases on purpose: it publishes a
snapshot **older than its publication date**. Age must run from
`method.observedTo`, giving recency `0.3299`; a consumer ageing from
`publishedAt` derives `0.7937`. `publishedAt` is a value the publisher chooses,
so ageing from it lets anyone republish a years-old register and derive full
freshness — the same defect as reading a declared confidence, arriving through
a field nobody reads as a credibility claim.

## These vectors are not a corpus

Several vectors deliberately share an author, subject and attribute. Under a
parameterized-replaceable kind that is **one slot**, so a consumer fed all of
them at once should keep exactly one and drop the rest. Run them **one at a
time**. Our own public-surface gate did not, and reported a single rendered
page as four separate passes.

## Weight is not a property of the event

Vectors expecting a weight pin `evaluatedAt`, because the recency term makes
weight a function of *(event, evaluation time)*. The same event evaluated a
year apart yields different weights by design. A weight transmitted without its
evaluation time cannot be checked by anyone — see the NIP draft.

The reference derivation uses saturation `N = 4` and a 180-day half-life. Other
parameters are conformant; the normative constraint is that **no input may be
author-asserted**.

## Regenerating

```
npm run vectors:make      # deterministic — byte-identical output
npm run conformance       # spec-derived reference consumer, imports no app code
npm run gate:conformance  # every consumer we ship, checked against these vectors
```

Signing here is deterministic (FIPS 204 `extraEntropy: false`) with fixed key
seeds, so regeneration produces identical bytes and a real format change is
visible in the diff. **Application signing keeps its hedged randomness** —
determinism is a property of the vectors, not something to copy into a
publisher.
