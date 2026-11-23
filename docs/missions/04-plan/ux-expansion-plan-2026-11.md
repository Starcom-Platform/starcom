# The interface expansion, planned in detail (November 2026)

The owner's decisions OR1–OR19 ([critique-2026-11-01](../00-current-state/critique-2026-11-01.md)), turned into
steps. Each step ships on its own: affected tests, gates, build, golden cards, the three share smokes, a pass at full
detail (`.local/scripts/canvas-probe.mjs`, `QUALITY=high`) and, where hover changes, the tooltip probe
(`.local/scripts/tooltip-probe.mjs`). Each step's open questions are asked when it starts, with options; the ones
known now are listed at the end.

What exists (inventory of 1 Nov): the second left rail (`CyberCommandLeftSideSubRail.tsx`) carries controls only for
Space Weather (four toggles and a settings button), RLSH, Intel Reports, Earth Weather and Eco Disasters. Half the
point layers already draw SVG glyphs (Intel, War & Conflict, Civil Unrest, Raver, Hero, AI Watch, Diplomacy close
up); Cyber Threats, Satellites, Comm Hubs, Conflict Zones, Eco Disasters and the weather stations draw dots. Only War
& Conflict folds crowded marks (`glyphDeclutter.ts`). Resource Zones answers neither hover nor click. Four time
controls are scattered (TimeScrubber, the LIVE/SCRUB badge, Eco's floating history player, the floating TimelineView).
93 control glyphs exist in `symbols/uiSymbols.ts`.

## Phase A: the shared machinery

### A1. Control glyphs (6 h)
About seventy new control glyphs, drawn to the existing set's grid and stroke: mark styles (icon, dot, pin, spike),
colour by (kind, severity, age, source), size by (magnitude, count, none), labels, cluster, filter, time windows (24 h,
7 d, 30 d, 1 y, all), field looks (heat, contours, relief, flow, streaks, arrows, ripples), scale modes (true,
compact, diagram, sky), inspector actions (timeline, card, compare, watch), and each mode's own (arcs, deaths rings,
war map, theatres, trade routes, GDACS footprints, plumes, wind, clouds, gauges, belts, cusps, ENLIL, CMEs). A sheet
like the Glyph Lexicon shows them for one review pass with A3's kinds.

### A2. Rail kits (12 h)
- **The rail:** at its top, the layers drawn, as their glyphs (OR11), the primary chosen first; below, the chosen
  layer's kits and own controls, each one icon button whose face shows its state (OR10). A click opens a flyout beside
  the rail: a selector, chips, a slider or a range.
- **Kits** (OR1), taken by what a layer draws:
  - *Points:* mark style, colour by, size by, labels, cluster, filter by kind, details (the inspector's list).
  - *Areas:* fill (solid, hatched, outline, off), opacity, labels, colour by.
  - *Lines:* width by, arrows or flow, labels, planned or uncertain dashed.
  - *Fields:* look, scale (absolute or relative), opacity, units.
  - *Time:* window, step, fade by age.
  - *Solar:* scale, labels, orbits, moons, light.
- **Each layer's own controls** sit below its kits (Phase B).
- **Choices kept** (OR12): one store per layer (`layerChoices`), in this browser; written into a shared link (`lc=`),
  into a card's provenance, and settable from the share handle (`setLayerChoices(layer, choices)`,
  `getLayerChoices(layer)`; contract v68). The settings popups' controls move onto the rail; the popups keep the rarely
  used.

### A3. Kinds and their colours (6 h)
Twelve kinds (OR3, OR15), each a colour and an icon shape: armed conflict, unrest, geological hazard, weather and
climate, health, cyber, technology and AI, energy and resources, maritime and transport, space, diplomacy and
governance, aid and missions. Checked under protanopia, deuteranopia and tritanopia simulation (ΔE between any two
over a floor), clear of the interactive cyan, in `tokens.ts` as `KINDS`. Each layer maps its own categories to kinds
in one table (`kindOf`); an item about two things takes the first its layer lists. A mode's hue stays on its frame and
badge; severity is size and brightness, never hue.

### A4. Marks (16 h)
One mark renderer for point layers, generalising the screen-mark and glyph-sprite layers:
- **Icon:** the kind's icon on a backing, its brightness by severity.
- **Dot:** today's.
- **Pin:** a line up from the ground to a flag carrying a short tag ("M6.1 · 10 km · 2 h"), as Earthquake3D draws.
- **Spike:** a bar, its height the log of the magnitude (OR14), with a scale bar beside the key giving three heights.
- **Clusters** (OR13): near marks, in screen space, merge into the commonest kind's icon with a count badge and a ring
  split by kind; they part as one zooms in. War & Conflict's declutter becomes this.

### A5. One inspector (12 h)
A click on any item opens one docked inspector (OR16): title, kind, magnitude, time, place, sources with links,
related items near it and around its time, and actions: show on the timeline, make a card, compare, watch this
place. One item model, an adapter per layer. Hover stays a one-line tooltip (one at a time, `hoverOwners.ts`).

## Phase B: every mode's rail, marks and colours

### B1. Geo Political (14 h), first
| Layer | Kits | Marks | Its own controls | Gaps closed |
|---|---|---|---|---|
| Conflict Zones | points, time | icon by event kind (GDELT's root codes, collapsed), spike by count or by the Goldstein score's size | events or displacement or both; displacement as spikes at its country | icons at every zoom (clusters) |
| War & Conflict | points, areas, lines, time | today's glyphs, or spikes by deaths | force arcs, deaths rings, war map fill or hatch, theatres, brief day | icons always, a rail at last |
| Resource Zones | areas, lines, points | spikes by production | resource chips (oil, gas, renewables, water, minerals), trade routes, reserves or production | **hover and the inspector** (EIA, World Bank, USGS figures), icons for what has more to say (O9) |
| Diplomacy | points, lines | icons at every zoom | the seven categories, said or done, connections, place by | the popup's controls onto the rail |

### B2. Eco Natural (12 h)
- **Eco Disasters:** pins as Earthquake3D draws (O7), spikes, colour by kind, severity, depth or age; hazard chips;
  GDACS footprints and tracks, volcano plumes, shock rings; its history folded into the one time bar.
- **Earth Weather:** colour (temperature, rain, air quality) on the rail at last (O14); wind (streaks, arrows, off);
  real clouds; stations; gauges; units; contours and opacity from the fields kit.
- **Space Weather:** more than toggles: the e-field's look (streaks, arrows, ripples, relief) and scale; aurora (oval or
  curtains); field lines (closed, open); belts; cusps; the tail sheet; bow shock and magnetopause; the solar wind;
  ENLIL (density or speed); CMEs; the model's moment.

### B3. Cyber Command (12 h)
- **Intel Reports:** the settings popup's cap, emblems and lenses onto the rail; clusters; colour by kind.
- **Cyber Threats:** icons by attack type (DDoS, malware, phishing, exploit, botnet, ransomware), size by count,
  severity by brightness.
- **Satellites:** icons by role (communications, navigation, weather, Earth observation, science, crewed, military,
  debris); plane rings and the debris lapse on the rail.
- **Comm Hubs:** cables by status or age, planned dashed; landing points as icons; chokepoints flagged.

### B4. Civil Unrest, one layer (6 h)
OR5: Civil Unrest and Protest Surges become one layer with two looks, events and surges, each on or off from its rail.
Events by icon (protest, riot, strike, crackdown, curfew); surges as rings by the week-on-week rise; the country tint
on or off. `ProtestSurges` stays a share-handle id that turns on the surges look (contract v68 or v69).

### B5. Raver Watch, Hero Watch, AI Watch, Missions, Psi Watch (10 h)
Kits and colour by kind throughout. AI Watch: an item about war takes the conflict colour, one about safety the
technology colour, and so on (O17). Lifeboats: a line on the layer and its key saying it covers the UK and Ireland
(OR8). Psi Watch's looks move from its panel onto the rail.

## Phase C: one time bar (10 h)
OR4, OR17. One bar at the bottom, between the rails:
- at its left, the Live pill and the clock;
- at its middle, the track: the window's handles, a density strip of the drawn layers' items in their kind colours
  (one bin a pixel column), and markers for notable events (each layer says what is notable: a quake of magnitude 6,
  a war item with ten deaths);
- at its right, range presets, play and rate.

The LIVE/SCRUB badge and Eco's floating history player fold into it; Psi Watch's Timestream docks above it, as now.

## Phase D: the solar system's scales (39 h)
OR9. Today: sizes and the Moon's distance 1:1, every other distance 1:19.7.

### D1. True 1:1, done properly (10 h)
- **Depth:** a scene from metres to 30 AU cannot share one depth buffer. Two passes: the far scene (Sun, planets, their
  orbits) drawn first with its own near and far planes, the depth cleared, then the near scene (the globe, its layers,
  the Moon, the magnetosphere). No custom shader changes; the globe covers what is behind it. A logarithmic depth
  buffer is the fallback, at the cost of adding its chunks to every custom shader.
- **Zoom:** each wheel step multiplies the distance, so the surface to Neptune is one smooth pull-out; reach set by the
  scale (60 AU at True).
- **Bodies:** a body under three pixels is drawn as a marker (a ring and its name), cross-fading to its disc as it
  grows; a click on a marker flies there.
- **The Sun:** at True, 0.53° from the Earth, as in the sky; its glow sized by its apparent size.

### D2. The scale selector (6 h)
True, Compact and Diagram on the solar kit; switching glides every distance over about 1.5 s, the camera keeping its
target; the scale in force written on screen and in a card's caveat line; `setScale` on the share handle.

### D3. Space weather in every scale (6 h)
Each part placed by what it belongs to:
- *Bound to the Earth:* the magnetosphere, belts, aurora, e-field, field lines, cusps, tail sheet and bow shock, true
  at every scale.
- *Bound to the Sun:* ENLIL, CMEs, the solar wind and the heliosphere, placed by the distance scale.

At True, a CME is seen crossing the real gap to the Earth.

### D4. Diagram (5 h)
Orbits evenly spaced, bodies enlarged on a log of their size, marked "not to scale" on screen and on cards; space
weather drawn as a schematic or off.

### D5. Sky from a place (12 h)
A planetarium at the observer (the globe's centre or the place pinned):
- the camera on the ground, looking up;
- a horizon, and the sky's colour by the Sun's altitude;
- a bright-star catalogue (about 9,000 stars);
- the Sun, Moon and planets at their true apparent sizes and places;
- labels, and the time bar driving it.

## Phase E: the four expansions (46 h)
- **E1. Command palette (10 h):** Ctrl or Cmd-K. One box for places (countries, Zones, Spheres), the items drawn,
  layers and modes, and commands ("rain on", "scale true", "last 7 days"), with recent ones; keyboard throughout.
- **E2. Compare any two (10 h):** side by side made general: one layer at two moments, or two layers at one, split
  down the globe, each half labelled.
- **E3. Watchlists and pings (10 h):** watch a place (a country, Zone or radius) or a kind; new items landing there
  ping in the app (a toast, a badge, a list), checked as they arrive; kept in this browser.
- **E4. Story builder (16 h):** a story is steps, each a framing, layers, their choices, a moment, a caption and a
  hold. Played in the app; exported as a clip through the tour and clip machinery; shared as a link.

## Phase F: RLSH sign-up (12 h)
OR7 and OR19; OR35–OR38 (2 Nov). **The method is NavCom's (OR38):** RLSH and NavCom share one system for
profiles and for how they are shown, so F starts from NavCom's sign-up and profile display and reuses them; the steps
below are checked against it first, and any difference goes to the owner.
1. A hero opens Join; the age rule comes first (no key under 13, RS37–RS44).
2. A short form: an alias, a role, a team, a Zone (never a point, never a person's place), and consent for each
   contact. The person signs it as a Nostr note to the team's relay.
3. The team relay's members approve or decline it in a review queue.
4. Starcom's list carries each team's approvals, for the teams Starcom recognises.
5. A hero can withdraw at any time; the profile goes.

The dead Formbricks link goes.

## Phase G: notes to Mecha Jono (1 h, each text to the owner first)
More lifeboat services (OR8); Psi Watch open to everyone (OR6); layer choices on the share handle (v68).

## The order
1. A1 and A3 together, for one review: the control glyphs, the twelve kinds and their icons, and the Glyph Lexicon
   picks drafted for every layer (OR2).
2. A2, A4 and B1: kits, marks and clusters, first on Geo Political. Then A5, the inspector, with Resource Zones.
3. C, the time bar.
4. B2, B3, B4, B5.
5. D1–D3, then D4 and D5.
5a. Psi Watch's reader of Mecha Jono's live notes (owner, 2 Nov: after D, before the key change of Mon 9 Nov
    15:00Z; about 5 h): The Record by topic from their new key, the kit's readers, the kit stepping aside per family as
    live notes of it arrive. Starcom reads Psi notes only from its build until then.
6. E1, E2, E3, E4.
7. F.

About 214 hours.

## Questions for each step, asked when it starts
- **A2:** Does a flyout close on a click elsewhere, or stay until closed? Keyboard keys for the kits? On a narrow
  screen, does the rail become a bottom sheet?
- **A4:** Does a click on a cluster zoom in, or list its items in the inspector? What does a pin's flag say? Is a
  spike coloured by kind or by its magnitude?
- **A5:** Is the inspector docked right or a bottom sheet? Does it replace the Diplomacy, Hero, Missions and
  Operations panels, or sit beside them? How near and how close in time is "related"?
- **B1:** How many icons for GDELT's twenty root codes? Displacement as spikes or rings?
- **B2:** Draw a quake's depth beneath the surface, the crust seen through? Eco history in the time bar?
- **B3:** Within one kind (every satellite is space), roles in shades of its colour, or by icon alone?
- **C:** What is notable in each layer? Does the density strip count only the layers drawn, or every layer?
- **D1:** How far may the camera pull out at True: Neptune (30 AU) or the heliopause (about 120 AU)?
- **D5:** How many stars? Constellation lines, and whose?
- **E2:** Does a card of a comparison draw both halves or one?
- **E3:** Pings beyond the app (a Nostr message), or in the app only?
- **E4:** Export as a clip, a set of cards, a link, or all three?
- **F:** The sign-up's kind number, agreed with Mecha Jono; what a profile shows; how Starcom recognises a team.
