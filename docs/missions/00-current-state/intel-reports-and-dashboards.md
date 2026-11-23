# Intel Reports & Dashboards

This is the messiest cluster in the app: four independent persistence paths
for "a formal intel record," three independent UIs for browsing/creating
one, plus a long tail of built-but-unreachable code. Read this before
touching anything with "Intel" in the name.

## Four independent persistence paths

| # | Path | Storage | Real trigger(s) |
|---|---|---|---|
| 1 | **Canonical**: `IntelReportUI` via `intelReportService` (`src/services/intel/IntelReportService.ts`) → `IntelWorkspaceManager` (`src/services/intel/IntelWorkspaceManager.ts`) | IndexedDB, localStorage mirror, field-level encryption for CONFIDENTIAL+ | `NewReportPage.tsx`, `ReportEditPanel.tsx`, `IntelWorkspaceConsole.tsx`, NetRunner's `OsintIntelBridge`, IntelAnalyzer's export flow (see `intel-analyzer.md`), Globe's `useGlobeIntelReportPipeline.ts` (read) |
| 2 | **Offline**: `OfflineIntelReportService` → `secureStorage` (**sessionStorage**, encrypted) | Separate record shape (`OfflineIntelReport extends` the *legacy* `IntelReportData`, not `IntelReportUI`) | Only the Globe's right-click "Create Intel Report" when no wallet is connected (`Enhanced3DGlobeInteractivity.tsx:293`) |
| 3 | **Legacy on-chain**: a *different class*, also named `IntelReportService`, at `src/services/IntelReportService.ts` (root `services/`, not `services/intel/`) | Solana blockchain via `AnchorService` | `src/api/intelligence.ts` (`submitIntelReport`/`fetchIntelReports`); also the sync target `OfflineIntelReportService` calls once a wallet connects |
| 4 | **Publish-only**: `IntelPipelineOrchestrator` via `publishAdapter` (`src/services/exchange/PublishAdapter.ts`) | IPFS + Nostr (blockchain anchor stage exists but is always passed `null` — no wallet-signing UI ever existed) | MarketExchange's `ComposerWizard.tsx` — operates on an **already-created** report from path 1, does not create new ones |

**Path 3 has the same class name as path 1's service** (`IntelReportService`) with a completely different implementation and backing store — a genuine trap for anyone navigating by name, human or AI.

**Path 2 has no reconciliation with path 1.** A report created offline stays in sessionStorage until synced — and the only UI that can trigger that sync, `OfflineIntelReportsManager`, is a **wiring stub**: it's imported into the live `Enhanced3DGlobeInteractivity.tsx` render tree, but its open-toggle (`showOfflineManager`) is never set `true` anywhere in that file. In practice, offline-created reports are close to unrecoverable through the UI.

There is a **fifth, even more ephemeral pattern**: the Globe's own `addLocalReport` (wallet-connected create path, `useGlobeIntelReportPipeline.ts`) is pure React state — never touches any service, vanishes on unmount/refresh, invisible everywhere else. See `globe-integration.md`.

## Three independent "browse/create reports" UIs

| UI | File | Data access | Unique feature | Reachable via |
|---|---|---|---|---|
| **IntelWorkspaceConsole** | `src/components/Intel/IntelWorkspaceConsole.tsx` | `IntelWorkspaceContext` (wraps `IntelWorkspaceManager`) | Tabs (Reports/Intel items), full-text search index, JSON import/validate/commit | Both the bottom-nav `IntelDashboardApplication.tsx` (a 31-line wrapper around this exact component) **and** the "deprecated" `/intel/workspace` route — same component, two doors, one flagged as legacy despite being what the "current" app actually renders |
| **`pages/Intel/IntelDashboard.tsx`** | `/intel` route | `intelReportService` directly (not via context) | Deep-link highlight via `?reportId=`, "🌐 View on Globe" button (the one real bridge back into the Globe — see `globe-integration.md`) | `TopBarNavigation`, Ctrl+K |
| **`IntelDashboardPopup.tsx`** | via `useIntelDashboard` hook | `intelReportService` directly | `filterMode` prop (PUBLIC/TEAM/PERSONAL/ALL) | **Nothing live** — its only callers are `TestIntelDashboard.tsx` (dev scaffolding, imported nowhere) and an orphaned `components/Intel/IntelReportPopup.tsx` create-form (also imported nowhere). A fully-built, fully-working, entirely unreachable feature. |

`IntelWorkspaceConsole.tsx` contains a stale self-description — a comment calling it a "Placeholder console... Future: tabs, detail panel, create/edit drawers" (line ~37) when all three of those "future" items are already implemented in the same file. Don't trust it.

## Naming collision: two `IntelReportPopup` components

- `src/components/Intel/IntelReportPopup.tsx` — a **create form**. Orphaned, zero importers.
- `src/components/ui/IntelReportPopup/IntelReportPopup.tsx` — a **read-only detail popup** for a globe marker click. Live, wired via `IntelReportPopupPortal` into `Enhanced3DGlobeInteractivity.tsx`. Has the one real "Open in Intel Dashboard" cross-app link (→ `/intel?reportId=...`, i.e. the standalone page above, not the bottom-nav app).

Same component name, opposite purposes, only one reachable. This is a pure naming collision, not a functional duplicate — worth renaming regardless of what else changes.

## Adjacent, genuinely distinct concepts (not part of the redundancy — don't merge these)

- **`IntelPackageManager.tsx`** — "Intel Packages" for cyber-investigation teams, backed by `CyberInvestigationStorage` + IPFS, a different type system (`IntelPackage`/`CreatePackageRequest` from `types/cyberInvestigation`) entirely separate from `IntelReportUI`. Live via the HUD's `InvestigationWorkflowPopup`.
- **`IntelCaseService.ts`** / **`IntelRelationshipService.ts`** — thin wrappers over the same `IntelWorkspaceManager` substrate, managing Cases and entity-relationships respectively. Not competing report-persistence paths.
- **`IntelReportVisualizationService.ts`** — a read-side cache/filter layer over `intelReportService` for globe markers (dedup, radius/date filtering, 500-marker cap). Not a persistence path.

## Orphaned dead-code tail (defined, exported, zero real callers)

`IntelReportPackageManager.ts`, `FolderIntelReportPackageService.ts`, `IntelServiceOrchestrator.ts`, `IntelWorkspaceService.ts` (root `services/`, a *third* thing with "Workspace" in the name), `IntelReportValidationService.ts` + `IntelReportErrorService.ts` + `useIntelReportErrorHandling.ts` + `IntelReportErrorBoundary.tsx` (the boundary component is never mounted in any JSX tree found via grep — the whole quartet only references itself), `IntelDataProvider.ts` (registered in `providerRegistry.ts` but nothing calls the registry for intel data — four of its six endpoints hit placeholder URLs, `https://api.starcom.app/intel/...`, that don't exist).

## Nostr-ingested intel is invisible outside the Globe

`NostrStarcomIntelIngest.ts` (real, live, ingests `#starcom_intel` events) is consumed **only** by `useGlobeIntelReportPipeline.ts` and `usePrimaryMarqueeData.ts` — both Globe/MainPage-adjacent. `IntelDashboardApplication`, `AnalysisWorkbench`, and `IntelWebApplication` never see it; they read exclusively from `IntelWorkspaceContext`/`intelReportService`. This is the literal answer to "intel is constantly flowing in via Mecha Jono and the Beu, but why should they have all the fun" — that inbound stream currently only surfaces as ephemeral globe markers, never as first-class, workable Intel Report records anywhere a human would go to act on them.

## What must be fixed here (see `01-architecture-decisions/canonical-intel-report-path.md` and `04-plan/`)

1. Pick ONE canonical "browse/create reports" UI (recommendation: `IntelWorkspaceConsole`, since it's the richest and already what the "current" app renders); port `pages/Intel/IntelDashboard.tsx`'s two unique features (deep-link highlight, View on Globe) into it; retire `/intel` and `/intel/workspace` the way `/case-manager` was already retired to `/cases-dashboard`.
2. Decide path 3's (legacy on-chain) fate — almost certainly delete, given no live wallet-signing UI exists for it anywhere in the app per multiple independent findings.
3. Fix path 2 (offline) to either reconcile into path 1 on sync, or give `OfflineIntelReportsManager` an actual UI entry point so it isn't a wiring stub.
4. Rename one of the two `IntelReportPopup` components to remove the collision.
5. Bridge Nostr-ingested intel into the canonical report store (or an explicit "inbox" ahead of it) so it's actionable outside the Globe.
6. Delete the confirmed-orphaned tail once nothing is found to dynamically import it (grep for dynamic `import(` too, not just static imports).
