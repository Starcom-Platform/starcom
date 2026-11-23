# Earthquakes: beyond Earthquake 3D (D-EQ)

The owner asked on 26 Sep 2026 that the globe's earthquake layer surpass Earthquake 3D (earthquake3d.com; Richard
Wolton's app, since 2003); on 3 Nov they put it next, before the UX plan's phase E. The first round (2 Nov, 0e78b2a0)
gave the Eco Disasters kind marks: pins by default, spikes by magnitude, icons, dots, each quake's depth as a line down
through the crust, and replay on the time bar.

## What Earthquake 3D does (studied 3 Nov)
From the developer's pages (wolton.net/quakemore.html; the App Store listing, v3.97): flags that show magnitude or
depth, DEX depth visualization, a transparent Earth, min/max filters for magnitude, depth and date, many agencies' feeds
(USGS, EMSC, BGS, GeoNet, INGV, NRCAN, GA and more) combined or alone, a 4,000-year historic atlas offline, a sequencer
that replays quakes with speed, decay and sound, tectonic plates, volcanoes, population and night maps, alarms on new
quakes, a news ticker, and detail pages with local maps and seismic information. The site itself could not be read
(its certificate had expired).

The owner's description of its look (3 Nov): "Lines that extend upwards out from epicenters, each having a flag that
shows the Richter scale number, and then also has circles for the area-of-effect range of the earthquake. The
flags/tags that attach to the top of each line stack when there's more than one, and has a limit based on how many
there are. More prominent/powerful earthquakes take priority in the stack of flags/tags on the line at the top, and are
colour coded for clarity." And how Starcom beats it: "our version isn't as pixelated as theirs. We have much better
graphics … So visual effects, and other unique tricks like that, animations, etc, will add to our experience and
effectively beat them."

## Decisions (the owner, 3 Nov)
| | |
|---|---|
| **EQ1** | **USGS by the time bar's window:** the hour, day, week or month feeds (all, M2.5+, M4.5+) by the window shown, up to 30 days, in place of the last day only. |
| **EQ2** | **EMSC as a second source:** merged with USGS, duplicates folded, each quake naming the agency that reported it; EMSC's terms checked before it is read. |
| **EQ3** | **History: USGS M5+ since 1900**, baked once into a file, so the time bar reaches back a century. |
| **EQ4** | **Atlas: NOAA NCEI's Significant Earthquake Database**, 2150 BC to today, with deaths and tsunamis. |
| **EQ5** | **Colour by depth, a choice:** USGS's depth bands beside severity on the rail; the depth lines stay. |
| **EQ6** | **Magnitude and depth ranges** on the rail, kept in links and settable by the share handle. |
| **EQ7** | **Replay with decay:** on play, each quake flashes as it happens and fades over a set time. |
| **EQ8** | **Plates and volcanoes with quakes:** PB2002 boundaries and the volcano catalogue as toggles on the quake kit. |
| **EQ9** | **A ping on a new strong quake**, in the app only (OR33), over a magnitude the person sets. |
| **EQ10** | **Earthquake 3D's look, done sharper:** a line up from each epicentre to a flag showing its magnitude; circles for the area the quake reached; flags stacking where quakes share a place, the strongest on top, up to a limit, colour-coded; crisp at every zoom, with effects and animation. |
| **EQ11** | **Area circles from ShakeMap where it exists:** USGS's own shaking contours (felt, strong, severe) where USGS made a ShakeMap, mostly M4.5+; elsewhere a ring that grows with magnitude, the key saying it is an indication, not a measured area. |
| **EQ12** | **The quake kit's new icons** (3 Nov, the owner's pick of the drafted set): plate boundaries Lucide `split`, volcanoes `mountain-snow`, the magnitude range `sliders-horizontal`, the depth range `unfold-vertical`. None is used elsewhere. |
| **EQ14** | **Which window the quakes follow** (4 Nov; the owner: "whatever UX is superior to Earthquake3D", so chosen here): live, under All, 1 y or 24 h, the last day, every quake, as a first visit reads it; the time bar's 7 d the last week, every quake; its 30 d the last 30 days, M2.5 and over (all of them is about ten thousand); a paused window inside the last 30 days, that window, from the feed that covers it. The key says which. Earthquake 3D changes its span in a menu; here the time bar already in hand does it. Older than 30 days: step 4. |
| **EQ15** | **A History range on the time bar** (4 Nov, the owner's pick): a new range button whose axis runs from 1900 to now (from 2150 BC while the atlas is on), zoomed to a decade, a year or a month; pausing on a stretch draws its quakes from the baked history. The other ranges are unchanged. |
| **EQ16** | **The atlas's quakes as flags with a mark** (4 Nov, the owner's pick): NOAA's significant quakes keep the magnitude flag, with a small badge for deaths (the count) and a wave for a tsunami; the note gives NOAA's deaths, damage and tsunami, and the key explains the badges. |
| **EQ17** | **Replay's decay, a set time** (4 Nov, the owner's pick): on play, each quake fades over a few seconds of play whatever the rate, as Earthquake 3D's sequencer does: 1 s, 4 s (the default) or 10 s, a Decay control beside the rates while quakes are drawn; the key says it ("each quake fades over 4 s of play, 16 h at 4 h/s"). |
| **EQ18** | **A quake as it happens in play: rise and burst** (4 Nov, the owner's pick): its flag rises up its line from the epicentre with a brief glow, and a ring bursts outward on the ground, sized by its magnitude; as it decays the flag sinks and fades. Silent. |
| **EQ19** | **A ping on a new quake of M6 or more, whenever Starcom is open** (4 Nov, the owner's pick): on by default from M6 (about three a week), settable to M5, M6, M7 or off on the quake kit and kept in this browser; checked every five minutes from USGS's M4.5+ day feed, whether Eco Disasters is on or not (the hour feed would miss a quake posted over an hour after it happened); only quakes that arrive after the page opened ping. |
| **EQ20** | **What a ping shows** (4 Nov, the owner's pick): a notice ("New quake: M6.4, 80 km SW of …, 3 min ago") that opens the quake in the inspector; a pulsing ring at the quake until it is opened; a count on Eco Disasters' rail button; the alert sound if sound is on. Never in a card or a clip: a ping is the person's own (OR33). |
| **EQ21** | **A clip's replay replays the quakes** (4 Nov, the owner's pick): `recordClip` with `replay` draws each quake as play does, rising and bursting as the clip reaches it and fading over 4 s of the clip, or 1 s or 10 s (`replay.decayS`); the clip's result and the spec say so. |
| **EQ13** | **Every glyph in its true colour** (3 Nov): found while colouring the flags, every glyph-sprite layer drew its icons darker than the key (the shared shader wrote linear values straight to the screen: `#A1ADB2` drawn `#5B6B72`). The owner chose to fix them all at once, not layer by layer, the goldens kept again after. |

**EMSC's terms (read 4 Nov, seismicportal.eu/terms.html):** its datasets and products are CC BY 4.0, commercial use
included, credited "EMSC-CSEM SeismicPortal, https://www.seismicportal.eu"; mirroring the site or bulk-copying a
database needs EMSC's written permission. So EMSC is read live for the window shown and credited on cards, never
baked. Its event service sends CORS `*`; each event names its reporting agency (`auth`).

## Build order
1. EQ10 marks: line, magnitude flag, stacked flags by strength with a limit, colour-coding, area circles; crisp
   rendering measured headless (QUALITY=high) against today's.
2. EQ5 colour by depth; EQ6 ranges (a range control for the rail); EQ8 plates and volcanoes.
3. EQ1 USGS by window; EQ2 EMSC after its terms.
4. EQ3 history and EQ4 atlas, baked, loaded when the time bar reaches before the live feeds.
5. EQ7 replay with decay (EQ17, EQ18); EQ9 ping (EQ19, EQ20).
6. The share handle's words for all of it, a note to Mecha Jono, and the live checks.

## Built
**Step 1 (3 Nov).** With Eco Disasters' pins, each quake is a line up to a flag with its magnitude to a tenth, in the
colour of its whole step (tokens `DATA_SCALES.quakeMagnitude`), baked at twice its size and mipmapped
(features/globe/marks/quakeFlags.ts). Flags that crowd on screen stack on the strongest one's line, the strongest
highest, four at most, the rest counted on a "+N" chip; each stack stands as tall as it can without reaching into a
stronger one's column, and a stack with no room joins the stronger one's count, so no two stacks ever cover each other.
A line's height follows the camera's (`stalkHeightFor`): about the same length on screen at every zoom, so close in a
flag stays over its own quake. Round each quake of magnitude 4 or more, the area it reached (EQ11): USGS's ShakeMap
contours where USGS made one (services/ShakeMapService.ts: the quake's detail, then the preferred ShakeMap's
cont_mmi.json; the whole steps of MMI from II, in USGS's colours, `DATA_SCALES.shakingMmi`, over a dark halo), read for
the 30 strongest that have one, and whenReady waits for them; elsewhere a dashed ring from the magnitude, the key
saying it is an indication. A quake of magnitude 5 or more ripples (quakeRipples.ts), for the eye only: on screen with
the clock, in a clip by its frames' moments, never on a card (IM23).

**Step 2, part 1 (3 Nov).** EQ5: the rail's new Quakes' colour control (`eco:colour`) colours each quake's line, flag
and ring by magnitude (the default) or by how deep it began, in USGS's depth bands (`DATA_SCALES.quakeDepthKm`); a
quake of no stated depth is grey, and the key says so. The flags are now baked white and tinted per quake (a new
`tint` on the glyph sprites, white for every other layer), and their atlas has no colour space: the sprites' shader
writes texels to the screen as they are, so a decoded sRGB atlas had drawn every flag darker than its colour in the key
(measured: `#A1ADB2` drawn `#5B6B72`). The stacks also keep clear of the other hazards' pins, standing shorter beside
one, and draw over them where there is no room. Share handle v75: `layerChoices.EcologicalDisasters` gains
`eco:colour`, and whenReady's ShakeMap wait is in the spec.

**Step 2, part 2 (3 Nov).** EQ13: the glyph sprites, their count badges, Hero Watch's pills and the marks' rings and
pings write their colour back in the screen's colour space (`sRGBTransferOETF`), as the dots, fills and country names
already did, so every glyph is the colour its key shows; the emblem's two inks, written as the screen shows them, are
taken to linear first, and the quake flags' atlas is sRGB again with linear tints. EQ8: the rail's Plate boundaries
(`eco:plates`, on) draws PB2002's 241 boundaries baked to public/data/quakes/plate-boundaries.json
(scripts/quakes/bake-plates.ts; each named for its two plates), the 65 subduction zones in the hazards' colour and
heavier, with a key entry and PB2002's credit on cards; its Volcanoes (`eco:volcanoes`, on) shows or hides the volcano
catalogue. EQ6: Which magnitudes and Which depths (`eco:magnitudes`, `eco:depths`) are the bands, as chips in their
colours, every band on at first; the quakes outside them are left out on every mark style, a quake of no stated depth
kept only while every depth band is, and the key says "only magnitudes 5 and over". Share handle v76.

**Step 3 (4 Nov).** EQ1, EQ2, EQ14: the quakes now follow the window shown (services/quakes/quakeWindow.ts,
hooks/useQuakeWindow.ts): live, the last day of every quake; the time bar's 7 d, the last week of every quake; its 30 d,
the last 30 days of M2.5 and over; a paused window inside the last 30 days, the smallest USGS feed reaching back to its
start, cut to the window. Beside USGS's, EMSC's event service for the same span (its strongest first, 4,000 at most),
merged: an EMSC quake within 60 s and 100 km of a USGS one, its magnitude within one, is folded into it, and the quake
names both agencies ("Reported by USGS (us) and EMSC (GFZ)"); the rest of EMSC's are drawn as their own, named by the
agency EMSC took them from. Eco Disasters' own settings (Earthquakes, severity) filter them as they did the feed's. The
key says what is drawn ("drawn: the last 7 days, every magnitude, from USGS and EMSC"), cards credit
EMSC-CSEM SeismicPortal (CC BY 4.0) when its quakes are drawn, and whenReady waits for the read. The time bar's range is
now a shared store (features/globe/timebar/timebarRange.ts). Read again every five minutes while live.

**Step 4 (4 Nov).** EQ3, EQ4, EQ15, EQ16: USGS's catalogue of magnitude 5 and over since 1900 (107,068 quakes) baked a
decade a file (public/data/quakes/history/m5-<decade>.json, 7–254 KB gzipped; scripts/quakes/bake-history.ts) and NOAA
NCEI's Global Significant Earthquake Database (6,635 quakes, 2150 BC to 2026, 153 KB gzipped;
scripts/quakes/bake-atlas.ts). The time bar's History range runs its axis from 1900, or from 2150 BC, to now; a moment
chosen selects the decade, year or month round it, which the clock names ("the 1960s", "1964", "Mar 1964"), and play
runs at a month or a year a second. A paused window starting more than 30 days back reads the history
(services/quakes/quakeHistory.ts): only the decades it touches, each once, the atlas, and USGS's event service for any
part past the bake. An atlas quake that is one of USGS's (a minute, 100 km, one magnitude) is folded into it, keeping
NOAA's record. An atlas quake's flag carries a badge beside it: its deaths to the least power of ten NOAA's count reaches
(†, †10+ … †100k+, from the count or from NCEI's order), ≈ where a tsunami came of it; the exact count, damage and
intensity are in its hover and note, its date as precisely as the record gives it. Cards credit NCEI as it asks.

**Step 5 (4 Nov).** EQ7, EQ17, EQ18: the time bar's play is one clock (features/globe/timebar/playClock.ts), stepped
with the window twice a second and carried on between steps, which the quake flags read as they draw. Each quake shows
from its moment: its flag rises up its line with a glow (0.35 s and 0.6 s of play), a ring bursts outward on the ground
from it (quakeBursts.ts; 1.2 s of play, half again the ring of how far it was likely felt, never under 60 km), then it
sinks and fades over the decay, 1 s, 4 s or 10 s of play, the bar's Decay control while quakes are drawn, kept in this
browser; the key says it. While playing, the quakes are read for the play, not each step's window (which had read USGS
and EMSC again twice a second): inside the feeds' 30 days once, from where play began less the decay; further back,
from the history three seconds of play at a time with the next three, the last read kept while the next is read
(services/quakes/quakeWindow.ts, replayQuakeWindow). In a replay the rings, ShakeMaps, ripples and depth lines rest (a
line for every quake read would stand for those play has not reached); drawn as icons, dots or spikes, the quakes are
those of the window reached, cut from the play's read. EQ9, EQ19, EQ20: whenever the globe is open, USGS's M4.5+ day
feed is read every five minutes (services/quakes/quakePings.ts); the first read only learns what is there, and each
quake after it of the magnitude set or more (M6 until chosen: the quake kit's Ping on a new quake, `eco:ping`, bound,
kept in this browser and never a page's to set) pings once: a notice ("New quake: M6.4, 80 km SW of …, 3 min ago")
that opens its note, the alert sound if sound is on, a pulsing ring at it until its note is opened (with its own flag
where Eco Disasters draws none), and a count on Eco Disasters' rail button. A ping is hidden from every card and clip.
Found in the look at it: a quake stack's chips and an atlas quake's badge had been counted as marks of their own on
the time bar (a quake up to three times) and listed in the inspector's "near it" ("More quakes crowd here"); now
neither is (drawnMarks.ts, `repeats`).
And from the live look: a page held up (starcom.app loading over the network) had jumped play on by the whole stall,
past every quake between, unseen; a step now counts two steps' time at most, so a stall pauses play.

**Step 6 (4 Nov).** EQ21: `recordClip` with `replay` replays the quakes drawn as flags. Before its first frame the clip
sets the replay (playClock.ts, setClipQuakeReplay: `replay.decayS`, 1, 4 or 10 s of the clip, and the data's time a
second of the clip reveals), the flags are built for it as for play, and whenReady waits for that build
(quakeReplayReadiness); each frame draws them from the replay's moment. The quakes count toward the replay's span
(replayPace.ts, planReplay's `quakes`), so a replay of quakes alone records; clip schema 11 records how many were
replayed and their decay, with a caveat. Share handle v77 (`replayQuakeDecays`), and its spec entry says what steps 3
to 5 changed for the handle. Verified live on build 18ded7b6: a day's replay of 599 quakes, a decayS of 7 refused. The
note to Mecha Jono, approved by the owner, was posted on the handoff doc's thread (5bd22dfe-9bdb, seq 162). D-EQ's
build order is done.

**Follow-ups (10 Nov).** An atlas quake NOAA's record gives no magnitude (most before instruments) had drawn as a plain
quake icon, without its † or ≈ badge. It now gets a flag reading "?", grey as a quake of no stated depth is. It keeps
its badge and stacks under every quake that has a magnitude. It has no ring, ripple or replay burst, all sized by
magnitude, and the key keeps "magnitude not recorded" (quakeFlags.ts `flagCellOf`, `UNKNOWN_MAGNITUDE_CELL`). A
replay's caveat no longer says "each report appears" when quakes alone may have been replayed: with quakes in it, it
names reports and quakes both, and claims neither.
