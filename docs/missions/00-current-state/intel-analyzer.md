# IntelAnalyzer

## The live version: `AnalysisWorkbench.tsx` — genuinely mature

**Entry**: `src/applications/intelanalyzer/AnalysisWorkbench.tsx`, registered as app id `intelanalyzer`. Wraps `IntelWorkspaceProvider` → `BoardsProvider` → `FilterProvider` → `SelectionProvider` → `CorrelationProvider`, mounts `DeepLinkSync` + `GlobeIntelPublisher` + `WorkbenchContent`. Its own comment says it "Replaces the old IntelAnalyzer" (line ~184) — accurately, see below.

**Real, working features:**
- Four interchangeable views: Timeline, Table, Map, Graph.
- Filtering via `FilterPanel`, including a real geo-polygon UI — though the polygon itself is a hardcoded placeholder triangle (`panels/FilterPanel.tsx:331-368`, explicitly labeled "Geo (placeholder)").
- Saved **Boards** — a named snapshot of view + filters + selection + pins + notes (`state/BoardsContext.tsx`, `panels/BoardsPanel.tsx`).
- Pin items to the active board, add analyst notes (`panels/InspectorPanel.tsx`).
- Entity resolution and structural/attention findings panels.
- A real **correlation engine** running in a web worker (`state/CorrelationContext.tsx` + `state/correlation.worker.ts`) that computes `CorroboratedFinding`s (2+ independent sources, no unresolved conflict) and a "Publish Finding" action to Navcom via `FindingsPublisherService`.
- Full deep-linking (filters, selection, view, board) to/from the URL via `utils/deepLink.ts` — the one part of the app where internal deep-linking actually works (see `navigation-and-app-structure.md`).
- Publishes correlation output to the 3D globe via `GlobeIntelPublisher` — built specifically because the underlying `useGlobeIntelLayer` hook existed but was never invoked by anything until this.

**The real export path** (this is the one genuine "Intel → Intel Report" flow with any polish anywhere in the app): Board → `ExportDraftButton` → `DraftBuilder.buildFromBoard()` (maps notes/pins/filters/watchlists into an `IntelReportUI`-shaped draft, markdown Summary/Evidence/Context sections, classification-based entity redaction) → `intelReportService.createReport()` → `IntelWorkspaceManager` (IndexedDB) → navigates to `/intel?from=intelanalyzer&draft=<id>` — i.e., hands off to the **separately-routed** `pages/Intel/IntelDashboard.tsx` page for further editing (see `intel-reports-and-dashboards.md` for why that's one of three competing dashboard implementations). AnalysisWorkbench creates and hands off; it has no report-editing UI of its own.

## The dead predecessor

`src/applications/intelanalyzer/IntelAnalyzerApplication.tsx` — confirmed **zero importers anywhere in `src/`** (grep across router, tests, everything). If it were wired, it would render `IntelAnalyzerLayout` → `IntelTransformationDashboard` from a **completely different directory**, `src/components/IntelAnalyzer/` (note: no `s` — easy to confuse with `applications/intelanalyzer/`).

That directory (`components/IntelAnalyzer/`) is a self-contained earlier generation, also fully orphaned as an aggregate (its barrel `index.ts` has zero importers anywhere):

- **`IntelTransformationDashboard.tsx`** — 4 tabs (Search/Fusion/Reports/Analytics) over a **hardcoded mock `Intel[]` array** (`// TODO: Replace with actual service calls`). Analytics tab is a literal "coming soon" placeholder.
- **`IntelFusionInterface.tsx`** — also mock-data-driven, but its "Fuse Intel into Report" button calls `IntelFusionService.fuseIntelIntoReport()` (`models/Intel/IntelFusion.ts`), which is **real, substantial, non-stub logic**: geographic-scope computation, source aggregation, reliability averaging, markdown generation (executive summary, key findings, recommendations, intelligence gaps), confidence/completeness/timeliness scoring. This is genuinely more sophisticated analysis-to-report template logic than anything in the live `DraftBuilder`. But its output only ever lands in local component state — the "Export" button is an explicit stub (`// TODO: Implement export functionality`, body is `console.log(...)`).
- **`IntelReportsViewer.tsx`** — the one component in this dead directory actually wired to the real backend (`intelReportService.createReport`, same as the live path) — but only reachable via the also-dead `IntelTransformationDashboard`, so it's unreachable in practice.

## What must be fixed here (see `04-plan/`)

1. Delete `IntelAnalyzerApplication.tsx` and the entire `components/IntelAnalyzer/` directory — confirmed dead, explicitly superseded by its own successor's comment.
2. Before deleting, evaluate porting `IntelFusion.ts`'s template-generation logic (geographic scope, source aggregation, gap analysis) into `DraftBuilder.ts` — it's real, more sophisticated work than what's live, and would be a waste to discard rather than harvest.
3. Fix the geo-polygon filter's hardcoded placeholder, or clearly label it as illustrative-only until real polygon drawing exists.
