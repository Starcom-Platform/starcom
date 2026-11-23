# Starcom Mission Pipeline — Current State, Decisions, and Plan

This directory is the working reference for the end-to-end overhaul of Starcom's
core pipeline: **raw intel → Intel Reports → analysis → Mission Objectives →
Mission Packages → team operationalization**, across the 3D Globe, NetRunner,
IntelAnalyzer, IntelWeb, IntelDashboard, TeamWorkspace, and MarketExchange.

It exists because the honest starting point for this work is: the app *looks*
like it has this pipeline (seven registered sub-apps, dozens of intel-shaped
services, a fully-built Mission Package backend) but almost none of it is
actually connected end-to-end. Several things that appear wired in the code —
imports, registered routes, dynamic imports behind buttons — turn out to have
zero live callers or an unreachable trigger. This doc set exists to separate
what's real from what looks real, decide what stays, and sequence the work to
make one true path actually work, before broadening.

## How this is organized

- **[`00-current-state/`](00-current-state/README.md)** — the audit. What
  each sub-app/screen/service actually does today, verified by reading the
  code (not the naming, not the comments claiming completeness). This is the
  ground truth everything else here is built on. Read this first if you
  doubt any claim made in the plan.
- **[`01-architecture-decisions/`](01-architecture-decisions/README.md)** —
  for every place the audit found 2+ competing implementations of the same
  job, which one becomes canonical and what happens to the others. These
  decisions are prerequisites for the plan, not optional nice-to-haves — you
  cannot build a Mission Package UI on top of "Intel Reports" while there are
  four different places a report can end up.
- **[`02-dead-code-and-redundancy-inventory.md`](02-dead-code-and-redundancy-inventory.md)**
  — the flat, scannable list: every file confirmed orphaned/unreachable,
  every naming collision, every duplicate. Reference for cleanup work.
- **[`03-pipeline/`](03-pipeline/README.md)** — the *target* end-to-end flow
  (once the decisions in `01-` are executed), and user stories for the
  people who actually use it (Intern, Cadet, Archangel Knight, analyst,
  team lead).
- **[`04-plan/`](04-plan/README.md)** — the phased, sequenced execution plan.
  Sprint 1 (the current 2-week Missions sprint) gets its own document with a
  concrete task list; everything else is backlog, explicitly not blocking
  Sprint 1.

## The one-paragraph version

Starcom has real, solid pieces — team creation, real Nostr-signed invites,
real chat, a fully-built and tested Mission Package signing/broadcast
pipeline, a genuinely mature IntelAnalyzer workbench with a working
correlation engine — sitting inside a structure that grew by addition rather
than replacement. Every major concept (Intel Report persistence,
Investigation/Case tracking, "browse & create reports" screens, NetRunner→
report bridges) was implemented multiple times as the app evolved, and the
older attempts were mostly left in place instead of removed, so today's
codebase makes it genuinely hard to tell which door leads somewhere real.
Meanwhile the actual headline capability this sprint needs — a human
assembling and publishing a Mission Package — has a complete backend and
*zero* UI anywhere. The plan is: pick one canonical path per concept, delete
or redirect the rest, and build the one screen that's genuinely missing.

## Research provenance

This audit was produced by six parallel research passes (one further
splitting into five of its own) over the live codebase on 2026-08-28/29,
each independently reading the actual component/service code rather than
inferring behavior from names or comments. File:line references throughout
this doc set are as of that date — verify against current code before
relying on a citation for anything load-bearing, per standard practice for
any point-in-time audit.
