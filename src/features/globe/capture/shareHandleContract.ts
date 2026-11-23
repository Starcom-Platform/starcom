/**
 * The contract for `window.__starcomShareCard`.
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * That global is not a debug affordance. It is the interface Mecha Jono drives
 * to produce everything it publishes, and Mecha Jono is a different codebase
 * that ships on its own schedule. A rename here is a silent outage there: the
 * agent's `compose` becomes undefined, its run fails at 3am, and nothing in
 * this repository noticed anything.
 *
 * This repository already treats cross-codebase formats with that seriousness
 * — signed manifests, read-tolerant parsers, change notes under
 * docs/interchange/ — because they cross a boundary where the other side
 * cannot be recompiled. A browser global crosses exactly that boundary and had
 * none of it.
 *
 * ─── WHAT A VERSION IS FOR, AND WHAT MAKES IT HONEST ───────────────────────
 *
 * A version nobody is obliged to change is decoration. So the shape is
 * DECLARED here, the live handle is asserted against it, and a fingerprint of
 * the declaration is recorded: editing the shape without editing the version
 * fails, with the diff printed.
 *
 * That does not prevent a breaking change. It makes one impossible to make by
 * accident, which is the only thing a version can honestly promise.
 *
 * ─── TWO VERSIONS, DELIBERATELY SEPARATE ───────────────────────────────────
 *
 * This versions the API — which methods exist and what they take. The payload
 * a card carries is versioned independently by GLOBE_CAPTURE_SCHEMA_VERSION in
 * shareCardProvenance. They move for different reasons: adding a caveat field
 * changes what a card says without changing how it is obtained, and adding a
 * method changes how it is obtained without changing what it says. One number
 * for both would force false bumps in both directions.
 */
import { GENERIC_CATEGORY_SYMBOL, INTEL_CATEGORIES, INTEL_CATEGORY_SYMBOLS } from '../../../symbols/symbolRegistry';
import { AREAS, AREA_ALIASES } from '../areas/areaRegistry';
import { WEATHER_COLOURS } from '../../../services/weather/weatherLook';
import { choosableLayerChoices } from '../rail/railHandle';

/** The global an agent looks for. */
/** The layers drawn at two moments side by side (v79, D-CM CM4): the quakes; Earth Weather at a forecast hour (v80). */
export const COMPARE_MOMENT_LAYERS = ['EcologicalDisasters', 'EarthWeather'] as const;
/** Earth Weather's forecast hours a comparison may set its right half at (v80, D-CM CM5): the forecast strip's steps. */
export const COMPARE_AHEAD_HOURS = [6, 12, 24, 72, 168] as const;

export const SHARE_HANDLE_NAME = '__starcomShareCard' as const;

/**
 * Bump on ANY change to the shape below.
 *
 * 49: Campaigns and Operations (roster.md, D-RS, RS25): `layers` gains `CampaignsOperations`, the second section
 *    of the mode `Missions`: each running or coming campaign and operation posted as a 30084 Roster Item, its
 *    places outlined in indigo, a disc at each place's middle, a pill with its name and clock. ADDITIVE.
 * 48: Loading (loading-states.md, D-LS, LS5): `whenReady` also waits while any shown layer's feed is still
 *    loading, and says which when it gives up ("After 30000 ms, Comm Hubs cables was still loading: a card
 *    then would predate its data"). It released before Eco Disasters, Comm Hubs, Cyber Threats and Conflict
 *    Zones had their data. A feed that has not reported at all is not waited on. Intel Reports gains a feed
 *    line: how many of its relays have answered. No method or option moved: a wait that may be longer.
 * 47: Missions (missions-first-visit.md, D-MF step 5): `layers` gains `OpenMissions`, the one section of the
 *    mode `Missions`, which draws the missions open to take by the place each names, outlined with a pill
 *    counting them (MF17). Drawn on a card like any layer; its feed line and whenReady come with step 5e.
 *    ADDITIVE.
 * 46: AI Watch (ai-watch.md, D-AW): `layers` gains `AiIncidents`, `AiFrontier`, `AiWar` and `AiSafety`,
 *    the sections of the mode `AIWatch`, which draws Mecha Jono's Terminator Watch notes by area (AW2).
 *    The notes with a place move there from Intel Reports (AW1). `listLayers` says which draw. ADDITIVE.
 * 45: The Amazon Basin (ZSP 1.0). `areas` gains `zone:amazon-basin`, its outline its ZSP document's, twelve
 *    Sectors from LBA-ECO CD-06's tributary sub-basins. Every code that was there still is.
 * 44: More areas (BA16-BA18, and the Zone and Sector Protocol). `areas` gains two zones,
 *    `zone:bahia-coast-reconcavo` and `zone:central-american-dry-corridor`, and eight spheres:
 *    `sphere:russophone`, `sphere:arabophone`, `sphere:turkic`, `sphere:persianate`,
 *    `sphere:germanosphere`, `sphere:malay`, `sphere:swahili` and `sphere:nordic`. The East African
 *    Rift's shape is now its ZSP document's outline. Every code that was there still is.
 * 43: Hero Watch this week as a briefing playlist (hero-watch.md, HW13): `playlists` gains `heroes`, so
 *    the Tour button offers it and `recordTour({ playlist: "heroes" })` records it. It shows Relief with
 *    Field missions beside it, as they stand now, and stops at each relief country, at its largest
 *    operation (or OCHA's count where it has none), the largest first, then at each open field mission,
 *    ending soonest first, each said as its card says it, a mission's safety limits among its lines.
 *    A clip's burned caption never cuts the limits: it widens toward the frame's edges, then grows, and
 *    a frame too small to hold them whole is refused. Its opening and end card say its order, never
 *    "the worst": it ranks no harm. ADDITIVE.
 * 42: Hero Watch's week (hero-watch.md, D-HW, HW10). A shot's `subject: { week: "latest" }`, and a
 *    renderBatch request's `{ week: "latest" }`: Hero Watch's week on its front page, drawn on Relief
 *    with Field missions and Lifeboats pinned beside it (or the shot's own primary among the three, its
 *    own pins), the planet turned to the middle of its relief and missions. Its lines: the relief
 *    standing, the week's lifeboat launches in Mecha Jono's roundup's own words, the field missions
 *    open, and the roundup named; where the roundup is not read, the page says so and counts what is
 *    drawn. Refused when nothing stands. A window is refused (it shows one moment), and so is a
 *    template. The record keeps the page (`frontPage.kind: "week"`, card schema 27). ADDITIVE.
 * 41: Hero Watch on cards (hero-watch.md, D-HW, step 7; HW10-HW12). `listReports` lists Hero Watch's
 *    drawn items, each by its address: a lifeboat station (`Lifeboats`), a relief note at its country
 *    (`Relief`), and an open field mission at its place (`FieldMissions`, or `RaverMissions` where Raver
 *    Watch draws the harm-reduction ones), whose address is a mission package's, `30079:<pubkey>:<d>`.
 *    Their `variant` is `station`, `station-uncounted`, `operation`, `presence` or `mission`. A shot's
 *    `subject: { address }` takes them as it takes any listed item. The `field_mission` template is
 *    built: a field mission's card wears FIELD MISSION in rescue orange, the item choosing it, and says
 *    its safety limits in full. A deeplink's `focus` takes a field mission's address. ADDITIVE.
 * 40: Hero Watch (hero-watch.md, D-HW): `layers` gains `Lifeboats`, `Relief` and `FieldMissions`, the
 *    sections of the mode `HeroWatch`, and RLSH belongs to that mode now (HW1), so `setLayer('RLSH')`
 *    opens it there. Relief and field missions are listed before they draw, as Raver missions are, and
 *    `listLayers` says which draw. ADDITIVE.
 * 39: A briefing playlist as a clip (briefing-playlists.md, BP14–BP21).
 *    `recordTour({ playlist, fps?, quality?, settleMs?, endCard?, timeoutMs? })`
 *    records the screen tour of `war`, `raves` or `heat` (listed as `playlists`):
 *    the playlist's layers and moment shown as the Tour button shows them, its
 *    layer's read waited for (20 s by default) and what arrived toured, then the
 *    layers, the moment and the camera put back. The clip opens on the whole
 *    planet, then flies to each stop and holds it for its reading time, at the
 *    screen's pace, as many of the worst stops as fit the frames a call may hold
 *    (30 s at 30 fps); each frame carries its moment's caption burned in, as the
 *    screen's panel at the foot of the frame. Its record (clip schema 8) has a
 *    `tour` track and `tour`: the playlist, the stops shown of how many, and every
 *    caption with when it shows; its end card names the tour and each stop.
 *    Nothing is featured. Returns what recordClip returns. ADDITIVE.
 *
 * 38: Tonight's card (raver-nights.md, RN3). A shot's `subject: { tonight:
 *    "latest" }`, and a renderBatch request's `{ tonight: "latest" }`: the twelve
 *    hours from the shot's moment (`time.at`), or from now while live; a window
 *    is refused, since tonight starts at one moment. Scene events drawn and read
 *    whole first, the primary layer (pin HeatRisk or others beside them). Only
 *    tonight's events drawn: tonight's twelve hours set on the timeline while the
 *    card is made, and the timeline put back after as it was (RN10); events under
 *    way as tonight begins are drawn and counted apart, with a caveat. The planet
 *    turned to the middle of tonight's events, the brief card's distance out,
 *    their heat halos drawn. The card: "Raver Watch · tonight
 *    from <date> <HH:MM>Z" as its headline; how many scene events start and how
 *    many stand in a hot town (HeatRisk 2 or worse within 25 km that day); then a
 *    row a region, the first to start first, each with its events, how many under
 *    heat, and its first start as its zone's clock reads it. Its record keeps the
 *    page (`frontPage.kind: "tonight"`, card schema 25; `underWay` 26), and the
 *    shot as drawn states tonight's start as its moment. It takes no template, and
 *    a night with no events is refused, saying from when. ADDITIVE.
 *
 * 37: The four-theatre front page (theatre-lens.md, TL15–TL17). A shot's
 *    `subject: { brief, theatres }`, and a renderBatch request's `{ brief,
 *    theatres }`: the War & Conflict Brief of a day, narrowed to its worst
 *    theatres, 1 to 4, in its own order (worst war tier first, then most items).
 *    One planet, centred among them, the brief card's distance out; their
 *    countries lit together and the rest of the war map faded, the other
 *    theatres' items dimmed. The card's lines are the day's count, then a row a
 *    theatre: its name, its items that day, its war's tier, and its most serious
 *    item by title. Its record says which it lit (`frontPage.lit`, card schema
 *    24). A theatre that cannot be framed is still lit and has its row. Without
 *    `theatres`, the brief card as it was. ADDITIVE.
 *
 * 36: A card about a War & Conflict theatre (theatre-lens.md, TL3). A shot's
 *    `subject.theatre`, and a renderBatch request's `theatre`: a theatre's slug,
 *    as the War & Conflict Brief names it ("russia-ukraine"). War & Conflict
 *    drawn, read whole first; the theatre's countries lit and every war fill
 *    faded, its items whole and the others dimmed, as the brief panel's lens
 *    shows it; framed over its countries round the smallest (Russia–Ukraine on
 *    Ukraine), or on its items when it has no country drawn. The card: its name
 *    as the headline; how many of its items stand, by what backs them; the most
 *    serious by title; its war on Wikipedia's list and that war's tier; where it
 *    comes from. Its `provenance.featured.id` is `theatre:` and the slug, never an
 *    address. Refused for a theatre nothing read names, naming those read. A
 *    card about anything else is made with no theatre's lens, whatever the
 *    person picked; theirs is put back after. ADDITIVE.
 *
 * 35: Country names in a clip (decision K5, TS10). `recordClip({ countryNames:
 *    true })` draws Natural Earth's names in every frame, as a card whose shot
 *    asks does: placed frame by frame, never over a mark, fading over a fifth of
 *    a second of footage, and the same clip draws the same names however fast the
 *    page renders. Refused while the territories overlay is off or the names'
 *    face has not loaded, and at any frame that drew none. The clip's record says
 *    so, with the de facto caveat (clip schema 7), and its end card credits
 *    "Names: Natural Earth". ADDITIVE.
 *
 * 34: Country names on a card (decision K5, TS10–TS14). A shot's
 *    `appearance.countryNames: true` draws Natural Earth's names, by their rank
 *    and the picture's zoom, never over a mark; unstated or false, none, whatever
 *    the screen shows. The shot as drawn states it only when true. A card asking
 *    is refused while the territories overlay is off or the names' face has not
 *    loaded. Its record lists the names placed, says they are Natural Earth's, de
 *    facto control and all, and credits "Names: Natural Earth" (capture schema
 *    23). Clips draw no names yet. ADDITIVE.
 *
 * 33: The territories' style on a card (decision K5, TS3). A shot's
 *    `appearance.territories` is `classic` or `quiet` (`territoryStyles`); a card
 *    draws Quiet unless its shot names one, whatever the screen draws (capture
 *    schema 22). ADDITIVE.
 *
 * 32: Clips that move through time (decision D-W, step 5c). `recordClip({
 *    sweep: { from, until } })` moves the shared moment from `from` to `until`
 *    (unix seconds, at most 24 hours apart) over the footage, every layer drawn
 *    for each frame's moment, so Earth Weather's forecast hours flow. Every
 *    model step the span crosses is loaded before the first frame, and each
 *    frame is captured once its moment is drawn; the moment is left as it was
 *    found. Not with `replay`. The clip says the span it swept, and which
 *    source was drawn when (clip schema 5). ADDITIVE.
 *
 * 31: Earth Weather's look (decision D-W, WX9). `setWeather({ colour, wind,
 *    clouds })` sets any of the three for this page only, never saved: what
 *    colours the ground (`weatherColours`: NOAA GFS temperature, rain from
 *    radar where it reaches and the model elsewhere, the stations' air
 *    quality, or none), whether the wind's streaks flow, whether the
 *    satellites' clouds are drawn. A part not named stays as it was; null
 *    returns all three to the person's. `getWeather()` says the look in force
 *    and, for each part, whether the handle or the person's setting set it.
 *    They draw while Earth Weather is shown. ADDITIVE.
 *
 * 30: Looking by area (BA21–BA23; plan block J, item 6b).
 *    - `listReports({ area })` lists what stands in an area, by `listAreas()`'s
 *      code or a bare `eu`: each item whose listed place is inside the area's
 *      outline. A report about a territory or an area stands at its middle, so
 *      one naming the area is in it. A promise, since the shapes are fetched
 *      the first time one is asked for; `counts: true` beside it as before.
 *    - `frameArea(area, { preset })` moves the camera to the area's largest
 *      part and each other part that fits with it, and says what is outside
 *      the frame in words, or null.
 *    - A shot's `subject.area`, and a renderBatch request's `area`: Intel
 *      Reports drawn, the area framed so and lit, and a card about it: its name
 *      as the headline; how many Intel Reports are in it, by assessment; the
 *      most severe by title; its note, source and the day it was read; what is
 *      outside the frame. The card's `provenance.featured.id` is `area:` and the
 *      code, never an address. ADDITIVE.
 *
 * 29: Areas (BA16–BA18; plan block J, item 6). A report's jurisdiction tag can
 *    name a continent, union, sphere or zone by a prefixed code
 *    (`continent:africa`, `union:eu`, `sphere:anglosphere`,
 *    `zone:east-african-rift`; a bare `eu` too). Such a report is listed,
 *    featured and grouped as one about a territory is, its area outlined and
 *    lit, and a click inside opens it. `listAreas()` gives each area's code,
 *    kind and name, its members where it is made of countries, and its source
 *    and the day it was read; `areas` and `areaAliases` list the codes here.
 *    ADDITIVE.
 *
 * 28: Category emblems (BA12–BA15; plan block J, item 5). Each listed Intel
 *    Report carries `category`, its stated top-level `category:` word or null;
 *    its glyph wears that word's emblem inside a page that keeps its colour for
 *    the assessment, a report nobody assessed a hollow page. On unless a person
 *    turns it off; `setReportLook({ emblems })` sets it for this page only,
 *    never saved, null returning to the person's, and `getReportLook()` says
 *    which is in force. `reportCategories` publishes each word, what it means
 *    and its icon (Lucide's names), and the icon for a word not yet given one.
 *    ADDITIVE.
 *
 * 27: Groups (BA10; plan block J, item 4). Each listed Intel Report carries
 *    `group` ({ key, kind: 'place' | 'territory', size }): the reports under one
 *    glyph, keyed by the report drawn for it and never by a position, or about
 *    one territory, by the first it names. `listGroups()` lists each group with
 *    its members most severe first, where it is no finer than 0.1°, and a
 *    territory group's territory. A card featuring one of a group says which
 *    of how many it is ("2 of 4 here"). In the app, a click on such a place, or
 *    inside an outlined territory, opens a menu of them (K8). ADDITIVE.
 *
 * 26: Intel Reports about a territory as a whole (BA3; Mecha Jono's ask C).
 *    A report naming a country or a US state and no place in it is listed,
 *    standing at the middle of the territory's largest part with `precisionM`
 *    how far it reaches, and carries `territories` ({ code, name }); featured,
 *    its outline is lit and the card says it is about the place as a whole,
 *    never a pin. US states are drawn from Starcom's own state lines. ADDITIVE.
 *
 * 25: The report cap (BA1, BA5–BA7). `listReports({ counts: true })` returns
 *    the list with how many Intel Reports matched against how many the cap
 *    drew, and whether the cap cut them; `setReportCap(n | 'max' | 'unlimited'
 *    | null)` sets a cap for the page, never saved, null returning to the
 *    person's; `getReportCap()` says the cap in force and who set it. Above 200
 *    the app reads more from the relays (BA6). `reportCap` publishes the
 *    choices. ADDITIVE: listReports() with no argument is as before.
 *
 * 24: Mecha Jono's briefing asks B and D, and their reply on type sizes.
 *    `recordClip({ replay: { from, until } })` bounds a replay to a span (unix
 *    seconds), else the timeline's window, else the reports' own first and
 *    last times (`replaySpans`); reports outside it stay hidden while it plays,
 *    and the clip says which span it swept and how many it hid (clip schema 3).
 *    `whenReady({ address })` says why an address a layer holds is not drawn:
 *    its layer off, outside the moment shown, news, no place. A card is drawn
 *    one type step larger where it fits and compact where the larger would be
 *    refused (IM38; `typeSteps`), and says which in `provenance.typeStep`
 *    (capture schema 17). ADDITIVE.
 *
 * 23: A close-up of the featured item (IM2, IM34–IM36), only when a shot asks:
 *    `card.inset` true draws an inset in the picture's corner away from the
 *    item, with a leader from its mark: a public venue among the public venues
 *    open the same night within 25 km, on a 1 km grid, or a heat town among its
 *    state's the same day, inside Starcom's own state lines, each with a scale
 *    bar. Refused, saying why, for any other item, and never drawn for an Intel
 *    Report. `regions.inset` says where it is and `provenance.inset` what it
 *    draws (capture schema 16). ADDITIVE.
 *
 * 22: A card's QR code (IM13, IM30–IM32), only when a shot asks: `card.qr`
 *    true draws a QR code of a short link to the view on starcom.app (place,
 *    altitude and layers; the item's address stays in `provenance.link`), with
 *    the footer, right-aligned. `regions.qr` says where it is and
 *    `provenance.qr` what it opens (capture schema 15). ADDITIVE.
 *
 * 21: Every card is exactly its size (IM27, IM28): `presetSizes` gives each,
 *    the whole card. Square and portrait stack like the 9:16, the picture
 *    taking what the text leaves; `wide` (1200×630) and `embed` (1280×800) put
 *    the picture on the left, square while the text fits beside it, and the
 *    text in a column on the right, whose `regions.footer` band is the
 *    column's. A card is never cut to fit: one whose picture would fall under
 *    its floor is refused, pointing at the 9:16. A card asked for with no size
 *    is `wide`. ADDITIVE in shape; every size but the 9:16 is a new picture.
 *
 * 20: A card says where its parts are (block I, item 5): `regions.picture`,
 *    the picture as drawn, and `regions.footer`, the band the footer is drawn
 *    in, edge to edge, in the card's pixels. The footer states the capture's
 *    moment and the build, so it changes with every capture and every commit;
 *    two cards of one shot match outside it (golden cards, IM22). ADDITIVE.
 *
 * 19: Capture mode (block I, item 5; decisions IM20, IM23). A shot's `time.at`,
 *    in whole unix seconds, pauses the shared timeline at that moment, as a
 *    person pausing it would, and a paused globe is lit for its moment. Every
 *    capture holds motion still for its render: the glows at rest, clouds and
 *    space weather at its moment's phase, the paused moment's when paused. So
 *    the same shot makes the same picture. `captureFrame` takes `stillAt`.
 *    ADDITIVE.
 *
 * 18: A card's file carries its record (block I, item 5): XMP, with the alt
 *    text as dc:description and the provenance as starcom:provenance (JSON),
 *    in a PNG's iTXt chunk, a JPEG's APP1 segment or a WebP's "XMP " chunk, as
 *    `fileRecord` says. A JPEG too small for the whole record names what it
 *    left out in starcom:omitted, and the card warns. A card's `mimeType` is
 *    the type the browser made. ADDITIVE.
 *
 * 17: Alt text and warnings on every card (block I, item 5). A card gains
 *    `alt`, what a screen reader says for it, written from what it states:
 *    its badge and whole headline, its facts, what the picture shows, every
 *    caveat in short, and when Starcom made it; a shot's `output.alt: false`
 *    leaves it off, and it is never the caller's words. A card gains
 *    `warnings`, from a linter: a shortened headline or label, the featured
 *    item at the picture's edge, a file over Discord's 8 MB. renderShot
 *    returns them with the plan's (a layer drawing nothing in the picture).
 *    ADDITIVE.
 *
 * 16: The composed 9:16 (block I, item 3; decision IM6). `story` is a fixed
 *    1080×1920: its title band above the picture, its facts, key, caveats and
 *    footer below, and the picture what the text leaves, never squatter than
 *    4:3. A card with more to say than a 9:16 holds is refused for the portrait
 *    one, never cut. describeView plans its window as compose does. ADDITIVE.
 *
 * 15: The War & Conflict Brief's front page (block I, item 3; decision IM16).
 *    A shot's subject can be `{ brief: 'latest' | 'YYYY-MM-DD' }`: War &
 *    Conflict is drawn, the camera centres on the day's items, and the card,
 *    under the conflict_brief template, now built, states the day's count and
 *    each theatre with its count, worst first. Its provenance gains
 *    `frontPage` (capture schema 14). ADDITIVE.
 *
 * 14: Mecha Jono's card templates (block I, item 3; decisions IM5, IM14,
 *    IM15). A shot names one as `card.template`, now built, and
 *    `composeFor(address, { template, preset, scale, timeoutMs })` makes one
 *    item's card with it, returning what compose returns. `templates` lists
 *    them as built or not built yet. A template's badge is the item's own where
 *    the item says what it is: `listReports` gives a War & Conflict item's
 *    `role`, and a shot asking for another is refused. `embed` is Discord's
 *    1280×800, which they call wide; `wide` stays the link preview. A card's
 *    provenance records its template (capture schema 13). ADDITIVE.
 *
 * 13: How a card frames the planet (block I, item 2). A card's frame is now
 *    its own window of the view, rendered at the card's resolution through the
 *    camera's view offset: never letterboxed, never upscaled. `fit` chooses the
 *    window: `view`, what the camera framed cut to the card's shape, as the
 *    framing maths assumes, or `planet`, the whole padded planet, reaching past
 *    the canvas. By default a card about one item shows the view and one about
 *    none the planet (the owner's choice, IM9). `compose` and `describeView`
 *    take it, a shot says it as `framing.fit`, and describeView says which it
 *    used. ADDITIVE.
 *
 * 12: `layersFor(category)` — Starcom's layers for one of Mecha Jono's
 *    categories, as their v9 proposal asked: `{ category, layers, from }`, where
 *    `from` says whether the kind, its group or the default decided. Only layers
 *    this build draws. ADDITIVE.
 *
 * 11: The shot (decision IM1; globe record, section 21). `planShot(shot)` is a
 *    dry run: the shot is staged and described, and nothing composed;
 *    `renderShot(shot)` makes its card, whose provenance carries the shot as
 *    drawn (capture schema 11). `shot` names every field a shot may carry, as
 *    built or not built yet. `renderBatch` takes shots as well as v9 requests,
 *    and each result gains its shot, notes and timing. ADDITIVE.
 *
 * 10: War & Conflict (decisions WC1-WC4): `WarConflict` joins `layers`, and
 *    `listReports` lists its items, each at its point or its country's
 *    centre, with its backing as `variant`. ADDITIVE.
 *
 * 9: Two parts of Mecha Jono's v9 proposal, the two the owner chose to build
 *    now (2026-10-02). `whenReady({ address })` resolves once that item is
 *    drawn as well as capturable, and every not-ready answer says why
 *    (`reason`). `renderBatch(requests, { timeoutMs })` makes many cards in one
 *    page load, in order, each result `{ ok, card?, reason?, note? }`; a
 *    request is `batchRequest`. An `area` is refused with its reason and a
 *    `template` makes the default card, with a note: frameArea and the card
 *    templates are not built. The rest of v9 (focusEvent, composeFor,
 *    frameArea, renderMission, layersFor) comes with block H and is not
 *    claimed here. ADDITIVE.
 *
 * 8: Raver Watch (globe record, section 19; decisions RW7 and RW8). Its six
 *    layers join `layers`. `listReports` gains `layer`, and lists Raver Watch
 *    items too: the id `30023:<pubkey>:<d>`, the level as `variant`, and time
 *    basis `applies`, so `frameReports`, `focusReport` and `planReportTour`
 *    work on them. `setTimeWindow({ from, until })` moves the app's shared
 *    window, in unix seconds, and `null` returns to live; `getTimeWindow()`
 *    reads it. A card's provenance gains `link`, its view as a deeplink v1,
 *    `window`, and `raverWatchItems` (capture schema 10). ADDITIVE.
 *
 * 7: `planReportTour` — keyframes for a tour of reports at no lower than the
 *    framing floor; and `recordClip` takes `endCard: 'read' | 'poster'`, poster
 *    holding every caveat page for one frame (decision D-F, section 18, item 5;
 *    Mecha Jono's ask); and `replay`, revealing reports in time order as the
 *    clip plays. A clip's provenance names its featured report and any replay
 *    window (clip schema 2). ADDITIVE.
 * 6: `describeView` — per drawn layer, how many marks are in the picture a card
 *    of that preset would cut, and the first few by name (decision D-F, section
 *    18, item 6; Mecha Jono's ask). ADDITIVE.
 * 5: `listReports`, `frameReports`, `focusReport` — featuring one report
 *    (decision D-F, section 18, item 2). v4 could reach every layer and say
 *    nothing about one report; a card now names the report it is about and
 *    points at its glyph. `framing` publishes the altitude floor every framing
 *    keeps: nothing closer than one globe radius. ADDITIVE — nothing existing
 *    moved. A card also gains `provenance.featured` (capture schema 9).
 * 4: `listLayers`, `setLayer`, `pinLayers`, `setMarkerStyle`, `whenReady` —
 *    the controls that decide WHAT is drawn, plus a readiness signal. Until
 *    this, the handle could move the camera and not change the subject: the
 *    layer comes from `visualizationMode.subMode`, which defaults to
 *    CyberCommand/IntelReports, persists to localStorage and has no URL, so an
 *    agent in a fresh browser could reach exactly one of eleven views.
 *    ADDITIVE — five new methods; nothing existing moved.
 * 3: `recordClip`, returning frames at an exact rate for the caller to
 *    assemble. ADDITIVE — a new method; nothing existing moved.
 * 2: `options` declared per method, and `presets` listed. ADDITIVE — every v1
 *    call still works unchanged; the bump says there is more surface, not that
 *    anything moved.
 * 1: compose, captureFrame, getView, setView.
 */
export const SHARE_HANDLE_VERSION = 84 as const;

/**
 * The surface an agent may rely on.
 *
 * `args` is the count of parameters the method is called with, not its
 * declared arity — optional parameters are part of the contract, and a caller
 * on the other side of this boundary cannot see a default.
 *
 * `returns` lists keys an agent may read. Extra keys appearing at runtime are
 * a failure, not a bonus: an undeclared key is one somebody will start
 * depending on before anybody decided to support it.
 */
export const SHARE_HANDLE_CONTRACT = {
  name: SHARE_HANDLE_NAME,
  version: SHARE_HANDLE_VERSION,
  properties: ['version'],
  /*
   * `options` names the fields each method accepts. Without it an agent cannot
   * discover that `preset` exists, and a contract that lists only method names
   * describes how to call the API but not what it can be asked to do.
   *
   * setView takes two parameters — the position fields go in the first, the
   * timing fields in the second — and they are listed together because both
   * are options a caller supplies.
   */
  methods: {
    compose: { args: 1, options: ['scale', 'preset', 'fit'] },
    captureFrame: { args: 1, options: ['scale', 'width', 'height', 'mimeType', 'quality', 'stillAt'] },
    getView: { args: 0, options: [] },
    setView: { args: 2, options: ['lat', 'lng', 'altitude', 'transitionMs', 'settleMs'] },
    recordClip: { args: 1, options: ['keyframes', 'fps', 'quality', 'settleMs', 'endCard', 'replay', 'sweep', 'countryNames', 'markStyle'] },
    recordTour: { args: 1, options: ['playlist', 'fps', 'quality', 'settleMs', 'endCard', 'timeoutMs', 'markStyle'] },
    recordStory: { args: 1, options: ['story', 'fps', 'quality', 'settleMs', 'endCard'] },
    listLayers: { args: 0, options: [] },
    setLayer: { args: 2, options: ['pin', 'clearOtherPins'] },
    pinLayers: { args: 1, options: [] },
    setMarkerStyle: { args: 2, options: [] },
    whenReady: { args: 1, options: ['timeoutMs', 'address'] },
    listReports: { args: 1, options: ['counts', 'area'] },
    listGroups: { args: 0, options: [] },
    listAreas: { args: 0, options: [] },
    frameReports: { args: 2, options: ['preset', 'transitionMs', 'settleMs'] },
    frameArea: { args: 2, options: ['preset', 'transitionMs', 'settleMs'] },
    focusReport: { args: 1, options: [] },
    describeView: { args: 1, options: ['preset', 'fit'] },
    planReportTour: { args: 2, options: ['preset', 'maxStops', 'holdMs', 'travelMs'] },
    setTimeWindow: { args: 1, options: ['from', 'until'] },
    getTimeWindow: { args: 0, options: [] },
    renderBatch: { args: 2, options: ['timeoutMs'] },
    planShot: { args: 2, options: ['timeoutMs'] },
    renderShot: { args: 2, options: ['timeoutMs'] },
    layersFor: { args: 1, options: [] },
    composeFor: { args: 2, options: ['template', 'preset', 'scale', 'timeoutMs'] },
    setReportCap: { args: 1, options: [] },
    getReportCap: { args: 0, options: [] },
    setReportLook: { args: 1, options: [] },
    getReportLook: { args: 0, options: [] },
    setLayerChoices: { args: 2, options: [] },
    getLayerChoices: { args: 1, options: [] },
    setWeather: { args: 1, options: ['colour', 'wind', 'clouds'] },
    getWeather: { args: 0, options: [] },
    setScale: { args: 1, options: [] },
    getScale: { args: 0, options: [] },
    // Two layers side by side (v78, D-CM CM3): each half drawn without the other's; cards and clips name the halves.
    setCompare: { args: 1, options: ['left', 'right', 'layer', 'earlier', 'window', 'ahead'] },
    getCompare: { args: 0, options: [] },
    setSky: { args: 1, options: ['az', 'alt', 'fov'] },
    getSky: { args: 0, options: [] },
    whatsNew: { args: 2, options: ['until'] },
  },
  /**
   * What a shot may say (shotSpec.ts). A field not built yet that would change
   * what the picture shows is refused with its reason; one that changes only
   * how it looks is dropped with a note. Typed out here rather than imported,
   * because a build script with no browser reads this file.
   */
  shot: {
    version: 1,
    built: [
      'v', 'subject.address', 'subject.view', 'subject.brief', 'subject.area', 'subject.theatre', 'subject.theatres', 'subject.tonight', 'subject.week', 'subject.declassified',
      'subject.psiEvent', 'subject.at', 'subject.psiBriefing',
      'layers.primary', 'layers.pins', 'time.live', 'time.window', 'time.at', 'emphasis.featured', 'framing.fit', 'appearance.skin', 'appearance.light', 'appearance.nightFill', 'appearance.territories', 'appearance.countryNames',
      'appearance.markStyle', 'appearance.psiLooks', 'card.preset', 'card.template', 'card.qr', 'card.inset', 'card.strip', 'card.chart', 'output.type', 'output.quality', 'output.scale', 'output.maxBytes', 'output.alt',
    ],
    notBuilt: [
      'subject.mission',
      'framing.tilt', 'framing.padding', 'framing.offset', 'layers.opacity', 'emphasis.others',
      'appearance.clouds', 'appearance.atmosphere', 'card.timeZone', 'card.callouts',
    ],
  },
  /**
   * What one `renderBatch` request may say. `address` is an id listReports()
   * lists; `area` is an area's code, as listAreas() gives it, for a card about
   * the area (v30); `theatre` is a War & Conflict theatre's slug, for a card
   * about the theatre (v36); `brief` is "latest" or a UTC day, for the War &
   * Conflict Brief's front page, and `theatres` beside it narrows it to its worst
   * 1 to 4 (v37); `tonight` is "latest", for tonight's card (v38); `week` is "latest",
   * for Hero Watch's week (v42); `psiEvent` is a Psi Watch sky event's or window's address, with `at`, "exact" or a
   * unix second inside its window (v62); `psiBriefing` is "latest", for the PsiOps Briefing (v64); `template` is one of
   * `templates`, as a shot's `card.template`.
   */
  batchRequest: ['address', 'area', 'theatre', 'brief', 'theatres', 'tonight', 'week', 'declassified', 'psiEvent', 'at', 'psiBriefing', 'preset', 'layers', 'window', 'template'],
  /** A Timestream strip's lanes (`card.strip.lanes`, v63; D-PW, PW62, PW77), all three unless a shot names its own. */
  stripLanes: ['windows', 'kp', 'bodies'],
  /**
   * What `recordClip({ sweep })` takes (v65; D-PW, PW62, the kit's question 3): `from` and `until` in unix seconds,
   * and a `step` for a moment that jumps and holds. A day at most while a forecast layer is drawn, else 400 days.
   */
  sweep: { fields: ['from', 'until', 'step'], maxSeconds: 86_400, maxSecondsWithoutForecasts: 34_560_000, forecastLayers: ['EarthWeather', 'SpaceWeather'], minStepSeconds: 60 },
  /** How `recordClip` may close a clip. Every mode keeps every caveat. */
  endCards: ['read', 'poster'],
  /** The briefing tour's playlists `recordTour` records (v39): War & Conflict today, Raver Watch tonight, the heat watch. */
  playlists: ['war', 'raves', 'heat', 'heroes'],
  /** How `recordClip({ replay })` spaces the reports: `even` (default) or at the pace of `time`. */
  replayPaces: ['even', 'time'],
  /** What bounds a replay (v24, BA2): `replay.from` and `replay.until`, in unix seconds. */
  replayBounds: ['from', 'until'],
  /** Where a replay's span comes from, first to last: named, the timeline's window, the reports' own. */
  replaySpans: ['named', 'window', 'reports'],
  /** Over how many seconds of a clip each quake fades in its replay (v77, D-EQ EQ21): `replay.decayS`, 4 by default. */
  replayQuakeDecays: [1, 4, 10],
  /** One layer at two moments (v79, D-CM CM4): the layers that can, and how much earlier the right half may be. */
  compareMomentLayers: COMPARE_MOMENT_LAYERS,
  compareEarlier: ['1w', '1mo', '1y', '10y'],
  compareAhead: COMPARE_AHEAD_HOURS,
  /** The type a card is drawn in (v24, IM38): one step larger where it fits, else compact. */
  typeSteps: ['larger', 'compact'],
  /** How many Intel Reports the globe draws (v25, BA5): the steps, Max, the least a number may be, where people start. */
  reportCap: { steps: [50, 100, 250, 500], max: 1000, min: 10, default: 50, named: ['max', 'unlimited'] },
  /** What each Intel Report category word means and its icon (v28, BA13), and the icon for any other word. */
  reportCategories: {
    words: INTEL_CATEGORIES.map((word) => ({ word, meaning: INTEL_CATEGORY_SYMBOLS[word].meaning, icon: INTEL_CATEGORY_SYMBOLS[word].name })),
    other: { meaning: GENERIC_CATEGORY_SYMBOL.meaning, icon: GENERIC_CATEGORY_SYMBOL.name },
  },
  /**
   * Every area a report's jurisdiction tag can name (v29, BA17), and the bare
   * codes read as one. `listAreas()` adds what each is made of and its source.
   */
  areas: AREAS.map(({ code, kind, name }) => ({ code, kind, name })),
  areaAliases: AREA_ALIASES,
  /** What `setWeather({ colour })` may colour the ground with (v31, WX9). */
  weatherColours: WEATHER_COLOURS,
  /** What setScale takes (v72; Diagram v73; Sky v74): typed out, as the shot fields are; a test holds it to SOLAR_SCALES. */
  solarScales: ['compact', 'true', 'diagram', 'sky'],
  /**
   * The styles a shot's `appearance.territories` may name (v33, K5). A card draws
   * `quiet` unless its shot names one, whatever the screen draws: the screen's
   * default is `classic`, four colours with no two neighbours alike.
   */
  territoryStyles: ['classic', 'quiet'],
  /**
   * The limits every framing keeps, in globe radii above the surface. The floor
   * is a privacy rule, not a style: a report's position can be a filing address,
   * and at globe scale a mark is a region, not a door. RLSH entities are never
   * listed, framed or featured.
   */
  framing: { altitudeFloor: 1, altitudeCeiling: 4 },
  /**
   * Published sizes `compose` accepts: each the whole card, exactly (v21), as
   * `presetSizes` gives it in pixels at scale 1.
   */
  presets: ['wide', 'square', 'portrait', 'embed', 'story'],
  presetSizes: { wide: [1200, 630], square: [1080, 1080], portrait: [1080, 1350], embed: [1280, 800], story: [1080, 1920] },
  /**
   * Mecha Jono's card templates (their card-templates@1), as built or not
   * built yet. One not built is refused with what will build it.
   */
  templates: {
    built: ['critical_intel', 'actionable_intel', 'context_report', 'conflict_brief', 'hazard', 'raver_alert', 'field_mission', 'declassified', 'psi'],
    notBuilt: ['mission_package'],
  },
  /**
   * Where a card's file carries its record, so a copy saved or forwarded can be
   * traced to the view that made it. Typed out, as everything here is.
   */
  fileRecord: {
    format: 'XMP',
    namespace: 'https://starcom.app/ns/capture/1.0/',
    png: 'iTXt XML:com.adobe.xmp',
    jpeg: 'APP1',
    webp: 'XMP ',
  },
  /**
   * How a card frames the planet: `view`, what the camera framed, cut to the
   * card's shape; `planet`, the whole planet with its margin.
   */
  fits: ['view', 'planet'],
  /**
   * The marker styles `setMarkerStyle` accepts. Declared so an agent does not
   * have to discover them by trying one and seeing whether it throws.
   */
  markerStyles: ['disc', 'glow', 'ring'],
  /**
   * The choices `setLayerChoices` takes, by layer (v68; critique-2026-11-01, OR12): the second left rail's own, which
   * a person makes on the rail and a link carries. A layer's choices kept in its own settings are not here.
   */
  layerChoices: choosableLayerChoices(),
  /**
   * Every layer id, so a caller can plan a run BEFORE spending a page load
   * finding out what exists. `listLayers()` returns the same ids with their
   * live state; this is the static roster.
   *
   * Two of these draw no styleable point marks and that is deliberate, not a
   * gap: ConflictZones tells war events from displacement by SHAPE (a disc
   * versus a ring), and ResourceZones draws meshes and lines rather than
   * points. `setMarkerStyle` on either is accepted and has no visible effect.
   */
  layers: [
    'IntelReports', 'CyberThreats', 'Satellites', 'CommHubs', 'RLSH',
    'DiplomaticEvents', 'ResourceZones', 'ConflictZones',
    'SpaceWeather', 'EcologicalDisasters', 'EarthWeather',
    'DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk', 'RaverMissions', 'HarmReductionSites',
    'WarConflict',
    'Lifeboats', 'Relief', 'FieldMissions',
    'AiIncidents', 'AiFrontier', 'AiWar', 'AiSafety',
    'OpenMissions',
    'CampaignsOperations',
    // Safety windows (D-RR, RR1): listed, as RLSH is, and never drawn in a card or a clip (shotSpec refuses it).
    'SafetyWindows',
    'CivilUnrest', 'ProtestSurges',
    // Psi Watch (D-PW, PW62): listed by listLayers while its switch is on, as it is unless ?psi=off hid it (OR6).
    'PsiLines', 'PsiField', 'PsiZones', 'PsiRifts', 'PsiWindows', 'MagneticShield', 'PsiModel',
  ],
  returns: {
    compose: ['dataUrl', 'width', 'height', 'mimeType', 'provenance', 'sourceRect', 'frame', 'alt', 'warnings', 'regions'],
    captureFrame: ['dataUrl', 'width', 'height', 'mimeType'],
    getView: ['lat', 'lng', 'altitude'],
    setView: ['lat', 'lng', 'altitude'],
    recordClip: ['frames', 'fps', 'mimeType', 'width', 'height', 'provenance', 'stats'],
    recordTour: ['frames', 'fps', 'mimeType', 'width', 'height', 'provenance', 'stats'],
    recordStory: ['frames', 'fps', 'mimeType', 'width', 'height', 'provenance', 'stats'],
    listLayers: ['id', 'label', 'category', 'implemented', 'active', 'primary', 'pinned'],
    setLayer: ['primary', 'pinned'],
    pinLayers: ['pinned'],
    setMarkerStyle: ['layer', 'style'],
    whenReady: ['ready', 'waitedMs', 'reason'],
    listReports: ['id', 'layer', 'title', 'variant', 'variantMeans', 'author', 'time', 'precisionM', 'lat', 'lng', 'sharesPlaceWith', 'role', 'territories', 'group', 'category'],
    listGroups: ['key', 'kind', 'size', 'members', 'lat', 'lng', 'territory'],
    listAreas: ['code', 'kind', 'name', 'members', 'source', 'note'],
    frameReports: ['lat', 'lng', 'altitude'],
    frameArea: ['lat', 'lng', 'altitude', 'outside'],
    focusReport: ['featured'],
    describeView: ['preset', 'fit', 'layers', 'notCounted'],
    planReportTour: ['keyframes', 'stops', 'durationMs', 'skipped'],
    setTimeWindow: ['from', 'until', 'live'],
    getTimeWindow: ['from', 'until', 'live'],
    setReportCap: ['cap', 'label', 'from'],
    getReportCap: ['cap', 'label', 'from'],
    setReportLook: ['emblems', 'from'],
    getReportLook: ['emblems', 'from'],
    setLayerChoices: ['layer', 'choices', 'from'],
    getLayerChoices: ['layer', 'choices', 'from'],
    setWeather: ['colour', 'wind', 'clouds', 'from'],
    getWeather: ['colour', 'wind', 'clouds', 'from'],
    setScale: ['scale', 'from'],
    getScale: ['scale', 'from'],
    setSky: ['lat', 'lng', 'az', 'alt', 'fov'],
    getSky: ['lat', 'lng', 'az', 'alt', 'fov'],
    renderBatch: ['ok', 'card', 'reason', 'note', 'notes', 'shot', 'timing'],
    planShot: ['ok', 'shot', 'notes', 'warnings', 'inFrame', 'estimatedComposeMs', 'reason'],
    renderShot: ['ok', 'card', 'shot', 'notes', 'warnings', 'timing', 'reason'],
    layersFor: ['category', 'layers', 'from'],
    composeFor: ['dataUrl', 'width', 'height', 'mimeType', 'provenance', 'sourceRect', 'frame', 'alt', 'warnings', 'regions'],
    whatsNew: ['since', 'until', 'layers'],
  },
} as const;

/**
 * Deterministic rendering of the contract, so a change is visible in a diff
 * rather than hidden behind a hash. Keys sorted at every level: an object
 * literal reordered is not a contract change and must not read as one.
 */
export function stableContractString(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableContractString).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableContractString(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The fingerprint of the contract AS RECORDED. Update it in the same commit
 * that changes the contract, and bump SHARE_HANDLE_VERSION with it.
 *
 * Kept as the literal string rather than a hash so that when it fails, the
 * reviewer reads what actually changed instead of two unequal hex digests.
 */
export const SHARE_HANDLE_FINGERPRINT =
  '{"areaAliases":{"eu":"union:eu"},"areas":[{"code":"continent:africa","kind":"continent","name":"Afri'
  + 'ca"},{"code":"continent:antarctica","kind":"continent","name":"Antarctica"},{"code":"continent:asia"'
  + ',"kind":"continent","name":"Asia"},{"code":"continent:europe","kind":"continent","name":"Europe"},{"'
  + 'code":"continent:north-america","kind":"continent","name":"North America"},{"code":"continent:oceani'
  + 'a","kind":"continent","name":"Oceania"},{"code":"continent:south-america","kind":"continent","name":'
  + '"South America"},{"code":"union:eu","kind":"union","name":"European Union"},{"code":"union:au","kind'
  + '":"union","name":"African Union"},{"code":"union:asean","kind":"union","name":"Association of Southe'
  + 'ast Asian Nations"},{"code":"union:arab-league","kind":"union","name":"League of Arab States"},{"cod'
  + 'e":"union:gcc","kind":"union","name":"Gulf Cooperation Council"},{"code":"union:mercosur","kind":"un'
  + 'ion","name":"Mercosur"},{"code":"sphere:anglosphere","kind":"sphere","name":"Anglosphere"},{"code":"'
  + 'sphere:francophonie","kind":"sphere","name":"Francophonie"},{"code":"sphere:hispanosphere","kind":"s'
  + 'phere","name":"Hispanosphere"},{"code":"sphere:lusosphere","kind":"sphere","name":"Lusosphere"},{"co'
  + 'de":"sphere:sinosphere","kind":"sphere","name":"Sinosphere"},{"code":"sphere:russophone","kind":"sph'
  + 'ere","name":"Russophone world"},{"code":"sphere:arabophone","kind":"sphere","name":"Arabophone world'
  + '"},{"code":"sphere:turkic","kind":"sphere","name":"Turkic world"},{"code":"sphere:persianate","kind"'
  + ':"sphere","name":"Persianate world"},{"code":"sphere:germanosphere","kind":"sphere","name":"Germanos'
  + 'phere"},{"code":"sphere:malay","kind":"sphere","name":"Malay world"},{"code":"sphere:swahili","kind"'
  + ':"sphere","name":"Swahili sphere"},{"code":"sphere:nordic","kind":"sphere","name":"Nordic world"},{"'
  + 'code":"union:brics","kind":"union","name":"BRICS"},{"code":"union:nato","kind":"union","name":"North'
  + ' Atlantic Treaty Organization"},{"code":"union:sco","kind":"union","name":"Shanghai Cooperation Orga'
  + 'nisation"},{"code":"union:opec","kind":"union","name":"Organization of the Petroleum Exporting Count'
  + 'ries"},{"code":"union:commonwealth","kind":"union","name":"Commonwealth of Nations"},{"code":"union:'
  + 'oas","kind":"union","name":"Organization of American States"},{"code":"union:ecowas","kind":"union",'
  + '"name":"Economic Community of West African States"},{"code":"union:csto","kind":"union","name":"Coll'
  + 'ective Security Treaty Organization"},{"code":"union:pif","kind":"union","name":"Pacific Islands For'
  + 'um"},{"code":"terra:africana","kind":"terra","name":"Terra Africana"},{"code":"zone:atlas","kind":"z'
  + 'one","name":"Atlas Zone"},{"code":"zone:reguibat-taoudeni","kind":"zone","name":"Reguibat and Taoude'
  + 'ni Zone"},{"code":"zone:senegal-basin","kind":"zone","name":"Senegal Basin Zone"},{"code":"zone:leo-'
  + 'man","kind":"zone","name":"Leo–Man Shield and the Guinea Coast Zone"},{"code":"zone:saharan-basins",'
  + '"kind":"zone","name":"Ghadames, Illizi and Murzuq Zone"},{"code":"zone:tuareg-shield","kind":"zone",'
  + '"name":"Tuareg Shield and Iullemmeden Zone"},{"code":"zone:sirte-ionian","kind":"zone","name":"Sirte'
  + ' and the Ionian–Levantine Sea Zone"},{"code":"zone:libyan-desert-nile","kind":"zone","name":"Libyan '
  + 'Desert and the Nile Delta Zone"},{"code":"zone:nubian-shield","kind":"zone","name":"Nubian Shield Zo'
  + 'ne"},{"code":"zone:red-sea-aden-africa","kind":"zone","name":"Red Sea and Gulf of Aden, African Marg'
  + 'in Zone"},{"code":"zone:central-african-rifts","kind":"zone","name":"Chad, Darfur and the Sudanese R'
  + 'ifts Zone"},{"code":"zone:niger-benue","kind":"zone","name":"Niger Delta and the Benue Trough Zone"}'
  + ',{"code":"zone:congo-basin","kind":"zone","name":"Congo Basin Zone"},{"code":"zone:west-congo-angola'
  + '","kind":"zone","name":"West Congo Belt and the Angolan Margin Zone"},{"code":"zone:horn-of-africa",'
  + '"kind":"zone","name":"Horn of Africa Zone"},{"code":"zone:east-african-rift","kind":"zone","name":"E'
  + 'ast African Rift Zone"},{"code":"zone:swahili-coast","kind":"zone","name":"Tanzania and Mozambique C'
  + 'oastal Basins Zone"},{"code":"zone:kalahari-damara","kind":"zone","name":"Kalahari and the Damara Be'
  + 'lt Zone"},{"code":"zone:kaapvaal-karoo-cape","kind":"zone","name":"Kaapvaal, Karoo and the Cape Zone'
  + '"},{"code":"zone:madagascar-seychelles","kind":"zone","name":"Madagascar and the Seychelles Zone"},{'
  + '"code":"terra:arabica","kind":"terra","name":"Terra Arabica"},{"code":"zone:levant","kind":"zone","n'
  + 'ame":"Levant Zone"},{"code":"zone:arabian-shield","kind":"zone","name":"Arabian Shield Zone"},{"code'
  + '":"zone:red-sea-aden-arabia","kind":"zone","name":"Red Sea, Arabian Margin Zone"},{"code":"zone:yeme'
  + 'n-aden","kind":"zone","name":"Yemen Highlands and the Gulf of Aden Zone"},{"code":"zone:rub-al-khali'
  + '","kind":"zone","name":"Rub\' al Khali Zone"},{"code":"zone:oman","kind":"zone","name":"Oman Mountain'
  + 's and Salt Basins Zone"},{"code":"zone:central-arabian-arch","kind":"zone","name":"Central Arabian A'
  + 'rch Zone"},{"code":"zone:mesopotamia-gulf","kind":"zone","name":"Mesopotamia and the Persian Gulf Zo'
  + 'ne"},{"code":"zone:widyan-arches","kind":"zone","name":"Widyan and the Northern Arches Zone"},{"code'
  + '":"terra:europaea","kind":"terra","name":"Terra Europaea"},{"code":"zone:fennoscandian-shield","kind'
  + '":"zone","name":"Fennoscandian Shield and the Caledonides Zone"},{"code":"zone:barents-shelf","kind"'
  + ':"zone","name":"Barents Shelf Zone"},{"code":"zone:urals-novaya-zemlya","kind":"zone","name":"Urals '
  + 'and Novaya Zemlya Zone"},{"code":"zone:timan-pechora","kind":"zone","name":"Timan–Pechora Zone"},{"c'
  + 'ode":"zone:volga-ural","kind":"zone","name":"Volga–Ural Zone"},{"code":"zone:moscow-voronezh","kind"'
  + ':"zone","name":"Moscow Basin and the Voronezh High Zone"},{"code":"zone:ukrainian-shield","kind":"zo'
  + 'ne","name":"Ukrainian Shield and the Dnieper–Donets Zone"},{"code":"zone:pontic-caspian-steppe","kin'
  + 'd":"zone","name":"Pontic–Caspian Steppe Zone"},{"code":"zone:black-sea-north","kind":"zone","name":"'
  + 'Black Sea, European Margin Zone"},{"code":"zone:north-european-plain","kind":"zone","name":"North Eu'
  + 'ropean Plain and the Baltic Zone"},{"code":"zone:north-sea-british-isles","kind":"zone","name":"Nort'
  + 'h Sea and the British Isles Zone"},{"code":"zone:paris-basin-massifs","kind":"zone","name":"Paris Ba'
  + 'sin and the Hercynian Massifs Zone"},{"code":"zone:alps","kind":"zone","name":"Alps Zone"},{"code":"'
  + 'zone:carpathians-pannonian","kind":"zone","name":"Carpathians and the Pannonian Basin Zone"},{"code"'
  + ':"zone:apennines-tyrrhenian","kind":"zone","name":"Apennines and the Tyrrhenian Sea Zone"},{"code":"'
  + 'zone:balkans","kind":"zone","name":"Balkans Zone"},{"code":"zone:iberia","kind":"zone","name":"Iberi'
  + 'an Massif and the Betics Zone"},{"code":"zone:western-mediterranean","kind":"zone","name":"Western M'
  + 'editerranean Basin Zone"},{"code":"terra:tethyana","kind":"terra","name":"Terra Tethyana"},{"code":"'
  + 'zone:anatolian-plateau","kind":"zone","name":"Anatolian Plateau and the Taurus Zone"},{"code":"zone:'
  + 'pontides","kind":"zone","name":"Pontic Mountains Zone"},{"code":"zone:western-anatolia","kind":"zone'
  + '","name":"Western Anatolia and the Menderes Massif Zone"},{"code":"zone:lesser-caucasus","kind":"zon'
  + 'e","name":"Lesser Caucasus and the Armenian Highlands Zone"},{"code":"zone:caucasus","kind":"zone","'
  + 'name":"Caucasus Zone"},{"code":"zone:caspian-sea","kind":"zone","name":"Caspian Sea Zone"},{"code":"'
  + 'zone:black-sea-south","kind":"zone","name":"Black Sea, Anatolian Margin Zone"},{"code":"zone:zagros"'
  + ',"kind":"zone","name":"Zagros Zone"},{"code":"zone:iranian-plateau","kind":"zone","name":"Iranian Pl'
  + 'ateau Zone"},{"code":"zone:alborz-kopet-dag","kind":"zone","name":"Alborz and Kopet Dag Zone"},{"cod'
  + 'e":"zone:makran-baluchistan","kind":"zone","name":"Makran and Baluchistan Zone"},{"code":"zone:hindu'
  + '-kush","kind":"zone","name":"Hindu Kush and the Afghan Blocks Zone"},{"code":"zone:pamirs","kind":"z'
  + 'one","name":"Pamirs Zone"},{"code":"zone:tian-shan","kind":"zone","name":"Tian Shan Zone"},{"code":"'
  + 'zone:karakum-amu-darya","kind":"zone","name":"Karakum and the Amu Darya Zone"},{"code":"zone:aral-sy'
  + 'r-darya","kind":"zone","name":"Aral Sea, the Syr Darya and the Ustyurt Zone"},{"code":"terra:boreali'
  + 's","kind":"terra","name":"Terra Borealis"},{"code":"zone:west-siberian-basin","kind":"zone","name":"'
  + 'West Siberian Basin Zone"},{"code":"zone:taimyr-kara","kind":"zone","name":"Taimyr and the Kara Sea '
  + 'Zone"},{"code":"zone:tunguska","kind":"zone","name":"Tunguska Basin and the Yenisey Ridge Zone"},{"c'
  + 'ode":"zone:angara-lena","kind":"zone","name":"Angara–Lena Platform Zone"},{"code":"zone:anabar","kin'
  + 'd":"zone","name":"Anabar Shield Zone"},{"code":"zone:lena-vilyuy","kind":"zone","name":"Lena–Vilyuy '
  + 'Basin Zone"},{"code":"zone:aldan-stanovoy","kind":"zone","name":"Aldan Shield and the Stanovoy Zone"'
  + '},{"code":"zone:baikal-patom","kind":"zone","name":"Baikal–Patom Highlands Zone"},{"code":"zone:alta'
  + 'i-sayan","kind":"zone","name":"Altai, Sayan and Kuznetsk Zone"},{"code":"zone:kazakh-uplands","kind"'
  + ':"zone","name":"Kazakh Uplands and the Turgay Zone"},{"code":"zone:verkhoyansk-chukotka","kind":"zon'
  + 'e","name":"Verkhoyansk and Chukotka Zone"},{"code":"zone:laptev-east-siberian","kind":"zone","name":'
  + '"Laptev and East Siberian Shelves Zone"},{"code":"zone:kamchatka-koryak","kind":"zone","name":"Kamch'
  + 'atka and the Koryak Highlands Zone"},{"code":"zone:okhotsk-north","kind":"zone","name":"Sea of Okhot'
  + 'sk, Northern Margin Zone"},{"code":"terra:sinica","kind":"terra","name":"Terra Sinica"},{"code":"zon'
  + 'e:tarim","kind":"zone","name":"Tarim Basin Zone"},{"code":"zone:dzungaria","kind":"zone","name":"Dzu'
  + 'ngaria Zone"},{"code":"zone:qiangtang","kind":"zone","name":"Qiangtang and the Changtang Zone"},{"co'
  + 'de":"zone:lhasa-block","kind":"zone","name":"Lhasa Block and the Tsangpo Zone"},{"code":"zone:kunlun'
  + '-qaidam","kind":"zone","name":"Kunlun and the Qaidam Zone"},{"code":"zone:qilian-alxa","kind":"zone"'
  + ',"name":"Qilian Shan and the Alxa Zone"},{"code":"zone:songpan-ganzi","kind":"zone","name":"Songpan–'
  + 'Ganzi and the Longmen Shan Zone"},{"code":"zone:sichuan","kind":"zone","name":"Sichuan Basin Zone"},'
  + '{"code":"zone:ordos-loess","kind":"zone","name":"Ordos and the Loess Plateau Zone"},{"code":"zone:no'
  + 'rth-china-plain","kind":"zone","name":"North China Plain and the Yellow Sea Zone"},{"code":"zone:qin'
  + 'ling-dabie","kind":"zone","name":"Qinling–Dabie Zone"},{"code":"zone:yangtze","kind":"zone","name":"'
  + 'Yangtze Platform Zone"},{"code":"zone:south-china","kind":"zone","name":"South China and the Pearl R'
  + 'iver Zone"},{"code":"zone:east-china-sea-taiwan","kind":"zone","name":"East China Sea, Taiwan and th'
  + 'e Ryukyus Zone"},{"code":"zone:korean-peninsula","kind":"zone","name":"Korean Peninsula Zone"},{"cod'
  + 'e":"zone:japan","kind":"zone","name":"Japan Arc and the Sea of Japan Zone"},{"code":"zone:manchuria"'
  + ',"kind":"zone","name":"Manchuria and the Greater Khingan Zone"},{"code":"zone:mongolian-plateau","ki'
  + 'nd":"zone","name":"Mongolian Plateau Zone"},{"code":"zone:amur-sikhote-alin","kind":"zone","name":"A'
  + 'mur and the Sikhote-Alin Zone"},{"code":"zone:sakhalin-okhotsk","kind":"zone","name":"Sakhalin, the '
  + 'Kurils and the Sea of Okhotsk Zone"},{"code":"terra:indica","kind":"terra","name":"Terra Indica"},{"'
  + 'code":"zone:himalaya","kind":"zone","name":"Himalaya Zone"},{"code":"zone:ganges-plain","kind":"zone'
  + '","name":"Ganges Plain Zone"},{"code":"zone:indus","kind":"zone","name":"Indus Basin Zone"},{"code":'
  + '"zone:sulaiman-kirthar","kind":"zone","name":"Sulaiman and Kirthar Ranges Zone"},{"code":"zone:camba'
  + 'y-bombay","kind":"zone","name":"Cambay Rift and Bombay High Zone"},{"code":"zone:konkan","kind":"zon'
  + 'e","name":"Konkan and the Western Margin Zone"},{"code":"zone:indian-shield","kind":"zone","name":"D'
  + 'eccan, the Indian Shield and the Gondwana Rifts Zone"},{"code":"zone:east-coast-basins","kind":"zone'
  + '","name":"East Coast Basins Zone"},{"code":"zone:bengal-assam","kind":"zone","name":"Bengal Basin an'
  + 'd Assam Zone"},{"code":"zone:sri-lanka","kind":"zone","name":"Sri Lanka Zone"},{"code":"terra:sundai'
  + 'ca","kind":"terra","name":"Terra Sundaica"},{"code":"zone:indo-burman-irrawaddy","kind":"zone","name'
  + '":"Indo-Burman Ranges and the Irrawaddy Zone"},{"code":"zone:shan-tenasserim","kind":"zone","name":"'
  + 'Shan Plateau and the Tenasserim Zone"},{"code":"zone:annamite-khorat","kind":"zone","name":"Annamite'
  + ' Range and the Khorat Plateau Zone"},{"code":"zone:mekong-gulf-thailand","kind":"zone","name":"Mekon'
  + 'g Delta and the Gulf of Thailand Zone"},{"code":"zone:malay-peninsula","kind":"zone","name":"Malay P'
  + 'eninsula and the Thai Basins Zone"},{"code":"zone:sunda-arc","kind":"zone","name":"Sunda Arc: Sumatr'
  + 'a, Java and the Lesser Sundas Zone"},{"code":"zone:sunda-shelf","kind":"zone","name":"Sunda Shelf an'
  + 'd the Java Sea Zone"},{"code":"zone:borneo","kind":"zone","name":"Borneo Zone"},{"code":"zone:south-'
  + 'china-sea","kind":"zone","name":"South China Sea Zone"},{"code":"zone:philippines","kind":"zone","na'
  + 'me":"Philippine Mobile Belt and the Sulu Sea Zone"},{"code":"zone:wallacea","kind":"zone","name":"Wa'
  + 'llacea Zone"},{"code":"terra:sahulica","kind":"terra","name":"Terra Sahulica"},{"code":"zone:yilgarn'
  + '-pilbara","kind":"zone","name":"Yilgarn and Pilbara Cratons Zone"},{"code":"zone:western-margin","ki'
  + 'nd":"zone","name":"Western Margin and the North West Shelf Zone"},{"code":"zone:kimberley-canning","'
  + 'kind":"zone","name":"Kimberley and the Canning Basin Zone"},{"code":"zone:north-australian-craton","'
  + 'kind":"zone","name":"North Australian Craton Zone"},{"code":"zone:central-australia","kind":"zone","'
  + 'name":"Central Australian Basins and Ranges Zone"},{"code":"zone:gawler-eucla","kind":"zone","name":'
  + '"Gawler Craton and the Eucla Zone"},{"code":"zone:great-artesian","kind":"zone","name":"Great Artesi'
  + 'an Basin Zone"},{"code":"zone:murray-darling","kind":"zone","name":"Murray–Darling and the Flinders '
  + 'Ranges Zone"},{"code":"zone:tasmanides","kind":"zone","name":"Great Dividing Range and the Tasmanide'
  + 's Zone"},{"code":"zone:tasmania-bass","kind":"zone","name":"Tasmania and Bass Strait Zone"},{"code":'
  + '"zone:coral-sea","kind":"zone","name":"Coral Sea Plateaus and the Great Barrier Reef Zone"},{"code":'
  + '"zone:new-guinea-highlands","kind":"zone","name":"New Guinea Highlands and the Mobile Belt Zone"},{"'
  + 'code":"zone:arafura-papua","kind":"zone","name":"Arafura Shelf, Papua and the Bird\'s Head Zone"},{"c'
  + 'ode":"zone:new-zealand","kind":"zone","name":"New Zealand Zone"},{"code":"zone:new-caledonia","kind"'
  + ':"zone","name":"New Caledonia and the Norfolk Ridge Zone"},{"code":"terra:laurentia","kind":"terra",'
  + '"name":"Terra Laurentia"},{"code":"zone:canadian-shield","kind":"zone","name":"Canadian Shield Zone"'
  + '},{"code":"zone:hudson-bay","kind":"zone","name":"Hudson Bay Zone"},{"code":"zone:arctic-archipelago'
  + '","kind":"zone","name":"Arctic Archipelago and Baffin Bay Zone"},{"code":"zone:greenland-shield","ki'
  + 'nd":"zone","name":"Greenland Shield Zone"},{"code":"zone:east-greenland","kind":"zone","name":"East '
  + 'Greenland Caledonides Zone"},{"code":"zone:mackenzie","kind":"zone","name":"Mackenzie Basin and Moun'
  + 'tains Zone"},{"code":"zone:interior-plains","kind":"zone","name":"Interior Plains: Alberta and Willi'
  + 'ston Zone"},{"code":"zone:cordillera","kind":"zone","name":"Canadian Cordillera Zone"},{"code":"zone'
  + ':alaska-bering","kind":"zone","name":"Alaska and the Bering Shelf Zone"},{"code":"zone:pacific-coast'
  + '","kind":"zone","name":"Pacific Coast Ranges and the Central Valley Zone"},{"code":"zone:basin-and-r'
  + 'ange","kind":"zone","name":"Basin and Range and the Gulf of California Zone"},{"code":"zone:rockies-'
  + 'colorado-plateau","kind":"zone","name":"Rocky Mountains and the Colorado Plateau Zone"},{"code":"zon'
  + 'e:great-plains","kind":"zone","name":"Great Plains and the Midcontinent Zone"},{"code":"zone:gulf-of'
  + '-mexico","kind":"zone","name":"Gulf of Mexico Basin and Yucatán Zone"},{"code":"zone:great-lakes","k'
  + 'ind":"zone","name":"Great Lakes and the Interior Lowlands Zone"},{"code":"zone:appalachians","kind":'
  + '"zone","name":"Appalachians Zone"},{"code":"zone:atlantic-margin","kind":"zone","name":"Atlantic Mar'
  + 'gin and the Grand Banks Zone"},{"code":"zone:sierras-madres","kind":"zone","name":"Sierras Madres an'
  + 'd the Mexican Plateau Zone"},{"code":"zone:central-america","kind":"zone","name":"Central American I'
  + 'sthmus Zone"},{"code":"zone:caribbean","kind":"zone","name":"Caribbean Sea and the Antilles Zone"},{'
  + '"code":"terra:amazonia","kind":"terra","name":"Terra Amazonia"},{"code":"zone:guiana-shield","kind":'
  + '"zone","name":"Guiana Shield Zone"},{"code":"zone:brazilian-shield","kind":"zone","name":"Brazilian '
  + 'Shield Zone"},{"code":"zone:amazon-basin","kind":"zone","name":"Amazon Basin Zone"},{"code":"zone:eq'
  + 'uatorial-margin","kind":"zone","name":"Amazon Fan and the Equatorial Margin Zone"},{"code":"zone:par'
  + 'naiba-sao-francisco","kind":"zone","name":"Parnaíba and São Francisco Basins Zone"},{"code":"zone:ea'
  + 'st-brazilian-margin","kind":"zone","name":"East Brazilian Margin Zone"},{"code":"zone:parana","kind"'
  + ':"zone","name":"Paraná Basin and the Pelotas Margin Zone"},{"code":"zone:chaco-pampas","kind":"zone"'
  + ',"name":"Chaco and the Pampas Zone"},{"code":"zone:sub-andean-foreland","kind":"zone","name":"Sub-An'
  + 'dean Foreland Basins Zone"},{"code":"zone:northern-andes","kind":"zone","name":"Northern Andes and t'
  + 'he Caribbean Coast Zone"},{"code":"zone:llanos-orinoco","kind":"zone","name":"Llanos and the Orinoco'
  + ' Zone"},{"code":"zone:andes","kind":"zone","name":"Central and Southern Andes Zone"},{"code":"zone:p'
  + 'acific-forearc","kind":"zone","name":"Pacific Forearc Basins Zone"},{"code":"zone:patagonia","kind":'
  + '"zone","name":"Patagonia Zone"},{"code":"zone:falkland-plateau","kind":"zone","name":"Falkland Plate'
  + 'au and the North Scotia Ridge Zone"},{"code":"terra:antarctica","kind":"terra","name":"Terra Antarct'
  + 'ica"},{"code":"zone:antarctic-peninsula","kind":"zone","name":"Antarctic Peninsula and the South She'
  + 'tlands Zone"},{"code":"zone:weddell","kind":"zone","name":"Weddell Sea and the Filchner–Ronne Zone"}'
  + ',{"code":"zone:queen-maud-land","kind":"zone","name":"Queen Maud Land Zone"},{"code":"zone:amundsen-'
  + 'bellingshausen-shelf","kind":"zone","name":"Amundsen and Bellingshausen Shelf Zone"},{"code":"zone:p'
  + 'olar-plateau","kind":"zone","name":"Polar Plateau Zone"},{"code":"zone:marie-byrd-land","kind":"zone'
  + '","name":"Marie Byrd Land Zone"},{"code":"zone:transantarctic-mountains","kind":"zone","name":"Trans'
  + 'antarctic Mountains Zone"},{"code":"zone:wilkes-land","kind":"zone","name":"Wilkes Land and the East'
  + ' Antarctic Shield Zone"},{"code":"zone:ross","kind":"zone","name":"Ross Sea and the Ross Ice Shelf Z'
  + 'one"},{"code":"mare:pacificum","kind":"mare","name":"Mare Pacificum"},{"code":"zone:northwest-pacifi'
  + 'c-basin","kind":"zone","name":"Northwest Pacific Basin Zone"},{"code":"zone:hawaiian-emperor","kind"'
  + ':"zone","name":"Hawaiian–Emperor Chain Zone"},{"code":"zone:northeast-pacific-basin","kind":"zone","'
  + 'name":"Northeast Pacific Basin Zone"},{"code":"zone:juan-de-fuca","kind":"zone","name":"Juan de Fuca'
  + ' Zone"},{"code":"zone:clarion-clipperton","kind":"zone","name":"Clarion–Clipperton Zone"},{"code":"z'
  + 'one:east-pacific-rise","kind":"zone","name":"East Pacific Rise Zone"},{"code":"zone:galapagos","kind'
  + '":"zone","name":"Galápagos Zone"},{"code":"zone:peru-basin","kind":"zone","name":"Peru Basin Zone"},'
  + '{"code":"zone:rapa-nui-nazca","kind":"zone","name":"Rapa Nui–Nazca Ridge Zone"},{"code":"zone:chile-'
  + 'rise","kind":"zone","name":"Chile Rise Zone"},{"code":"zone:polynesian-superswell","kind":"zone","na'
  + 'me":"Polynesian Superswell Zone"},{"code":"zone:mid-pacific-seamounts","kind":"zone","name":"Mid-Pac'
  + 'ific Seamount Zone"},{"code":"zone:ontong-java","kind":"zone","name":"Ontong Java Plateau Zone"},{"c'
  + 'ode":"zone:caroline","kind":"zone","name":"Caroline Zone"},{"code":"zone:philippine-sea","kind":"zon'
  + 'e","name":"Philippine Sea Zone"},{"code":"zone:izu-bonin-mariana","kind":"zone","name":"Izu–Bonin–Ma'
  + 'riana Arc Zone"},{"code":"zone:melanesian-arcs","kind":"zone","name":"Melanesian Arcs Zone"},{"code"'
  + ':"zone:tonga-kermadec","kind":"zone","name":"Tonga–Kermadec Arc Zone"},{"code":"zone:southwest-pacif'
  + 'ic-basin","kind":"zone","name":"Southwest Pacific Basin Zone"},{"code":"zone:macquarie-ridge","kind"'
  + ':"zone","name":"Macquarie Ridge Zone"},{"code":"zone:zealandia-north","kind":"zone","name":"North Ze'
  + 'alandia Zone"},{"code":"zone:zealandia-south","kind":"zone","name":"South Zealandia Zone"},{"code":"'
  + 'zone:tasman-basin","kind":"zone","name":"Tasman Basin Zone"},{"code":"mare:atlanticum","kind":"mare"'
  + ',"name":"Mare Atlanticum"},{"code":"zone:nordic-seas","kind":"zone","name":"Nordic Seas Zone"},{"cod'
  + 'e":"zone:iceland-plume","kind":"zone","name":"Iceland Plume Zone"},{"code":"zone:labrador-sea","kind'
  + '":"zone","name":"Labrador Sea Zone"},{"code":"zone:north-american-basin","kind":"zone","name":"North'
  + ' American Basin Zone"},{"code":"zone:north-mid-atlantic-ridge","kind":"zone","name":"North Mid-Atlan'
  + 'tic Ridge Zone"},{"code":"zone:azores-gibraltar","kind":"zone","name":"Azores–Gibraltar Zone"},{"cod'
  + 'e":"zone:west-european-basin","kind":"zone","name":"West European Basin Zone"},{"code":"zone:canary-'
  + 'basin","kind":"zone","name":"Canary Basin Zone"},{"code":"zone:cape-verde","kind":"zone","name":"Cap'
  + 'e Verde Zone"},{"code":"zone:equatorial-atlantic","kind":"zone","name":"Equatorial Atlantic Zone"},{'
  + '"code":"zone:south-mid-atlantic-ridge","kind":"zone","name":"South Mid-Atlantic Ridge Zone"},{"code"'
  + ':"zone:walvis-ridge","kind":"zone","name":"Walvis Ridge Zone"},{"code":"zone:brazil-basin","kind":"z'
  + 'one","name":"Brazil Basin Zone"},{"code":"zone:argentine-basin","kind":"zone","name":"Argentine Basi'
  + 'n Zone"},{"code":"zone:angola-basin","kind":"zone","name":"Angola Basin Zone"},{"code":"zone:cape-ba'
  + 'sin","kind":"zone","name":"Cape Basin Zone"},{"code":"mare:indicum","kind":"mare","name":"Mare Indic'
  + 'um"},{"code":"zone:carlsberg-central-indian-ridge","kind":"zone","name":"Carlsberg and Central India'
  + 'n Ridge Zone"},{"code":"zone:southwest-indian-ridge","kind":"zone","name":"Southwest Indian Ridge Zo'
  + 'ne"},{"code":"zone:southeast-indian-ridge","kind":"zone","name":"Southeast Indian Ridge Zone"},{"cod'
  + 'e":"zone:arabian-sea","kind":"zone","name":"Arabian Sea Zone"},{"code":"zone:somali-basin","kind":"z'
  + 'one","name":"Somali Basin Zone"},{"code":"zone:mascarene-plateau","kind":"zone","name":"Mascarene Pl'
  + 'ateau Zone"},{"code":"zone:chagos-laccadive","kind":"zone","name":"Chagos–Laccadive Ridge Zone"},{"c'
  + 'ode":"zone:central-indian-basin","kind":"zone","name":"Central Indian Basin Zone"},{"code":"zone:ben'
  + 'gal-fan","kind":"zone","name":"Bengal Fan Zone"},{"code":"zone:ninetyeast-ridge","kind":"zone","name'
  + '":"Ninetyeast Ridge Zone"},{"code":"zone:wharton-basin","kind":"zone","name":"Wharton Basin Zone"},{'
  + '"code":"zone:perth-basin","kind":"zone","name":"Perth Basin Zone"},{"code":"zone:south-australian-ba'
  + 'sin","kind":"zone","name":"South Australian Basin Zone"},{"code":"zone:mozambique-basin","kind":"zon'
  + 'e","name":"Mozambique Basin Zone"},{"code":"zone:agulhas","kind":"zone","name":"Agulhas Zone"},{"cod'
  + 'e":"zone:crozet","kind":"zone","name":"Crozet Zone"},{"code":"zone:kerguelen-plateau","kind":"zone",'
  + '"name":"Kerguelen Plateau Zone"},{"code":"mare:arcticum","kind":"mare","name":"Mare Arcticum"},{"cod'
  + 'e":"zone:fram-strait","kind":"zone","name":"Fram Strait Zone"},{"code":"zone:nansen-basin","kind":"z'
  + 'one","name":"Nansen Basin Zone"},{"code":"zone:gakkel-ridge","kind":"zone","name":"Gakkel Ridge Zone'
  + '"},{"code":"zone:amundsen-basin","kind":"zone","name":"Amundsen Basin Zone"},{"code":"zone:lomonosov'
  + '-ridge","kind":"zone","name":"Lomonosov Ridge Zone"},{"code":"zone:makarov-basin","kind":"zone","nam'
  + 'e":"Makarov Basin Zone"},{"code":"zone:alpha-mendeleev-ridge","kind":"zone","name":"Alpha–Mendeleev '
  + 'Ridge Zone"},{"code":"zone:canada-basin","kind":"zone","name":"Canada Basin Zone"},{"code":"mare:aus'
  + 'trale","kind":"mare","name":"Mare Australe"},{"code":"zone:drake-passage","kind":"zone","name":"Drak'
  + 'e Passage Zone"},{"code":"zone:weddell-gyre","kind":"zone","name":"Weddell Gyre Zone"},{"code":"zone'
  + ':bouvet","kind":"zone","name":"Bouvet Triple Junction Zone"},{"code":"zone:enderby-basin","kind":"zo'
  + 'ne","name":"Enderby Basin Zone"},{"code":"zone:southern-kerguelen-plateau","kind":"zone","name":"Sou'
  + 'thern Kerguelen Plateau Zone"},{"code":"zone:australian-antarctic-basin","kind":"zone","name":"Austr'
  + 'alian–Antarctic Basin Zone"},{"code":"zone:ross-gyre","kind":"zone","name":"Ross Gyre Zone"},{"code"'
  + ':"zone:pacific-antarctic-ridge","kind":"zone","name":"Pacific–Antarctic Ridge Zone"},{"code":"zone:a'
  + 'mundsen-bellingshausen","kind":"zone","name":"Amundsen–Bellingshausen Zone"},{"code":"zone:scotia-ar'
  + 'c","kind":"zone","name":"Scotia Arc Zone"},{"code":"zone:bahia-coast-reconcavo","kind":"zone","name"'
  + ':"Bahia Coast and Recôncavo Zone"},{"code":"zone:central-american-dry-corridor","kind":"zone","name"'
  + ':"Central American Dry Corridor Zone"},{"code":"zone:golden-triangle","kind":"zone","name":"Golden T'
  + 'riangle Zone"},{"code":"zone:ring-of-fire","kind":"zone","name":"Pacific Ring of Fire Zone"},{"code"'
  + ':"zone:sahel","kind":"zone","name":"Sahel Zone"}],"batchRequest":["address","area","theatre","brief"'
  + ',"theatres","tonight","week","declassified","psiEvent","at","psiBriefing","preset","layers","window"'
  + ',"template"],"compareAhead":[6,12,24,72,168],"compareEarlier":["1w","1mo","1y","10y"],"compareMoment'
  + 'Layers":["EcologicalDisasters","EarthWeather"],"endCards":["read","poster"],"fileRecord":{"format":"'
  + 'XMP","jpeg":"APP1","namespace":"https://starcom.app/ns/capture/1.0/","png":"iTXt XML:com.adobe.xmp",'
  + '"webp":"XMP "},"fits":["view","planet"],"framing":{"altitudeCeiling":4,"altitudeFloor":1},"layerChoi'
  + 'ces":{"CivilUnrest":["unrest:events","unrest:surges","unrest:tint"],"ConflictZones":["conflict:view"'
  + ',"conflict:mark"],"EcologicalDisasters":["eco:mark","eco:depth","eco:colour","eco:plates","eco:volca'
  + 'noes","eco:magnitudes","eco:depths"],"PsiLines":["psi:bands","psi:parans"],"WarConflict":["war:items'
  + '","war:arcs","war:deaths","war:map"]},"layers":["IntelReports","CyberThreats","Satellites","CommHubs'
  + '","RLSH","DiplomaticEvents","ResourceZones","ConflictZones","SpaceWeather","EcologicalDisasters","Ea'
  + 'rthWeather","DrugCheckAlerts","SceneIncidents","SceneEvents","HeatRisk","RaverMissions","HarmReducti'
  + 'onSites","WarConflict","Lifeboats","Relief","FieldMissions","AiIncidents","AiFrontier","AiWar","AiSa'
  + 'fety","OpenMissions","CampaignsOperations","SafetyWindows","CivilUnrest","ProtestSurges","PsiLines",'
  + '"PsiField","PsiZones","PsiRifts","PsiWindows","MagneticShield","PsiModel"],"markerStyles":["disc","g'
  + 'low","ring"],"methods":{"captureFrame":{"args":1,"options":["scale","width","height","mimeType","qua'
  + 'lity","stillAt"]},"compose":{"args":1,"options":["scale","preset","fit"]},"composeFor":{"args":2,"op'
  + 'tions":["template","preset","scale","timeoutMs"]},"describeView":{"args":1,"options":["preset","fit"'
  + ']},"focusReport":{"args":1,"options":[]},"frameArea":{"args":2,"options":["preset","transitionMs","s'
  + 'ettleMs"]},"frameReports":{"args":2,"options":["preset","transitionMs","settleMs"]},"getCompare":{"a'
  + 'rgs":0,"options":[]},"getLayerChoices":{"args":1,"options":[]},"getReportCap":{"args":0,"options":[]'
  + '},"getReportLook":{"args":0,"options":[]},"getScale":{"args":0,"options":[]},"getSky":{"args":0,"opt'
  + 'ions":[]},"getTimeWindow":{"args":0,"options":[]},"getView":{"args":0,"options":[]},"getWeather":{"a'
  + 'rgs":0,"options":[]},"layersFor":{"args":1,"options":[]},"listAreas":{"args":0,"options":[]},"listGr'
  + 'oups":{"args":0,"options":[]},"listLayers":{"args":0,"options":[]},"listReports":{"args":1,"options"'
  + ':["counts","area"]},"pinLayers":{"args":1,"options":[]},"planReportTour":{"args":2,"options":["prese'
  + 't","maxStops","holdMs","travelMs"]},"planShot":{"args":2,"options":["timeoutMs"]},"recordClip":{"arg'
  + 's":1,"options":["keyframes","fps","quality","settleMs","endCard","replay","sweep","countryNames","ma'
  + 'rkStyle"]},"recordStory":{"args":1,"options":["story","fps","quality","settleMs","endCard"]},"record'
  + 'Tour":{"args":1,"options":["playlist","fps","quality","settleMs","endCard","timeoutMs","markStyle"]}'
  + ',"renderBatch":{"args":2,"options":["timeoutMs"]},"renderShot":{"args":2,"options":["timeoutMs"]},"s'
  + 'etCompare":{"args":1,"options":["left","right","layer","earlier","window","ahead"]},"setLayer":{"arg'
  + 's":2,"options":["pin","clearOtherPins"]},"setLayerChoices":{"args":2,"options":[]},"setMarkerStyle":'
  + '{"args":2,"options":[]},"setReportCap":{"args":1,"options":[]},"setReportLook":{"args":1,"options":['
  + ']},"setScale":{"args":1,"options":[]},"setSky":{"args":1,"options":["az","alt","fov"]},"setTimeWindo'
  + 'w":{"args":1,"options":["from","until"]},"setView":{"args":2,"options":["lat","lng","altitude","tran'
  + 'sitionMs","settleMs"]},"setWeather":{"args":1,"options":["colour","wind","clouds"]},"whatsNew":{"arg'
  + 's":2,"options":["until"]},"whenReady":{"args":1,"options":["timeoutMs","address"]}},"name":"__starco'
  + 'mShareCard","playlists":["war","raves","heat","heroes"],"presetSizes":{"embed":[1280,800],"portrait"'
  + ':[1080,1350],"square":[1080,1080],"story":[1080,1920],"wide":[1200,630]},"presets":["wide","square",'
  + '"portrait","embed","story"],"properties":["version"],"replayBounds":["from","until"],"replayPaces":['
  + '"even","time"],"replayQuakeDecays":[1,4,10],"replaySpans":["named","window","reports"],"reportCap":{'
  + '"default":50,"max":1000,"min":10,"named":["max","unlimited"],"steps":[50,100,250,500]},"reportCatego'
  + 'ries":{"other":{"icon":"tag","meaning":"another category"},"words":[{"icon":"swords","meaning":"conf'
  + 'lict and war","word":"conflict"},{"icon":"hand-heart","meaning":"charities","word":"charity"},{"icon'
  + '":"heart-pulse","meaning":"health and outbreaks","word":"health"},{"icon":"banknote","meaning":"fund'
  + 'ing and grants","word":"funding"},{"icon":"landmark","meaning":"civic process and public comment","w'
  + 'ord":"civic"},{"icon":"shield-alert","meaning":"cyber security","word":"cyber"},{"icon":"hard-hat","'
  + 'meaning":"safety and recalls","word":"safety"},{"icon":"radar","meaning":"intelligence and convergen'
  + 'ce","word":"intel"},{"icon":"globe","meaning":"world news","word":"world"},{"icon":"scale","meaning"'
  + ':"remedies and redress","word":"remedy"},{"icon":"cloud-lightning","meaning":"natural hazards","word'
  + '":"hazard"},{"icon":"wifi","meaning":"connectivity and shutdowns","word":"digital"},{"icon":"life-bu'
  + 'oy","meaning":"disaster aid","word":"aid"},{"icon":"gavel","meaning":"accountability and exclusions"'
  + ',"word":"accountability"}]},"returns":{"captureFrame":["dataUrl","width","height","mimeType"],"compo'
  + 'se":["dataUrl","width","height","mimeType","provenance","sourceRect","frame","alt","warnings","regio'
  + 'ns"],"composeFor":["dataUrl","width","height","mimeType","provenance","sourceRect","frame","alt","wa'
  + 'rnings","regions"],"describeView":["preset","fit","layers","notCounted"],"focusReport":["featured"],'
  + '"frameArea":["lat","lng","altitude","outside"],"frameReports":["lat","lng","altitude"],"getLayerChoi'
  + 'ces":["layer","choices","from"],"getReportCap":["cap","label","from"],"getReportLook":["emblems","fr'
  + 'om"],"getScale":["scale","from"],"getSky":["lat","lng","az","alt","fov"],"getTimeWindow":["from","un'
  + 'til","live"],"getView":["lat","lng","altitude"],"getWeather":["colour","wind","clouds","from"],"laye'
  + 'rsFor":["category","layers","from"],"listAreas":["code","kind","name","members","source","note"],"li'
  + 'stGroups":["key","kind","size","members","lat","lng","territory"],"listLayers":["id","label","catego'
  + 'ry","implemented","active","primary","pinned"],"listReports":["id","layer","title","variant","varian'
  + 'tMeans","author","time","precisionM","lat","lng","sharesPlaceWith","role","territories","group","cat'
  + 'egory"],"pinLayers":["pinned"],"planReportTour":["keyframes","stops","durationMs","skipped"],"planSh'
  + 'ot":["ok","shot","notes","warnings","inFrame","estimatedComposeMs","reason"],"recordClip":["frames",'
  + '"fps","mimeType","width","height","provenance","stats"],"recordStory":["frames","fps","mimeType","wi'
  + 'dth","height","provenance","stats"],"recordTour":["frames","fps","mimeType","width","height","proven'
  + 'ance","stats"],"renderBatch":["ok","card","reason","note","notes","shot","timing"],"renderShot":["ok'
  + '","card","shot","notes","warnings","timing","reason"],"setLayer":["primary","pinned"],"setLayerChoic'
  + 'es":["layer","choices","from"],"setMarkerStyle":["layer","style"],"setReportCap":["cap","label","fro'
  + 'm"],"setReportLook":["emblems","from"],"setScale":["scale","from"],"setSky":["lat","lng","az","alt",'
  + '"fov"],"setTimeWindow":["from","until","live"],"setView":["lat","lng","altitude"],"setWeather":["col'
  + 'our","wind","clouds","from"],"whatsNew":["since","until","layers"],"whenReady":["ready","waitedMs","'
  + 'reason"]},"shot":{"built":["v","subject.address","subject.view","subject.brief","subject.area","subj'
  + 'ect.theatre","subject.theatres","subject.tonight","subject.week","subject.declassified","subject.psi'
  + 'Event","subject.at","subject.psiBriefing","layers.primary","layers.pins","time.live","time.window","'
  + 'time.at","emphasis.featured","framing.fit","appearance.skin","appearance.light","appearance.nightFil'
  + 'l","appearance.territories","appearance.countryNames","appearance.markStyle","appearance.psiLooks","'
  + 'card.preset","card.template","card.qr","card.inset","card.strip","card.chart","output.type","output.'
  + 'quality","output.scale","output.maxBytes","output.alt"],"notBuilt":["subject.mission","framing.tilt"'
  + ',"framing.padding","framing.offset","layers.opacity","emphasis.others","appearance.clouds","appearan'
  + 'ce.atmosphere","card.timeZone","card.callouts"],"version":1},"solarScales":["compact","true","diagra'
  + 'm","sky"],"stripLanes":["windows","kp","bodies"],"sweep":{"fields":["from","until","step"],"forecast'
  + 'Layers":["EarthWeather","SpaceWeather"],"maxSeconds":86400,"maxSecondsWithoutForecasts":34560000,"mi'
  + 'nStepSeconds":60},"templates":{"built":["critical_intel","actionable_intel","context_report","confli'
  + 'ct_brief","hazard","raver_alert","field_mission","declassified","psi"],"notBuilt":["mission_package"'
  + ']},"territoryStyles":["classic","quiet"],"typeSteps":["larger","compact"],"version":84,"weatherColou'
  + 'rs":["temperature","rain","airQuality","none"]}';

/** Every name the live handle is allowed to expose, and nothing else. */
export function expectedHandleKeys(): string[] {
  return [
    ...SHARE_HANDLE_CONTRACT.properties,
    ...Object.keys(SHARE_HANDLE_CONTRACT.methods),
  ].sort();
}
