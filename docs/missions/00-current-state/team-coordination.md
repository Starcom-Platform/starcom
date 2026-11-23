# Team Coordination

**Entry**: `src/applications/teamworkspace/TeamWorkspaceApplication.tsx` (app id `teamworkspace`, nav label "CollabCenter"), backed by `src/services/RealTimeTeamService.ts`.

## What's real

- **Creating/joining a team** — `createTeam()` creates a `CyberTeam`, auto-makes the creator `LEAD_ANALYST`, persists to localStorage, publishes to Nostr. `joinTeam()` dedupes by identity.
- **Invite codes** — real Schnorr-signed Nostr events (reused as a signing envelope, never actually published), genuinely forgery-resistant, verifies the signer is an actual team member.
- **Chat** — real. Both `CollaborationSidebar` (investigation-scoped) and TeamWorkspace's Chat tab (team-scoped) resolve/create real NIP-28 Nostr channels via `useSecureChat`, with genuine message history and live subscription. Not simulated.
- **Investigations-per-team** — `CyberTeam.currentInvestigations` and a real 0–100 `progress` field driven by status transitions (this is investigation-store #1 from `investigations-and-cases.md` — the mock-fallback one).

## What's honestly-fake (shown as absent, not fabricated)

- **Presence** — every member is permanently `'ONLINE'`; zero real callers of `updateMemberStatus` anywhere. A prior fix already replaced a fake indicator with an honest "no presence signal" state (shows `joinedAt` instead) — good pattern, but `docs/ecosystem.md` is stale and still describes the old fake version.

## What's explicitly stated as not-yet-real, in-app

- **Permissions** — removed on 2026-09-13 (`364c1b3f`). Collaborator roles (VIEWER to OWNER) and the `canEdit`/`canDelete`/`canAssign` lists persisted and were shown, but nothing checked them, and in local-first storage nothing could. Records keep only `isPublic`, which the attention queue reads, and `guard-no-access-roles` keeps roles and lists from returning. The authority that is real is signed: a mission's dispatch delegation (`missionCapability.ts`).
- **Project tracking** — Overview and Projects tabs show a literal "not available yet" alert; no backend.
- **Cross-device sync** — `RealTimeTeamService` is publish-only; there is no subscribe side anywhere, so one device never reflects another device's team/investigation changes.

## Role & clearance vocabulary that exists in code today

| Concept | Values | Where |
|---|---|---|
| `TeamMember.role` | `LEAD_ANALYST \| CYBER_ANALYST \| FORENSICS_SPECIALIST \| THREAT_HUNTER \| SOC_ANALYST \| INCIDENT_COMMANDER` | `src/types/cyberInvestigation.ts` |
| `clearanceLevel` (member & team) | `UNCLASSIFIED \| CONFIDENTIAL \| SECRET \| TOP_SECRET` | same |
| `CollaboratorRole` (on Missions/Cases) | removed 2026-09-13 (`364c1b3f`): nothing enforced it | — |
| `actorType` | `human \| ai` | `src/types/cyberInvestigation.ts` — the only human/AI distinction, not a rank |

`SecurityContext.userRole` (`admin | analyst | viewer | guest`) was listed here,
in `src/utils/securityConfig.ts`. That file has been **deleted**: nothing
imported its 457 lines, and its `isAllowed()` was the only code in the
application that read `clearanceLevel` to make a decision. A separate plan,
`docs/chat/CHAT-SECURITY-REORGANIZATION-PLAN.md`, already recorded it as
`DELETED` — which it was not, until now.

**No "Cadet" or "Intern" string exists anywhere in `src/`.**

## "Archangel Knight" already exists in code — but it's a different system

`RLSHRoleClass` (`src/interfaces/RLSHOverlay.ts`, `src/services/rlshVisualizationTypes.ts`) classifies curated *Real Life Superhero registry* globe markers: `hero | zone_guardian | rescue_ranger | archangel_knight`. Per `docs/cybercommand/rlsh-superhero-mode/progress-tracker.md`, the `archangel-knights.json` data file is explicitly "**Reserved for future activation**" — not even active data, just a placeholder role bucket in an unrelated visualization feature. **Zero connection to Starcom's own team/personnel system.** Do not repurpose or confuse this with a real human-rank system.

## Rank/progression: unbuilt planning prose only

`docs/page-consolidation/cybercommand/page-overview.md` and `docs/page-consolidation/teamworkspace/page-overview.md` describe a proposed "Command Rank System" (Trainee → Analyst → Specialist → Expert → Commander, cross-app achievement-based progression) and a team-leader "Coordinator → Operations Commander" track. **Neither is implemented anywhere in `src/`.** These are design docs, not code.

## Mission-level collaboration: real data model, no coordination view

`MissionUI` and `IntelCaseUI` share `Collaboration.ts`'s real `collaborators: Collaborator[]`, `comments: Comment[]`, `activityLog`. `MissionPackageBuilder` deliberately never reads `mission.collaborators` when crossing to Navcom (internal-only, correctly). **The primitives for "this team worked on this together" exist at the data-model level — there is no dashboard anywhere showing "here's what your teammates have done on this mission."**

## Mecha Jono

Correctly **not** a team member — publishes independently over Nostr/IPFS. A prior "Cyber Commander"/Archangel Knights Portal sanction-check gate was removed this session as resting on a wrong premise (the Portal is a mission-collaboration space, not a credential registry; provenance is already solved per-event by Nostr/ML-DSA-65 signatures). See project memory `ein_authority_and_actors.md` for the full record.

## What must be fixed here (see `04-plan/`)

1. Build the missing coordination view on top of `MissionUI`'s existing `collaborators`/`comments`/`activityLog` — this is the connective tissue between "Team Coordination" and "Mission Packages" and is largely a UI-only lift given the data model is real.
2. Decide whether Intern/Cadet/Archangel Knight needs real code representation at all for this sprint, or whether the existing `TeamMember.role`/`clearanceLevel` vocabulary is sufficient to stand in for those real-world descriptors (recommended — see `03-pipeline/user-stories.md`).
3. Update the stale `docs/ecosystem.md` presence description once touching this area anyway.
4. Permissions enforcement was decided on 2026-09-13: not in scope, because a list in local-first storage enforces nothing. Roles and lists were removed (`364c1b3f`), and authority is signed instead. Longer-term: decide whether the proposed rank-progression system (currently pure docs) should ever become real, or should be retired from the planning docs as aspirational.
