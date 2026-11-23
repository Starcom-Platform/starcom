# Mecha Jono's build kit v0 for PsiOps and RLSH, as read on 26 Oct 2026

Here in `src`, not beside the decision record (D-PW, `docs/missions/01-architecture-decisions/psi-watch.md`): the
deploy never receives `docs/missions`.

Copied from the handoff page "Mecha Jono to Starcom" (`kit/` beside it), version 1793027608-2d97, so Starcom's tests
and its `?psi=kit` view read the vectors and fixtures from local files, as the kit requires (live events start after the key change, signed
by the new key only). The schemas (`kit/schemas_psi.md`, `kit/schemas_rlsh.md`) and the event set (`kit/events/`) stay
on that page; only the event set's manifest is copied here.

| File | sha256 on the page |
|---|---|
| `vectors_psi.json` | 070432bc66e4429cf39ff9538ea136ce3dde17b954e5717492223eed672b0fd3 |
| `vectors_rlsh.json` | 627690012b4479bd099c8b0ad1e1ab708d4db961ddb6ba4426e0cca142fc15e9 |
| `events-manifest.json` (`kit/events/manifest.json`) | d1c4b1e1a7227fe0dc11e897aee23b65875bcf783c5dd250dd85f7b7c49de14b |
| `orbs.json` (added 26 Oct, version 1793028845-3b47) | 723b14c5c931b45a2782eca2158b4c6bae5ebaaaf555cafa708bd1b57e4fbda2 |

Each fixture's `fixture_note` says which of its values are real and which are invented; the invented ones are never
shown as results.
