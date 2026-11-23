# Decision D-F — what the globe shows first, and what a card carries

**Status:** decided 2026-09-15.

## The decision

1. **The visualization work fixes a first visit before anything else.** On a
   first visit to the production build, the default Intel Reports globe draws the
   first reports that arrive mostly out of view, while the timeline and the
   analysis status say there is nothing. Until a first visit shows what arrived,
   where a person can see it, and the globe, the timeline and the analysis status
   stop contradicting each other about it, no other visualization work goes ahead
   of it.
2. **A card carries the caveats that apply to what it shows.** Every caveat about
   what the card draws stays: a stale feed, a feed that did not load,
   machine-coded events, a build from a changed tree, the unsigned capture. The
   line saying the working set held nothing to analyse appears only on a card that
   shows the analysis marks. On any other card it reads as though the layer shown
   were empty. D-C still holds: when a caveat that applies competes with density,
   the caveat stays and the design absorbs it.
3. **The UI layout and hierarchy work starts after the first step below,** the
   same way as this: an audit, then decisions, then a plan.
4. **A first visit sees the globe working, and sees intel sooner.** Between the
   app opening and the first mark, the globe shows nothing and says nothing for
   about fifteen seconds. That silence is the first impression, and the directive
   is images and video worth posting, so it is a defect of the visualization
   rather than a property of the network.

   *Corrected 2026-09-17: the fifteen seconds was the harness.* Every figure behind
   this step was measured under a software rasterizer. Re-measured on the production
   build with hardware rendering, a first visit paints the globe at 0.8 s, shows the
   listening note at 0.8 s, and has seven reports from the network at 2.0 s — both
   thresholds this step set are already met, by the code in step 4.1. The preloader
   covers all of it and leaves at 3.8 s, so a visitor with a GPU sees a spinner and
   then a globe that already carries intel. The listening note is never visible to
   them at all: it appears and is withdrawn behind the overlay.

   The step is not thereby pointless, but its reason changes and should be stated as
   the smaller one it is: under a software rasterizer the same visit paints at 10.9 s
   and shows intel at 21.7 s, and `webglSupport.ts` describes that population as
   "considerably larger than the one with no WebGL at all". Step 4 serves them. It
   does not serve the first impression it was written to fix.

**How step 1 is settled** (2026-09-15):

- When the first reports arrive and the person has not moved the globe yet, it
  turns to them, with the same move Show on Globe uses. Once they move it, the
  view is theirs.
- Each view says exactly what it counts. The timeline counts events; the globe
  says how many network reports it is showing; the analysis status says it has
  nothing of yours to analyse, rather than nothing at all. What each view shows is
  unchanged.

**How step 2 is settled** (2026-09-15):

- A card's analysis caveats come from the analysis marks the globe hands it, and
  the globe handed them to every card whatever layer it showed, so a submarine
  cable card said the working set held nothing to analyse. The card and clip
  builders already say nothing about analysis when they are given no marks, and
  analysis marks are drawn only while the Intel Reports layer is on, so the globe
  gives marks only then.
- Where the line still applies, it says what the globe's status says: "Nothing of
  yours was there to analyse, so this globe shows no analysis. That is not a
  finding that there is nothing to find." Clips use the same sentence.

**How step 3 is settled** (2026-09-15), from the layout audit below:

- **A first visit sees the globe, and one thing opens over it at a time.** The
  pipeline guide opens collapsed to its title line and stays inside the globe's
  area. The support ask, where it is enabled, opens only after the person has
  moved the globe or opened a report, never on a timer, and never while the guide
  is open.
- **The strip under the header carries the screen's title and what bears on that
  screen.** Over the globe that is the relays and the ingest; over the intel
  screens, the intel counters. Everything else — route mode, the Solana link,
  chain telemetry, auth posture, operator diagnostics, nav history and mission
  lane — moves into a status panel the strip opens, reachable from every screen.
  Nothing at the strip's edge reads as broken text.

  *Corrected 2026-09-16.* This first said those readouts move to "the settings
  status panel". There is no such panel: `SettingsStatusIndicator` is a toast
  that says settings were saved, and `EnhancedSettingsPopup` belongs to the
  globe's own top bar. The panel above is new, and the strip opens it.
- **Each screen names itself once, in the strip,** with its headings in order
  beneath it. The app draws three faces: Aldrich for titles and readouts, one face
  for reading and one mono face for codes and times. MUI screens take the same
  faces through their theme.
- **The sign-in-only pages fold into the shell.** `/cases-dashboard`, and every
  control that links to it, open the Cases application. `/intel` and
  `/investigations` redirect without asking for a sign-in. `/info-gathering`,
  `/info-analysis` and `/team/:teamId/new-report` retire, as `/osint` did;
  IntelDashboard already makes reports. The second layout goes once nothing uses
  it.

Controls that are covered or cut off, and the stale list behind the repeated
headers, are defects, and are fixed whatever else was decided.

**How step 3.2 is settled** (2026-09-15):

- **The secure chat button moves into the header,** beside Discord, Telegram and
  GitHub. Its connection state becomes a coloured mark on it, with words that
  name the chat in its label, so it no longer reads as a claim about the relays
  the strip reports. Nothing of the chat floats over a screen, the globe
  included.
- **The bottom bar tightens so every label fits from 1280 wide.** Narrower than
  that, its buttons show their icons, with their names on hover and to screen
  readers, and the open application keeps its label.
- **NetRunner's collapsed bot roster lays its three controls in a row,** so
  Create New Bot and Bot Settings stay reachable.
- **Application screens publish their own area, as the globe does,** so what is
  docked clears the header, the strip and the bottom bar on every screen. This
  one is a defect, not a choice.

**How step 4 is settled** (2026-09-17):

- **The last intel is drawn the moment the globe appears,** carried from the
  previous session and labelled with the time it was received, then replaced as
  live reports arrive. A mark whose age is not stated passes old intel off as
  current, so the globe and the card both say what it is as of. D-C's rule holds:
  the caveat stays and the design absorbs it.
- **Each relay draws as it answers,** rather than the globe waiting for the set.
  The set does not arrive together — the first visit measured two reports at
  14.7 s and four by the end — so waiting for all of it spends a difference that
  is already there to be had.
- **The scene says it is listening.** The connection state belongs on the globe
  itself and not only in the chrome, because the globe is what a first visitor is
  looking at.
- **The notes say it in words.** `GlobeReportNotes` returns null whenever nothing
  has arrived and nothing was reduced, which is why the globe is silent as well as
  empty. It gains a listening state, and says how many relays are connected.

  *Corrected 2026-09-17.* This first said "how many relays have answered". Nothing
  counts that. `relay.connected` is set when a probe socket opens or a subscription
  reaches end-of-stored-events — both mean a connection was established, so
  "connected" never overstates, and it is the same field the marquee renders as UP —
  but neither is an answer. An answered count only becomes meaningful at step 4.3,
  where per-relay results exist.

  *Corrected again, after measuring it.* Gated on the ingest, the note appeared
  16.8 s after load against a one-second target: `start()` is awaited deep inside the
  pipeline's effect, so the globe could not admit it was fetching until it already
  had been for sixteen seconds. There are three states, not two — nothing while the
  layer is off, connecting while the layer is on and the ingest has not started, and
  the counts once it is running. The middle state exists because `connected` reads 0
  while sockets are still opening, and showing that floor at second one would read as
  five relays refusing.
- **The globe's intel ingest reads The Record** (`wss://record.cosmiccodex.app`)
  beside the public relays. Federation already reads it for findings and
  refutations, but starts only in IntelAnalyzer's CorrelationContext, so the globe
  has never once contacted it. The public relays stay in the set, on
  FederationIngestService's own reasoning: a node that listened only to its own
  peer would have replaced an open network with a private feed.
- **Two thresholds, measured apart.** The globe acknowledges that it is fetching
  within a second, and real intel is on screen within five. They are separate so
  that a fast indicator cannot be mistaken for fast intel.

  *Measured 2026-09-17, and it moved the work.* The globe first paints at 10.9 s.
  Nothing rendered inside `Globe.tsx` can precede that, so the acknowledgement
  cannot live there at any threshold — 4.1 measured 13.2 s and could not have done
  better. First report at 14.7 s against first paint at 10.9 s also says where the
  wait actually is: the app's own boot, not the relays.

- **The acknowledgement moves to the preloader.** It renders from the first frame
  and stays until 12.5 s, so it covers nearly the whole wait, and it already carries
  an honest indeterminate label rather than a progress claim. That is the only
  surface a one-second threshold can be met on.
- **The ingest starts while the app boots, not when the globe mounts** — for the
  software-rasterizer column, which is the only one that waits. Today it starts
  inside the globe's own effect, so under software rendering the relays are not
  asked until about eleven seconds in and reports land at 21.7 s. On hardware they
  land at 2.0 s and this buys nothing.

  *Decided 2026-09-17, after the premise was corrected.* The original reason — that
  a boot-time start runs beside twelve seconds already being spent — is retracted
  with the twelve seconds. This is now a deliberate choice to serve the visitors who
  wait, knowing it does nothing for the ones who do not.

  **Boot owns the ingest outright, and the globe stops stopping it.** Moving the
  start alone would have been a regression, not an improvement: the globe starts the
  ingest inside an effect whose cleanup calls `stop()`, and that effect re-runs on
  sub-mode change, layer change, timeline scrub and any refresh-setting change. Since
  line 390 holds the only `start()` in shipped code, a boot-started ingest would have
  been killed by the first layer switch and never restarted — intel sooner once, then
  never again.

  So the lifecycle moves with the start. Relay connections now live for the whole
  session, on every screen, for every visitor — NetRunner, Cases, OpsCenter included,
  and including people who never open the intel layer. That is the full version of
  the cost the paragraph below describes, not a bounded one, and it is chosen
  knowingly. If relay load on the peer node becomes the binding constraint, this is
  the decision to revisit first.

  Two readouts change without being touched. `usePrimaryMarqueeData` reads
  `isActive()`, so the strip reports the ingest running on every screen rather than
  only on the globe. `useGlobeIntelReportPipeline` reads it too, so step 4.1's note
  skips its `starting` state and shows relay counts immediately — a state that is
  already unobserved on hardware becomes unreachable in ordinary use.

  *This overturns a decision the code states.* At the start site: "intentionally
  scoped to IntelReports mode to avoid persistent background relay traffic." The
  reversal is deliberate and the cost is real — visitors who never open the intel
  layer will open relay connections. What makes it worth it: IntelReports is the
  default sub-mode, so on a first visit that layer is already active and the scoping
  buys nothing, while the delay it causes is most of the wait before intel appears.
  If that ceases to be the default, this decision is wrong again and should be
  revisited rather than inherited.
- **The preloader may only say what is true when it says it.** It cannot claim to
  be reaching for intel before the ingest has started; with the ingest at boot, it
  can. The rule is the same one that took 4.1 two passes: a floor is not a
  measurement, and an intention is not a state.

**How step 6 is settled** (2026-09-17):

- **A layer can be drawn more than one way, and the person looking chooses.** No
  such option exists today — nothing in the tree matches `markerStyle`,
  `visualStyle` or `renderStyle`, and each layer draws exactly one way, hardcoded
  in its hook. Styles are per layer, persisted with the rest of the CyberCommand
  settings, and the switcher comes before any single restyling: a style that can be
  turned off is an experiment, and a style that replaces the only option is a bet.
- **The switcher is icon buttons on the globe,** in a dock slot beside the camera
  controls rather than absolutely positioned — `dockOrder.ts` exists because a
  `bottom: 20px; left: 20px` control shared a gutter with the dock and became
  unclickable, and z-index could not reach it.
- **Its icons come from `@mui/icons-material` by subpath,** which the app already
  depends on and which `guard-icon-barrel-imports.mjs` already governs. Authored SVG
  is needed only for the sprite artwork below, not for the buttons.
- **Intel Report marks become billboarded sprites, baked from authored SVG,** in
  four variants — Standard, Critical, Actionable, Raw — distinguished by shape,
  colour and motion together, so shape alone still separates them for a viewer who
  cannot rely on colour over a varied globe.

  *Not because the model is heavy.* `intel_report-01d.glb` is 182 triangles, 508
  vertices, one mesh, one material — nothing. The cost is per mark: a mesh, a
  raycast target and a draw call each, which `useGlobeRLSH` records in its own
  comment along with thirteen models stacked in Seattle where one is visible.
  Sprites in one batched object is a draw-call change, not a polygon one, and the
  record should not claim otherwise.
- **RETRACTED: the app is not unresponsive. That was the harness.** This said the
  shipped app blocks its main thread for 18.0 s of the first 20, on the strength of a
  production-build measurement showing 19 long tasks and 27 animation frames. Every
  one of those runs used a headless browser forced onto SwiftShader, a software
  rasterizer. Re-measured on the same build and page with hardware rendering:

  | | software rasterizer | hardware |
  |---|---|---|
  | animation frames in 20 s | 27 | 1,436 |
  | total blocking time | 18,031 ms | 618 ms |
  | frame gaps over 250 ms | 12, totalling 19.1 s | none |
  | longest single task | 3,964 ms | 234 ms |

  The document load event fires at 384 ms either way, so that part stands: the
  handover gate was never the constraint.

  *What the residual cost is, this does not establish.* CPU sampling under hardware
  attributes 1.1 s to `detectWebglSupport` and 1.8 s to three.js `onFirstUse`, while
  the long-task measurement of that same configuration reports a longest task of
  234 ms and 618 ms of blocking altogether. Those two instruments disagree by more
  than they agree, and neither figure is carried forward as fact.

  *The method failed four times in the same way, which is the part worth keeping.*
  The floor was attributed to the preloader's minimum hold, then to the hold read
  from the caller rather than the default, then to the load event waiting on the lazy
  chunk and its assets, then to main-thread execution. Each attribution followed a
  real measurement, and each named a cause that measurement did not establish. The
  variable never controlled for was the instrument: a software rasterizer makes a GPU
  application look like a broken one, and every probe in this record ran under one.

  *For whom the wait is still real.* Visitors without hardware acceleration are not
  hypothetical — `src/components/Globe/webglSupport.ts` exists to detect exactly that
  population, and its own comment says it is "considerably larger than the one with no
  WebGL at all". For them the software-rasterizer column is the experience, and it is
  the case for the shell speaking early. It is not the case for treating boot time as
  the largest defect in this record.

  On the dev server the preloader leaves at 12.5 s and the globe paints at 12.7 s, so
  the visible app is without a globe for 0.2 s. Those two figures are dev-server
  measurements and are not restated here as production behaviour.

  *This replaces two wrong attributions, both recorded before anything was measured.*
  The record first blamed the preloader's hold — 2.6 s, then 3.3 s once `App.tsx` was
  read rather than the component default — and then blamed the load event waiting on
  the lazy CyberCommand chunk and its assets. The load event fires in 384 ms. Neither
  the hold nor asset loading is the constraint; executing the application is. Cutting
  the hold would buy nothing, and handing over sooner would show a globe that has not
  painted.

  The consequence for step 4.2 is concrete: a line of text that CHANGES cannot be
  repainted while the thread is blocked, so whatever the shell says has to stay true
  across the whole window. The preloader's animations are transform and opacity with
  compositor hints, so it keeps moving throughout and the screen does not look dead.

- **Boot time is not the largest defect in this record, and was never shown to be.**
  The sentence above retracts the measurement that made it look like one. On hardware
  the app blocks for 618 ms and drops no frames; there is no twenty-second boot to cut.
  What remains worth knowing is what a software-rasterizer visitor pays, and that is a
  question about a population rather than about the code — it is measured by running
  the probes under both renderers and comparing, which is what should have been done
  the first time.
  `PreloaderManager` gates on the document load event today; its own comment records
  that the readiness check it replaced "could not fail, so it decided nothing". The
  globe publishes a real signal via `setGlobeInitialized`, but `GlobeLoadingProvider`
  mounts below `PreloaderManager`, so that ordering changes before the signal can be
  read.

## Why it needed deciding

Since 2026-09-08 the directive has been visualization and sharing, so that people,
and Mecha Jono on its own, can make images and video of the globe and its intel to
post. The share path was built on 10 and 11 September. A worklist measured from
the live app (`scripts/audit-globe-layers.mjs`) drove the next two days, and the
plan written from it on 12 September landed by the 13th, all but its card-time
item. No record held any of that, so nothing tied the work after it back to the
directive, and the following days went to the pipeline plan and D-E. This record
is where the visualization work is kept from now on.

## What was measured (2026-09-15)

The production build, served by `vite preview`, with a fresh browser profile for
every load: a first visit. The build loads no sample data outside development
(`App.tsx`, `env.isDev || env.demoMode`), so this is what a new visitor sees.

**A first visit.** The header's readout of the Nostr ingest, sampled for 150
seconds:

| After load | Nostr ingest, per the header | Relays, per the header | Timeline |
|---|---|---|---|
| 15–60 s | seen 0, accepted 0, dropped 0 | on standby | 0 events |
| 90–150 s | seen 10, accepted 7, dropped 0 | 4 of 5 up | 0 events |

The header was the wrong instrument for timing, and an earlier version of this
record read it as the ingest waiting a minute. The header reads the ingest once at
load, before the globe has started it, and then only every 60 seconds while the
ingest looks idle. Read from the ingest itself, on the dev server over the same
code path, it started 13.9 seconds after load, accepted its first report at 15.1
seconds and all 7 by 30 seconds, and every one of them reached the report store.

The 7 reports are all in the United States. Three at Washington DC are
"Backbone-Activation Cross-Node Verification" posts whose titles show as raw
JSON. Two at Cape Canaveral and two near Seattle are two launch posts, each of
whose two features became a report, as D-D requires. The globe's default camera
faces 0°N 0°E, so the default view shows the DC reports at its western edge and
nothing else.

The three views do not disagree because saving fails. Each counts a different kind
of record: the timeline counts intel items that have an event date, the analysis
status is built from correlation over observations and from the findings this
browser has published, and the globe shows reports. A first visitor has reports
and nothing else, so the globe shows 7 and the other two say there is nothing.

**Every layer**, from `npm run audit:layers` at three views. All 11 layers came up,
none logged a console error, and every card was looked at on the contact sheet.
The mark counts are distinct marks over the layer's mode floor, at the Atlantic,
the Americas and Asia–Pacific views. They vary between runs as data arrives; the
contact sheet is the verdict.

| Layer | Marks | What its card shows |
|---|---|---|
| Intel Reports | its mode's floor | Bare at the audit's views, which the reports above are outside. |
| Cyber Threats | 20 / 15 / 20 | Sparse, small marks. |
| Satellites | 5 / 7 / 11 | Small orbital dots, readable. |
| Comm Hubs | 44 / 34 / 74 | Cables and landing points, clearly. |
| RLSH | 36 / 37 / 12 | 3D models pile up at the globe's edge. The registry cannot say whether its data arrived. |
| Diplomacy | 474 / 304 / 806 | Dense and readable. |
| Resources | its mode's floor | Nearly empty. Its EIA feed needs a key. |
| Conflict Zones | 118 / 85 / 118 | Large circles overlap across Europe and the Middle East. |
| Space Weather | its mode's floor | Samples only over the US and Canada, from the InterMag and US–Canada grids; nothing at the other two views. |
| Eco Disasters | 34 / 41 / 113 | Sparse, small marks. |
| Earth Weather | 60 / 66 / 64 | Every mark reads as one orange against a −49 °C to 32 °C key. The feed cannot say whether its data arrived. |

Two things hold across the cards. Space Weather, GDACS, Comm Hubs and Satellites
record when they fetched as their last update, so a card cannot say how old their
data is. And every card from a first visit carries the working-set line and the
unsigned-capture line, whatever layer it shows.

**The screens around the globe**, from `npm run audit:layout` on the dev server,
whose sample data gives every screen something to lay out. A fresh profile for
every load, at 1280×720 and 1920×1080, with the first-visit prompts dismissed on
every load but one of the globe. The numbers are triage and the contact sheet is
the verdict.

On every screen the header and the strip under it take 100 px and the bottom bar
43 px, so an application has 80% of a 1280×720 window and 87% of 1920×1080. The
globe has 63% and 75%: its HUD takes another 48 px above for the market strip,
52 px below for the timeline, and 32 px down each side.

| Screen | What the audit found |
|---|---|
| Globe | Three of the market strip's slots read "needs an EIA key" at 1280. 21 controls are under 24 px, the timeline's scrubber is 4 px tall, and its dates and count are 9 px text. 8 typefaces, 15 sizes and 28 text colours; Aldrich is loaded under two names. |
| Globe, first visit | The support ask over the centre and the pipeline guide down the right, both at once. At 1280 the guide runs past the globe's area onto the bottom bar and covers OpsCenter, LIVE, the chat button and the Layers button. The guide shows until it is dismissed or a Mission Package is built. The ask opens 15 s after load, or when the globe has painted if that is later, which is about when the first reports arrive. In production the ask runs only where `VITE_SUPPORT_FUNNEL_ENABLED` is set. |
| NetRunner | The roster's Create New Bot and Bot Settings buttons are cut off at both sizes. Labels at 9.6 px. |
| Cases | Named three times: in the strip, in a second application header, and in its own heading. A white MUI table on the black shell, in Roboto. |
| IntelDashboard | A generic sans-serif, none of the app's faces. |
| IntelAnalyzer | Roboto. The timeline histogram is drawn as a solid block. |
| IntelWeb | Named twice. The second header's icon is a replacement character, lost from the registry. |
| OpsCenter, MarketExchange | Only what every screen shares. |

Every application screen shares these. The chat button covers SUPPORT OPS. The
chat's warning, "No relay or IPFS connection", lies over the strip while the strip
reports relays up. At 1280 the bottom bar cannot fit eight applications and SUPPORT
OPS, so MarketExchange is cut to "Mark". The strip's scrolling readouts (route
mode, Solana link, chain telemetry, auth posture, relays, ingest) slide under the
screen's title. And headings jump from h1 to h5 or h6 on NetRunner, Cases,
IntelAnalyzer, OpsCenter and MarketExchange.

Cases and IntelWeb repeat their names because `ApplicationRenderer` leaves out its
own header for a hand-written list of applications, which still names `nodeweb`
and never gained `cases`.

The six pages in the second layout, `BaseLayout`, were not measured. Each needs a
wallet sign-in, and sends anyone not signed in to the globe without saying so.
From the code, `/intel` and `/investigations` only redirect. `/cases-dashboard`
renders the component the Cases application renders, and three controls link to
it: Ctrl+K's Cases entry, the globe's report-incident action and the investigation
popup in the globe's right rail. A person not signed in who uses them lands back
on the globe. Nothing links to `/info-gathering` or `/info-analysis`, whose own
links lead to routes that do not exist, or to the unstyled form at
`/team/:teamId/new-report`.

The navigation record of 2026-08-29
(`00-current-state/navigation-and-app-structure.md`) predates Cases as an
application, OpsCenter's name, `/app/<id>` addresses, and the `/osint` and
`/investigations/:id` redirects.

## Build order

Each step ships on its own, with a check that can be run again.

1. **A first visit shows what arrived.**
   - The header reads the ingest when it changes, rather than every 60 seconds
     while it looks idle, so it stops saying standby once the ingest has started.
   - A post whose content is JSON with its own title is shown by that title.
     `deriveTitle` in `NostrStarcomIntelIngest.ts` takes the first line, which for
     a JSON post is the whole object.
   - When the first reports arrive and the globe has not been moved, it turns to
     the centre of them (`centreOf`, which Show on Globe's placement uses) with Show
     on Globe's move (`SHOW_ON_GLOBE_MOVE`), in `useTurnToFirstIntel`. It stays put
     once the person has moved it.
   - The globe says how many network reports it is showing, and the analysis
     status's empty wording (`no-observations` in `epistemicLanguage.ts`) says
     there is nothing of yours to analyse.

   The check is a first-visit probe of the production build, committed with the
   step: how long until the first report shows, how many, whether the globe turned
   to them, and what the globe, the timeline and the analysis status each say.
2. **A card carries the caveats that apply.** `Globe.tsx` hands the share card the
   analysis marks whatever layer is on, so `EMPTY_REASON_CAVEAT` reached every card,
   and every clip through the same marks. The marks are derived outside
   `Globe.tsx`, where they can be tested, and are null unless the Intel Reports
   layer is drawing them; `shareCardProvenance.ts` and `clipProvenance.ts` already
   say nothing about analysis without them. The `no-observations` sentence says
   "of yours". The check is the audit's cards: the line appears on Intel Reports
   cards and on no others.
3. **The layout and hierarchy, as settled above.** Each part ships on its own, and
   for every part the check is `npm run audit:layout` against the dev server, with
   its contact sheet. The first visit comes first, by decision 1. The sign-in-only
   pages fold in before the strip, the titles and the type change, so nothing about
   to retire is restyled.
   1. **A first visit sees the globe.** `NewUserHint` opens collapsed, and stays
      inside the globe's work area when opened. `SupportFunnelRoot` opens once the
      person has moved the globe, or opened a report and closed it, instead of
      after a delay, and not while the guide is open. The audit's first-visit rows
      show nothing covered.
   2. **Nothing covers anything.** Only the globe's layout calls `useWorkArea`,
      so on an application screen the dock read its fallback numbers, a 48 px bar
      above and nothing below. It put the chat's warning over the strip, at y 68,
      and the chat button over SUPPORT OPS. Each application screen publishes its
      own area. The chat button (`SecureChatManager`) moves into `GlobalHeader`,
      its connection state a mark on it. `MainBottomBar` needed 120 px more than
      it had at 1280 and 34 px at 1366, and fit from 1440: its spacing tightens so
      the labels fit from 1280, and narrower than that the buttons show icons.
      `NetRunnerBottomBar`'s collapsed strip, a fixed height that hides overflow,
      lays its controls in a row. The audit shows nothing covered and nothing cut
      off on any screen.
   3. **The sign-in-only pages fold in.** `/cases-dashboard` and the three controls
      that link to it open `/app/cases`. `/intel` and `/investigations` redirect
      without `ProtectedRoute`. `/info-gathering`, `/info-analysis` and
      `/team/:teamId/new-report` retire. `BaseLayout` and its `TopBarNavigation` go
      once nothing renders them. The audit shows each of those pages sending a
      visitor who is not signed in to the screen it belongs to.
   4. **The strip carries what bears on the screen.** `usePrimaryMarqueeData` gives
      each screen only its own readouts: the relays, the ingest, its rate and the
      GEOINT quality over the globe; the intel workflow counters on IntelDashboard,
      IntelAnalyzer and IntelWeb; the mission time where a clock helps. A control at
      the strip's end opens a status panel, through the popup layer the routers wrap,
      which lists every readout on every screen — route mode, the Solana link, chain
      telemetry, auth posture, operator diagnostics, nav history and mission lane
      among them. The scrolling row is clipped mid-letter where it meets the title,
      so "ROUTE MODE" reads as "JUTE MODE"; it fades at that edge instead. The
      contact sheet is the check, with the audit's own count of text over text.
   5. **Each screen names itself once.** `ApplicationRenderer`'s standalone header
      and its hand-written list go, since the strip names every screen. IntelWeb's
      registry icon is replaced, and headings run in order. The audit shows one h1
      and no skipped heading level on every screen.
   6. **Three faces.** Aldrich under one name, one face for reading and one mono
      face, those two chosen by looking at them, and MUI's theme set to the same.
      The audit shows three typefaces on every screen.
4. **A first visit sees the globe working, and sees intel sooner.** Each part
   ships on its own.
   1. **The notes stop being silent.** `GlobeReportNotes` renders nothing at all
      while it has no network reports and nothing was reduced. It gains a listening
      state with three readings: nothing while the layer is off, connecting while the
      ingest has not started, and how many relays are connected once it has. The
      middle one is what a first visitor sees, and it is gated on the layer rather
      than on the ingest — gating it on the ingest measured 16.8 s.
   2. **Boot owns the ingest, for the visitors who wait.** The relay fetch starts at
      app boot, beside `startFindingsOutboxDrain` in `App.tsx` — the same shape and
      the same argument, recorded there as "a durable outbox that only drains when
      you happen to open one view is not durable". The globe stops calling `stop()`,
      because its cleanup fires on every sub-mode, layer, scrub and refresh change,
      which would kill a boot-started ingest on the first layer switch.

      Not inside `bootstrapServices()`: that is memoised and rethrows, and
      `initializeAll()` would put a relay connection on the path that gates the local
      Intel Data Core — which `App.tsx` deliberately keeps independent of relay
      reachability.

      On hardware this changes nothing measurable; intel is on the globe at 2.0 s
      either way. Under a software rasterizer it is the difference between asking the
      relays at eleven seconds and asking them at one. The check is
      `npm run probe:first-visit` run under both renderers, which now name themselves.
   3. **Reports draw as each relay answers,** rather than when the whole query
      settles.
   4. **The last session's intel is drawn on open,** labelled with the time it was
      received and replaced as live reports arrive.

      **Why this moved to the front (2026-09-17).** The globe is frequently EMPTY,
      and that outweighs anything about how a mark is drawn. Measured across several
      runs on one afternoon: the ingest asks five public relays, of which 2/5 and 3/5
      were reachable at different moments, `relay.damus.io` answered 503, and report
      delivery went 7 → 2 → 0 between runs. A full layer audit drew ZERO Intel
      Reports marks in all three views. For a visitor at those moments the app's
      flagship layer shows nothing, and the layer cannot be measured at all — which
      is why the audit could say nothing about the sprite work built the same day.

      **Nothing reads persisted reports onto the globe today.** The pipeline only
      writes them (`intelReportService.importReport`), and `listReports()` is read by
      six other surfaces — the marquee, IntelWeb, MissionsPanel, the onboarding hint,
      IntelligenceContext, the contribution banner — but by no globe path.

      **Both kinds are drawn, which fixes a second defect.** Network reports and the
      person's own. A report created from the globe's context menu is persisted and
      never redrawn, so it currently vanishes from the globe on reload; hydrating
      both ends that rather than leaving it to be found again later.

      **Bounded by the ingest's own `sinceWindowMs`** — the same window the live relay
      query asks for. The globe then never shows something the live query would not
      have requested, and it reuses a number the app already has instead of inventing
      a second one that could drift from it.

      **The received time already exists and is a third kind of time.** The ingest
      writes `history: [{ action: 'IMPORTED', timestamp: nowIso }]` when it accepts an
      event, while `createdAt` is the event's own `created_at` — when the author wrote
      it. Neither is the event-versus-written basis decision D-E settled for
      PLACEMENT. So placement stays exactly as D-E decided; receipt time is only what
      the label says.

      **A note AND a subdued mark, not a note alone.** The recorded wording was a
      label, which the report notes can carry. But this directive exists so that
      images of the globe can be posted, and a capture may be cropped or reframed —
      stale intel drawn identically to live intel would read as the current picture in
      a post. Reduced opacity on the mark is honest inside the frame, not only in the
      caption, and the opacity path already exists in the shared shader.

      **Built, and one thing about it could not be verified.** The rules, the
      receipt-time derivation, the fading and the note are each covered by tests
      and each mutation-tested. What is NOT confirmed is the end-to-end path in a
      browser — load, receive, reload, see them drawn faded — because no probe run
      could get reports onto the globe to persist in the first place.

      *And that failure is itself the finding.* On the last attempt FOUR OF FIVE
      relays were connected and zero reports arrived in 104 seconds, where earlier
      runs the same day had seen seven. So this is not simply "the relays are
      down": the connections work and the `#starcom_intel` events are not being
      delivered. Whatever the cause — retention on those relays, or the events not
      being there — it is the argument for 4.5 rather than against 4.4, and it
      means the globe's intel cannot currently be relied upon to come from the
      public relay set at all.

      **Replacement needs no work.** `IntelReportVisualizationService.addMarker`
      dedupes on `pubkey`, which `reportToMarker` sets to the report id — the Nostr
      event id — so the same report arriving live displaces its hydrated copy by
      construction. That is worth a test rather than an assumption.
   5. **The Record joins the globe's intel read set,** with the public relays kept.

      **Done 2026-09-19.** The intake's default read set is now
      `FEDERATION_READ_RELAYS` — The Record, then the five public relays — read from
      `src/config/publicInfrastructure.ts` rather than written out again.

      **It joins; it does not replace.** Every public relay is still asked, and a test
      pins each half separately, because "The Record joins the read set" and "The
      Record becomes the read set" differ by one edit and the second would read as
      the first in a diff.

      **First position is load-bearing, not cosmetic.** `activateDiscoveryFallback`
      takes `relays.slice(0, 2)` — after twelve seconds with no events, only the first
      two relays are asked again without the hashtag filter. Twelve seconds of silence
      is the exact condition this step was decided on, so The Record belongs inside
      that pair. A test pins the position and says why, so a later reordering has to
      answer the reason rather than just the order.

      **The search surface is unchanged.** `searchRelays` stays the NAVCOM five. Search
      is a separate path, NIP-50 is off by default for the reasons recorded beside it,
      and widening it is not what 4.5 asked for.

      **What is proven and what is not.** Five tests, each mutation-tested: replacing
      rather than joining, reordering so The Record comes last, and reverting to the
      surface set are all caught. What is NOT shown is a report arriving from The
      Record onto the globe — there is no `#starcom_intel` event on it to arrive. The
      same gap the ingest check reports from the other end: the only attested claims on
      The Record are this node's own. This step makes the globe ask; it cannot make
      anyone answer.

   The check is `npm run probe:first-visit` against the production build, which
   already reports how long until the first report shows — **and which forces
   SwiftShader at line 31**, as do the layer audit, the layout audit and the smoke
   test. Its timing output is therefore a software-rendering number and must not be
   read as a visitor's experience. That is how 14.7 s got into this record as a fact
   about a first visit.

   Measured both ways on 2026-09-17, production build, same page:

   | | software rasterizer | hardware |
   |---|---|---|
   | globe paints | 10.9 s | 0.8 s |
   | listening note | 13.2 s | 0.8 s |
   | reports on the globe | 21.7 s | 2.0 s |
   | preloader leaves | 12.5 s | 3.8 s |

   The step is done when the globe acknowledges the fetch within a second and shows
   real intel within five — which, on hardware, it already does. Any further work
   under this step is for the software-rasterizer column, and a claim about either
   column now has to name which renderer produced it.
5. **Every probe says which renderer produced its numbers.**
   `probe-first-visit.mjs`, `audit-globe-layers.mjs`, `audit-ui-layout.mjs` and
   `smoke-app.mjs` all force SwiftShader, which is right for observing content
   headlessly and wrong for timing. Each prints its renderer in its output, derived
   from the arguments it actually passes rather than written beside them, so the
   label cannot drift from the flags. This is the change that stops a timing figure
   being read as a visitor's experience, which is how 14.7 s, 18.0 s and "the app is
   unresponsive for nineteen of its first twenty seconds" all entered this record.
6. **A layer can be drawn more than one way, and the person looking chooses.**
   1. **The styles exist and persist.** A style per layer in the CyberCommand
      settings, holding only what the person picked, with the default derived on
      every read from what each layer draws now — so an existing visitor keeps what
      they had rather than being handed a new default. `markerStyles.ts` owns the
      styles, the defaults and the one read path; `resolveMarkerStyle` is how a
      layer asks.

      *Only choices are stored, and that is the load-bearing part.* A materialised
      map of all eleven layers would freeze today's catalogue into every returning
      visitor's `localStorage`, and the layer added next month would resolve to
      `undefined` for all of them — one level below the top-level merge, where no
      migration can see it. A derived default cannot go stale.

      *No migration was needed, which is not what this record predicted.* This said
      the styles would be "migrated the way `reportFiltering` gained `showUnset`".
      Both existing migrations exist because `settingsStorage.loadSettings` merges
      shallowly at the top level, so a field added INSIDE a stored section reaches
      nobody who has ever saved settings. `markerStyles` is a new TOP-LEVEL key,
      which is the one case that merge handles by itself: a stored payload lacking
      the key takes the default. A version bump here would have been an artifact
      whose only content was a claim about work it did not do, so the
      returning-visitor case is a test instead — and if that merge ever changes, it
      fails there rather than handing every returning visitor an undefined style.

      *And the styles a layer already draws are not interchangeable.* Of the
      fourteen `buildScreenPoints` call sites, thirteen never pass a style at all
      and take its `'disc'` default — so the layers are discs because nobody chose,
      not because discs were chosen. The fourteenth, `useCyberAttacks3D`, passes
      three styles across four sub-layers: density as a soft additive glow at 3×
      size, a pulsing halo for countries new since the last snapshot, the indicator
      disc, and a ring for OTX-corroborated countries. Those styles ARE their
      meaning, so a per-layer override applied to every draw call would redraw the
      density bloom as discs and delete what it encodes. Hence the rule the build
      follows: a chosen style governs a layer's PRIMARY mark, and auxiliary marks
      that encode meaning in their style keep it. Every layer's primary mark is a
      disc today, which is why every default is `'disc'` and why turning the
      switcher on restyles nothing until someone picks.
   2. **The switcher is on the globe,** icon buttons in a dock slot, using
      `@mui/icons-material` subpaths: `Circle`, `BlurOn` and
      `RadioButtonUnchecked` — a filled disc, a soft bloom and an open ring, each
      icon shaped like the thing it draws, so a button reads without a label.

      **It styles the layer in front,** the current sub-mode's layer, which
      `useGlobeLayerControl` already derives from the mode. Three buttons, always
      about what is on screen, with the layer named beside them so a click never
      restyles something the person was not looking at. A pinned layer keeps its
      own stored choice; switching mode is how you restyle it. The alternative
      considered was a row per active layer: it reaches eleven rows, needs a
      collapse toggle, and competes for corner height with the notes stack already
      in that corner.

      **It is absent on a layer that draws no marks.** ResourceZones draws a mesh,
      border line batches and trade-route connection lines — nothing `screenPoints`
      governs — so disc, glow and ring cannot affect it, and the slot renders
      nothing rather than three buttons that do nothing. This step's own rule,
      applied to this step's own control: a style nothing reads is a setting, not a
      feature. Ten of the eleven catalogued layers do draw screen-point marks;
      ResourceZones is the one exception, and whether a layer has marks is declared
      per layer in a record the compiler keeps exhaustive, so a layer added later
      cannot silently inherit an answer.

      Placement is `bottom-left`, beside `globeCameraControls`, for the reason
      `dockOrder.ts` already records at that slot: controls in that corner sit
      above the status readouts because text that grows and shrinks with what a
      layer is withholding must not slide buttons around under the pointer.
   3. **Each layer honours its style,** starting with the one whose alternatives are
      clearest and extending outward. A style nothing reads is a setting, not a
      feature — so the switcher is absent on a layer that does not read one yet,
      and 2 and 3 shipped together rather than shipping three buttons that store a
      value nothing draws.

      Which layers honour it is declared per layer in `markerStyles.ts`, not listed
      here, in FOUR states so each reason stays distinguishable. What is left is
      derived:

          grep -cE "^  [A-Za-z]+: .not-yet.," src/components/Globe/markerStyles.ts

      **Conflict Zones is not one of them, and never will be as things stand.** Its
      SHAPE is its legend — the war-event discs and the displacement rings are told
      apart by being a disc and a ring — so a per-layer style making both the same
      shape would destroy the distinction and leave the legend asserting something
      untrue. Honouring a choice there means the legend following the choice, which
      is a decision and not a wiring job, so it is declared `shape-is-the-legend`.

      **A glow is offered on every layer, since 2026-09-18.** It was not at first:
      the bloom-behind-the-mark pairing lived in `useScreenMarkLayer`, which builds
      two objects, so a layer calling `buildScreenPoints` itself got one — the faint
      halo with no mark inside it, the very thing measured as nearly invisible. A
      `markerStyleOptionsFor(layerId)` withheld glow from the three layers in that
      position. That was a stopgap, and it is gone; see **step 6.5** below for the
      root fix and for what it cost to measure.

      **A layer that honours a style says so in its legend**, and the share card
      already prints `shapeMeans` — so an image explains why its marks are rings
      instead of leaving a reader to guess. Derived by the shared hook from the
      style it was given, not remembered by each caller.

      *Satellites is wired but NOT claimed, and the reason is worth keeping.* Its
      builder honours a style and is tested. A mutation deleting the style from the
      HOOK's call to that builder survived every test in the tree — the same shape
      as a shader varying that was declared and ignored — and both attempts to close
      that failed: a hook test crashed the vitest worker (the hook owns intervals
      and a propagation pass, and had no test at all), and a visual check drew
      nothing because CelesTrak refuses a repeat catalogue download inside its
      two-hour window on a fresh profile. Wiring without verification is not
      honouring, so it stays `not-yet`.

      Anchored to the start of an entry so it cannot match prose. Two looser
      patterns were wrong first — one counted the type declaration as a layer, its
      replacement counted the line documenting itself — which is worth recording
      because the whole point of deriving a number instead of writing it down is
      that the command can be checked. So it has to be.

      The wiring runs through `useScreenMarkLayer`, which now takes a style beside
      the `rim` and `opacity` it already took, so a layer drawing through the shared
      hook needs one line. The layers off that hook — Satellites, Diplomacy,
      Conflict Zones, Earth Weather, Comm Hubs — call `buildScreenPoints` directly
      and each needs its own.

      *A glow is a bloom BEHIND the mark, not instead of it — settled by measuring
      it.* Drawn as the mark, a glow at the Intel Reports anchors' ~8 px was very
      nearly invisible: the material blends additively, and adding light to an
      already-bright green and yellow globe barely changes it, while a disc and a
      ring at the same size both read clearly. A style that makes a layer vanish is
      as broken as a control that does nothing, so the first shipped version of
      this switcher offered a click that hid a layer.

      `useCyberAttacks3D` already held the working answer and the fix takes its
      numbers: its halo is 2.2× the mark at 0.3 opacity, drawn behind an indicator
      disc, which is exactly why that layer's glow reads when a bare glow does not.
      So a glowing layer draws twice — the bloom, then the mark over it — and glow
      now means emphasis rather than replacement. The mark keeps its size and its
      position, so nothing became harder to locate and the clutter figures below
      are unaffected. The bloom carries no tooltips: it sits where the mark sits, a
      raycast hits both, and `useGlobePointTooltips` takes the first non-null
      tooltip across every intersection — so a bloom with tooltips would answer
      hovers meant for the mark, with identical text, and would never have looked
      wrong.

      *The glow icon was changed after looking at it.* `BlurOn` at 16 px is a
      dotted grid rather than a bloom. It was chosen for the shape it describes and
      verified present in the package, but not looked at rendered until the app was
      running; `Flare`, a radiating starburst, reads as light coming off a point at
      that size. The lesson is the cheap one: an icon is a visual decision and has
      to be seen, not selected from a name.
   4. **Intel Report marks gain their four variants** as billboarded sprites baked
      from authored SVG, differing by shape, colour and motion.

      **First, a prerequisite that turned out to be a live defect.** A variant
      needs a signal, and the obvious one — `getIntelReportPriority` — has never
      fired for a report from the network. It matches exact uppercase tag
      membership (`'URGENT'`, `'CRITICAL'`, `'HIGH'`, `'MEDIUM'`, `'LOW'`), while
      `normalizeHashtag` in the ingest lowercases every hashtag it collects. So a
      Mecha Jono post tagged `#critical` arrives with `critical` in its tags and
      classifies as `unset`. Verified directly:
      `getIntelReportPriority({ tags: ['nostr', 'relay:wss://x', 'critical'] })`
      returns `'unset'`.

      Two things hid it. `reportToMarker` merges author hashtags into the marker's
      `tags` (reportMarker.ts), so the plumbing looks right end to end — and every
      test of the classifier passes uppercase tags, so the suite agreed. Nothing in
      the tree emits an uppercase priority tag from code; the four upper tiers of
      the priority filter have therefore been decorative for every ingested report,
      and `showUnset` has been the only reason any of them are drawn.

      The fix compares case-insensitively, on exact membership after normalising —
      not substring, so `critical-infrastructure` stays out of the critical bucket.

      **`showLow` migrates to true with it,** because the fix would otherwise hide
      reports that are visible today: a post tagged `#low` currently classifies as
      `unset` and is drawn, and would classify as `low` and be dropped, since
      `showLow` defaults to false. That is the same silent-loss defect the
      `showUnset` migration exists to prevent. The honest caveat: `false` is both
      the default and a choice, and they cannot be told apart in storage, so this
      may override a deliberate setting for someone who hand-typed `LOW` on a local
      report and turned the filter off — the tag inputs in `IntelWorkspaceConsole`
      and `ReportEditPanel` make that possible. Silently dropping network reports is
      the worse failure of the two.

      **A variant is the author's word, then the priority, then Raw.** An explicit
      `#critical`, `#actionable` or `#raw` wins, because Mecha Jono assembles these
      reports and should be able to say what one is. Absent that, it falls back to
      the priority ladder, where `unset` reads as Raw — which is not a guess but
      the literal state: nobody assessed it. Today every network report is `unset`,
      so today every network report is Raw, and the distinction appears the moment
      posts carry a tag. What is NOT done is inventing a signal: 'Actionable' is
      never inferred from a high priority, because the ladder says how urgent a
      report is and not whether anyone can act on it.

      **The sprites replace what the GLB DREW, not the GLB.** That is a smaller
      claim than this record first made, and the difference is load-bearing.
      `Enhanced3DGlobeInteractivity` opens a report by raycasting the model meshes
      and looking the hit up in a uuid-to-`ModelInstance` map, and `ModelInstance`
      carries the containers and hover-lift state that whole interaction is built
      around. Clicking a report is the most important thing a person does on this
      globe, so the models stay built and stay raycast and simply stop rendering
      (`renderModels: false`). What that buys: the draw cost and the artwork. What
      it does not: the per-report mesh, which remains until picking moves to the
      sprite layer. Moving it is a change to the interaction layer and is its own
      piece of work, not a rider on this one.

      That rests on one property of three.js — `Raycaster` checks an object's
      layers and not its visibility — which is true of 0.171 but is a library
      behaviour, not a guarantee. If an upgrade starts honouring `visible`, every
      report silently stops being clickable while still being drawn, and nothing
      else in the tree would notice. `invisibleStillPicks.test.ts` fails instead.

      One batched `THREE.Points` draws all of them: one draw call, one raycast
      target, a fixed on-screen size, and shape carrying the variant so a reader
      who cannot rely on colour over a varied globe can still tell them apart.
      They sit in a new altitude band, `REPORT_SPRITES` (1.030) — a report draws
      twice, a dot on the ground saying where it is and the glyph standing above
      it, and none of the existing bands said that.

      **If the atlas cannot be baked, the models draw again.** The glyphs are
      rasterised through an `Image` and a canvas, which returns nothing in a
      runtime without a 2D context. Since the models are hidden rather than
      removed, a failed bake with nothing watching would leave every report with
      no mark at all — not a degraded mark, none. The layer reports `ready`, and
      `renderModels` is its negation.

      **The artwork took three attempts, and only looking found the first two.**
      Standard, Critical and Actionable read as documents from the first pass —
      lines, an exclamation, a chevron, each on a folded page. Raw did not. Drawn
      as a dashed outline over a near-black fill it was not a document at all (no
      fold, and a rounded rectangle is not a page) and against bright land it was
      a dark blob. Redrawn with dashed interior lines it was legible but nearly
      the same SHAPE as Standard, separable only by hue — which is exactly what
      this step forbids. It is now a blank page: the most distinct of the four
      shapes and the most literal reading of `unset`. This mattered more than the
      other three together, because every report on the relays is `unset`, so Raw
      is the only variant anyone sees today, and it was the least legible of the
      four in both earlier versions.

      *Checked on the production build:* the glyphs draw on the globe and read as
      documents at their 26 px, on dark ocean and on bright land, and in greyscale
      — which is the check that matters for the colour-independence rule.

      **Picking moved to the sprite layer, and the GLB is gone.** The paragraphs
      above described an interim state that no longer holds. What a person clicks
      is now the glyph: `Enhanced3DGlobeInteractivity` raycasts the sprite layer
      and asks it which mark was hit, and the models are neither built nor
      FETCHED — verified in the browser, where a full session makes no request
      for a `.glb` at all.

      What made it small: only `report` was ever read from a hovered or clicked
      mark, at three sites. So the interaction state narrowed to
      `InteractiveIntelMark` — `{ report, mesh? }` plus three optional
      model-only fields — which `ModelInstance` still satisfies structurally, so
      the fallback path compiles unchanged.

      Two things the sprite layer had to learn. It answers which report a picked
      index is (`intelReportAtHits`, which skips hits belonging to other layers
      rather than giving up on them — the nearest hit is often a country fill or
      a satellite). And it publishes a bare `THREE.Object3D` per report for
      `useModelScreenProjection` to place a popup against: a transform node, no
      geometry, no material, no draw call, no raycast target. Rather than churn
      an ADR-extracted hook whose behaviour is deliberately preserved. That node
      is what remains of "a mesh, a raycast target and a draw call each".

      *What picking a sprite can and cannot be.* three.js raycasts a
      `THREE.Points` against a world-space sphere per point and knows nothing
      about the mark's drawn pixel size, so the clickable area approximates the
      glyph rather than matching its outline. The threshold is the one
      `useGlobePointTooltips` already uses, deliberately: a mark that shows a
      tooltip and cannot be clicked is worse than either failure alone.

      *The models are still the fallback, and that is why the GLB gate is
      three-state.* `pending` is not `unavailable`: loading on `pending` would
      put the download on every visit for a fallback almost nobody reaches.

      **The models retired (owner, 2026-10-07).** Asked whether to commission
      better models, or a suite of them as spinning marks, the owner chose SVG
      glyphs everywhere. Two corrections to the paragraphs above came first.
      "A full session makes no request for a `.glb`" held only for a session that
      never hovered a report: the report's popup and its tooltip each spun the
      model in a WebGL renderer of their own, fetching it and opening a context
      for every report hovered, and showed the same document for an RLSH person.
      And the hidden models did no picking: picking had moved to the glyphs.
      Now the popup and the tooltip show the report's own glyph, in the person's
      marker style with its category's emblem (`IntelReportGlyph`, drawn from the
      same artwork the atlas is baked from, moving as the globe moves it). Where
      no artwork can be baked the glyph layer draws plain shapes in its shader,
      a page, a diamond, an arrow, a hollow page and a person, still picked as the
      glyphs are; compiled and drawn in headless Chromium under the live content
      security policy. Gone with the model: the 3D preview, the markers' hook,
      the anchor-dot fallback, the GLB loader and its cache, the deployment
      debugger that existed to diagnose the GLB, and the asset-cache settings.

      *Clicking a mark opens its record — confirmed on the production build.* A
      person glyph over the UK, clicked at 715,285, opened Blackvoid's record in
      full. That settles the picking path rather than the Intel Report popup
      specifically: no models are built at all, so the click can only have come
      through the sprite layer, and an intel report travels the same code with a
      different popup at the end of it. Still not exercised with real intel
      reports, because relay delivery ran from 7 reports to none across runs and
      creating one locally needs a connected wallet.

      **RLSH gets a person, not a document — and the first attempt at that broke
      it.** Callers pass `activeIntelLikeReports`, which carries RLSH entities as
      well as reports, so the layer drew them as reports: `intelVariantOf` made
      every one Raw, and RLSH mode showed 44 blank document glyphs stacked down
      the limb. A document glyph says someone filed a report here, and an RLSH
      person is not that.

      *Excluding them was the wrong fix, and shipped as a regression.* It was
      chosen on a premise I stated and had not checked — that RLSH keeps its own
      visualisation. It does not: `useGlobeRLSH` fetches the entities and draws
      nothing, which is what its thirteen-models-in-Seattle comment is about, and
      they have always been drawn by the shared intel path. So excluding them
      removed their glyph AND their click, because this layer is what the
      interaction layer picks. Found by clicking one and getting nothing back.

      Both kinds are drawn, and the SHAPE separates them: four documents and a
      person, in the pink the RLSH anchors already use so the dot on the ground
      and the figure above it read as one mark. Read through `markerKind`, whose
      own comment is the reason: absent means intel, so a bare `kind === 'intel'`
      silently drops every marker written before RLSH existed — a mutation to
      exactly that broke ten tests.

   5. **A glowing mark is drawn in one object,** so every layer can offer one —
      done 2026-09-18, and the reason step 6.3 listed a per-layer options list as
      remaining work.

      `'glow'` meant two different things. For `useCyberAttacks3D` it is additive
      light drawn BEHIND its indicator discs, where the added brightness IS the
      meaning: crowded regions glow, and countries with something new glow. For a
      person picking a style it has to be a MARK. Drawn as a mark, additive light
      alone measured as very nearly invisible over a bright green and yellow
      globe, so the first fix paired a bloom with a disc as two objects inside
      `useScreenMarkLayer` — which left the ten layers calling `buildScreenPoints`
      directly unable to offer a glow at all.

      The two things now have two names. `bloom` keeps the pure additive
      behaviour for the two sub-layers whose meaning it is; `glow` draws a rimmed
      disc with light falling off around it, in one object, and is what a person
      picks. `bloom` is a shader style that no picker offers — `STYLE_IS_PICKABLE`
      is a `Record<ScreenPointStyle, boolean>`, so adding a style stops the build
      until someone decides which it is.

      **A point sprite cannot draw outside its own quad**, which is why the
      two-object version scaled its bloom to 2.2x. `GLOW_QUAD_SCALE` is that same
      figure in the shader: the vertex shader grows the quad, the fragment shader
      divides the distance back by it, so the disc inside a glow is the SIZE of the
      one `STYLE_DISC` draws and switching a layer between them never resizes its
      marks. Change one of those two figures without the other and it silently
      does; a test pins them together.

      **The halo adds light rather than compositing,** through `premultipliedAlpha`
      — one material, two behaviours: the disc writes colour times its own coverage
      with that coverage as alpha, and the halo writes colour with alpha ZERO,
      which the blend `src + dst*(1 - src.a)` leaves as pure addition. Compositing
      it instead would give `mix(ground, mark, a)`, darker than the ground wherever
      the mark is darker than what it sits on — and some of every palette is darker
      than some of the Earth. A halo that darkens the ground around every mark is
      not a glow.

      *What this cost to measure is the part worth keeping.* The darkening was
      first "measured" at 11,365 px brighter and 55,854 darker on the running
      build. That number was wrong: it came from one page load per style, and
      under SwiftShader a base texture times out on most loads — a frame missing
      its clouds differs from one that has them across a twentieth of the image,
      far more than any mark. When the probe was repeated the signature followed
      the failed load to a different style. The sound version switches the style
      **within one page load** through the on-screen switcher and captures each
      style twice, so the noise floor comes from the same page: two captures of
      one style differ by about 2,700 px, and against the disc it replaces a glow
      brightens 897 px and darkens 13. The arithmetic itself is now a test rather
      than a photograph, because arithmetic is what it was.

      This is the same lesson the layer audit already carries — two independent
      loads, and only what changes in both pairs counts — met again at a smaller
      scale and not recognised until it had produced a number that was nearly
      believed.

   The check is the layer audit under both renderers, comparing a layer against its
   own earlier runs — and the contact sheet, which is what the audit itself calls
   the verdict.

Not yet ordered; each is decided when it is reached:

- **Clutter and legibility — next, decided 2026-09-17:** Conflict Zones' overlapping
  circles, RLSH models at the globe's edge, Earth Weather's colour scale, the small
  Satellites, Cyber Threats and Eco Disasters marks. Measured by the layer audit:
  Conflict Zones overlaps heavily across Europe and the Middle East, and its legend
  encodes two different quantities in one channel — "size: events in that country,
  or people displaced", with colour applying only to the conflict marks. That
  ambiguity is the solid finding: the two sub-layers already exist
  (`buildWarEventMarkers`, `buildHumanitarianCrisisMarkers`), each publishing its own
  swatches, so what needs fixing is the shared legend key and the shared circle
  vocabulary rather than the data path. Diplomacy
  draws hundreds of mostly sub-legible marks at asiapac, and Satellites is close to
  invisible.

  **Built: two shapes, two keys.** Armed conflict keeps the disc — sized by events,
  coloured by mean Goldstein. Displacement becomes a RING, sized by people
  displaced, and says nothing about colour because it has only one. Shape carries
  the distinction so a reader who cannot rely on hue over a varied globe still has
  it, which is the rule the Intel Report variants follow.

  Each publishes its own legend entry under its own id — `ConflictZones` and
  `ConflictZones:displaced`, the sub-layer form the intel anchors already use — and
  each is withdrawn by id, so turning one sub-layer off takes its key with it and
  leaves the other standing. The key this replaced named displacement whether or
  not displacement was drawn. `LayerLegend` gained `shapeMeans` for it, and the
  share card prints it, because shape is now a channel that carries meaning in two
  places rather than an accident of drawing.

  The decision the legend can no longer make: no entry may say size means one thing
  *or* another. That is asserted rather than described.

  Verified by looking, in GeoPolitical / ConflictZones on the production build: red
  discs and purple rings, and a country with both draws a disc inside a ring —
  which reads as two independent facts about that country, where two discs read as
  one fact whose units nobody could name.

  *Corrected: nothing renders outside the limb.* This said marks render outside the
  globe on Conflict Zones and Diplomacy. Zoomed into a card they sit ON the limb,
  drawn at full size against the dark terminator, which reads as a halo at
  contact-sheet scale. The defect is that marks near the horizon are neither
  foreshortened nor faded, on three layers — Conflict Zones, Diplomacy and
  Resources — and fixing it means a normal attribute and a uniform in the
  `screenPoints` shader every layer shares.

  **Built, and it needed no attribute from any layer.** A mark now shrinks toward
  `LIMB_MIN_SCALE` and fades out between `LIMB_FADE_IN` and `LIMB_FADE_OUT` as the
  ground under it turns away — the numbers are exported and the GLSL reads those
  very constants, so there is no second copy to drift. The normal is DERIVED in
  the shader rather than supplied: every screen point sits on a radius of a sphere
  centred on its group's origin, so the normal is the direction from that centre
  to the point, and the centre comes through `modelMatrix` so a moved group stays
  right. That is what let all ten calling layers stay untouched — the geometry
  still carries exactly `position`, `pointColor` and `pointSize`. `limbFalloff:
  false` is there as an escape hatch for a layer whose marks are not on the
  surface, so finding that out never means editing the shared shader.

  Verified by looking, which is the only way to judge a falloff: RLSH mode drew 44
  marks down the left limb at full size before and a chain that visibly diminishes
  after. The curve itself is not unit-tested and cannot be — jsdom runs no shaders
  — so what the tests hold is the contract around it: the switch, its default, and
  that the shader uses the published numbers.

  **The audit was photographing the floor from a different place, and that was
  most of what it reported (found and fixed 2026-09-17).** The harness set the
  camera, then waited `SETTLE_MS` for the layer's data before capturing — twenty
  seconds on the first view. The app moves the camera during that wait, doing
  exactly what it should: `useTurnToFirstIntel` turns the globe to the centroid of
  the first reports and zooms in. That happens only in IntelReports mode, and
  IntelReports is the CyberCommand floor. So every layer in that mode was compared
  against a photograph of somewhere else:

      IntelReports.atlantic   39.95°N 88.97°W  alt 1.80R
      CyberThreats.atlantic   20.00°N  5.00°E  alt 2.40R   ← the configured view

  Only the first view was affected, because the turn fires once and the later
  views wait 2.5 s. What it produced, and what was read as layer content for an
  afternoon:

  | atlantic | before | after |
  |---|---|---|
  | Cyber Threats | 170 marks, 27 legible, median 3 px², 24.40% moved | 19 marks, 19 legible, median 129 px², 0.50% |
  | Satellites | 176, 27 legible, 3 px², 24.38% | 3, 1 legible, 4 px², 0.26% |
  | RLSH | 171, 27 legible, 3 px², 24.39% | 17, 8 legible, 14 px², 0.52% |

  Three layers reporting the same count, the same legible figure and the same
  3 px² median was the tell: not three layers drawing alike, one artifact
  attributed to each. The fix re-asserts the view immediately before capturing and
  then CHECKS it against `getView`, dropping any view that cannot be shown to be
  the right one — see `scripts/lib/auditCamera.mjs`.

  *The control that confirms the cause.* EcoNatural's floor is Space Weather,
  which has no intel and so no turn: Eco Disasters went 69 → 68 marks and Earth
  Weather 54 → 60 across the same two runs. The mode with an intel floor changed
  by an order of magnitude; the mode without one did not move.

  *And it moved a floor, which is its own warning.* GeoPolitical's floor was
  Diplomacy before the fix and Resources after, because the floor is whichever
  layer draws least and the counts changed. So no GeoPolitical figure from before
  the fix is comparable with one from after — the same trap this section already
  records about 107 marks versus 265.

  **Diplomacy's marks were never the defect — its dashes were (2026-09-17).** The
  audit called it "hundreds of mostly sub-legible marks", and with the camera fixed
  it reported 824 marks at asiapac with three quarters under 4×4 px. Looking at
  the card settles what those were: the country discs are bright, well sized and
  legible, and the sub-legible components are the CONNECTION ARCS, drawn
  `dashed: true` at dashSize 3 / gapSize 2 with linewidths of 0.8–3.2. 326 pairs
  of dashed arcs fragment into hundreds of tiny components, and the audit counts
  connected pixel components — it cannot tell a dashed line from a field of dots.
  So "sub-legible marks" was the metric describing dashes.

  *The same caveat applies to any layer that draws lines.* Comm Hubs reported 227
  components at a 3 px² median, and its content is submarine cables. No legibility
  conclusion should be drawn for a line layer from that statistic.

  **The arcs are solid now, and the reason is not aesthetics.** This app already
  means something by a dashed line: `materialTheme.ts` marks disputed and
  line-of-control borders dashed and everything else solid, calling it the
  standard cartographic convention. Dashed means PROVISIONAL. A diplomatic
  connection and a trade route are not provisional, so drawing them dashed
  borrowed a meaning they do not have and diluted the one that does.

  It also reads far better, checked by capturing the same view before and after
  through the share handle: a speckled band of dashes piling up around the limb
  became legible great-circle curves that can be followed individually. Resources'
  routes gained most, since those arcs rise 12 units above a 100-unit globe and so
  project furthest past the silhouette. One uncontrolled variable in that
  comparison, stated: the "before" capture was drawn without clouds because the
  device could not keep up, and the "after" had them.

  *What is still unfixed at the limb.* The arcs are lines, not screen points, so
  the foreshorten-and-fade above does not reach them — a camera-dependent fade
  would mean patching `LineMaterial` through `onBeforeCompile`, and a material
  that fails to compile draws nothing at all, which has already taken every
  country fill and marker off this globe once. Left alone deliberately.

  *And the mark numbers are weaker than they looked.* Two things undercut them.
  Mark counts are measured against the mode's FLOOR — its least-drawn layer — so a
  run where the floor differs is not comparable: Conflict Zones measured 107 marks
  against one floor and 265 against another, same page, same day. And the audit
  keeps only pixels that differ from the baseline in BOTH of two independent loads,
  which assumes a drawn mark lands in the same place twice. Satellites move between
  loads, so only the sliver where two positions overlap survives — which is the
  likeliest reason a layer declaring 7-11 px diameters reports a 3 px² median. The
  legibility figures for any moving layer should be treated as a lower bound until
  the instrument distinguishes motion from absence.
- **Coverage:** Space Weather beyond the US and Canada (a global NOAA product such
  as the aurora forecast), and Resources without an EIA key.
- **Card time:** feeds that record their fetch as their update, and RLSH and Earth
  Weather saying whether their data arrived. *Settled: steps 11 and 12 for every
  feed but Satellites, and step 13 for Satellites.*
- **Left from 12 September:** the relay list, written out in nineteen files and
  diverged between them. `publicInfrastructure.ts` names seven relays,
  `NostrStarcomIntelIngest` five, `FederationIngestService` six including The
  Record; `nostrService`, `publishTargets`, `geoint/config`, `ChatProviderFactory`
  and `SecureChatIntegrationService` each hold their own. Recorded as seven here
  until it was counted.

### 7. The key, on the globe (2026-09-18)

`globeLegendStore` was built so a layer states its own encoding AS IT DRAWS, from
the very array that produced the geometry — a key that cannot go stale because
nothing writes it down twice. Fourteen sources publish into it.

**Exactly one thing read it: `composeShareCard`.** `subscribeLegends` had been
there since the store was written with nothing subscribed. So the app computed a
careful explanation of its own picture and showed it only in an EXPORTED IMAGE. A
person looking at the live globe had no key at all — and `Globe.tsx` carried a
comment claiming `HAZARD_TYPE_LEGEND` was "the same source the in-app legend
reads", which was read in that one file and nowhere else. The only on-screen key
in the app was a hardcoded one in `GeopoliticalLayersPopup`, which is the table
beside the code the store exists to abolish.

`GlobeLegend` renders that store, docked above the layers button. It decides
nothing: the layers say what their marks mean and this shows what they said.

*Swatches are drawn in the shape the layer drew.* The share card draws every
swatch as a filled dot, which was true enough when every layer drew discs. Since
6.3 a person can put a layer on rings, and a round dot beside a globe full of
rings is a key that does not match its own picture.

*And that is how the shape collision is handled.* 6.3 lets a person choose a
shape per layer, while some layers already use shape semantically — Conflict
Zones IS its shapes, and Cyber Threats' enrichment ring means corroborated. The
decision was to keep the per-layer choice and make collisions legible rather than
prevent them: when two DRAWING layers declare the same shape the key names the
other one. Only declared shapes count — most layers draw one kind of mark and
publish no `shapeMeans`, and treating those as collisions would warn on nearly
every pair on the globe.

*Measured on a running globe, not asserted.* With CyberThreats on `ring`, the key
reports `shape: ring` and three RING swatches carrying real severity labels;
SpaceWeather on `disc` reports five disc swatches. Both on screen, neither
covered — `elementFromPoint` at the legend's own top centre returns the legend.

### 8. Every colour on the base map means something (2026-09-19)

Decided on the measurement recorded under the channel audit below: on the
default scheme 31% of settled international borders were drawn in the
line-of-control amber, and on the political scheme 27% in the disputed red.

*The rule.* A border is coloured by its classification alone; every
classification has a colour no other uses; the two provisional colours, red and
amber, are reserved for provisional borders and appear nowhere else on the base
map; and the country fills are one quiet tone.

*What went.* `schemeColor` — the hash of an id into a four-colour palette — and
with it the "Colour scheme" setting it was the only reader of. Its options were
Default, Political, Economic and Population, which promised the fills encoded
those things; "Population" was four reds assigned by hashing each country's id.
Kept, it would have been a select whose options change nothing. A value already
stored under it is ignored. The hardcoded border key in `GeopoliticalLayersPopup`
went too: it showed International as one green swatch when international borders
came in four colours, and drew every swatch solid.

*What came.* International borders are a pale cool neutral, the quietest line on
the map because 91% of borders are international. Provisional borders are drawn
twice as heavy as settled ones, following the thickness setting rather than
replacing it. The fills are `TERRITORY_FILL_COLOR`, a dark desaturated tone, so
the terrain shows through and the data layers — the saturated colours a reader is
meant to be looking at — stand out against it.

*And the borders have a key now,* published from the batches actually drawn
(`bordersLegendFromGroups`), so the setting that hides disputed borders drops
their swatch too. Borders are lines, and in one entry a settled boundary is solid
while a provisional one is dashed, which an entry-level `shapeMeans` cannot say —
so `LegendSwatch` gained its own optional `shape`, and the on-globe key and the
share card both draw `line` and `dashed` swatches.

*What the dash does now.* At the default altitude it is still hard to resolve.
It no longer has to be: before, colour could not identify a contested border,
because settled borders came in the same amber and red, so the dash was the only
signal and it was not legible. With those colours reserved, colour identifies a
provisional border on its own, and the dash confirms it on zooming in.

*Measured, before and after, on the same Kashmir view.* Before: India filled
amber, Pakistan green, Afghanistan blue, borders faint under them. After: one
quiet tone with the terrain showing, pale settled borders, the amber dashed line
of control and the red dashed disputed frontier plainly visible, and a key listing
`Borders` beside the data layer with line swatches that match the lines.

*One mistake the unit tests could not catch.* The first wiring read the key off
the newly built border group, on the reasoning that a crossfade leaves the ref
holding the outgoing level. It does the opposite:
`replaceGroupContentsWithCrossFade` calls `current.add(...newContent.children)`,
and three.js reparents on `add`, so the new group is left EMPTY after any change
of level of detail. The key read from it was null, publishing null withdrew it,
and every unit test passed — the running globe showed a key with no borders in
it. It reads the refs now, and `borderLegend.test.ts` pins the trap with the real
crossfade.

*Tests replaced, not worked around.* Two tests asserted the defect:
`materialTheme.test.ts` opened with "uses scheme hashing for international
borders", and the territories service test asserted that different schemes give
the same country different fills. Both were right about the code and the code was
wrong about the map. They now pin what replaced them, and a new one pins the
invariant that was broken — no provisional colour on any settled class or on the
fill — which is the test that would have caught this.

### 9. Satellites: size says nothing, and restyling does not reload (2026-09-19)

*Size is uniform.* Size and colour both encoded a satellite's role — the key read
"size: role — stations largest" beside "colour: role" — so one fact was spent on
two channels, and size, which reads as MORE, carried a category. Nothing honest
was left for it: satellites are drawn at their true altitude, so altitude is on
position already, and CelesTrak's orbital elements carry no physical size. Every
satellite is now `SATELLITE_MARK_PX` (8 px, above the card's 4 px floor at 0.87x),
the key no longer claims size means anything, and each channel says one thing.

*Step 6.3 closes here for Satellites, and why it took so long is the finding.* It
sat at `not-yet` longest, recorded as "a hook test crashed the vitest worker" and
"a visual check drew nothing". The second was CelesTrak's two-hour limit. The
first was a DEFECT: the style was a dependency of the effect that loads the
catalogue, by identity. A test passing the choices inline gave that effect a new
object every render, the effect set state, the state re-rendered, and the worker
ran out of heap. Putting `markerStyles` back into those dependencies reproduces
the overflow exactly — that is one of the mutations run against the fix.

In the app the same coupling meant that choosing a style ran the effect's
teardown, `satelliteVisualizationService.dispose()`, which clears the catalogue,
and then loaded it again. It could not be triggered while the layer was
`not-yet`, because the switcher is hidden for such a layer; it would have shipped
the moment the layer was declared honoured. The style is now resolved to a
string, which compares by value, and a restyle rebuilds the marks from what is
already loaded and puts them straight back at their current positions.

*Tested at the hook, for the first time.* `useGlobeSatellites.test.ts` mocks the
propagation service and stubs the frame loop. Eight mutations, all killed,
including the one that kept this layer `not-yet`: deleting the style from the
hook's call now fails four tests.

*Measured in production, which corrected a hypothesis.* The dev server requests
each catalogue group twice on one load, and that looked like the app causing
CelesTrak's refusals. It is React StrictMode, development only: the production
build requests each group once, before and after this change, and picking a
style causes no request at all.

*Seen on the running globe* with the refused group served the real `stations`
response saved minutes earlier — real elements for real craft, a smaller set —
because this session's own measurements had used up CelesTrak's two-hour window
(`GROUP=active` returned HTTP 403). The satellites draw as uniform rings, and the
key reads "shape: ring · colour: role" with ring swatches, updating live when the
style changes. That checks the drawing, not the data pipeline.

### 10. Step 6.3 closes: every layer that draws marks honours a chosen style (2026-09-19)

EarthWeather was the last. Both hooks, all four kinds of mark — stations and
icebergs in `useGlobeEarthWeather`, tide and river gauges in
`useGlobeWaterGauges`, which gates on EarthWeather and so takes its choice.

*A restyle now changes the material and nothing else.* `setScreenPointsStyle`
sets the three properties a style owns — shader defines, blending, premultiplied
alpha — from the same `stylePropsFor` that `buildScreenPoints` uses, so a set
restyled in place draws exactly like a set built in that style; a test builds
every pair of styles both ways and compares. Every layer restyled by rebuilding
before, and a rebuild is where Satellites went wrong. EarthWeather already had the
right shape for another setting — it recolours in place on a `colorMode` change —
and the style now follows the same path: read by the builders through a ref,
applied afterwards, never a dependency of the load.

*Tested at the hook, which neither had.* `earthWeatherMarkerStyle.test.ts` mocks
the four services, passes the choices inline on purpose, and checks each service
was asked once. Fourteen mutations, all killed. One survived the first round and
is worth knowing: a style leaking into the GAUGES' load did not refetch, because
they cache their raw readings so a change of detail tier can rebuild without the
network — so a "fetched once" assertion cannot see it. Asserting the restyled
marks are the same objects can, and does.

*On the running globe,* 144 stations and 33 icebergs went from disc to ring on one
click with no request to any of the four services, and the key read "shape: ring
· colour: temperature" with ring swatches. The gauges are off by default and were
not drawn there; the hook tests cover them.

*Where 6.3 stands, derived:* nine layers `honoured`, none `not-yet`. Resource
Zones draws no marks and Conflict Zones' shape is its key, both by design.

*And none of the nine fetches when restyled* — checked because Satellites did,
and seven layers were wired before anyone knew to look. On the running globe,
each layer was loaded, then given a 7.5-second window with no clicks and one of
the same length clicking ring, glow and disc. No layer's clicks reached any host
more often than its quiet window did. Every layer showed about four requests in
the first, naive count, all to `api.devnet.solana.com` and a Discord widget —
timers that fire whatever the globe is doing, which is why a count alone was not
evidence either way. The one layer whose quiet window happened to be empty,
Comm Hubs, was rerun three times: its one request was the Discord widget each
time, and once fell in the quiet window as well.

### 11. The key says where each layer's data came from, and how old it is (2026-09-19)

Step 7's finding a second time. Globe.tsx has long built a feed for every active
layer — its source, when it last loaded, whether it failed and why — and handed
it to the share card and nothing else. So an exported image said "CelesTrak did
not load" while the live globe said nothing, and a mark from a two-hour-old
catalogue looked like one read thirty seconds ago.

*One classification, two surfaces.* The card's per-feed rules — failed, loading,
never loaded, loaded but untimed, unreadable, unreported, fresh, stale — moved
into `feedState` in `shareCardProvenance.ts`, and the card now reads its caveats
from it; every existing caveat test passed unchanged, so no wording moved. The key
takes the SAME `shareFeeds` array and the same `feedState`, so it cannot call a
source fresh while an image captured that second calls it stale. The card states
only what a viewer must be warned of; the key states every source.

*What the key shows.* A SOURCES section: "as of 19:45Z · 2m ago" — UTC marked Z
per D-E, the date as well past a day — ticking every 30 seconds, since a frozen
"8m ago" becomes false. Past the card's hour it is marked stale. A failed source
reads "did not load — <reason>" in amber, and the key now appears for it even
when nothing at all is drawn; rendering only when marks exist would have made it
silent exactly when it has the most to say.

*In words, not by fading the marks.* A layer is fetched in one go, so its age is
one number for all of it: dimming would dim a whole layer evenly, which reads as
"less important" rather than "older", and opacity already carries the limb fade.

*Earth Weather reports now.* Its hook returned only its group, so its feed was
`unreported`. It returns health like Satellites, and its time is when the weather
was OBSERVED — the oldest point drawn — never when the app fetched it. A layer
that drew weather with no readable time says "untimed", not "has not loaded".

*And a time-zone defect, fixed before its first reader.* Open-Meteo sends
`current.time` as '2026-09-19T19:30' with NO zone designator, even with
`timezone=UTC`, and JavaScript reads that as the browser's LOCAL time: on this
machine, in America/Chicago, 00:30Z the next day. Nothing read the field until the
key began stating ages. `openMeteoTimeToIso` makes it unambiguous where it enters,
honouring the `utc_offset_seconds` the response carries; four tests catch the
local-time slip, which on a UTC machine would have passed.

*On the running globe,* in a browser set to America/Chicago: "Open-Meteo weather —
as of 19:45Z · 2m ago" against 19:47Z actual. With Open-Meteo forced to 503:
"did not load — Open-Meteo weather API error: 503" in amber, with no stations
drawn. That same run showed the Earth Weather entry still claiming "colour:
temperature" beside a lone iceberg swatch; it now claims a colour only when a
station is drawn.

*Worth knowing about Satellites' number.* Its "as of" is when CelesTrak SERVED
the catalogue — the value the card has always used, so the two agree. The orbital
elements inside are older (the ISS's were stamped about twelve hours earlier) and
positions are propagated to now from them. Which of those a viewer should be told
is the open "Card time" item below, not something this step changed.

### 12. Every feed's time is the data's, not the fetch's (2026-09-19)

The open "Card time" item, audited feed by feed by tracing each time to where it
is set, rather than read off the names:

| feed | its time was | now |
|---|---|---|
| NOAA space weather | the fetch; "now" even when NOAA listed no files | the newest file's own time |
| GDACS disasters | the fetch (a cache re-read keeps its first time) | unchanged — see below |
| CelesTrak | the network fetch | kept, with a note — step 13 |
| Submarine cable map | the fetch | untimed: the source gives no date |
| Cyber Threats | the oldest list drawn | already right |
| GDELT, both | the newest event window | already right |
| Open-Meteo | the observation, oldest point | fixed in step 11 |
| RLSH | reported nothing | when the records were verified |

*RLSH.* Its hook returned `{ reports, loading }`, and a failure was swallowed —
`setReports([])` and a log line — so it looked exactly like an empty registry. It
reports its health now, and its time is when the drawn records were VERIFIED.
Every one of the 197 shipped records was verified at 2026-03-02T15:15Z, so the key
reads "as of 2 Mar 15:15Z · 201d 4h ago", marked stale — measured on the running
globe. That is the most useful single line this work produced: the layer draws
people's locations, and they are six and a half months old.

*And RLSH invented people when everything failed.* The last rung of
`fetchSourceRecords` returned `buildPlaceholderMarkers()`: "Phoenix Sentinel" in
Seattle, "Lakefront Guardian" in Chicago, with made-up aliases and biographies,
example.org links, `lastVerifiedAt` set to the moment of the failure, and
`source.provider: 'primary_wiki'` — a false claim of where they came from. It
never reached production, because the embedded dataset is non-empty and returns
first. It fails now, saying why, and a test reaches that path — every other test
runs under the test-runtime rung, which returns placeholders by design, so none
had ever reached it.

*Space Weather, and why the obvious fix was wrong.* It stamped its age as the
fetch, and as "now" when NOAA listed no files. The file's `time_tag` looked like
the answer and is a DATE only — '2026-09-19' — which parses as UTC midnight: data
from 19:54Z would have read as twenty hours old at 20:03Z. The time is in the
FILENAME (`20260919T195430-15-Efield-….json` is 19:54:30), assembled with
`Date.UTC` rather than parsed, because NOAA's zone-less times parse as local and,
west of Greenwich, hide staleness — `SpaceWeatherLive.ts` records that of a sibling
feed. The same date-only `time_tag`, with a fallback to "now", had been dating
space-weather intel reports to midnight; they take the file's time too. Measured
live: "as of 20:05Z · 10m ago". The newest file is also chosen by name now rather
than by position, the assumption that broke on that sibling feed.

The existing test of this service mocks `time_tag` as a full ISO timestamp, which
is how the date-only shape stayed invisible. The new tests use NOAA's real shape,
and live in their own file because `noaaSpaceWeather.unit.test.ts` is excluded from
the stable run — tests added there never execute.

*The cable map* is a community snapshot on GitHub with no Last-Modified header and
no date in the data. "Fetched 0m ago" made a snapshot of unknown age look live; it
reads "loaded — the source does not say when".

*GDACS* is left on the fetch. It is a live feed, its cache path keeps the original
time, and its events carry their own dates for D-E's event time; the fetch is an
honest upper bound on how stale the FEED can be. Recorded so it is a decision, not
an oversight.

### 13. Satellites: when the elements arrived, and a note that positions are predicted (2026-09-19)

Satellites does not fit the model the other feeds use, because its positions are
not observations: SGP4 predicts them for the present moment from orbital
elements. Measured on the 23 station records, those elements were 8h old at
newest, 16h at the median and 66h at oldest. So neither reading of "as of" is
true — the fetch time ("0m ago") implies the positions were just observed, and
the element age ("16h ago", stale) implies they are sixteen hours out of date.

*Decided: keep the fetch time and say what the positions are.* The feed's time
stays the moment CelesTrak served the elements, and it carries a standing note,
`SATELLITE_PREDICTED_NOTE`: "Satellite positions are predicted from published
orbital elements, not observed." The share card prints it as a caveat, as it does
GDELT's; the key shows it under the source. The element age is not shown — at
globe scale the prediction error it implies is a few kilometres, far inside an
8 px mark, and the choice here was to state the nature of the data rather than a
number that reads as staleness it does not have.

*The key began showing notes for this.* It showed a source's state only, while
the card printed its note. They now share `noteApplies` — a note shows only when
something from the source can be in the picture, never for one that failed or
never loaded — so the two apply one rule. A test that the key leaves the note off
a failed source passed trivially until notes rendered at all; the mutation that
makes the key show any note regardless of that rule now fails it.

*On the running globe:* "CelesTrak satellite catalogue — as of 20:22Z · 0m ago",
and beneath it the note, in the key beside the Satellites entry.

### 14–17. Found answering Mecha Jono's questions about what Starcom reads (2026-09-19)

Mecha Jono's development AI sent 38 questions to be answered "with a fact or a
we don't have that", after an audit of our side. Auditing the globe's intel path
to answer them turned up four defects in what the globe shows, each fixed and
tested before the answer went out. The audit's other results — what Starcom
reads, and from where — are in the reply; the protocol facts are in the
interchange specification, which was itself corrected (rev 3: the package's
`visibility`, not the clearance tiers the code had already removed).

**14. The intel popup invented an assessment for every report.** Four "analysis"
cards were computed from keyword tags, with a default for every miss: Threat
Level LOW, Source Reliability 30%, "Continue monitoring for developments",
"Historical precedents in intelligence database"; Collection Method fell back to
"Multi-Source" under a header reading NO STATED SOURCE. A Nostr report's
hashtags are kept apart from those tags, so every one — every report Mecha Jono
would publish — was shown as LOW at 30% with actions nobody recommended. D-C
decides it: "nobody said" is not "someone said low". The popup now shows a
threat level or a confidence only as the report stated it, and "no stated …"
otherwise; the invented actions and related-intelligence cards are gone.

**15. A report with no readable time was "now".** Both globe intel producers
substituted `Date.now()` for a date they could not read. Under a time window such
a report sat at the present moment, and before the 500-marker cache cap it sorted
as the newest and was always kept, pushing a genuinely recent report out. It has
no time now: left out under a window and counted as its own fact — "2 of 9
reports not placed on the timeline — no stated time" — sorted last, and an event
with no readable `created_at` is refused as malformed.

**16. Two indeterminate frontiers were drawn as settled.** Natural Earth's
"Indeterminant frontier" missed the rule for indefinite boundaries, and anything
unrecognised fell through to International — at build time, and again in the
topology loader, which disagreed with the normalized loader's default. Both now
read an unrecognised class as unknown; the assets were regenerated and each diff
checked to contain only those two features and the checksums that follow.

**17. A polygon stood on its first vertex.** A district would have been pinned
to a corner. A polygon now stands at its centroid and a line at its halfway point,
falling back to the first vertex — and saying so — where the centroid lies outside
the shape or the shape crosses the antimeridian. Still a point, not an area.

### 18. Posting a report, not only a layer (planned 2026-09-25)

Mecha Jono's first capture run (contract v4, ten layers in one page load) showed
the handle can reach every layer and cannot say anything about one report. A card
names layers, a legend and caveats; it never names the report a post is about.
Items 1 and 2 are approved in that order; 3–6 follow. Each ships on its own, with
failing tests first, mutations on the claims, and a capture looked at.

Constraints that bind every item, from their run and from this project:
- RLSH is people. It is never listed, featured or framed through the handle.
- Nothing is framed below one globe radius. Mecha Jono's Form 990 filing addresses
  are often a home; at globe scale a mark is a region, not a door. The handle
  enforces this for everything it frames, so it stops being only their rule.
- A Mission Package's position stays internal (Locked Decision #7). No public
  capture draws a package's linked internal records.

**1. Marks that read in an image.**
   1. *Glyphs take the layer's style.* The glyph atlas gains one row per style —
      disc, glow, ring — and each mark reads its row from its own layer's chosen
      style (Intel Reports or RLSH). `setMarkerStyle('IntelReports', …)` then
      changes what is drawn, which is Mecha Jono's first ask. Styled glyphs draw at
      35 px so the document itself stays at 26. Decided on the review page:
      disc is the default, because the dark backing makes a glyph legible on
      bright land and dark ocean alike.
   2. *One glyph per place.* Co-located reports merge, by the anchors' own key
      (four decimals, about 11 m), into the most severe variant there, drawn solid
      if any of them arrived live. A count badge is drawn when there is more than
      one. Clicking opens the most severe report, with the popup's order starting
      at that place.
   3. *The duplicate pin goes.* A report was drawn twice: a purple pin on the
      ground and the glyph above it. The pin's two jobs, the place and the count,
      now belong to the glyph and its badge. The pins stay only as the fallback
      when the atlas cannot be baked. The step-6 note that "a report draws twice"
      is superseded here.
   Check: tests on atlas rows, merging and the badge, each mutated; a capture of
   Mecha Jono's US reports before and after.

**2. Letting an agent feature a report** (contract v5).
   1. `listReports()` — what is drawn now: id, title, variant and what it means,
      author, event time and its basis, stated precision, and a position rounded to
      that precision and never finer than 0.1°. No RLSH.
   2. `frameReports(ids, {preset})` — a camera that fits them in the card's
      aspect, at no lower than one globe radius.
   3. `focusReport(id | null)` — the chosen glyph is enlarged and ringed, the rest
      dimmed; the next card carries a featured block (title, author, what the
      variant means, event time in UTC, stated precision, and that the event's
      signature was checked on intake) with a leader line to the glyph, projected
      in the same no-await section as the bounds.
   Check: contract fingerprint, handle tests with capture stubbed, a composed card
   looked at in every preset.

**3. Stated precision is drawn.** The intake reads `geo_precision` (a word such as
   `county`, or a distance) and a geohash's cell size into `geoPrecisionM`, which
   the popup already reads and nothing fills. A coarse report is drawn as a soft
   area of that radius under its glyph; the card says how many reports are placed
   only to a coarse precision. The spec gains the tag.

**4. Mission mode — revised 2026-09-25 to Mecha Jono's spec.** Their doc "Missions
   people can act on" asks for this in their order of value, and it replaces the
   briefing card planned here. None of it asks Starcom to decide what a mission is:
   they author, sign and carry the geometry; Starcom draws it faithfully.
   1. `renderMission(package)` — drawn from a package this node has verified, never
      from arguments an agent assembles: the area of operations, each objective as
      a labelled mark, named areas of interest, the rest of the board dimmed.
      Geometry travels signed in `manifest.assets`. An objective label is an
      organisation or a place, never a person: each feature must declare which, and
      a package with a person-labelled feature is refused whole.
   2. Card templates — brief, SITREP, disposition — at 1:1 and 4:5. 9:16 needs a
      camera decision, not a crop (CARD_PRESETS says why), and is decided
      separately.
   3. A place to land: `?mission=<id>` opens the mission on the opportunity board,
      with its claim state.
   4. Caveat wording meant for a public reader. "Nothing of yours was there to
      analyse" is addressed to the capturing browser and reads as addressed to the
      viewer.
   **Their first real packages arrived 2026-09-25 23:17 UTC and were all refused
   by us, wrongly:** `createdAt` was Python's isoformat (`…+00:00`), which the
   spec allows and zod's bare `.datetime()` did not. Fixed; all three verify.
   They also settle how a package reaches the globe without new geometry: each
   cites its public report in `reports[].id` (`ic-ein-51f0f8bfc7`), the tail of
   that report's addressable id on the globe
   (`30023:<pubkey>:starcom-intel-ic-ein-51f0f8bfc7`). A package can be framed and
   featured through the report it cites, today, with v5.
   Two things to settle with them before building 4.1: the framing floor (a city
   situation map wants closer than one globe radius, which is their own rule), and
   the geometry encoding in `manifest.assets`. Starcom's own outbound packages are
   unaffected: their position stays internal (Locked Decision #7).

**5. Clips worth posting — built 2026-09-25, contract v7.** `planReportTour(ids)`
   returns keyframes (open wide, visit up to five clusters at no lower than the
   floor, pull back) for `recordClip`; `recordClip({ replay })` reveals the reports
   in time order as the clip plays; `endCard: 'poster'` holds every caveat page for
   one frame; a clip names its featured report on its end card (clip schema 2).
   *The replay is drawn by the glyphs, not by the app's time window.* Each glyph
   carries its time and reads a replay clock as it draws, so a frame shows exactly
   the moment set for it; driving the time window per frame would re-run an
   asynchronous reload of every marker between frames. Badges and precision areas
   hide during a replay, since both would show reports not yet arrived.
   *Two things only watching the first real clip found.* Mecha Jono's report
   times run from 12 February to 25 September, nearly all on the 25th, so at the
   pace of the calendar nine-tenths of the clip was an empty globe; the default
   pace is now `even` (in order, evenly spaced, and the caveat says the spacing is
   not the time between them), and the reveal completes at 85% so the close holds
   on everything. And the tour only panned, because the fit for their US reports
   is 1.06 radii and every stop sits at the 1.0 floor; it now opens 0.8 radii
   wider. A byte budget was dropped: the frames are encoded to H.264 on their
   side, so a budget stated here could not describe the file they post.

**6. `describeView()` — built 2026-09-25, contract v6.** Per drawn layer, the
   hoverable marks inside the crop a card of that preset would cut, and the first
   five. Ranked by the value a size encodes where the layer gives it (`magnitude`
   on a screen point; Conflict Zones and Diplomacy so far), since capped sizes put
   626 events level with 142. Hidden means the planet is between camera and mark,
   not "below its horizon", which miscounted satellites. RLSH is never described.

### 19. Raver Watch: a mode for Mecha Jono's safety notes (planned 2026-09-29)

**What was asked.** Mecha Jono's spec sheet (draft v1, 29 Sep 2026, sent as a
link) asks for a new mode, `RaverWatch`, beside CyberCommand, GeoPolitical and
EcoNatural. It covers safety at dance events. It has six layers, each drawn from
kind 30023 notes they publish to The Record tagged `raver_watch` and never
`starcom_intel`:
- `DrugCheckAlerts`: what drug-checking labs found circulating.
- `SceneIncidents`: heat, crowds, spiking, closures.
- `SceneEvents`, `HeatRisk`, `RaverMissions`, `HarmReductionSites`: later, as
  their sources come online.

Data for the first two is live. Every layer is to be reachable through the share
handle and by link, so their share stack can post cards and clips with it. Their
house rules match ours:
- never a person;
- never a seller, and never the police;
- drawn only where the source says it applies;
- RLSH never shown in this mode.

Measured before answering:
- **A point layer is a small job.** `useScreenMarkLayer` takes a list of marks.
  `useGlobeSpaceWeatherPoints.ts` is a 95-line example.
- **A new mode is written into about nine files.** There is no mode registry.
  - `VisualizationModeContext.tsx:12-30`.
  - `visualizationModeFromUrl.ts:37-51`.
  - `railModeConfig.ts`.
  - `useGlobeLayerControl.ts:26-107`.
  - `markerStyles.ts`, whose records the compiler keeps exhaustive.
  - `useGlobeShareCard.ts:113`.
  - `shareHandleContract.ts:148-152`.
  - `Globe.tsx`.
  - `CyberCommandLeftSideRail.tsx:12-28`. It saves any mode it does not name as
    EcoNatural, so a new mode needs its own branch there.
- **The share contract's layer list is typed by hand.** It is at
  `shareHandleContract.ts:148-152`, and nothing compares it with
  `LAYER_CATALOG`.
- **There is no deeplink v1.** Only `?mode=` and `?sub=` are read
  (`visualizationModeFromUrl.ts:88-115`). The v1 grammar their links use was
  never received or built.
- **Starcom shares positions at 0.1°, not 0.01°.** See `shareReports.ts:71-79`.
- **Country outlines exist; state outlines do not.** `useGlobeRegionMarks.ts`
  draws country outlines, and `territoryIndex.byCode` matches country codes only.
- **The shared time window exists, and the handle never reads it.**
  `TemporalContext.setTimeWindow` is at `TemporalContext.tsx:222-232`.
- **Screen points have no per-point opacity,** so nothing can fade one mark by
  age.
- **The Intel Reports ingest takes notes from any author.** It reads neither
  `title`, `valid_from`/`valid_until` nor `retracted`. It drops a `raver_watch`
  note, as it should.

**Decided 2026-09-29.**

| | Decision |
|---|---|
| RW1 | **After the chat block.** Built once plan items 9.8, 9.9, 9.7, 9.12 and 9.11 land, before 9.13 and 9.14. Cohort work stays first. |
| RW2 | **Named publishers only.** A list of keys kept in one place, starting with Mecha Jono's. A `raver_watch` note from any other key is not read. A health alert from an unknown key could be a fake red alert or a fake all-clear. |
| RW3 | **0.1° everywhere, as today.** Drawn and shared no finer than about 11 km. A venue shows as its town. |
| RW4 | **Regions: a faint outline, and US state outlines added.** A country-wide alert gets a faint outline of the country. A state alert (`us-tx`) gets its state's outline, from Natural Earth's public-domain admin-1 set, loaded only when needed. |
| RW5 | **Their names.** Mode `RaverWatch`, shown as "Raver Watch", and the six layer ids as proposed. |
| RW6 | **`valid_from` and `valid_until` as their own tags,** not NIP-40 `expiration`, since relays delete expired events and the history is worth keeping. An item fades as `valid_until` nears, and is hidden after it. |
| RW7 | **Contract v8's `setTimeWindow({from, until})` and `getTimeWindow()` move the app's shared window.** They drive what a person sees, `compose` provenance records the window, and the call waits for the markers to reload. |
| RW8 | **Their grammar becomes Starcom's deeplink v1.** `?v=1` with `sub=`, `at=`, `pin=`, `focus=` and `win=`, read and documented, once they send its exact form. |

**Phase 1, in order.** Each item has failing tests first, mutations on the
claims, and a capture looked at.
1. **The reader.** It subscribes to The Record with `kinds: [30023]`,
   `authors`: the named publishers, and `#t: raver_watch`.
   - It keeps the newest by (kind, pubkey, d).
   - A `retracted` note ends its item.
   - It refuses a note that fails their schema, one that also carries
     `starcom_intel`, and content that starts with `{` or `[`.
   - The publisher list lives beside the relay list in
     `publicInfrastructure.ts`.
   - Their live CFSRE note is the first test vector.
2. **The mode.** `RaverWatch` is added in the nine places, with the left rail's
   branch fixed.
   - The four later layers are listed as `implemented: false`, so `listLayers`
     says they are not built rather than showing them empty.
   - A new test holds the contract's layer list equal to `LAYER_CATALOG`.
3. **The two layers.**
   - DrugCheckAlerts: glow for red, ring for amber.
   - SceneIncidents: its marks say its category.
   - A per-point opacity is added to the shared screen-point shader, so an item
     fades as `valid_until` nears. Every layer's capture is looked at again.
   - Region alerts are drawn as faint outlines, with US state outlines added.
   - Each layer states its source and the data's age in the key (step 11).
   - They share no colour family that already means something (the channel
     audit).
   - Every card names the source, the date and where the item applies.
4. **The share handle, v8.**
   - `listLayers` gives category `RaverWatch`.
   - `listReports` includes Raver Watch items, each with its layer, its
     `30023:<pubkey>:<d>` id, and its level as `variant`.
   - `frameReports`, `focusReport` and `planReportTour` work on them.
   - `compose` provenance names the items shown and the window.
   - `setTimeWindow` and `getTimeWindow` as decided in RW7.
   - The framing floor holds.
5. **Links.** Deeplink v1 as decided in RW8. `sub=` already works.
6. **Their check, as ours.** A script runs their eight-step driver sequence
   against a preview build. A stand-in relay holds their live note and one
   incident. Phase 1 is done when it composes a card with a live note on each
   layer, which is their own measure.

Phases 2 and 3 are planned when their event feed exists:
- Phase 2: SceneEvents, HeatRisk, and "Tonight", "This weekend" and "Next 7
  days".
- Phase 3: RaverMissions, the pre-event brief card, the weekend tour, and
  HarmReductionSites.

**Asked back, and answered the same day.** Mecha Jono accepted every decision
above, the 0.1° rounding included.
- **Their key** stays `6301c4d0…9692`. A rotation is planned but has no date.
  Jono will send the new key before any Raver Watch note is signed with it.
- **The link grammar.** `v=1` is optional: a link without it is read as v1.
  - `sub`: a layer id, any case; the mode is derived from it.
  - `mode`: must own `sub`, or neither is honoured, as today.
  - `pin`: up to four layer ids, separated by commas. RLSH is never pinned.
  - `at`: `lat,lng` or `lat,lng,alt`. Altitude is in globe radii, clamped to
    1.0–10.0; without it, the current altitude is kept.
  - `focus`: a report id as `listReports()` names it. Intel Reports becomes
    the layer, with `sub` pinned beside it, unless `sub` is a Raver Watch,
    Hero Watch or War & Conflict layer, which draws and features its own
    (Hero Watch's since D-HW step 7; War & Conflict's since 2026-10-11, when a
    War & Conflict card's own link read back as Intel Reports).
  - `win`: `<from>..<until>` in unix seconds.
  - Each parameter stands or falls alone, and an invalid one is ignored.
  - The link is read once, after `whenReady()`, and never written back. It
    is applied as layer, pins, camera, window, then focus (waiting up to 90
    s for the report).
  - Their schema of what a link parses to, and 21 vectors their parser
    passes, are in [`raver-watch/`](raver-watch/). Step 5 runs every vector
    against Starcom's parser.
- **Withdrawal** is `["t", "retracted"]` at the same `d`, newer. It keeps
  `raver_watch` and its sub-layer tag, may carry a `reason`, sets
  `valid_until` to the moment of withdrawal, and has no place tags.
- **`jurisdiction`** is a lower-case ISO country code, or `us-xx` for a US
  state. They will say before sending any other subdivision.

**Three requests from their original link proposal,** which never reached us
before:
- Never pin or focus RLSH from a link.
- Clamp a link's altitude to at least 1.0.
- `compose()` returns its view's link as `provenance.link`, so every card
  carries its own address.

The first two are part of the grammar. The third is taken as part of RW8
(reversible): a builder that writes the grammar is the parser's inverse, and a
card already carries its camera and featured report.

Files kept from their pages, for the tests to read, in
[`raver-watch/`](raver-watch/):
- `raver_watch_v1.schema.json`: their note schema.
- `raver_watch_note.cfsre.example.json`: their live CFSRE note, step 1's
  first vector.
- `raver_watch_withdrawal.example.json`: a withdrawal.
- `deeplink_v1.schema.json` and `deeplink_v1_vectors.json`: the grammar.

**Steps 1 to 3, built 2026-09-29.**
- **The reader** (`services/raverWatch/raverWatch.ts`) opens The Record only while
  one of the mode's layers is on. The publisher list sits beside the relay list, and
  the relay is read through `raverWatchRelays()`.
  - A note from any other key is dropped, even if a relay sends it.
  - Places are rounded to 0.1° as they are read, so nothing finer reaches the globe.
  - Its first vector is their CFSRE note. That note is no longer live: its
    `valid_until` was 7 June.
- **The mode** is in all nine places, and the left rail no longer saves Raver Watch as
  EcoNatural. RLSH is never active in this mode, even when pinned. Its accent is
  violet, which no other mode uses.
  - The share handle offers only the layers its contract lists. The six join it
    with v8, beside the time window, as promised; until then an agent reading v7 is
    never handed a layer v7 does not name.
- **The layers draw glyph sprites** through the builder Intel Reports uses, now
  shared as `buildGlyphSprites`.
  - The level is the backing: red a glow, amber a ring, info a disc edged in
    violet.
  - The glyph says what the item is: the lab's flask for a drug-check alert, and for
    an incident one of drugs, heat, crowd, violence, closure or other. The glyphs are
    Lucide's (ISC).
  - An item fades over the last week before its end, or the last quarter of a
    shorter one, and is hidden after it. With a window chosen on the timeline, an
    item is drawn if it applied at any time in the window.
- **A country an item applies to is outlined in violet, not in its level's colour.**
  - The first capture outlined Spain in red, beside a key that reads red lines on
    borders as disputed (section 8).
  - Violet cannot be read that way, and the key names each outlined country with its
    level ("Spain: level red"), since a line takes no hover.
- **Each layer's feed is dated by when The Record answered,** not by its newest note.
  - These are claims about a period, and an alert posted yesterday that runs for
    six weeks is not stale an hour later.
  - Each item's own dates are in its hover. What is not drawn is counted in the
    feed's name: ended, not begun, a region with no outline here, or no place at all.

Checked on the production build against Mecha Jono's four live notes, read from The
Record once and served from a stand-in:
- a red flask glowing over Vienna;
- Spain outlined in violet;
- a key saying that one alert, "Alerta en Europa", names no place.

Scene incidents' one live note (the California drug-testing law) names no place
either, so it draws nothing, and its key says so. Both are data for Mecha Jono: the
first names no region, and the second could carry `us-ca`, which will draw once US
state outlines land.

**US state outlines, the rest of step 3 (RW4), 2026-09-29.** An item about a state
(`us-tx`) is outlined as that state, never widened to its country. The outlines
are Natural Earth's public-domain admin-1 set at 1:50m, cut to the 50 states and DC
by `scripts/build-us-states.mjs` (194 KB), and served by Starcom as
`geopolitical/us-states-50m.geojson`. Its digest is in `geopolitical/manifest.json`,
and a test holds the two equal. The file is fetched only once an item names a
state. The production build serves it byte for byte. No state alert is live, so the
outline is covered by tests and not yet by a capture; it draws through the same
path as Spain's.

**Step 4, the share handle v8, 2026-09-29.** Raver Watch's six layers join the
contract's roster, and a test now holds the roster equal to the layer catalogue.
- `listReports` lists Raver Watch items: `layer`, the address as id, the level as
  `variant`, and time basis `applies`.
  - A point is given to 0.1°. An item about a region stands at the middle of the
    region's largest part (the peninsula, not the Canaries), with the region's
    reach as its `precisionM`.
  - `frameReports`, `focusReport` and `planReportTour` work on them. A featured
    item is drawn larger and the rest fainter, and its card names the level, the
    source, the dates and where it applies.
- `setTimeWindow({ from, until })` moves the app's shared window and resolves
  once it has moved; `null` returns to live. `getTimeWindow()` reads it.
- A card's provenance (schema 10) carries `link`, its view as a deeplink v1 that
  reads back as the view, plus `window` and `raverWatchItems`.

The published contract is regenerated at build. Checked on the production build
against Mecha Jono's live notes, driven through the handle:
- both drawn alerts listed;
- framed together at the floor, and toured;
- the Vienna alert featured on a card whose link reads back as its view;
- January 2025 set as the window, which listed no alerts, and live again, which
  listed both.

The interchange note for the handle had said "current version 2" since v3. It now
points at the deployed contract and lists what each version added.

**Step 5, links, 2026-09-29.** Deeplink v1 is read and applied.
- The parser and its builder (`src/context/deeplinkV1.ts`) pass all 21 of Mecha
  Jono's vectors, and each vector reads back after being written.
- `?sub=` and `?mode=` still choose the layer as the app starts. The rest is
  applied once the globe is ready, by `useApplyDeeplink`, through the share handle,
  with the calls their grammar names for each part, in its order:
  1. `setLayer(sub, { pin: false, clearOtherPins: true })`;
  2. `pinLayers`;
  3. `setView`;
  4. `setTimeWindow`;
  5. for the featured report, `frameReports` then `focusReport`, once it is drawn
     (waited for up to 90 s), since focus overrides the camera.
- Each part stands or falls alone. The link is read once and never written back.

Checked on the production build: a link naming Drug-check alerts, a Space Weather
pin (and an RLSH one, refused), a camera over Vienna, the alert's own window and
the alert itself.
- All of it took, and the alert was framed at the floor, still standing 20 s later.
- A card made from that view carried a link naming the same view.

**Step 6, their check as ours, 2026-09-29.** `scripts/check-raver-watch.mjs` runs
Mecha Jono's eight checks for each layer through the share handle, against a
preview build.
- The Record is answered from their real signed notes as it held them that day
  (`raver-watch/raver_watch_live_2026-09-29.json`). Nothing else leaves the machine.
- The timeline is set to a window inside every note's validity, so the check
  outlives the notes.
- Each mark now names its own layer, so `describeView` counts it under
  Drug-check alerts rather than under the mode.

Result: **Drug-check alerts passes all eight.** It composes wide, square and
portrait cards naming its notes, and records clips with both end cards.

**Scene incidents stops at check 4**, and the gap is in the data, not in Starcom.
Its one live note, the California drug-testing law, names no place. By their own
measure (a card with a live note on each layer), Phase 1 is done once they publish
an incident with a place: a point, or `jurisdiction` such as `us-ca`, which draws
as that state.

**v1.1, read and drawn, 2026-10-01.** Mecha Jono answered Starcom's twelve questions
(`raver-watch/RAVER_WATCH_V1_1.md`, with its schema and seven vectors). The owner
decided the rest that day:
- RW9: show an event from seven days before it starts, as they suggested.
- RW10: parse ISO 3166-2 subdivisions, falling back to the country.
- RW11: list what cannot be drawn, and outline Europe for a Europe-wide warning.

What Starcom now reads:
- Scene events, as NIP-52 calendar events (kind 31923, id `31923:<pubkey>:<d>`),
  with their own `start`, `end`, `start_tzid`, town and up to three genres.
- `status: cancelled`, kept and struck through until the event's end. A withdrawal
  still ends an item.
- `g`, a geohash, used when there is no `geo`.
- `geo_precision` `city` or `state`.
- `region: europe`.
- Any lower-case ISO 3166-2 code. A US state waits for its own outline rather than
  flashing the whole country; any other subdivision is outlined as its country.
- Items are sorted by `valid_from`, newest first, as they asked.

What the globe does with it:
- **Scene events** (now built) are drawn at their town from a week before they
  start until they end, faint until they begin. A town's events share one mark,
  whose hover names the soonest five. A town whose events are all called off is
  struck through and drawn beneath a live one. With a window chosen, an event shows
  when its own night overlaps the window.
- **A state-precision point** has a faint ring round it, so it reads as an area,
  not a venue.
- **Policy news** is not drawn.
- **A new docked panel** (`RaverWatchPanel`):
  - sets the shared window to Tonight (the next 12 hours, as their card counts it),
    This weekend (Friday 18:00 to Monday 06:00 where the viewer is) or the next 7
    days, and back to Live;
  - lists what names no place, a region not outlined here, or all of Europe;
  - lists policy news apart.

Checked on a scratch build trusting one throwaway test key, never committed, with
their vectors signed by it and moved to now:
- San Francisco's two events made one mark, and Oakland's showed as called off.
- An event ten days out was not drawn.
- Tonight held only tonight's event; the next 7 days added tomorrow's.
- Europe was outlined, and Sydney's state-wide warning had its ring.
- The panel listed the Europe-wide warning and the policy news.
- The key's line for scene events and the drawing order were fixed after this
  check, and are covered by tests.

The production build, against The Record's real notes read-only:
- Vienna and Madrid were drawn.
- Two notes with no place were listed, where before they were only counted.
- Scene events stays empty until their feed starts.

**What they asked back, and the answer to send:**
1. ISO 3166-2: yes.
2. Ready for the event feed: yes, once this is deployed.
3. Their withdrawal vector shares its `created_at` with the note it withdraws. Under
   NIP-01's tie rule the lower id wins, so a withdrawal should be signed at least a
   second later.

**v1.2, read and drawn, 2026-10-02.** Mecha Jono's update went live on The Record
that day: the scene-event feed (about 1,000 events, 14 days ahead), public venues
named, HeatRisk, and two lab sources. Their text and nine vectors replace the v1.1
copies in `raver-watch/`; they kept the v1.1 file names. The owner decided:
- RW12: a scene event at a public venue is drawn at the venue, to 0.001° (about the
  150 m they state), and names it with its address. This amends RW3 for that case
  only: the note must be a scene event that says `geo_precision: venue` and names
  the venue. Every other point stays at 0.1°, and the share handle still hands
  every position out at 0.1°, so no link carries a venue's point.
- RW13: field missions. `weekend_harm_reduction` and `heat_relief` go on the
  RaverMissions layer. Every field mission is listed in the Missions app, and placed
  ones (naloxone, by state) are drawn too. Built in block H.
- RW14: `whenReady({ address })` and `renderBatch` ship now, ahead of the rest of
  share handle v9. Contract v9 says which parts exist.

What Starcom now reads:
- `geo_precision: venue`, with `venue` and `license`, on a scene event.
- `heat_risk`, the NWS level 0–4, on a HeatRisk note. Anything else is dropped,
  and the note is kept.

What the globe does with it:
- **A public venue** is its own mark, apart from its town's. The hover gives the
  address and credits "OpenStreetMap contributors, ODbL", once per mark.
- **HeatRisk** (now built) is the thermometer at the town, red from level 3 and
  amber at 2. The hover says, for example, "NWS HeatRisk Orange (2 of 4)" and when
  it ends, to the hour.
  - They send a note per town per day, and each stands from when it was sent. So
    Miami's Friday, Saturday and Sunday stood at once, three marks on one spot.
  - A town's days now share one mark at the worst level, and its hover lists each
    day, soonest first. The key names only the levels drawn.
- **Genres** read as words: "drum and bass".
- **The key** says "one mark a town, or a public venue", never "never the venue".
- **A card** about a venue's event names the venue and its address in words and
  credits OpenStreetMap. A card about HeatRisk names the NWS level.

Share handle v9 (partial):
- `whenReady({ address })` waits until that item is drawn, as well as capturable.
  Every not-ready answer says why (`reason`).
- `renderBatch(requests, { timeoutMs })` makes cards in order. For each request it
  sets the layers and the window, waits for the item, frames it no lower than one
  globe radius, features it, and composes, with one retry on a blank frame. Each
  result says what failed and why, and nothing stays featured after the batch.
- An `area` is refused with its reason, and a `template` makes the default card
  with a note: frameArea and the templates are not built yet.
- An address matches what `listReports` lists. Raver Watch items are listed by
  their address; Intel Reports are not yet, which `focusEvent` brings in block H.

Checked on the production build against The Record's real notes, read-only:
- 116 scene-event marks and 47 HeatRisk marks (before the grouping above), with
  every listed position at 0.1°.
- A venue's hover ("Terminal West, Atlanta, GA … Venue and address: OpenStreetMap
  contributors, ODbL") and no genre with an underscore.
- `whenReady` with a venue event's address was ready in 2.2 s. With an address not
  drawn, it said so after its timeout.
- `renderBatch` made a square card for a Toronto venue event and a wide one for
  Long Beach's HeatRisk, each with its link at 0.1° (`at=43.7,-79.3,1`). It refused
  the area and the missing address with their reasons. Nothing was featured after.

What to tell them:
1. A Canadian venue's `location` reads "History, 1663 Queen Street East, Toronto,
   Toronto, 08": the town twice and a numeric province code.
2. HeatRisk's `valid_from` is when the note was sent, so a note about next
   Wednesday applies now. Its day's own start would let a reader show each day when
   it comes.

Checking where it stands:

```sh
grep -n "RaverWatch" src/components/Globe/Hooks/useGlobeLayerControl.ts   # the mode's layers
grep -n "raver_watch" src/services -r | grep -v __tests__                 # the reader
node -e "console.log(require('./public/.well-known/starcom-share-contract.json').version)"  # 9 since v1.2
grep -n "KINDS = " src/services/raverWatch/raverWatch.ts                  # 30023 and 31923 since v1.1
grep -n "DRAWN_LAYERS: " src/components/Globe/Hooks/useGlobeRaverWatch.ts   # four drawn since v1.2
```

### 20. War & Conflict: Mecha Jono's war news over the world's wars (2026-10-02)

Mecha Jono's Interchange 3.4 and 3.5 (2 October) parse the day's war news item by
item and add a map of the world's wars. The operator called it the highest-value
build on their handoff page. Their vectors, the vocabulary's conflict section and
the first day's real notes are kept in `war-conflict/`. The owner decided, the same
day:
- WC1: build the layer and the war map now, in block F's free weeks; the brief view
  comes in D.
- WC2: a new layer under GeoPolitical, beside Conflict Zones, which stays as it is
  until K12.
- WC3: the daily brief is a docked panel on the globe (block D). Picking a theatre
  lights up its war and its events.
- WC4: an item that names only a country is one mark at the country's centre,
  shared by that country's items. Its hover says they are about the country as a
  whole.

WC4 departs from their rule ("a note with only a jurisdiction is drawn as that
region's outline") and from this app's own intake, which gives such a report no
point. It was chosen because 47 of the first day's 57 items named only a country,
an outline has no hover, and every line colour here already means something.

What Starcom reads (`services/warConflict/`), kind 30023 from named publishers
only (`WAR_CONFLICT_PUBLISHERS`), from The Record:
- **An item** (`t=conflict_desk`): its theatre, up to three things that happened,
  each casualty claim, the forces and states named (never a person), its place, a
  point at 0.1° (from `geo`, or the geohash), its precision, its country, its
  role, and `valid_until` for a warning.
- **A war** (`t=war_map`): its tier, its countries, its deaths by year as the list
  writes them, its sub-conflicts and theatres. The index (`war_map_index`) is
  refused: it lists wars and is not one.
- The newest note at an address stands. A withdrawal ends its item, as it does a
  second copy withdrawn as a duplicate.

What the globe draws (`useGlobeWarConflict`):
- **Items** stand for three days from when Mecha Jono reported them, fading
  through the last quarter. A warning stands until its `valid_until`. With a
  window chosen, an item stands when it was reported inside it.
  - The glyph is what happened: twelve of Lucide's, from a strike to an internet
    shutdown.
  - The backing is the most serious thing about it: a critical warning glows in
    the token set's danger red and moves; a line that reports deaths is ringed in
    it; any other report is a quiet grey disc.
  - A point that stands for a province has a faint ring.
  - The hover gives each casualty claim apart and says they are not added.
- **The war map** fills each war's countries in the severity ramp from
  `tokens.ts`, a country in two wars by the higher tier. No colour literal was
  added.
  - The fills sit between the clouds and the borders. At the base map's height
    the clouds veiled them, and a disputed border must still read across a war.
  - At one opacity the list's country lists turned Russia and North Africa into
    one wash. Opacity now falls with the tier too (0.36 down to 0.15).
- **The key** names each backing drawn, the glyphs drawn, and each tier with how
  many wars of it are on the list. A tier's swatch is a filled square, a new
  `area` swatch shape in the key and on the card.
- **Drawn once.** Their notes carry `t=starcom_intel` too, which Intel Reports
  reads. While War & Conflict is on, Intel Reports leaves them out, both pins and
  region marks.
- **Share contract v10:** the layer joins `layers`, and `listReports` lists its
  items at their point or their country's centre, with the backing as `variant`.
  Wars are not listed: framing a war's countries waits on `frameArea` (block H).

Found while building it:
- `GeometryFactory` caches a fill by id and shape, and a cached fill keeps the
  colour and opacity it was first built in. A country whose war changed tier
  would have kept its old shading. The war map's fills now use ids of their own
  and their tier's, and are rebuilt only when the wars or the outlines change.
- The Raver Watch rail still offered only two of its layers. Scene events and
  HeatRisk are on it now.

Checked on the production build against The Record's real notes, read-only:
- 52 items listed and drawn as 31 marks.
- The key counted 8 major wars, 13 minor, 15 conflicts and 12 skirmishes.
- With Intel Reports pinned beside it, none of their notes was drawn twice.
- A card about the Pakistani airstrike gave "22 killed; 9 killed (separate claims,
  not added)".

Checking where it stands:

```sh
grep -n "WarConflict" src/components/Globe/Hooks/useGlobeLayerControl.ts        # the layer
grep -n "'#t'" src/services/warConflict/warConflict.ts                         # what is read
node -e "console.log(require('./public/.well-known/starcom-share-contract.json').version)"  # 10 since War & Conflict
grep -n "TIER_OPACITY\|FILL_ELEVATION =" src/components/Globe/Hooks/useGlobeWarConflict.ts
```

### 21. Imaging: one shot for the screen, the link, the card and the clip (planned 2026-10-02)

Decided the day War & Conflict was built (IM1–IM8 in the decisions record). Mecha
Jono now posts every desk to Discord and The Record and wants a picture with each:
critical and actionable intel, mission packages, field missions, Raver Watch and
the daily War & Conflict Brief. Its card templates and its v9 proposal, as
Interchange 3.5 carries them, are kept in `imaging/`.

**What the first War & Conflict card showed** (a wide card of the Pakistani
airstrike, rendered on SwiftShader on 2026-10-02):
- The key's sentence listing every glyph made the text block taller than the
  picture: 1,520 px of card for a 628 px image.
- Every country of a major war, Russia included, was washed red across its whole
  area. The item the card was about sat in one small country inside that wash.
- A city, a venue or a heat town is a dot from one globe radius, the floor every
  framing keeps.

**The shot (IM1).** One declarative description of one picture drives the screen,
the link, the card and the clip, so what a person sees and what is posted are the
same picture:

| Part | What it says |
|---|---|
| subject | an address, a theatre, an area or a mission |
| framing | fit, padding, offset; a tilt that keeps the altitude floor |
| emphasis | the featured item; the others dimmed, or a spotlight |
| layers | which are on, and each one's opacity |
| time | a window, or a moment, with the sun at that moment |
| style | callouts on or off, clouds, atmosphere |
| card | template, preset, the reader's time zone, an optional QR code |
| output | format, quality, size limit, scale, alt text |

- `planShot(shot)` is a dry run. It says what would be in frame (describeView),
  returns the linter's warnings, and estimates the render time, so a render is not
  wasted on a Jetson.
- `renderShot(shot)` returns the card, its alt text, the shot as normalised, and its
  warnings.
- The guardrails are not fields and cannot be overridden: the altitude floor, no
  RLSH, no person named, no coordinate in a link finer than 0.01°, every caveat that
  applies, and the provenance.
- Every card carries its shot in its provenance, and deeplink v2 opens it, so any
  image can be made again and any person can open its view.
- `focusEvent`, `composeFor`, `frameArea` and `layersFor`, from Mecha Jono's v9
  proposal, are thin wrappers over a shot.
- Capture mode (`?capture=1`): no idle motion, a fixed pixel ratio, the sun at the
  shot's moment, a fixed layer order.

**Cards.** One anatomy for every template: a badge, a headline that reads at
Discord's 400 px preview, the globe, fact rows (what, where, when, who claims), a
caveat strip, and a footer with the link. A card's key names only what is in frame,
in short form. Mecha Jono's nine templates, in our tokens (IM5):

| Their template | Badge | What it frames |
|---|---|---|
| critical_intel | CRITICAL INTEL, danger red | the item, its category's layers |
| actionable_intel | ACTIONABLE INTEL, caution amber | the item |
| context_report | none | the item |
| mission_package | MISSION, gunmetal with the mission glyph | renderMission |
| field_mission | FIELD MISSION, gunmetal with its glyph | the area, its category's layers |
| conflict_brief | WAR & CONFLICT BRIEF, gunmetal | a tour of the day's items, or a front page |
| hazard | as today | as today |
| raver_alert | RAVER WATCH, the mode's violet | the alert's place |
| declassified | DECLASSIFIED, gunmetal | no globe: a card of type alone |

Sizes: wide, square and portrait as now, their 1280×800, and a composed 9:16
(IM6) with the globe low and a title band above, for clips and stills.

**Close-ups (IM2).** The globe stays at one radius or above, as the locator. A 2D
inset beside it draws the item's own geometry with a scale bar: a mission's area
and its objectives no finer than 1 km, a public venue, a heat town. It uses no map
tiles and makes no network request. It is drawn only for what its own rules allow,
never for an Intel Report, whose place can be a filing address. This settles the
framing floor that section 18, item 4.1 left open.

**Trust and reach.**
- A linter's warnings come back with every card: marks under the key, the featured
  item near an edge, text cut short, callouts colliding, an empty frame, a file over
  8 MB.
- Alt text is written from the same facts the card states.
- The provenance is written into the image file, so a copy can be traced to the
  view that made it.
- Golden cards are rendered from the kept real notes and compared, one at a time, as
  the machine allows; a contact sheet shows every template at every size.

**Viewing experiences (IM3, block G; IM8 sets the order).**
1. Briefing playlists: a Situation Room mode that tours the day's brief, tonight's
   raves or the heat watch, with captions. These are the auto-tour, and the same
   shots render Mecha Jono's clip.
2. The theatre lens and war depth:
   - pick a war, and the rest dims;
   - tier hatching, a cue beyond colour and opacity that the quality governor can
     drop;
   - an arc where a line names a state's force acting in another country, labelled
     as the line's own reading;
   - deaths by year as a sparkline, this year's pace marked as an estimate;
   - a brief calendar on the timeline, from the daily briefs kept on The Record;
   - a front-page card of four theatres.

   It starts with the whole-country wash, whose fix is decided then.
3. Raver nights: each event lighting up at its local start as the day/night line
   passes over it, a heat halo on events under HeatRisk, and a "tonight" card.

**Item 1, the shot, built 2026-10-02 (contract v11, capture schema 11).**
- `shotSpec.ts` reads a shot. An unknown field is refused, so a misspelt key never
  silently does nothing. A field not built yet is refused when it would change
  what the picture shows (a theatre, an area or a mission as the subject; a
  moment in time), and dropped with a note when it changes only how it looks.
  `SHOT_FIELDS`, published in the contract, names each field as built or not.
- `shotStage.ts` stages a shot through the handle's own operations, in one order:
  layers, time, look; then it waits for the subject, frames it and features it.
  What a shot does not state is left as the page has it, and the shot returned
  states everything as drawn.
- `planShot` is the dry run: staged, described per layer, warned of a layer that
  draws nothing in the picture, and nothing composed. It reports how long the
  last card on the page took.
- `renderShot` composes with the shot's type and quality, tries a blank frame
  once more, and meets `output.maxBytes` by lowering the quality, or refuses a
  PNG, which has none.
- `renderBatch` takes shots as well as v9 requests, read as the same shot. Each
  card's provenance carries its shot (`provenance.shot`).

**The rest of item 1, built 2026-10-02 (contract v12).**
- **Deeplink v2** adds the globe's look: `look=<skin>,<light>,<nightFill>`, each
  part read alone. A link says `v=2` only when it states a look, so every v1
  link reads and is written as before; their 21 vectors still pass.
  - A card's link carries the look whenever it is not the default.
  - A link's look is applied for the visit and not saved: opening someone's link
    must not change the choice a visitor saved.
- **`layersFor(category)`** gives Starcom's layers for one of Mecha Jono's
  categories, as their v9 proposal asked: their suggestions, except that conflict
  items draw on War & Conflict and placeless categories get none. A kind it does
  not know falls back to its group.
- **Two wrappers wait until they can keep their promise:**
  - `composeFor` exists to apply a card template, so it comes with item 3.
  - `focusEvent` must frame any family's event and pin its category's layers. It
    comes with the Interchange ingest, when `listReports` carries categories.
- Checked on the production build: a `look=,headlamp` link lit the globe from the
  camera and saved nothing; a card from it carried a v2 link with its look.

**What the first shots showed** (the production build, The Record's real notes,
SwiftShader, 2026-10-02):
- A card stages in about 1.1–2.3 s and composes in about 0.75–0.9 s.
- A WebP limit of 120 KB could not be met even at quality 0.49, and was refused
  with that reason. Cards run about 1.1–1.4 MB as PNG, far under Mecha Jono's
  8 MB.
- **A "square" card came out 1080×1920, and a portrait one 1080×2270.** Two
  causes:
  - The disclosure text below the picture is as tall as the picture: the full
    key, and every caveat. Item 3 addresses this.
  - The headless page's canvas is landscape, so a square or portrait crop cannot
    be filled. The globe sat in a band about 700 px tall inside a 1080 px
    square, with empty space above and below. Capture mode (item 2) must render
    the frame at the card's own aspect.

**Item 2, a card's own frame, built 2026-10-02 (contract v13).** The cause of the
1080×1920 "square" card was in compose, not the browser:
- Compose captured the canvas and cut the card from it. Its crop was the planet's
  padded outline at the card's shape, clamped to the canvas. At the one-radius
  floor the planet is taller than the canvas, so a square box of about 1,092 px
  was clamped to 708, leaving empty bands, and the cut was upscaled into the card.
- Two intentions in the code disagreed there. The framing maths assumes the card
  is the middle of the frame at its own shape; compose's helpers never clip the
  planet. Both are legitimate pictures.

Now:
- `captureGlobeFrame` takes a `view`: a window of the current view, rendered
  through the camera's view offset at the size asked, with the camera's aspect
  kept, so the window is exact even where it reaches past the canvas.
- Compose measures the card's window first, then renders exactly it at the
  card's own resolution: the frame is the card's picture, drawn whole.
- `fit` chooses the window: `view`, the padded planet where it fits in the
  canvas, else the largest window of the card's shape that does; or `planet`,
  the whole padded planet. `describeView` counts marks in the same window, so a
  dry run describes the card's picture.
- IM9, the owner's choice from the comparison page: a card about one item shows
  the view, and a card about none shows the planet. Any shot can ask for the
  other with `framing.fit`.

Checked on the production build: wide, square and portrait cards of the Pakistani
airstrike in both fits, each frame exactly its picture (1200×628, 1080×1080,
1080×1350), composed in 1.6–2.2 s on SwiftShader. The defaults held: an item shot
framed the view, and a camera view the planet. The planet-fit card over Africa is
the war map at its loudest, North Africa almost wholly shaded: the case the
war-depth work in G starts from.

**Item 3, step one: the card's anatomy, built 2026-10-02 (capture schema 12).**
The owner chose IM10–IM13 from the comparison page. The card, top to bottom:
- **The picture**, then **a headline band** under it (IM10). The headline is the
  featured item's title, else the layers the card shows, else "The globe". It is
  set at 42 px for the 400 px preview a feed shrinks a card to, and shortened at a
  word past three lines; the full title stays in the provenance. The item's facts
  follow.
- **The key** names only the layers drawing in the card's window (IM12), each by
  name and swatches, without the sentences the app's key carries.
  - `keyedLayers` decides it: marks are counted in the window, and a layer that
    draws fills or lines is keyed whenever it draws. War & Conflict is why: its
    war map can fill the picture with none of its items in it, and a key missing
    a colour in the picture is worse than one naming a colour it lacks.
- **Every caveat that applies**, each in one short sentence, small and muted
  (IM11).
  - `caveatsShort` (schema 12) pairs them one for one with `caveats`, which keeps
    the full wording. A feed can give a `shortName` and a `noteShort`.
  - A provenance without short forms, or with lists that do not pair, prints the
    full wording.
  - Muted rather than amber: most caveats are not cautions.
- **A footer**, the quietest line: the product, the moment, the camera and the
  look, the analysis marks when there are any, and the build, with a "+" when
  the tree was dirty.
- The colours are gunmetal from the token set (IM5), and there is no QR code
  unless a shot asks (IM13; `card.qr` is still noted, not built).

Checked on the production build:
- The Pakistani airstrike, square (1080×1677) and wide (1200×1225).
- The planet over Africa with nothing featured (1080×1465), headed "War & Conflict".
- A Long Beach scene event, portrait (1080×1873), whose key named only Borders
  and Scene events.

The picture is exactly the preset's shape in each; the text band under it is
385–597 px.

**Item 3, step two: Mecha Jono's templates, built 2026-10-02 (contract v14,
capture schema 13).** The owner decided IM14–IM17 first.
- **`cardTemplates.ts`** holds their nine templates. Each has a badge in a colour
  that already means it (IM5):
  - critical intel in danger red, actionable intel in caution amber;
  - Raver Watch in its own violet, now its own module (`raverWatchColor.ts`);
  - gunmetal with a glyph for the rest.

  `mission_package`, `field_mission`, `conflict_brief` and `declassified` are
  refused with what will build them.
- **The item decides its badge where it says what it is (IM14).**
  - A War & Conflict item's role picks the template (`listReports` now gives it
    as `role`), and a Raver Watch item is `raver_alert`. A shot asking for another
    is refused before the camera moves.
  - The share button's card of such an item carries the same badge.
  - Where the item does not say, as an Intel Report does not yet, the shot's
    template sets the badge. The provenance's `card` says the shot chose it, and
    a caveat says the badge was not checked.
- The badge opens the band under the picture, above the headline.
- `embed` is Discord's 1280×800 (IM15); `wide` stays the 1200×630 link preview.
- **`composeFor(address, { template, preset, scale, timeoutMs })`** is a shot of
  one item. It returns what `compose` returns, or throws why there is no card.

Checked on the production build with The Record's real notes:
- 72 War & Conflict items listed their role: 71 context, 1 critical.
- The critical one, an EASA bulletin for Saudi Arabia's airspace, carried CRITICAL
  INTEL chosen by the item, wide and through `composeFor` at `embed` (a picture of
  exactly 1280×800).
- A context item's card had no badge, and a Long Beach scene event's carried RAVER
  WATCH.
- Asking for `actionable_intel` on the critical item was refused with the reason.

No Intel Report was drawn with public relays blocked, so the shot-chosen badge is
covered by tests only.

**Item 3, step three: the War & Conflict Brief's front page, built 2026-10-02
(contract v15, capture schema 14; IM16).**
- **A shot's subject can be `{ brief: 'latest' | 'YYYY-MM-DD' }`.**
  - The brief draws War & Conflict; other layers can be pinned beside it, not put
    in its place.
  - It waits until War & Conflict has finished loading, not for its first note:
    notes arrive one by one, and a front page counting the first would say
    "1 item" of a day with twenty.
  - The camera centres on the day's drawn items at 2.5 radii, and the card shows
    the whole planet.
  - The shot comes back with the day it drew, so it makes the same front page
    again.
- **`warConflictBrief.ts` counts one UTC day.** Each theatre gets its count and
  the worse tier of the wars that list it, grouped by tier, worst first, in the
  war map key's words ("Major wars: …"). Those on no war's list follow. The items
  naming no war are counted apart, never dropped.
- **The card** is headed "War & Conflict Brief" and the date, under the gunmetal
  badge with War & Conflict's newspaper glyph, drawn in straight strokes.
  - Its provenance carries `frontPage` (schema 14) and `card.chosenBy: subject`.
    A front page's badge is what its subject is, not a claim about an item, so no
    caveat follows it.
  - A no-break space holds each theatre to its count when a line wraps.

Checked on the production build, starting from Scene Events:
- `{ brief: 'latest' }` turned War & Conflict on and drew 3 Oct 2026: 24 items.
- Four major wars, two minor, one conflict, and 13 naming no war.
- The dry run counted 39 of 45 marks in the picture.
- Wide and square cards were each staged in about 1.1–1.3 s and composed in about
  1.6 s.
- A day with nothing was refused: "No War & Conflict items were read for
  2026-01-01 (UTC)."

**Item 3, step four: the composed 9:16, built 2026-10-03 (contract v16; IM6,
IM18).** The `story` preset is a fixed 1080×1920.
- **The badge and headline sit above the picture; the facts, key, caveats and
  footer below.** The picture takes what the text leaves. The layout lays the
  title band out first, then the rest under a picture of no height, and moves
  the rest down by the picture's height once that is known.
- **The floor is 4:3** (810 px on 1080). A card with more to say than a 9:16
  holds is refused for the portrait card: never a cut caveat, never a sliver of
  planet.
- **`planCardPicture` measures a card's picture before anything is captured**:
  its window, its height and what its key names. For a composed card it measures
  the text with the key of the window it starts at, then of the window that
  height gives, keying both. `describeView` plans with the same measure, so a dry
  run of a 9:16 counts the marks in its picture, and a plan that cannot be made
  is a refusal, not a thrown error.
- **The type is larger than the band cards'**, as a vertical card is read
  full-screen on a phone at about a third of its size: headline 48 px at most
  two lines, body 24, caveats 20, footer 18. My first sizes (60/30, three-line
  headlines) left two of three real cards under the floor. The owner chose these
  from two options rendered on three real cards (IM18; the comparison page is
  claude.ai/artifact/RZjQgaCGjzFmv6Yjw41aRC, private).

Checked on the production build: the critical EASA item, the 3 Oct brief and a
Long Beach scene event all composed at 1080×1920, their pictures 1,122, 1,114
and 1,150 px tall, each composed in about 1.7–2.0 s. The dry run of the item
counted 29 of 45 War & Conflict marks in its 9:16 picture.

**Item 6 went first** (IM19, 2026-10-03): the shot spec draft and the four asks
were posted as one comment on Mecha Jono's handoff doc, after the owner
approved the text. Item 5 follows, then item 4, whose missions wait on ask 3.

**Item 5, step one: alt text and warnings on every card (contract v17).**
- **`alt`** is what a screen reader says for a card, written from what the card
  states (`cardAltText.ts`) and never by the caller. It holds:
  - the badge and the whole headline, which the card may shorten;
  - the facts;
  - what the picture shows: the view or the whole planet, centred where, the
    item marked, and the layers keyed;
  - every caveat, in short;
  - when Starcom made it.

  It stays within 1,500 characters (Mastodon's limit) by dropping facts from the
  end, never a caveat. A shot's `output.alt: false` leaves it off. A title the
  source already cut ends at its ellipsis; Mecha Jono's long ones come that way.
- **`warnings`** come from `cardLint.ts`:
  - a headline or a label shortened to fit;
  - the featured item at the picture's edge;
  - a file over Discord's 8 MB.

  `renderShot` returns them with the plan's (a layer drawing nothing in the
  picture). They are advice: a picture that cannot be described still composes.

Checked on the production build:
- The longest War & Conflict title, the US withdrawal from Iraq, made a wide card
  with both shortening warnings and an 894-character alt text.
- The 3 Oct brief made a 9:16 with none, and a 742-character alt text.
- `compose()` now returns `alt` and `warnings` too.

**Item 5, step two: the record written into the file (contract v18).** A card
saved, forwarded or downloaded carries what it states, so a copy can be traced
to the view that made it without the post around it.
- **`cardFileRecord.ts` writes XMP** in the place each format keeps it: a PNG's
  iTXt chunk `XML:com.adobe.xmp`, right after the header and before the image
  data; a JPEG's APP1 segment, after its JFIF header; a WebP's `XMP ` chunk.
  - A simple WebP is made extended, keeping its alpha.
  - The packet holds the alt text as `dc:description`, Starcom as
    `xmp:CreatorTool`, the moment, and the provenance as JSON in
    `starcom:provenance` (namespace `https://starcom.app/ns/capture/1.0/`).
- **A JPEG segment holds at most 65,502 bytes of XMP.** A record too large for it
  drops its longest lists from the file's copy, largest first, names them in
  `starcom:omitted`, and the card warns; the record returned with the card stays
  whole. If writing fails, the card is still made, with a warning.
- **A card's `mimeType` is the type the browser made**, which is not always the one
  asked for: Safari makes a PNG when asked for a WebP.

Checked on the production build: the critical EASA item as PNG, WebP and JPEG,
and a scene event as JPEG.
- `exiftool -validate` passed all four. It had flagged text after the image data
  in the first PNG, which is why the chunk now comes before it.
- exiftool read back the creator, the moment, the alt text and the provenance JSON
  from each, and `sips` decoded each at full size.
- The WebP kept Chrome's ICC profile beside the new XMP.

**Item 5, step three: capture mode (contract v19; IM20, IM23).** The same shot makes
the same picture. The owner decided four things first:
- `time.at` pauses the timeline there with the sun there (IM20);
- golden references are small copies in the repo (IM21);
- a golden card matches when its text is exact and its picture close (IM22);
- motion is still in every capture (IM23).

What was built:
- **`globe-engine/captureClock.ts`** holds motion still for a capture's own render
  and releases it before the live view draws again. Five things moved:
  - the glyphs' pulse, held at rest;
  - the space-weather shaders, at the phase of the moment;
  - the aurora's pulse, at rest;
  - the clouds, at the moment's drift, fully faded in, and put back after;
  - the sun.
- **The sun.** A paused globe is lit for its paused moment: one cursor (D-E), so
  this holds for a person pausing the timeline too. A capture is lit for its
  still moment at once, because the live light follows the pause a frame or
  more later, through React. The first render after a pause was otherwise lit
  for the moment before: 36% of its pixels differed.
- **A shot's `time.at`** (whole unix seconds) pauses the shared timeline there, as a
  person would; the shot comes back with `{ at }`. A card made while paused is
  stilled at the paused moment, otherwise at the moment it states.
- **A render lets the page settle a frame after staging**, so what follows the last
  change has drawn before the picture.

Checked on the production build, rendering the critical EASA item's card again
and again:
- Two cards a moment apart came out the same, picture for picture. They differed
  only in the footer's capture time (rows 1,647–1,658 of 1,701).
- The same shot at 00:30Z and at 12:00Z differed in 63% of pixels: the sun.
- Getting there found three causes, in this order:
  1. the first capture after a pause lit for the moment before;
  2. a fill that changed a frame after staging (3.4%);
  3. the quality governor, on SwiftShader, switching the atmosphere off between
     renders (the corners).

  The third is the device, not motion, so a golden run pins the quality setting
  (`starcom-globe-quality: low`), as a person can.

**Asked of Mecha Jono with the shot spec draft (IM7):** who made each casualty
claim; a link from a report or package to the war item it is about; how mission
geometry is encoded; and per-theatre changes in each day's brief.

Checking where it stands:

```sh
node -e "const c=require('./public/.well-known/starcom-share-contract.json');console.log(c.version,Object.keys(c.methods??c.contract?.methods??{}).filter(m=>/Shot|focusEvent|composeFor|frameArea|renderMission|layersFor/.test(m)))"
grep -rln "planShot\|renderShot" src/features/globe/capture 2>/dev/null   # the shot, once built
```

**Item 5, step four, first part: a card says where its parts are (contract v20).**
The footer states the capture's moment and the build's sha, so it changes with
every capture and every commit. A golden card compared pixel for pixel would
fail on every commit. A card now returns `regions`, in its own pixels:
- `picture`: where the picture is drawn;
- `footer`: the band its footer is drawn in, edge to edge, around every line of
  it when it wraps.

A comparison of two cards of one shot leaves that band out, and nothing else.
Mecha Jono's driver can use the same field to crop the picture out of a card.

**Item 5, step four: golden cards (IM21, IM22).** `npm run golden:cards -- <url>`
(`scripts/golden-cards.mjs`) draws six shots against their kept copies in
`imaging/golden/`, the list in `shots.json`:
- the critical EASA item, square;
- the War & Conflict Brief of 2 October, wide;
- the whole planet, wide;
- a venue night at a public venue, 9:16;
- a red HeatRisk day in Los Angeles, embed;
- the critical Trimbos alert that the read cap had hidden (section 22), portrait.

How it draws and keeps them:
- **Data.** The Record is answered from the kept notes, as The Record answers
  (500 per filter). Every other relay is answered empty, every publish refused,
  every other request aborted.
- **Moments.** Each shot pins its moment (`time.at`), so a card does not change
  as the notes age. Quality is pinned too.
- **What is kept.** Each card as a 400 px WebP, and what it states as JSON (alt
  text, warnings, the shot as drawn, the whole provenance). About 180 KB of
  pictures and 140 KB of text.
- **Run-specific values set aside.** The capture moment, when each feed was read
  and the origin, wherever they appear. The build, whole, with the caveat a
  dirty tree adds. A first version also replaced the build's date in every
  string, and so rewrote "raver-heat-risk-ca-oakland-2026-10-03"; a bare date is
  content.
- **Match.** What a card states must match exactly. Outside the footer's band,
  at most 0.2% of a card's pixels may differ by more than 48. Between settled
  runs, 0% did (mean deltas 0.5–2.6).
- **Shots.** Each shot is rendered until two renders in a row agree (at most
  five), then compared or kept: the borders take a finer level of detail a few
  seconds after a load, 0.57% of a card's pixels. A card that says a feed it
  draws is still loading is made again.

Checked:
- two runs, and two shots run alone, matched;
- a 24 px block painted on a kept picture (0.42%) was caught;
- so was a changed word in a kept text, named by its path;
- a run that differs writes the card now, the kept copy dimmed with what
  differs in magenta, and what it states now.

**Found by the golden cards, and fixed: `whenReady` said ready before the
planet's skin was drawn.** The Earth's textures are fetched after the first
frame, and until the engine hands over its material react-globe.gl draws its
own dark default. So the first card after a load came out two ways, by when
the textures arrived, and one of them stated "Blue Marble" over a black planet.
`whenReady` now also waits for the surface (`globeSurface.ts`): the engine's
material, and no texture of the skin waiting or loading. A texture that failed
has its stand-in drawn and counts as settled. It says what it waits for:

> the globe's surface was still loading (the planet's material)

With the Blue Marble photograph held back 12 s, `whenReady` said not ready with
that reason, and was ready 20 s after the texture was asked for. The contract's
shape is unchanged. 8 mutations, all killed. The borders' finer detail still
arrives after ready. That is coarser, not wrong, so the harness waits for it and
`whenReady` does not.

```sh
npm run build && npx vite preview --port 5210 --strictPort &
npm run golden:cards -- http://localhost:5210            # compare: 0 match, 1 differ, 2 cannot observe
npm run golden:cards -- http://localhost:5210 --update   # after looking at what changed
```

**Item 5, step five: the contact sheet (IM25, IM26).**
`npm run contact:cards -- <url>` (`scripts/contact-cards.mjs`) draws every
template that can be drawn from the kept notes, at every size, on one sheet:
- the rows are `imaging/contact-sheet.json`'s: critical intel (the EASA
  bulletin), context report (drone strikes in Addis Ababa), the conflict brief
  of 2 October, and a Raver Watch alert (a red heat day in Los Angeles), each
  at wide, square, portrait, embed and 9:16;
- the five templates it cannot draw yet each get a labelled slot, saying why
  and what unblocks it:
  - actionable intel and hazard: no such item in the kept notes;
  - mission package and field mission: block H's ingest;
  - declassified: no-globe cards, IM17.
- It writes `contact-sheet.png`, `index.json` (each card's size, badge, who
  chose it, alt text and warnings) and each card at 480 px. Nothing it makes is
  kept in the repo: the golden cards are the kept references.
- A row that draws another template than its own fails the run.

The golden cards and the sheet share one page, `scripts/card-harness.mjs`:
- the kept notes, as The Record answers them;
- pinned quality;
- each shot rendered until two renders in a row agree.

After the move, the golden cards matched as before.

The first sheet drew all 20 cards, each as its own template. The critical and
context cards carry one or two warnings: a label on the picture shortened to
fit.

**What the sheet showed: Starcom's sizes are not the sizes Mecha Jono posts.**
Their v9 proposal names the outputs they post: 1280×800 (Discord's embed),
1080×1080 and 1080×1350. Starcom's presets take those as the picture, and put
the text band under it, so the cards are taller:

| preset | they post | the card today (build d0aea093) |
|---|---|---|
| embed | 1280×800 | 1280×1271 to 1280×1423 |
| square | 1080×1080 | 1080×1551 to 1080×1703 |
| portrait | 1080×1350 | 1080×1821 to 1080×1973 |
| wide (link preview) | 1200×630 | 1200×1099 to 1200×1251 |

Measured on a clean build. The first run's build had uncommitted changes, and
its caveat added 24 px to every card.

Only the 9:16 is composed to its exact size (IM6, IM18). Section 21's check of
`embed` said "a picture of exactly 1280×800". That was true, and it missed this.
How each size should reach its exact shape goes to the owner (IM27).

**Item 5, step six: every card at its exact size (IM27–IM29, contract v21).**
Each preset now names the whole card: 1200×630, 1080×1080, 1080×1350, 1280×800
and 1080×1920, as `presetSizes` publishes. The picture gives way, never a caveat:
- **Square and portrait** stack like the 9:16: the badge and headline above
  the picture, the facts, key, caveats and footer below, and the picture what
  the text leaves.
- **1280×800 and 1200×630** put the picture on the left, square while the text
  fits in the column beside it, and the text in a column on the right. A
  column that needs more room takes it from the picture, 8 px at a time.
- **Floors.** The picture is never less than 45% of the card's width at square,
  60% at portrait and 75% at the 9:16, or 75% of the height beside a column.
  Below its floor a card is refused with the reason, pointing at the 9:16, which
  has the most room; a card too full for the 9:16 is too full for any size.
- **Framing.** Framing plans for the picture at its floor (`globeAspect`), so an
  item framed in stays in whatever the text leaves.
- **Footer band.** `regions.footer` covers the text's column on a side card.
- **The type** is compact at every size but the 9:16 (IM29: headline, body,
  caveats and footer of 26/15/13/12 at 1200×630, 30/17/14/13 at 1280×800,
  36/19/15/14 square, 40/20/16/15 portrait). One step larger refused three of
  the four real cards at square and the brief at portrait.
- **No size asked** gives 1200×630 (IM28). No preset grows any more.

The code: `layText` lays the text from a column's origin, `besideTheText` finds
the column's width, `pictureSizeFor` gives the picture's size before the capture,
and the capture renders at the picture's own shape.

Checked:
- on the production build, all 20 real cards of the contact sheet drew at
  exactly their sizes, none refused;
- the golden 9:16 matched unchanged, and the other five were updated after
  looking;
- 19 mutations, all killed, one after a test of a side card's key was added.

```sh
node -e "console.log(require('./public/.well-known/starcom-share-contract.json').presetSizes)"
```

**Item 5, step seven: the QR code (IM13, IM30–IM32, contract v22).** A shot's
`card.qr: true` draws a QR code, and nothing else does:
- **What it opens** (IM31): a short link to the view on starcom.app, whatever
  origin drew the card. The place, the altitude and the layers only, for
  example `https://starcom.app/?v=1&sub=WarConflict&at=24.1,44.5,1`. The item's
  address, the window and the look stay in `provenance.link`.
- **How it is encoded** (IM30): `qrcode-generator` 2.0.4 (MIT, no
  dependencies), at error correction M. It is imported only when a card asks,
  and the build puts it in a chunk of its own.
- **Where it sits** (IM32): bottom right, the caveats and the footer wrapping
  beside it. Under the footer alone it cost the square critical card 125 px,
  and the card was refused.
- **How it is drawn**: dark modules on a light square, the card's own ink and
  ground, with four modules of quiet zone inside the square. Each module is a
  whole number of pixels. Its square is 132 px at 1200×630, 150 at 1280×800,
  128 square, 160 portrait and 180 at the 9:16.
- **What the card says of it**: `regions.qr` gives where it is, `provenance.qr`
  what it opens (capture schema 15), and the alt text says a code opens the view.

Checked on the built app with jsQR, an independent decoder: every code decoded
to exactly the link its card states. The 9:16's decoded at half and a third of
full size; the others at full size only, which a phone's screen gives a card
at about a third of its CSS size. The square critical card, already near its
floor, is refused with a code: its text needs 601 px, leaving 479 for the
picture against a floor of 486. Expected to fit on a clean build, which has one
caveat fewer, it did not: the code's own 128 px, not the caveats beside it, set
the corner's height, so the line fewer gained nothing. Refused by the same 7 px
on both. 25 mutations, all killed.

**Golden cards on clean builds only.** A build from a tree with uncommitted
changes says so in a caveat, and that line moves a card's layout, so its picture
is not the one a clean build draws. The harness now compares pictures only on a
clean build and refuses `--update` on a dirty one. So: commit, build, then
update and look. A seventh golden card, `qr-embed`, keeps the QR code.

On a dirty build it compares the words each card states, and not where things
are. It first claimed to compare everything a card states there, which could
never pass once the kept copies came from a clean build: the picture's frame,
the regions and the source rectangle moved 18 to 28 px with that caveat's line.
Found when the clean build's compare listed exactly those, with the capture
schema's step to 15. What is compared is `scripts/lib/goldenText.mjs`'s, tested
with the real numbers (9 mutations, all killed). The seven kept copies were
re-made on a clean build of `cce6495f` after looking at each, and all seven then
matched it, text exact and no pixel past the threshold.

**Item 4: close-ups (IM2, IM33–IM36, contract v23).** From one globe radius,
which every framing keeps, San Francisco's venue nights of 3 October, 20 at
16 venues inside 4.2 × 5.7 km, are one cluster of marks, and California's heat towns
overlap on its coast. A shot's `card.inset: true` adds a close-up, and nothing
else does (IM36):
- **What it draws** (IM34; `closeUpInset.ts`). A public venue: the other public
  venues open the same night (their hours overlap the featured event's) within
  25 km, one mark a venue, a live night before a cancelled one, on a 1 km grid,
  the featured one ringed and named, with the 150 m they are placed to. No
  coastline: Starcom's own has 1 to 6 points across a city. A heat town: the
  other heat towns of its state whose note is for the same day, each at its
  worst level's colour, inside Starcom's own state lines (307 points for
  California, about 11.5 km apart), the state filled and its neighbours
  outlined, with every other country in view outlined from the territory
  index Raver Watch already holds (IM37), so Mexico across the border does not
  read as sea. Each has a scale bar of a round length. No tiles: the state
  lines are the file Raver Watch's state regions already fetch from Starcom.
- **For what** (IM2). A public venue's scene event, or a HeatRisk note with a
  town in a US state. A scene event placed only to its town is refused (a
  close-up would claim more than its note), and so is everything else, an
  Intel Report above all, whose place can be a filing address. The shot is
  refused before the camera moves, as a template is.
- **Where** (IM35). A square of 0.42 of the picture's shorter side, in the
  corner that keeps clear of the item and its label, covers the fewest of the
  picture's marks, and lies farthest from the item, with a leader from the
  item's glyph, drawn under the item's label so the label covers it where they
  cross. Its type is no larger than the card's caveats, smaller in a small
  inset, so the square card's map keeps its room. The venue's name sits by its
  ring on the side it touches no dot, slid past one when every side has one.
  When every corner covers marks, or the label, the card says so in its
  warnings.
- **What the card says of it**: `regions.inset` where it is, `provenance.inset`
  what it draws (capture schema 16: kind, the featured item, how many places,
  how far, how finely, its grid and its scale, never where the places are), and
  a sentence of the alt text.

Checked on the built app, from the kept notes, at the golden shots' moments,
each card looked at: the 9:16 night card's inset marks Bill Graham Civic
Auditorium among 20 other public venues open that night within 25 km, three of
them across the bay, on a 1 km grid with a 5 km bar; the embed heat card's,
Los Angeles among California's 12 other towns that day, 6 red and 6 amber, with
a 200 km bar. The same at square (a 2 km grid, the 1 km lines too close),
wide and portrait. A drug-check alert and a War & Conflict item asking for one
were refused, saying why. The inset follows what the globe draws: a paused
shot draws every night the timeline's window overlaps, so the card marks 20
others where the bare moment alone would draw 9. The first look found three
faults, each fixed with a test: the inset's leader crossed the callout's
label, the venue's name covered a dot whose centre was outside its box, and
the land past a border read as sea (IM37). 47 mutations, all killed, four
after tests were added. IM33 kept the square critical card's refusal with a
QR code, which points at the 9:16.

Two golden cards keep the close-ups, `venue-inset-story` and
`heat-inset-embed`, made on a clean build of `0e312879` with the other seven,
which moved to capture schema 16 and nothing else, but for one thing the
re-keeping found: the QR card's footer band grew from 60 to 79 px. Its footer
wraps beside the code, and the capture moment and the build it prints wrapped
to one more line. The comparison now sets the footer band's height aside, as
it does the build; where the band starts is still compared. A footer that
wraps differently could still move a 9:16, square or portrait card's picture
by a line, since their pictures take what the text leaves: not seen yet, and
the compare would show it as a picture of another size.

### 22. Reading all The Record holds (2026-10-03)

Found while choosing subjects for the golden cards. Raver Watch was read with
one filter over its two kinds, notes (30023) and venue nights (31923). The Record
returns the newest **500 events per filter**, whatever `limit` asks, and its end
of stored events looks the same whether it sent everything or not. Measured with
read-only probes:

| asked | sent |
|---|---|
| one filter, both kinds (as Starcom asked) | 500: 460 nights, 40 of 92 notes |
| the same with `limit: 2000` | 500, the same |
| a filter per kind | 92 notes + 500 nights |
| nights alone, then a page before the oldest, twice | 558 nights |
| War & Conflict's filter | 149 notes (119 on 2 October) |

So starcom.app read none of the five drug-check alerts, among them a critical
Trimbos red alert (PMMA sold as ecstasy, in force to 12 October). It also missed
51 of 69 heat towns and 98 venue nights, and said the feed was loaded.
War & Conflict was at 149 of the cap and growing by dozens a day.

**Fixed in `services/nostr/readComplete.ts`, used by both feeds:**
- each filter is read on its own, a kind at a time for Raver Watch;
- each filter is read again before its oldest event (`until`, inclusive) until a
  page brings nothing new;
- a feed says it is loaded only when every page is in, so a card cannot be made
  from half a read;
- the first subscription stays open for what is published after.

NIP-01 cannot page within one second: more events in one second than the cap
are read as far as the cap.

**Found again by the live check, and fixed:** nostr-tools ends a read it has
waited 4.4 seconds for as if the relay had said it was done (`baseEoseTimeout`).
Through the check's proxy, 500 venue nights took longer: the page had counted
none, and the read stopped there and called itself complete. Every subscription
the reader opens now waits up to 30 s (`READ_WAIT_MS`, passed as `maxWait`).
nostr-tools uses the same value for the wait for a connection, so an unreachable
Record is now reported after about 29 s rather than 4.4.

Checked on the built app against the real Record, read-only (EVENT and AUTH
frames dropped, every other relay answered empty):
- it asked for one more page of notes and two more of nights, at the same
  `until`s as the scripted read;
- it received 92 notes and 560 nights;
- it drew 4 standing drug-check alerts (the Trimbos alert among them) and 313
  venue nights, where the capped read drew 293.

The complete read is kept as
`raver-watch/raver_watch_live_2026-10-03.json` (650 signed events). A test
serves it through a relay capped at 500 and checks that every item the notes
make is drawn: 627 items, where one filter gives 477. 18 mutations, all killed.

**What keeps it bounded (RW15, owner, 2026-10-03):**
- Mecha Jono publishes about 430 venue nights a day. 240 of the 558 read had
  already ended, and none expires, so a complete read grows by about 0.8 MB a
  day (1.8 KB a night).
- The owner chose to ask them to tag each night with NIP-40 `expiration`, its end
  plus a day. The Record runs strfry, which honours NIP-40 (its NIP-11 lists 40),
  so ended nights drop out, and the read stays at the nights still standing.
- Nothing changes on Starcom's side. Until they do it, every visit reads every
  night.

**At risk, not changed:** mission packages and federation findings are read the
same way (one filter, no paging), and federation puts both its kinds on one
filter. Their volumes are small today. `readComplete` is there for them when they
are not.

```sh
grep -rn "readComplete(" src/services --include=*.ts | grep -v __tests__   # the reads that page
```

### 23. Drift from Mecha Jono's spec (2026-10-03)

Their handoff doc lists Interchange 3.6.0–3.6.3 and Raver Watch v1.5–v1.6, all
published after Starcom's build of these layers. Their discovery manifest already
said 3.6.4. Read against the live notes, what had drifted was:
- five War & Conflict event types with no glyph, drawn silently as plain
  reports: protest (4), election_security (3), unrest (2),
  state_of_emergency (1), missile_launch (1);
- two sources with no name, which a card would print as `mofa_jp` (12) and
  `rferl` (4);
- 16 scene-news notes refused, since no layer took them.

The owner decided WC5, RW17, IX1 and IM24 (recommended options), and these were
fixed before the contact sheet:
- **WC5.** A thirteenth glyph, `unrest` (Lucide's megaphone: a voice raised,
  not a weapon), for protest and unrest. A missile launch takes the strike
  glyph; a state of emergency and election security take the warning glyph.
  The key's words say so. Japan's Ministry of Foreign Affairs and Radio Free
  Europe/Radio Liberty are named.
- **RW17.** Scene news is read onto Scene events as news: listed in the Raver
  Watch panel under its own heading, apart from policy and law, and never
  drawn. The feed says how many ("16 scene news, listed"), so the key and every
  card do.
- **IX1, in the app.** War & Conflict's feed names any event type with no glyph
  and any source with no name, with how many items carry each, and the card
  carries a caveat. Raver Watch counts notes of a kind no layer reads, by kind
  and address, and its caveat says how many are not shown.
- **IX1, on demand.** `npm run audit:interchange` reads The Record as the layers
  do, through the same readers, a page at a time. It lists:
  - event types with no glyph, and sources with no name;
  - kinds no layer reads, and refusals by why;
  - the version their manifest states.

  It is read-only (REQ and CLOSE) and a spot check, with no schedule.

Checked:
- The audit against The Record found nothing unknown in 149 War & Conflict notes
  and 650 Raver Watch notes, and exited 0.
- With `protest` and `rferl` taken out of this build, it listed `protest (4)` and
  `rferl (4)`, and exited 1.
- The kept read of 3 October (`war-conflict/war_conflict_live_2026-10-03.json`,
  149 signed events) has nothing unknown to this build, as a test.
- On the built app, the panel listed "Scene news (16)".
- The golden cards changed only where meant: the war cards' key wording, and the
  venue night's feed line. Their pictures moved by at most 0.035%; they were
  updated after looking.
- 29 mutations, all killed (two survivors first, each a test that passed for the
  wrong reason).

```sh
npm run audit:interchange      # Node 22; exit 0 nothing unknown, 1 something listed, 2 cannot read
```

### 24. Mecha Jono's briefing asks (2026-10-04)

Their report of 3 October, "Drawing the whole day", asked four things of the
share handle that draws their daily briefing (decisions BA1–BA3 and IM38; plan
block J). Audited first, against the code and, read-only, The Record:

| Ask | What was found |
|---|---|
| A: `listReports` gave 47–50 Intel Reports whatever the window | The globe draws at most `maxReports`, 50; the handle lists what is drawn and said nothing of the rest. |
| B: a 24-hour replay showed nothing | A replay swept every drawn report's time, 12 February to 3 October; the window its comment promised was never read. |
| C: 4 of 5 highlights not featurable | Of their 193 notes since 2 October, 180 carry no `g`: 32 carry `geo` and are drawn, 148 say where only by jurisdiction (36 a US state, which nothing could draw), and none can be featured. |
| D: a heat bulletin not featurable | Every `heat_risk` note is a plain Raver Watch note, which HeatRisk draws: most likely HeatRisk was off. |

**Block J, item 1, the three small ones (contract v24).**
- **A replay bounded** (BA2): `recordClip({ replay: { from, until } })`, in unix
  seconds, else the timeline's window, else the reports' own span, as before
  (`planReplay`). Reports outside the span stay hidden while it plays: the
  glyphs read the span from the replay clock, so a day's replay is not the
  months before it. At the pace of time the span itself is swept; evenly, the
  reports in it are the steps. The clip says which span, where it came from and
  how many reports it hid (clip schema 3); a span with nothing in it is refused,
  saying how many drawn reports lie outside it.
- **Why an address is not drawn** (ask D): `whenReady({ address })`, and so
  `renderBatch`, say what the layer holding it says: Raver Watch names the layer
  that is off and how to turn it on, the times outside the moment shown, news it
  lists and never draws, a region with no outline, or no place at all.
- **Type one step larger where it fits** (IM38): `CARD_TYPE_LARGER`, option B of
  IM29's comparison, tried first where the picture is planned, so a dry run and
  the card agree; the compact type where the larger would be refused. The card
  says which in `provenance.typeStep` (capture schema 17). On the golden cards
  the square critical card fell back to compact, as Mecha Jono found; the other
  six that have a choice took the larger; the 9:16s keep their one size.

Checked: the golden compare on a build with uncommitted changes, where it now
compares only the words, found exactly the schema step and `typeStep` on all
nine, and the cards were looked at. 21 mutations, all killed.

**Block J, item 2, the report cap (BA4–BA7, contract v25).** It was 50, fixed,
with no control, and the intake behind it read the newest 200 of the past year
and held 200, so no cap above 200 could have drawn more.
- **The choices** (`reportCap.ts`): 50, 100, 250, 500, Max (1,000), Unlimited,
  or a number of one's own from 10; 50 to start. The setting stores a number, or
  null for Unlimited.
- **Where** (BA4): a "Show more" in the "Showing N of M" notice, offered only
  when the cap itself cut the list (all it allows drawn, and more matched: fewer
  drawn than the cap is the priority filter's doing, said beside it), and the
  same chooser in a new Intel Reports settings popup on the left rail, to choose
  before anything is cut.
- **Reading follows the cap** (BA6): `setHoldCap` raises what the intake holds,
  never under its 200, and pages each relay back past the oldest report it sent,
  500 a page with the 30-second wait The Record's long pages need, until enough
  are held, a page brings nothing new, or nothing is left. What it reads back is
  older than all it held, so it is held behind them: a page that overshoots
  drops its own oldest, never the newest. Started with a cap already raised, it
  reads back once the live read has answered.
- **The globe** draws to the cap in force, draws again when it changes (it was
  read once, when the layer started), and tells the intake how many to hold.
- **The handle** (BA7): `setReportCap(n | 'max' | 'unlimited' | null)` for its
  page only, never saved, null returning to the person's; `getReportCap()`;
  `listReports({ counts: true })` with how many matched, how many the cap drew,
  and whether it cut them. The chooser says when the handle set the page's cap.
  21 mutations, all killed, three after tests were added.

Checked on the built app against The Record, read-only (every other host
blocked, every EVENT and AUTH frame dropped): at the default cap the globe drew
47 of 47 matched, the intake holding its 200; with the handle's cap at Max the
intake read back five pages and the globe drew 59 of 59; cleared, it drew 50 of
59, said cut, and the notice offered "Show more", which opened the chooser; the
rail's button opened the settings. That run also showed the layout never
mounted the rail for Intel Reports: it kept its own copy of the rail's gate, now
one shared function. **And it corrects ask A's audit:** the 47 Mecha Jono saw
were not the cap's doing. Of the 200 reports the intake held, 47 had a point to
draw; the rest name only a territory, which J3 (territories featured) is for.

**Block J, item 3, territories featured (BA3, contract v26).** Of Mecha Jono's
notes since 2 October, 148 said where only by a jurisdiction, and none could be
listed or featured; the 36 naming a US state could not even be drawn.
- **Which territories** (`territoryReports.ts`): a country from the territory
  index, by its code in any case, and a US state from Starcom's own state lines,
  loaded once a report names one. A code that matches neither stays in the
  layer's unmatched list, as before.
- **Listed**: `listReports` includes each report about a territory, standing at
  the middle of the largest part of the first territory it names that can be
  drawn, with how far that territory reaches as its precision, and
  `territories: [{ code, name }]` naming each it names. Reports about one
  territory count each other in `sharesPlaceWith`, as reports at one place do.
  A report with a point of its own is drawn and listed where it says.
- **Featured**: where an item with a point says how near it is, the card says
  "About Ohio as a whole: the report names no place in it". Never a pin.
- **Lit**: the featured report's territory takes a faint fill and an edge three
  pixels wide in the palette's near-white cyan, both over the cloud shell. The
  first try, a lighter cyan line over its outline, could not be found in the
  app: one pixel wide, the hue of every other outline, under the clouds, and
  cyan on cyan on the Cyber-Earth skin. The fill claims no more than the card
  says in words, and only while the report is featured. The layer's glyphs dim
  around it as they do around a featured glyph: a state is some 30 pixels
  across at the closest any shot comes (one globe radius, which stays), and at
  full strength the glyphs of the reports in and near it hid it entirely.
- **Arriving with the glyphs**: the layer took this session's reports from
  storage, which takes each of the 200 the intake holds one write at a time,
  and from the live feed, which misses what the intake took before the globe
  subscribed. It now takes what the intake already holds, as the glyphs do,
  with storage keeping what earlier sessions received; the network's latest
  version of a report wins over its stored copy. Measured on the built app
  under a software renderer: 11 of 140 listed when the handle's whenReady
  answered and all 140 some 85 seconds later; now all 140 within 11 seconds,
  as the glyph reports are.

Checked on the built app against The Record, read-only (every other host
blocked, every EVENT and AUTH frame dropped). Counted on The Record directly,
its newest 200 Intel notes, which the intake holds, are 47 with a point, 140
naming a jurisdiction, every one a country or a state drawn here, and 13 naming
neither: J2's correction holds, save that 13 of "the rest" name nowhere at all.
The globe listed those 140 (four naming a US state) and the 47. Cards of Ohio
and of Pakistan on the Cyber-Earth and Blue Marble skins say "About … as a
whole"; Pakistan reads lit on both, and Ohio read only once the glyphs dimmed. On Cyber-Earth the edge carries it, the fill
barely showing on cyan land. The golden cards' words are unchanged on all nine.
37 mutations, all killed, four after tests were added.

whenReady answers when the globe can be captured, not when the intake has
finished reading: at it, 32 of the 47 glyph reports and 11 of the 140 were
listed, and 11 seconds later all were. That is every layer's behaviour, and
the how-to for Mecha Jono (item 7) says so.

Seen, and left: every other territory's outline stands under the cloud shell,
which veils it wherever there is cloud. And a state is small at one globe
radius; a close-up would show it, and a territory report names no address,
but IM2 refuses a close-up of any Intel Report, so whether these may have one
is the owner's to decide.

**Block J, item 4, groups at one place (BA8–BA11, contract v27).** K8 had
chosen the menu: one at the click, listing each member, shared by every layer
that groups. This builds it, and the Intel Reports half of it.
- **The menu** (`GlobeGroupMenu`): at the click, kept inside the viewport, a
  section a group, "3 reports here" or "Ohio · 1 report", each report by its
  title, by what it is in words as well as in its glyph's colour, and by when,
  in UTC. It scrolls when long; the arrows, Home and End move through it, and
  Escape or a press anywhere else closes it.
- **A place** drawn as one glyph with a count opens it; a report alone opens as
  it always did. A report picked pages through its place's reports alone, "2
  of 3 here", with a way back to the menu (BA8): the popup had paged on past a
  place into every report on the globe.
- **A territory**: a click inside an outlined territory opens the reports about
  it, the smaller first where one is inside another, a state before its
  country; a glyph on top wins (BA9). Hovering names the territory and how
  many reports it holds. A report about a territory as a whole gives no
  coordinate in the popup: "About Ohio as a whole".
- **The nearer thing takes the click** (`claimGlobeClicks`, globeClick.ts): the
  country layer picked a country on every click on the globe, so a click on a
  glyph opened its report with the country's panel over it, and the panel
  covered the new menu. A glyph now takes every click from the layers under
  it, and a territory outlined for its reports takes a country's click and
  hover, but not a click on a point drawn on it. A country no report is about
  still opens its panel.
- **The handle** (BA10): each listed Intel Report carries `group` (`key`,
  `kind`, `size`), keyed by the report drawn for a place, never by a position,
  or by the first territory it names; `listGroups()` lists each group with its
  members most severe first, every Intel Report in exactly one; a card
  featuring one says which of how many it is, "2 of 3 here". A report about two
  territories is in its first's group; the menu inside the second lists it too.
- **Outlines over the clouds** (BA11): every territory outline stood under the
  cloud shell, veiled wherever there was cloud, and under the borders, which
  had moved up since and painted over it where the two ran together. They
  stand over the clouds now and are drawn after the borders.

Checked on the built app against The Record, read-only, with real clicks: 187
listed, every one in one of 115 groups, no key carrying a position. A click on
the three reports at Gaza City opened their menu and no country's panel; the
second, picked, paged "2 of 3 here", and back reopened the menu; a card
featuring it said "2 of 3 here" after where it is. Hovering inside the United
States said "United States of America · 12 reports", and a click there opened
their menu; a click on Greenland, which no report is about, still opened its
panel. 36 mutations, all killed.

**Block J, item 5, category emblems (BA12–BA15, contract v28).** K3's Symbol
registry is begun (`src/symbols/symbolRegistry.ts`) with the Intel Report
categories as its first entries: each meaning an icon, addressed by what it
means. The icons are Lucide's, their data copied under its ISC licence so the
glyph atlas can bake them as it bakes every glyph.
- **A report's category** is its stated top-level `category:` word (BA13):
  fourteen today, the ten the decision counted and four that had appeared by the
  time it was built (hazard, digital, aid, accountability), each given an icon.
  A word after them is drawn with a generic tag until it is given one.
- **On the glyph** (BA14): the category's icon is inked inside the page, which
  keeps its colour for the assessment. That takes the place of the assessment's
  own interior mark (bars, a bang, a chevron, a blank page), which carried it in
  shape as well as hue; so with an emblem, a report nobody assessed is a hollow
  page, its outline and emblem grey, and assessed and not assessed differ by fill
  as well as colour. Chosen by looking at both at their real size on ocean, dark
  and bright land and Cyber-Earth; a badge in the page's corner for the
  assessment was tried too, and at 35 px it is a notch. Critical and actionable
  differ from each other by hue, and on the live globe by motion; a card says the
  assessment in words. The pages are atlas cells after every glyph, so no glyph's
  cell moved, and the emblems are a second texture of masks the shader inks.
- **Where else:** the menu at the click shows each report's icon in its
  assessment's colour and its category's word; the key says "emblem: what it is
  about" with the emblems drawn, most worn first; a card featuring a report says
  its category first ("conflict · not assessed · by …"), and its record lists
  the emblems in the picture (capture schema 18).
- **The setting** (BA15): on unless a person turns it off in the Intel Reports
  settings, and a setting saved before there was a choice reads as on. The
  handle sets it for its page only, never saved: `setReportLook({ emblems })`
  and `getReportLook()`; `listReports` gives each report's `category`, and the
  contract publishes the words, what each means and its icon
  (`reportCategories`).

Checked on the built app against The Record, read-only: all 187 listed carry a
category; cards of the Levant and of the United States, on Blue Marble and on
Cyber-Earth, wear their emblems, and their key and record name them; a card
featuring a conflict report says "conflict · not assessed"; the menu at Gaza City
shows the three reports' swords; the handle turned the emblems off for the page
and back, and refused a look it could not read. 23 mutations, all killed; one
had survived because the setting was checked twice, and the check nothing could
observe was removed.

**Block J, item 6, areas as subjects (BA16–BA18, BA20, contract v29).** A
report's jurisdiction tag can name a continent, union, sphere or zone by a
prefixed code (`continent:africa`, `union:eu`, `sphere:anglosphere`,
`zone:east-african-rift`; a bare `eu` too). It is listed, featured and grouped
as a report about a territory is.
- **The first set** (BA18), in `src/features/globe/areas/areaRegistry.ts`:
  seven continents, six unions, five spheres and eight zones. Each cites where
  its members or shape came from, and the day that page was read. Memberships
  change: Timor-Leste joined ASEAN, and Mali, Burkina Faso and Niger left the
  Francophonie, within the past year.
- **Continents as a reader draws them.** The map's continent field files all of
  Russia under Europe, Siberia with it, and draws French Guiana as part of
  France. So Russia is cut at the Urals and the Ural River, a line Starcom drew,
  and French Guiana is given to South America. The Seychelles, Mauritius and the
  Maldives, which the map files under the open ocean, go to Africa and Asia.
- **Shapes baked, not computed in the browser.** `npm run bake:areas` merges an
  area's countries into one outline, widens a zone's lines into a band, rings a
  ring and circles a circle. A band is widened segment by segment: a buffer's
  projection is centred on what it widens, and one for the whole Ring of Fire
  sat in the Gulf of Guinea, its arcs a fifth as wide as drawn. The file is 150
  KB, fetched once a report names an area, by the hash of the definitions: the
  service worker then kept what it fetched from /geopolitical/ for good (since
  2026-10-07 it checks each kept file once per build). A test bakes again and
  fails when the served file is not what it makes.
- **Every ring outlined.** A hole is where a territory is not. The European
  Union is drawn round Switzerland, and South Africa round Lesotho, which no
  outline showed before.
- **In words that read:** "About the European Union as a whole", "About the
  Sahel", but "About Africa".
- **A middle inside.** A region stood at its largest part's centroid, or where
  that fell outside, at the part's first vertex, on its edge: Norway, Croatia,
  Vietnam, Antarctica and the Ring of Fire. Each now stands at the middle of its
  widest run along the parallel through its middle.
- **The click** (BA20): inside an area or territory with reports, the menu
  lists them, the smaller first, and last the country under the pointer, whose
  panel it opens. An area the size of a continent had taken every country's
  panel on it, and a country with reports had taken its own since J4.
- **The handle:** `listAreas()` gives each area's code, kind and name, its
  members where it is made of countries, its source and the day it was read, and
  a note on its edges; the contract lists the codes (`areas`, `areaAliases`).

Checked on the built app against The Record, read-only, with five check notes
naming areas handed to the headless page alone and never to a relay: 192
listed, the five each under its area, the two naming the EU (`union:eu`, `eu`)
one group; the shapes fetched once, by their hash. Cards of the EU, the Sahel
and the Ring of Fire light the area and say what it is about. A click in
Germany listed Germany, the EU and the country; picking the country opened its
panel. A click in Bern, in the EU's hole, opened Switzerland's panel. 42
mutations, all killed.

**Block J, item 6b, areas as lenses (BA21–BA24, contract v30).**
- **In an area** (BA21): a listed item whose place, as listed, is inside the
  area's outline: a report's point, or the middle of the territory or area it
  is about. `listReports({ area })` lists them, as a promise, since the shapes
  are fetched the first time one is asked for.
- **Framing** (BA22): the area's largest part, ranked as its place is, and each
  other part one view holds with it from no more than half as far again.
  Without that limit an EU card took in French Guiana, and Europe was drawn a
  third the size. The card says what is outside instead, as a reader would name
  it: "part of France", "Australia and New Zealand", "Fiji, Samoa, French
  Polynesia and 14 more"; past four members, by count and continent; a drawn
  zone's parts by the continents they reach. `frameArea(area, { preset })`
  frames one for the camera. The Francophonie's largest part is Canada, so its
  card centres there.
- **A card about an area** (BA23): a shot's `subject.area`, or a renderBatch
  request's `area`, draws Intel Reports, frames the area, lights it and cards
  it. The card gives its name as the headline; how many Intel Reports are in
  it, by assessment; the most severe by title; its note; where it was taken
  from and the day that was read; and what is outside the frame. It is laid out
  as a featured block whose id is `area:` and the code. Any other shot clears
  the lit area first, so it never stays into a card about something else.
- **In the app** (BA24): the header's search lists the areas beside the
  countries. Picking one outlines it on the globe and flies to it, framed as its
  card would be, until a chip beside the camera buttons clears it. The report
  form's finder offers areas, by name or code.
- Country names read mid-sentence as a reader says them: "About the United
  States of America as a whole", where cards said "About United States of
  America".

Checked on the built app against The Record, read-only, with the five check
notes handed to the headless page alone. `listReports({ area })` gave 9 in the
EU and 6 in the Sahel, the check notes among them. `frameArea` framed the EU's
mainland and said "Outside the frame: part of France"; the Francophonie's
frame centred on Canada and said 46 of its 50 members were outside. Cards of
the EU, the Francophonie and the Ring of Fire, and a batch card of the Sahel,
lit the area and gave its count, its most severe report, its note, source and
date, and what was outside. A shot of a view afterwards left nothing lit. The
header search listed the Sahel as an area; picking it outlined the Sahel, flew
to it and showed the chip, and Clear removed both. 36 mutations: 35 killed; the
36th, a second pass over the parts that could never add one, removed with the
pass, since more parts only widen the cap.

Seen and not yet fixed: on the Francophonie's card, Canada's lit fill leaves a
disc over Hudson Bay unlit. The fill code is the country layer's, which draws
such large shapes the same way.

**Block J, item 7, the spec and the asks (BA19), for items 1–5.** Told Mecha
Jono in one comment on their handoff doc (3c43e26e-effd, 2026-10-04), anchored
on their wish that our pictures reach their posts: how to use what items 1–5
added; the correction to ask A (the 47 were the notes with a point); that
`whenReady` means the globe can be captured, not that the read is complete, so a
full list is had by calling `listReports` until its count stops growing; the ask
for a coarse `g` where a note has a real place; and the area codes to come.
The areas addendum followed in that thread once they were live (33566e8e-960d):
the 26 codes, the bare `eu`, `listAreas()`, what to know of continents, unions
and drawn zones, and when to name an area rather than give a coarse `g`. Looking by area (v30)
followed in the same thread once it was live (b4410d9e-e659).

### What the channel audit found, and has not yet fixed

Measured 2026-09-18 across every layer that draws marks. Recorded because these
are defects in what the globe CONVEYS, not in what it draws, and none is decided:

- **Colour is roughly five times overloaded.** Every hue family is claimed by
  three to five layers, each meaning something else — red is severity AND
  temperature AND a hazard type AND an intel category AND a satellite role.
  Layers are a Set, so several are on at once. No two layers share an exact hex;
  that was never the problem.
- **Satellites spends two channels on one variable.** *Fixed in step 9 below.*
  `satellitePoints.ts` drives
  `sizePx: pointSizeForType(s.type)` and `color: colorForType(s.type)` from the
  same field, and its legend says so: size "role — stations largest", colour
  "role". Size is a MAGNITUDE channel carrying a nominal variable, so a viewer
  reads "bigger = more" — a station is not more than debris. Altitude, orbit
  class and count go unencoded.
- **No layer draws data age.** *Fixed in step 11 below — in the key, not on the
  marks.* Nothing ties opacity or saturation to freshness, so
  a mark from a two-hour-old CelesTrak catalogue looks exactly like a
  thirty-second-old blocklist read.
- **`shapeMeans` conflates two jobs** — WHICH shape (provenance, what the card
  needs) and WHAT THE SHAPE MEANS (semantics, which only Conflict Zones uses).
  On a single-mark layer the card prints "shape: ring", which tells a reader
  nothing they cannot see.
- **Settled borders are drawn in the colours that mean contested.** *Decided and
  fixed in step 8 below; kept here as the measurement that decided it.* Measured
  2026-09-19 off the live scene, reading each border batch's per-line colour and
  classification, with every class loaded before comparing:

  | scheme | international borders in a provisional colour |
  |---|---|
  | default | 104 of 331 (31%) in `#ffcc00`, the line-of-control amber |
  | political | 89 of 331 (27%) in `#ff5555`, the disputed red |
  | population | none exactly, but every one is a shade of red |
  | economic | none |

  `resolveBorderMaterialConfig` colours an international border with
  `schemeColor(scheme, featureId)` — a HASH of the border's id into a four-colour
  palette — so its colour carries no information, and the default and political
  palettes each contain a provisional colour. The dash is the only thing left to
  tell them apart, and at the default altitude a border is a faint line of about
  a pixel under the country fills; the dash is not legible there. The border
  overlay is on by default, so this is the map a first visit sees.

  The popup's hardcoded key (`GeopoliticalLayersPopup`) makes it worse rather than
  better: it shows International as a single `#00ff41` swatch, which matches 89
  of 331 international borders on the default scheme, and draws every swatch
  solid, so it never says the dash is the discriminator.
- **The largest colour on the globe encodes nothing and has no key.** *Fixed in
  step 8.* Country
  fills use the same hash (`NationalTerritoriesService`, `colorOf: part =>
  schemeColor(scheme, part.id)`), so India is filled amber and Afghanistan blue
  for no reason a reader could recover. They are the most prominent colour on
  screen, and nothing publishes a legend for them — the in-app key, working as
  built, lists the data layers and is silent about the base map.

  Two measurement mistakes on the way, each of which produced a clean-looking
  wrong answer: settings written to the wrong key made all four schemes report
  the default palette (the setting works; the probe did not), and a partial
  settings block replaced the whole `nationalTerritories` config, dropping
  `showDisputedTerritories` and filtering every disputed border out, so the
  comparison reported zero collisions against nothing.
- **Only SpaceWeather normalises.** "Where the sample falls among the rest" is the
  one rank-based encoding in the project; every other layer shows absolute
  magnitudes that cannot be compared across layers.

## Checking where this stands

This record does not keep a status list; these derive it.

- `npm run build && npx vite preview --port 5210`, then
  `npm run audit:layers -- http://localhost:5210` writes every layer's cards at
  three views, `contact-sheet.png` and `layers.json` to a temporary folder. About
  twenty minutes. Look at the contact sheet.
- `npm run probe:first-visit -- http://localhost:5210/`, against the same preview:
  how long until a first visit shows reports from the network, whether the globe
  turned to them, and what the header, the analysis status and the timeline say.
  It exits 2 when the network sends nothing, which says nothing about the app.
- `npm run probe:time -- http://localhost:5211/`, with the dev server running,
  keeps D-E's checks passing while this work changes the globe.
- Whether anything in the app reads the legend store, which is the gap step 7
  closed. One consumer meant the key existed only in exported images:

  ```sh
  grep -rln "subscribeLegends\|getLegends" src --include=*.ts --include=*.tsx \
    | grep -v __tests__ | grep -v globeLegendStore
  ```
- Whether any settled border or the fills can be drawn in a provisional colour —
  the invariant step 8 restored. A pass means none can:

  ```sh
  npx vitest run --config vitest.stable.config.ts \
    src/geopolitical/__tests__/materialTheme.test.ts -t "reserves the provisional"
  ```
- Which layers honour a chosen style, and what is left:

  ```sh
  grep -cE "^  [A-Za-z]+: .honoured.,"  src/components/Globe/markerStyles.ts
  grep -cE "^  [A-Za-z]+: .not-yet.,"   src/components/Globe/markerStyles.ts
  ```

  Anchored to the start of an entry so the pattern cannot match the prose that
  documents it — two looser ones did, and each reported a number one too high.
- Whether a style is offered on every layer, which it should be since 6.5. There
  is no per-layer options list, and its return is what to look for:

  ```sh
  grep -rn "markerStyleOptionsFor" src   # nothing: the stopgap is gone
  ```
- `npm run audit:layout -- http://localhost:5211/`, against the same dev server,
  measures every screen at 1280×720 and 1920×1080: the area each one gets,
  controls covered or cut off, text drawn over text, typefaces, headings, and where
  a page sends a visitor who is not signed in. It writes `layout.json`, a
  screenshot of each screen and `contact-sheet.png` to a temporary folder. About
  eight minutes. Look at the contact sheet.
