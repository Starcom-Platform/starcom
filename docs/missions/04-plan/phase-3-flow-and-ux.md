# Phase 3 — Flow & UX (longer-term)

The rework proper, once Phase 2's consolidation means there's one clean
implementation per concept to design around, instead of three or four.

## Onboarding — ✅ done (`bf584285`)

`NewUserHint` was a single dismissible card pointing at "Find Teams" and a
Ctrl+K tip — no explanation of the pipeline, no way to discover the other
apps. Replaced with a three-step pipeline guide (collect intel → assemble a
mission → publish to Navcom).

The design decision worth carrying forward: **steps are derived from the
canonical stores, not narrated.** A scripted tour is exactly the
stale-able artifact this initiative keeps finding — it describes a sequence
of screens and drifts silently when one moves. This reads real counts
(`usePipelineProgress`), so it can be wrong about what is *useful* but never
about what *exists*, and it updates the moment the operator does the thing.
Each step has a distinct checkable condition; steps that would collapse into
the same observable state were merged rather than invented.

It also outlives first run — the old card showed once ever, so the pipeline
was undiscoverable to anyone who dismissed it or arrived afterward.

Still open here: the deeper "tour of what each app is for" remains unbuilt.
The guide names three apps; Cases, IntelAnalyzer and IntelWeb are reachable
only via the Ctrl+K line at the bottom.

## The loop-backs from `03-pipeline/README.md`

1. ✅ **Analysis → collection — done (`ed627834`).** The engine already
   computed this and threw it away: `computeCorroboratedFindings` derives
   independence for every claim, keeps what clears two feeds, discards the
   rest. `computeCorroborationGaps` surfaces that discarded set using the
   *same* independence rules (a looser rule would contradict the corroboration
   pass in the same UI). `CorroborationGapsPanel` lists them and hands the
   subject to NetRunner, which now accepts `initialTarget` (it previously took
   the application context and only logged it).

   **Known limitation, not solved:** NetRunner's OSINT tab scans *domains*,
   and a gap's subject is whatever the observation names — often a GLEIF LEI
   code or a company name. The handoff seeds correctly; the operator must
   adjust it to something scannable. A real subject→query translation is
   unbuilt work.

   The "topic with no recent coverage" half of this item is also still
   unbuilt — only the single-source half shipped.
2. ✅ **Team discussion → report creation — done (`e9f5a072`).** A mission comment's "New report from this" creates the report and attaches it. From a mission's comment thread,
   a "this needs a new report" action that opens report creation without
   losing the mission context, then re-attaches the result automatically.
3. ✅ **Publish → new mission — done (`e9f5a072`).** A dispatched mission offers a follow-up, linked by id and resting on no inherited evidence. Surface a "what came out of this" prompt
   after a mission reaches `DISPATCHED`, offering to start a follow-up
   mission pre-linked to the dispatched one.

## Cross-app affordances — **scoped separately, see `cross-app-affordances.md`**

This section used to read: *extend "View on Globe" to Cases and Missions
once they have real coordinates; add reciprocal "View in IntelWeb" links.*
That estimate was wrong, and an audit replaced it with
[`cross-app-affordances.md`](cross-app-affordances.md).

Short version: it is two unrelated features, not one, and only the IntelWeb
forward deep-link is small. Cases and Missions have **no geo field at all**,
so this is a placement-semantics question before it is code — and the two
gating decisions (may a Mission carry a position, given it is broadcast to
public relays under Locked Decision #7; and what a Case's location even
*means*) are product and tradecraft calls, not engineering ones. Case
placement is additionally blocked on an entity-linking UI that does not
exist: `relatedEntities` has no product writer, so a derived resolver would
return nothing for every real record while passing its own fixture tests.

The existing Report→Globe affordance should be **repaired before it is
copied** — it activates no layer, never clears its focus target, and its
test asserts only that the producer fired.

## Navigation polish

**The URL half is done in `e905ff42`**: every application has an address (`/app/<id>`, the Globe at `/`), so Back, Forward and reload work across the app. The persistent pipeline-stage nav element is still unbuilt.

Once Phase 2's route cleanup lands: a persistent nav element that actually
communicates the pipeline stages (not just 7 flat icons with no ordering
hint), and `MainBottomBar` updating the URL for every app switch (today
only the Globe button does), so browser back/forward and refresh behave
sanely across the whole app, not just on the Globe.

## Rank/progression (only if the org actually wants it — currently just planning prose)

`docs/page-consolidation/**` has an unbuilt "Command Rank System" proposal
(Trainee → Analyst → Specialist → Expert → Commander). `03-pipeline/
user-stories.md` deliberately recommends **not** building this for Sprint 1
or Phase 2, mapping Intern/Cadet/Archangel Knight onto the existing
`TeamMember.role`/`clearanceLevel` vocabulary instead. Revisit this only if
there's a real product decision to make rank/progression a first-class
feature — don't build it speculatively ahead of that decision, per this
whole audit's central lesson about architecture built ahead of real need.

## Tamper-evident timestamping for Cases (carried forward from the retired InvestigationBoard)

`InvestigationBoard.tsx` (deleted in Phase 2's Investigation/Case
consolidation) carried an honest note worth not losing with it: it used to
attempt blockchain anchoring on investigation creation, which *always*
failed — it needed a connected wallet's `signTransaction` callback and no
signing UI has ever existed for it. It was dropped rather than fixed,
because it required a funded wallet for a property nothing consumed.

The note's own forward-looking suggestion stands: **OpenTimestamps would
give the same tamper-evident timestamp proof for free, via Bitcoin, with no
wallet and no funding.** If provable "this case existed at this time" is
ever a real requirement for Cases, that's the path — not reviving the
wallet-signing approach.

## Permissions enforcement

`CollaborationPermissions` (`canEdit`/`canDelete`/`canAssign`) persists
today but nothing checks it (`team-coordination.md`). Real enforcement is a
security-relevant decision, not a UX one — scope it deliberately, likely
alongside whatever the org decides about clearance-level access control
more broadly, rather than as an incidental UX polish task.
