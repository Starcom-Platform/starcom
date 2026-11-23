# Current State — Index

> **Each audit describes the app on its own date.** Much of what they found has since been built or fixed; later
> decision records and plans supersede them. Read them as the record of what was wrong and why, not as a description
> of the app today.

Eleven areas, each audited independently by reading the actual code. Read the
one relevant to what you're touching before changing it — several things
here look wired but aren't (see each file's "wiring status" callouts).

| Area | Doc | One-line verdict |
|---|---|---|
| Navigation & app structure | [`navigation-and-app-structure.md`](navigation-and-app-structure.md) | 7 real apps + a pile of legacy/orphan routes; deep-linking is broken; two nav systems, one fully dead |
| NetRunner | [`netrunner.md`](netrunner.md) | One real report-creation path, hidden in a collapsed panel, firing automatically; everything else is a stub or local-only |
| Intel Reports & dashboards | [`intel-reports-and-dashboards.md`](intel-reports-and-dashboards.md) | Four independent persistence paths, three independent "browse/create" UIs, one long dead-code tail |
| IntelAnalyzer | [`intel-analyzer.md`](intel-analyzer.md) | The live version (`AnalysisWorkbench`) is genuinely mature; its predecessor is fully dead code with a more sophisticated engine inside it going nowhere |
| IntelWeb | [`intelweb.md`](intelweb.md) | Real, but read-only — a graph/vault viewer over already-published reports, not a report editor |
| Investigations & Cases | [`investigations-and-cases.md`](investigations-and-cases.md) | The same concept built four separate times with four separate stores; one of the four is broken by default (points at a server this repo doesn't start) |
| Mission Packages | [`mission-packages.md`](mission-packages.md) | Backend fully built, tested, and signed end-to-end; zero UI calls any of it |
| Team coordination | [`team-coordination.md`](team-coordination.md) | Teams and invites exist in one browser only (an invite cannot be redeemed on another machine); presence is honestly-fake; permissions removed (nothing could enforce them); rank is unbuilt; no shared "who did what" view |
| Chat | [`chat.md`](chat.md) | The post-quantum core runs, but three wiring gaps send every message as plain text and deliver no direct messages; repair rather than rebuild (checked live 2026-09-26) |
| Post-quantum cryptography | [`post-quantum.md`](post-quantum.md) | Real and independently verified: ML-DSA-65 on findings, claims and manifests (72 conformance vectors, 398 tests, a local dry run), ML-KEM-768 in chat; gaps: no cross-signing, Intel Reports unsigned, an Ed25519 downgrade, two canonical forms (audited 2026-09-26) |
| 3D Globe integration | [`globe-integration.md`](globe-integration.md) | A real peer app with two working bridges out and one back in; its own headline feature (create-report-from-map) is a dead end |

## Cross-cutting patterns worth naming once

These show up in nearly every file below, so naming them here saves repeating them:

1. **"Wiring stub"** — a feature that is fully built, has no TODO or placeholder text, is imported into a live render tree, and yet has no way to actually trigger it (a toggle that's never set true, a button whose only "opener" is itself orphaned). This is a distinct, more dangerous failure mode than an honest stub, because it reads as done in a code review and even has passing unit tests, but is unreachable by an actual user. Found at least three times independently: `OfflineIntelReportsManager` (off the Globe), the `IntelDashboardPopup` subgraph, and the entire Mission Package UI question.
2. **N independent implementations of the same job.** Not "a v1 and a v2 with a migration path" — genuinely parallel systems, built at different times, none aware of the others, often with different backing storage. Found for: Intel Report persistence (4 paths), Intel Report browse/create UI (3 implementations), Investigation/Case tracking (4 implementations), NetRunner→report "bridges" (3 implementations, 1 live).
3. **Self-describing staleness.** Several files contain comments that are themselves out of date — a component calling itself a "placeholder" when it's fully featured, a route flagged "deprecated" that renders the exact same component as the "current" one, a doc (`docs/ecosystem.md`) describing a bug that was already fixed. Don't trust an in-file comment's claim about completeness without checking the actual code.
4. **Same name, different thing.** `IntelReportService` exists as two unrelated classes with different backing stores. `IntelReportPopup` exists as two components with opposite purposes (one dead create-form, one live read-only detail view). `IntelDashboard` is the name of at least three different screens reachable by different paths. This is a standing hazard for anyone (human or AI) navigating this codebase by grep-for-name.
