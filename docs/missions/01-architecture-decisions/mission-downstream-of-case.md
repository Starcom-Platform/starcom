# Decision D-B — a Mission is downstream of a Case

**Status:** decided. **Supersedes:** the "Report → Case/Mission attachment"
framing in [`../03-pipeline/README.md`](../03-pipeline/README.md).

## The decision

The pipeline is **Report → Case → Mission**. A Case is the investigation; a
Mission is the deliverable produced from it. Cases and Missions are not parallel
containers a report can be attached to interchangeably.

## Why it needed deciding

Nobody had ever stated the relationship, and the types disagree with each other
about whether one exists.

- `MissionUI.relatedCases` points Mission → Case.
- `IntelCaseUI.relatedCases` points at **other Cases** — not Missions.

So a Case cannot see what was built from it. Under this decision that is
backwards: the Case is upstream, and upstream should be able to see its output.

The two are otherwise near-duplicates — both aggregate reports, both carry
collaborators, comments, activity logs and permissions. Mission adds objectives
and a status machine ending at `DISPATCHED`. Without a stated relationship there
was no answer to the two questions that actually block work:

1. **Which does an Intern open first?** Onboarding could not say.
2. **What is a Case's location?** Unanswerable while it was unclear whether a
   Mission derives its position from a Case or independently. See
   [`case-location-semantics.md`](case-location-semantics.md).

## What follows

**The back-link is derived, never stored.** A stored `relatedMissions` on
`IntelCaseUI` would be a second source of truth for a fact the forward link
already carries, and the two can desync. `missionService.listMissions()`
filtered on `relatedCases.includes(caseId)` cannot. `MissionsPanel` already does
the mirror-image filter, so the pattern exists.

**Derivation is two hops.** Report → Case → Mission means a Mission's position,
if it ever has one, derives through a Case which itself derives from reports.
That makes a single synthesized pin less defensible, not more — see
`case-location-semantics.md`.

**The app has to stop saying otherwise**, in three places:
`03-pipeline/README.md` (describes Case and Mission as parallel attachment
targets), `usePipelineProgress` (tracks report → mission with no Case step at
all), and `03-pipeline/user-stories.md`.

## What this decision does NOT say

It does not say a Mission *requires* a Case. Nothing enforces that, and this
decision deliberately does not add enforcement: a mission raised directly from
reports is still valid, it is simply not the described path. Making the Case
mandatory would be a separate decision with migration consequences for every
mission that already exists without one.

It also does not merge the two types. That option was considered and not taken;
revisit only if the duplication becomes a maintenance problem rather than a
conceptual one.
