# NetRunner

**Entry**: `src/applications/netrunner/NetRunnerApplication.tsx` → `NetRunnerControlStation` (four-pane layout: left sidebar, center view, right sidebar, bottom bar).

## What's real vs. stub, pane by pane

- **Center view** (`components/layout/NetRunnerCenterView.tsx`) — 4 tabs: OSINT, SCANNER, INTEL, ANALYSIS.
  - **OSINT** (only working tab): type a domain, SCAN → `WebsiteScannerService.scanWebsite()` fetches HTML through a public CORS proxy (`api.allorigins.win` etc.), parses client-side, shows source/title/status/tech in accordions. **Result lives only in local component state** — vanishes on tab switch/unmount. There is a code path to persist extracted findings as raw `Intel[]` (`storageOrchestrator.batchStoreIntel()`), but it's gated behind `isNetRunnerIntelEnabled()` (`src/config/netrunnerIntelFeatureFlag.ts:19-36`), **default `false`**.
  - **SCANNER, INTEL, ANALYSIS** — literal `AWAITING_IMPLEMENTATION` strings (`NetRunnerCenterView.tsx:482,503,524`). No functionality.
- **Left sidebar** (`NetRunnerLeftSideBar.tsx`) — SCRIPTS / TOOLS / FLOWS tabs.
  - SCRIPTS runs a real scan and feeds it into a script engine, but the result is only `console.log`'d — never rendered. TOOLS lets you select power-tool chips (Shodan, Censys, etc.) but nothing here has a "run" action; unimplemented tools show a "Coming Soon" chip honestly rather than pretending to work. FLOWS renders a real bot-workflow builder (`WorkflowPanel`/`WorkflowEngine`).
- **Bottom bar** (`NetRunnerBottomBar.tsx`) — **collapsed by default** (32px strip). This is where the one real, working pipeline lives: a "Bot Roster" of `BotCard` components. Clicking **Run Mission** on a bot opens a target-input dialog with a "Share with team" checkbox and calls `botMissionExecutor.executeSimpleMission()`.
- **Right sidebar** (`NetRunnerRightSideBar.tsx`) — a *second*, independent scan box, duplicating the OSINT tab with a different results component, no cross-linking. `handleDeepScan` is a no-op ("not yet implemented"). STATUS tab is also `AWAITING_IMPLEMENTATION`.

## The one real path to an Intel Report

`BotCard.tsx`'s `runMission` handler, on completion, **unconditionally** (success, partial, or failure all attempt it) calls `OsintIntelBridge.convertAndStoreIntelReport(result)` (`BotCard.tsx:113-119`), wrapped in its own try/catch so a failure is swallowed with just a console error. This builds a real `CreateIntelReportInput` and calls `intelReportService.createReport()` — the canonical service (see `intel-reports-and-dashboards.md`). If "Share with team" was checked, it also calls `OsintNostrPublisher.publishOsintToNostr()`.

**This is a side effect, not a deliberate action.** There is no "Convert to Intel Report" button anywhere in NetRunner. The prominent, first-thing-you-see OSINT tab, Scripts tab, and right-sidebar scan box have **no path to Intel Report creation at all** — they dead-end in local state or a disabled-by-default raw-storage call.

## Three "bridge" abstractions exist; only one is live

| File | Status |
|---|---|
| `src/applications/netrunner/integration/OsintIntelBridge.ts` | **Live** — `convertAndStoreIntelReport` is the only real path (above) |
| `src/applications/netrunner/integration/IntelAnalyzerIntegration.ts` | **Dead** — despite the name, doesn't call IntelAnalyzer. Its report-producing functions (`createIntelReportFromWorkflow` — explicitly `// DEPRECATED`, `publishIntelReportFromWorkflow`, `publishBotOutputReports`) have zero call sites anywhere in `src/` |
| `src/components/NetRunnerIntelligenceBridge.tsx` + `useIntelBridge` + `TestIntelBridge.tsx` | **Dead** — produces visualization entities/nodes, not reports; its host component `EnhancedRightSideBar.tsx` has zero importers anywhere |

Also confirmed dead/unreached: `tools/adapters/IntelAnalyzerAdapter.ts` (929 lines) is a real, working regex-based entity-extraction engine (emails/IPs/hashes/CVEs/bitcoin addresses, relationship inference), registered in `AdapterRegistry.ts`, but no call site anywhere feeds its `execute()` output into the report pipeline. `NetRunnerOSINTCrawler.tsx` and the `EntityExtractor.tsx` widget (used only in the unrelated global `SearchScreen.tsx`) are separate, disconnected surfaces from the actual NetRunner app entry point.

## Mock-data honesty

`BotMissionExecutor.ts` tracks `usedMockData`; some tool adapters (e.g. `TheHarvesterAdapter.ts`) fall back to mock data when live calls aren't available, and this is surfaced to the operator rather than hidden — a good pattern worth preserving/extending.

## What must be fixed here (see `04-plan/`)

1. Give the OSINT/Scanner tabs a real, deliberate "Create Intel Report" action instead of relying on the hidden Bot Roster side effect.
2. Either wire `IntelAnalyzerAdapter`'s entity-extraction engine into the live report pipeline (it's real, useful work going nowhere) or remove it.
3. Delete the two dead bridge abstractions (`IntelAnalyzerIntegration.ts`'s report functions, the `useIntelBridge`/`NetRunnerIntelligenceBridge`/`TestIntelBridge`/`EnhancedRightSideBar` chain).
4. Decide whether the default-off `NETRUNNER_INTEL_ENABLED` raw-storage path is worth keeping, given it's a second, differently-shaped store from the one path that's actually live.
5. Implement or remove the SCANNER/INTEL/ANALYSIS stub tabs — don't leave `AWAITING_IMPLEMENTATION` as permanent UI.
