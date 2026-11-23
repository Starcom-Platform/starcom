# Decision: Canonical Investigation/Case System

Full evidence: [`00-current-state/investigations-and-cases.md`](../00-current-state/investigations-and-cases.md).

## Canonical: `CasesDashboard` (`src/pages/Cases/CasesDashboard.tsx`) / `IntelCaseService`

It's the only one of four implementations built on the canonical Intel substrate (`IntelWorkspaceManager` — the same store the Intel Report decision lands on), and the codebase has already set this exact precedent once: `/case-manager` was retired to `/cases-dashboard` for being "an in-memory mock that never persisted anything." The other three implementations fail that same test in different ways.

**Prerequisite fix, before anything else touches this area**: `CasesDashboard`'s "New Case" button and per-row "Edit" icon have no `onClick` handler. This is a small, contained fix and should land first — the canonical screen currently can't do the one thing it needs to do.

## Retire, with redirect

- **`/investigations`** (`InvestigationsDashboard.tsx`, `realTimeTeamService`-backed) → redirect to `/cases-dashboard`. Drop its hardcoded mock-investigation fallback rather than carrying it forward.
- **`/investigations/:id`, `/cyber-investigation`** (`CyberInvestigationMVP`/`InvestigationDashboard`, external-server-backed) → **RETIRED in `ef131f0b`.** This doc originally said "confirm whether that external AI Security RelayNode API is real infrastructure before deleting" — the right instinct, and the answer came back: **it isn't.** The `:8081` HTTP API is early-prototype RelayNode work. The AI Security Relay Node that actually shipped (the Jetson Orin AGX, Mk1/prototype) integrates over **Nostr and IPFS**, not an HTTP API — which is exactly what `NostrStarcomIntelIngest` and `MissionPackageBroadcastService` already do. The first pass at this got it wrong by treating `docs/testing/test-auth.sh`'s calls to that endpoint as proof of a live integration; they're from the same dead prototype era.
- **HUD popup's Investigation Board** (`InvestigationBoard.tsx` via `InvestigationWorkflowPopup.tsx`, `CyberInvestigationStorage`-backed) → repoint the HUD popup's "Investigation Board" button at `CasesDashboard` (or a modal variant of it) instead of the separate `InvestigationBoard` component. Preserve the honestly-documented "blockchain anchoring was dropped, OpenTimestamps is the real free alternative" note as a forward-looking TODO on the canonical system rather than losing that reasoning.

## What "consolidation" concretely requires

Beyond redirects, this needs a **one-time data migration path** (or an explicit decision to let old localStorage/`CyberInvestigationStorage` records lapse) — three of the four stores have real local data in them for anyone who's used the app, and simply redirecting the route without a migration story means that data becomes invisible, not merged. Flag this as its own scoped task in Sprint 2 (`04-plan/phase-2-consolidation.md`), not something to improvise mid-redirect.

## Downstream dependency

Mission Packages need to reference real Cases (`relatedCases` on `MissionUI`) — this decision is a direct prerequisite for that part of the Mission Package UI (see `00-current-state/mission-packages.md`) working against something real instead of another undocumented assumption about which "Cases" system is meant.
