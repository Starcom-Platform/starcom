# Decision record D-GV: the globe's visuals, overhauled

**Status:** planned and decided 2026-10-23 (GV1–GV8, the owner's multiple choice). It serves the visualization directive (D-F, `globe-visualization.md`) and the critique of 16 October
(`00-current-state/critique-2026-10-16.md`, C24–C34), whose rendering items had no plan until now.

## The owner's ask, 2026-10-23

> The current visualizations are mostly dot-based. Some have excellent SVGs and icons… but others have a very
> different take on how things appear. Satellites are just dots, and honestly very boring because of it. Many
> visualizations are also one-note… such as AI content, which all always have very generic titles and it's always
> the same icon. War & Conflict is pretty cool, actually; but I wonder if we can further enhance its visualizations
> in a number of compelling ways? … the national colorizing/texturing system is broken geometrically, where the
> national territories have geometries which end up intersecting with the round global sphere … territory lines
> aren't always drawn, and some visualization modes don't handle for that properly. The 3 point modes probably need
> a retrofit … we need a powerful overhaul and expansion of how SVGs are used for icons across every individual
> visualization mode.

## Where it stands, measured 2026-10-23

Measured with the layer audit (`npm run audit:layers`) on the local build of e523018b: 27 layers, each from three
views, plus a reading of each mode's drawing code.

| Mode | Layer | How its marks draw today |
|---|---|---|
| Cyber Command | Intel Reports | A glyph atlas per category and role, the richest set (`intelReportSprites.ts`) |
| | Cyber Threats | Dots, coloured by severity 3–5; the kind of threat is not shown |
| | Satellites | 8 px dots coloured by type, about fifteen in view; no orbit, no motion (`satellitePoints.ts`) |
| | Comm Hubs | Landing points as dots, plus cable lines |
| GeoPolitical | Diplomacy | A glyph per event category, on a disc, ring or dashed ring |
| | Resource Zones | Filled regions; no marks, little data or click-through (C22) |
| | Conflict Zones | Pink circles |
| | War & Conflict | A glyph per event, a rim for critical or deaths, tier fills, hatching, arcs. Dense theatres pile up, and arcs and fills open nothing on a click |
| EcoNatural | Space Weather | Shells, field lines, aurora; the shells cannot be read (C31) |
| | Eco Disasters | Dots coloured minor, major or catastrophic; the hazard (quake, fire, flood, storm) is not shown |
| | Earth Weather | Fields and real clouds; its sub-layers have no settings (C30) |
| Raver Watch | six layers | Glyphs per kind |
| Hero Watch | four layers | Four glyphs (lifeboat, uncounted, relief, mission) |
| AI Watch | four layers | Four section glyphs and a country glyph. In practice almost every mark is the one robot with "Country · 1 AI note" |
| Missions | two layers | A clipboard at each place, with a pill |

**The three mark styles** (Disc, Glow, Ring) are honoured by four layers only: Intel Reports, RLSH, Comm Hubs and
Cyber Threats (`markerStyles.ts`). Everywhere else they change nothing, which is why they barely differ.

**Why the territories sink (C26).** The base map's country fills are baked and fitted to the sphere
(`sphereFitSubdivision.ts`, 9a17327a). Every fill built at runtime through `GeometryFactory.buildTerritoryPolygons`
is not. That covers War & Conflict, lit countries, Hero Watch's regions, region marks, GDACS polygons, Spheres,
Organisations and Zones. Their triangles are flat chords between points on the sphere, so a large country's interior
sags below the surface: up to 3.9 scene units on the bake before it was fitted. That is the intersection the owner
sees. One fix in that one function covers all of them.

## The plan

Estimates are in hours of build, tests and checks. Each step ships on its own, behind the usual checks, and is shown
to the owner on the contact sheet before and after.

### GV0 — Foundations (no decision needed)

| # | What | Hours |
|---|---|---|
| GV0.1 | Fit every runtime fill to the sphere (`subdivideToSphere` in `buildTerritoryPolygons`), and draw long border segments along the curve, so no fill or line sinks (C26). Checked close up on Russia, Brazil, the US and Canada, with the vertex count kept within the quality governor's budget. | 3 |
| GV0.2 | Borders always drawn: a probe in the layer audit that says whether country lines are on in every mode, at each view and after a level-of-detail change; then fix each mode that drops them. | 3 |
| GV0.3 | **The Starcom Glyph Lexicon** (GV1, below): its ontology, taxonomy and grammar, about 200 glyphs drawn in the house style, shown on a glyph sheet for the owner's review before any is wired. Then one pipeline from the lexicon to every mode's sprite atlas, so a glyph is defined once and drawn everywhere. | 10 |

### GV1 — Dot layers get glyphs

| # | Layer | What | Hours |
|---|---|---|---|
| GV1.1 | Satellites (C25: "go to the moon on it") | A glyph per type (station, communications, navigation, weather, Earth observation, science, Starlink, debris); see GV-Q2 for orbits and motion | 4–13 |
| GV1.2 | Cyber Threats (C24) | First a research note on free or affordable live attack feeds with source and target (GV7); then a design on real data. Meanwhile, the lexicon's glyph per threat kind the feeds name | 3 + design |
| GV1.3 | Comm Hubs (C25) | A landing-station glyph; each cable clickable (name, owners, length, ready-for-service year), and its flow drawn | 4 |
| GV1.4 | Eco Disasters | A glyph per hazard (earthquake, volcano, wildfire, flood, storm, drought, landslide), with its severity kept as the rim colour | 3 |
| GV1.5 | Conflict Zones, Resource Zones (C22) | Zone glyphs at the middle of each zone, and a click-through on each | 3 |

### GV2 — Glyph layers augmented

| # | Layer | What | Hours |
|---|---|---|---|
| GV2.1 | AI Watch | A topic glyph from the note's own words (chips, robots, deepfakes and media, law and regulation, labs and models, military, surveillance, jobs); a country's mark shows its top topic, and its pill the top headline; see GV-Q5 | 4 |
| GV2.2 | War & Conflict | See GV-Q6: decluttering dense theatres, more event glyphs, clickable arcs and fills, recency pulses, rings scaled by reported deaths, front lines | 6–14 |
| GV2.3 | Intel Reports, Diplomacy, Raver Watch, Hero Watch, Missions | An audit of which categories fall back to a generic glyph, and new glyphs for each | 6 |

### GV3 — The mark styles, retrofitted

A set of styles every point layer honours, in place of Disc, Glow and Ring; see GV-Q3. About 6 hours.

### GV4 — The critique's other rendering items

| # | Item | Hours |
|---|---|---|
| GV4.1 | C29: a true latitude/longitude grid, with the equator, the tropics and the polar circles | 2 |
| GV4.2 | C28: the made-up clouds only on the terrain Earth, never on the cyber globe | 1 |
| GV4.3 | C27: close zoom, with sharper imagery (NASA GIBS tiles), no made-up clouds over it, and marks kept | 6 |
| GV4.4 | C30: settings for Earth Weather's sub-layers | 3 |
| GV4.5 | C31: Space Weather's shells made readable (labels, shapes and scale checked against the physics) | 4 |
| GV4.6 | C32: the planets' orbits checked against the ephemeris and corrected | 3 |
| GV4.7 | C34: the tour: a ping or crosshair on the item, a continuous loop as a setting, the globe offset beside its box | 4 |

In all, about 80–100 hours. That fits by 13 November beside the dated work (the key cut-over on 2 November, and the
Zones swap by 12 November).

## The Starcom Glyph Lexicon (GV1)

The owner, 2026-10-23: "Consider the other SVGs we're using and get more verbose about it. Don't be afraid to really
get expansive with a 'lexicon' and 'taxonomy' and 'ontology' of SVGs (reference existing SVGs being used across app
for quality+style reference)."

**What exists, the style reference.** About 140 symbols, all line drawings on Lucide's 24-unit grid with a 2-unit
stroke:
- `symbols/symbolRegistry.ts` (K3): 22 category emblems (14 Intel, 7 Diplomacy, 1 fallback), addressed by meaning,
  copied from Lucide (ISC).
- `symbols/uiSymbols.ts`: 84 symbols for apps, modes, layers, notes and jobs, with marks drawn for Starcom where
  Lucide has none.
- The globe's own: War & Conflict's 13 (strike, fighting, unrest, captive, sea, diplomacy, troops, nuclear,
  humanitarian, warning, shutdown, sanctions, report), Raver Watch's 9, Hero Watch's 4 and AI Watch's 5.
- The glyph sheet (iconography directive, v18) is where the owner has reviewed every round.

**The ontology: what a glyph can say.** Every mark answers three questions, each on its own channel:
1. *What is it?* The **kind**, as the icon. One meaning, one icon, app-wide: the globe's quake is the menu's quake.
2. *What sort of thing is it?* The **frame**, as the shape around the icon:
   - a disc for an event (it happened);
   - a rounded square for an asset or facility (it stands there);
   - a hexagon for an area or zone (it covers ground);
   - a diamond for an actor (someone acts);
   - a shield for a protective or safety resource;
   - an open ring for a forecast or prediction.
3. *How does it stand?* The **modifiers**:
   - the rim colour for its meaning scale (severity, tier, stance), the only channel colour may carry;
   - a dashed rim for an approximate place;
   - a corner badge for a count, the confidence or recency;
   - a strike-through for withdrawn or cancelled;
   - the Beacon style's pulse for new or critical.

**The taxonomy: domain, class, kind.** Ten domains, each with classes, each with kinds; about 200 kinds in all:
- **Conflict & security:** kinetic (airstrike, drone, missile, shelling, ground clash, naval), forces (troops,
  armour, aircraft, ships), effects (casualties, captives, displacement), politics (ceasefire, talks, sanctions,
  nuclear).
- **Cyber:** threats (botnet command, malware host, phishing, scanner, spam, DDoS, ransomware), infrastructure
  (data centre, exchange point, cable landing).
- **Space:** satellites by role (station, communications, navigation, weather, Earth observation, science,
  military, constellation, debris), space weather (flare, CME, storm, aurora, belts).
- **Infrastructure:** energy (power plant by fuel, grid, pipeline, reactor), transport (port, airport, rail),
  communications (cable, tower).
- **Earth & hazards:** geophysical (earthquake, volcano, tsunami, landslide), weather (storm, cyclone, flood,
  drought, heat, cold, wildfire), environment (spill, pollution, deforestation).
- **Health & harm reduction:** outbreak, drug-check alert, harm-reduction site, clinic, heat risk.
- **Society & civic:** protest, election, court ruling, shutdown, censorship, aid, charity, rescue (lifeboat, RLSH).
- **Economy & resources:** funding, trade, sanctions, minerals, water, food.
- **AI & technology:** chips, robots, models and labs, deepfakes and media, law and regulation, military AI,
  surveillance, jobs, incidents.
- **Missions & work:** mission, field mission, step, campaign, operation, cause, initiative, report, story.

**The grammar, and its checks.**
- An icon on the 24-unit grid with a 2-unit stroke and round joins, as Lucide draws.
- Drawn for Starcom where Lucide has nothing, in Lucide's manner.
- Legible at 16 to 28 px.
- Colour only from the registry's meaning scales.
- Never emoji (`guard-emoji`).
- Each kind with an id (`domain:class:kind`), a meaning in a sentence, its source (Lucide or Starcom) and the modes
  that draw it.
- A test that every mode's marks resolve to a lexicon entry, so no mode falls back to a generic dot again.

## Research, 2026-10-23: how others solve it

The owner asked to "explore deeper, audit more, research solutions, pros-and-cons". A code audit and a web survey
followed; each claim below was read on its source's own page unless marked *unverified*.

### The code audit

- **Fills (C26), measured.** The runtime fills sag below their 0.5-unit lift by up to 3.45 units (Canada), 3.07 (the
  US), 1.98 (Brazil), 1.88 (Russia, 26 triangles under the surface), 1.51 (China) and 1.49 (Australia). The outlines
  are dense (the longest chord 0.12), so it is the interior triangles that sink. The default fill lift is 5 units, not
  the small one its comment says.
- **Borders, probed in 11 modes at 3 heights.** Once loaded, country lines are present at every level of detail, and
  level changes cross-fade with no gap. Three faults remain:
  - On first load they arrive about 17 s after the globe (dev server, software rendering).
  - At height 1.6 the level of detail flaps: three rebuilds in 2.5 s.
  - They are drawn under some fields and fills: Space Weather's e-field over the US, Earth Weather's temperature and
    Resource Zones' fills.

  `buildBorderLines` draws `THREE.Line`, one pixel wide, with no points added along long segments.
- **Satellites.** About fifteen in view because `calculateMaxCount` falls back to 100 when no zoom is passed. The data
  path is already sound: CelesTrak's elements as JSON (OMM), cached two hours in IndexedDB as CelesTrak asks, Starlink
  read from the `active` group rather than fetched twice.
- **AI Watch.** The titles are mostly real headlines (51 distinct in 60). The sameness comes from drawing, not data:
  country marks draw the one robot glyph, and pills read "Country · N AI notes". The notes already carry facets
  (frontier, autonomous weapons, incident, AI security), stance, source and outlet country.
- **War & Conflict.** The notes carry the event (protest, attack, drone strike, travel warning…), casualties, actor,
  theatre, fatalities and place. Nothing declutters marks anywhere except Hero Watch's pills.
- **Glyphs.** The atlas bakes each SVG at 128 px per cell, with linear filtering and no mipmaps, so it shimmers at
  16–28 px. A colour is a tint of the whole glyph; there is no rim or halo.

### Fills that keep to the sphere

A straight edge across θ degrees dips R(1 − cos θ/2) below the sphere: 0.004 units at 1°, 0.095 at 5°, 0.38 at 10° and
3.4 at 30° (R = 100).

| Option | For | Against |
|---|---|---|
| **A. Subdivide each fill until it sags less than a tolerance, put it on the sphere, and merge all fills into one geometry with a feature id** (the bake's own method, `sphereFitSubdivision.ts`) | Already written and tested for the bake. One draw call. Picking and highlighting by feature id. Can be built in a worker. | The pole, the antimeridian and holes are ours to keep right. Very close zoom needs a finer tolerance. |
| **B. Paint fills into a texture on the globe:** an index map of which country each pixel is in, a palette, and a baked distance-to-border channel the shader reads for crisp edges | Exactly on the sphere, because it is the sphere. One draw. Recolour a country by changing one palette entry. Anti-aliased edges and borders at any zoom, with no geometry. | A bake script of our own (no library found). One texture per division (countries, Zones, Sectors, Spheres). At 8192 px the texel is about 4.9 km. War & Conflict's hatching and two-war overlaps move into the shader. |
| C. Cut fills on a latitude/longitude grid and project in the shader (deck.gl, MapLibre) | Cheap. Allows a flat-map morph. | Only the vertices sit on the sphere; a 10° cell still sags 24 km in the middle. Means adopting a library. |
| D. Stencil shadow volumes (CesiumJS) | Exact per pixel, even from coarse outlines. | Several passes; ordering, translucency and picking get hard. |
| E. Depth tricks only (`polygonOffset`, depth test off) | Trivial. | Hides nothing at the limb; the far side shows through. Only alongside another option. |

**Borders:** add points every 1° or less along the great circle, lift them about 0.1% of the radius, and draw them with
`LineSegments2`, which the territory look already uses: real pixel widths, one draw for all.

**Recommendation:** A now; it is GV0.1 as planned and fixes every runtime fill this week. B is the best-looking end
state for country fills, at about 16 more hours: GV-Q9.

### Satellites

**Measured:** satellite.js's `propagate` takes about 0.72 µs per object on an M2. 5,000 objects take 3.6 ms and 30,000
take 21.7 ms. A weak laptop is perhaps 3–5 times slower (*unverified*), so the whole catalogue every frame on the main
thread is out of budget.

| Option | For | Against |
|---|---|---|
| Propagate on the main thread each frame | Simplest. | Fine to 2,000–3,000 objects only. |
| **A worker propagates the whole catalogue once a second; the GPU blends two snapshots by a time uniform and turns them with the Earth** | Almost no work per frame. Smooth time scrubbing. One draw for 30,000 points. The pattern Stuff in Space proved. | A custom shader. After a time jump, re-propagate. |
| satellite.js 7's WASM bulk propagation in that worker | 3–12 times faster (its claim). The single-thread build needs no new headers; the CSP already allows WASM. | A WASM download. Not needed at once a second. |
| GPU SGP4 (`sgp4.gl`, beta) | The catalogue per frame. | Beta, no published accuracy, uneven WebGPU on weak laptops. |
| CesiumJS | Interpolation built in. | Adopting Cesium. |

**Recommendation:** the worker and GPU blend, with satellite.js upgraded from 6 to 7. CelesTrak's five-digit catalogue
numbers ran out on 11 July 2026, so newer objects come only as OMM. The rest of the showcase GV2 chose:
- One glyph and colour per class.
- A click picks by colour id and shows that satellite's orbit, its ground track one orbit either way, and its footprint
  (the ISS's is about 20° across at the horizon).
- Faint shells at the Starlink and GPS heights, one ring per orbital plane rather than per satellite.
- The three debris clouds (Fengyun-1C, Iridium 33, Cosmos 2251) with a time-lapse from each breakup.

The quality governor steps the count and trails down on weak clients. Fold this into GV1.1's 13 hours, about 15 with
the upgrade.

### Cyber Threats: a live feed with a source and a target (GV7)

None of the well-known attack maps (Kaspersky, Radware, Check Point, Fortinet) offers its data. Trade press describes
most of them as recorded playback or samples, not live.

| Source | What it gives | Terms | Arcs, honestly? |
|---|---|---|---|
| **Cloudflare Radar, layer 7 top attacks** | Pairs: the attacking IP's country, and the billing country of the site attacked. The value is a share of requests Cloudflare mitigated. Up to hourly. | CC BY-NC 4.0: credit, no commercial use. Free, with a token, so it is fetched on a server or at build time, never in the browser. | **Yes**, as shares, not single attacks. |
| Cloudflare Radar, layer 3 | Origin is Cloudflare's data centre (because of spoofing) | CC BY-NC 4.0 | No: the target side only. |
| SANS ISC (DShield) | Attacking IPs, top ports, daily summaries, the IP's country. Sensor places not given. | CC BY-NC-SA 4.0, no resale. No key. | No: sources as dots. |
| abuse.ch Feodo Tracker | Botnet command servers, every 5 minutes | CC0 for this feed | No: servers as dots. |
| GreyNoise, AbuseIPDB, CrowdSec, GreedyBear, OffSeq Mirage, Shadowserver | One-IP lookups, or aggregates without geography | Various; some keys must not sit in a browser | No. |

**Recommendation:** Cloudflare Radar's pairs are the only honest source of arcs found. They would be drawn with the
caption they need: "share of requests Cloudflare mitigated, attacking IP's country → attacked site's country, last 24
hours, Cloudflare Radar, CC BY-NC 4.0". DShield's sources and Feodo's command servers would be dots beside them. Where
the token is held is GV-Q10.

### Decluttering dense theatres (GV6)

| Option | For | Against |
|---|---|---|
| **A screen-space grid each frame:** project, drop the far side, sort by priority, refuse overlaps; a hidden mark adds to the shown one's count badge | O(n), likely under 1 ms for 2,000 (*estimate*). Works with any glyph. MapLibre's own method. | Flickers without hysteresis and a fade, so both are needed. |
| **Spiderfy on click:** marks at one place fan out on leader lines | Solves the same-city pile. The lines keep the true place honest. | Only on a click. |
| supercluster (already a dependency, for the Analyzer's map) | Cheap per frame. | Clusters in Web Mercator, stretching toward the poles, and never across the antimeridian. Not for a globe. |
| Equal-area cells (H3) | Correct at the poles. Stable membership. | Clusters jump at cell borders unless merged on screen as well. |

**Recommendation:** the grid with hysteresis and badges, and spiderfy on click. It is in GV2.2's hours.

### Crisp glyphs at 16–48 px

| Option | For | Against |
|---|---|---|
| Raster at the screen's pixel ratio, in size tiers, with mipmaps | The exact SVG look. | Blurs between tiers. Colour stays a tint; rims must be baked. |
| **A signed-distance atlas, baked in the browser from the same SVGs (48 px cells)** | One atlas sharp from 16 to 48 px. Rims, halos and glow are thresholds in the shader, so colour can carry meaning on the rim (GV3's Glyph, Pin, Beacon and Dot). About 1 MB for 64 glyphs. No new tools, no CSP change. | Sharp corners round slightly; round-capped line glyphs, the house style, hide it. |
| Multi-channel distance atlas (msdf-atlas-gen) | Sharpest corners at any size. | A C++ build tool, and stroked SVGs must be outlined first. |
| troika text with an icon font | Good quality. | Its worker is built from strings, which the CSP refuses. |
| Glyphs as geometry | Any size. | Thin strokes shimmer at 16 px. |

**Recommendation:** the signed-distance atlas, checked on the contact sheet against today's; the multi-channel one
only if corners show. In GV0.3's pipeline, about 3 more hours.

**Where new glyphs come from.** Lucide (ISC) lacks a volcano, flood, tank and meteor. Tabler (MIT) has them, on the same
24-unit grid and 2-unit stroke, so its paths join the lexicon with credit, copied per glyph rather than as a
dependency. Two sources were ruled out:
- milsymbol's military symbols imply a friend-or-hostile judgement that OSINT notes do not make.
- OCHA's humanitarian icons are filled pictograms that clash with line glyphs.

The two questions this raised, decided the same day, are GV9 and GV10 below.

## Decisions

| # | Question | Decision |
|---|---|---|
| GV1 | The glyphs' look | **A full lexicon, built from the app's own SVGs:** the owner asked for an expansive lexicon, taxonomy and ontology referencing the symbols already in use, rather than one of the three looks offered. Planned above; the sheet goes to the owner before any glyph is wired. |
| GV2 | Satellites | **The full showcase:** a glyph per type, live motion propagated from CelesTrak's elements, the orbit drawn for a hovered or chosen satellite and for a class, the ISS and Tiangong called out with their footprint, Starlink and GPS as constellation shells. About 13 hours. |
| GV3 | The mark styles | **Glyph, Pin, Beacon, Dot,** honoured by every point layer. |
| GV4 | The order | **Fixes, then showcases:** GV0 first, then Satellites and War & Conflict, AI Watch, the other dot layers, the mark styles, and the critique's rendering items last. |
| GV5 | AI Watch | **Topic glyphs and the note's own words:** a topic glyph from each note's words; beside a generic title, the note's own summary line; a country's mark shows its top topic and headline. Every word the note's (CR5). |
| GV6 | War & Conflict | **All four:** decluttering dense theatres, more event glyphs, clickable arcs and fills, motion and magnitude (a pulse on arrival, a deaths ring sized by the reported figure, a theatre's trend as a sparkline). |
| GV7 | Cyber Threats | **Research a live feed first:** find a free or affordable real-time attack feed with source and target, then design on real data. Until then the layer stays as it is, apart from the lexicon's glyphs. |
| GV8 | The key cut-over | **2 November stays on track**, after a delay on Mecha Jono's side; something is built there on Sunday. Starcom's line is set nearer the day, and the dev time now goes to this work. |
| GV9 | Country fills | **Geometry now, a texture later:** GV0.1 fits every runtime fill to the sphere this week (about 3 hours). Country fills move into an index texture with a border-distance channel after the showcases (about 16 hours), if the hours hold by 13 November. |
| GV10 | Cyber Threats' feed | **Through Mecha Jono, with dots now:** Mecha Jono holds a Cloudflare Radar token and posts the layer 7 origin→target pairs as notes; Starcom draws the arcs from those notes, built now on test notes (about 6 hours). DShield's attacking-IP countries are drawn as dots at once, needing no key. Both are captioned with what they are and their CC BY-NC terms. |
