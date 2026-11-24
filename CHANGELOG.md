# Changelog

What changed for the people who use Starcom, release by release, newest first. Each release names the revision of the
Starcom ↔ NavCom interchange spec (`docs/spec/starcom-navcom-interchange.spec.md`) it speaks, and the oldest it reads.

This changelog starts with the first public release. Earlier history lives in the private repository's commit log and
in the decision records under `docs/missions/01-architecture-decisions/`.

## How versions are numbered

Versions follow [semantic versioning](https://semver.org/), and each release is tagged `vX.Y.Z`:

- **Major:** a release stops reading a spec revision, or changes what a person keeps on their device so that an older
  release cannot open it.
- **Minor:** something a person can do that they could not before, or a new spec revision it speaks.
- **Patch:** a fix.

Proposed, and not yet decided (the EIN plan's "Many Starcoms" tab, decision 5): every release reads the spec revision
it speaks and the two before it, and changes within a major spec version only add, so unknown tags are ignored and
kept.

## Unreleased

- **Cancelling a withdrawal that waits to send** now lets its request to delete go first. Before, there was a moment
  when the request could have been sent without the withdrawal it belonged to.
- **The support appeal says plainly what Starcom is** and what support pays for. The project's old framing is gone
  from it, from under the wordmark (which now shows the version), from the chat contacts and from the Discord
  notices. A Globe settings colour scheme that changed nothing is gone too.
- **The GitHub links** in the support appeal and the Community menu open the public repository. They led to a
  private one.

The rest is for people building on Starcom or with it:

- **Documentation for contributors:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
  [`docs/GLOSSARY.md`](docs/GLOSSARY.md), [`docs/TESTING.md`](docs/TESTING.md),
  [`docs/LANGUAGES.md`](docs/LANGUAGES.md), the extension's own [README](extension/README.md), and an index of the
  decision records. The README's "Start here" says which journeys work today and which do not yet.
- **Every Nostr kind Starcom uses, in one table:** [`docs/spec/kinds.md`](docs/spec/kinds.md), generated from the
  kind registry. `npm run guards` fails when the two differ.
- **Spec correction:** a Refutation (`30083`) is addressable, replaced at its own `d` tag. Rev 20's table called it
  regular; the wire was always addressable.
- **The registry says what is dormant:** kinds 4, 40, 41, 43 and 44 are in code no screen reaches, and kind 42 is
  read, never sent.
- **Removed:** scripts and tests that ran against code no longer in the repository, and a local relay database's
  working files, committed by mistake. Also four methods in `nostrService.ts` that nothing called, and the message
  and channel fields only they filled in.
- **A guard keeps the old framing out:** `scripts/guard-old-framing.mjs`, in `npm run guards`, reads the code,
  scripts, extension and served files.
- **The chat adapters' metadata** names Starcom as maintainer and AGPL-3.0-only as licence. It said MIT.

## 0.2.0 (23 Nov 2026): the first public release

Speaks interchange rev 20. Which older revisions it reads is not yet tested; the compatibility suite (open-source
release plan, step 3) will say.

- **Nothing published is lost to a dropped connection.** A report, its withdrawal, a settlement or challenge, an
  inbox list, or a Mission Package that no relay takes waits on the device, exactly as signed. It goes when a relay
  answers, and the screen that sent it says so (D-RP, RP8). What every relay refuses for good is shown with their
  reasons instead.
- **Publish and withdraw a report** from its own page (D-RP).
- **Chat sends nothing it cannot seal.** Direct and team messages are sealed; a message to any other channel is
  refused (legal question E1).
- **A locked key covers the post-quantum signing key too** (D-KL, KL7).
- **Whose notes the layers read is published data**, at `/.well-known/starcom-publishers.json`, not code.
- **The volcano catalogue credits the Smithsonian's Global Volcanism Program** on every card that draws it.
  The public repository leaves the catalogue's data out until its terms are confirmed; `scripts/eco-natural/bake-volcanoes.ts`
  bakes it from the source.
- **The sample data's incident names no real organization:** its people and domains are fictional, on `.example`.
