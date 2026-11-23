# 3D Globe Integration

The Globe (`src/components/Globe/Globe.tsx`) is Starcom's flagship visual
centerpiece. This doc covers how it connects to the *rest* of the app — its
own internal Intel Report data pipeline was already extracted and tested
earlier this session (`useGlobeIntelReportPipeline.ts`) and isn't repeated
here.

## Architecturally: a peer app, not a hub

The Globe is one of 7 registered apps in `EnhancedApplicationRouter.tsx` (id `cybercommand`), switched by the same mechanism as every other app, rendered by the same `ApplicationRenderer` that mounts exactly one app at a time — **switching away from the Globe fully unmounts it.** It is the default/bootstrap route (`MainPage.tsx` auto-navigates fresh loads here), but that's a one-time landing default, not ongoing architectural centrality. `MainBottomBar` styles its button no differently from the other six.

## Two real bridges out

- **Marker click → cross-app handoff.** Click sets `clickedModel`, which opens a full-screen modal via the app's global `usePopup()` manager (not a self-contained globe widget). For Intel Reports: `IntelReportPopupPortal`. Inside it, `src/components/ui/IntelReportPopup/IntelReportPopup.tsx` has a real "📊 Open in Intel Dashboard" button — `navigate('/intel?reportId=${report.pubkey}')` — landing on the standalone `pages/Intel/IntelDashboard.tsx` page (one of the three competing dashboard implementations, see `intel-reports-and-dashboards.md`), which reads `?reportId=` and scrolls/highlights that report.
- **Context-menu → other apps.** `'scan-area'`/`'signal-analysis'` actions navigate to `/netrunner/...`; `'report-incident'` navigates to `/cases-dashboard`.

Hover only sets local `hoveredModel` state for an inline tooltip — no navigation.

## One real bridge in

`pages/Intel/IntelDashboard.tsx`'s "🌐 View on Globe" button calls `setFocusLocation({lat, lng})` from `GlobeContext` and navigates to `/`. `GlobeProvider` is mounted at the `App.tsx` composition level, **above** the app-switcher, so `focusLocation` survives the app switch — the Globe flies the camera there on return (`Globe.tsx` consumes `focusLocation` in an effect keyed off it). `GlobalHeader`'s country-search flow uses the same mechanism.

## The Globe's own headline feature is currently a dead end

The right-click "Create Intel Report" context action (`handleCustomContextAction`'s `'create-intel-report'` case) branches on wallet connection:

- **Wallet connected** → `Globe.tsx handleCreateIntelReport` → `addLocalReport()` → `useGlobeIntelReportPipeline.ts`'s `setIntelReports((prev) => [...prev, report])`. **Pure local React state.** Never calls `IntelReportService`, `IntelWorkspaceManager`, or `intelReportVisualizationService`. Exists only as a marker on this Globe instance, for this session — gone on unmount/refresh, invisible to every other screen in the app.
- **Wallet not connected** (the common case) → `OfflineIntelReportService.createOfflineReport()` — a real, persisted write, but into the offline/sessionStorage path (`intel-reports-and-dashboards.md`, path 2), which has no reachable sync trigger today (`OfflineIntelReportsManager`'s open-toggle is never set `true` anywhere).

**Net effect: an Intel Report created via the Globe's own signature action essentially never reaches the rest of the app under current wiring**, regardless of which branch it takes.

## What must be fixed here (see `04-plan/`)

1. Fix `handleCreateIntelReport`'s wallet-connected branch to actually call `intelReportService.createReport()` (the canonical path) instead of local-only state.
2. Give `OfflineIntelReportsManager` a real UI entry point (a button, a badge showing pending-sync count) so the wallet-disconnected branch's reports are actually recoverable.
3. Once `intel-reports-and-dashboards.md`'s dashboard consolidation lands, repoint the "Open in Intel Dashboard" button at whichever implementation becomes canonical.
4. This confirms the user's own framing directly: the Globe is correctly a peer/central-visual-anchor, not a required starting point — but its one deliberately Starcom-specific creation feature needs to actually work for that framing to be true in practice, not just in intent.
