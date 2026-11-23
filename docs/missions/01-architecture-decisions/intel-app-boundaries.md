# Decision: Intel\* App Boundaries

The user's question: should IntelAnalyzer, IntelWeb, and Intel\* all be one
single sub-app? **No — keep them separate.** The redundancy the audit found
was never *between* these three; it was multiple competing copies *of* each
one individually (already resolved by the decisions in this directory).
Once each is reduced to its one real implementation, the three remaining
apps do three genuinely different jobs:

| App | Job | Verb |
|---|---|---|
| **IntelDashboard** (canonical `IntelWorkspaceConsole`) | Browse, search, create, and edit individual Intel Reports | *manage* |
| **IntelAnalyzer** (`AnalysisWorkbench`) | Correlate multiple reports across time/map/graph/table views, find corroborating patterns, produce a draft report from analysis | *analyze* |
| **IntelWeb** | Explore the relationship graph of already-published reports, entities, and locations | *explore* |

This is a reasonable, distinguishable three-app split — a filing cabinet, a
workbench, and a map room. Merging them would either bloat one screen with
three unrelated interaction models (a Kanban-ish list, a 4-view analysis
workbench with a web-worker correlation engine, and a D3 force graph don't
share a natural layout), or force users through tabs inside a mega-app for
no real gain over the current bottom-nav switch, which already works.

## What actually needs fixing between them (not a merge)

1. **The handoff is one-directional and awkward.** IntelAnalyzer's export flow currently hands off to the *wrong* dashboard implementation (`pages/Intel/IntelDashboard.tsx` — see the canonical-path decision) — once that's fixed, verify the handoff lands cleanly in `IntelWorkspaceConsole` instead.
2. **IntelWeb has no reciprocal links in.** NetRunner, IntelAnalyzer, and the Dashboard should each offer a "View in IntelWeb" affordance once something's published, matching IntelWeb's own honest empty-state message.
3. **NetRunner needs a real bridge to IntelAnalyzer, not just to report creation.** Right now NetRunner's only live output path is straight to a persisted report (via `OsintIntelBridge`) with no stop at "review/correlate this in the Analyzer first" — worth considering whether raw NetRunner findings should land as analysis-ready material in AnalysisWorkbench's board system rather than (or in addition to) auto-becoming a finished report.

## What this decision does NOT cover

Whether the Globe should be considered a fourth peer in this cluster — it's addressed separately in `globe-role.md`, because its relationship to these three is materially different (spatial visualization, not intel-record management).
