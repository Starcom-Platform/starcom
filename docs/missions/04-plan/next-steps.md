# Next steps

Written after running the app, querying the relays directly, and pushing a
real published event through the real parser. Everything below is grounded in
something measured this session, and each item says what was measured.

## What is already true

Worth stating plainly, because it changes the priorities: **the front door
mostly works.**

- The globe is the first impression (the support funnel used to take the
  screen before it was ever seen).
- Five relays connect. The list had drifted to endpoints this repo had already
  probed and recorded as dead.
- Connectivity is reported honestly — "IPFS unavailable — 5 relays connected"
  rather than "Network connectivity issues detected" at a fully connected app.
- **Real intel flows end to end.** Measured on the running globe:
  `SEEN 10 | ACCEPT 7 | GEOINT QUALITY: ACCEPT 70%`, roughly fifty seconds after
  load. A direct query returned 12 events under
  `#starcom_intel` across nostr.mom, nos.lol and relay.damus.io: kind 30023,
  carrying `title` / `ipfsCid` / `classification` / `lat` / `lon` in content and
  a `["g", "<geohash>"]` tag.
- **Starcom's parser can read that format.** A real event pushed through the
  real `parseEvent` yields one feature at 38.90533, −77.04163.
- Reports ingested this way are already visible in IntelWeb — the vault nodes
  named `38.90533_-77.04163`, `28.49238_-80.57686`, `47.60061_-122.19681` are
  network intel, not fixtures.

## P1 — RESOLVED, and mostly by correcting my own measurements

**The ingest works.** Measured on the running globe, sampling over time:

```
t+30s   SEEN  0 | ACCEPT 0 | DROP 0   INGEST STANDBY
t+50s   SEEN  0 | ACCEPT 0 | DROP 0   INGEST STANDBY
t+70s   SEEN 10 | ACCEPT 7 | DROP 0   3/5 UP | PROBE 4/5 OPEN
        GEOINT QUALITY: ACCEPT 70%
```

Real intel from the network, ingested and accepted. It simply takes roughly
fifty seconds from page load — relays connect, the layer activates, the
subscription opens, and stored events arrive.

**One real defect was found and fixed on the way** (`dd3f2b6f`). The ingest
opened two NIP-50 content-search subscriptions per relay alongside the tag
filter. Most relays do not implement NIP-50 and answer with
`ERROR: bad req: unrecognised filter item: search`; nostr-tools closes the
socket on that, taking the tag subscription with it. Measured: nostr.mom and
nos.lol both errored, nos.lol dropped to `connected: false`, and those two are
exactly the relays carrying `#starcom_intel`. Disabling search by default took
`relaysConnected` from 3 to 5.

### What misled me, recorded because the instruments were wrong twice

Both failures made a working system look broken, and both are the same mistake
in different clothes — trusting a measurement without checking the measurer.

- **jsdom silently drops every event.** A probe run under vitest reported
  `seen: 0`, and so did a bare nostr-tools pool with an identical filter in the
  same environment — 0 events but 3 EOSE — while the same pool in plain Node
  delivered 12. jsdom connects, receives, and drops at
  `verifyEvent(event) && matchFilters(...)`, which fails silently. **Every
  vitest-based conclusion about live ingest in this investigation was
  worthless**, and it looked exactly like a subscription bug.
- **Sampling too early reads as zero.** Browser runs waited 25–40 seconds and
  saw `ACCEPT 0`. The first events land around fifty. A single sample cannot
  distinguish "not working" from "not yet".

The lesson worth keeping: this codebase's recurring defect is a status surface
that misreports, and I reproduced it in my own tooling — twice — while hunting
one.

## P2 — The coarse coordinate wins over the precise one

**Done in `47266e2a`** (2026-08-31): the parser uses the coordinate a publisher stated, not the geohash approximation.

Measured: an event carries `lat: 38.9072, lon: -77.0369` in its content **and**
a geohash tag resolving to `38.90533, -77.04163`. The parser takes the geohash
— roughly 200m away from what the publisher actually stated.

Small, but it is the globe's own rule turned on its head: *position IS the
claim*, and here a derived, lower-precision value overrides a stated one.
`collectGeoFromTags` runs before the content is examined. Prefer the stated
coordinate; fall back to the geohash; and if they disagree beyond geohash
precision, that is a conflict worth surfacing rather than silently resolving.

## P3 — The globe analysis layer flag

**Done in `12bab001`** (2026-08-31): on unless `VITE_GLOBE_INTEL_LAYER=false`.

`VITE_GLOBE_INTEL_LAYER` is still off. Both prerequisites its own comment names
are met (provenance marking, truthful empty state), the unnamed third is fixed
(mode gating), and `GlobeIntelStatus` speaks the shared vocabulary.

P1's resolution makes this the strongest remaining item: intel really is
arriving (7 accepted in a fifty-second window), so correlation has a live
corpus to run over rather than an empty one. This is now a product decision
with nothing technical behind it.

## P4 — Finish the epistemic vocabulary

**The five surfaces still listed on 2026-09-13 are settled (`d089d3a8`).**
`RLSHPopup`, `IntelReportTooltip` and the HUD `TimelineView` use the vocabulary
now, `App` had nothing to migrate, and `ConnectionStatusDashboard`, which kept
its own health wording by decision (below), has since been deleted because
nothing rendered it. The list of remaining surfaces that used to sit
here had gone stale: on that date four of its eleven names matched no file and
one had already migrated. So this section keeps no list; D1 in
`post-decision-plan.md` says how to re-check.

**The second-register question is DECIDED: there is no second register.** Feed
health keeps its own wording, because it reports whether a connection is up
rather than what a view leaves out. Where an outage affects a data screen, that
screen says so in this vocabulary (`couldNotRead`, `computedWhileDegraded`).

**Both design questions are now DECIDED and encoded**, which is what turns the
remaining surfaces into a mechanical migration rather than a judgement call
each:

- **Surface is per-context, by design.** The vocabulary owns language and tone;
  chrome does not belong to it. The globe overlay composites over a rendered
  planet and stays dark in every theme while a table banner follows the
  viewer's — forcing one component across both would put the globe on a
  Material surface it cannot sit on. Consumers render `tone` in their own idiom.
- **warn means degraded or missing and the reader may need to act; info means a
  normal, expected reduction** — their own choice, or a configured cap. Written
  into the `DisclosureTone` doc comment and pinned by a table test that carries
  the reason for every entry, so amber creep fails the build. The hard case is
  documented too: `truncatedMarks` warns (the analysis budget can hide a
  contradiction) while `matchedVersusShown` notes (a maxReports cap doing what
  the operator configured). The question is not "was data withheld" — it always
  was — but "would the reader be surprised, and can they act on it".

## P5 — Capture the browser workflow as a project skill

Five pieces of mechanics were learned the hard way and are currently written
down nowhere: SwiftShader flags for WebGL under headless Chromium; running
drivers from the repo root for module resolution; dismissing the support funnel
before anything is reachable; forcing nav clicks past docked overlays; and NOT
deduplicating console output — that one nearly produced a wrong diagnosis, by
collapsing four identical health assessments into one and making a working
interval look broken.

Three real bugs were found only by running the app: the support funnel owning
the first impression, the stale tab preference beating the deep-link, and the
connectivity banner misreporting. That is the argument for the skill.

Needs `/run-skill-generator`, which only the user can invoke.

## P6 — One model of time

Decided 2026-09-13 as D-E: [`time-model.md`](../01-architecture-decisions/time-model.md).
The timeline printing times of day across two months turned out to be the
visible end of four unanswered questions: which time a record has, how many
cursors there are, how a time is shown, and how much a cursor selects. The
record holds the decisions, an inventory of every time surface, and an
eight-step build order. It keeps no status list; its last section gives the
commands that show what remains.

## P7 — What the globe shows first, and what a card carries

Decided 2026-09-15 as D-F: [`globe-visualization.md`](../01-architecture-decisions/globe-visualization.md).
The visualization and sharing work has had no record since it began on
2026-09-08, so nothing tied later work back to it. On a first visit to the
production build the first reports arrive about fifteen seconds after load and
are drawn mostly out of view, while the timeline and the analysis status say
there is nothing; that comes first. The record holds the decisions, what the layer audit
and the layout audit measured, and the build order, which includes the layout and
hierarchy of the screens around the globe. It keeps no status list; its last section gives
the commands that show what remains.

## Known, deferred, and deliberately not fixed

- **IntelGraph's header overlaps the IntelWeb app header.** Confirmed
  pre-existing by screenshotting with and without the graph-height fix.
- **Dev sample data inflates the onboarding counts** — "60 cases open" on a
  fresh profile. Gated on `env.isDev`, so production starts empty, but the
  guide reports fixtures as the operator's own progress in dev.
- **`useAnalyzerData` has no importers anywhere.** Noted when
  `linkAnalysisToCase` was deleted from it; the rest of the hook was left alone.
- **A coordinate typed into a mission briefing still crosses the Navcom
  boundary** as prose, since `maskDigits` only masks runs of nine or more
  digits. Asserted by a test named `KNOWN GAP` rather than hidden.
