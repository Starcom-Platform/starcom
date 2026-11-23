# Decision D-C — the globe is an evidentiary display

**Status:** decided.

## The decision

When the globe's honesty about what it is showing conflicts with its density and
immediacy as a command-centre surface, **honesty wins**.

## Why it needed deciding

The globe is described as the flagship Cyber Command Center experience. It is
also, in code, built to an evidentiary standard that no command-centre UX would
naturally adopt:

- `globeIntelLayer` refuses to jitter coincident marks, because **position IS
  the claim** — two marks in one place stay in one place rather than being
  nudged apart for legibility.
- `weight` is documented *"0..1, DERIVED — never declared. Drives visual
  prominence, so a hardcoded value here would put a lie directly into what an
  analyst sees first."*
- Unplaceable records must be excluded **and counted**, never quietly omitted.
- `GlobeIntelStatus`'s entire purpose is stating what the globe is **not**
  showing, and it renders nothing when there is nothing to disclose — so the
  badge's presence is itself information.

Those pull against density. Every disclosure added is a caveat competing with
the map for attention, and three were added in a single session (matched/showing
counts, hidden-by-priority, plus the existing status stack). The question was
which way to resolve that when they conflict, before the caveats accumulated by
default rather than by choice.

## What follows — and it is not "more badges"

The real consequence is that the app already computes a rich epistemic state and
presents it **sixteen different ways**, with no shared vocabulary. Surfaces
rendering some form of epistemic status today: `App`, `DataIntegrityBanner`,
`CaseReplayPanel`, `RLSHPopup`, `IntelReportTooltip`, `GlobeIntelStatus`,
`Globe`, `SpaceWeatherStatusCard`, `SpaceWeatherMetricsPanel`,
`ConnectionStatusDashboard`, `TimelineView`, `CyberCommandRightSideBar`,
`StructuralFindingsPanel`, `CorroborationGapsPanel`, `CorrelationContext`, and
OSINT's `ResultsPanel`. `DataIntegrityBanner` is single-purpose and rendered in
exactly one place; there is no shared component.

The axes the code already computes, which a vocabulary must name once each:

| Axis | Fields | The distinction that must not collapse |
|---|---|---|
| Fabricated vs real | `isMock`, `integrity.realRatio` | a synthetic record ≠ inaccurate content |
| Placed vs unplaceable | `unplaceable.reasons` | "no coordinates" ≠ "not found" ≠ "in a store this resolver does not read" |
| Shown vs withheld | `truncated`, `hiddenByPriority`, `hiddenByTimeWindow`, `expiredLayers` | "not shown" ≠ "nothing found" |
| Stated vs derived vs absent | `confidenceBasis.source`, priority `unset`, position | **nobody said ≠ someone said low** |
| Corroboration | `independentFeeds`, contested | single-source ≠ contested ≠ corroborated |
| Attribution | `unattributed` | an unknown actor ≠ a name |
| Freshness | `ageMs`, `stale`, `expiredLayers` | stale ≠ absent |
| Completeness | `degraded`, `blindSpots` | sparse ≠ quiet |

**The vocabulary is linguistic before it is visual.** Every honesty defect found
in this initiative was a wording failure first: `showLow` never meant "someone
said low"; a table offering "open to view" for a description whose key is gone;
"showing N of M" where M was derived from the same capped array as N. A shared
component that carries the wrong sentence is no better than sixteen that do.

## Consequences already applied

The focus-target disclosure was **reordered to come after** the vocabulary
rather than before it. Built first it would have added a seventeenth bespoke
presentation of "why can't I see this", immediately before deciding what those
should look like.

## What this decision does NOT say

It does not say the globe should be cluttered. An evidentiary display that
nobody can read fails at being evidence. The intended reading is that when the
two genuinely conflict the caveat stays and the *design* absorbs it — which is
why the answer is a vocabulary rather than a licence to keep appending notices.

It also does not mandate a second "operator mode". A split by audience was
considered and not taken, because two designs means every future layer has to
serve both.
