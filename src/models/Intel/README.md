# Intel domain models

Types for intel data points, the reports built from them, and the places, sources and
quality ratings they carry. Rewritten on 2026-11-20 from the files present. The earlier
version described files that no longer exist, security classifications and clearance
levels (removed in September 2026), storage on a blockchain and REST endpoints.
Starcom has none of these.

## Files

| File | What it holds |
| --- | --- |
| `Intel.ts` | A raw intel data point, and the quality types it re-exports. The most used file here. |
| `Intelligence.ts` | Intel after analysis: what it means and in what context. |
| `IntelReport.ts` | The report model the interface uses. |
| `Classification.ts` | Source quality and information reliability ratings for open-source work. Despite its name, it holds no security classifications. |
| `Sources.ts` | Source types and collection disciplines. |
| `IntelEnums.ts` | Shared enumerations. |
| `IntelLocation.ts` | Where an item is. |
| `IntelVisualization3D.ts` | What the globe needs to draw an item. |
| `IntelligenceFlowchart.ts` | How kinds of intel relate as work moves from collection to reporting. |
| `Enhancements.md` | The history of an earlier round of changes, with its own status note. |

## Where reports really live

- **On the device:** reports a person writes are stored in the browser (IndexedDB, plus a quick
  copy in localStorage), through `src/services/intel/IntelReportService.ts` and
  `src/services/intel/IntelWorkspaceManager.ts`.
- **On the network:** intel on Nostr is kind 30023 events tagged `t=starcom_intel`, read by
  `src/services/intel/NostrStarcomIntelIngest.ts`. In the app, the Exchange and NetRunner's
  OSINT publisher write them through `src/services/intel/NostrIntelBroadcastService.ts`.
  A report in the intel workspace is published from its panel as a note carrying its own text
  (`src/services/publishing/reports.ts`, decision D-RP in
  `docs/missions/01-architecture-decisions/report-publishing.md`), and withdrawn from there
  (RP7), or shared through cases, missions and bundles.
- **Report ingest decisions:** `docs/missions/01-architecture-decisions/canonical-intel-report-path.md`
  records which path is canonical and why.
