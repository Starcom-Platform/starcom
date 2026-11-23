# The theatre lens and war depth (block G, item 6.2)

The war map fills only where a war is fought, and lights the item a card is
about; a person can focus one theatre, step through the briefs by day, and see
how busy each theatre has been; and the day's four worst theatres make one front
page.

## What was there (surveyed 2026-10-09)

- **The wash.** Every country on a war's Wikipedia list is filled in its tier's
  colour: the Mexican drug war fills the United States, the Arab–Israeli proxy
  wars fifteen countries, the Maghreb and Sahel insurgencies fourteen. The first
  War & Conflict card "washed red" every country of a major war, and "the item
  the card was about sat in one small country inside that wash" (globe record,
  section 21). The fix was left to this item.
- **A narrower list exists.** Mecha Jono's conflict vocabulary (Interchange 3.5,
  kept in `war-conflict/conflict_vocabulary_3_5.json`) gives each of its 30
  theatres its own countries: Russia–Ukraine is `ua` and `ru`; the Sahel is
  `ml`, `bf` and `ne`. Starcom read only a theatre's slug, name and region. The
  30 theatres cover 28 of the 48 wars; the other 20 name no theatre.
- **The brief panel** picks a theatre (its wars' countries filled, other items
  dimmed) and steps the brief's day, but the globe stays live: a past day's
  brief beside today's marks.
- **Depth data.** Items per theatre per day, from the days read (since 1
  October). Of 101 items kept on 3 October, 5 name an actor from another country
  than where it happened, 4 of them state forces. Deaths by year are two points.
- **Cards** draw the war map, wash and all (goldens `war-critical-square`,
  `war-brief-wide`). `subject.theatre` is refused: "it comes with the theatre
  lens". Compose makes one picture a card.

## Decisions

The owner's (2026-10-09, multiple choice, all as recommended):

| | Decision |
| --- | --- |
| TL1 | The wash: fill only where a theatre's fighting is, the rest of a war's list outlined by tier; and when an item is featured or a card is made, the other fills fade and the item's own country is lit. |
| TL2 | The lens focuses a theatre, one of the brief's 30: its countries lit, its items whole, the rest dimmed. |
| TL3 | The lens in the brief panel and on cards: a shot's `subject.theatre`, framed over the theatre's countries (contract v36). |
| TL4 | Stepping the brief's day shows that UTC day on the globe; Today goes back to live. |
| TL5 | Hatching marks a war's outer countries (on its list, outside its theatres), dropped first on weak devices. |
| TL6 | Arcs for state forces only, from the force's country to where the item happened, solid, labelled as the line's own reading. |
| TL7 | Sparklines of each theatre's items a day, on its brief chip and hover. |
| TL8 | A brief calendar on the timeline: a tick a day, coloured by that brief's worst tier; a click picks the day (and, by TL4, shows it). |
| TL9 | The four-theatre front page: one planet, four theatres lit and the rest dimmed, four fact rows beside it. |
| TL10 | Its four are the brief's order: worst war tier first, then most items. |

The owner's, for step 9 (2026-10-10, multiple choice, all as recommended):

| | Decision |
| --- | --- |
| TL15 | The four-theatre front page is asked for as the brief, narrowed to its top theatres: a shot's `subject: { brief, theatres: 4 }`, and a renderBatch request `{ brief, theatres: 4 }`; 1 to 4, and the brief card as it was without it (contract v37). |
| TL16 | Each theatre's row: its name, its items that day, its war's tier, and its most serious item by title. |
| TL17 | The one planet is centred among the four theatres, held out as the brief card's planet is. |

Mine (reversible):

| | Decision |
| --- | --- |
| TL11 | The theatres' countries are Interchange 3.5's, mirrored in code as the event glyphs and source names already are, and checked against the kept vocabulary by a test, so a new release that changes them fails a test rather than drifting. |
| TL12 | A war's core is its theatres' countries. A war on no theatre listing one country is filled there; one listing several is only outlined, since nothing says where in them it is fought. A country filled for one war is never outlined for another. |
| TL13 | Build in the order below; each step ships, and goldens are re-kept after looking whenever a step changes a card. |
| TL14 | A theatre's card is framed over its countries round the smallest: another country is held when its largest part fits from as near as the smallest needs (never nearer than the floor), and then as much of the rest of it as does; a theatre with no country drawn is framed on its items. Framing every country as an area is framed (largest first, 1.5 times its zoom) put Russia–Ukraine on Siberia on a square card and Taiwan–SCS on central China. |

## Build order

1. **The core fills**: theatre countries filled, the rest of each war's list
   outlined by tier (TL1, TL11, TL12). Cards change.
2. **The lit item**: a featured item's country lit, every other fill faded,
   on screen and on cards (TL1).
3. **The lens**: a picked theatre's countries lit and the rest dimmed (TL2);
   the brief's day shows that day (TL4).
4. **`subject.theatre`** on cards, contract v36 (TL3).
5. **Hatching** of outer countries (TL5).
6. **Arcs** of state forces (TL6).
7. **Sparklines** (TL7).
8. **The brief calendar** on the timeline (TL8).
9. **The four-theatre front page** (TL9, TL10).

## Step notes

### Step 1: the core fills (2026-10-09)

- `services/warConflict/theatreCountries.ts` mirrors the 30 theatres'
  countries from Interchange 3.5; a test checks it against the kept vocabulary.
- `warMapCountries` (warConflictView.ts) says, per country, whether a war is
  fought there (filled) or it is only on a war's list (outlined), at the worst
  tier of each kind. It replaces `warTierByCountry`.
- The war map fills where wars are fought and outlines, at 55%, the rest of
  their lists in their tier's colour; the key adds "outlined: on a war's list,
  not where it is fought". The United States is no longer washed by the Mexican
  drug war, nor the Gulf by the Arab–Israeli proxy wars.
- On screen, under Classic's four colours, the outlines read faintly; hatching
  (step 5) is what makes those countries read.
- 8 mutations, all killed.

### Step 2: the lit item (2026-10-09)

- When an item is featured, on screen or as a card's subject, every war fill
  fades to 8% and every outline to 20%, and the item's own country is lit as a
  featured territory is (BA3): a faint cyan fill and a 3 px near-white cyan
  edge. An item naming no country fades the map and lights nothing. Both are
  put back when it is no longer featured.
- The lit look moved to `components/Globe/litTerritory.ts`, shared by Intel
  Reports' territories and areas and by War & Conflict, so a featured country
  looks the same whichever layer features it.
- 5 mutations, all killed.
- The golden harness passed `war-critical-square` although it changed: a pixel
  counts as different only past 48 of 255, and a faint fill fading changes most
  pixels by less, so only the lit edge counted (0.17% of pixels, under 0.2%). It
  was re-kept with `qr-embed` after looking. A change to faint fills can pass the
  goldens unseen; look at the cards a fill change reaches.

### Step 3: the lens, and the brief's day (2026-10-09)

- Picking a theatre in the brief lights its countries as a featured territory
  is lit (as Mecha Jono's vocabulary lists them; for a theatre it does not, the
  countries its items name), fades every war fill and outline, and dims the
  other theatres' items. Every war stays on the map: before, picking a theatre
  hid the other wars' fills. A featured item comes first: its country is lit,
  not the theatre's.
- Stepping the brief's day sets the globe's window to that UTC day
  (`briefDayWindow`); stepping back to the newest goes back to live. Seen in the
  dev server: live, then 8 Oct 00:00Z to 23:59:59Z, then live again.
- 6 mutations, all killed. Cards never pick a theatre, so the goldens are
  unchanged by this step.

### Step 4: `subject.theatre` on cards, contract v36 (2026-10-09)

- A shot's `subject.theatre`, and a renderBatch request's `theatre`, make a card
  about one theatre by its slug. War & Conflict is drawn and read whole first;
  the lens is the brief panel's (step 3), set for the card and the person's own
  pick put back after. A card about anything else is made with no lens, so a
  pick on screen never reaches someone else's card.
- The card (`capture/theatreCard.ts`) heads with the theatre's name, counts its
  items standing by what backs them (critical, with deaths reported, report),
  names the most serious, gives its worst war on Wikipedia's list with its
  tier, and says where it comes from. Its id is `theatre:` and the slug.
- Framed by TL14. Checked over all 30 theatres on Starcom's own outlines, wide
  and square: every one frames at altitude 1, all its countries' middles in
  view, except Russia–Ukraine (on Ukraine; Russia's middle is out) and
  Taiwan–SCS (on Taiwan and the Philippines; China's middle is out).
- Found and fixed: a theatre picked in the brief stayed lit after the layer was
  turned off, with the panel that could unpick it gone. It is lit only while
  the layer is on, and the pick is kept for when it comes back.
- The War hook says which theatre it has lit (`theatreLit`), and a card waits
  for it, as an area's card waits for its area.


### Step 5: hatching (2026-10-10)

- A war's outer countries (on its list, outside its theatres) are hatched as
  well as outlined: lines in the tier's colour rising to the right at 45° on
  the ground, about 8 px apart at any zoom (every other line fades out as the
  view pulls back), at 45%, fading to 15% under a featured item or a lens.
  First shot at 60% and 7 px, they read louder than the fills where wars are
  fought; toned down after looking.
- Drawn by a shader (`components/Globe/warHatch.ts`) over the fill geometry
  GeometryFactory keeps for each country, each country with its own material
  round its middle, so its lines keep their angle wherever it is.
- Dropped first on a weak device (TL5): the quality steps gain `hatching`, kept
  only at full detail, and the first step down is now "no glow or hatching".
  The governor counts that step only while War & Conflict has something to
  hatch, as it counts the glow only while the Sun is drawn.
- Every capture draws it: a still costs no frame time. The key follows what is
  drawn: "hatched" on a screen that hatches, "outlined" on one that gave it up,
  and "hatched" on every card (a swatch's `card` form, `legendsAsCardsDraw`).
  The card's quality caveat names only clouds and the atmosphere, as before.
- 23 mutations, all killed. The card key's use of the card form
  (composeShareCard) is checked by the golden cards, whose stated key it
  changes.

### Step 6: arcs of state forces (2026-10-10)

- An item naming a state force (`state_force` in Mecha Jono's actor kinds) from
  another country than where it happened draws an arc from that country's
  middle to the item's mark: solid, thin, in the item's backing colour, faint
  at the force's end and strong at the item's, so it reads one way. Only state
  forces (TL6): an armed group's country says where it comes from, not that a
  state acted. Only where the item names the country it happened in, so
  "another country" can be told; one arc a country an item names.
- Its hover is the line's own reading: "Armed forces of United States, from
  United States, named in "…". The arc joins their country to where it
  happened; it is not a path anything took." The key gains an arc swatch, on
  screen and on cards: "an arc: a state's forces from another country". Its
  first label, the hover's reading in full, ran off the cards' edge: a key
  line wraps whole swatches but did not wrap a label within itself. It does
  now (shareCardLayout), and the label is short as every key line is. Dimmed
  with its item under a lens or a featured item.
- Drawn by the globe's arcs layer beside the contradiction links. Its height
  rises 0.2 radii for each radian it reaches, between 0.03 and 0.25: at 0.3 up
  to 0.45, an arc from across the planet looped outside the globe's edge and
  took the picture over. Arcs no longer grow in over a second, so a card never
  catches one half-grown.
- Found on the way: the arcs layer's hover is set as HTML (float-tooltip), and
  the contradiction links' labels quoted report text unescaped. Every arc label
  is escaped now (`utils/escapeHtml.ts`).
- Of the items kept on 2 October, two draw an arc: United States forces in
  Iraq, Pakistan's in Afghanistan.
- 18 mutations, all killed, and 4 more of the key's label wrapping. The arcs'
  wiring into the globe (Globe.tsx) is checked on the rendered globe and the
  golden cards.

### Step 7: sparklines (2026-10-10)

- Each theatre chip in the brief carries its items a UTC day for the two weeks
  ending on the brief's day (`theatreDays`): a bar a day in its tier's colour,
  its own busiest day full height, the brief's day at full strength and the
  rest at half, a stub for a day with none, nothing for a day before anything
  was read (since 1 October). The chip's hover says the numbers: "Russia–Ukraine
  war, items a day (UTC): 1 Oct 0 · 2 Oct 3 · …". Seen in the dev server.
- On screen only: the panel is not part of a card. The goldens are unchanged.
- 11 mutations; 10 killed, and the one survivor was a check no count could
  reach (items after the brief's day were already outside the window), removed.

### Step 8: the brief calendar (2026-10-10)

- The timeline carries a strip just under its track: a block for each day read,
  at that UTC day's place on the axis, in its brief's worst war tier's colour (a
  day on no war's list in the track's own tone), named in words ("War &
  Conflict Brief, 9 Oct 2026: 24 items; worst, Russia–Ukraine war, a major
  war"), the day shown outlined. A click picks the day as the panel's arrows do:
  the brief and the globe's window follow, and the newest goes back to live
  (TL4). Seen in the dev server: 9 Oct picked showed 9 Oct 00:00Z to 23:59:59Z,
  the newest went live.
- The timeline is drawn in another part of the page than the globe, so the
  globe publishes the days (`services/warConflict/briefCalendar.ts`) and the
  timeline draws them, as the legend store bridges the layers and the card.
- Two things found while checking it, fixed: the strip first sat inside the
  track, where the live slider's thumb took the newest days' clicks; and the
  key panel, long with War & Conflict's sources, ran down past its dock over the
  timeline's right end and its LIVE button at 1400×900, so a person could not
  get back to live. The key now shrinks to its dock and scrolls inside, its
  header staying in view.
- On screen only; the goldens are unchanged. 12 mutations, all killed.

### Step 9: the four-theatre front page, contract v37 (2026-10-10)

- 9a: the lens is now a set of theatres, and a card sets its own over the
  person's pick (Globe's `cardLens`): one theatre for a theatre card, none for
  any other card, the front page's four; null hands it back. The person's pick
  in the brief panel is never set by a card, so its chips no longer flip while
  a card is made. 7 mutations, all killed.
- 9b: a shot's `subject: { brief, theatres: 1–4 }`, and a renderBatch request
  `{ brief, theatres }` (TL15), light the brief's worst theatres in its order
  (TL10) together on one planet, centred among their frames, the brief card's
  distance out (TL17). A theatre that cannot be framed is still lit and rowed.
  The card's lines are the day's count, then a row a theatre (TL16): "Russia–
  Ukraine war · 8 items · a major war" and "Most serious: …", each brief theatre
  now carrying its most serious item that day (a critical warning, then deaths
  reported, then the newest). Its record says which it lit (`frontPage.lit`,
  card schema 24). Golden shot `war-front-page-wide`.
- The title cut moved to `utils/cutTitle.ts`, so the brief, in services, does
  not reach into the card features for it.
- 16 mutations, all killed.

### Found after step 9: a card's skin after a mode switch (2026-10-10)

- Chasing an early card that showed Sudan lit (not reproduced since: nothing was
  lit in the scene on a fresh try), a card made seconds after a layer switch on a
  cold page was found drawing the previous mode's shader skin, cyan with a grid,
  under a record and footer naming "Blue Marble". Reproduced on starcom.app.
- Two causes. A layer of another mode builds a new engine; its skin's textures
  reported ready before its material was built and handed over, while the globe
  still drew the old engine's, and the surface counted any material as ready.
  And whenReady looked before the switch had rendered, at the old mode's
  surface, settled. Now the surface is ready only when the globe draws the
  material the engine built for its skin, for the mode shown
  (`surfaceReadiness`'s `built`, `GlobeEngine.getMode`), and whenReady lets a
  frame pass before it looks. Seen in the dev server: whenReady said "the
  planet's skin" until Blue Marble drew, and two early cards drew it.
- 3 mutations; 2 killed, and the survivor was a second frame no test could tell
  from one, dropped after both early cards drew Blue Marble with one.
