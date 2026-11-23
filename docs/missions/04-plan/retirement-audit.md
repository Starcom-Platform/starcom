# Retirement audit

Written 2026-09-26 for decision D5. The question was whether each candidate
fails because it belongs to a bigger plan that still expects it, or because it
is old work with no future. The answer comes from each one's commit history and
the documents behind it.

**One thread runs through four of the six.** They go back to June–August 2025
work on a "blockchain-native intelligence marketplace" with Solana and Ethereum
wallets (`docs/PROJECT-OVERVIEW.md:13`, `26-28`). Starcom's own docs have said
since 2026-08-17 that documents from that era "should not be trusted as current"
(`docs/ecosystem.md:3-6`).

## Verdicts

| Candidate | Built for | What happened to that plan | Verdict | Recommendation |
|---|---|---|---|---|
| **Cyber Investigation Hub and Intel Packages** | The June 2025 "Cyber Investigation MVP": packages uploaded to IPFS and anchored on a blockchain, with the wallet as author (`34a74423`) | Dismantled piece by piece. Anchoring was dropped (`beebfcec`), the Investigation Board moved to Cases (`d342692d`), Team Management moved to OpsCenter (`17d102c3`), and "package" now means Mission Package. The Hub's counts read a store nothing writes. | Superseded | **Retire.** Keep `cyberInvestigationStorage.ts`, which the Cases and team migrations still read, and `IPFSService.uploadIntelPackage`, which the live publish path uses. |
| **Mission Control panel** | The June 2025 floating context panels, showing three made-up missions with ticking countdowns (`e41a0eb3`) | Missions moved to OpsCenter in Sprint 1 (`56d9fdcf`). The panel was later pointed at the same mission list (`0079c1f2`), so it duplicates OpsCenter. The floating-panel system itself is live. | Superseded | **Retire the panel;** keep the system. Missions gets a bar entry (plan 4.4). |
| **Intelligence Dashboard popup** | A 5,575-line "intelligence workflow" drop (`c0a8b4b7`, July 2025), with no consumer for a year until a revival plan made it visible (`373d4bb9`) | Its cycle's phases returned nothing until one real action was added (`9886bc47`). The 2025 cleanup plan already said "remove AI workflows". | Legacy experiment | **Retire, after moving** "Analyze published reports" and IntelFusion's report-template logic into the report builder (`phase-2-consolidation.md:101`). |
| **Demo and test routes** | Test pages for Solana sign-in and access gates (`397685cd`), and the router's consolidation demo (`a33dc0c3`) | The features they demonstrate were removed: token gating and on-chain roles (`beebfcec`), collaborator roles (`364c1b3f`). `routes.tsx.new` is never compiled and imports files that no longer exist. | Legacy experiment | **Retire,** with the four auth hooks, `Web3LoginPanel` and `AuthGate` they alone use. |
| **The wallet** | NFT minting for Intel Reports and the marketplace (`297c057f`) | The marketplace was retired and its servers deleted (`ddf93f51`, `b7283a86`, `6487b969`). Identity moved to Nostr (`046dca3c`). The only forward plan for the wallet was to replace it with NIP-07, and its second step never landed. Every forward plan is wallet-free. | Superseded | **Retire, after two fixes:** the globe's right-click report must save properly without a wallet, and offline reports must sync without one (the wallet was used only as the author). |
| **The Exchange's "Intelligence Marketplace" tab** | A composer that packages a report and publishes it to IPFS and Nostr (`a370c3dc`), wired to real reports since | Live. Only the name comes from the old marketplace. | Live | **Keep.** Rename it ("Publish a report"), and put it behind the publish review. |
| **Starcom Store** | 12 merchandise links, added to the support drive (`0d583599`, February 2026) | The support drive is live and maintained (`eef6a1e4`, 2026-09-21). | Live | **Keep.** Retiring it is a fundraising decision, not cleanup. |
| **Header Discord, Telegram and GitHub** | The August 2025 social hub, for grant applications (`761f0191`) | The support drive reuses all three links. | Live | **Consolidate** into one community menu that fetches its stats only when opened. Rename "Secure Communications", which opens a public Telegram group. |

## What retiring removes

- **The Hub and Intel Packages:** about 1,700 lines.
- **The Intelligence Dashboard:** about 4,800 lines, including `services/intelligence`
  and IntelFusion once its template logic has moved.
- **The demo routes:** about 3,300 lines of code that becomes unused.
- **The wallet:** about 5,300 lines and six `@solana` packages, after the two fixes.

`guard-orphan-exports` confirms that nothing dangles after each removal.
