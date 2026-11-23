# IntelWeb

**Entry**: `src/applications/intelweb/IntelWebApplicationWrapper.tsx`, registered as app id `intelweb`.

## What it actually is: read-only graph/vault exploration, not an editor

The wrapper calls `intelReportService.listReports()` and feeds the results through `IntelWebIntegrationService.buildFromReports()` (`src/services/intelweb/IntelWebIntegrationService.ts`), which synthesizes a **virtual Obsidian-style vault**: a folder tree (`reports/`, `entities/`, `locations/`) of markdown files with YAML frontmatter, one `.md` per report plus derived entity/location files, wired together by wikilinks and a `relationshipGraph`. It reads only already-published `IntelReportUI` records — no raw/unprocessed intel, no files off disk, no direct IPFS access.

**Three-pane layout**, all read paths — no form, save button, or write-back to `IntelReportService` anywhere in any of these four files:
- Left sidebar: folder/file tree, click-to-select only (no create/rename/delete). Its header is **hardcoded to literally say "Demo Intelligence Vault"** regardless of whether real data is loaded — a cosmetic bug worth a two-line fix regardless of anything else.
- Center: `IntelGraph.tsx`, a real D3 force-directed graph with confidence/type filters, freeze/save/reset layout persisted to `localStorage`, BFS "isolate node ± depth."
- Right sidebar: five read-only tabs (Graph Statistics, File Content, Metadata, Node detail, Edge detail).

**Stub flags**: 3D graph mode is a literal placeholder (`&lt;div className="graph-3d-placeholder"&gt;3D mode coming soon…&lt;/div&gt;`), disabled via comment "until engine implemented (Phase 4+)." A large embedded demo-vault generator (`loadDemoVault`) exists but is dead in practice since the wrapper always supplies a real `initialVault`.

## Its one honest cross-link

The empty state explicitly says: *"Publish one from NetRunner, IntelAnalyzer, or the Intel Dashboard to see it here."* This is accurate and is the correct mental model for what IntelWeb is for. Nothing reciprocates it — none of those three apps link forward into IntelWeb once a report is published.

## What must be fixed here (see `04-plan/`)

1. Fix the hardcoded "Demo Intelligence Vault" header label.
2. Add reciprocal links from the report-producing apps (NetRunner, IntelAnalyzer, the canonical Intel Dashboard) into IntelWeb once something's published — a one-line "View in IntelWeb" affordance, mirroring the Globe's "View on Globe" pattern.
3. This app's purpose is correctly scoped (exploration/relationship-mapping) and should **not** be merged with the report-creation UIs — it's solving a genuinely different job. See `01-architecture-decisions/intel-app-boundaries.md`.
