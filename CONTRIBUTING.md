# Contributing to Starcom

Starcom is the reference app for the Earth Intelligence Network (EIN): a static web app that reads, publishes and
weighs reports over Nostr. Contributions are welcome. This page says how work is checked here, what is refused, and
where decisions are written down.

**Sign off every commit.** Contributions are accepted under the [Developer Certificate of
Origin](https://developercertificate.org/): by adding `Signed-off-by: Your Name <you@example.org>` to a commit
(`git commit -s` does it), you certify that you wrote it, or otherwise have the right to submit it, under the
project's licence. A pull request with an unsigned commit is not merged. The first outside contributions are
merged once counsel has confirmed this path; until then they are reviewed, and issues and discussion are welcome.

## Getting started

You need Node 22.13 or later (`.nvmrc` names the version the project uses; `nvm use` picks it). Under Node 18 some
tests hang.

```bash
npm ci
npm run dev        # http://localhost:5174
```

No environment variables are needed; [`.env.example`](.env.example) lists the optional ones. Keyed services use
your own key, kept in your browser.

## The checks

There is no CI: run them yourself before you open a pull request, and say in it what you ran.

| Command | What it checks |
|---|---|
| `npm run verify` | Guards, the typecheck, protocol conformance and the unit tests, stopping at the first failure |
| `npm run verify -- --quick` | The same without the tests, for before each commit |
| `npx vitest run <folder>` | The tests near what you changed |
| `npm run build` | The production build with its guards |

**The typecheck is `npm run typecheck`** (`tsc -b`). `npx tsc -p tsconfig.json` checks nothing: the root config
lists no files, so that command passes on any code.

**The guards fail the build on purpose:**
- a file another file imports that is not in git;
- a function exported only for a test;
- a public claim the code does not back;
- a publish that skips the publish review;
- server code in a static app.

Each guard's file in `scripts/` says why it exists.

**The walk.** `scripts/audit-intern.mjs` drives two real browsers through the people's stories in
`docs/missions/03-pipeline/user-stories.md`, against a stand-in relay:

```bash
npx vite build && npx vite preview --port 5210
node scripts/audit-intern.mjs http://localhost:5210 --only=S35
```

A change to what a person sees or does should keep the walk working, or add a story for it.

## How changes are written

- **Words a person sees** are plain sentences, in all six languages under `src/i18n/app/`.
- **A commit message** says what changed for people, and names the decision or finding it serves (for example
  "D-RP, RP8" or "audit finding 13").
- **A decision** lives in `docs/missions/01-architecture-decisions/`, one record per area, numbered (D-RP, D-KL,
  D-DR and so on). A change that departs from a record changes the record too.
- **Protocol changes** go through the spec in `docs/spec/` (Apache-2.0) and its test vectors. Starcom is one
  implementation among several, and the EIN's wire formats are not changed in place: a new idea starts in its own
  namespace.

## What is refused

- **Publishing to public relays from a script or a test,** except a live check with a throwaway key, a test tag that
  no globe reads, and everything deleted afterwards.
- **Making a client pose as something it is not** (a browser, another app) to get past a service's rules.
- **Claims the code does not back,** in the README, the site or the docs.
- **The EIN's refusals**, listed at `/.well-known/ein-refusals.json`. Among them: no credential gating of who may
  publish, and no claims naming private individuals.

## Where to start

- **Issues labelled [`good first issue`](https://github.com/Starcom-Platform/starcom/labels/good%20first%20issue):**
  each says what to read, what to do, and how to tell it is done, from this repository alone.
- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md):** how the code is organised, and how notes are read and
  published.
- **[`docs/GLOSSARY.md`](docs/GLOSSARY.md):** the project's own terms (NavCom, Zone, RLSH, The Record and the rest).
- **[`docs/TESTING.md`](docs/TESTING.md):** which check to run when, including the browser walk.
- **The decision records,** indexed by ID in
  [`docs/missions/01-architecture-decisions/README.md`](docs/missions/01-architecture-decisions/README.md). Code
  and commit messages cite them (for example "D-RP, RP8"); a change that departs from one changes the record too.
- **Questions:** [GitHub Discussions](https://github.com/Starcom-Platform/starcom/discussions), or Discord.

## Conduct and security

- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) applies to every place the project meets.
- Report a vulnerability as [`SECURITY.md`](SECURITY.md) says, never in a public issue.

## Licence

Starcom is licensed under the [GNU AGPL-3.0](LICENSE) only. The specs and vectors in `docs/spec/` are Apache-2.0.
