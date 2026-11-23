# Raver nights (block G, item 6.3)

Each scene event lights up at its local start as the night reaches it, an event
in a hot town carries a heat halo, and a card shows tonight.

## What was there (surveyed 2026-10-10)

- **Scene events** carry their own start and end, in unix seconds, and the zone
  they were listed in (`startTzid`). Live, an event is drawn up to a week ahead
  of its start, dim (`notBegunAt`), and whole from its start; it fades over its
  own night. A replay or a sweep clip draws each at its own start.
- **HeatRisk** notes give a town's National Weather Service HeatRisk, 0 (Green)
  to 4 (Magenta), for a day, at the town's point. Nothing joins them to events.
- **Tonight** is the Raver Watch panel's window: now to twelve hours on.
- No card is about tonight; the closest are a venue night's card and the heat
  embed.

## Decisions

The owner's (2026-10-10, multiple choice, all as recommended):

| | Decision |
| --- | --- |
| RN1 | An event lights up with a flare at its start: dim before it, a ring that swells and fades as it starts, then whole. In a night sweep clip the events flare one after another as night moves west. |
| RN2 | An event in a town whose HeatRisk that day is Orange (2), Red (3) or Magenta (4) gets a soft halo in that level's colour; Yellow (1) and below, none. |
| RN3 | The tonight card is a subject of its own: `subject: { tonight: 'latest' }` (contract v38). The planet turned to where night is falling over tonight's events, a row per region (its events, how many under heat, the first to start), the halos and flares drawn. |
| RN10 | (2026-10-10, after seeing the first live card) Tonight's card draws only tonight's events: tonight's twelve hours set on the timeline while the card is made, the person's timeline put back afterwards. Events already under way as tonight begins are still drawn, and a caveat says how many are drawn and not counted. |

Mine (reversible):

| | Decision |
| --- | --- |
| RN4 | "In their town": an event within 25 km of a HeatRisk note's town, on the day that note covers the event's start. The worst level among them. |
| RN5 | The flare runs over the first 20 minutes after a start, in the world's time, so the screen and a clip agree: live, it is seen as it happens; in a sweep of a night over twenty seconds, for about half a second of footage. |
| RN6 | Build in the order below; each step ships, and goldens are re-kept after looking whenever a step changes a card. |
| RN7 | Tonight is the twelve hours from the shot's moment (`time.at`), or from now while live, as the Raver Watch panel's Tonight. A window is refused: tonight starts at one moment. The events counted are every scene event read that starts in it, placed, not called off and not news, whatever the person's own layers show. |
| RN8 | A row a region, by the zone each event was listed in: a US zone as its region (US Pacific, Mountain, Central, Eastern, Alaska, Hawaii), Europe and Australia whole, any other zone by its city ("Toronto time"). Rows in the order of each region's first start, that start as its zone's clock reads it ("first 21:00 CDT"); six rows, the rest counted. |
| RN9 | Tonight's card takes no template: the templates are Mecha Jono's, and none is a page about tonight. Its record keeps the page as a front page of its own (`frontPage.kind: "tonight"`, card schema 25), beside the brief's. The planet turns to the middle of tonight's events, at the brief card's distance. |

## Build order

1. **The flare** at an event's start (RN1, RN5).
2. **The heat halo** (RN2, RN4).
3. **The tonight card**, contract v38 (RN3).

## Step notes

### Step 1: the flare (2026-10-10)

- A scene event flares through the first twenty minutes after its start
  (`flareAt`): a ring round its glyph in its colour, from 1.3 times the glyph
  to 3 times, fading from 85% to nothing. A town's mark flares for its newest
  start. A featured item elsewhere dims it as it dims the glyph. The key says
  "just started: a ring that swells and fades" while one is drawn.
- The moment is the world's: live it is the minute, so a ring changes once a
  minute; in a sweep each frame is its own moment, so it swells smoothly.
- Seen in the dev server on a card of 03:05Z on 10 October: Austin's and Los
  Angeles's 8 pm events ringed, the key naming it.
- Found: with Scene events loaded, a shot's moment or window was sometimes
  refused, "the timeline had not changed after 3 s", on the dev server and on
  starcom.app, and the same shot went through on another try; sampled
  afterwards, the timeline had taken the window. A change of the timeline
  rebuilds every layer's marks, which under software rendering with hundreds of
  events ran past the handle's 3 s. A timeline change is now waited for 15 s
  (`TIMELINE_WAIT_MS`); every other wait keeps 3 s. Tests of a timeline taking
  4 s to change fail at 3 s and pass now, for a window and for a moment.
- 13 mutations, all killed (two only after tests that only a scene event
  flares, and that its ring starts outside the glyph).

### Step 2: the heat halo (2026-10-10)

- A scene event standing in heat carries a halo of light under its glyph
  (`heatAround`): the worst HeatRisk of a town within 25 km whose day covers
  the event's start, when it is Orange (2) or worse, in that level's colour on
  the National Weather Service's own scale, a new reading scale in the tokens
  (`DATA_SCALES.heatRisk`: Orange, Red, Magenta for 2 to 4). The HeatRisk layer's
  own marks keep their level colours (amber at 2, red from 3); the halo uses the
  NWS scale, as the owner's choice showed it, so Magenta reads apart from Red.
- The halo is drawn just before the glyphs among the layer's marks, so it lies
  under them. The heat notes are read whether HeatRisk is drawn or not. The key
  says "in a town at HeatRisk 3 (Red) that day: a halo" for each level drawn.
- 11 mutations, all killed.
- Found while building step 3: a HeatRisk note applies from when it was
  published, up to a week before the day it names, and the halo read that whole
  span, so an event in Los Angeles on 2 October wore the Magenta forecast for
  the 4th to the 8th; the 2nd was Orange. A note's day is now the 24 hours
  before it ends: every one of the 69 kept notes with a level ends at 06:00
  local the morning after the day it names (RN4 as decided). In the kept notes
  at 23:00Z on 2 October, 89 events stand in heat, not 123. 3 mutations, all
  killed.

### Step 3: the tonight card (2026-10-10)

- A shot's `subject: { tonight: "latest" }`, or a renderBatch request
  `{ tonight: "latest" }` (contract v38). Scene events are drawn and read whole
  first; tonight is the twelve hours from the shot's moment, or from now while
  live (RN7); the planet turns to the middle of tonight's events at the brief
  card's distance; the card's lines are how many start and how many stand in a
  hot town, then a row a region (RN8). A window is refused, a template is
  refused (RN9), and a night with no events is refused, saying from when.
- The card's record keeps the page as a front page of its own,
  `frontPage.kind: "tonight"` (card schema 25); every reader of a front page
  takes only its title and lines, so the layout and the alt text read it as
  they read the brief's.
- The handle's wait for a feed to be read whole is one wait now, for War &
  Conflict and Scene events alike.
- In the kept notes at 23:00Z on 2 October: 199 events start in the twelve
  hours, 89 in a hot town, over seven regions, six of them rows. Golden shot
  `raver-tonight-wide` added at that moment.
- 14 mutations, all killed.
- Live on starcom.app (0773995e) at 05:54Z on 10 October: 9 events in the
  twelve hours, a batch request made one, and a window was refused. The
  picture disagreed with the lines: the globe drew Scene events as the layer
  stood at that moment, events under way with their halos and dim ones up to a
  week ahead, about twenty marks beside a count of 9 with none in heat. The
  owner chose RN10.
- RN10: the stage holds the person's timeline before the shot's own moment
  moves it, sets tonight's twelve hours once tonight is read, waits for the page
  to be ready again, and puts the timeline back after the plan or the card,
  however it ends: live, a dragged window, or a moment in its step, as the
  person could have set it. A put-back that fails is a warning on the result.
  The shot as drawn states tonight's start as its moment (`time.at`), so it
  makes the same card again. A tonight page counts the events under way as it
  begins (`underWay`, card schema 26), and the card says "N events under way at
  HH:MMZ are drawn, not counted" when any are. 16 mutations, all killed.
- (Superseded below: tonight's card now flares from tonight's start.) With
  tonight's hours on the timeline the card drew no flares, a window's moment
  being its end, twelve hours on. The halos are tonight's own: in the kept notes at 23:00Z on 2 October, Boston's
  events under Cambridge's Orange, Orange County's and San Diego's under Red,
  and 5 events under way are drawn and said. Goldens re-kept from a97af6c7.
- Found on the second live card (268306a9, 08:19Z on 10 October): its key said
  "just started" of events starting twelve hours on, and a caveat said the
  listing was "12h older than the moment shown". The cause was older than the
  card, from step 1: Raver Watch measured its moment as the end of the
  timeline's window, and a moment paused on the timeline, a card's `time.at` or a
  sweep clip's frame, comes with the axis step around it, about a day for weeks
  of events. So at a paused moment flares and fades were measured from the end
  of that step, and a sweep's frames within one step shared one moment: the
  smooth swell step 1 claimed for a sweep was never checked, and did not happen.
- Fixed: Raver Watch takes the moment the timeline is paused at (the moment
  Earth Weather already used); a range read to its end, as a dragged window is,
  flares nothing, having no one moment; and the timeline can hold a range read
  from a moment inside it, which tonight's card uses, so tonight is shown from
  its start: what has just started then flares, the card's moment is tonight's
  start, as its shot states, and no caveat calls the listing older than it.
  6 mutations, all killed.

### The night sweep clip, checked (2026-10-10)

- Recording one on starcom.app (dee4ed5c) with Scene events on, 02:00Z to
  06:00Z on 10 October, was refused: "The caveats need 6 pages, over the
  limit of 3". Raver Watch names its feed with what it draws at that moment
  ("… (92 past its end, not drawn; 225 not begun)"), and a clip kept a feed's
  history by its name, so a sweep made a history, and a "changed during this
  clip" caveat, for each frame. A clip that swept nothing was refused outright
  as soon as a count changed, when an event began. A clip now knows a source
  by its short name (be5a12d5), named in full where its name held still.
- Then recorded on the build of be5a12d5 with the live notes: 65 frames, the
  moment 3.75 minutes on each. At 03:00Z, 8 pm in California and 10 pm in
  Texas, rings appear on those towns' events, swell and fade over the next
  five frames; the frames before show none. The flares come in turn, as RN1
  asked; the check script is `.local/scripts/rn1-sweep-check.mjs`.

## Aligned with Mecha Jono's sheet (2026-10-18)

Mecha Jono's "Raver Watch content for Starcom" sheet (v1.6) was checked against what Starcom reads (v1.2), at
the owner's ask from Mecha Jono's Handoff Board. Starcom reads every sub-layer and the withdrawal form correctly.
The owner chose to fix the mismatches:

| | Decision |
|---|---|
| RN11 | **This weekend** is Friday 00:00 to Monday 06:00 in each event's own time zone, as Mecha Jono writes it, in place of Friday 18:00 to Monday 06:00 in the viewer's. |
| RN12 | **What is never sent goes.** The `t=raver_mission` and `t=harm_reduction_site` mappings and `level=info` are not in the sheet, and Mecha Jono sends none of them; they are removed. |
| RN13 | **Line-ups and festivals show** on an event's card: `artist`/`artist:` (with MusicBrainz ids) and `festival`/`festival:` (with Wikidata ids), named as the note names them. |
| RN14 | **Later:** field missions as RaverMissions (RW13) and the weekend video (kind 22). |

All due by Friday 13 November, with the rest of the work in flight.

The timeline holds one window for every layer, so the owner chose how RN11 and RN13 are drawn (2026-10-18):

| | Decision |
|---|---|
| RN11a | **The window spans every zone's weekend:** from Friday 00:00 where it comes first (UTC+14) to Monday 06:00 where it comes last (UTC−12), Thursday 10:00Z to Monday 18:00Z, the same for every viewer, so a shared link agrees. A scene event in it is drawn only when it starts in its own town's Friday 00:00 to Monday 06:00; every other layer sees the whole span. An event whose zone the browser does not know is judged by the window (the stated fallback). |
| RN13a | **Hover, card and lists:** who is playing in a rave's hover, its card and its town's list, up to four names and then how many more; a festival, with its country, on scene-news lines. Only what the `artist` and `festival` tags say. An artist search is not part of it. |

### Built (2026-10-18)

- RN11, RN11a: `thisWeekend` sets the span; `weekendFridayOf` knows a weekend window whoever set it (the panel,
  or a share handle); `ownWeekend` gives a zone's own Friday 00:00 to Monday 06:00, through a change of the
  clocks; `standsAt` drops a scene event that starts outside its own weekend, and the key counts them
  ("outside their own town's weekend"). Checked in the browser on The Record's events: for the weekend of
  23 October, a Miami night on Thursday 22 October at 21:00 local is not drawn, and a San Diego Friday is.
- RN12: the two mappings and `info` are gone; a note naming only `raver_mission` or `harm_reduction_site` is
  refused and counted as a kind no layer reads. Raver missions stay Hero Watch's field missions.
- RN13, RN13a: `lineup` and `festivals` are read from scene events and scene news only (names trimmed, each
  once; a MusicBrainz id or a QID kept only when it is one). The hover and the card say "Playing: …"; a
  scene-news line says "Festival: Ultra Music Festival (US)" and "Artists: …". Checked on The Record: the
  Buenos Aires card for 19 October says "Playing: Ann Clue".
