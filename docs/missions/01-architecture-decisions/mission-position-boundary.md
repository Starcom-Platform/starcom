# Decision D1 — a Mission's position stays internal

**Status:** decided. **Scope:** extends Locked Decision #7, does not relax it.

> **Amended 2026-10-06 for regions (decision D-MX, MX11).** A package may name
> the country or state where its work is (a `jurisdiction` such as `us-ca`),
> chosen by its publisher, so that NavCom can place field work on its map. A
> point, a city, or anything finer still never crosses. Everything below holds
> for positions.

## The decision

A Mission **may** carry a position for in-app display (globe focus, map
placement, "where is this mission"). That position **does not cross the Navcom
boundary**. `MissionPackageBuilder` strips it the same way it strips linked
report ids — the package carries counts and briefing text, never a resolvable
location.

## Why it needed deciding rather than estimating

Mission Packages are broadcast to public Nostr relays by
`missionService.publishToNavcom`. Locked Decision #7
(`MissionPackageBuilder.ts:1-11`) states that linked reports and cases cross
**as counts only** — "nothing resolvable back to a specific Starcom-internal
record leaves the boundary."

A position derived from a mission's attached reports is strictly *more*
resolvable than a count: it points at where the underlying collection happened.
And a parameterized-replaceable relay event cannot be recalled once sent.

The sharp edge: Missions are the **only** entity in the cross-app affordance
brief with real link data behind them — `MissionsPanel` genuinely writes
`relatedReports`/`relatedCases`, unlike Cases, whose `relatedEntities` has no
product writer at all. So a derived Mission position would actually *work*.
What it would produce is precisely what the boundary exists to strip. That is
why this was routed as a decision instead of sized in hours.

## What was already true — verified, not assumed

Two claims from the scoping audit turned out to overstate the risk. Both were
checked directly and are recorded here so the picture stays accurate.

**The metadata boundary already holds by construction.**
`buildMissionPackageComposeInput` composes its metadata as an explicit
**allowlist** of five fields (`missionNumber`, `status`, `relatedReportCount`,
`relatedCaseCount`, `objectiveCount`). It does **not** spread `mission.metadata`.
The audit's concern — that `PackageComposer` spreads metadata unredacted — is
true of the *ComposeInput's* metadata, but the mission builder never routes the
mission's own metadata bag into it. An allowlist makes every future field
opt-**in**; a spread would have made each one opt-out.

**The "second channel" through ContextBridge is inert.** The audit flagged
`ContextBridge.syncGlobeFocus` as a second egress, since it puts raw
`lat`/`lng` into a chat message on every focus change. It does — but
`useCollaboration().sendMessage` is a mock in *both* branches of
`useUnifiedGlobalCommand.ts` (`log.debug` and nothing else), and
`RealTimeEventSystem` is in-process pub/sub with no network egress of any kind.
Nothing leaves the browser by that path today.

*This is a statement about now, not a guarantee.* If the collaboration layer is
ever given a real transport, `syncGlobeFocus` becomes a genuine egress for every
focus coordinate, and this decision applies to it. Whoever wires that transport
owns that check.

## Enforcement

`MissionPackageBuilder.test.ts` carries a `Navcom boundary — mission position
(D1)` block, written **before any geo field exists on `MissionUI`**. That is
deliberate: it pins the allowlist property, which is invisible at the call site.
Whoever adds `mission.geo` will find the suite red only if they also route it
into the package — which is exactly the moment this decision needs re-making
rather than inheriting.

## Known gap, recorded rather than papered over

A coordinate typed into a mission's **free-text briefing** still crosses, as
prose in `manifest.description`. `maskDigits` only masks runs of nine or more
digits, so `52.52, 13.405` survives it. There is a test asserting this real
behaviour (`KNOWN GAP: a coordinate typed into the briefing still crosses as
prose`) so it is visible in CI rather than discovered after a broadcast.

Closing it means a coordinate-shaped mask, and that needs its own decision: such
a mask would also strip legitimate figures from a briefing. It is the same
best-effort/false-positive tradeoff already documented for `maskNames`.

## Consequence for the affordance work

Mission → Globe is **not** blocked by this decision — it is unblocked *by* it,
for in-app display only. What remains before building it is the placement
semantics question (what a position derived from N attached reports even
claims), which is the same unanswered question as for Cases. See
[`../04-plan/cross-app-affordances.md`](../04-plan/cross-app-affordances.md).
