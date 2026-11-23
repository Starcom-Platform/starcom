# Watchlists and pings (D-WL)

UX plan phase E, item E3 ([`../04-plan/ux-expansion-plan-2026-11.md`](../04-plan/ux-expansion-plan-2026-11.md)):
"watch a place (a country, Zone or radius) or a kind; new items landing there ping in the app (a toast, a badge, a
list), checked as they arrive; kept in this browser." OR33 (1 Nov): pings stay in the app; a watched place or layer
lights a ping in Starcom (a badge, a mark, a line in the inspector); nothing leaves the device.

## What was there (5 Nov 2026)
One ping, of one kind, anywhere: a new quake of M6 or more (the person may choose M5, M7 or off, kept in this browser;
D-EQ, EQ19/EQ20). Whenever Starcom is open, USGS's M4.5+ day feed is read every five minutes, Eco Disasters drawn or
not (services/quakes/quakePings.ts). A quake first read after the page opened pings: a notice that opens it in the
inspector, a ring pulsing at it until it is opened, a count on Eco Disasters' rail button, the alert sound if sound
is on (useGlobeQuakePings.ts). The palette finds countries, areas and Zones to fly to; none can be watched, and no
other kind pings.

## Decisions
| | |
|---|---|
| **WL1** | **A watch names a place, with the kinds that count there** (the owner, 5 Nov). The place: any area Starcom names (a country, a Zone, a continent, a union), by its code, or a circle around a point (its radius in km). The kinds: all, or those chosen, each with its threshold where it has one (quakes from a magnitude, hazards from an alert level). |
| **WL2** | **A ping shows as the quake ping does** (the owner, 5 Nov): a notice with the kind's glyph and the watch's name that opens the item in the inspector and flies there; a ring at it until it is opened; a count; the alert sound by the person's own setting. One ping per item, however many watches name it (the notice names the first; the inspector line names each). |
| **WL3** | **Checked while the app is open, drawn or not** (the owner, 5 Nov): each kind a watch names is read on its own light schedule, as the quake ping reads USGS's day feed every five minutes; a kind no watch names is not read for watching. |
| **WL4** | Made from the palette ("Watch Japan", "Watch Zone …", "Watch around here") and a place's inspector card (a Watch button); the Watchlist lists each watch with what has landed, and edits or removes it. (Stated to the owner as the default, 5 Nov.) |
| **WL8** | **The Watchlist is a header button** (the owner, 8 Nov): an eye glyph beside chat, with the count of pings not yet opened; it opens a panel under it. Reachable from every app; watches span kinds, so no one layer's rail button owns them. |
| **WL9** | **A circle is made from the palette** (the owner, 8 Nov): "Watch around here" takes the view's centre, named by the nearest place; 300 km until changed to 100 or 1000 km in the Watchlist. |
| **WL10** | **Intel Reports: any placed there** (the owner, 8 Nov): every new report with a point inside the place; for a territory watch, also a report about that territory as a whole (its jurisdiction names it). |
| **WL11** | **War & Conflict: critical and actionable** (the owner, 8 Nov): the desk's lines so marked; its context lines never ping. |
| **WL12** | **Civil Unrest: days of unrest** (the owner, 8 Nov): a new day of protest or shutdown in the place; a surge in reporting never pings. |
| **WL13** | **A new watch counts every kind** (the owner, 8 Nov): quakes from M4.5, hazards from orange, Intel Reports, War & Conflict and Civil Unrest as above; each can be turned off per watch. |
| **WL5** | Kept in this browser until removed (OR33); never in a card, a clip or the share handle; at most 20 watches. |
| **WL6** | New means first read after the watch was made: a feed's first read only learns what is there, as the quake ping's does; an item revised into a watch (a magnitude raised, an alert raised) pings then. For The Record, whose readers send their backlog first: published after the watch was made and the watcher started. |
| **WL7** | The kinds, in order: step 1 the quakes (from M2.5, M4.5, M5, M6 or M7: USGS's 2.5 or 4.5 day feed, whichever the lowest watched threshold needs) and GDACS's alerts (floods, cyclones, volcanoes, wildfires, droughts; from green, orange or red; GDACS's one event list); step 2 what The Record carries: Intel Reports, War & Conflict, Civil Unrest (their readers, burst-batched, restarted on access). |

## Steps
1. The watchlist (features/watch/watchlist.ts: the watches, kept; a place's containment by the areas' shapes or the
   circle), the watcher for the quakes and GDACS (beside quakePings.ts, the M6+ ping unchanged), the pings drawn and
   told as the quake ping's are, the palette's Watch commands, the inspector's Watch button, the Watchlist panel.
2. The Record's kinds: Intel Reports, War & Conflict, Civil Unrest.

## Built
**Step 1, the core (8 Nov 2026, not yet on screen).** features/watch/watchlist.ts: the watches, kept in this browser
(`starcom:watchlist`, at most twenty, a place watched twice is one watch), and whether a point lies in a watch's place
(its circle, or its territory's outline as territoryResolver finds one; nothing where no outline is to hand).
services/watch/watchPings.ts: the watcher, reading only the kinds a watch counts (USGS's M2.5 or M4.5 day feed every
five minutes, GDACS's event list every ten), a feed's first read only learning, an item pinging once in every watch
it lands in; the pings not yet opened and what landed this session. services/gdacs/gdacsList.ts: GDACS's list read
once for Eco Disasters and the watches. services/pings/pingClaims.ts: one ping for one item between the watches and
the M6+ quake ping.

**Step 1, on screen (8 Nov 2026).** The header's Watchlist (components/Watchlist/Watchlist.tsx, WL8): Lucide's
scan-eye (the phone bar's plain eye is Intel's), the count of pings not yet opened, and a panel under it listing each
watch with what it counts (quakes from M2.5 to M7, hazards from any alert to red only), a circle's radius (100, 300 or
1000 km), what has landed in it since the page opened (each opens in the inspector), "Stop watching", and "Watch a
place…", which opens the palette with the verb typed. The palette (features/watch/watchPalette.ts, WL4, WL9) offers
"Watch Japan", any area Starcom draws ("Watch Atlas Zone"; a retired Zone is not offered), and "Watch around here",
300 km around the middle of the view (lent by the globe as an inspector action), named by the territory it lies in,
once the box starts with the verb, the reader's own or the English. A country's card has a Watch button (the territory
index gives its two letters from the card's ADM0_A3). On the globe (useGlobeWatchPings.ts), each ping shows a notice
naming the watch, rings at the item until it is opened, and a quake's flag where Eco Disasters draws none; opened, the
inspector shows Eco Disasters' note with a line naming every watch it landed in. Out of every capture. The words in
the six languages, times included ("vor 3 Min."). Seen end to end on the preview (8 Nov, .local/scripts/watchlist-view.mjs,
USGS's and GDACS's feeds served by the check): "watch japan" put Japan first (the first run had "around here" first,
and Enter watched the sea off Gabon; "around here" is now scored among the places when a place is typed); the watch's
first read learned the feed; five minutes on, a new M5.2 south of Tokyo read "New in Japan", the button "Watchlist: 1
new", the panel listed it, and opening it showed "In your watches: Japan" and cleared the count. The notices' tray
had covered the panel in the same corner; the panel now sits over it.

**Step 2, what The Record carries (8 Nov 2026).** A watch counts three more kinds, each on or off in the Watchlist
and on for a new watch and for one kept from step 1 (WL13): new Intel Reports (WL10), War & Conflict's critical and
actionable lines (WL11), Civil Unrest's days of unrest (WL12). The watcher listens to the Intel ingest as it tells of
new reports, and holds War & Conflict's and Civil Unrest's own shared readers open while a watch counts them, whether
or not their layer is drawn; it lets a reader go when no watch counts its kind. Each reader sends what it had first,
so a note is new when published after both the watch was made and the watcher started (WL6 for The Record). A note
lands by its point, or, for a territory watch, by naming the territory: a day of unrest about Japan as a whole is in
the Japan watch and in no circle. Its notice names its layer ("Civil Unrest: Japan: protest on 8 November 2026, 3 min
ago"); opened, it shows as its layer says it (an Intel Report as it says itself), with the watches it landed in; a
ring only where it has a point.
