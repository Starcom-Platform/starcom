# Space weather on the globe (decision D-SW)

The owner, 2026-10-02 and twice on 2026-10-05: space weather is "sub-par, just
more dots". Wanted: the magnetosphere's field lines, sized, scaled, aligned and
positioned correctly; plasma flow across the solar system; auroras at their real
positions, not a circle; the e-field drawn in full again, after measuring whether
the source or Starcom limits it. Taken up 2026-10-10, after block G, at the
owner's choice. Earth weather is decision D-W (`weather-visualization.md`).

## What was there (surveyed 2026-10-10)

- **One layer, `SpaceWeather`**, with a registry of nine sub-layers; what
  reaches the globe is the e-field points, a magnetopause shell, a bow shock, an
  aurora line and a Kp shell (`Globe.tsx` 1159–1174). Radiation, ionosphere,
  solar activity and cosmic rays draw nothing; the five mode components render a
  hidden `<div>`.
- **The e-field** comes from NOAA SWPC's two geoelectric grids (InterMag
  EarthScope 0.5°, and US-Canada 1D), the newest file of each, every 5 minutes,
  while the mode is on. `useSpaceWeatherVisualization` keeps the 500 strongest
  (`legacyCap: 500`, since commit 7aa7beb01 of 2025-06-28, "reduced from 1000 to
  500 for better performance") and drops those under 0.02. They are drawn as
  screen points, 7–18 px by magnitude, coloured by rank; their direction is not
  drawn. The grid-binning mode cannot be reached from its toggle.
- **The aurora** is modelled from Kp alone: 96 points at latitude ±(80 − 2.5·Kp
  − 0.6·cos longitude) round the geographic pole, a near-circle, drawn as a line
  loop. OVATION is used nowhere.
- **The magnetopause** is Shue-like (stand-off 10.22·P^(−1/6) Re, Bz only in the
  flaring), turned to the Sun, with no dipole tilt; 1 Re = 100 units. No field
  lines exist anywhere.
- **The solar wind** (SWPC's propagated 1-hour product) only sizes the shells
  and feeds read-outs; no plasma is drawn. The Sun's flares come from GOES X-rays.

## Measured (2026-10-10, 12:15Z)

| Source | What it holds | Size | Starcom today |
| --- | --- | --- | --- |
| E-field, InterMag EarthScope (`json/lists/rgeojson/InterMagEarthScope/`, a file a minute) | 3,432 points, 26–48.5°N, 124–67.5°W; \|E\| 0.05–49 (median 2.1) | 0.61 MB | the 500 strongest of both grids |
| E-field, US-Canada 1D (`…/US-Canada-1D/`) | 6,763 points, 25.5–60°N, 139–52.5°W; \|E\| 0.05–29 (median 3.2) | 1.21 MB | (together) |
| Aurora, OVATION (`json/ovation_aurora_latest.json`) | 65,160 cells, 1° global, both hemispheres, % probability, forecast ~1 h ahead; 19,406 non-zero | 0.92 MB | not used |
| Real-time solar wind (`json/rtsw/rtsw_wind_1m.json`, `rtsw_mag_1m.json`) | speed, density, temperature; B in GSE/GSM, a minute apart, the active spacecraft named | 2.75 MB, 1.58 MB | the propagated 1-hour product |
| Dst (`products/kyoto-dst.json`) | hourly, a week | 7.5 KB | not used |
| GOES electrons (`json/goes/primary/integral-electrons-1-day.json`) | ≥2 MeV flux, 5 min | 30 KB | not used |
| ENLIL (`products/animations/enlil.json`) | frame list of the model's pictures | 12.5 KB list | not used |
| DONKI CMEs (`https://ccmc.gsfc.nasa.gov/DONKI-API/get/CMEAnalysis`) | 24 analyses 1–10 Oct: direction, half-angle, speed, time at 21.5 Rs | small | not used |

Every SWPC answer above sends `Access-Control-Allow-Origin: *`, as does DONKI's
new address (its old one, kauai.ccmc.gsfc.nasa.gov, now redirects to an
announcement; CCMC moved the API in September 2026). The policy's `connect-src`
and `img-src` allow any https host.

**So the e-field's limit is Starcom's:** NOAA serves 10,195 samples a minute;
Starcom draws at most 500 of them, about 5%.

## Decisions

The owner's (2026-10-10, multiple choice; the e-field, field lines and plasma
after a brainstorm the owner asked for):

| | Decision |
| --- | --- |
| SW1 | The e-field draws every sample, never as dots: a continuous colour field by strength, drawn by a shader, with four looks for its direction in the settings: **flowing streaks** (the default; streaks drift along the field, faster where stronger, tapered so a still card shows direction), **an arrow grid**, **flux ripples** (wave fronts pulsing in its direction) and **relief** (a glowing surface raised by strength, coloured by direction). |
| SW2 | Fine settings, so a person can draw less or fetch less: which grids are fetched, how often, the colour scale, opacity, flow speed and density. |
| SW3 | The aurora is NOAA's OVATION forecast at its real positions, both hemispheres, a glowing band by probability, with a vertical curtain of light rising from it on the night side. The Kp model only when OVATION fails, and said so. |
| SW4 | Field lines from Tsyganenko's T96 model, driven by the live solar wind (dynamic pressure, IMF By and Bz, Dst), with the real dipole tilt for the moment shown: the shape changes as the wind does. |
| SW5 | The magnetosphere's touches, all four: field lines as glowing tubes, closed and open lines in two colours, with light pulses running along them at the solar wind's pace; the Van Allen belts as glowing tori, brightened by GOES's measured electrons; glowing polar cusps feeding the aurora, with dayside flashes when the IMF turns south; a shimmering current sheet through the tail. |
| SW6 | Plasma across the solar system: particles streaming from the Sun along the Parker spiral, and NOAA's ENLIL model, each switchable, or both. |
| SW7 | The particles carry the real wind: each leaves with the speed and density measured at L1 when it set out, so real fast and slow streams catch each other; measured turbulence jitters them; the IMF's polarity colours them. |
| SW8 | Coronal mass ejections from NASA DONKI, as expanding shells at their real speed and direction, with their arrival time at Earth. |
| SW9 | ENLIL's frames played as the timeline moves, its forecast days ahead included. |
| SW15 | (After step 3.) The aurora is on when Space Weather opens, for everyone: settings saved while it was off, from when it was the Kp ring, are turned on once; a person can still choose the band alone, or none. |
| SW16 | (Before step 6.) The particles are a hindcast, labelled: the stream from the Sun to the Earth as it was a few days ago, every parcel from real L1 measurements (NOAA's 7 days of propagated wind) traced back along its path, the newest also past the Earth; a card says "as it was at" that moment. Wind measured at L1 has already passed the Earth, so no measurement describes the Sun-Earth stretch now. |
| SW17 | (Before step 6.) The particles at both scales: the Sun-to-Earth stream in the solar system's compressed space, and a flow streaming past and round the magnetosphere at its own scale. |
| SW18 | (Before step 7.) ENLIL is drawn as a re-coloured glowing disc: its values read off NOAA's published frames through their own colour bars, redrawn as a translucent disc in the ecliptic round the drawn Sun in Starcom's palette, low values see-through, its Earth on the globe's. Density by default, velocity switchable. |
| SW19 | (Before step 7.) While ENLIL is on, the timeline reaches ahead to the end of its frames (about 4 days), marked as forecast; at a future moment ENLIL shows its forecast and every other layer its latest, which a card says. |
| SW20 | (Before step 8.) A CME's shell moves by the drag-based model (Vršnak et al. 2013): from DONKI's measured speed at 21.5 solar radii toward the surrounding wind's, as forecasters use it. Labelled a model. |
| SW21 | (Before step 8.) The arrival at the Earth stated is DONKI's ENLIL estimate, CCMC's modelled shock arrival with its glancing-blow flag, named as theirs; where their run shows no Earth arrival, that is said. |
| SW22 | (Before step 8.) The CMEs drawn are those in flight at the moment shown: each from when it left the Sun until its shell passes 2 AU, following the timeline, past and forecast. |
| SW23 | (Before step 8.) A shell is a translucent cone-model cap with a glowing rim, coloured from slow (pale) to fast (hot), outlined when Earth-directed; arrival times in the key and on cards, not on the globe. |
| SW24 | (After step 8.) Where CCMC's ENLIL gives an Earth arrival, the shell is paced to reach the Earth then, so the picture and the key agree. Other CMEs keep the drag-based model's usual values. |
| SW25 | (C31, the owner, 2026-10-24.) The solar wind's particles fade as the view comes edge-on to the ecliptic, as the ENLIL disc does: from near that plane the whole disc collapsed into one bright line through the Earth and the Sun. Seen from above or below they flow as before. |
| SW26 | (C31.) The magnetopause and the bow shock are drawn as contour lines: each a few thin lines, its nose and rings round the Sun-Earth axis, labelled, in place of a filled surface the owner found unappealing. |
| SW27 | (C31, after a brainstorm the owner asked for: "even with labels... mere/basic geometric shells [do not convey] the nature of what a real CME looks like".) A CME is a plasma bubble: a glowing cloud of particles bursting from the Sun along DONKI's direction, half-angle and speed, with the three-part structure coronagraphs film (a bright ragged front, a darker cavity, a bright core) and a faint shock ahead compressing the solar wind, paced as SW20 and SW24 say. Its shape is modelled, and said so. |
| SW28 | (C31.) Its magnetic structure: the flux rope as the GCS model has it, a twisted croissant with both legs anchored at the Sun, drawn as glowing helical field lines. Its tilt is not in DONKI, so it is modelled and labelled so. |
| SW29 | (C31.) What the coronagraph saw: SOHO LASCO's real images of the CME, through Helioviewer, credited "SOHO (ESA & NASA)", in a panel and on cards, beside its direction in 3D. A new connection, allowed in the site's security policy first and run under it. |
| SW30 | (C31.) Its arrival at the Earth: the front sweeping across the Earth's orbit with a countdown to CCMC's arrival time (SW21), and the magnetopause's nose pushed in as it arrives. |
| SW31 | (The owner, 2026-10-25, choosing how SW30 pushes the nose in: "Follow the moment".) The magnetopause and bow shock follow the shared cursor, as every layer does (D-E): at a paused moment, the wind NOAA measured reaching the bow shock then, from its 7 days of propagated wind; past the measurements, the last measured, pushed in by any CME CCMC's ENLIL has reaching the Earth by then, its sheath modelled and labelled so; before them, the earliest kept, said so. While live, the latest, as before. |

Mine (reversible):

| | Decision |
| --- | --- |
| SW10 | Each new look is a step of the quality governor, the most costly dropped first on a weak device (the curtain, the pulses, the particles); a card draws what its quality step draws. |
| SW11 | Model and forecast are said where they are drawn, on screen and on cards: the e-field is NOAA's empirical geoelectric model (EMTF) from magnetometers; the aurora is OVATION's forecast for its time; the field lines are T96 model output driven by the measured wind; the particles are a flow modelled from L1 measurements; ENLIL is a model forecast; a CME is DONKI's analysis. Credits: NOAA SWPC, NASA CCMC (DONKI), Tsyganenko's models via geopack (MIT). |
| SW12 | A feed is fetched only while something drawn needs it, at the cadence its settings say; the larger ones (the e-field grids, OVATION, the 1-minute solar wind) are measured against egress before their step ships. |
| SW13 | T96 is ported from geopack's Python (MIT, tsssss/geopack, with Tsyganenko's citation), tested against the Fortran's values its tests record, and traced in a worker. |
| SW14 | Build in the order below; each step ships, with failing tests first, mutations, goldens re-kept after looking, and a live look. |

## Build order

1. **The e-field, every sample:** the cap gone, the colour field and the
   flowing streaks, the fine settings (SW1, SW2).
2. **The e-field's other looks:** arrows, ripples, relief (SW1).
3. **The aurora:** OVATION, the band and the night curtain (SW3).
4. **T96:** the port, the dipole tilt and frames, the tracer in a worker, the live
   drivers (SW4, SW13).
5. **The magnetosphere's touches:** glowing lines and pulses, cusps and
   reconnection, the tail sheet, the Van Allen belts (SW5).
6. **The particles, carrying the real wind** (SW6, SW7).
7. **ENLIL on the timeline,** switchable with the particles (SW6, SW9).
8. **CMEs from DONKI** (SW8).
9. **The particles fade edge-on** (SW25). **Done 25 Oct (a9685f37).**
10. **The magnetopause and bow shock as contour lines** (SW26). **Done 25 Oct (a9685f37).**
11. **A CME as a plasma bubble** (SW27), in place of the translucent caps (SW23). **Done 25 Oct:** 2,600 particles a CME in its own cone, its front ragged and bright, a dim cavity, a warm core near the axis, a faint shock a little wider ahead, all growing with the drag-based front; large and faint so they blend into a glow; laid out by the CME's id and drifting on the moment drawn, so a card is the same picture; drawn out to 2 AU now nothing wraps.
12. **Its flux rope** (SW28). **Done 25 Oct:** GCS's croissant through each CME's cloud, its legs at the Sun at the cone's edges, its apex along the CME's direction with its outer edge just inside the bright front (aspect 0.32); six field lines wound twice round it from leg to leg, laid in the ecliptic, its tilt modelled and the key saying so. Each line a thread of soft points of light in the CME's speed colour, brightest at the apex and fading down its legs, with a slow shimmer on the moment drawn, placed and grown in the shader as the plasma is and faded near the Earth as it is. Drawn first as fat lines, which beaded at every joint (two round ends adding light twice) and, ten lines to a rope, buried the plasma and the Sun.
13. **Its arrival at the Earth** (SW30). **The sweep and the countdown done 25 Oct:** the arc of the Earth's orbit inside each CME's cone (the orbit as the Sun-Earth frame has it, 1 AU round the Sun through the Earth), a thread of light in its speed's colour lit as its front nears 1 AU from 0.8, brightest as it crosses, faded by 1.3 as the CME passes on; the whole arc at once, the cone model's front being at one distance across the cone. CCMC's arrival in the key and on a card counted down from the moment shown ("Earth 12 Oct 00:43Z, in 26 h"; minutes within the hour, days past two). **The nose, done 25 Oct (SW31):** the magnetopause and bow shock stand off from the wind for the moment shown (`boundaryWind.ts`): the ten minutes NOAA measured reaching the bow shock up to it, averaged; past the measurements the last, with the sheath of a CME CCMC has arriving by then modelled in (the wind at the CME's drag-based speed at the Earth, four times as dense, twice for a glancing blow, easing back over the day after, gone a day and a half on), labelled "pushed in (modelled)" and drawn fainter; before the 7 days the earliest kept. Waited for by cards, noted for clips sweeping the timeline, and a card's sources say which wind. The field lines, the near-Earth flow and the HUD's number are still for the wind now, as their notes say.
14. **What the coronagraph saw** (SW29).

## Step notes

### Step 1: the e-field, every sample (2026-10-10)

- `eFieldGrid.ts` lays both of NOAA's models on their shared 0.5° grid, every
  sample kept, the 3D model's value where both have one: on 2026-10-10's files,
  174 × 70 cells, 6,925 drawn (3,432 from InterMag, 3,493 from US-Canada where
  InterMag has none), where 500 dots had been. North is Ex and east is Ey, as
  NOAA's own netCDF attributes name them ("Ex (north component E-field)").
- `eFieldShell.ts` draws them as one colour field: a texture of the grid on a
  patch of the sphere, coloured on a log scale of mV/km (a new reading scale in
  the tokens, `DATA_SCALES.eFieldMvKm`, inferno from 0.1 mV/km to 3 V/km), with a
  thin line at each decade where the field is smooth enough to contour.
- `eFieldFlow.ts`, a sibling of the wind's flow, moves streaks along the field
  on the GPU, starting only where a model holds it, faster and longer where it
  is stronger; a still settles them from its moment.
- Seen on cards of a quiet day and corrected before shipping: a scale starting
  at 0.3 mV/km drew the continent near black; the decade lines, where the field
  changes by much of a decade between cells, widened into a grey wash; under the
  country fills, even Quiet's, the field read as grey; and bright, dense streaks
  read as hatching. The scale now starts at 0.1, the lines fade where the field
  is rough, the field rides the territories' shell and draws just after the
  fills (order 96), and the streaks are lighter.
- The settings (SW2), in the Space Weather panel: the look (streaks; the other
  three come in step 2), the scale (absolute or relative), the streaks' pace and
  number, which models are fetched (the panel's dataset toggles, both off
  drawing nothing), and how often (every 5, 15 or 30 minutes, or once). The
  sampling controls (top-N, cap, grid bins, floor) are gone: they cut the dots,
  which are gone.
- Found: every part of the page that read these settings held its own copy, so
  a change in a settings panel reached the globe only after a reload, for every
  space-weather and Earth-weather setting; and a change made within half a
  second of a panel closing was never saved. One shared store now serves every
  reader, and the last to leave writes the pending save.
- whenReady waits for the field while it is on; the card's sources say what the
  field is (NOAA's model from magnetometers, nothing drawn where it does not
  reach) and that the streaks are sped up; its key names the decades and the
  streak. The layer's marker styles no longer apply: it has no marks.

### Step 2: the e-field's other looks (2026-10-10)

- All in the colour field's own shader, so each look is one mesh: **arrows**,
  drawn by distance on a grid of cells a degree and a half apart, each pointing
  the way the field at its cell's centre points, longer where stronger, crisp at
  any zoom; **ripples**, crests across the field running the way it points,
  faster where stronger, the clock live and a still's own moment on a card; and
  **relief**, the patch raised along the radius by the strength on the colours'
  log scale (up to 3% of the radius, about 190 km, to be seen) and coloured by
  the way the field points, on a new wheel in the tokens
  (`DATA_SCALES.eFieldDirection`: toward north magenta, east amber, south green,
  west indigo; no cyan).
- The key says what each draws (an arrow, a ripple, or the relief's four
  directions), and a card's sources say the ripples are sped up and the
  relief's height is its strength on a log scale, raised to be seen.
- Seen on cards and corrected before shipping: ripples close and thin blended
  into a pale wash at a continent's zoom; spaced out, they vanished, faded where
  the field's direction turns from cell to cell; drawn across the whole map, a
  crest turned with every small turn of the field. They are drawn as flow tiles
  now: each tile of three degrees draws crests across its own broad flow (five
  samples two cells apart), measured from its own centre, and the four tiles
  round a place are blended by nearness.
- 10 mutations, all killed.

### Step 3: the aurora from OVATION (2026-10-10)

- `ovation.ts` reads NOAA's file as it states itself ("[Longitude, Latitude,
  Aurora]", 65,160 cells, its observation and forecast times) and refuses one
  in any other form rather than draw an aurora in the wrong places. Each
  hemisphere's oval is, at each longitude, the middle of its band weighted by
  the chance there, and its strongest chance.
- `aurora.ts` draws two things from it, both hemispheres. **The band**: the
  chance on the ground from 30° of latitude to each pole, each texel already in
  the key's colour for its chance and glowing by it, with a halo from a coarser
  mip. **The curtain**: on the night side only, a ribbon from about 100 km up
  at the oval's middle, from 75 to 290 km tall by the chance, flickering in
  rays, in the chance's colour; its top turns toward the key's strongest where
  the chance is better than even, as a strong aurora's red top does.
- Its key names the forecast's moment and the chances 10, 30, 50 and 90%;
  whenReady waits for the forecast; a card's sources say the aurora is
  OVATION's forecast and the curtain is drawn to show it, its height standing
  for the chance. A still lights the curtains for its own moment and holds
  their rays there.
- The Kp model's near-circle stands in only while OVATION cannot be read, and
  the card says so.
- Found: the engine's boundary poller built and announced all four boundaries
  whenever the layer was on, and the globe attached what was announced, so the
  Kp ring and the Kp shell were drawn under OVATION's aurora with their
  switches off. The engine now draws only the boundaries switched on, keeping
  the rest ready; one definition (`engineOverlays.ts`, tested) says which are
  asked for.
- Seen on cards and corrected before shipping: the band looked its colour up
  at twice its chance (25% drawn in the key's 50%), and the curtain took its
  colour from its strength, so a strong one drew pale, almost white. The
  colours are worked out in code now, where the tests reach them, not in the
  shaders.
- The settings (SW2): the panel's new Aurora group draws the band with its
  curtain, the band alone, or none; the sub-rail's aurora popup, which said
  controls "will appear here", offers the same three. The e-field files and
  OVATION are fetched at one cadence, and the panel's Fetch control says so.
- SW10: the curtain is two ribbons of 720 triangles and the band two caps of
  21,600; neither is worth dropping on a weak device, so the governor leaves
  them.
- SW12: OVATION is 0.92 MB, 144 KB as NOAA sends it gzipped, fetched from NOAA
  directly; no starcom.app egress.
- Found: the sub-rail's e-field popup still offered the dots' settings (vector
  scale, sampling, normalization), and its magnetosphere panel an "enhanced
  sampling" switch, none with anything left to act on.

### After step 3 (2026-10-10)

- SW15: the aurora on by default, and a one-time migration of saved settings
  (version 3) turning it on; one turned off since stays off.
- The e-field popup offers the panel's settings, from one list both read
  (`eFieldChoices.ts`): the look, the colours, the streaks, NOAA's two models,
  and the fetch. The dots' settings and the magnetosphere panel's sampling
  switch are gone.

### Step 4: T96 field lines (2026-10-10)

- **The port** (`services/spaceWeather/geopack/`, SW13). `t96.ts` is
  geopack's t96.py (tsssss/geopack at ab7efdc8, MIT, its notice carried)
  machine-translated by a script and not edited by hand; it matches t96.py to
  a millionth of the field at 330 places and conditions, 135 inside the
  boundary layer where it blends the field inside with the IMF outside (the
  reference file is t96.py's own output), and the Fortran's recorded value to
  0.002 nT. Its Bessel
  functions are Abramowitz and Stegun's. `geopack.ts` is ported by hand: the
  Sun, the dipole's tilt and the GEO-GSM turn for a moment, IGRF-14 (from
  NOAA's coefficient file, read as 32-bit numbers as geopack and the Fortran
  read them) and the dipole, and Tsyganenko's TRACE and STEP; checked against
  the values geopack's tests record (the tilt to 1e-8, recorded with an earlier
  geopack and IGRF). The tracer is the Fortran's, not the Python's: the Python
  forgets the step size between steps, and a line reaching the ground ends
  inside it, not at it. Its footpoint is 1.5e-6 Re from geopack's Python and
  3.7e-6 Re from the IDL DLM's.
- **The drivers** (`t96Drivers.ts`): the dynamic pressure and the IMF's By and
  Bz from NOAA's propagated 1-hour wind; each held within the range T96 was
  fitted to (0.5-10 nPa, Dst -100 to +20 nT, By and Bz +/-10 nT) and said so on
  cards. On 2026-10-10 at 18:00Z the wind was 830 km/s at 16.7 cm-3, a pressure
  of 22 nPa, and By -16 nT: both were held.
- **Dst, estimated** (`dstEstimate.ts`). Kyoto, whose quick-look Dst NOAA
  relays, asks to be contacted before quick-look data is used in publications,
  and allows no commercial use of its indices; a card is a publication. The
  owner (2026-10-10): a better arrangement to be brainstormed later (Mecha
  Jono and the Beu pulling such data and posting it to the network); until
  then, the estimate. O'Brien and McPherron's model (2000), run a minute a step
  over NOAA's real-time wind of the last day, each minute timed for when it
  reaches the Earth. On 2026-10-10 it stayed within 2-6 nT of Kyoto's quick-look
  values through the quiet hours, caught the storm's sudden commencement in
  the right hour (+11 against +29), and ran deeper in the main phase's first
  hours (-50 against -8). USGS's real-time Dst service answered with no values.
- **The lines** (`fieldLines.ts`): footpoints at magnetic latitudes 60-81
  degrees every 3, and every 2 hours of magnetic local time, both hemispheres
  (or 4 by 8 for "few"); traced in a worker (`fieldLines.worker.ts`; the page's
  thread where a worker cannot be made) for the moment the globe shows, to the
  quarter hour; closed lines once, from the north. About 130 lines take under a
  second. Drawn in the globe's own frame, GSM's x within a tenth of a degree of
  the Sun the globe is lit by: closed in periwinkle, open in coral
  (`DATA_SCALES.fieldLines`; not cyan), 1 px lines for now (tubes and pulses
  are step 5).
- The key names the colours and the moment traced for; whenReady waits for the
  lines; a card's sources name the model, its drivers, any driver held, and any
  feed quiet values stood in for. Credits: NOAA SWPC, T96 via geopack, IGRF-14.
- Settings: the panel's Field lines group (Many, Few, Off) and the sub-rail's
  magnetosphere popup, which offered "Future: model selection", offer the same.
  Many is the default.
- Seen on the build: from 40 Re the day side's closed lines are pressed in
  against the wind and the night side's drawn out into the tail, the open lines
  sweeping back from the polar caps. A card frames the globe at its own
  distance, so it shows the lines near the Earth only.
- Found and fixed: a "Space Weather Layers" box of the engine's boundary
  diagnostics showed on the live site, over the corner's clock, calling layers
  switched off "missing" and OVATION's aurora missing; it shows in development
  only now.

### Step 5a: the field lines glowing, with pulses (2026-10-10)

- `fieldLineGlow.ts` draws each kind of line as one batch of screen-space
  lines (three's LineSegments2, as the borders and cables are), 3 px wide at
  any distance, bright at the middle and fading to the edges, as added light:
  thin 1 px lines read as wire, and world-sized tubes would thin to nothing
  from 40 Re out.
- Pulses of light run along each line from its footpoint, a comet's sharp
  front and fading tail, at 3 Re a second for a 400 km/s wind and in
  proportion to it: on 2026-10-10's 750-800 km/s wind, about 6 Re a second.
  Each line starts at its own phase, fixed by where it starts so a re-trace
  keeps it. A still places them for its own moment. The key says pulses run at
  a pace set by the solar wind; a card's sources say they show its pace, sped
  up.
- Seen on the build and corrected: some 130 lines meet at the polar caps, and
  their added light burned to white there, colour lost. Each line now dims
  near the ground, to a fifth at the surface, full from 2.5 Re.
- 7 mutations, all killed.

### Step 5b: the Van Allen belts (2026-10-10)

- `vanAllenBelts.ts` draws the belts as light marched through a sphere 7.5 Re
  round the Earth, a pixel's ray at a time, stopping at the ground: the outer
  belt, of electrons, near L 4.5, and the inner, of protons, near L 1.6, in a
  dipole's shape (a point's shell L = r / cos²λ and its magnetic latitude say
  how full the belt is there), round the dipole's axis for the hour shown
  (geopack's recalc now gives it: 80.8°N 72.6°W for 2025, as IGRF-14 has
  it). Violet and gold (`DATA_SCALES.vanAllen`; not cyan).
- The outer belt is brightened by the flux of ≥2 MeV electrons GOES measures
  at geostationary orbit, its outer edge (NOAA SWPC, a reading every five
  minutes, 3.8 KB a day gzipped), on a log scale from a glimmer at 10 pfu to
  full at 10,000; on 2026-10-10 GOES-19 read 7 to 2,169 pfu. The inner belt has
  no live measure here and is drawn at a typical brightness, which a card
  says; when GOES cannot be read, the outer belt is too.
- From inside the outer belt, where the default view's camera is, the glow
  would fog the globe, so it fades in as the camera draws back past 3 Re, full
  from 8: unseen on a card, which frames the globe close.
- Fewer steps a pixel as the quality governor steps down (48, 32, 16): SW10.
- Found: a note on a source's entry is shown only while that source can be in
  the picture, so the Kp model's note, carried on OVATION's entry while
  OVATION failed, was never shown. Space Weather's entries are made in
  `spaceWeatherFeeds.ts` now, tested, and a drawing that stands in for a
  failed source (the Kp aurora, the belts at a typical brightness) has an
  entry of its own.
- Settings: Belts in the panel's new Magnetosphere group, and in the
  magnetosphere popup. 10 mutations, all killed.

### Step 5c: the cusps, and reconnection on the day side (2026-10-10)

- `cusps.ts` finds each cusp from T96 itself: at local noon, bisecting
  magnetic latitude between the last line that closes and the first that
  opens (nine traces a hemisphere), so it moves with the wind, equatorward
  when the IMF turns south. Fifteen lines are traced round each, out to their
  highest point or 14 Re, and turned round so their pulses run down from
  space to the ground: the solar wind's particles reaching the atmosphere.
  Traced in the field lines' worker (a second kind of job), drawn 4 px in rose
  (`DATA_SCALES.cusps`).
- While the measured IMF points south, bursts of light flash on the
  magnetopause about T96's own nose (on the Sun-Earth line T96's boundary
  coordinate gives it as x0 + 0.08 am: 11.1 Re at 2 nPa, 8.8 at 10), every
  12 / (V·Bs) seconds (V·Bs in mV/m; 6 s at 2, never more often than 0.8 s),
  each 0.7 s, placed by a hash of its slot so a still makes the same picture.
  The key, and a card's sources, say they are an illustration; with the IMF
  north, that none are drawn.
- Seen on the build, from dusk at 12 Re: rose funnels over each pole's noon
  side, the north sweeping sunward, and a warm burst at the nose.
- The belts were made softer after a look from 6 Re, where they tinted the
  whole frame: fading in from 4 Re, full from 12, and dimmer.
- Golden: raver-night-story differed once (1.2% of pixels, along coastlines)
  in step 5b's run, and matched when run alone: a flake in that card, not
  space weather's, which no golden shows.
- Settings: Cusps in the Magnetosphere group and the popup. 11 mutations,
  all killed.

### Step 5d: the magnetotail's current sheet (2026-10-10)

- `tailSheet.ts` finds the sheet where T96's Bx turns from tailward (the
  southern lobe) to earthward (the northern), by bisection in z on a grid of
  the tail (x from -8 to -50 Re, y +/-16 Re, every 2), inside T96's own
  magnetopause (its boundary coordinate under 1.08), with T96 and the dipole;
  a column where it does not turn has no sheet. It bends with the tilt: +/-0.4
  rad bend it opposite ways, alike. The field 2.5 Re either side says how much
  current it carries; stronger near the Earth. Found in the field lines'
  worker (a third kind of job).
- `tailSheetMesh.ts` draws it as a translucent lilac surface
  (`DATA_SCALES.tailSheet`), brighter with that field (full from 30 nT), soft
  for two cells from any edge, with bands running across it dawn to dusk as
  the current flows: an illustration, which the key and a card's sources say.
- Seen on the build: at first too faint to find from above the night side or
  from dusk; made twice as bright and full at 30 nT, not 40. From dusk at
  40 Re it reads as a shimmering band through the tail's plane.
- Settings: Tail sheet in the Magnetosphere group and the popup. 10
  mutations, all killed.

Step 5 is done: the field lines glow and pulse, the belts, the cusps and the
day side's bursts, and the tail's sheet. Next in the order: step 6, the
particles carrying the real wind.

### Step 6a-6b: the solar wind from the Sun to the Earth, a hindcast (2026-10-10)

- The data (`heliosphere.ts`, SW16): NOAA's 7 days of propagated wind
  (`products/geospace/propagated-solar-wind.json`, a minute a row, 314 KB
  gzipped, read hourly). Each minute that reached the Earth at t with speed v
  left the Sun at t - 1 AU / v (ballistic), and the place on the Sun that sent
  it kept sending wind like it as the Sun turned (corotation, 14.18° a day):
  each minute is a source, its parcels at the hindcast moment out along a
  trailing spiral arm. Seven days cover about 92° of the Sun's longitude. The
  hindcast moment is the last arrival less a median parcel's time from the
  Sun, so the measurements fill the Sun-Earth stretch then: on 2026-10-10 at
  20:00Z, 6 Oct 15:00Z. Each source carries its speed, density, the IMF's
  polarity, and how unsteady the field was about it.
- Drawn (`heliosphereParticles.ts`): 36 particles a source, about 36,000,
  walked out along their arms on the GPU, sized by density, coloured by
  polarity (`DATA_SCALES.solarWind`: away gold, toward periwinkle), jittered
  by turbulence, the flow sped up (a day of flow every 6 s). Placed as the
  solar system is: the Sun-Earth frame aligned to the drawn Sun and the
  ecliptic's pole through the planets' own sky frame, distance compressed to
  sqrt(d · the Moon's), so the hindcast's Sun falls on the drawn Sun and a
  parcel arriving at the moment on the Earth.
- Seen on the build from 2,500 and 4,500 Re over the pole: a fan of gold
  particles curving out of the Sun along the spiral to the Earth, crossed by
  bands of the toward polarity. Drawn out to 2.2 AU, the compression wrapped
  the parcels past the Earth into a dome round it that hid the stream; drawn
  to 1.3 AU now. Faded within 90 Re of the Earth, where the near-Earth flow
  (step 6c) is drawn at its true scale.
- The key and a card's sources say it is a hindcast, as it was at its moment,
  its two assumptions, and its compressed scale. Settings: Sun-Earth in the
  panel's new Solar wind group, and the sub-rail's solar wind popup, which
  said "not yet implemented" and labelled the bow shock "Show Solar Wind": it
  offers the stream, and the bow shock by its name.
- 12 mutations, all killed.

### Step 6c: the solar wind streaming past the magnetosphere, now (2026-10-10)

- `nearEarthFlow.ts`: potential flow past a Rankine half-body, a uniform
  stream from the Sun and a point source at the Earth, its dividing surface
  standing off at T96's own magnetopause nose for the wind's pressure and
  opening to twice that down the tail, near T96's own tail. The real flow is
  slowed and heated behind the bow shock; this one is not, so the particles
  are brightened in the magnetosheath, between the bow shock (taken as the
  half-body 1.3 times as large) and the magnetopause. Six hundred streamlines
  from a disc 30 Re upstream, worked out once for each nose (to 0.3 Re), and
  five particles replayed along each: the same picture for the same moment.
- Drawn (`nearEarthFlowParticles.ts`) in GSM, the object's matrix carrying GSM
  into the scene as the field lines are, at the wind's measured speed sped up
  about 64 times (4 Re a second at 400 km/s), in the colour of the IMF's
  measured polarity (the drivers keep Bx now). Not the hindcast: the wind
  now, which the key and a card's sources say, with the flow's shape a model.
- Seen on the build: as dots the particles read as stars; as streaks back
  along their own streamlines, bright at the head, they read as the wind
  running past the Earth and parting round it.
- Settings: Near Earth in the Solar wind group, and Near the Earth (now) in
  the solar wind popup. 10 mutations, all killed.

Step 6 is done. Next in the order: step 7, ENLIL on the timeline.

### Step 7a: ENLIL read off NOAA's frames (2026-10-10)

- The data (`enlil.ts`, SW18): SWPC publishes the model run as a list of
  frames (`products/animations/enlil.json`, 169 hourly 960 × 600 JPEGs of
  about 98 KB, open to any page). Each frame's two discs, density above and
  speed below, are the ecliptic seen from the north out to 1.7 AU, the Earth on
  +x. Their places were measured on October's frames, and a frame of another
  size is refused, so a change of layout is an error, not a wrong picture.
- Each pixel is given the value of the nearest colour on the frame's own bar.
  The annotations are holes filled from their neighbours: the Sun and the
  Earth (known places), STEREO-A (the densest clump of salmon pixels near
  1 AU), the 1 AU circle, and any colour more than 48 from the bar.
- On the real frame of 10 Oct, the first reads went wrong twice. The density
  bar's top is near black, so black outlines read as its highest values; and
  the middle of all salmon pixels was pulled toward the Earth by JPEG fringes,
  missing STEREO-A's marker. The 1 AU circle is a darkened blend, not black,
  and read as a dip of about 1.5 per cm³ until all of it was left as a hole.
- Read now: 17 per cm³ at the Earth, inside a CME's sheath, and 2 a tenth of
  an AU sunward in the cavity behind it; 548 km/s at the Earth, against about
  570 on NOAA's own curve.
- 16 mutations, all killed (five after the synthetic frame was made more like
  SWPC's: marker fills and rings in colours the bar holds, JPEG noise, a stray
  above STEREO-A).

### Step 7b: ENLIL drawn, following the timeline (2026-10-10)

- Drawn (`enlilDisc.ts`, SW18): a glowing disc in the ecliptic round the drawn
  Sun, placed as the solar wind's particles are, so ENLIL's Earth sits on the
  globe. Density by default, speed switchable; each from a deep plum through
  rose to a pale gold (`DATA_SCALES.enlilDensity`, `enlilVelocity`), the quiet
  wind dim and see-through. It is faded inside the model's inner edge, at its
  outer edge, within about 120 Re of the Earth, and edge-on. Edge-on matters:
  from the globe's usual views the disc would otherwise be a band across the
  sky.
- Followed (`useGlobeEnlil.ts`, SW9): the two frames round the moment shown,
  blended, so the disc moves smoothly as the timeline does. The moment is the
  shared cursor's, or now while live, moved each minute. Frames are read one
  at a time and each once, a day of them kept; a frame the moment has already
  left is not read. Outside the run nothing is drawn, and the key says what
  the run covers. A card waits for the moment's frames, and a clip sweeping
  the timeline waits for each moment as it does for the weather.
- The key and a card's sources say it is the model's, read off NOAA's frames,
  a forecast when the moment is ahead; credited to NOAA SWPC WSA-ENLIL.
- Seen on the build. The first look drew the palette's top everywhere: the
  frame reader took the bitmap's size after closing it, which reads 0, so
  every lookup read the frame's corner. It is tested now with a bitmap that
  zeroes its size on close. After the fix, from 3,000 Re over the pole, the
  CME's arc glows rose and peach just ahead of the Earth, as on NOAA's frame.
  The arms were faint, and the palette's middle was lifted. In speed, the fast
  streams curl out of the Sun in rose. From the globe's usual view, none of
  the disc shows.
- Settings: ENLIL in the panel's Solar wind group, with Density and Speed under
  it; the same in the solar wind popup. The sub-rail's hints for Solar Wind,
  Magnetosphere, Radiation Belts and Aurora still said their overlays were to
  come; they say they are drawn now.
- 25 mutations, all killed (five after the tests were strengthened).

### Step 7c: the timeline reaching ahead (2026-10-10)

- A layer that forecasts publishes the last moment it has while it is shown
  (`services/globe/forecastReach.ts`); ENLIL publishes its run's last frame,
  about four days ahead. The scrubber's axis runs on to the farthest, the part
  past now hatched and its end date set apart, and a moment there can be
  chosen. The intel's range is left as it was: the timeline's steps are taken
  from it (D-E).
- At a moment ahead, ENLIL draws its forecast, and the key says "forecast for".
  The other layers draw what they held at the capture, and those that filter by
  time draw only what falls in the window: a window in the future holds no
  reports. SW19 said "every other layer its latest"; that is not true of the
  layers filtered by time, so the card says what happens.
- A card says it once, first: "2d 0h ahead of now: forecasts show it; other
  layers what they held." Its sources are judged against the capture, not the
  moment: against the moment, every one would have been days "older than the
  moment shown". A clip sweeping past its recording judges each frame the same
  way, and its line about those hours names every layer that forecasts, where
  it named only a weather model's.
- Seen on the build: the scrubber runs to 14 Oct, hatched from now; a card two
  days ahead keys "ENLIL, forecast for 12 Oct 22:27Z" and opens its notes with
  the line above. Probe `.local/scripts/sw7c-forecast-check.mjs`.
- 12 mutations, all killed.

Step 7 is done. Next in the order: step 8, CMEs from DONKI.

### Step 8: CMEs from DONKI (2026-10-10)

- The data (`donki.ts`, SW8, SW21): DONKI's `CME` records, open to any page.
  Each CME comes from its most accurate cone-model analysis: direction
  (Stonyhurst latitude, taken as ecliptic latitude, which is within 7.25°),
  half-width, and speed at 21.5 solar radii. Its arrival at the Earth comes
  from the latest WSA-ENLIL run CCMC made of it: an arrival with its
  glancing-blow flag, no arrival, or no run. The twelve days before the moment
  are read, hourly while live. On 10 Oct, 31 CMEs were read, 22 in flight, and
  six had a modelled Earth arrival.
- Moved (SW20): the drag-based model's closed form (Vršnak et al. 2013) with its
  usual γ, 0.2 × 10⁻⁷ per km, and surrounding wind, 400 km/s. Tested against
  its own equation stepped a minute at a time.
- Measured against CCMC's arrivals for those six: the drawn fronts reach 1 AU
  1 to 35 h after ENLIL's estimate, 13 h on average. A surrounding wind of
  about 650 km/s would bring them within 3 h. The wind measured at L1 during
  each flight did no better (13.5 h): the fast stream they travelled in only
  reached L1 on 10 Oct. So the model keeps its usual values; the arrival
  stated is CCMC's, and the card says it is not the drawn front's. Pacing
  each shell to CCMC's arrival is the owner's to choose instead.
- Drawn (`cmeShells.ts`, SW23): a cone-model cap at each front, faint body,
  glowing rim, coloured by speed (`DATA_SCALES.cmeSpeedKmS`, pale lilac to hot
  red), the rim widened and whitened when the Earth lies in the cone. Slow
  CMEs are drawn dimmer. Placed as the solar system is, worked out in the
  vertex shader.
- Seen on the build, the first look was unreadable: 22 shells, those past the
  Earth's orbit wrapped by the compression into domes round the Earth, and
  their additive overlap burning the view white. The shells now fade out
  between 1.1 and 1.35 AU, as the particles stop at 1.3. A CME still counts
  as in flight to 2 AU in the key and on a card (SW22). The body and rim are
  far fainter. Seen again: translucent bubbles leaving the Sun, the
  Earth-directed ones outlined.
- The key in one line on a card: the speed scale's ends, and a ring for each
  arrival still to come by CCMC's ENLIL, each time once. The first key, a
  line per CME, made Space Weather's wide card refuse to compose, and it also
  listed arrivals already past. A card's note gives the arrivals still to
  come.
- Settings: CMEs in the panel's Solar wind group, and CMEs (NASA DONKI) in
  the solar wind popup. Credited NASA CCMC DONKI. Probe
  `.local/scripts/sw8-cmes-check.mjs`.
- 28 mutations, all killed (two after the tests were strengthened).

Step 8 is done, and with it the build order.

### After step 8: shells paced to CCMC's arrival (2026-10-10)

- SW24: a CME with an Earth arrival from CCMC's ENLIL is paced to reach the
  Earth (1 AU) then. Its measured speed is kept, and the surrounding wind, the
  model's least certain value, is fitted to the arrival between 250 and 1,000
  km/s. Where no wind in that range would get it there, the usual model's time
  is stretched to the arrival instead.
- On 10 Oct's six CMEs with an arrival, the fitted winds came out at 410 to
  753 km/s, in the fast stream they crossed, and every front reaches 1 AU at
  CCMC's time. A card's note says so. 8 mutations, all killed.
