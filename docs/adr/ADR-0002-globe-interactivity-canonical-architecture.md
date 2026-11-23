# ADR-0002: Canonical Globe Interactivity Architecture

- Status: Accepted
- Date: 2026-03-07
- Updated: 2026-09-03 (Context corrected against the tree)
- Owners: Globe Platform + UI Systems

## Context

The globe interactivity flow is implemented through a canonical production path
(`Enhanced3DGlobeInteractivity.tsx`). The DECISION below — decomposing that
behaviour into hooks under `src/features/globe/` — still stands, and one of the
six hooks exists (`rlsh/useSelectionMemory`). The remaining five are unbuilt and
`Enhanced3DGlobeInteractivity.tsx` is ~1690 lines, so this section previously
described the target as though it were the tree.

Legacy sibling components (`EnhancedGlobeInteractivity.tsx`,
`EnhancedGlobeInteractivityV2.tsx`) are no longer part of the production
codebase — that much was accurate. They were **deleted** in commit 3e65f75d
rather than archived; `src/components/Globe/__archived__/` has never existed.
Read them from git history if needed.

> An ADR describing a chosen direction is exactly what an ADR is for. What broke
> here was tense: the Context said behaviour "is decomposed" and files "were
> archived", both in the past perfect, so every downstream doc and two guards
> inherited a state that was never reached. The decision is unchanged; only the
> claim about what exists has been corrected.

## Decision

1. The canonical production interactivity path is:
   - `src/components/Globe/Globe.tsx` wiring into
   - `src/components/Globe/Enhanced3DGlobeInteractivity.tsx`

2. The target architecture is layered:
   - Domain policy (identity + navigation rules)
   - Application orchestration hooks
   - Rendering/input adapters
   - Thin composition component

3. New feature work must not add new sibling interactivity components in `src/components/Globe`.

4. Existing large interactivity logic must be decomposed via behavior-preserving strangler extraction.

## Consequences

### Positive
- Reduced regression blast radius
- Clear ownership and extension pattern
- Better testability and observability

### Negative
- Short-term migration overhead
- Requires disciplined phase gate enforcement

## Phase-aligned Implementation Notes

- P0/P1 establish baseline and guardrails first.
- P2 begins extraction of popup orchestration, pointer input, cursor trail, projection, and RLSH memory modules.
- P5 adds observability dashboards and popup-drift SLO tracking.
- **P6 retired legacy sibling components** — files DELETED in 3e65f75d (not archived; `__archived__/` never existed). guard-globe-interactivity-architecture enforces their absence, which is the part that still holds.

## Compliance Checks

A change is ADR-compliant when:
- It does not introduce new interactivity sibling files in `src/components/Globe`.
- It routes behavior changes through canonical contracts/hook modules.
- It preserves or improves targeted interactivity test coverage.
