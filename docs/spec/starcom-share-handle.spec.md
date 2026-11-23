# The share handle: `window.__starcomShareCard`

For Mecha Jono, and any agent that makes pictures and clips of Starcom's
globe. It replaces the note of 11 September (contract v1) and the thread
notes that followed it: this page is the one to read.

This page is built when the deployment is built. Its reference section, at
the end, is read from the handle's own type and from the contract this build
publishes, so it describes the build that serves it. The same contract,
machine-readable, is at
[`/.well-known/starcom-share-contract.json`](/.well-known/starcom-share-contract.json).

## Where the truth is

- **The handle's `version`.** Read it before calling anything. A method a
  version does not list is not there, whatever this page says.
- **The contract file,** served by the same deployment, and fingerprinted:
  its shape cannot change without its version changing.
- **This page,** rebuilt with every deployment. A guard fails the build when a
  method has no description here, or the version in force has no entry in
  the history below.

The provenance a card carries is versioned separately, as its
`schemaVersion`. The handle's version says how a picture is obtained; the
schema version says what the picture claims. They move on their own.

## Start here

1. Open a page that draws the 3D globe; `https://starcom.app/` does. The
   handle is attached to `window` once the globe has mounted.
2. Check `window.__starcomShareCard.version` is at least the version whose
   methods you call.
3. `await whenReady()`. It resolves once the globe can really be captured, so
   nothing waits on a guessed delay: every shown layer drawn, and the Intel
   Reports read whole from every relay and on the globe (v55). With
   `{ address }` it waits for that item to be drawn.
4. Then one of:
   - `planShot(shot)`, the dry run: what would be in frame, and what was
     dropped, with nothing composed;
   - `renderShot(shot)`, one picture from one description;
   - `renderBatch(requests)`, many cards in one page load, in order;
   - `composeFor(address, category)`, an item's card with your template for it;
   - `recordClip({ keyframes })`, a clip along a camera path.

Stay on the page between pictures. A cold load moves about 16 MB and takes
about 13 s; another picture on the same page costs a fraction of a kilobyte
and a few seconds. Moving the camera (`setView`, `frameReports`, `frameArea`)
is how a run stays cheap.

## Shots

A shot is one description of one picture, used for the screen, the link, the
card and the clip alike (decision IM1). It names:

- a **subject**: an item's address, a view, the War & Conflict brief (whole,
  or narrowed to its worst theatres), an area, a War & Conflict theatre, or
  tonight's scene events;
- the **layers** drawn, the **time** (live, a window, or a moment), what is
  **emphasised**, how it is **framed** and how the planet **looks**;
- the **card**: its preset, template, QR code and close-up inset;
- the **output**: type, quality, scale, a byte ceiling and alt text.

The reference lists which fields this build honours and which it does not
yet. An unknown field is refused, so a misspelt key never silently does
nothing. A field not built yet is refused, with what will build it, when it
would change what the picture shows; when it only changes how the picture
looks, it is dropped with a note saying so. A card's provenance carries the
shot as it was drawn, so it can be made again; the same shot makes the same
picture (capture mode).

What a shot cannot ask for:

- **No close-up of an Intel Report.** The camera stays at one globe radius
  or higher, and a report's place is never finer than 0.1°. A close-up of a
  mission's area, a venue or a heat town is a 2D inset in the card's corner.
- **RLSH entities are never described,** listed or featured.
- **A card's badge is the item's own** where the item states its role
  (critical, actionable, context). A shot asking for another badge is refused
  with the reason (IM14).

## Cards

- `compose()` cuts a card from the view as it stands. `composeFor()` makes an
  item's card with a template. Both return the picture with its alt text, its
  warnings (what could be better before posting), and where the picture and
  its footer sit on the card.
- **Presets** are the sizes you post at: `wide` (the 1200 × 630 link preview),
  `square`, `portrait`, `embed` (1280 × 800) and `story` (9:16, composed with a
  title above the planet and the facts below). A card renders its own
  picture at its size: never letterboxed, never upscaled.
- A card's file carries its record as XMP, which a copy keeps when it
  travels. A QR code to the view is drawn only when a shot asks for one.
- **Credit for the data** (capture schema 19, clip schema 4): a card prints a
  "Data:" line above its footer naming each source drawn, with its licence
  where the source's terms name one, e.g. "TeleGeography, 2022 (CC BY-NC-SA
  3.0)". The record lists the same as `credits`, and each feed carries its
  `credits` with links. A clip's end card prints the line too. Keep it with
  the picture, and put it in a post's text as well when the picture is
  cropped. The line goes on to credit the imagery (capture schema 21), below.
- **A note's own licence** (v59, capture schema 29): where a note you post
  carries a `license` (Paris's events, DATAtourisme's, a regulator's notice),
  the Data line credits it for each such note in the picture, once. A
  platform's producers share one credit under their licence: "DATAtourisme,
  Licence Ouverte 2.0 (Etalab): OT Bourges, ADT 79". Past eight, the rest are
  counted: "… and 40 more, each named with its day in this card's record". A
  card about one note credits that note's licence alone. The record keeps
  each licence whole, with its producer and day (`licences`). A note's hover
  credits its own licence too.

## Clips

`recordClip` records the globe frame by frame along keyframes, after warming
the whole path so nothing loads on camera. Before its camera moves it waits as
`whenReady` does (v55), up to 30 s, and refuses with `whenReady`'s reason when
the globe is still drawing, so a clip never opens on reports arriving. It
refuses a blank globe, and
refuses when the layers change mid-clip: a camera move shows one fixed state.
`planReportTour` writes the keyframes for a tour of reports (all of them,
each cluster, all of them again) and moves nothing. A replay in time order
is bounded, and a clip can end on a poster card.

A clip can also move through time (v32): `recordClip({ keyframes, sweep:
{ from, until, step? } })` moves the shared moment from `from` to `until` (unix
seconds) over the footage, so Earth Weather's hours flow while the camera
moves. While Earth Weather or Space Weather is drawn a sweep spans at most 24
hours, and every model step it crosses is loaded before the first frame;
otherwise it may span 400 days (v65). With `step` the moment jumps by it and
holds between (v65). Each frame is captured only once its moment is drawn, so a
frame never shows the moment before. The moment is left as it was found. A
sweep is not combined with `replay`.

A clip can draw country names (v35): `recordClip({ keyframes, countryNames:
true })` draws them in every frame as a card whose shot asks does, placed frame
by frame and faded over a fifth of a second of footage, so the same clip draws
the same names however fast the page renders. It is refused while the
territories overlay is off or the names' face has not loaded, and at any frame
that drew none.

## What the globe draws

- `listLayers`, `setLayer`, `pinLayers` and `setMarkerStyle` choose what is
  drawn and how. `layersFor` answers your categories with Starcom's layers.
- `setTimeWindow` moves the app's one shared time window, the one a person
  sees; null is live.
- `setReportCap` and `setReportLook` set how many Intel Reports are drawn and
  whether each wears its category's emblem. Both hold for your page only and
  are never saved: an agent never changes a person's settings.
- `setWeather` sets what Earth Weather draws, the same way (v31): what colours
  the ground (`temperature`, `rain`, `airQuality` at the stations, or
  `none`), whether the wind's streaks flow, whether the satellites' clouds are
  drawn. A part you do not name stays as it was; null returns all three to
  the person's. `getWeather` says the look in force and who set each part.
  They draw while Earth Weather is shown, so `setLayer('EarthWeather')` first.
- The country fills and borders come in two styles (v33): `classic`, four
  colours with no two neighbours alike and green settled borders, which a
  person's screen shows by default; and `quiet`, one dark tone with pale
  borders. A card or clip draws `quiet` unless its shot names one in
  `appearance.territories`, whatever the screen shows, so a card's look does
  not depend on a person's choice. `territoryStyles` in the contract lists them.
- Country names (v34): a shot's `appearance.countryNames: true` draws Natural
  Earth's names on the card, by their rank and the picture's zoom, never over a
  mark. Without it a card draws none, whatever the screen shows. A clip draws
  them when `recordClip` is asked with `countryNames: true` (v35).
- Mark styles (v54): Intel Reports draw as discs with a halo of light
  (`glow`) unless a person picks another style, and every other layer as a
  disc. A shot's `appearance.markStyle` (`disc`, `glow` or `ring`) draws that
  one style on every layer that takes one, for that card only and whatever the
  person picked, and the card's shot says so. `recordClip` and `recordTour`
  take `markStyle` the same way, and the clip's record says so (clip schema 9).
  Without it each layer draws the page's own. `markerStyles` in the contract
  lists them.

## Reports, groups and areas

- `listReports` lists every Intel Report drawn as an agent may see it. With
  `{ counts: true }` it says how many matched against how many the cap let the
  globe draw, so a cut list says so. With `{ area }` it lists an area's.
- It lists the other layers' drawn items too, each by its address: Raver
  Watch's, War & Conflict's, and Hero Watch's (v41): a lifeboat station, a
  relief note at its country, and an open field mission at its place, whose
  address is a mission package's, `30079:<pubkey>:<d>`. A field mission's card
  wears FIELD MISSION and says the mission's safety limits in full.
- `listGroups` gives the groups drawn: a place's reports under one glyph, or
  a territory's under one outline, most severe first.
- `listAreas` gives every area a report's jurisdiction tag can name:
  continents, unions and spheres, with their member countries, and since v61
  the Zone and Sector Protocol 2.0 partition's Terrae, Maria and Zones.
- `frameReports` and `frameArea` move the camera to show them in a card of a
  preset. `focusReport` features one: drawn larger, the rest dimmed, named by
  the next card. `describeView` says what a card would show, per layer.
- `whatsNew(since, { until })` (v57) says what the feeds Starcom reads gained
  since a moment, in whole unix seconds, up to 31 days back. Space Weather
  lists SWPC's issued alerts, warnings and watches and DONKI's CMEs. Resources
  lists EIA's yearly series written since then. Each layer gives its count,
  its items newest first, and its sources, each read or not and how far back it
  reaches. A layer is `complete` only when every source reaches the moment.

## What changed on screen since v30

Block D (5 October) restyled the app around the globe. It changed nothing in
the contract, and nothing a card draws: cards are cut from the globe alone,
never from the panels over it. What a person now sees on screen:

- the War & Conflict Brief as a panel beside the globe: a day's items under
  each theatre, and picking a theatre shades its war;
- each relay's health and the publish gauge on the coverage line, and a job
  rail for publishing, sending and importing;
- distribution as Traffic Light Protocol chips (Public, Limited, Private,
  Undecided), and severity as a badge with pips;
- whose a record is as a frame: yours solid cyan, a peer's dashed, unknown a
  yellow "?", an impersonation a red diamond. A received package claiming a
  name known for another key is marked an impersonation;
- where a record stands as a status chip, by meaning: working, waiting, done
  or closed.

And on 5–6 October, for cards (contract still v30):

- Earth Weather draws temperature as a heat map from NOAA's GFS model in place
  of station dots. The card's record gives the model's hour (the feed's
  `lastUpdated`); the card prints it only when it is old. `whenReady` waits
  for the field.
- Every card names its data's sources on a "Data:" line (see Cards above).
- Earth Weather's wind is now NOAA GFS streaks flowing on the GPU, on by
  default. A still settles them from its own moment, so the same shot draws
  the same streaks, and the card says their pace is sped up.
- Its clouds are the satellites' own: EUMETSAT's infrared from four
  geostationary satellites, shaded in relief and lit by the sun, and the
  model's cloud cover near the poles, where they do not see. The card's key
  gives the hour the satellites saw.
- Rain can colour the ground in place of temperature: radar where radar
  reaches (RainViewer), and the model's rain elsewhere. The record gives the
  radar's time and the model's hour, each as its own feed.

And on 6 October (contract v31; card schema 20):

- Earth Weather follows the shared time window. `setTimeWindow({ from,
  until })` moves the weather too: it is drawn for `until`, a forecast when
  that is still to come, as far as the model's 16 days. Between the model's
  3-hour steps the weather is blended, so a moment between them is drawn as
  such, not rounded to a step. Back to live (`null`), it is drawn for now.
- A card's key names each weather row's moment after the row's name, as
  "Temperature, forecast for 7 Oct 01:30Z"; the record carries it as the
  legend entry's `when` (capture schema 20).
- Radar rain is drawn only within half an hour of its newest frame. At
  another moment rain is the model's alone, and the card says so and names
  no radar.
- Clouds follow the window too. A past moment is drawn from the satellites'
  image nearest it. A moment still to come is the model's cloud cover,
  keyed "Clouds, forecast for …" and credited to NOAA alone, since no
  satellite has seen it.

And on 7 October (contract v32; clip schema 5):

- `recordClip({ sweep })`, above. The clip's record says the span it swept
  (`provenance.sweep`) and drives a `moment` track. A source drawn for part
  of the footage only, as radar near its newest frame or the satellites'
  clouds for hours they have seen, is listed with when it was drawn and when
  it was not (`absent`), and each source is judged against the moment each
  frame shows. The end card says the span, and that hours after the clip was
  recorded are a weather model's forecast.
- A card of a paused moment (a shot's `time.at`, or a timeline paused there)
  waits until Earth Weather has drawn that moment: until each weather layer
  has, `whenReady` says "Earth Weather had not drawn …", where before a card
  could show the hour before under its own time. Each source on it is judged
  against that moment, as a clip's frames are: an old one reads "… before the
  moment shown".

And later on 7 October (still contract v32; card schema 21, clip schema 6):

- A card credits who made the imagery in its picture, after its data and on
  the same line: "Data: NOAA GFS · RainViewer. Imagery: Solar System Scope
  (CC BY 4.0) · NASA". The record lists the makers as `imagery`, and a
  clip's end card and record carry them too. Only what was drawn is named:
  the clouds while they show, the planets and the Moon while they are faded
  in. Every image's maker, licence and what Starcom changed are listed at
  starcom.app/credits; link there when a post cannot carry the line.

And late on 7 October (contract v33; card schema 22):

- A shot's `appearance.territories` names the style the country fills and
  borders are drawn in on the card: `classic` or `quiet`, Quiet when unstated.
  The shot as drawn always says it, and so does the card's record
  (`appearance.territories`). The key prints the territories in the card's
  style; Classic adds a "Countries" line saying the four colours mean only
  that neighbours differ. Cards that do not name a style look as they did.

And on 8 October (contract v34; card schema 23):

- A shot's `appearance.countryNames: true` draws country names on the card:
  Natural Earth's, as it writes them, de facto control included. A card that
  draws them lists the names placed (`appearance.countryNames.codes`), says
  "Names: Natural Earth, de facto." among its caveats and credits "Names:
  Natural Earth" on its credits line. It is refused while the territories
  overlay is off or the names' face has not loaded, rather than drawn wrong.
  Clips drew no names yet.

And later on 8 October (contract v35; clip schema 7):

- `recordClip({ countryNames: true })` draws the names in every frame of a
  clip, as a card that asks draws them. A name is placed frame by frame with
  the clip's own memory, so it stays put while it fits, and fades in or out
  over a fifth of a second of footage. The clip's record says so
  (`countryNames: true`) with the de facto caveat, and its end card credits
  "Names: Natural Earth". The names keep clear of a card's own label and
  leader too, and a close-up inset takes the corner over the fewest names when
  the corners are otherwise as good.

And on 9 October (still contract v35; War & Conflict cards changed):

- The war map fills a country only where a war is fought: its theatres'
  countries, as your conflict vocabulary (Interchange 3.5) lists them, or a
  war's one country when it names no theatre. The rest of a war's list is
  outlined in its tier's colour, and the key says "outlined: on a war's list,
  not where it is fought". The Mexican drug war no longer fills the United
  States.
- A card about one War & Conflict item fades every war fill and outline and
  lights the item's own country, as a featured territory is lit.
- On screen, picking a theatre in the brief lights its countries and fades the
  rest of the map, and stepping the brief's day shows that UTC day on the
  globe.

And later on 9 October (contract v36):

- A card about a theatre: a shot's `subject.theatre`, or a renderBatch
  request's `theatre`, by its slug as your vocabulary and the brief name it
  (`"russia-ukraine"`). War & Conflict is drawn, read whole first; the
  theatre's countries are lit and the rest of the war map faded, its items
  whole and the other theatres' dimmed. It is framed over its countries round
  the smallest, so Russia–Ukraine is framed on Ukraine, not as a far planet
  with Russia across it; a theatre with no country drawn is framed on its
  items. The headline is the theatre's name; the lines count its items
  standing by what backs them, name the most serious, give its war on
  Wikipedia's list with its tier, and say where it comes from. Its
  `provenance.featured.id` is `theatre:` and the slug. A theatre nothing read
  names is refused, and the refusal names those read.
- A card about anything else is made without a theatre's lens, whatever the
  person picked on screen, and theirs is put back after.

And on 10 October (still contract v36; War & Conflict cards changed):

- A war's outer countries, on its list where it is not fought, are hatched as
  well as outlined, in its tier's colour. Every card draws the hatching, at any
  quality, and its key says "hatched: on a war's list, not where it is fought".
  A weak device's screen gives it up first, with the Sun's glow.
- An item naming a state's forces from another country than where it happened
  draws an arc from that country to the item: solid, in the item's backing
  colour, keyed "an arc: a state's forces from another country, coloured as its
  item" (a grey arc is a report's). It is not a path anything took.
- A key label too long for its row now wraps under itself; one used to run off
  a card's edge.

And later on 10 October (contract v37; card schema 24):

- The four-theatre front page: a shot's `subject: { brief: "latest",
  theatres: 4 }`, or a renderBatch request `{ brief: "latest", theatres: 4 }`,
  narrows the brief to its worst theatres, 1 to 4, in its own order (worst war
  tier first, then most items). One planet, centred among them as far out as
  the brief card, their countries lit together and the rest of the war map
  faded. Its lines: the day's count, then a row a theatre, "Russia–Ukraine war
  · 8 items · a major war", and its most serious item by title. The record says
  which theatres it lit (`frontPage.lit`). Without `theatres`, the brief card is
  as it was.

And later on 10 October (Raver Watch cards changed, then contract v38 and card
schemas 25 and 26):

- A scene event flares as it starts: a ring in its colour that swells and
  fades through its first twenty minutes, keyed "just started: a ring that
  swells and fades". In a night sweep clip they flare one after another as
  night moves west.
- An event in a town at HeatRisk Orange (2) or worse that day, within 25 km,
  carries a soft halo under its glyph in that level's colour on the National
  Weather Service's scale; the key names each level drawn.
- A shot's moment or window now waits up to 15 s for a busy timeline before it
  is refused; it was 3 s, which a page with hundreds of events could miss.
- Tonight's card: a shot's `subject: { tonight: "latest" }`, or a renderBatch
  request `{ tonight: "latest" }`. Tonight is the twelve hours from the shot's
  moment (`time.at`), or from now while live; a window is refused. Scene events
  are the primary layer (pin HeatRisk beside them if you like). The card draws
  only tonight's events: tonight's twelve hours are set on the timeline while it
  is made, and the timeline is put back afterwards as it was. Events already
  under way as tonight begins are drawn, not counted, and the card says how many
  (`frontPage.underWay`, card schema 26). The shot as drawn states tonight's
  start as its `time.at`. The planet turns to the middle of tonight's events, as
  far out as the brief card. Its headline
  is "Raver Watch · tonight from 10 Oct 2026 02:40Z"; its lines say how many
  events start and how many stand in a hot town, then a row a region, the first
  to start first: "US Central · 12 events · 3 under heat · first 21:00 CDT".
  It takes no template. A night with no events is refused, saying from when.
  The record keeps the page (`frontPage.kind: "tonight"`).
- Hero Watch's week (v42): a shot's `subject: { week: "latest" }`, or a
  renderBatch request `{ week: "latest" }`. Drawn on Relief with Field missions
  and Lifeboats pinned beside it; name another of the three as `layers.primary`
  and the other two are pinned, or give your own pins. It shows one moment
  (`time.at`, or now while live); a window is refused, and so is a template.
  Its headline is your weekly roundup's title; its lines are the relief
  standing, the week's lifeboat launches in your roundup's own words (its first
  sentence under **Lifeboats**), the field missions open, and the roundup
  named. Where no roundup is read, the page says so and counts what is drawn.
  The planet turns to the middle of the week's relief and missions. A week
  with nothing standing is refused. The record keeps the page
  (`frontPage.kind: "week"`, card schema 27).
- The declassified desk's day (v58): a shot's `subject: { declassified:
  "latest" }` or a UTC day (`"2026-10-23"`), or a renderBatch request
  `{ declassified: "latest" }`. Starcom reads your `declass_desk` notes of the
  last eight days from The Record when asked. "latest" is the latest UTC day
  with a release, by `published_at`. The card is the `declassified` template, a
  front page with a DECLASSIFIED badge. Its headline is "Declassified on 23 Oct
  2026: 3 releases". Its lines name up to three releases, newest first, each
  with its source as your summary names it. A title longer than 110 characters
  is shortened at a word, and the record keeps it whole. The Data line gives
  each named release's source with its licence. A caveat says none of them is
  drawn on the globe. Intel Reports are the primary layer, and the camera stays
  where it is. A day with no release is refused, saying so. The shot as drawn
  states the day it drew. The record keeps the page (`frontPage.kind:
  "declassified"`, card schema 28).
- Raver Watch flares and fades by the moment a card or a sweep frame is of:
  a shot's `time.at`, or each frame of `recordClip({ sweep })`. They used to be
  measured from the end of the timeline's step around it, about a day, so a
  sweep's events did not flare in turn. A dragged window, read to its end, draws
  no flares. Tonight's card flares what has just started at tonight's start.
- A clip with Raver Watch drawn is no longer refused when its counts change
  (an event beginning, a sweep moving the moment): a source is known by its
  short name. `recordClip({ sweep })` over a night now records, each event
  flaring in turn as its start comes.

And later on 10 October (contract v39; clip schema 8):

- A briefing playlist as a clip: `recordTour({ playlist: "war" })`, or
  `"raves"`, `"heat"` or `"heroes"` (listed as the contract's `playlists`;
  `"heroes"` since v43: Hero Watch's relief countries, the largest operation
  first, then its open field missions, ending soonest first, each with its
  safety limits, which its burned caption never cuts: the panel widens toward
  the frame's edges, then grows, and a frame too small to hold them whole is
  refused; its opening and end card say its order, never "the worst"). It records
  the Tour button's tour: the playlist's layers and moment shown, its layer's
  read waited for (`timeoutMs`, 20 s by default) and what arrived toured, then
  everything put back, the camera too. The clip opens on the whole planet and
  flies to each stop, holding it for its reading time at the screen's pace,
  as many of the worst stops as fit one call's frames (30 s at 30 fps; ask a
  lower `fps` for more). Each frame carries its caption burned in, as the
  screen's panel: the playlist and "1 of 3 · 12 in all", the item's title, why
  it is shown, its lines. The record's `tour` lists every caption with when it
  shows, and the end card names the tour and each stop with its time. Nothing
  is featured. It returns what `recordClip` returns.

## Versions

- **v1** (2026-09-10, eb05c241): the handle versioned as an interface and published where an agent can read it.
- **v2** (2026-09-11, bcdf1578): square and portrait cards.
- **v3** (2026-09-11, cb759391): clips recorded frame by frame.
- **v4** (2026-09-25, 6a815847): the agent chooses what the globe draws, not only where it looks.
- **v5** (2026-09-25, 46089cab): featuring one report; Intel Report marks that read in an image.
- **v6** (2026-09-25, 0250ddac): `describeView`, what is in the picture.
- **v7** (2026-09-25, 9972311c): clips worth posting: a report tour, a replay in time order, a poster end card.
- **v8** (2026-09-29, 80dac719): Raver Watch items, the shared time window, and a card's own link.
- **v9** (2026-10-02, 19e6a399): Raver Watch v1.2: `whenReady` with an address, and `renderBatch`.
- **v10** (2026-10-02, 1b85ca4d): War & Conflict on the globe.
- **v11** (2026-10-02, 90351c6e): the shot: `planShot` and `renderShot`.
- **v12** (2026-10-02, 211b6a97): deeplink v2 carries the look; `layersFor` answers your categories.
- **v13** (2026-10-02, 3458b5a3): a card renders its own picture: never letterboxed, never upscaled.
- **v14** (2026-10-02, 0a98c288): card templates, a badge the item states, and `composeFor`.
- **v15** (2026-10-02, 6a6a1a48): the War & Conflict Brief's front page: one day, by theatre, worst first.
- **v16** (2026-10-03, 5949bdba): the composed 9:16: title above the planet, facts below.
- **v17** (2026-10-03, 977abfe0): every card says itself in words, and warns of what could be better.
- **v18** (2026-10-03, 56bade17): a card's file carries its record as XMP.
- **v19** (2026-10-03, 79b20699): capture mode: the same shot makes the same picture.
- **v20** (2026-10-03, b10eb33a): a card says where its picture and its footer are.
- **v21** (2026-10-03, 08af285c): every card at the exact size you post.
- **v22** (2026-10-03, cce6495f): a card's QR code, only when a shot asks.
- **v23** (2026-10-03, 0e312879): close-ups: the item among its neighbours, in the picture's corner.
- **v24** (2026-10-03, 9c65a865): bounded replays, why a report is not drawn, larger type.
- **v25** (2026-10-04, 9fb88d03): the report cap: chosen, read further, and said when it cuts.
- **v26** (2026-10-04, 59e1c9a3): territories featured: a report about a country or a US state.
- **v27** (2026-10-04, 8eee3ea0): groups at one place, and `listGroups`.
- **v28** (2026-10-04, e5486f37): category emblems on Intel Report glyphs, and `setReportLook`.
- **v29** (2026-10-04, a694791f): areas: continents, unions, spheres and zones, and `listAreas`.
- **v30** (2026-10-04, 7c145f90): areas as lenses: `listReports({ area })`, `frameArea`, area cards.
- **v31** (2026-10-06): Earth Weather's look for your page: `setWeather` and `getWeather`.
- **v32** (2026-10-07): clips that move through time: `recordClip({ sweep })`.
- **v33** (2026-10-07): the territories' style on a card: a shot's `appearance.territories`, Quiet unless named.
- **v34** (2026-10-08): country names on a card: a shot's `appearance.countryNames`.
- **v35** (2026-10-08): country names in a clip: `recordClip({ countryNames })`.
- **v36** (2026-10-09): a card about a War & Conflict theatre: a shot's `subject.theatre`.
- **v37** (2026-10-10): the four-theatre front page: a shot's `subject: { brief, theatres }`.
- **v38** (2026-10-10): tonight's card: a shot's `subject: { tonight: "latest" }`.
- **v39** (2026-10-10): a briefing playlist as a clip: `recordTour({ playlist })`.
- **v40** (2026-10-10): Hero Watch: `layers` gains `Lifeboats`, `Relief` and `FieldMissions`, and RLSH belongs to the mode `HeroWatch`.
- **v41** (2026-10-11): Hero Watch on cards: `listReports` lists its lifeboat stations, relief notes and open field missions (a field mission's address is `30079:<pubkey>:<d>`), and the `field_mission` template is built, its card saying the mission's safety limits in full.
- **v42** (2026-10-11): Hero Watch's week: a shot's `subject: { week: "latest" }`, its relief, lifeboat launches and field missions on one front page.
- **v43** (2026-10-11): Hero Watch this week as a briefing playlist: `recordTour({ playlist: "heroes" })`, its relief countries then its open field missions.
- **v44** (2026-10-12): More areas. `listAreas()` gains two zones, `zone:bahia-coast-reconcavo` and `zone:central-american-dry-corridor`, and eight spheres: `sphere:russophone`, `sphere:arabophone`, `sphere:turkic`, `sphere:persianate`, `sphere:germanosphere`, `sphere:malay`, `sphere:swahili` and `sphere:nordic`. The East African Rift is drawn by its Zone and Sector Protocol outline. No code was removed.
- **v45** (2026-10-12): The Amazon Basin. `listAreas()` gains `zone:amazon-basin`, drawn by its Zone and Sector Protocol outline: twelve Sectors from LBA-ECO CD-06's tributary sub-basins, the Tocantins left out. No code was removed.
- **v46** (2026-10-12): AI Watch. `layers` gains `AiIncidents`, `AiFrontier`, `AiWar` and `AiSafety`, the sections of the mode `AIWatch`: Mecha Jono's Terminator Watch notes by area. The notes with a place move there from Intel Reports.
- **v47** (2026-10-16): Missions. `layers` gains `OpenMissions`, the one section of the mode `Missions`: the missions open to take, each place outlined with a clipboard and a pill counting its missions; the ones naming no place are listed in its panel, never drawn. It draws on a card like any layer; its feed line and `whenReady` come next.
- **v48** (2026-10-17): Loading. `whenReady` also waits while any shown layer's feed is still loading, and when it gives up says which ("After 30000 ms, Comm Hubs cables was still loading: a card then would predate its data"): it had released before Eco Disasters, Comm Hubs, Cyber Threats and Conflict Zones had their data. A feed that has not reported at all is not waited on. Intel Reports gains a feed line, how many of its relays have answered, so a card names it like any source. No method or option moved; a wait can be longer.
- **v49** (2026-10-17): Campaigns and Operations. `layers` gains `CampaignsOperations`, the second section of the mode `Missions`: each running or coming campaign and operation, posted by its author as a 30084 Roster Item (interchange rev 14), drawn at the places it names, outlined in indigo, with a disc at each place's middle and a pill giving its name and clock. One ended, or past its window, is not drawn; one naming no place drawn here is counted in its feed line. Additive.
- **v50** (2026-10-24): Full detail and a steady look.
  - **Cards at full detail.** `compose`, `renderShot`, `renderBatch` and `composeFor` draw a card at the globe's full quality step, whatever the device measured or the viewer pinned: the atmosphere, the clouds where they belong, the hatching and the full pixel ratio. On a slow renderer a card had dropped them and said so ("Drawn at Low quality"). A card waits, up to 20 s, until that look is drawn, and still states what it shows.
  - **Clips keep the step measured.** `recordClip` and `recordTour` keep the step the device measured, so a clip's frame rate holds.
  - **A steady look through a session.** While the handle is in use, and for a minute after its last call, the globe changes neither its quality step nor its borders' level of detail, so a session's cards match each other and a revisited view fetches nothing.
  - **Clouds only on a photographed Earth.** The made-up clouds are never drawn over the cyber globe.
  - No method or option moved; a card can take a few seconds longer.
- **v51** (2026-10-24): Crowded marks fold.
  - **One mark where marks would cover each other.** Where War & Conflict's marks would touch on screen, the most important is drawn: a featured item, then the theatre picked, then a critical warning, then deaths reported, then the newest. The rest fold under it. A card is placed afresh for its own view, so the same shot draws the same marks; a clip's frames keep their places from one frame to the next, so nothing flickers as it turns.
  - **A number counts what a mark stands for.** A mark standing for more than one report wears a count, "2" to "9+", with the reports of the marks folded under it. A mark at a country's centre counts its reports.
  - **The drawn mark opens its pile.** On screen, its hover says how many marks are under it, and a click lists every report, newest first.
  - No method or option moved; `listReports` and a card's text count every report, folded or not.
- **v52** (2026-10-24): How many died, as reported.
  - **A ring sized by the deaths reported.** A War & Conflict mark that reports deaths wears a second, wider ring whose area grows with the largest death toll among what it stands for: the square root of the figure, 3 px a root, so 100 deaths draws a 30 px ring and 576 or more the widest, 72 px. Under about 45 deaths no extra ring is drawn; the mark's own ring says deaths were reported. A pile's ring is its largest figure, never a sum, as casualty claims are never added.
  - **The key names it** where one is drawn: "a wider ring: more deaths reported, by area (the largest figure, never added)".
  - On screen only, never in a card or a clip: a ping on items new since the viewer's last visit, and each war's last week against the week before in its country's hover.
  - No method or option moved.
- **v53** (2026-10-24): Tours that point at their items, names left out, a true grid.
  - **A tour's stop framed above its caption, and pointed at.** `recordTour`, as the Tour button's tour, frames each stop with its item about a third of the way down the frame, above the caption burned at its foot, where the item had stood in the middle with the caption's top just under it. While a stop is held a cyan ring with four crosshair ticks marks the item, and three pings sweep out from it as the stop lands, timed by the clip's own footage, so the same clip draws the same pings. The ring is where the item happened, which can be just off the mark it is folded into.
  - **A note that names a person is never on a card or in a clip** (decision D-NP; Interchange 3.13). A note tagged `t=names_people` is left out of `listReports`, every featured block, a tour's stops and captions, and the labels `describeView` gives, and the War & Conflict brief on a card or in a tour never makes it a theatre's "Most serious" line, though it still counts it. Its mark stays drawn: a glyph is neither a name nor a face. In the app it is shown, labelled "names a person, as <source> names them".
  - **The Intel view's grid on true lines.** The Cyber-Earth skin's graticule is every 15° of latitude and longitude, the equator solid, the tropics and polar circles dashed. It had stood 7.5° off every real line, with no equator.
  - **An arc's key line says its colour:** "an arc: a state's forces from another country, coloured as its item". Its one swatch takes the most serious colour among the arcs drawn, and a report's arc is grey, which the line did not say.
  - **The planets' orbits true** (critique C32): every distance but the Moon's is drawn at one scale about the Earth, 1 AU about 119,000 units, where the Sun has always stood, so each orbit keeps its true shape and each planet sits on its line. The square root it replaced warped the inner planets' orbits round the Earth. Neptune is now up to 3.7 million units out; the camera reaches 9 million.
  - No method or option moved.
- **v54** (2026-10-25): Halo discs, and one mark style for a picture.
  - **Intel Reports draw as discs with a halo of light** by default, the `glow` style, in the app, on cards and in clips; they had been plain discs. A style a person picked is kept.
  - **`appearance.markStyle`** on a shot draws one style, `disc`, `glow` or `ring`, on every layer that takes a style, for that card only, whatever the page's person picked, and the shot the card returns says it. Unstated, each layer draws the page's own: its default, or the person's pick.
  - **`recordClip({ markStyle })` and `recordTour({ markStyle })`** do the same for a clip, and the clip's record carries `markStyle` (clip schema 9).
  - Additive: a shot field and an option on two methods.
- **v55** (2026-10-25): Clips open on the reports already drawn.
  - **`whenReady` waits for the whole Intel Reports read.** Their feed line was in once each relay had sent its first note, with most of the read still to come, so a clip's camera moved while the reports arrived: Mecha Jono's videos turned the planet as they came in. It is in now once every relay has sent all it holds, or its read has ended, and `whenReady` then waits until what was read is drawn ("the Intel Reports just read were not drawn yet: a card then would show fewer than were read"). The feed line's progress counts the relays that have sent all they hold; its name still counts those that answered.
  - **`recordClip` and `recordTour` wait as `whenReady` does before the camera moves,** up to 30 s, and refuse with its reason when the globe is still drawing.
  - No method or option moved; a wait can be longer.
- **v56** (2026-10-25): The Spheres and Organisations are Mecha Jono's lists.
  - **`areas` and `listAreas()` hold the bodies and Spheres as Mecha Jono's lists give them** (Part 2): fifteen bodies, nine of them new (`union:brics`, `union:nato`, `union:sco`, `union:opec`, `union:commonwealth`, `union:oas`, `union:ecowas`, `union:csto`, `union:pif`), and the thirteen Spheres. Each comes with the list's own name, note, sources and read day: `union:asean` is "Association of Southeast Asian Nations", `union:arab-league` "League of Arab States". Running text takes "the" where the list says so ("the Association of Southeast Asian Nations", but "BRICS").
  - **Drawn as the lists say:** a body over its members only, so the African Union over 49, its six suspended members listed; a Sphere over its members, but not the 68 memberships its list counts without drawing (associates, observers, languages official only in a region), which its panel names as listed, not drawn. Singapore joins the Sinosphere.
  - No method or option moved.
- **v57** (2026-10-26): What is new since a moment.
  - **`whatsNew(since, { until })`**, in whole unix seconds, `until` now when unstated, 31 days at most. It answers per layer: `SpaceWeather` and `ResourceZones`, each with `count`, `items`, `sources`, `complete` and a `note`.
  - **Space Weather:** the alerts, warnings and watches NOAA SWPC issued (`kind` `alert`, `warning`, `watch`, `summary` or `message`, its title SWPC's own first line, `time.basis` `written`), and the CMEs NASA DONKI lists (`kind` `cme`, counted by when each was first seen, `time.basis` `event`). Each CME's title gives its speed and CCMC's modelled Earth arrival when there is one, or says it is not measured yet. SWPC's list holds recent days only, and its source says how far back it reaches.
  - **Resources:** EIA's yearly production series whose figures were written after the moment (`kind` `figures`, the year in the title). They come from the note on The Record, or from EIA's own update of the file. The layer's resource types and trade routes are baked yearly figures and never arrive, so a quiet answer is a true one.
  - It reads the feeds when asked, so an answer takes seconds: 17 s on the built app on 26 Oct, most of it waiting for The Record.
  - A refusal says why: not whole seconds, not before `until`, or more than 31 days back.
  - Additive: one method.
- **v58** (2026-10-26): The declassified desk's day on a card.
  - **`subject: { declassified: "latest" | "YYYY-MM-DD" }`**, and `declassified` in a renderBatch request. The `declassified` template is built: a front page of the day's releases from your `declass_desk` notes. It has the day's count, up to three releases with their sources, each named release's licence on the Data line, and a caveat that none is drawn. The record keeps the page (card schema 28).
  - `templates.notBuilt` is `mission_package` alone.
  - Additive: a subject, a request field and a template.
- **v59** (2026-10-26): Interchange 3.25 in Raver Watch.
  - **A scene event listed with no start time** (`time_precision: "day"`) reads as its own day in its own zone, all day ("Tue 3 Nov (Europe/Paris), all day"), on its card and in its hover, never as a clock time. Tonight's row of all-day events alone reads "all day" in place of "first 22:00".
  - **The festival a scene event names** is said in its hover.
  - **A note's own licence is credited:** on its hover, and on a card's Data line for each note in the picture, once, a platform's producers named together under their licence, eight named and the rest counted. A card about one note credits its licence alone. The record keeps each licence whole (`licences`, capture schema 29).
  - The Heat risk layer's words say "an event", not "a rave".
  - No method or option moved.
- **v60** (2026-10-26): Civil Unrest, a Geo Political layer beside War & Conflict.
  - **`layers` gains `CivilUnrest` and `ProtestSurges`:** your protest desk, drawn there and no longer as Intel Reports. A day of unrest (`unrest_note`) is a crowd glyph at the city it names, else at its country's middle, its country lightly tinted chartreuse. A protest surge (`reporting_surge` with `t=protest`) is a broken ring at its country's middle with the country's edge dashed, never the crowd glyph.
  - **`listReports` lists them** with `layer` `CivilUnrest` or `ProtestSurges` and `variant` `unrest` or `surge`. A day of unrest is timed by its day (`time.basis` `event`, from its address), a surge by when it was written. `layersFor` maps the category `unrest` to both.
  - **A card about one** says its kinds, its day and its movement. Each crowd count sits beside its claimant ("550,000 (the Interior Ministry, as Le Monde reports) · more than 800,000 (Organisers) (separate claims, not added)"), never one as fact. A surge's card says "a surge in reporting, not in protest" first. The Data line credits each note's licence, as v59 does.
  - **What stands:** live, a day of unrest for the last 7 days and a surge for the last 2; a window shows the days in it. `whenReady` waits for the notes and their countries while a section is on.
  - Additive: two layers and their items.
- **v61** (2026-10-26): The Zones swap: Starcom serves the Zone and Sector Protocol 2.0 partition, the whole Earth in 12 Terrae, 5 Maria, 251 Zones and 2,632 Sectors, your five Maria among them.
  - **`listAreas()` gives the partition:** each Terra (`terra:<slug>`), Mare (`mare:<slug>`) and Zone (`zone:<slug>`), drawn by its container document's outline, the one the Zones layer fills with its Sectors. A Zone's note is its principle.
  - **Six 1.0 ids are 2.0 Zones of their own:** `zone:east-african-rift`, `zone:horn-of-africa`, `zone:levant`, `zone:balkans`, `zone:caucasus` and `zone:amazon-basin`. Their outlines are the new Zones', and the Horn of Africa, the Balkans and the Levant no longer list member countries.
  - **Five are retired:** `zone:sahel`, `zone:bahia-coast-reconcavo`, `zone:central-american-dry-corridor`, `zone:golden-triangle` and `zone:ring-of-fire`. Each stays an area, drawn as the Zones that now hold its place (the manifest's `covered_by`: each Zone holding 5% of it, or 1% of it with a tenth of the Zone inside it), and its note names them, so a report or a link that names one still finds it.
  - **Names:** a Zone is named as the partition names it ("Sahel Zone", "Horn of Africa Zone") and takes "the" in running text; a Terra or a Mare does not ("Terra Africana").
  - Not additive: area names and outlines changed. No method or option moved.
- **v62** (2026-10-28): Psi Watch in the share handle, while Psi Watch is on in the page (`?psi=kit` until the key change on 9 Nov).
  - **`layers` gains `PsiLines`, `PsiField`, `PsiZones`, `PsiRifts` and `PsiWindows`.** `listLayers()` lists them only while Psi Watch is on; off, they are never handed out.
  - **`layersFor("psi.*")`:** `psi.sky_event` gives PsiLines; `psi.window` PsiWindows and PsiLines; `psi.alert` PsiRifts; `psi.field` PsiField; `psi.registration`, `psi.scry_result` and `psi.ledger` PsiZones; `psi.brief` PsiLines and PsiField; `psi.mission_package` PsiWindows; the group `psi` PsiWindows and PsiLines. `psi.call` gives none: a call is a team's own, never on a card.
  - **`subject: { psiEvent: <address>, at: "exact" | <unix> }`**, and `psiEvent` with `at` in a renderBatch request. The address is a kind-31923 sky event's or window's. It is opened as a person opens one, so Planet lines draw its bodies, and the timeline is paused at its exact moment, or at a unix second inside its window (refused outside it). A sky event draws on PsiLines; a window on PsiWindows, with PsiLines pinned beside it. The camera faces the window's places, or the sky event's first body standing overhead at the moment. As drawn, the shot's `subject.at` is the moment in unix seconds, and `time.at` repeats it.
  - **`whenReady({ address })` knows psi addresses:** drawn once open, with Psi Watch on.
  - **The `psi` template:** the event's front page, with its title, its exact moment and window in UTC, an ingress's signs and a window's places. It carries the one small Experimental badge, in Psi Watch's aqua, and no other psi text. The capture's own caveats stay, as on every card. The Data line credits the lines as computed in the browser, the sky events' ephemeris and the field's sources. The record keeps the page (card schema 30).
  - Additive: five layers, a subject, a request field and a template.
- **v63** (2026-10-28): A Timestream strip in any card, while Psi Watch is on (`?psi=kit` until the key change).
  - **`card.strip`:** `true`, or `{ from, until, lanes }` in whole unix seconds. `true` draws a band under the picture spanning the card's moment ±3 days. The span is at most 92 days.
  - **`stripLanes`** lists the strip's lanes: `windows`, each window's weight curve, the card's own event lit; `kp`, each 3-hour Kp as the Kp lane draws it, the expected ones outlined; `bodies`, the psi event's bodies, each lane in its sign's element colour in the Galactic Centre frame, hatched where the body moves backward. All three are drawn unless a shot names its own.
  - **The moment:** a psi event's, else the shot's `time.at`, tonight's start, the end of the timeline's window, or now. The strip marks it with a line.
  - **The picture gives up a band at its foot** for the strip: the planet is drawn a little smaller, and nothing else on the card moves.
  - **As drawn**, a shot's `card.strip` states its span and lanes. The record keeps them, with the bodies, the frame and how many windows it drew (card schema 31). The Data line credits the strip's sources: the JPL DE440s ephemeris, GFZ's Kp (CC BY 4.0) and NOAA SWPC, and Astronomy Engine.
  - Refused, with why, while Psi Watch is off.
  - Additive: a shot field and a list.
- **v64** (2026-10-28): The PsiOps Briefing, while Psi Watch is on (`?psi=kit` until the key change).
  - **`subject: { psiBriefing: "latest" }`**, and `psiBriefing` in a renderBatch request: the week from the shot's moment (`time.at`), or from now, on a front page with the `psi` template and its one Experimental badge.
  - **The page:** the week's windows, soonest first, each with its exact moment and its Zones, five named and the rest counted. Then Kp's largest in the week and its day, "expected" where forecast. Then each Psi Alert open at its start, with its Zone and its end. "No window in the week" and "No Psi Alert open" where so.
  - **The globe:** Windows first, Planet lines and Psi Alerts beside it unless the shot pins its own. The week's first sky event is opened, so Planet lines draw it. The camera faces the week's places, or that event's first body overhead.
  - **A Timestream strip under the globe by default**, spanning the week; `card.strip: false` drops it, and `card.strip` with a span or lanes changes it.
  - A window of time is refused: the Briefing is the week from one moment. The record keeps the page (card schema 32).
  - Additive: a subject and a request field.
- **v65** (2026-10-28): Longer and stepped sweeps, your kit's question 3.
  - **`recordClip({ sweep })` spans up to 400 days while neither Earth Weather nor Space Weather is drawn**: a Psi window's weeks, or a year of Kp, sweep in one clip. While either is drawn, a sweep keeps to a day, as before, every model step loaded first.
  - **`sweep.step`**, in whole seconds (a minute at least, no more than the span): the moment jumps by it and holds between, as a stepped clip would. The clip's record keeps it (`sweep.stepSeconds`, clip schema 10), and its caveat says "in steps of a day".
  - **`sweep`** in the contract lists the fields and both limits.
  - Additive: a sweep field, a longer span where nothing forecast is drawn, and a contract list.

- **v66** (2026-10-30): Psi Watch's magnetic shield, while Psi Watch is on (`?psi=kit` until the key change).
  - **`layers` gains `MagneticShield`:** Earth's field from IGRF-14 at the moment drawn: its strength every 5,000 nT, the South Atlantic Anomaly (the field under 30,000 nT, dashed), the dip equator, and both dip poles' tracks from 1900 to 2030 with a dot where each stands. `listLayers()` lists it only while Psi Watch is on.
  - **The key names the year drawn**, "forecast" after IGRF-14's last epoch (2025); a moment before 1900 or after 2030 draws the nearer end. The Data line credits IAGA IGRF-14.
  - **While the timeline is live, the aurora is drawn with it:** NOAA SWPC's OVATION forecast, keyed with its own moment and credited as with Space Weather. A paused moment draws no aurora: the forecast is now's.
  - **`whenReady()` waits for IGRF-14**, and for the aurora's forecast while it is drawn.
  - Additive: a layer.

- **v67** (2026-10-30): Psi Watch's ψ field, while Psi Watch is on (`?psi=kit` until the key change).
  - **`layers` gains `PsiModel`:** the ψ field at the moment drawn, to the minute. The drive a = −0.35 + G + 0.45·G·F + 0.8·S on a 2° grid, smoothed over 300 km, then ψ = √(max(ā, 0)), nought past 78°. G is the mean of four 350 km bands, over its largest: the geoid's persistence ridges and valleys (EGM96 to degree 12), PB2002's spreading ridges, the core's null-flux line for the year drawn (IGRF-14, 1900 to 2030), and Natural Earth's coasts. F is the Moon's and the Sun's tidal potential, over its largest. S is a 150 km band along a central solar eclipse's centre line on its day. Computed in the browser. `listLayers()` lists it only while Psi Watch is on.
  - **Four looks, drawn alone or together as the person's panel chooses:** heat (ψ in aqua; nothing where it is nought), contours (a line at each tenth of ψ), relief (G raised, in gunmetal) and flow (the tides' share of ψ, aqua where they raise it and violet where they lower it). Heat and contours at first. The key swatches only the looks on, and names the moment and the core line's year, and an eclipse's shadow on its day.
  - **`whenReady()` waits for the moment drawn**: some 40 ms a moment, a few hundred more for a new year or an eclipse's day. The Data line credits EGM96, PB2002 (ODC-By 1.0), Natural Earth, IAGA IGRF-14 and Astronomy Engine.
  - Additive: a layer.

- **1 Nov, no version change:** Psi Watch is shown to everyone. `?psi=kit` is no longer needed; `?psi=off` hides it for a tab, and `?psi=kit` shows it again. `listLayers()` lists the Psi layers by default.

- **v68** (2026-11-01): A layer's own choices on the second left rail.
  - **`setLayerChoices(layer, choices)` and `getLayerChoices(layer)`:** the rail's choices for a layer, set for this page only and never saved (an agent never changes a person's choices); `null` returns the layer to the person's. Both return `{ layer, choices, from }`, `from` saying whether this page's handle set any.
  - **`layerChoices` in the contract** names each layer's choices and their keys. So far:
    - War & Conflict's `war:items`, `war:arcs`, `war:deaths` and `war:map`, each `true` or `false`, so a card can be made of the war map alone, or of the events without their arcs;
    - Conflict Zones' `conflict:view`, `"events"` (each event where the report put it, the default) or `"countries"` (a tally a country, as before), and `conflict:mark`, `"icon"` (the event's kind's icon, the default), `"dot"`, `"pin"` (a stalk up to the icon) or `"spike"` (a bar, its height how many outlets told it, on a log scale). Crowded marks fold under a count; the key names each kind drawn and, for spikes, the values at three heights.
    - More layers' kit choices join as their kits are built.
  - A choice a layer keeps in its own settings (Geo Political's popup: Conflict Zones' events and displacement, Resource Zones' types, Diplomacy's categories) is refused, named.
  - A shared link may carry the rail's choices as `lc=`; it opens the layers as they were seen.
  - Additive: two methods and a list.

- **1 Nov (later), no version change:** a page's link yields to the caller.
  - **A link no longer undoes your calls.** A page opened from a link applies its parts once the globe is ready. A caller who waited for the same `whenReady` and then set a layer raced it: on starcom.app, `setLayer('ResourceZones')` after `whenReady` on `?mode=GeoPolitical` was undone by the link's default layer in three runs of five. Now each part you have chosen through the handle is left alone: the layer (`setLayer`, `pinLayers`), the camera (`setView`, `frameReports`, `frameArea`), the window (`setTimeWindow`), the featured report (`focusReport`); `composeFor`, `renderShot` and `renderBatch` choose all three of the first. The parts you have not chosen are still the link's.
  - **Links carry the rail's choices.** `provenance.link` adds `lc=` when the layers drawn have rail choices; the QR's short link does not.
  - **`open=<note id>`** in a link reopens an item in the inspector once its layer has drawn it (for up to a minute). Parsers that do not know it ignore it, as every part of the link stands alone.

- **v69** (2026-11-01): Civil Unrest and Protest surges, one layer with two looks.
  - **Civil Unrest's choices** join `layerChoices`: `unrest:events` (the days of unrest as crowd marks), `unrest:surges` (the surges as broken rings) and `unrest:tint` (the countries with a day standing, lightly tinted), each `true` or `false`, all on by default. `setLayer('CivilUnrest')` now draws the surges too, unless you turn them off: `setLayerChoices('CivilUnrest', { 'unrest:surges': false })`.
  - **`ProtestSurges` stays an id** for `setLayer`, `pinLayers` and links, and still draws the surges alone. On screen the rail has no separate button for it.
  - Additive: three choices.

- **v70** (2026-11-01): Eco Disasters' marks.
  - **`eco:mark`**: `"pin"` (a stalk up to the event's icon, as Earthquake3D draws a quake; the default), `"icon"`, `"spike"` (a bar, its height a quake's magnitude or a fire's acres, on a log scale) or `"dot"` (the screen points and their colour modes, as before). Each event is its hazard's icon in the natural hazards colour, brighter the more severe, and carries its time, so a replay reveals it when it happened.
  - **`eco:depth`**, `true` or `false`, on by default: each quake's depth as a thin line from its place down to where it began, drawn through the crust on the side of the globe facing the camera.
  - The key's entry for the kind marks is `EcologicalDisasters:kinds`; with `"dot"` it is `EcologicalDisasters`, as before.
  - Additive: two choices.

- **v71** (2026-11-02): the ψ field's looks in a shot (your ask, 30 Oct).
  - **`appearance.psiLooks`**: the looks the card draws, any of `"heat"`, `"contours"`, `"relief"` and `"flow"`, each once. Named or not, a card draws the same whoever's panel is open: with none named, heat and contours, as the panel starts. The person's own looks come back when the shot ends, and nothing is saved.
  - **Echoed as drawn**: the shot as drawn carries `appearance.psiLooks` (in the panel's order) whenever it named them or the ψ field (`PsiModel`) was drawn, in front or pinned, so the card's record says which looks it shows.
  - Additive: one field.

- **v72** (2026-11-02): the solar system's scale.
  - **`setScale(scale)` and `getScale()`:** `"compact"`, as it has been since 24 October (every size and the Moon's distance true; every other distance from the Earth at about 1 in 19.7), or `"true"` (every distance true: the Sun 23,500 Earth radii out and half a degree across, as in the sky; Neptune 30 AU out). At True the camera may pull out to 35 AU. For this page only, never saved: `null` returns the person's. Both return `{ scale, from }`, `from` saying whether this page's handle or the person chose it. Anything else is refused.
  - **A switch glides** for 1.5 s, every body sliding along its true direction; `whenReady()` waits for it to settle. Far out at True, looking away from the Sun, the frame is dark sky (the Earth under a pixel, the Sun out of the frame): `whenReady()` says so within a few seconds, `ready: false` with that reason, rather than waiting out its timeout. Turn toward the Sun or come in toward the Earth. Space Weather's solar wind, ENLIL and CMEs move with the distances; everything bound to the Earth (the magnetosphere, belts, aurora, e-field, field lines) is true at both.
  - **Cards say it:** whenever the picture drew any of the solar system, `provenance.appearance.solarSystem` names the scale (card schema 33), and at Compact a caveat line says which distances are not true. On screen, the key names it; a card's key leaves it to the caveat.
  - **On screen:** a Solar System kit on the second left rail, while the solar system is drawn and always in Space Weather, its button wearing the scale in force.
  - Additive: two methods and a field.

- **v73** (2026-11-02): the solar system as a Diagram.
  - **`setScale("diagram")`**: not to scale. Each planet on its own ring round the Sun, the rings evenly spaced (Mercury's the first, Neptune's the eighth), along its true direction from the Sun; the Moon on a small ring round the Earth, its direction true; each size on a log of the body's against the Earth, which is the globe and keeps its size (the Sun about twice the Earth, Jupiter one and a half, the Moon and Mercury about three-quarters). Space Weather's solar wind, ENLIL and CMEs are drawn in the diagram's Sun–Earth gap, a schematic; everything bound to the Earth is as at every scale.
  - **`solarScales`** in the contract lists what `setScale` takes: `compact`, `true`, `diagram`.
  - **Cards say it:** `provenance.appearance.solarSystem.scale` may be `diagram` (card schema 34), and a caveat line says the picture is not to scale.
  - Additive: a value and a list.

- **v74** (2026-11-02): Sky from a place.
  - **`setScale("sky")`** opens it at the point of the globe under the view's centre (call `setView` first to choose the place): the camera glides down to the ground there, and the sky over it is drawn: every star of the Yale Bright Star Catalogue to magnitude 6, sized by magnitude and coloured by B−V, the IAU's constellation figures and their 88 names, and the Sun, Moon and planets at their true places and sizes. The sky turns with the moment shown (`setTimeWindow`, or a paused time bar); by day the stars give way to the blue, at twilight the glow is low toward the Sun. Below the horizon the Earth hides what is there.
  - **`setSky({ az, alt, fov })`** turns it: `az` from north through east and `alt` above the horizon, degrees; `fov` the view's height, 5 to 120. **`getSky()`** returns `{ lat, lng, az, alt, fov }`, or `null` when Sky is not open. Anything that moves the camera (`setView`, `frameReports`, a tour) closes Sky first, back to the scale before it.
  - **Cards say it:** `provenance.appearance.solarSystem` is `{ scale: "sky", observer: { lat, lng } }` (card schema 35, the place to 0.1°); a caveat line says the air is not drawn (no refraction, no haze). The Data line credits the Yale Bright Star Catalogue (Hoffleit & Warren 1991, via NASA HEASARC) and the IAU/Sky & Telescope figures (CC BY 4.0, as the skymap project transcribed them).
  - **`solarScales`** gains `sky`.
  - Additive: two methods, a value and a field.
- **v75** (2026-11-03): Earthquakes as flags, and their colour.
  - **With Eco Disasters' pins** (the default `eco:mark`), each quake is a line up to a flag with its magnitude to a tenth. Flags that crowd stack on the strongest, four at most, the rest counted on a "+N" chip, and no stack covers another. A ring marks the area each quake of magnitude 4 or more reached: USGS's ShakeMap contours (MMI, in USGS's colours) where USGS made one, else a dashed ring from its magnitude, which the key calls an indication. The key's entry is `Earthquakes` (layerId `EcologicalDisasters:quakes`).
  - **`setLayerChoices("EcologicalDisasters", { "eco:colour": "depth" })`** colours each quake's line, flag and ring by how deep it began, in USGS's depth bands (0–33, 33–70, 70–150, 150–300, 300–500, 500 km and deeper); `"magnitude"`, the default, by its magnitude. `layerChoices.EcologicalDisasters` gains `eco:colour`.
  - **`whenReady` waits** for USGS's ShakeMaps of the 30 strongest quakes of magnitude 4 or more shown, so a card shows the shaking USGS mapped, not the rings in its place.
  - A quake of magnitude 5 or more ripples on screen and in clips (each frame by its moment); a card never shows it.
  - Additive: a choice and a wait.
- **v76** (2026-11-03): The quake kit's plates, volcanoes and ranges.
  - **`layerChoices.EcologicalDisasters` gains four:** `eco:plates` (true by default) draws PB2002's plate boundaries beside the quakes, the subduction zones in the hazards' colour and heavier, with their own key entry (`Plate boundaries`) and PB2002's credit on the Data line; `eco:volcanoes` (true by default) shows the volcano catalogue; `eco:magnitudes` and `eco:depths` are lists of the bands drawn, each band named by its lower bound: magnitudes `"0"` (under 3), `"3"`, `"4"`, `"5"`, `"6"`, `"7"` (7 and over), and depths in km `"0"`, `"33"`, `"70"`, `"150"`, `"300"`, `"500"` (500 and deeper). Every band is drawn by default; a quake of no stated depth is drawn only while every depth band is.
  - For example `setLayerChoices("EcologicalDisasters", { "eco:magnitudes": ["5", "6", "7"] })` draws only the quakes of magnitude 5 and over, on every mark style; the key's Earthquakes entry then says "only magnitudes 5 and over".
  - **`whenReady` waits** for the plate boundaries' file while they are drawn.
  - **Glyphs are drawn in their true colours**, the colours their key shows: every glyph layer's icons had been drawn darker (the sprites wrote linear values to the screen). Cards made from now on show them brighter.
  - Additive: four choices and a wait.
- **v77** (2026-11-04): The quakes by the window, their history, and their replay.
  - **The quakes follow the window shown.** Live, the last day of every quake. The time bar's 7 d, the last week; its 30 d, the last 30 days of magnitude 2.5 and over. A `setTimeWindow` inside the last 30 days, that window. USGS's quakes are merged with EMSC's, read live for the window and never kept: a quake both report is drawn once, its note naming both ("Reported by USGS (us) and EMSC (GFZ)"). The key's Earthquakes entry says what is drawn. The Data line credits EMSC-CSEM SeismicPortal (CC BY 4.0) when its quakes are drawn. `whenReady` waits for the read.
  - **Back to 2150 BC.** `setTimeWindow` and a shot's time take negative unix seconds, down to `-129983097600` (1 January 2150 BC). A window starting more than 30 days back draws USGS's catalogue of magnitude 5 and over since 1900, with NOAA NCEI's significant quakes. A significant quake's flag carries a badge: † for its deaths, to the least power of ten NOAA's count reaches (†10+ … †100k+), and ≈ where a tsunami came of it. Its note gives NOAA's deaths, damage and intensity, and the Data line credits NOAA NCEI.
  - **`recordClip({ replay: { …, decayS } })` replays the quakes** drawn as flags. Each rises with a glow as the replay reaches it, a ring bursting from it, and fades over `decayS` seconds of the clip: 1, 4 (the default) or 10 (`replayQuakeDecays`). The quakes count toward the replay's span, so a replay with quakes and no report in it records. A clip's `provenance.replay` gains `quakes` and `quakeDecaySeconds` (clip schema 11), and a caveat says it. `whenReady` waits for the quakes to be drawn for the replay before the first frame.
  - **In the app only, never in a card or a clip:** the time bar's own replay with its Decay control, and the ping on a new strong quake. The ping is the person's own setting; the handle cannot set it.
  - Additive: a field, two members of a clip's record, a wait, and windows reaching further back.
- **v78** (2026-11-04): Two layers side by side.
  - **`setCompare({ left, right })`** draws two layers side by side: the left half of the globe draws the layer `left`, the right half the layer `right`, each without the other's, everything else in both, the halves meeting down the middle of the screen. Either layer not drawn is pinned for it. Only a layer that names its objects can be drawn apart: today Eco Disasters, Earth Weather, Space Weather, Intel Reports, Satellites, War & Conflict, Civil Unrest and Conflict Zones at any time, and Resource Zones, Diplomatic Events, Cyber Threats and Comm Hubs while they are drawn (turn one on first). Another is refused, saying which can. `null` ends it, letting go of what it pinned.
  - **`getCompare()`** returns `{ comparison, compareLayers }`: the comparison drawn (or `null`) and the layers that can be compared now.
  - **Cards and clips draw both halves**, a line where they meet and each half's layer named in the picture. A card's `provenance.appearance.compare` is `{ left, right }` (card schema 36), a clip's `provenance.compare` likewise (clip schema 12), and a caveat names each half. Each half draws its own layer's arcs (Intel Reports', War & Conflict's) and hides the other's; until 10 Nov 2026 a compared layer's arcs were left out. Space Weather can be compared since 10 Nov 2026: every piece it draws (aurora, field lines, cusps, tail sheet, near-Earth flow, the solar wind, ENLIL, CMEs, the Van Allen belts, the e-field, the magnetopause and bow shock) keeps to its half.
  - While the Sun's glow draws (the solar system's views), the picture is drawn whole.
  - Additive: two methods and two members.
- **v79** (2026-11-04): One layer at two moments, side by side.
  - **`setCompare({ layer: "EcologicalDisasters", earlier })`** draws the quakes of the window shown in the left half and the same window `earlier` in the right: `"1w"`, `"1mo"`, `"1y"` or `"10y"` (`compareEarlier`), by the calendar (a year earlier is the same dates). **`setCompare({ layer, window: { from, until } })`** holds that window (unix seconds, back to 2150 BC) in the left half and draws the time bar's in the right, wherever it is then set. Each half is read as any window is: the feeds inside the last 30 days, the history (magnitude 5 and over) before. The plate boundaries and the volcano catalogue are drawn in both halves; the other hazards in the half of the window shown. `compareMomentLayers` names the layers that can: `EcologicalDisasters` today.
  - **`getCompare()`** gives the comparison's `labels`, each half's name with its window and, where it reads fewer than every quake, its least magnitude ("Eco Disasters, 3 Nov 2025 00:00Z – 4 Nov 2025 00:00Z, M5+"), and its `moment`. `whenReady` waits for the other moment's quakes.
  - **Cards and clips name each half with its window**: `provenance.appearance.compare.labels` (card schema 37), `provenance.compare.labels` (clip schema 13), and the caveat says them.
  - Additive: two forms of `setCompare`, two fields and two members.
- **v80** (2026-11-04): Earth Weather beside a forecast hour.
  - **`setCompare({ layer: "EarthWeather", ahead })`** draws Earth Weather at the moment shown in the left half and the model's fields `ahead` hours later in the right: `6`, `12`, `24`, `72` or `168` (`compareAhead`), the forecast strip's steps. While live the left half is now and the right half counts from the hour. The right half draws the fields drawn in the left, each as the model has it for its hour (temperature, rain, wind, clouds, by the layer's choices); the gauges and the station marks are drawn in the left half only. `ahead` is Earth Weather's alone, and Earth Weather takes no `earlier` or `window`. `compareMomentLayers` gains `EarthWeather`.
  - **`getCompare()`'s `labels`** name each half's hour, and "forecast" for an hour still to come ("Earth Weather, now" beside "Earth Weather, 4 Nov 12:00Z, forecast"); its `moment` is `{ layer, ahead }`. `whenReady` waits for the right half's fields.
  - Cards and clips name each half as `getCompare()` does, in the members of v79.
  - Additive: a form of `setCompare` and a field.
- **v81** (2026-11-10): A story as one clip.
  - **`recordStory({ story, fps?, quality?, settleMs?, endCard? })`** records a story as one clip. `story` is as its link carries it: `{ id, title, steps: [{ view: { lat, lng, altitude }, layer, pins, choices, window: { from, until } | null, caption, holdS }] }`. The footage opens on the first step, held for its hold (4, 6 or 10 s); each later step is a flight of about 2.5 s from the last, rising to the whole planet over a long way, then its hold. Each step's layers, choices and window are set from the start of its flight; its caption is burned in at the foot of the frame, under the story's title and the step's number. Up to 1,800 frames (a minute at 30 fps), where every other clip keeps 900: the steps that fit, and the end card says when some were left out. However it ends, the view before is put back and every layer's choices given back to the person's.
  - **Clip schema 14:** `provenance.story` is `{ title, shown, total, partial, steps: [{ index, fromMs, toMs, layer, pins, window, caption }] }`; `tracks` includes `story`; `layersShown` lists every layer shown at any step, and the feeds are reported as a sweep's are, each with when it was drawn. The caveats say the captions are the story's author's words, and how many steps were shown.
  - Returns what `recordClip` returns. Starcom's own Story panel makes the same clip as an mp4 in the browser.
  - Additive: a method.
- **v82** (2026-11-10): Planet lines' bands and parans (D-PW, PW59, PW81–PW84).
  - **Planet lines' choices** join `layerChoices`: `psi:bands` (each line widened faintly by its body's orb, the kit's: the Moon ±1°, the Sun, Mercury and Venus ±2°, the rest ±1°; an MC or IC band is that many degrees of longitude either side, a rising or setting band that many degrees of arc about the horizon) and `psi:parans` (a faint ring of latitude where two of the open event's bodies are angular at once, at the moment drawn: where one's meridian crosses the other's horizon, or the two horizons cross; half the smaller orb either side, its label naming the pair, e.g. "Moon ASC · Mars MC"). Each `true` or `false`, both on by default: `setLayerChoices('PsiLines', { 'psi:parans': false })`.
  - The key names both when drawn, and a card's record keeps them as any layer's choices.
  - Additive: two choices.
- **v83** (2026-11-11): An event chart on a card (D-PW, PW87).
  - **`card.chart: { at, lat, lng, title?, cursorAt?, frame? }`** on any shot draws an event chart over a corner of the picture: the chart for `at` (whole unix seconds) at `lat`, `lng` inside, its houses (Placidus) with the Ascendant at the left; the sky at `cursorAt` outside (the card's moment unless said: the shot's `time.at`, the timeline's paused window's end, or now); a chord for each aspect across, solid for the easy ones and dashed for the hard. `frame` is `galactic` (the Galactic Centre at 0° Sagittarius, the default) or `tropical`. `title` names it in the card's text.
  - It takes a lower corner of the picture first, clear of the featured item's label and of a close-up; `regions.chart` says where.
  - The card's text adds the chart's lines: inside, its title, moment and place; outside, the sky's moment; the three closest aspects across; the frame, houses and orbs. The Data line credits Astronomy Engine.
  - **Capture schema 38:** `provenance.chart` is `{ title, atS, place, cursorAtS, frame, frameName, houses, orbs, across: [{ then, now, kind, orb, applying }] (the five closest), caveats, lines }`. The shot as drawn echoes `card.chart` with every part stated.
  - e.g. `renderShot({ v: 1, subject: { view: { lat: 3, lng: 41, altitude: 1.8 } }, card: { chart: { at: 1794357620, lat: 3, lng: 41, title: "Mandera attack" } } })`
  - Additive: a shot field.
- **v84** (2026-11-11): Safety windows (D-RR, RR1).
  - **`layers` gains `SafetyWindows`,** the third section of the mode `Missions`: windows round recurring nights in a city, each city's place filled by its window's weight at the timeline's cursor, never a person or a mark.
  - Like `RLSH`, it is listed and never drawn in a card or a clip: a shot naming it as `layers.primary` or in `layers.pins` is refused, and `layersFor` never names it.
  - Additive: a layer id, refused for captures.

<!-- reference -->
