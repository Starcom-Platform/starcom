# Phase 2 — Consolidation (near-term backlog, not date-boxed)

**Status, 2026-08-29: Phase 2 is complete.** Navigation cleanup, NetRunner
dead-bridge deletion, IntelAnalyzer dead-subtree deletion, the full Intel
Report consolidation, and the Investigation/Case consolidation (with a real
data migration) are all done and committed — `e1fc196a`, `6ffe9177`,
`01016519`, `d342692d`. Several things surfaced along the way that weren't in the
original plan; most were resolved in follow-up commits, and what remains
open is listed as such:

1. **A pre-existing git index issue**: `src/components/Intel/` and
   `src/components/intel/` are both tracked as separate paths that resolve
   to the same physical files on this case-insensitive filesystem (present
   since a 2025-08-30 commit, long before this initiative). Kept in sync
   for the two files this phase touched; the underlying duplicate tracking
   itself needs deliberate, separate cleanup — it's a real risk on a
   case-sensitive checkout (Linux CI, some deploy targets).
2. **A redirect-shim race condition**: a cold, direct visit to a
   redirect-shim route (`/intel`, `/intel/workspace`, and the
   already-existing `/team/:teamId`) can lose a race against `MainPage`'s
   own one-time auto-navigate-to-Globe effect, landing on the Globe instead
   of the intended app. Confirmed pre-existing and shared with
   `/team/:teamId`'s already-established shim — not a regression from this
   phase's new redirects, but worth a real fix given it affects the exact
   scenario these shims exist for (bookmarked/shared deep links).
3. **RESOLVED — see the Investigation/Case section, item 3.** This was
   originally logged as "the RelayNode integration needs a decision,"
   based on a misread that treated the `:8081` HTTP API as live
   infrastructure. It's dead prototype work; the real RelayNode integrates
   over Nostr/IPFS. Retired in `ef131f0b`. Kept in this list as a record of
   the wrong turn, not as outstanding work.
4. ✅ **RESOLVED (`a8c62e69`): the legacy IPFS layer was also dead, and is gone.**
   The "has real consumers" caveat here was too generous — on a careful
   re-check the consumers turned out to be demos and a never-called field:
   `IPFSContentOrchestrator` and `ApiService` had zero importers;
   `IPFSNetworkManager` and `RelayNodeIPFSService` only had legacy siblings
   plus a `StorageStatusBadge` nothing renders; and
   `UnifiedIPFSNostrService`/`IPFSNostrBridgeService`/`IPFSNostrIntegrationManager`
   were reachable only from the `/ipfs-nostr-demo` route and a field in the
   live `SecureChatIntegrationService` that was constructed and then never
   called. All deleted. **`ProxyUtils` was kept** — genuinely live
   (`env.ts`, `WeatherDataService`, `MarketDataService`).
   **The real IPFS path was kept and is deliberate**: `IPFSService` →
   `lib/ipfs-client` (Helia + public gateway fallback), plus build-time
   Filebase pinning via `scripts/pin-to-filebase.mjs`, already wired into
   `npm run build`. `IPFSService.ts` documents why there's no browser-side
   user-pinning path (no server by design; the operator credential belongs
   on the build host). That's a decision, not a gap.
5. ✅ **RESOLVED (`a8c62e69`): Mission Package relays are configurable.**
   The gap this whole thread surfaced: intel INGEST was configurable
   (`VITE_NOSTR_INTEL_RELAYS`) but Mission Package PUBLISH was hardcoded to
   five public relays — so Starcom could receive from the relay node's
   internal relay but never publish back to it. `VITE_NOSTR_MISSION_RELAYS`
   closes that, additive by default (an internally-published package must
   still reach the Navcom surface) with `VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE`
   as an explicit air-gapped opt-in. No internal endpoint is hardcoded —
   the capability is built, the address is configuration, specifically so
   this doesn't repeat the `:8081` prototype's mistake. Documented in
   `.env.example`.
6. **Done in `499a4039`: the `docs/testing/*.sh` scripts against `:8081` are gone.**
   They were the evidence behind the wrong turn above. Worth deleting or
   clearly marking as prototype-era so the next reader doesn't repeat it.

Executes the rest of `01-architecture-decisions/` that Sprint 1 didn't need
to touch, plus the full dead-code cleanup. Each item below cross-references
its decision doc and current-state evidence — this file is the task
breakdown, not the reasoning (read the linked docs for that).

## Intel Report consolidation (see `canonical-intel-report-path.md`) — ✅ done

1. ✅ Ported `pages/Intel/IntelDashboard.tsx`'s two unique features into `IntelWorkspaceConsole.tsx`: deep-link highlight (`?reportId=`), "View on Globe" button.
2. ✅ Redirected `/intel` → the canonical route (same pattern as the existing `/case-manager` → `/cases-dashboard` redirect). Known limitation found: races against `MainPage`'s auto-navigate on a cold direct visit — see status note above.
3. ✅ Redirected `/intel/workspace` → the canonical route; removed its now-doubly-inaccurate deprecation banner.
4. ✅ Repointed `AnalysisWorkbench`'s `ExportDraftButton` handoff — goes through `navigateToApp('inteldashboard', ..., { reportId })` directly now, not a URL string (also fixed a real bug: the old handoff's `?draft=` param was never actually read by the page it targeted).
5. ✅ Repointed the Globe's "Open in Intel Dashboard" popup button the same way.
6. ✅ Deleted the dead subgraph: `IntelDashboardPopup.tsx`, `useIntelDashboard.tsx`, `TestIntelDashboard.tsx`, `components/Intel/IntelReportPopup.tsx` (create-form).
7. **Skipped, deliberately**: renaming `components/ui/IntelReportPopup/IntelReportPopup.tsx`. The collision is fully resolved by step 6's deletion (only one `IntelReportPopup` exists anywhere now); renaming would only touch ~10 import sites for pure naming hygiene with no functional gain. Revisit if it ever becomes confusing in practice.
8. ✅ Retired the legacy on-chain `IntelReportService` (`src/services/IntelReportService.ts`) and its only consumer, `src/api/intelligence.ts` (itself uncalled anywhere).
9. ✅ Fixed `OfflineIntelReportService`'s sync target (was calling a Web3 service nothing ever initialized — sync has never once succeeded in the live app) and gave `OfflineIntelReportsManager` a real entry point (a new "Offline Reports" globe context-menu action). Found and fixed a second latent bug along the way: `updateOfflineReport` silently discarded any explicitly-set status.

## Investigation/Case consolidation (see `canonical-investigation-case-system.md`) — ✅ done

1. ✅ **Migration built, not skipped** — took the real-migration path rather than accepting data loss (the `/case-manager` shortcut only worked because that data was already confirmed fake; two of these four stores hold real records). `services/intel/migration/investigationsToCases.ts` reads both legacy stores and creates real Cases through `IntelCaseService`, mapping the incident-response status vocabulary onto Case's and folding Case-less fields into the description + metadata. Idempotent by construction (origin markers rebuilt from the canonical store, not a staleable flag); deliberately does not delete its source data. Runs on `CasesDashboard` mount with a dismissible notice.
2. ✅ Redirected `/investigations` → `/cases-dashboard` (the shim replaces the whole page, so its mock-investigation fallback went with it).
3. ✅ **Resolved: it's dead prototype architecture, and it's gone.** Worth recording how this was initially got wrong, because the trap is reusable: `docs/testing/test-auth.sh` and `test-valid-jwt.sh` exercise `127.0.0.1:8081/api/v1/investigations`, which looked like evidence of a live integration, so the first pass kept the route. The user corrected it — **the RelayNode capability stack that actually shipped is the Jetson Orin AGX running as a Mk1/prototype AI Security Relay Node, and it integrates over Nostr and IPFS** (exactly what `NostrStarcomIntelIngest` and `MissionPackageBroadcastService` already use). The `:8081` HTTP API is early-prototype RelayNode work; those test scripts are from the same dead era. **The lesson: a test script proves someone once built something, not that it's live.** Retired in commit `ef131f0b`.
4. ✅ Repointed the HUD's "Investigation Board" button at `/cases-dashboard`; carried the OpenTimestamps note forward into `phase-3-flow-and-ux.md` rather than losing it with the deleted file.
5. ✅ Deleted `InvestigationBoard.tsx`, retired `InvestigationsDashboard.tsx` to a shim, and (in `ef131f0b`) deleted `CyberInvestigationMVP.tsx`, `InvestigationDashboard.tsx` and its children, `useInvestigation`, `InvestigationContext`, and `InvestigationApiService`. **`CollaborationSidebar` was kept** — real NIP-28 chat used by TeamWorkspace and CyberTeamManager, unrelated to the prototype API.

## Dead code deletion (see `02-dead-code-and-redundancy-inventory.md`)

Work through the "Confirmed dead" table there. Before each deletion: re-grep for dynamic `import()` calls (several things in this codebase are lazy-loaded, which static-import grep alone won't catch), confirm no test file exercises the code as a regression guard worth keeping even if the app-facing feature is gone, then delete.

## NetRunner cleanup (see `netrunner.md`) — mostly done

1. ✅ Deleted the dead bridge abstractions: `IntelAnalyzerIntegration.ts` (the whole file — none of it had a real caller, not just the report functions) and the `useIntelBridge`/`NetRunnerIntelligenceBridge`/`TestIntelBridge`/`EnhancedRightSideBar` chain.
2. **Deferred, deliberately**: `tools/adapters/IntelAnalyzerAdapter.ts`'s fate. It's real, tested, registered code (not dead in the "nobody built it" sense) — deciding to wire it into the live report pipeline is a real feature-build task, not a cleanup one. Left as-is; still registered-but-inert.
3. **Deferred, deliberately**: NetRunner's stub tabs (Scanner/Intel/Analysis, right-sidebar Status). Implementing them is real feature work; they already fail honestly (`AWAITING_IMPLEMENTATION`, not a fake success) rather than pretending to work, so leaving them isn't misleading in the meantime.

## IntelAnalyzer cleanup (see `intel-analyzer.md`) — mostly done

1. **Deferred, deliberately**: porting `IntelFusion.ts`'s logic into `DraftBuilder.ts`. It's real, and it's *more* sophisticated than what's live — but porting it is a scoped enhancement task, not cleanup, and `IntelFusion.ts` isn't going anywhere (it has a real, separate consumer: `IntelligenceDashboardService.ts`). Flagged here for whoever picks up analysis-quality work next.
2. ✅ Deleted `IntelAnalyzerApplication.tsx` and the rest of `components/IntelAnalyzer/*`.
3. **No action needed**: the geo-polygon filter was checked and is already honestly labeled "(placeholder)" throughout its own UI text — it doesn't need a new label, it already has one.

## Navigation cleanup (see `navigation-and-app-structure.md`) — done, with a caveat

1. ✅ Deleted the dead nested-route placeholders in `routes.tsx`. Investigated first (see status note above) rather than attempting the "fix and re-enable" option: `RouteSynchronizer`'s one real line was commented out, and even uncommented it only synced the URL with a second, dead state system (`ViewContext`) that `MainPage`/`ApplicationRenderer` never read — not a viable quick fix, just dead weight.
2. ✅ Deleted the fully-dead `ViewContext`/`useView`/`useRouteSync`/`useNavigation`/`useViewNavigation`/`BottomBar.tsx` system, and removed `ViewProvider`/`RouteSynchronizer` from `App.tsx`'s composition.
3. **Not started**: orphan routes (`/info-gathering`, `/info-analysis`, `/team/:teamId/new-report`, `/cyber-investigation`) still need a link-in-or-retire decision.
