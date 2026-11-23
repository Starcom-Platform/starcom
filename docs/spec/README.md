# Specs

What Starcom puts on the wire, and what it reads, written so another app can implement it without asking. Everything
in this directory is licensed Apache-2.0 ([`README-LICENSE.md`](README-LICENSE.md)), unlike the app's AGPL-3.0: a
wire format nobody can freely adopt is not a standard.

**The spec wins.** Where a spec here disagrees with any other document, the spec is right and the other document is
a bug. Where a spec disagrees with the code, one of them is a bug: please open an issue.

**These are moving.** They will become the Earth Intelligence Network's shared standards in
[`Earth-Intelligence-Network/ein-standards`](https://github.com/Earth-Intelligence-Network/ein-standards), owned by
the network rather than by one app. Until then this directory is where they live.

## Where to start

| You are building | Read first | Then |
|---|---|---|
| Anything that reads or writes Starcom's notes | [`kinds.md`](kinds.md): every event kind Starcom uses, and what it does with each | The interchange spec's sections for those kinds |
| A tool that publishes or weighs claims | [`nip-draft-attested-claims.md`](nip-draft-attested-claims.md) | Its vectors, in [`vectors/`](vectors/) |
| Something that exchanges Mission Packages or reports with Starcom or NavCom | [`starcom-navcom-interchange.spec.md`](starcom-navcom-interchange.spec.md) | Its vectors, in [`mission-vectors/`](mission-vectors/) |
| A capture or sharing tool for Starcom's globe cards | [`starcom-share-handle.spec.md`](starcom-share-handle.spec.md) | |
| An analysis that draws on a globe | [`globe-intel-layer.md`](globe-intel-layer.md) | |

## The documents

| Document | What it specifies |
|---|---|
| [`kinds.md`](kinds.md) | Every Nostr event kind Starcom publishes, reads, only signs, or holds in dormant code. Generated from the code; `npm run guards` fails when they differ |
| [`starcom-navcom-interchange.spec.md`](starcom-navcom-interchange.spec.md) | The wire between Starcom, NavCom and anyone on the same relays: Mission Package (`30079`), Dispatch Capability (`30081`), Finding (`30082`), Refutation (`30083`), Roster Item (`30084`), NavCom's sealed report (`1912`), and globe intel notes (`1`, `30023`), with their withdrawal. Versioned by revision; rev 20 is current |
| [`nip-draft-attested-claims.md`](nip-draft-attested-claims.md) | A draft NIP: verifiable analytical claims, how to weigh them by method and independent origin rather than by who said them, and refutation |
| [`starcom-share-handle.spec.md`](starcom-share-handle.spec.md) | `window.__starcomShareCard`: how a page or tool asks Starcom for a share card of what the globe shows |
| [`globe-intel-layer.md`](globe-intel-layer.md) | The contract between an analysis and a globe layer, written for another instance to implement |
| [`harm-accounting.md`](harm-accounting.md) | How harm is described: how many, how badly, for how long, to whom, with the uncertainty kept |
| [`../interchange/`](../interchange/) | Dated notes of changes agreed with NavCom. Where one is marked superseded, the spec holds the current form |

## Test vectors

Each set is signed example data with the verdict a correct implementation must reach. Every set is checked by code
that imports nothing from the app, so the vectors, not Starcom, are the reference.

| Vectors | For | Run |
|---|---|---|
| [`vectors/`](vectors/) | Attested claims | `npm run conformance` |
| [`mission-vectors/`](mission-vectors/) | Dispatch capabilities and Mission Package manifests | `npm run conformance:mission` |
| [`observation-vectors/`](observation-vectors/) | NavCom observations, as Starcom reads them | `npm run gate:observations` |
| [`publication-vectors/`](publication-vectors/) | What may be published, and what stays contained | `npm run publication-conformance` |

`npm run verify` runs the first three; run the publication vectors on their own.

## Conventions

- **MUST / MUST NOT / SHOULD / MAY** carry their RFC 2119 meaning.
- Times are UTC. Starcom's manifests use ISO 8601 strings; Nostr's `created_at` is in seconds.
- A section marked **draft** is a proposal, not something any implementation has committed to.
