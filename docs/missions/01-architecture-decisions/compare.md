# Compare any two (D-CM)

UX plan phase E, item E2 ([`../04-plan/ux-expansion-plan-2026-11.md`](../04-plan/ux-expansion-plan-2026-11.md)):
"side by side made general: one layer at two moments, or two layers at one, split down the globe, each half
labelled." OR35 (1 Nov): a card of a comparison draws both halves, each half's label and moment on it, and the caveats
of both layers.

## What was there (4 Nov 2026)
The globe could already split down the middle for Psi Watch (D-PW, PW63, PW73; globe-engine/splitView.ts): its layers
drawn twice, at now in the left half and at the cursor in the right, each group clipped to its half by a plane through
the camera, turned with it every render; a capture drew the cursor's globe whole. Nothing else could be split.

## Decisions (the owner, 4 Nov 2026)
| | |
|---|---|
| **CM1** | **Two layers first, then two moments.** First, two layers at one moment: the left half draws one layer, the right half another, for any layer drawn as its own group. Then one layer at two moments for the quakes and Earth Weather (this week's quakes beside the same week of 2011; weather now beside a forecast hour). |
| **CM2** | **Started from the palette and the rail.** A palette command ("compare quakes with weather"), and a Compare button on a layer's rail kit asking for the other half. A bar across the split names each half; one click ends it. |
| **CM3** | **Cards, clips and the share handle.** Cards and clips draw both halves, each labelled, with both layers' caveats (OR35); the share handle gains `setCompare({ left, right })`, so Mecha Jono can make comparison cards (contract v78). |
| **CM4** | **The quakes at two moments: offsets and any window** (4 Nov, the owner's pick). Quick picks for the right half: the same window a week, a month, a year or ten years earlier; or any window: the time bar paused on it becomes the right half's, the left staying where it was. Each half's window is named on the bar and the card. |
| **CM5** | **Earth Weather at two moments: now and a forecast hour** (4 Nov, the owner's pick). The left half now, the right half a forecast hour from the key's own steps: +6 h, +12 h, +1 d, +3 d, +7 d. |

## Built
**Step 1, two layers at one moment (4 Nov 2026).** globe-engine/compareLayers.ts: while a comparison is chosen, every
render of the globe's scene to the screen is two, each in its own half (a scissor), the other layer's objects hidden;
the halves meet at the screen's middle, carried into a card's window of it (splitAt), so a card and a clip frame drawn
through the same render have both halves too. It holds for every shader: clipping planes, which Psi Watch's split
uses, are ignored by the custom shaders most marks draw with. A layer takes part by naming its objects
(registerLayerRoot, useLayerRoot; useSimpleGeoOverlayLayer and useScreenMarkLayer take a `compareLayer`): Eco
Disasters, Earth Weather, Space Weather (since 10 Nov), Intel Reports, Satellites, War & Conflict, Civil Unrest and Conflict Zones at any time, and
Resource Zones, Diplomatic Events, Cyber Threats and Comm Hubs while drawn; only those are offered. Verified on the
preview: the palette's "compare eco weather" put Eco Disasters left; a card named each half and said so in its caveat. A layer is named whole or not
at all (Space Weather, in some fifteen pieces, waits). The arcs are one object for Intel Reports and War & Conflict,
so a compared layer's are left out while it is, and the bar says so. Started from the palette ("compare eco weather":
the layer named first is the left half) or a layer's rail Compare button; a layer not drawn is pinned for it and let go
after. The bar naming each half docks under the loading status (dockOrder.ts, `globeCompare`); the line is in the
globe's own box. Cards name each half in the picture (compareHalves.ts) and carry `appearance.compare` (card schema
36) with a caveat; clips name them on every frame and carry `compare` (clip schema 12). Share handle v78: `setCompare`,
`getCompare`. While the Sun's glow draws, the picture is drawn whole. Next: one layer at two moments, the quakes and
Earth Weather (CM1, CM4, CM5). The note to Mecha Jono for v78 was posted on their handoff thread (9ff63777-1ee7),
the owner approving the text.

**Step 2a, the quakes at two moments (4 Nov 2026).** A comparison may be of one layer at two moments (CM4): its
other moment is a copy of its own, `EcologicalDisasters@then` (features/globe/compare/quakeMoments.ts): a second read
of the quakes (useQuakeWindow, its own `then` readiness, which whenReady waits on) and a second set of flags
(useGlobeEcoKindMarks `instance: 'then'`, no ShakeMaps, no key of its own). So much earlier is in the right half, by
the calendar; a held window in the left, the time bar's in the right. The plate boundaries and the volcano catalogue
are timeless (registerLayerRoot `timeless`) and drawn in both halves; the other hazards stay in the half of the
window shown. Each half is named with its window and, where it reads fewer than every quake, its least magnitude
("…, M2.5+" for the month's feed, "…, M5+" for the history): a half drawing fewer must not read as a quieter time.
Started from the palette ("Compare Eco Disasters with a year earlier", "Hold Eco Disasters here and compare") or the
rail's Compare flyout. Cards (schema 37) and clips (schema 13) carry the names; share handle v79:
`setCompare({ layer, earlier })`, `setCompare({ layer, window })`, `compareMomentLayers`, `compareEarlier`. Next:
Earth Weather now beside a forecast hour (CM5).

**Step 2b, Earth Weather beside a forecast hour (5–8 Nov 2026).** Earth Weather's other moment is a copy of its
fields, `EarthWeather@then`: the temperature, rain, wind and clouds (useGlobeHeatMap, useGlobeRain, useGlobeWindFlow,
useGlobeRealClouds take `instance: 'then'`), each drawn as the layer's choices have it, read for its own hour and
waited on by itself (each hook's readiness kept per copy), never publishing a key and never noting what is drawn for
the hours a clip sweeps: that is the globe's own fields' alone (a test reads the four hooks for it). The right half
is so many hours after the moment shown: +6 h, +12 h, +1 d, +3 d or +7 d, the forecast strip's steps; while live the
left half is now and the right half counts from the hour, so it stays put as the minutes pass
(features/globe/compare/weatherMoments.ts). The gauges and the station marks are in the left half only. Each half is
named with its hour, and "forecast" only for an hour still to come ("Earth Weather, now" beside "Earth Weather, 9 Nov
12:00Z, forecast"). Started from the palette ("Compare Earth Weather with the forecast +1 d") or the rail's Compare
flyout. Share handle v80: `setCompare({ layer: 'EarthWeather', ahead })`, `compareAhead`; `compareMomentLayers`
gains EarthWeather. Verified on the preview (8 Nov, build 74071c0d): +1 d named "Earth Weather, now" beside
"Earth Weather, 9 Nov 08:00Z, forecast" in the bar, the card's picture and its caveat; +7 d drew the right half's
fields for 15 Nov (Western Europe cooler than at +1 d); the rail's flyout offered +6 h to +7 d and started +6 h; the
handle refused `earlier` for Earth Weather, an hour off the steps and `ahead` for the quakes. A card draws the land
under the temperature dimmed in both halves, as every temperature card does. Next: the note to Mecha Jono for v79–v80
(the owner approved its text), then E3 watchlists (OR33).

**Follow-ups (10 Nov).** Space Weather is comparable: every piece is tagged as the layer's (the field lines, cusps,
tail sheet, near-Earth flow and e-field for their life; the aurora when Space Weather shows it, never when only the Psi
shield does; the solar wind, ENLIL, CMEs and Van Allen belts while they stand; the engine's magnetopause, bow shock,
aurora lines and geomagnetic index as each enters the scene). Each half draws its own layer's arcs: three-globe makes
each arc an object holding its datum, so a half hides the other layer's, found as the half is drawn
(`registerLayerFinder`, which never makes a layer comparable on its own). The bar no longer says arcs are left out.
