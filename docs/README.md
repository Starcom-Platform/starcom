# Starcom documentation

What the app does, and how to run it, is in the [README at the top of the repository](../README.md). This page
says where the rest is.

## Guides

| | |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the code is organised, and how notes are read and published |
| [`GLOSSARY.md`](GLOSSARY.md) | The project's own terms |
| [`TESTING.md`](TESTING.md) | Which check to run when |
| [`LANGUAGES.md`](LANGUAGES.md) | The interface's languages, and adding one |
| [`../extension/README.md`](../extension/README.md) | Building and loading Starcom Uplink, the browser extension |
| [`spec/README.md`](spec/README.md) | The wire formats, the event kinds, and their test vectors |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | How work is checked, and what is refused |

## Records

The records below are how decisions were made and checked, kept as written. They are long, and many describe the app
as it was on their date: read the decision records for what holds now. Commit hashes cited in them refer to the
private repository's history, which is not published.

- **[`missions/`](missions/README.md): decisions and plans.**
  - `00-current-state/`: audits of each part of the app, each as of its date; later decisions supersede them.
  - [`01-architecture-decisions/`](missions/01-architecture-decisions/README.md): what was decided, by whom, and why,
    indexed by ID.
  - `03-pipeline/`: the people and the stories the app is measured against.
  - `04-plan/`: plans, handoffs and readiness work.
- **[`spec/`](spec/): the protocols Starcom publishes, under Apache-2.0.** This includes
  NIP-XX Attested Claims and its test vectors.
- **[`interchange/`](interchange/): dated notes on how Starcom exchanges records** with other
  software.
- **[`measurements/`](measurements/): measurements behind published numbers,** and how to repeat
  them.
- **[`intake/`](intake/): what happens to what a person submits.**
- **`adr/`:** two accepted architecture records, on the globe's interactivity and on
  source observations.

## Data and licences

- [`THIRD-PARTY.md`](../THIRD-PARTY.md) lists every dataset, texture, font and sound, with its
  licence and source.
- `src/legal/sourceRegister.ts` records what each source allows.
- `src/legal/peopleDataRegister.ts` records each place the app holds data about people.

## Older documents

The private repository also holds design notes, phase reports and plans from 2025 to
early 2026, and two planning records not yet published (the data-licensing and commercial-split decisions). Many describe features since removed, such as crypto wallets, an earlier chat
system and an analytics dashboard. They are kept as history and are not part of the public
release. Where an older document and the code disagree, the code is right.
