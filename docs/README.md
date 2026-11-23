# Starcom documentation

Rewritten on 2026-11-20. What the app does, and how to run it, is in the
[README at the top of the repository](../README.md). This page says where the rest is.

## Current records

- **[`missions/`](missions/README.md): decisions and plans.**
  - `00-current-state/`: audits of each part of the app. Each is dated.
  - `01-architecture-decisions/`: what was decided, by whom, and why.
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
early 2026. Many describe features since removed, such as crypto wallets, an earlier chat
system and an analytics dashboard. They are kept as history and are not part of the public
release. Where an older document and the code disagree, the code is right.
