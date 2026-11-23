# Decision D-DP — Diplomacy for education and investigation (K12)

**Status:** decided 2026-10-13 (DP1–DP8, the owner's picks); building in the
order below. K12 of the critique audit (`00-current-state/critique-audit.md`,
section 11) said diplomacy is "built for education and investigation: honest
labels, events where they happened, an event drawer, arcs, the timeline, a
primer, start-a-case, related intel and a country brief". This record is how.

## Where the layer stands (read from the code, 2026-10-13)

- **The data:** one GDELT 2.0 snapshot made at build time
  (`scripts/snapshot-gdelt.mjs` → `public/data/gdelt-events.json`, 2.66 MB,
  96 fifteen-minute windows, the 24 hours before the build). Each row keeps
  its id, both actor countries (ISO3), the CAMEO code and root, the Goldstein
  score, where it happened (ActionGeo), the source's link and when it was
  added. Diplomacy reads roots 03–08, Conflict Zones roots 14–20.
- **What it is:** on 2026-10-13, 12,074 cooperative rows from only 2,751
  articles (one article was 146 rows); 1,026 distinct places, the capitals
  first (Moscow 535 rows, Washington 434, Kyiv 333); 331 rows at the middle of
  the United States, GDELT placing them at the country for want of a city,
  which the snapshot does not record; 1,129 pairs of countries, Russia–Ukraine
  (516) and Russia–United States (352) first.
- **What is drawn** (`useDiplomaticEvents3D.ts`): one mark per country at its
  centre, each event counted for both actors; size by count, colour by the
  most common category. The event's own place is never used. Hover names the
  country's count; a click does nothing. One arc per pair, one colour, when
  "connections" is on.
- **Labels** (`diplomaticEventTheme.ts`): three categories in CAMEO's words
  (agreements signed, 057; consultations, 04; material cooperation, 06).
  Roots 03, 07 and 08, and root 05 but for 057, are loaded and dropped.
- **Time:** the layer ignores the shared time window (D-E); its own slider
  counts hours back from the snapshot.
- **Country popup** (`CountryInfoPopup.tsx`): a list of the country's events,
  each linking its source.
- **Missing:** an explainer of CAMEO and Goldstein anywhere in the app; a
  source list on a Case (`IntelCaseUI` has none); related intel by country and
  window.

## Decisions

| | Decision |
|---|---|
| DP1 | (2026-10-13.) **One event per article.** GDELT rows sharing an article, the same two countries and the same CAMEO code count once; counts say reports. |
| DP2 | (2026-10-13.) **Where it happened, by default.** Each event at its own place; a switch gives "who was involved", each actor's country. |
| DP3 | (2026-10-13.) **A richer snapshot:** each event's place name, its precision (city, state or country) and GDELT's mention, source and article counts. An event GDELT placed only at a country is drawn as a hollow ring that says so. |
| DP4 | (2026-10-13.) **Every cooperative root, in CAMEO's words:** intent to cooperate (03), consultations (04), diplomatic cooperation (05), agreements signed (057), material cooperation (06), aid (07), yielding (08), each with its own colour and glyph. |
| DP5 | (2026-10-13.) **Arcs on selecting a country:** to its counterparts, cooperation and conflict in two colours (conflict from the same snapshot's CAMEO 14–20), width by reports. Nothing selected, no arcs. |
| DP6 | (2026-10-13.) **The country brief** now: this window's relations, displacement and resource rank. Sanctions programmes come with K11's sanctions feed, from the same source. |
| DP7 | (2026-10-13.) **Cases gain a list of sources** (each article's link, outlet and date). "Start a case" from an event seeds one with its articles, countries and CAMEO code. |
| DP8 | (2026-10-13.) **The event drawer is a docked panel**, as AI Watch's: an event's actors, CAMEO code with a plain definition, Goldstein with its scale, when it was reported, its sources, start-a-case and related intel; a country's events and brief when a country is selected. |
| DP9 | (2026-10-13, after the hidden floor below.) **Everything shown, ranked by outlets.** Reports are gathered into stories (the same two countries, category and place in the day); a place's mark is sized and brightened by how many distinct outlets reported its stories, and a single-outlet story is drawn smaller and dimmer, never hidden. The Goldstein floor and the regions pass-through go. |
| DP10 | (2026-10-13.) **Four filters, each saying how many events it keeps:** outlets per story (at least 1, 2 or 5); said or done (GDELT's QuadClass: verbal or material cooperation); the coder's confidence (the Mentions table's, 10–100%); lead paragraph only (IsRootEvent). The last two need snapshot version 3. |
| DP11 | (2026-10-13.) **Goldstein is read, never a filter:** in the drawer, on its −10 to +10 scale, with the codebook's caveat that it scores the type of event, not this event. |
| DP12 | (2026-10-13.) **A place's mark:** a disc in its most common category's colour with the whole globe in view; up close, that category's glyph on it, as Intel Reports draw their emblems. |
| DP13 | (2026-10-13.) **A country-only place** (GDELT's ActionGeo_Type 1) is a hollow ring in the Disc and Glow styles, and a dashed ring under the Ring style; dashed means "not exact" elsewhere in the app. |
| DP14 | (2026-10-13.) **One mark per place GDELT states** (a city, state or country point), not clusters on screen. |
| DP15 | (2026-10-13.) **Both GDELT layers follow the one shared time** (D-E): Diplomacy's and Conflict Zones' own "Time Range" sliders go. Live shows the snapshot's whole day; a paused moment or window shows what GDELT added within it, and the key says when the window reaches past the snapshot's day. |
| DP16 | (2026-10-13.) **While Diplomacy is drawn, a country clicked or found by search opens in its drawer**, with arcs to its counterparts, not as the modal popup, whose dimmed backdrop would hide the arcs. Other layers keep the popup. Close or Escape lets it go. |
| DP17 | (2026-10-13.) **Energy figures load on demand, never in the app.** EIA's oil, gas and renewables production (its keyless bulk file, public domain) reach Starcom as a signed, replaceable intel event Mecha Jono posts on The Record once a year, which peers can reuse; until it is posted, or when The Record does not answer, a 3.3 KB file (compressed) fetched only when a brief or Resource Zones asks. No one needs an EIA key for them. The event's shape is proposed to Mecha Jono in a note the owner approves. |
| DP18 | (2026-10-13.) **A resource line reads rank, amount and year, with the percentile beside it:** "Crude oil: rank 2 of 99 producers · top 1%, 9.89 million barrels a day · EIA, 2025". Minerals by the best of USGS's five commodities; water per person. |
| DP19 | (2026-10-13.) **Displacement both ways** (UNHCR): from the country (its refugees and asylum seekers abroad, people displaced inside it) and hosted (the refugees and asylum seekers it shelters). |

## Build plan

Each step: failing tests first; mutations; the affected tests; a build; the
golden cards where the globe's picture changes; a probe in a browser on the
build; push; the deploy checked live. New words go in the catalogue (D-ML).

1. **The snapshot** (DP3): the place's name and precision, and the three
   counts, kept per row; the reader takes the old file and the new. Then
   **one event per article** (DP1), pure and tested on the kept snapshot.
2. **Categories** (DP4): seven, in CAMEO's words, colours and glyphs; the
   settings list them.
2b. **Stories and filters** (DP9–DP11): stories and their outlets, pure and
   tested on the kept snapshot; said or done; settings v5 drops the
   importance floor and the regions pass-through and holds the filters; the
   layers popup offers them with counts. Then **snapshot version 3**: each
   row's IsRootEvent, and the coder's highest confidence from the same
   window's Mentions file (a missing file is listed, its events' confidence
   unknown, never guessed); the two filters that need them. (Built from the
   whole day's Mentions files, not only the event's own window: a later
   mention can be the surer one.)
3. **Where it happened** (DP2, DP3, DP12–DP14): one mark per stated place,
   ranked by outlets (DP9); a hollow ring for a country-placed event, dashed
   under the Ring style; glyphs up close; the switch to "who was involved".
   Golden cards re-kept if the picture changes.
4. **Time** (D-E, DP15): the layer reads the shared window; the snapshot's day is
   said where the window reaches beyond it; Conflict Zones too, and both sliders go.
5. **The drawer** (DP8): a click on a mark opens the panel; CAMEO's code with
   a plain definition, Goldstein with its scale; the primer, what CAMEO and
   Goldstein are and what machine-coding from the news cannot tell.
6. **Arcs** (DP5): on selecting a country.
7. **Start a case** (DP7): Cases' sources list, shown in Cases; seeded from
   the drawer.
8. **Related intel:** the reports about the same countries in the window, in
   the drawer.
9. **The country brief** (DP6, DP17–DP19): relations, displacement, resource rank.
   9a, energy figures on demand: a script turns EIA's bulk file into the
   fallback file; the reader asks The Record for Mecha Jono's event first;
   Resource Zones reads the same, so the layer and the brief agree. 9b,
   displacement by origin beside the hosted figures. 9c, the brief in the
   drawer's country view. Then the note to Mecha Jono, for the owner.

## Built

- **Step 1** (1b39b217, live 2026-10-13): snapshot version 2 keeps each
  row's place name, precision and GDELT's three counts; the reader takes
  version 1 or 2. `oneEventPerArticle` counts an article, a pair and a CAMEO
  code once (the kept fixture's 31 cooperative rows are 13 events).
- **Step 2** (cf218090): seven categories in CAMEO's order, keyed by what
  they are (`intent`, `consult`, `diplomatic`, `agreement`, `material`,
  `aid`, `yield`; they were `treaty`, `summit`, `tradeAgreement`). Names in
  the catalogue in six languages; colours in the theme, cool for words and
  meetings, warm for what changes hands, no reds; glyphs (Lucide's
  message-square-quote, messages-square, thumbs-up, signature, package,
  gift, undo-2) in the Symbol registry, none another meaning's, provisional
  for the glyph sheet. Settings v4 keys the toggles by category, carries a
  browser's stored choices over and turns material cooperation on (its
  false was the old default, the stance of v3). The layers popup and the
  country popup show each category's glyph and colour; the globe's key
  lists them in CAMEO's order.
- **Step 2b, first half** (834cb15a): `diplomaticStories.ts` gathers the
  events into stories (pair, category, and the place's point and precision,
  however its name is spelled) and counts distinct outlets (the site, without
  www., m. or amp.; a citation as given; never none). The Goldstein floor and
  the regions pass-through are gone (settings v5); the filters are outlets
  1/2/5 and said or done, each choice and each kind of event saying how many
  events it keeps; confidence and lead-paragraph filtering is written for
  snapshot version 3, an unknown never passing. On the build, 5,552 events in
  the window: 1,796 in stories told by two outlets or more, 528 by five; 197
  countries drawn, 97 at two outlets.
- **Step 2b, second half** (97e7369d): snapshot version 3. The parser reads
  IsRootEvent; `gdeltMentions.ts` keeps each held event's surest mention
  from the day's 96 Mentions files, fetched after the exports (all 96 in
  under 4 s locally), and the snapshot lists any that did not arrive.
  Versions 1 and 2 still read. Of 5,542 cooperative events on 2026-10-13:
  1,512 extracted at 50% or more, 847 at 80% or more, 2,934 in a lead
  paragraph. The popup offers both filters with their counts, and neither
  where a snapshot does not carry them.
- **Step 3a** (77aef894, live): `diplomaticPlaces.ts` gathers the events into
  places (point and precision); a mark per place, sized by distinct outlets,
  a place told by one outlet the smallest and at half opacity; a country-only
  place a hollow ring, a dashed one under the Ring style (`dashedRing`, a
  shader style no one can pick; the key and the card draw it); the hover in
  the catalogue's words ("Moscow, Moskva, Russia: 266 reports, told by 132
  outlets; 61 of them consultations …"). "Marks at: where it happened / who
  was involved" (settings v6; every browser starts at where it happened). On
  the build: 883 places, 736 at points and 147 at a country. Found: the
  layer's build did not depend on the chosen mark style, so a style picked
  showed only after something else changed; it does now.
- **Step 3b** (562a48bf): from the full-detail tier (under 1.5 globe radii;
  the default view is 2.5) each place is its kind's glyph on a mark of its
  colour (`diplomacySprites.ts`: seven kinds by three backings, disc, ring,
  dashed ring), dimmer when told once, never under 18 px; the discs stay
  where the atlas cannot be baked. The key draws each kind as its glyph in
  its colour, one line for both (`LegendSwatch.symbol`); the card keeps
  coloured discs.
- **Step 4** (790847a6): `gdeltTimeSpan.ts` and `useGdeltSpan` give every
  reader the same span — the layer, the popup's counts, the country popup,
  the header's search — the snapshot's day live (its oldest window to its
  own time, `LoadedGdeltSnapshot.from`), the shared window paused. The key
  says "holds only 13 Oct 00:00Z – 17:43Z of the window shown" where the
  window reaches past the day (the overlap, not the whole day), and "holds
  nothing in the window shown; its day is …" as a line of its own when
  nothing is drawn. Settings v7 drops the stored ranges. On the build: live
  897 places; paused on 13 Oct, 775; paused in August, none, said so.
- **Step 5** (156bb34a, a27e0fe3; live): `DiplomacyPanel.tsx`, docked bottom
  left. A click on a place lists its events, the most widely told first:
  the two countries (the territories' directory names them), CAMEO's code
  and name (`cameoCodes.ts`, all 79 cooperative codes checked against the
  CAMEO manual's list; eleven of my first names differed and were taken
  from it), Goldstein on its scale and the caveat, when GDELT added it, its
  story's outlets, the coder's confidence and the lead paragraph, and a
  link to the report; 25, then how many more; the primer. The click is
  CommHubs' way (`pickRadius.ts`, `diplomaticPick.ts`); a place under the
  pointer claims the area beneath it (`CLAIM_RANK.places`, 50). Found on
  the build and fixed: every point layer's hover, and this click, answered
  marks beyond the horizon (a hover over Greenland named Fort Walton
  Beach, Florida); a mark now answers only when the line from the camera
  clears the globe. Known: at the limb, where marks crowd, the hover (first
  along the ray) and the click (nearest the pointer) can name two places.
- **Step 6** (837e4e2f, DP5, DP16): no arcs unless a country is selected;
  then one to each counterpart, cooperation in the connection colour and
  conflict (14–20, read only then) in the danger colour, lower, width by
  reports, never fainter than half. While drawn, Diplomacy takes the
  selected country (`countryPanel.ts`): no popup; the drawer lists its
  counterparts with cooperation and conflict, then its events; a place
  shows over the country. A click takes a place only within its own drawn
  radius and 2 px (a flat 12 px took clicks beside small marks from the
  country). On the build: Egypt, 23 counterparts (Saudi Arabia 25/5, Sudan
  7/18); Niger, 2.
- **Step 7** (79907e2a, DP7; live): a case keeps a list of sources, each
  a web link with its outlet, when it was reported and when it was added;
  adding and removing one is logged (`SOURCE_ADDED`, `SOURCE_REMOVED`) and
  the case's replay shows the list as it stood. Cases shows them as
  Articles, with a form to add one. "Start a case" on an event in the
  drawer opens a case titled by the two countries and the kind of event,
  its description saying where, what CAMEO calls it and when it was first
  reported, its sources the story's articles; Cases opens on it. On the
  live site: a case from Norway and Israel, with its two articles.
- **Step 8** (d19d9967; live): under the events, the Intel Reports about
  the same countries (a place's countries, or the selected country) in the
  time shown, eight then how many more, each opening in Intel. A report is
  about a country by its jurisdictions. On the live site: Russia, two
  reports.
- **Step 9a** (d94016bd, DP17; live): `energyProduction.ts` asks The Record
  for Mecha Jono's `energy_production` notes (kind 30023, one address per
  series, newest standing, `t=retracted` withdrawing) and reads
  `public/data/eia-production.json` only for a series they do not hold, or
  after six seconds without an answer. `npm run data:eia` makes the file
  from EIA's keyless bulk file (`eiaBulk.ts`): production, annual, countries
  only, every figure for the year most countries' latest are for; on
  2026-10-13 oil 99 producers in 2025, gas 96 and renewables 205 in 2024,
  6.6 KB, 3.3 KB compressed. Resource Zones reads the same, with no key: on
  the live site, oil drawn on 91 country parts and gas on 81 for a visitor
  without one (none before). Nothing is fetched until the layer or a brief
  asks.
- **Steps 9b and 9c** (ab2f3f16, DP6, DP18, DP19): under the selected
  country's relations, its displacement (UNHCR by origin, beside the hosted
  read; Stateless and Tibetan are not countries) and its resources: oil,
  gas, renewables, its best mineral and freshwater per person, each as rank
  of producers, the percentile Resource Zones colours by, the amount in whole
  units, source and year, "posted by Mecha Jono" when read from The Record.
  Read on a country's first selection; a source that does not answer is
  named. On the build, Russia: oil rank 2 of 99, 9.89 million barrels a day;
  gas 2 of 96; gold 2 of 13; freshwater 20 of 183; 99,360 refugees abroad,
  11,811 hosted (UNHCR, 2025).
- **DP6's sanctions** (27c577dc, with K11's board feeds, D-BF step 6): the
  brief opens with OFAC's SDN entries with an address in the country, the
  people among them counted, never named, its four largest programmes, and
  the day OFAC's list was read (`countrySanctions.ts`). Russia: 5,207
  entries, 1,730 people.

## Found while building

- **A hidden floor** (step 2). `eventFiltering.importance` is `'medium'`,
  Goldstein 4 or more, and nothing in the app sets it. Goldstein is a fixed
  score per CAMEO code, so the floor is a category filter in disguise: of
  the 2026-10-13 07:30Z snapshot's 5,615 cooperative events (one per
  article), it hides 3,416 — 2,510 of 2,778 consultations and 906 of 929
  acts of diplomatic cooperation — and none of the other five. Put to the
  owner, who asked for a better way altogether: DP9–DP11.
- **What measures importance in GDELT, measured** (2026-10-13; two hours of
  export and Mentions files, 06:00–07:45Z, 484 cooperative events one per
  article; and the day's snapshot). The codebook: Goldstein "is based on the
  type of event, not the specifics of the actual event record"; the export's
  NumMentions, NumSources, NumArticles and IsRootEvent cover only "the 15
  minute update in which it was first seen" and are "included for legacy
  purposes", the Mentions table "should be used instead in most cases"; its
  Confidence, 10–100%, "indicates how aggressively GDELT had to perform
  tasks like coreference" to extract the event.
  - The export's counts are first sightings: 480 of 484 events name one
    source. Nor does an event gather mentions later: of 388 events, 4 were
    mentioned again under the same id in the next 90 minutes. GDELT makes a
    new event per article, so corroboration is found by gathering events into
    stories, not in any count GDELT keeps.
  - Stories (pair, category, place) in the day's snapshot: 3,757; 520 told
    by two outlets or more, 174 by three, 59 by five, 9 by ten, in every
    category. The most told: Russia–Ukraine yielding at Moscow, 17 outlets.
  - The coder's confidence varies within every category; about 60% of events
    were extracted at 20% or less. Events in a lead paragraph: 40–66% by
    category. Actor type codes are blank for 440 of 484 country actors, so a
    government-to-government filter has little to stand on; not offered.
  - Mentions files are 60–90 KB zipped a window: a day is about 7 MB more for
    the build to fetch.
- **The layers popup could not see a drawn layer** (step 2b). Popups render
  above the layer control's provider, so the popup asked only whether an
  overlay was on: Diplomacy, Resource Zones and Conflict Zones drawn from a
  sub-mode or a pin read as off — no status badge, and counts of 0. The
  provider now publishes what it draws (`drawnGlobeLayers.ts`; 8451f449).
- **One key, one copy of the data** (step 2b). `pollerRegistry` gives a second
  subscriber of a key the first one's handle, but each `useRealDataLayer`
  kept its own copy: only the first subscriber ever got data, and the first
  to unmount stopped the key for all, ending the globe's refresh when a popup
  closed. One shared entry per key now, held while any enabled subscriber is
  (2904456d).
