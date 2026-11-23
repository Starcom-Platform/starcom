# Decision D-HW — Hero Watch

**Status:** started 2026-10-10. HW1–HW9 decided by the owner the same day;
the build follows the plan below.

The owner asked for a Hero Watch view mode on 2026-10-10, from the new mission
and intel data Mecha Jono publishes on the decentralized grid. This record holds
what is there, what Starcom does with it today, and what was decided.

## What is on the grid (census, 2026-10-10)

A read-only query of Mecha Jono's key on The Record (`wss://record.cosmiccodex.app`),
the last 14 days, 3,057 events. Hero Watch began on 9 Oct at 16:15Z.

| What | Kind | Count | Where it is | Tags that tell it apart |
|---|---|---|---|---|
| RNLI lifeboat stations, launches a year | 30023 | 118 | a point, venue precision; UK and Isle of Man | `hero_watch`, `lifeboat_station`; `launches`, `year`, `station_type` |
| Red Cross and Red Crescent operations (IFRC GO) | 30023 | 1 so far | a country (`jurisdiction`) | `hero_watch`, `response_operation` |
| Organisations responding in a country (OCHA, via HDX), counted, never named | 30023 | 1 so far | a country | `hero_watch`, `response_presence` |
| The week's Hero Watch summary | 30023 | 1 a week | none | `d=hero-watch-<year>-w<week>` |
| Field missions (signed packages, and their readable notes) | 30079 and 30023 | 24 and 24 | a state or country on 19 of 24 packages; no point | `field_mission`, `mission_family` |
| Missions addressed to RLSH heroes | 30079 | 64 | varies | `audience:rlsh` |

The field missions' families: disaster volunteering, recall checks, refunds owed,
naloxone, weekend harm reduction, scam shield, public comment, heat and smoke
relief, malware takedown. Each note ends "Posted by Mecha Jono, an AI agent."

Mecha Jono's interchange manifest (kind 30078, `d=mecha-jono:interchange`,
version 3.6.4, generated 3 Oct) lists every family it publishes except Hero
Watch, which began after it.

## What Starcom does with it today

Nothing reaches the screen. The intel intake reads only notes tagged
`starcom_intel`, and Hero Watch's are tagged `hero_watch`: the live globe listed
166 Intel Reports on 2026-10-10, none of them Hero Watch. Mission packages are
read only when tagged `starcom_mission_package` and verified as Starcom's own
(`MissionPackageIngest.ts`, `MissionPackageVerifier.ts`); nothing reads
`field_mission`, `mission_family` or `audience:rlsh`, and the `field_mission`
card template says "not built (block H)".

RLSH was a submode of Cyber Command whose 197 people came from a scrape of the
RLSH wiki embedded in the app. Since 2026-10-17 (rlsh-minors.md, RS49) Starcom
ships and fetches no scraped data: heroes submit their own public profiles
through NavCom, and the layer draws no one until they do. RLSH is never
pinned, and never drawn on a card or in a clip.

Reading Mecha Jono's records by family is block H's item 6, and field missions
are its item 5 (`04-plan/intern-readiness-plan.md`). Hero Watch brings both
forward.

## What the records say, and what that asks of the drawing

Read on 2026-10-10, each kind's own fields:

- **A lifeboat station** carries its point, `station_type`, `launches` and the
  `year` they were counted in. The counts are the RNLI's Return of Service for
  **2025**, last year's, and the weekly summary compares "the same seven days of
  2025". Nothing here is a rescue happening now: a card says "launches in 2025".
- **A relief operation** (IFRC GO) carries `jurisdiction`, `appeal_type` (DREF),
  `amount_chf`, `people_to_reach`, and `start` and `end`. Its note says where it
  applies, "Ethiopia, the whole country": a country tint claims no more than the
  source does (HW4), where the region marks of Intel Reports draw only an
  outline because a jurisdiction tag claims less.
- **Who is working where** (OCHA, via HDX) carries `organisations`,
  `national_ngos`, its sectors and the period counted (January to March 2026).
  Organisations are counted, never named, and neither will Starcom name them.
- **A field mission** is a signed package with objectives (an ask each, an
  effort in minutes), `claims=many`, a window, and `limits`, the safety rules
  every mission carries ("Work in pairs. Never confront anyone…"). A mission is
  never shown without its limits. Its place is `metadata.mechaJono.area` or a
  `jurisdiction`; 5 of 24 had neither.
- **Listed heroes** (RLSH) are announced in the summary: "real-life heroes' own
  reports once they choose to be listed: after the fact, and never more
  precisely than a city." Starcom's RLSH section keeps to the same rule.
- **Terms, read 2026-10-10** (against the data-licensing record's S0–S5):
  - RNLI's GIS Open Data Licence (its ArcGIS item's licence text): copy,
    publish and adapt for display, commercial and non-commercial, if the
    statement "Contains Open Data licensed under the GIS Open Data Licence" is
    shown with a link where possible; the data presented neither unfairly nor
    misleadingly; modifications indicated; no RNLI trade marks or logos, and
    no hint of endorsement. Fine for S0–S5; no RNLI flag or logo as a glyph.
  - OCHA's Ethiopia operational presence, via HDX: CC BY (HDX's API), source
    "Humanitarian partners", OCHA Ethiopia. Fine for S0–S5, credited. Other
    countries' datasets carry their own licences, which each note names.
  - IFRC GO: its terms page is a script that draws the text in the
    browser, so it was read on 2026-10-11 from the page's public source
    (IFRCGo/go-web-app, `app/src/views/TermsAndConditions/i18n.json`). Users
    "commit to not use the data available for any commercial use, unless
    entered into a separate agreement with the data owner"; maps, dashboards
    and analyses are allowed, combined with other data; "any use of the data
    outside of Montandon shall duly identify the data bank and the database
    owner"; no redistributing a substantial part, no derivative databases.
    Fine for S0, not for S2–S5 (merch, Patreon, premium, monetized posts);
    S1 and S3 unclear. Credited "IFRC GO, IFRC". In the licensing record's
    table with the RNLI and OCHA.

## Decisions

| | Decision |
|---|---|
| HW1 | (2026-10-10.) A new top-level mode, Hero Watch, beside Raver Watch, and the RLSH submode moves into it from Cyber Command: the responders (lifeboats, relief operations, who is working where), the field missions, and the RLSH heroes, with the week's summary in a panel. |
| HW2 | (2026-10-10.) Ask Mecha Jono to list Hero Watch in its manifest, and to give every field mission a place; and, for AI Watch, to run an AI desk (record to come when its records appear). Posted as drafted, with the owner's approval, as reply 211cf4a4-7229 in the J7 thread on the handoff doc. |
| HW3 | (2026-10-10.) Four sections on the sub-rail: Lifeboats; Relief (operations, and who is working where, by country); Field missions; RLSH. |
| HW4 | (2026-10-10.) Relief by country: the country softly tinted, with a badge counting its operations and organisations; a click opens the notes. |
| HW5 | (2026-10-10.) Lifeboat stations: a lifebuoy mark at each, sized by the year's launches; the count on hover and on cards. |
| HW6 | (2026-10-10.) Field missions on the globe: their state or country outlined, as Intel Reports draw a report about a whole territory, with a badge counting its open missions. Relief keeps the tint, so the two read apart. |
| HW7 | (2026-10-10.) In the Missions app, field missions are read-only first: objectives, effort, safety limits and links, beside received packages. Taking one and reporting back come later, through the publish-safety rules. |
| HW8 | (2026-10-10.) Harm-reduction field missions (weekend harm reduction, naloxone) show in both modes: Hero Watch's Field missions, and Raver Watch's Raver missions, which this builds (block H5). |
| HW9 | (2026-10-10.) Hero Watch's colour is rescue orange, the colour of lifejackets and lifeboats, apart from Raver Watch's violet, the intel cyan and the war reds. A token in `tokens.ts`. |
| HW10 | (2026-10-11.) Cards for all four: field missions (Mecha Jono's `field_mission` template), relief countries, the week (a front-page card of the weekly summary), and lifeboat stations; each listed to the share handle. |
| HW11 | (2026-10-11.) A field mission card's badge: FIELD MISSION in rescue orange, Hero Watch's hue, as Raver Watch's cards keep violet (IM5). |
| HW12 | (2026-10-11.) A field mission card carries its safety limits in full, every sentence, never cut. |
| HW13 | (2026-10-11.) A Hero Watch clip comes later, after the cards: a briefing playlist of the week's relief and missions. |
| HW14 | (2026-10-11.) A field mission's square card stays refused: its limits in full do not fit 1,080 px, and wide, portrait and story do. |
| HW15 | (2026-10-11.) With all 238 stations, lifeboats shrink as the camera rises, to dots from Europe height, so the coasts read as a line; full size close up. |
| HW16 | (2026-10-11.) In a clip, a field mission's safety limits are never cut: the burned caption widens toward the frame's edges until it fits, then, where it cannot widen enough (a portrait frame), grows past the foot of the frame; only the other lines are cut, from the signature line up. |
| HW17 | (2026-10-11.) Hero Watch's tour says its own order, never "the worst": "7 of 13: relief, the largest first, then field missions, the soonest to close first", and its end card "a tour of 7 of 13". The other playlists keep "worst first". |
| HW18 | (2026-10-11, glyph round 5.) Relief's glyph is package-plus wherever relief is drawn: the rail, the menus, and its badge on the globe, which now takes the rail's own glyph (the tent is gone). Field missions take map-pin-check in the rail and menus, and keep the clipboard on the globe: a pin at a state's middle would say the mission is at that point. Hero Watch keeps shield-plus and Lifeboats the life-buoy. |

## Build plan

Mapped from the code on 2026-10-10. Raver Watch is the model: its intake, store,
view logic, hook, panel and card path are each a file to mirror.

0. **Terms** (done above; IFRC GO's read 2026-10-11).
1. **The intake** (`services/heroWatch/heroWatch.ts`, as `raverWatch.ts`). One
   reference-counted read of The Record through `readComplete()`, which pages
   past the relay's 500-a-filter cap: kind 30023 with `#t: hero_watch`, and kind
   30079 with `#t: field_mission`, from Mecha Jono's key only. Signatures are
   checked by nostr-tools' pool (its default `verifyEvent`, which Starcom's
   `RelayPool` keeps); a test with a forged signature proves it. A hand-written
   reader per kind, as `readRaverWatchNote()`, refusing anything without its
   tags, `d` pattern, source, or window. The newest per address wins; `retracted`
   withdraws. Places: stations at their points, relief by `jurisdiction`, field
   missions by `metadata.mechaJono.area` or `jurisdiction` (US states through
   `usStates.ts`), the summary unplaced. Kinds nobody draws are counted, as
   Raver Watch's are.
2. **The mode.** `HeroWatch` in `VisualizationModeContext.tsx` (its union,
   default submode, valid set and sanitizers), `railModeConfig.ts` (the mode on
   the right rail; its four sections on the left), `useGlobeLayerControl.ts`'s
   catalogue (`Lifeboats`, `Relief`, `FieldMissions`, and `RLSH` moved from
   Cyber Command), `visualizationModeFromUrl.ts`, `deeplinkV1.ts`, the dock slot,
   `markerStyles.ts`, TinyGlobe's colours, and the glyphs (round 4 on the sheet).
   RLSH keeps its layer id, so its marker styles and the never-pinned,
   never-on-a-card rules stand. Saved settings that hold `CyberCommand / RLSH`
   are redirected to `HeroWatch / RLSH`; `isRLSHMode` and `showRlshRail` follow
   the new mode, and a link with the old pair is redirected, not refused.
3. **Lifeboats** (`useGlobeHeroWatch.ts`, as `useGlobeRaverWatch.ts`). Lifebuoy
   sprites sized by 2025's launches (HW5), hover through the tooltip registry,
   the key, the RNLI's credit line, readiness for cards.
4. **Relief** (HW4). The country faintly tinted, as the war map's fills and
   `litTerritory.ts` draw, with a badge counting its operations and
   organisations; the notes open from it. The tint is faint, because a filled
   country is a strong mark on a whole-globe view.
5. **Field missions.** Their state or country outlined, with a badge counting
   open missions (HW6), their limits always beside them; read-only in the
   Missions app beside received packages (`ReceivedPackagesPanel.tsx`, HW7);
   harm-reduction families also in Raver Watch's Raver missions (HW8); the
   `field_mission` card template built.
6. **The panel** (`HeroWatchPanel.tsx`, as `RaverWatchPanel.tsx`): the week's
   summary, open operations, the field missions, and what is not drawn.
7. **Cards and clips.** Hero Watch's items in `shareReports.ts` and
   `cardTemplates.ts`; share handle contract v40 (and its fingerprint); card
   schema 27 if provenance gains a field; `deeplinkV1` to admit a field
   mission's `30079:` address.

Each step: failing tests first; its files in `shellLift.test.ts`'s roles map
where it adds to the scene; mutations; the affected tests; a build; the golden
cards; a probe on the build; push; the deploy checked live.

## Step notes

### Step 1: the intake (2026-10-10)

- `services/heroWatch/heroWatch.ts`: Mecha Jono's `hero_watch` notes and
  `field_mission` packages from The Record, a kind at a time through
  `readComplete()`, from `HERO_WATCH_PUBLISHERS` only (`publicInfrastructure.ts`)
  and `heroWatchRelays()`. A reader for each record: stations, operations,
  presence counts and the week's summary; field missions with their objectives,
  window, place and limits. The newest at an address stands; a withdrawal ends
  it; kinds of Hero Watch note nothing reads are counted, not dropped.
- Tested on real events The Record held on 10 Oct
  (`hero-watch/hero_watch_live_2026-10-10.json`, 13 events). They corrected one
  assumption: a station can come without a launch count. Sheringham's note says
  "the RNLI's launch records name the station differently". A station is kept
  without a count, never with a zero, and a count stands only with its year.
- An open field mission without its limits is refused; a closed one is kept, as
  closed, since its ending carries no objectives or limits.
- Signatures: a real event passes the pool's check, and the same event with
  its words changed fails it, on the pool Hero Watch reads through.
- The whole 14-day census through the reader: 145 of 145 records stand (118
  stations, 24 field missions with 14 open and 19 placed, one operation, one
  presence count, one summary), none refused, no unread kinds.
- 21 mutations, all killed (one after a test of a mission placed by its area
  alone). Nothing draws it yet: step 2 is the mode.

### Steps 2–3: the mode, and its lifeboats (2026-10-11)

- The mode: `HeroWatch` in the visualization modes, on the right rail with
  round 4's proposed glyph (shield-plus); its sections on the left, listed as
  they draw, as Raver Watch's are: Lifeboats and RLSH now, Relief and Field
  missions with steps 4 and 5. RLSH moved in from Cyber Command with its layer
  id kept, so its marker styles and its never-pinned, never-on-a-card rules
  stand. A choice stored before the move opens on Hero Watch, a last choice of
  RLSH is remembered there, and a link made before the move,
  `?mode=CyberCommand&sub=RLSH`, still opens it. The Raver Watch rule "RLSH
  never in Raver Watch" stands.
- The share handle is v40: its layers gain Lifeboats, Relief and
  FieldMissions, as a test requires the catalogue and the contract agree; the
  fingerprint regenerated from the contract; a Versions line in the spec.
- Lifeboats (`heroWatchSprites.ts`, `useGlobeHeroWatch.ts`): a lifebuoy at
  each station on a dark disc rimmed in rescue orange (`DATA_SCALES.heroWatch`,
  HW9), grey for a station the RNLI does not count; area by 2025's launches on
  one fixed scale. Seen on the build at a report's size, the 118 stations
  merged into one orange shore; drawn now from 0.4 of a report's size to its
  own at a hundred launches (Tower's 439 capped at 1.1), the busiest first so a
  small station along the same coast is drawn over it. They now trace the coast
  one by one.
- The key says what size and rim mean; a card's sources credit the RNLI in its
  licence's words with its link, and say the counts are 2025's, "not rescues
  happening now". A card waits until Hero Watch's records are read, and not
  once they cannot be.
- 22 mutations, all killed.
- Live, 798fb216: all 118 stations, the rail, the key and the credit as on
  the build, no errors.

### Which stations Mecha Jono publishes (2026-10-11)

- The live capture showed England's south coast empty. Mecha Jono publishes
  118 of the RNLI's stations: England 57, Scotland 46, Northern Ireland 10,
  the Isle of Man 5. None are in Wales, Ireland or the Channel Islands, and
  no English station is south of Dover (51.12°N): nothing on the Channel
  coast west of it, in the West Country or on the Bristol Channel. A recount
  after their 21:10Z republish found the same 118, so the gap is in what they
  publish, not in the read.
- So the card no longer says "each RNLI lifeboat station". The note says
  how many stations it draws, and which of the RNLI's areas (England,
  Scotland, Wales, Northern Ireland, the Isle of Man, Ireland, Jersey,
  Guernsey) have none, read from the stations' jurisdictions. The key says
  the same. A card's short line, held to 90 characters, says "not every RNLI
  station is published". The south coast's gap cannot be read from
  jurisdictions, so it is said as "not every", never as a list that implies
  the rest is whole.
- Whether the gap is meant (a region chosen, or a Return of Service match
  that failed) is Mecha Jono's to say: a question is drafted for the owner.
  Asked in the v40 note (c3b3870a-216f).
- Answered in their sheet "Hero Watch for Starcom" (the owner's doc, 11
  October): a rollout, not a gap. The publisher sends at most 120 notes a run;
  the second run (11 October, 03:12Z) sent the other 120, and all 238 are on
  The Record: England 107 (45 south of Dover), Scotland 46, Ireland 36, Wales
  30, Northern Ireland 10, the Isle of Man 5, and the Channel Islands' 4,
  which carry a point and no jurisdiction. So the wording would have said
  "none in the Channel Islands", wrongly. A station with no jurisdiction is
  now placed by where it stands (Jersey below 49.3°N, Guernsey and Alderney
  above); one standing anywhere else could be in any area, and then no area
  is said to have none. Their station types also include ALB/ILB and HOV
  (hovercraft), now named. 4 mutations, all killed.
- Also from the sheet, for later: Mecha Jono's key changes in early November
  (a letter names the new one; read both keys for a while, and a closed
  mission's `moved_to` names where it continues); the weekly roundup carries
  `t=intel_report` and no window (its week is in its `d`); rescues in the news
  (`rescue`) and honours (`honour`) are reserved sub-layers, not sent; and
  AI Watch is built on their side as Terminator Watch (kind 30023,
  `t=terminator_watch`, category `ai.terminator_watch`), seeded and switched
  off until the operator reviews a day of dry runs, its own sheet to follow.
- 7 mutations, all killed.

### Step 4: relief (2026-10-11)

- On the grid today: two relief notes, both for Ethiopia. An IFRC GO DREF
  (Ethiopian Red Cross Society, Ethiopia Drought Response: CHF 749,972 to
  reach 50,000 people, to 31 March 2027) and OCHA's count of 144
  organisations at work (73 national NGOs), January to March 2026.
- `heroWatchRelief.ts` gathers them by country. Only a two-letter country
  code is drawn: a subdivision is never widened to its country, as the war
  map's `regionToOutline` would, and is counted as not drawn. The newest
  OCHA count per country, every operation.
- The country is tinted whole in rescue orange, over the clouds as the war
  map's fills stand. At the planned 0.13 it did not read on the build: a pale
  grey over the Classic colours, and nothing on a card. Two causes, measured
  by setting the tint live on the build. First, it mixes with the country's
  own Classic colour. Second, a card draws the countries in Quiet, whose
  fills were drawn over the tint: full strength came out salmon on a Quiet
  card and orange on a Classic one. The tint is now drawn just after the
  countries' fills (order 96) and before the borders, at 0.42: soft, and
  orange on both. A tent stands at its middle, a report's size,
  with a pill beside it, as the owner chose on 2026-10-11 ("Tent + labelled
  pill"): "1 op · 144 orgs". The pill is a quad placed in clip space, not a
  point sprite, since a point is square and capped in size on some phones.
  The country names keep clear of it: `nameObstacles.ts` now reads a layer's
  boxes (`userData.nameObstacleRects`) beside Points.
- The hover names the two largest operations with their sum, reach and last
  day, then counts the rest. An end at 00:00Z is the start of the day after,
  so it is said as the day before, as Mecha Jono's note does. Organisations
  are counted with their period, never named.
- The key says what the tent, the tint and the pill mean. A card credits only
  the sources a drawn country carries, "IFRC GO, IFRC" and "OCHA, via HDX"
  (CC BY), and says IFRC GO's is used non-commercially. A card waits for the
  countries' outlines and for the pills' words.
- Relief is on the rail and built in the catalogue; its marker support is
  `shape-is-the-legend`.
- The tent and pill stood where the country's name goes, and the names keep
  clear of them, so a card showed Ethiopia's counts and not its name. The
  owner chose (2026-10-11) to put the name in the pill: "Ethiopia · 1 op ·
  144 orgs".
- Found on the way, not fixed here: the war map's fills draw at order 0 too,
  so a Quiet card's fills wash them as they washed relief's. Worth a look in
  War & Conflict's own record. Fixed 2026-10-11, the owner's next pick after
  HW13: its fills, edges and hatching draw at 96, as relief's tint does.
- 31 mutations, 30 killed. The survivor was a redundant removal of the key,
  which the effect's cleanup already does; it is gone from both keys.

### Step 5, on the globe: field missions (2026-10-11)

- On the grid over the two days to 11 October: 16 packages, 14 open. By
  place: disaster volunteering in five US states and Guam, naloxone in three
  states, refunds owed in Washington, a scam shield for the whole United
  States, and two with no place (public comments, the weekend's harm
  reduction).
- `heroWatchMissions.ts` draws an open mission at the place it names: its
  US state (the states' outlines Raver Watch fetches), a US territory's own
  outline (`us-gu` is Guam, not the United States), or its country. A
  subdivision of another country is never widened; a mission with no place
  drawn here is counted in the card's note. Closed missions are not drawn.
- Each place is outlined in rescue orange, over the borders as Raver Watch's
  alert outlines stand, with a clipboard at its middle and a pill naming it
  and counting its missions ("New Mexico · 1 mission"), the same pill as
  relief's: every pill of the mode is one object from one atlas.
- A mission is never shown without its limits. The hover names up to three
  missions, each with its asks, their minutes and its last day. Every family
  but public comments shares five sentences of limits ("Work in pairs. … Look
  after yourself first.") and adds its own. Said in full for each mission,
  New Mexico's two ran under the timeline on the build. So the shared
  sentences are said once, then each mission's own ("Also for …"), every
  sentence still said. The rest of the missions are counted.
- Seen whole, the United States' pills piled into one another. Each frame,
  before they draw, the pills are placed in order, relief first and then the
  places with most missions; one that would overlap a placed one waits, and
  stops being an obstacle to country names. Cards are placed the same way.
- The point tooltip was one line, cut with an ellipsis at 320 px, which lost
  relief's sums after 45 characters and would have cut the limits. It now
  wraps, keeps line breaks, and is placed by its size (3b2c1e8d). The
  country's own hover showed beside it; it now waits while a mark's shows.
- A card waits for the states' outlines while an open mission names a state.
  The states are fetched only while Field missions is on.
- Field missions is on the rail, built in the catalogue, and its marker
  support is `shape-is-the-legend`. The Missions app list (HW7), Raver
  missions (HW8) and the `field_mission` card follow.
- 29 mutations, all killed (one after a test that the states are not fetched
  while the section is off; two after tests of touching pills and of pills
  stacked on screen).

### Step 5, in the Missions app: read only (2026-10-11)

- Mecha Jono's field missions were already there. They carry
  `t=starcom_mission_package`, an author and an ML-DSA manifest signature, so
  the Missions app's receiver had accepted them since 1 October: 31 of their
  packages, field missions among them, listed as received packages.
- Two things there went against HW7 ("Read-only first: listed with its
  objectives, effort, safety limits and links … Taking and reporting come
  later"). Each ask offered "Take this on", which keeps a taking on the
  device, the option the owner passed over. And each ask printed its limits
  as "not to: Work in pairs. Never confront anyone…". The interchange says an
  ask's limits are what the doer must not do, while Mecha Jono writes rules
  to keep, so "not to:" said the opposite of a safety rule.
- A field mission (`t=field_mission`) now shows its safety limits once, under
  that heading, before its asks: the package's own, or else every ask's, each
  sentence once. It offers no "Take this on", and says it is read here, not
  taken, with taking and reporting to come through the publish-safety rules.
  Its state, place and end were already in the profile line.
- An ask's limits written as whole sentences, from any node, are said as
  "limits:", not "not to:". Another node's packages are otherwise as they
  were.
- 6 mutations, all killed (one after a test that the package's own limits
  come before its asks').

### Step 5, in Raver Watch: Raver missions (2026-10-11)

- HW8: harm-reduction field missions in both modes. Raver Watch's Raver
  missions layer, listed but never built, now draws Hero Watch's
  harm-reduction field missions (naloxone, the weekend's harm reduction) as
  Hero Watch draws them: the place outlined, a clipboard, a pill, the hover
  with every limit.
- They keep rescue orange in Raver Watch: the same mission is the same colour
  whichever mode shows it.
- The key and the card name them as Raver missions, "from Hero Watch". Where
  Field missions is on too (pinned), every mission is drawn once, keyed as
  Hero Watch's.
- Raver Watch's own reader still reads notes tagged `raver_mission` onto the
  layer; Mecha Jono has posted none, and Raver Watch's hook does not draw them.
- 6 mutations, all killed.

### Step 6: the panel (2026-10-11)

- `HeroWatchPanel.tsx`, docked in the bottom-left corner inside the camera
  buttons, while a Hero Watch section is on (not for Raver Watch's Raver
  missions alone, where Raver Watch's own panel sits).
- The week: Mecha Jono's weekly summary, folded to its title, its words as
  written. Notes' text is text: `**bold**` as bold and an http(s) address as
  a link, nothing else read as markup; a word that begins with another scheme
  stays a word.
- Relief: each country's pill, and each operation and count of organisations
  linked to its source (IFRC GO's country page, OCHA's dataset on HDX).
- What it cannot draw: open field missions naming no place drawn here, each
  with its limits, and relief notes naming no country drawn here.
- 7 mutations, 6 killed; the seventh widened the splitter, which the
  renderer's own check makes equivalent.

### Step 7, part one: Hero Watch on cards (2026-10-11)

- The owner's HW10-HW13: cards for all four (field missions, relief
  countries, the week, lifeboat stations); FIELD MISSION in rescue orange;
  a mission card's safety limits in full; a Hero Watch clip later.
- `heroWatchReports.ts` lists what Hero Watch draws to the share handle, each
  by its address: a lifeboat station at its point to 0.1°, a relief note at its
  country's middle, and an open field mission at its place's middle, on the
  layer drawing it (Raver missions in Raver Watch). A field mission's address
  is a mission package's, `30079:<pubkey>:<d>`.
- A card's lines: what the item is and where it applies, its time, then for a
  mission its safety limits in full, before the signature line, which a long
  alt text drops first. A relief card says IFRC GO's data is used
  non-commercially. The signature line says only what Hero Watch's reader
  checks: the Nostr event's signature, not the package's manifest signature.
- `field_mission` is built: FIELD MISSION in rescue orange, chosen by the item
  whichever mode draws it, refused for anything else. Relief and lifeboats
  carry no badge, as Mecha Jono's templates name none for them.
- Deeplinks take a field mission's address, and a Hero Watch section features
  its own item rather than turning the link into Intel Reports. Found on the
  way, not changed: War & Conflict links with a `focus` still open on Intel
  Reports, which `FEATURES_OWN_ITEMS` would fix if wanted. Fixed 2026-10-11,
  the owner's pick: War & Conflict features its own items from a link, so a
  War & Conflict card's own link reads back as the view it came from.
- `whyNotDrawn` asks Raver Watch, then Hero Watch, through `whyNotDrawnOf`:
  null is "drawn", undefined "not mine", so `??` would have passed over a null.
- Contract v41, its fingerprint regenerated, and a Versions line in the spec.
- 12 mutations, all killed.
- The week's front-page card follows as part two.

### Lifeboats from far out (HW15, 2026-10-11)

- With all 238 stations, Britain and Ireland were one orange mass from
  Europe height. Lifeboats now shrink as the camera rises: whole while the
  Earth's radius on screen is at least 1,000 px, a third of their size at
  400 px and below, so from Europe height (about 480 px) the coasts read as a
  dotted line. The zoom-out fade still takes them, as every layer's, when the
  Earth is smaller still.
- The glyph sprites' shader gains one uniform, `sizeScale`, read each frame
  from a layer's `sizeScaleFor`; it is 1 for every layer that gives none, so
  no other layer changes. The stations are an object of their own; the few
  tents and clipboards keep their size.
- 5 mutations, all killed.

### Step 7, part two: the week's card (2026-10-11)

- HW10's fourth card: Hero Watch's week on one front page, as the War &
  Conflict brief's and tonight's are. A shot's `subject: { week: "latest" }`
  (and a renderBatch request's `{ week }`): drawn on Relief with Field
  missions and Lifeboats pinned beside it, as far out as the brief's card. The
  planet turns to the middle of one point a section: the middle of the relief
  countries, of the mission places, and of the stations. Turned to the middle
  of every place, nine US missions faced the page over North America and left
  Ethiopia, the relief its first line names, off the card.
- Its headline is Mecha Jono's weekly roundup's title. Its lines are counted
  from what is drawn (the relief standing, the missions open and how many name
  no one place), except the week's lifeboat launches. Those are not drawn
  anywhere, since a station carries a year's count, so they are the roundup's
  own first sentence under its Lifeboats heading, as written. Where no roundup
  is read, the page says so and counts the stations drawn. A week with nothing
  standing is refused.
- A window is refused (it shows one moment), and so is a template: none of
  Mecha Jono's is a page about the week. The record keeps the page
  (`frontPage.kind: "week"`, card schema 27); tonight's caveat now names its
  kind, so a second kind of page does not reach it.
- Contract v42, its fingerprint regenerated, a Versions line and a paragraph
  in the spec. 11 mutations, all killed.

### Interchange 3.7 (Mecha Jono, 11 October)

- Their spec, "Mecha Jono → Starcom: Interchange v3.7.0" (the owner's
  artifact, 11 October), adds Hero Watch's four families to `families.json`
  (`hero_operation`, `hero_presence`, `lifeboat_station`, `hero_roundup`),
  lets a family carry its own layers (stations on Lifeboats, relief on
  Relief), and suggests Field missions for every field-mission category, with
  Raver missions too for harm reduction and naloxone. Its open questions
  (section 14) are carried over from rev 9 and long answered.
- `layersFor` follows them now: `heroes.organisations` on Lifeboats and
  Relief; field-mission categories on Field missions, the unplaced ones
  listed in Hero Watch's panel; naloxone and harm reduction on Raver missions
  too. Naloxone's missions leave Intel Reports, where they suggest it: they
  are packages, never intel reports.
- Deeplinks take any of their addresses, as section 10 asks: a scene event's
  `31923:` too, beside `30023:` and `30079:`.
- Conformance (section 13), their seven Hero Watch vectors through Starcom's
  reader: every title, place, window and ending as they expect. Said
  differences: a station's point is kept to 0.001°, not their four decimals;
  `layersFor` answers per category, so `heroes.organisations` names both
  Lifeboats and Relief where their families split them (Starcom draws each
  family on its own); and a field mission is read from its package, so its
  readable note (kind 30023, `t=field_mission`) is not read.

### HW13: Hero Watch this week as a playlist (2026-10-11)

- The owner chose it next, the cards being done. A fourth briefing playlist,
  "Hero Watch this week" (`heroes`), on the Tour button and through
  `recordTour({ playlist: "heroes" })` (contract v43), as the War & Conflict,
  raves and heat playlists are (briefing-playlists.md, BP1-BP21).
- It shows Relief with Field missions beside it, as they stand now, and stops
  at each relief country, at its largest operation (or OCHA's count where it
  has none), the largest first; then at each open field mission, ending soonest
  first, toured with the others at its place. Each stop says why it is shown
  ("Relief: 2 Red Cross and Red Crescent operations, and 144 organisations at
  work"; "A field mission, open to 8 Nov 2026") and its card's own lines, a
  mission's safety limits among them. Lifeboats are not toured: their counts
  are last year's.
- The first clip, of the build before this note, toured 7 of 13 (Ethiopia,
  then six missions) and showed two faults: its opening and end card said "the
  worst 7 of 13", and every mission stop's caption cut its safety limits
  ("+2 more in the clip's record"), the panel keeping to 38% of the frame. The
  owner chose HW16 and HW17. A stop marks the lines a clip never cuts
  (`neverCut`, a mission's limits line, found by its exact text; a mission
  whose card lacks it is not toured), the caption widens at the narrowest
  width that holds it whole, and the recorder lays out every caption on the
  first frame, so a frame too small for the limits refuses the clip at once.
- Live 2c5bdd51 (with 63c972b1, contract v43), checked from starcom.app on
  2026-10-11: the heroes clip toured 7 of 13 with every mission's limits whole
  and its opening and end card in Hero Watch's own order. The v43 note posted
  as drafted (76ee28c0-0674, J7).

### Mecha Jono's key change, prepared (2026-10-11)

Their sheet says the key changes in early November, with the new key sent
before anything is signed with it.

- **One list of their keys,** newest first: `MECHA_JONO_KEYS` in
  `config/publicInfrastructure.ts`. Raver Watch, Hero Watch and War & Conflict
  read all of them, so the new key is one line at the top of that list.
- **One note under either key.** Their notes are replaceable events, whose
  address is `kind:pubkey:d`, so the same note under two keys has two
  addresses.
  - Each store keeps the newest version under the note's identity across the
    publisher's keys (`services/nostr/publisherKeys.ts`): nothing shows twice
    while both copies stand on The Record.
  - The item keeps its own address, under its own key, wherever it is shown
    or linked.
- **Old links still work.** A card's link or QR code made before the change
  still finds its note: a deeplink's focus matches the note under any of its
  publisher's keys.
- **The owner's choice, made before the extension work.** Tested in each store
  and in the deeplink, with a second key supplied for the test.
- **On the cut-over day (added 2026-10-19, D-MX MX30):** give the next key its
  start in `KEY_STARTS` (`config/publicInfrastructure.ts`), the day NavCom's
  release gives it. Reports and Adventure returns on the old key's missions then
  go to the next key, and its settlements count. From that day nothing signed
  by the old key is read at all (MX31): the relay pool drops it. Until then
  nothing is sealed to either key (the old one is exposed, the next has not
  started), and the old one is read as before.
