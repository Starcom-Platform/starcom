# Navigation & App Structure

> **Out of date in places, as of 2026-09-15.** This record predates Cases as a
> registered application, OpsCenter's name, `/app/<id>` addresses, and the `/osint`
> and `/investigations/:id` redirects. Measure the screens with
> `npm run audit:layout`. The layout decisions are in D-F,
> [`globe-visualization.md`](../01-architecture-decisions/globe-visualization.md).

## The two navigation layers

- **Live layer**: `EnhancedApplicationRouterContext` (`src/components/Router/EnhancedApplicationRouter.tsx`) — an in-memory React context (`currentApp`, `presentationMode`, `context`, `history`). `MainPage` (`src/pages/MainPage/MainPage.tsx`) renders persistent chrome (`GlobalHeader`, `MainMarqueeTopBar`, `MainBottomBar`) around `ApplicationRenderer` (`src/components/Router/ApplicationRenderer.tsx`), which mounts exactly one registered app at a time — switching apps **unmounts** the previous one entirely.
- **URL layer**: `src/routes/routes.tsx` defines nested routes for the same 7 apps (`/netrunner`, `/intelanalyzer`, `/cases`, `/teams`, `/nodeweb`, `/timeline`, `/aiagent`, `/bots`, `/monitoring`, `/search`) as `element={null}` — inert placeholders. The intended bridge, `RouteSynchronizer` (`src/components/Navigation/RouteSynchronizer.tsx:8-13`), is **commented out — "TEMPORARILY DISABLED."**

**Consequence**: visiting `/netrunner`, `/intelanalyzer`, `/cases`, `/teams`, etc. directly — a bookmark, a shared link — does not open that app. `MainPage.tsx:27-35` auto-navigates fresh loads to CyberCommand (the Globe) regardless of the URL. Only `IntelAnalyzer`'s own internal `DeepLinkSync` (query params for filters/selection once you're already inside the app via in-app navigation) works.

A **second, fully dead** nav system also exists: `ViewContext`/`useViewNavigation` (`src/context/ViewContext.tsx`, `src/hooks/navigation/useViewNavigation.ts`), consumed only by `src/components/HUD/Bars/BottomBar/BottomBar.tsx`, which is **imported nowhere in the app**. Its view-id vocabulary (`info-gathering`, `node-web`, `ai-agent`, `bots`) doesn't match the live registry. Pure legacy code that could mislead a future maintainer into thinking it's active.

## The 7 registered apps (real, reachable via `MainBottomBar`)

| Nav label | Registry id | Entry file | What it does |
|---|---|---|---|
| Globe | `cybercommand` | `src/applications/cybercommand/CyberCommandApplication.tsx` | 3D globe + cyberpunk HUD, default/bootstrap screen |
| NetRunner | `netrunner` | `src/applications/netrunner/NetRunnerApplication.tsx` | OSINT/investigation tooling — see `netrunner.md` |
| IntelAnalyzer | `intelanalyzer` | `src/applications/intelanalyzer/AnalysisWorkbench.tsx` | Analysis workbench — see `intel-analyzer.md` |
| IntelDashboard | `inteldashboard` | `src/applications/inteldashboard/IntelDashboardApplication.tsx` | Report browse/create — see `intel-reports-and-dashboards.md` |
| IntelWeb | `intelweb` | `src/applications/intelweb/IntelWebApplicationWrapper.tsx` | Graph/vault viewer — see `intelweb.md` |
| CollabCenter | `teamworkspace` | `src/applications/teamworkspace/TeamWorkspaceApplication.tsx` | Teams/chat/invites — see `team-coordination.md` |
| MarketExchange | `marketexchange` | `src/applications/marketexchange/MarketExchangeApplication.tsx` | Package composer/publish — see `mission-packages.md` |

`MainBottomBar`'s `handleNavigation` only updates the URL for the Globe button (`navigate('/')`) — switching to any other app leaves the address bar unchanged, so refresh always drops back to the Globe and browser back/forward doesn't track which app is open.

## Standalone/legacy routes (own `BaseLayout`, separate top nav)

`BaseLayout` (`src/layouts/BaseLayout/BaseLayout.tsx`) wraps these in `TopBarNavigation` (only 4 links: Teams/Investigations/Intel/Globe — doesn't link to the 7 registry apps or to each other) plus a floating "Return to Globe" button.

| Route | File | Status |
|---|---|---|
| `/investigations` | `src/pages/Investigations/InvestigationsDashboard.tsx` | Real but one of 4 duplicate Investigation systems — see `investigations-and-cases.md` |
| `/investigations/:id` | `CyberInvestigationMVP.tsx` → `InvestigationDashboard.tsx` | **Broken by default** — backed by an external server this repo doesn't start |
| `/intel` | `src/pages/Intel/IntelDashboard.tsx` | A **third, separate** report browse/create implementation |
| `/intel/workspace` | `IntelWorkspaceConsole.tsx` (via route) | Self-flags "deprecated" — renders the **same component** the live `inteldashboard` app uses |
| `/team/:teamId` | `src/pages/Teams/TeamWorkspace.tsx` | Redirect shim to the real `teamworkspace` app |
| `/team/:teamId/new-report` | `src/pages/Reports/NewReportPage.tsx` | Real, functional — but **orphaned**, no live link to it |
| `/cyber-investigation` | Same `CyberInvestigationMVP.tsx` as `/investigations/:id` | Orphaned duplicate route to the same broken screen |
| `/osint` | `src/pages/OSINT/OSINTDashboard.tsx` | Large, real, self-contained multi-panel OSINT suite — reachable **only** via Ctrl+K, overlaps heavily with NetRunner, no cross-link |
| `/cases-dashboard` | `src/pages/Cases/CasesDashboard.tsx` | Real, current, unified persistence — the canonical target, see `investigations-and-cases.md` |
| `/case-manager` | — | Pure redirect to `/cases-dashboard` (old mock retired — **this is the existing precedent for what should happen to the other 3 investigation duplicates**) |
| `/info-gathering` | `src/pages/InfoGathering/InfoGatheringDashboard.tsx` | Static tool-category menu, **true orphan** — no live link anywhere |
| `/info-analysis` | `src/pages/InfoAnalysis/InfoAnalysisDashboard.tsx` | Same — true orphan, and its own internal sub-links (`/info-analysis/entity`) aren't even registered routes (404 via catch-all) |
| `/auth-demo`, `/test-ui`, `/ux-test`, `/enhanced-app-demo`, `/ipfs-nostr-demo` | various | Dev/demo harnesses, not linked from the app UI. **Retired 2026-09-30** (plan item 4.1): the addresses fall to the catch-all and land on the globe. |

## How discovery actually works today

- **`MainBottomBar`** — the only nav element common to all 7 registry apps.
- **`GlobalHeader`** search box — hardcoded mock results, not real cross-app search.
- **Ctrl+K Quick Access** (`src/components/HUD/QuickAccess/QuickAccessPanel.tsx`) — the *only* door to `/investigations`, `/intel`, `/cases-dashboard`, `/osint`, and the `teamworkspace` app from outside the bottom bar. Mixes navigation, HUD panel toggles, and globe-layer pinning in one flat list.
- **New-user onboarding**: `NewUserHint` (`src/components/HUD/NewUserHint/NewUserHint.tsx`) — a dismissible card over the Globe, auto-minimizes after 5s, offers exactly one button ("Find Teams" → jumps into `teamworkspace`) and a text tip about Ctrl+K. No tour of the other 6 apps, no explanation of the pipeline.

## Naming collisions in navigation specifically

- **"Intel Dashboard"** is the label/identity of at least three different screens: the bottom-nav `inteldashboard` app, the standalone `/intel` page, and (via the deprecated-but-identical route) `/intel/workspace`.
- `src/applications/intelanalyzer/IntelAnalyzerApplication.tsx` is a dead duplicate of the live, registered `AnalysisWorkbench.tsx` in the same directory — confirmed zero importers anywhere in `src/`.

## What must be fixed here (see `04-plan/`)

1. Either re-enable and fix `RouteSynchronizer`, or remove the dead URL-route placeholders and stop pretending deep-linking exists.
2. Delete the fully-dead `ViewContext`/`useViewNavigation`/`BottomBar.tsx` system.
3. Resolve orphan routes: link them in deliberately, or retire them the way `/case-manager` was retired.
4. Resolve the "Intel Dashboard" naming collision as part of the Intel Report consolidation decision (`01-architecture-decisions/canonical-intel-report-path.md`).
