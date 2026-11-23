# Dead Code & Redundancy Inventory

Flat, scannable checklist for cleanup work. Each entry cross-references the
`00-current-state/` doc with full evidence — verify against current code
before deleting anything (this is a point-in-time audit; also re-check for
dynamic `import()` calls, not just static imports, before removing a file).

## Confirmed dead — zero live callers anywhere in `src/`

| File/subtree | Why it's dead | Source |
|---|---|---|
| `src/applications/intelanalyzer/IntelAnalyzerApplication.tsx` | Zero importers; superseded by `AnalysisWorkbench.tsx` (its own comment says so) | `intel-analyzer.md` |
| `src/components/IntelAnalyzer/*` (whole directory: `IntelAnalyzerLayout`, `IntelTransformationDashboard`, `IntelSearch`, `IntelFusionInterface`, `IntelReportsViewer`, barrel `index.ts`) | Only reachable via the also-dead `IntelAnalyzerApplication.tsx` above; barrel has zero importers | `intel-analyzer.md` |
| `src/components/Intel/IntelDashboardPopup.tsx` | Only reachable via `useIntelDashboard.tsx`, whose only callers are also dead | `intel-reports-and-dashboards.md` |
| `src/hooks/useIntelDashboard.tsx` | Same dead subgraph | same |
| `src/components/Intel/TestIntelDashboard.tsx` | Dev scaffolding, imported nowhere | same |
| `src/components/Intel/IntelReportPopup.tsx` (create-form version — not the live `ui/IntelReportPopup/` one) | Zero importers | same |
| `src/applications/netrunner/integration/IntelAnalyzerIntegration.ts`'s report-producing functions (`createIntelReportFromWorkflow`, `publishIntelReportFromWorkflow`, `publishBotOutputReports`) | Zero call sites anywhere in `src/` | `netrunner.md` |
| `src/components/NetRunnerIntelligenceBridge.tsx`, `src/components/TestIntelBridge.tsx`, `src/components/EnhancedRightSideBar.tsx` | `EnhancedRightSideBar` (the only real importer of the bridge component) has zero importers itself | same |
| `src/components/HUD/Bars/BottomBar/BottomBar.tsx` + the `ViewContext`/`useViewNavigation` system it alone consumes | Imported nowhere; a second, fully dead navigation system | `navigation-and-app-structure.md` |
| `src/services/IntelReportPackageManager.ts` | Zero real callers (only its own signature test) | `intel-reports-and-dashboards.md` |
| ~~`src/services/FolderIntelReportPackageService.ts`~~ | **DELETED 2026-09-09** (809 lines). Zero references anywhere, not even a test. Removed during the classification purge: it declared its own `InformationVisibility = 'public'\|'internal'\|'confidential'\|'restricted'\|'top-secret'`, a clearance ladder wearing the honest vocabulary's name and shadowing the real one in `models/Intel/Classification.ts`. | same |
| `src/services/IntelServiceOrchestrator.ts` | Zero references anywhere | same |
| `src/services/IntelWorkspaceService.ts` (root `services/`) | Zero real callers | same |
| `src/services/IntelReportValidationService.ts`, `IntelReportErrorService.ts`, `src/hooks/useIntelReportErrorHandling.ts`, `src/components/ErrorBoundaries/IntelReportErrorBoundary.tsx` | This quartet only references itself; the error boundary is never mounted in any JSX tree | same |

## "Wiring stubs" — fully built, imported into a live tree, zero reachable trigger

These are more dangerous than plain dead code because they pass code review and can even have passing tests while being unreachable by a real user.

| Feature | The trap | Source |
|---|---|---|
| `OfflineIntelReportsManager.tsx` | Imported into the live `Enhanced3DGlobeInteractivity.tsx` render tree; its open-toggle `showOfflineManager` is never set `true` anywhere in that file | `intel-reports-and-dashboards.md`, `globe-integration.md` |
| The entire Mission Package publish flow | Fully built, tested, signs and broadcasts for real — but zero UI anywhere calls `MissionService`/`MissionPackageBuilder`/`MissionPackageBroadcastService` | `mission-packages.md` |
| `tools/adapters/IntelAnalyzerAdapter.ts`'s `execute()` | Registered in `AdapterRegistry`, a real 929-line entity-extraction engine — no call site feeds its output into the report pipeline | `netrunner.md` |
| `IntelFusion.ts`'s fusion-template engine | Real, sophisticated logic, only reachable through the dead `IntelFusionInterface.tsx`, and even then its own Export button is a `console.log` stub | `intel-analyzer.md` |

## Orphaned routes (render fine, nothing links to them)

`/info-gathering`, `/info-analysis` (own internal sub-links 404 via catch-all), `/team/:teamId/new-report`, `/cyber-investigation` (duplicate of `/investigations/:id`), `/auth-demo`, `/test-ui`, `/ux-test`, `/enhanced-app-demo`, `/ipfs-nostr-demo` (the demo and test pages, retired 2026-09-30 by plan item 4.1). See `navigation-and-app-structure.md`.

## Naming collisions (not necessarily dead — but a standing hazard)

| Name | Colliding things | Resolution |
|---|---|---|
| `IntelReportService` | `src/services/intel/IntelReportService.ts` (canonical, IndexedDB) vs. `src/services/IntelReportService.ts` (legacy, Solana on-chain) | Retire the on-chain one — see `canonical-intel-report-path.md` |
| `IntelReportPopup` | `components/Intel/IntelReportPopup.tsx` (dead create-form) vs. `components/ui/IntelReportPopup/IntelReportPopup.tsx` (live, read-only detail) | Delete the former, rename the latter once it's the only one left |
| "Intel Dashboard" (as a UI identity) | Bottom-nav `inteldashboard` app, standalone `/intel` page, `/intel/workspace` route | Consolidate per `canonical-intel-report-path.md` |
| "Investigation"/"Case" (as a UI identity) | 4 separate implementations, see `canonical-investigation-case-system.md` | Consolidate per that decision |
| `IntelWorkspaceService.ts` (root) vs. `IntelWorkspaceManager.ts`/`IntelWorkspaceContext.tsx` (`services/intel/`) | Similar names, unrelated — the root one is orphaned | Delete the orphan |

## Stub UI left in permanently (not orphaned, just unfinished)

- NetRunner center view: SCANNER, INTEL, ANALYSIS tabs — literal `AWAITING_IMPLEMENTATION`.
- NetRunner right sidebar: `handleDeepScan` no-op, STATUS tab stub.
- IntelWeb: 3D graph mode placeholder ("coming soon").
- IntelAnalyzer's `FilterPanel`: geo-polygon filter is a hardcoded placeholder triangle.
- `CyberInvestigationMVP`'s Analytics tab: "coming soon" placeholder.
- `CasesDashboard`: New Case / Edit buttons have no handler (this one blocks a decision, see `canonical-investigation-case-system.md` — fix, don't just document).
