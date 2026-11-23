# Specs

**Normative for what Starcom actually emits.** Where a spec here disagrees with
`docs/ecosystem.md` or any other narrative doc, the spec wins and the narrative is a bug —
same rule Navcom's own [`docs/spec/README.md`](../../../navcom-app/docs/spec/README.md)
states for itself.

This directory exists because `docs/ecosystem.md` said plainly that most of `docs/` predates
what's actually built and shouldn't be trusted. A spec is where "what predates the code"
stops being possible: it either matches the code or it's wrong, and there's no third state.

## Scope

One document so far, because there is only one real cross-repo surface today: what Starcom
puts on the wire that Navcom (or anyone else on the same relays) can read.

| | |
|---|---|
| [`starcom-navcom-interchange.spec.md`](./starcom-navcom-interchange.spec.md) | Mission Package and Finding: the two Nostr event kinds Starcom emits, plus a **draft, non-normative** proposal for a third kind Starcom would ingest |

## Conventions

Matched to Navcom's own spec conventions deliberately — these two directories describe
opposite ends of the same wire, and reading them side by side should not require learning
two different notations.

- **MUST / MUST NOT / SHOULD / MAY** carry RFC 2119 meaning
- All times UTC, ISO 8601 strings (`publishedAt`, `createdAt`, ...) — Starcom's existing
  event/manifest timestamps are already ISO 8601, not Navcom's UTC-epoch-seconds convention,
  and this spec does not change that; it's noted because it's a real, harmless difference a
  reader crossing between the two spec sets should expect, not a bug in either
- A section marked **draft** is a proposal for joint discussion, not something either repo
  has committed to or implemented. Nothing in a draft section may be treated as normative
  until both projects have actually agreed to it — see that section's own note for what's
  unresolved

## Why this wasn't written sooner

Starcom didn't have anything worth specifying until the code in `src/services/intel/`
actually did the things described here — Mission Package and Finding broadcast, real
ML-DSA-65 payload signing, a real corroboration gate. Writing the spec first and the code
to match it later was tried nowhere in this repo's history and isn't being tried here
either; this documents what the already-tested code in this repo does, not what it's
planned to do.
