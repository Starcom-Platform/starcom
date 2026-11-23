# Decision: Canonical Intel Report Path

Full evidence: [`00-current-state/intel-reports-and-dashboards.md`](../00-current-state/intel-reports-and-dashboards.md).

## Persistence: `intelReportService` (`src/services/intel/IntelReportService.ts`) → `IntelWorkspaceManager`

This is already the most-used path — the read side of AnalysisWorkbench, IntelWeb, MarketExchange, and IntelWorkspaceConsole all already go through it (directly or via `IntelWorkspaceContext`), and it's the only path with real IndexedDB persistence plus field-level encryption for classified content. **No new persistence engine needs building.** The work here is retirement of the other three:

- **Legacy on-chain `IntelReportService`** (`src/services/IntelReportService.ts`, root `services/`, different class, same name): retire. No live wallet-signing UI exists for it anywhere in the app; keeping it only preserves the same-name trap. `src/api/intelligence.ts` is its only real caller — confirm nothing user-facing depends on it before deleting, then rename or remove the collision.
- **Offline path** (`OfflineIntelReportService` → sessionStorage): keep the *concept* (offline-first creation genuinely matters for field work), but (a) give `OfflineIntelReportsManager` a real UI entry point so sync is actually reachable, and (b) make the sync target the canonical path above, not the legacy on-chain service it currently points at.
- **Publish-only pipeline** (`IntelPipelineOrchestrator`/`publishAdapter`): not competing — this operates on an already-created report to publish it externally (IPFS+Nostr). Keep as-is; it's a different concern (publish vs. create) correctly scoped to MarketExchange.

## Browse/create UI: `IntelWorkspaceConsole.tsx`

Reasoning: it's already the richest implementation (search, create, JSON import, detail/edit panels) and is already what the "current," registered bottom-nav app (`IntelDashboardApplication.tsx`) renders — the `/intel/workspace` route's "deprecated" banner is pointing at the *same component* the "current" screen uses, which is actively misleading and should be fixed regardless of anything else.

**Retire, with redirect** (matching the `/case-manager` precedent):
- `pages/Intel/IntelDashboard.tsx` (`/intel` route) — port its two genuinely unique features into `IntelWorkspaceConsole` first: deep-link highlight via `?reportId=`, and the "View on Globe" button (`setFocusLocation`). Then redirect `/intel` → the canonical app/route.
- `/intel/workspace` — redirect to the canonical app's route; delete the now-inaccurate deprecation banner along with it (or repoint it if the redirect isn't instant).

**Delete outright** (confirmed dead, not merely redundant):
- `IntelDashboardPopup.tsx`, `useIntelDashboard.tsx`, `TestIntelDashboard.tsx`, `components/Intel/IntelReportPopup.tsx` (the create-form one) — this whole subgraph has zero live callers.

**Rename, don't delete**: `components/ui/IntelReportPopup/IntelReportPopup.tsx` (the live, read-only globe-marker detail popup) — give it a name that doesn't collide with the deleted create-form once that's gone, so the collision doesn't just move to being solved by deletion coincidence.

## Adjacent systems that are NOT part of this decision (keep as-is)

`IntelPackageManager.tsx` (a different concept, "Intel Packages" for investigations, not Intel Reports), `IntelCaseService`/`IntelRelationshipService` (thin wrappers over the same canonical substrate, not competitors), `IntelReportVisualizationService` (a read-side cache, not a persistence path).

## Confirmed-orphaned tail to delete once nothing dynamically imports it

`IntelReportPackageManager.ts`, `FolderIntelReportPackageService.ts`, `IntelServiceOrchestrator.ts`, `IntelWorkspaceService.ts` (root), `IntelReportValidationService.ts`, `IntelReportErrorService.ts`, `useIntelReportErrorHandling.ts`, `IntelReportErrorBoundary.tsx`, `IntelDataProvider.ts` (and its `providerRegistry.ts` entry). See `02-dead-code-and-redundancy-inventory.md` for the full checklist before deleting each.

## Open question requiring your input

Should Nostr-ingested intel (`#starcom_intel` via `NostrStarcomIntelIngest`) auto-create draft reports in the canonical store, or land in a separate "inbox" a human reviews before it becomes a real report? Both are reasonable; the current state (invisible outside the Globe) is the one option that's clearly wrong. Recommend deciding this alongside Sprint 1 scoping — see `04-plan/sprint-1-mission-packages.md`.
