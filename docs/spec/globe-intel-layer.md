# Globe Intelligence Layer — contract

How analysis reaches a globe without the globe knowing what analysis is, and
without analysis knowing what a globe is.

This is a **contract another instance can implement**, not a description of
ours. It was rewritten after a second layer was built against it and found two
things the first implementation had baked in — both recorded under
[Known limits](#known-limits) rather than quietly fixed.

## The shape

```ts
interface GlobeIntelLayer {
  id: string;               // unique per SOURCE; layers coexist, keyed by this
  version: number;
  marks: GlobeIntelMark[];
  links: GlobeConflictLink[];
  unplaceable: { count: number; reasons: Record<string, number> };
  coincidentMarkIds: string[];
  provenance: {
    derivedFrom: string;    // open identifier naming the producer
    algorithmVersion: number;
    computedAt: string;     // ISO 8601 UTC
    blindSpots: string[];   // sources unreachable when this was computed
  };
  degraded: boolean;
  integrity: { totalObservations: number; mockCount: number; realRatio: number } | null;
  truncated: { shown: number; total: number; budgetOverrun: boolean } | null;
  emptyReason: 'no-observations' | 'nothing-qualified' | 'all-unplaceable' | null;
}
```

A **mark** is a claim with a position. A **link** joins two marks that
contradict each other.

## Invariants

These are what the contract is *for*. A layer that carries the right fields
and breaks these is not conforming.

1. **Never synthesize a position.** A mark's coordinates must come from the
   evidence. A claim without them is excluded and **counted** in `unplaceable`,
   never quietly dropped and never given a plausible-looking point. Jittering
   coincident marks apart is the same violation: on a globe, position *is* the
   claim.

2. **Report what is missing.** `unplaceable`, `truncated`, `emptyReason` and
   `blindSpots` all exist because an emptier globe is indistinguishable from a
   quieter world. A layer that renders fewer marks without saying why is making
   a false claim about the world, not merely a less detailed one.

3. **Distinguish the kinds of empty.** "Nothing to analyse", "analysis ran and
   nothing qualified", and "results exist but none could be placed" are three
   different facts. Rendering the same blank Earth for all three is the failure
   this field exists to prevent.

4. **Unmeasured is not clean.** `integrity: null` means *not measured*. Do not
   emit `{ mockCount: 0 }` to mean "we did not check" — that renders as "100%
   real", a stronger claim than the one you are entitled to.

5. **Never truncate silently.** If a budget applies, set `truncated`. Ranking
   must not be decided by values an adversary supplies, and if the layer draws
   contradictions it must never drop one to make room for agreement — overrun
   the budget instead and say so with `budgetOverrun`.

6. **Age is per layer.** `computedAt` is each layer's own. A consumer must not
   let a fresh layer vouch for a stale one, and must distinguish *withheld
   because too old* from *nothing found*.

7. **`id` identifies a SOURCE, not a slot.** Publishing replaces the layer with
   the same `id` and leaves others untouched. Withdrawing is distinct from
   publishing an empty layer: empty means "this source ran and found nothing";
   withdrawn means "this source is no longer asserting anything here".

## Implementing a producer

A producer needs no framework and no access to ours. It takes whatever it
knows about and returns the structure above.

`publishedClaimsLayer.ts` in this repo is a worked example, deliberately built
from a source with nothing in common with the correlation engine — no events,
no conflicts, no shared context — so that the contract is exercised rather than
described. Roughly 100 lines, no dependencies beyond a weight function.

## Known limits

Found by implementing a second layer. Recorded because a contract's limits are
only discoverable this way, and hiding them would make the document less useful
than the code.

- **`links` can only express contradiction.** `GlobeConflictLink` carries
  `strength` and `distanceKm`, which are contradiction-specific. A layer whose
  marks relate in some other way — sequence, containment, provenance — has no
  way to say so and must leave `links` empty. Generalising it is deferred until
  a second *kind* of relationship actually exists; inventing one now would be
  guessing.
- **`provenance.derivedFrom` was a single literal.** It was typed
  `'correlation-engine'`, so a second producer could not name its own source
  without lying. Now an open string. This is the clearest evidence that the
  contract had been extracted from one implementation rather than designed:
  the field whose entire purpose is telling sources apart had exactly one legal
  value.
- **`marks[].kind` is a closed set** shaped by what the first layer needed.
  Reusing `'corroboration'` for something that is not corroboration is the
  pragmatic move today, and it is a compromise, not a design.

## What a fork needs

Nothing proprietary, and nothing of ours.

- The layer contract is pure data. No key, no host, no account.
- The example producer needs only a weight function whose parameters are
  published in [the Attested Claims draft](nip-draft-attested-claims.md).
- Rendering assumes marks with latitude and longitude. Any globe or map can
  consume them.

**Residual dependency, stated rather than hidden:** `ApiConfigManager` still
defaults an `/osint` base URL to `https://api.starcom.app`, a host that does
not resolve. Nothing in this layer touches it, so a fork implementing the
contract is unaffected — but it is the last unresolved "our host" default in
the codebase and it is tracked as such rather than left for a fork to discover.
