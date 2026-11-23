# Architecture Decisions

The audit in `00-current-state/` found the same pattern repeatedly: two or
more independently-built implementations of the same job, with no migration
path between them and no signal (beyond a sometimes-stale comment) about
which one is "real." These decisions resolve each case: one canonical
implementation, an explicit fate for the others (retire-with-redirect,
harvest-then-delete, or delete outright), matching the precedent the
codebase has already set once (`/case-manager` → `/cases-dashboard`).

These are prerequisites, not optional cleanup. You cannot build a Mission
Package UI that "attaches related Intel Reports" while there are three
places a report can live and four places an investigation can live — the
builder would have to pick one anyway, silently, which just adds a fifth
undocumented assumption to the pile.

| Decision | Doc | Resolution |
|---|---|---|
| Which Intel Report persistence + browse/create UI is canonical | [`canonical-intel-report-path.md`](canonical-intel-report-path.md) | `IntelReportUI`/`intelReportService`/`IntelWorkspaceManager` + `IntelWorkspaceConsole` |
| Which Investigation/Case system is canonical | [`canonical-investigation-case-system.md`](canonical-investigation-case-system.md) | `CasesDashboard`/`IntelCaseService` |
| Where the boundaries are between the Intel\* apps | [`intel-app-boundaries.md`](intel-app-boundaries.md) | Keep IntelAnalyzer, IntelWeb, and the Dashboard separate — they're genuinely different jobs; the redundancy was never *between* them, it was multiple copies *of* each |
| What role the 3D Globe plays | [`globe-role.md`](globe-role.md) | Confirmed peer app / spatial anchor, not a pipeline gate — matches the user's own framing |
| How the app models and shows time (D-E) | [`time-model.md`](time-model.md) | Event time with a stated fallback; one shared cursor; UTC marked Z; tests that fail today before any code |
| What the globe shows first, and what a card carries (D-F) | [`globe-visualization.md`](globe-visualization.md) | A first visit shows what arrived before any other visualization work; a card carries the caveats that apply to it; the layout and hierarchy audit follows the first step |
| How the browser's own key is kept at rest (D-KL) | [`key-lock.md`](key-lock.md) | A NIP-49 passphrase lock, offered selected when a key is made and skippable; asked for once a visit, only for the person's own act; what runs on its own waits for the unlock |

Each doc states the decision, the reasoning, and exactly what "losing"
implementations are retired/deleted/harvested — cross-referenced to the
`00-current-state/` file with the full evidence.
