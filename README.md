# Starcom

[![DOI](https://zenodo.org/badge/824411336.svg)](https://doi.org/10.5281/zenodo.16419375)

Starcom puts public data on a live 3D globe and lets people publish what they find as signed, open records.

It runs at **https://starcom.app**. There is no server behind it, no account to create, and no tracking. Your identity is a
Nostr key that you hold. What you publish goes to public Nostr relays, where any other client can read and check it.

## Part of the Earth Intelligence Network

Starcom is the reference frontend of the Earth Intelligence Network (EIN): a decentralized, public, free-to-use network
for open-source intelligence. The network is made of frontends like this one and of nodes: Nostr relays, archives,
mirrors and AI agents that publish signed notes. It is designed so that no part has to see or vouch for everything,
and so that a claim is weighed by the method and sources it discloses rather than by who said it. Starcom's
attested-claims format (below) carries what that weighing needs.

Anyone may run their own Starcom: public, for a region or a language, or private, for a team that keeps its work on
its own relays. Anyone may build another app that reads and writes the same notes. The wire formats are open
(Apache-2.0) so that can happen without asking this project.

## Start here

| You want to | Start with |
|---|---|
| Run Starcom and change it | [Run it yourself](#run-it-yourself), then [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Build an app that works with Starcom and the EIN | [`docs/spec/README.md`](docs/spec/README.md): the event kinds, the specs and their test vectors |
| Run your own public Starcom | A self-hosting guide is coming in December. Until then: [`.env.example`](.env.example). A copy built today still describes itself as starcom.app's node; that is being fixed first |
| Run a private or internal Starcom | [`.env.example`](.env.example) shows how to use only your own relays (`VITE_NOSTR_*_RELAYS_EXCLUSIVE`) and your team's internal relays. A full guide is coming in December |
| Run a node: a relay, an archive, a mirror or an AI agent | Not public yet. The node profile will be specified in [`ein-standards`](https://github.com/Earth-Intelligence-Network/ein-standards) |
| Look up a term | [`docs/GLOSSARY.md`](docs/GLOSSARY.md) |

## What it does

**The globe.** Each mode draws public sources directly from the visitor's browser:

- **Eco Natural:** space weather (NOAA SWPC, NASA DONKI), earthquakes (USGS, EMSC, and a historical atlas), volcanoes
  (the Smithsonian's catalogue, left out of the public repository until its terms are confirmed;
  `npm run eco:bake:volcanoes` rebuilds it), wildfires and other hazards (NASA EONET, GDACS), and Earth weather (NOAA GFS temperature, wind and rain; EUMETSAT
  clouds; radar; water gauges; NWS alerts).
- **Geo Political:** diplomatic events (GDELT), conflict zones (UCDP, UNHCR), resource zones (EIA, World Bank), war and
  conflict, and civil unrest.
- **Intel Watch:** intel reports published to Nostr, plus cyber threats, satellites and submarine cables.
- **Raver Watch, Hero Watch and AI Watch:** safety, relief and AI-incident desks.
- **Missions:** open missions and campaigns published by others.
- **Psi Watch:** experimental, and labelled so in the app.

Several layers show notes from Mecha Jono, an AI agent run by the project's owner. It publishes to The Record, an archive
relay. Each layer credits its sources, and each source's terms are recorded in
[`src/legal/sourceRegister.ts`](src/legal/sourceRegister.ts).

**The workspaces:**

- **Intel Reports:** write, search and translate reports. They stay on your device until you publish one.
- **Cases:** link reports and evidence. Publish a case's position, or send a sealed bundle to people you choose.
- **Missions:** compose and publish mission packages, take missions, and report back sealed to the publisher.
- **IntelAnalyzer:** graph, map, table and timeline views. Publish findings, refutations and retractions as attested
  claims (below).
- **Story and Compare:** build a captioned tour of globe views and export it as cards or an MP4. Compare two layers, or
  two moments, side by side.
- **Secure chat:** messages sealed with NIP-59. They use post-quantum ML-KEM-768 when the recipient has published a
  prekey, and NIP-44 otherwise.
- **Reviews:** comments and verdict labels on reports, packages, claims and cases.

Every publish goes through one review step that shows exactly what will be sent, and where, before anything is signed.

**Partial or experimental:**

- NetRunner's lookups work in the browser. Page scans need the Uplink extension or the desktop app.
- Starcom Uplink, the browser extension in [`extension/`](extension/), keeps your key encrypted. It is not in any store yet.
- Starcom Desktop is an early macOS build. Its code will be published at [`Starcom-Platform/starcom-desktop`](https://github.com/Starcom-Platform/starcom-desktop) with its next release.
- The interface ships in English. German, Portuguese, Kiswahili, Hindi and Ukrainian are machine-drafted, and the app
  labels them so.

## Attested claims

Starcom publishes findings in an open format, the
[NIP-XX Attested Claims draft](https://starcom.app/spec/nip-draft-attested-claims.md) (kinds 30082 and 30083).

A claim states how it was reached:

- how many sources it rests on;
- the method and its version;
- what kind of observation it is;
- its own weak points.

It never carries a confidence score. Each reader weighs a claim from what it discloses. A reader can also tell an
independent confirmation from an echo of the same source.

Refutations and retractions are part of the format. Every build checks the specification against
[test vectors](https://starcom.app/spec/vectors/index.json). The specification and vectors are Apache-2.0, in
[`docs/spec/`](docs/spec/).

Starcom also publishes the rules it holds itself to, in
[`/.well-known/ein-refusals.json`](https://starcom.app/.well-known/ein-refusals.json).

## How it is built

- React, TypeScript and Vite, with a Three.js globe.
- Static hosting only (Vercel). A build check fails if server code appears.
- Nostr for identity and publishing. Keys come from the browser, the Uplink extension, or any NIP-07 signer.
- Keyed services (EIA, OpenWeatherMap, N2YO, Shodan, Censys, cloud translation) use your own key, kept in your browser.
- On-device translation with NLLB-200 (600M), run in a Web Worker.

## Run it yourself

You need Node 22.13 or later.

```bash
npm ci
npm run dev          # http://localhost:5174
npm run build        # the production build, with its guards
npm run verify       # guards, typecheck, protocol conformance and tests
```

No environment variables are needed. [`.env.example`](.env.example) lists the optional ones.

`npm run build` also refreshes a few public-data snapshots over the network. Each is skipped if its source can't be
reached.

`npm run build:commercial` builds a version without the sources whose terms rule out commercial use. Each source's
terms, and whether the commercial build may use it, are in [`src/legal/sourceRegister.ts`](src/legal/sourceRegister.ts).

The checks run locally (`npm run verify`) and in every deployment build. There is no CI. How to contribute, and
how work is checked: [`CONTRIBUTING.md`](CONTRIBUTING.md).
What changed, release by release: [`CHANGELOG.md`](CHANGELOG.md).

## Documentation

| | |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the code is organised, and how notes are read and published |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | The project's own terms |
| [`docs/TESTING.md`](docs/TESTING.md) | Which check to run when |
| [`docs/LANGUAGES.md`](docs/LANGUAGES.md) | The interface's languages, and adding one |
| [`extension/README.md`](extension/README.md) | Building and loading Starcom Uplink |
| [`docs/spec/README.md`](docs/spec/README.md) | The wire formats and their test vectors |
| [`docs/missions/01-architecture-decisions/README.md`](docs/missions/01-architecture-decisions/README.md) | Every decision record, by ID |
| [`docs/README.md`](docs/README.md) | A map of everything under `docs/` |

## Data and privacy

Starcom keeps your keys, drafts, cases and settings in your browser. It sends what you choose to publish to relays.
Visitors' browsers fetch each layer's data from its source.

[`src/legal/peopleDataRegister.ts`](src/legal/peopleDataRegister.ts) records what is kept, sent and published, about whom.
Starcom has no privacy policy or terms of service yet; both are in preparation.

## Licence

- Starcom is licensed under the [GNU AGPL-3.0](LICENSE) only.
- The protocol specifications and vectors in `docs/spec/` are Apache-2.0.
- Third-party code and data keep their own terms. See [`THIRD-PARTY.md`](THIRD-PARTY.md) and
  [`public/data/README.md`](public/data/README.md).

## Contact

- Security reports: [`SECURITY.md`](SECURITY.md), by way of [`/.well-known/security.txt`](https://starcom.app/.well-known/security.txt).
- Conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- Questions and ideas: [GitHub Discussions](https://github.com/Starcom-Platform/starcom/discussions), or Discord: https://discord.gg/Mea5v8pQmt
- Bluesky: [@starcom.app](https://bsky.app/profile/starcom.app)

Starcom is built by Arch Angel Agency LLC.
