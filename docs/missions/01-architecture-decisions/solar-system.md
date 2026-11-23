# The solar system at true sizes, with bloom (decision K6)

Decided by the owner on 2026-10-01 (critique audit, K6) and in detail on
2026-10-07, as item 3 of block G. Zoomed out, the globe's solar system drew a
Sun smaller than Jupiter, a Moon bigger than Mercury and four times farther from
the Earth than the Sun, and a Sun in the wrong part of the sky. This record holds
what was measured, what was decided and why, and the build order.

## What was there (measured 2026-10-07)

- **Three scales.** The Earth is the 100-unit globe. The Sun is drawn at 0.3–0.5%
  of true size, 33–55 units, always smaller than the Earth; the planets at half
  true size (`(km / 6371) × 50`, Jupiter 549 units); the Moon at true size, 27
  units (`SolarSunManager.ts`, `Planet.ts`, `Moon.ts`).
- **Three distances.** The Moon at its true distance, about 6,000 units; the
  planets at 1,400 units per AU, 1/1677 of true; the Sun at 7,036 units near the
  Earth and 1,400 farther out. So zoomed out, the Moon sat farther than the Sun.
- **Two frames, neither the globe's.** The globe and its light are Earth-fixed:
  the light comes from the real subsolar point. The drawn Sun was placed in the
  globe mesh's local frame near the Earth, 90° east of the subsolar point, and in
  the ecliptic frame farther out, tilted 23.4° from the globe's axis. The planets
  and the Moon were lit by the globe's light, not by the Sun they were drawn
  beside.
- **Wall-clock time.** Bodies moved by `new Date()`, not the timeline's moment,
  and captures did not hold them still.
- **No glow.** The Sun was a flat orange sphere; there was no bloom pass or lens
  flare anywhere, and its corona shader banded along the sphere's seam.
- **Four tiers** switched what was drawn by the camera's distance, with no
  transition; the solar system was drawn only in EcoNatural, and in CyberCommand
  outside Intel Reports.

## Decisions (K6, SS1–SS4)

| # | Question | Decision |
|---|---|---|
| K6 | How the bodies are sized (owner, 2026-10-01) | **True sizes and bloom.** One scale for every body, with distances compressed the same way for all. The Sun gets a surface, a corona, a lens flare and a bloom pass, and bloom is the first thing the quality governor drops. |
| SS1 | How distances are compressed (owner, 2026-10-07: "use your best judgement for what is true-to-scale and best UX while still being accurate physically/astronomically") | **The Earth and Moon exactly to scale, every farther distance compressed by one square-root rule, measured from the Earth.** A body's drawn distance is the geometric mean of its true distance and the Moon's mean distance, `sqrt(d × d_moon)`: the Moon stays where it is, the Sun comes to 1,190 Earth radii instead of 23,481, Neptune to about 6,500 instead of about 704,000, and spacing still grows outward as it does in the real system. Directions are exact, so every body is where it really is in the Earth's sky: the drawn Sun is where the daylight comes from. Compressing around the Sun instead would keep the orbits circles but put the planets in the wrong places in our sky. With true sizes, any compression that fits on a screen makes the Sun look larger from the Earth than it is: about 10° across instead of half a degree. That is stated, not hidden. |
| SS1 amended (C32) | The orbits look "modulated by Earth" (the owner's critique, 2026-10-16; the owner chose, 2026-10-24) | **One scale for every distance but the Moon's.** The square root squeezed far points more than near ones, measured from the Earth, so an inner planet's ellipse round the Sun was drawn as an Earth-centred egg. Now every body but the Moon, every orbit line, and the solar wind's particles, CME shells and ENLIL disc are drawn at one scale about the Earth, `DRAWN_UNITS_PER_AU` (about 119,000 units, where the Sun has always stood, since the two rules agree at 1 AU): every orbit its true shape, each planet on its line, every direction exact. The Moon keeps its true distance. Neptune moves out from about 666,000 units to about 3.7 million, so the camera's reach goes to 9 million and its far plane to 12.8 million; from the farthest reach the inner system is a few dozen pixels across and the Sun's name keeps its place over the Earth's (the Earth is named from about 2.5 million units in). |
| SS2 | What glows (owner, 2026-10-07) | **The Sun only.** A selective bloom on the Sun, its corona and its flares; the globe, its marks and every word stay crisp. Cards and clips render through it. Dropped first by the quality governor, so a card at Low (the golden cards) is unchanged. |
| SS3 | Where zooming out shows the solar system (owner, 2026-10-07) | **Every mode.** Nothing is drawn while the Earth fills the view, so close-up work costs nothing. |
| SS4 | Which frame and which moment | **The globe's frame and the timeline's moment** (no decision needed: anything else is wrong). Bodies are placed for the moment shown (decision D-E's one cursor), held still in a capture like the globe's light, and turned from the ecliptic into the Earth-fixed frame by the Earth's rotation and its tilt, so the drawn Sun and the subsolar light agree. |
| SS5 | How a person finds the Sun when it is behind the camera (owner, 2026-10-07) | **Edge pointers.** A small arrow at the edge of the view pointing to the Sun, and to any named body off screen. The camera never moves on its own; flying to a body belongs to the viewing experiences. |

## Build order

1. **One frame and one moment** (SS4): bodies in the globe's Earth-fixed frame for
   the timeline's moment; the drawn Sun within 0.05° of the light's direction;
   bodies held still in captures.
2. **One scale** (K6, SS1): true sizes for every body, the compression for every
   distance and orbit line, the camera's far reach and depth range to match, the
   tiers retired, the solar system drawn in every mode (SS3).
3. **Lit by the Sun:** the planets and the Moon lit from the Sun's position, so
   the Moon shows its phase and Venus its crescent.
4. **Finding small bodies:** a marker and a name for each body too small to see on
   screen, fading as it grows, so the outer planets can be found.
5. **The Sun** (K6, SS2): a surface, a corona that faces the viewer, a lens flare,
   and the selective bloom through globe.gl's composer, captures included; the
   governor drops bloom first.

## Step notes

### Steps 1 and 2: one frame, one moment, one scale (2026-10-07)

- **One turn for everything** (`src/solar-system/bodyPlacement.ts`). `skyFrame(at)`
  turns astronomy-engine's J2000 equator onto the equator of date and then round the
  axis by the Earth's rotation, the same GMST the light uses. Every body and every
  orbit line goes through it. The drawn Sun sits on the light's own direction; the
  planets' route finds the Sun within 0.009° of it over fourteen months.
- **Sizes.** One scale: the Sun 10,920 units, Jupiter 1,097, Mars 53, the Moon 27.
- **Distances** by SS1 as amended for C32, orbit lines included: each line is the planet's real path
  round the Sun, measured from the Earth for the moment and drawn at the same one scale,
  so the planet sits on its line and the line keeps its true shape. A line fades in as the camera backs out past
  it: none until half its farthest point from the Earth, all of it at twice that,
  where the whole orbit is in view. The Moon's comes in between about 3,100 and
  12,400 units out, Neptune's between 333,000 and 1.33 million.
- **The moment.** A capture's still moment, else the timeline's paused moment, else
  now: the moment the light is for. A paused moment is held exactly; a live one is
  placed again each second, in which the Sun moves about nine units of its 119,000.
- **How much is drawn.** The solar system fades in exactly as the Earth's marks fade
  out (block G, item 1): none of it while the Earth's radius on screen is 120 pixels
  or more, all of it at 40. In a 900-pixel-tall view that is between about 810 and
  2,400 units from the Earth's centre. While none of it shows, nothing is drawn and
  nothing is placed. Bodies are see-through only while fading.
- **Every mode** (SS3): the globe mounts it without a mode condition.
- **Reach.** globe.gl stopped the camera at 10,000 units, a hundred Earth radii, and
  drew nothing past 125,000; the Sun is drawn at 119,000. The camera may now back out
  to 1.7 million (altitude 16,999), where everything within 700,000 of the Earth,
  Neptune at its farthest included, fits the default 50° view with more than a tenth
  to spare. The far plane is at 2.4 million. The near plane stays at 1 within 1,000
  units, so every view and card is unchanged, and beyond that is a thousandth of the
  camera's distance. All three are held at every render: the first build set the far
  plane once, and in the running app it was back at 125,000, set from globe.gl's sky
  radius by an update that landed later, so the Sun and every planet were cut away.
- **Control speeds.** globe.gl speeds the controls up with altitude at every move (a
  drag by altitude × 0.3, a wheel step by √altitude × 0.5). At the new reach that
  would turn the view more than five times round for one pixel dragged, and jump
  28-fold for one wheel step. A drag is capped from altitude 5 and the wheel from
  altitude 100, where the Earth is already small; every view nearer moves as before.
  From the default view to the farthest reach is about 58 wheel steps, none more
  than 1.29-fold.
- **Retired:** the four tiers and their size and distance tables; the transition
  config nothing read; the Sun's light, which production had turned off; the
  1,400-units-per-AU scale and the ecliptic-frame helpers; the local-frame Sun
  direction that put the Sun 90° from the light; and the swing of the camera toward
  the Sun on crossing a tier. That swing was keyed to the tiers and aimed with an
  ecliptic direction read as globe coordinates, so it pointed somewhere arbitrary.
  Whether anything should frame the Sun on the way out is in Open.
- **Left for later steps, as planned:** the planets and the Moon are still lit by the
  globe's parallel light (step 3). Each planet's pole and spin are not yet its own:
  Saturn's rings lie in the Earth's equator, 6.5° from their true plane (step 3,
  from astronomy-engine's `RotationAxis`). The solar activity visualizer's corona and
  flares are built 1 to 4 units across, inside even the old Sun, so they have never
  shown (step 5 replaces them). The Sun is a plain disc until step 5: its corona was a
  flat shell, which in the running build read as a dull grey ring over the dark page,
  so it is gone rather than kept.

### Step 3: lit by the Sun, turned on its own axis (2026-10-07)

- **Lit from where the Sun is, seen from each body** (`sunlitMaterial.ts`,
  `bodyPlacement.ts`'s `sunDirectionFrom`). A three.js light reaches every lit object
  in the scene alike, so the globe's one light, along the Sun's direction from the
  Earth, could not do it; each planet and the Moon now carries its own direction to
  the Sun, from its true place. Seen from the Earth, Venus goes from full to a thin
  crescent and the Moon through its phases, each within a hundredth of
  astronomy-engine's own lit fraction over eighteen months. A night side keeps 4% of
  its light: dark, not a hole in the sky.
- **Turned on its own axis** (`bodyTurn`): the IAU pole and spin, from
  astronomy-engine's `RotationAxis`. Jupiter's bands lie along its own equator,
  Saturn's rings in its equator, 6.5° from the Earth's, and the Moon keeps its near
  side to the Earth, within its libration.
- The bodies follow the Sun, not the globe's light setting: headlamp and flat light
  change how the Earth is lit, for working on it.
- The Moon's bump map (111 KB) is no longer fetched: the Moon is never more than a
  few dozen pixels across, where relief does not show.
- Seen in the running app, the camera just beyond each body: the Moon, Venus, Jupiter
  and Saturn lit on the side toward the Sun, Jupiter's bands and Saturn's rings tilted
  with their own equators. The production build was skipped for memory; nothing this
  step changes is drawn in a card.

### Step 4: finding the bodies too small to see (2026-10-07)

- **A marker and a name for each body** (`bodyLabels.ts`): the Sun, the Earth, the
  Moon and the seven planets. From the farthest reach Neptune is a twentieth of a
  pixel across; its marker is a ring in its own colour, 14 pixels at any distance,
  whole while its disc is at most 3 pixels in radius and gone by 8, where the body
  can be seen for itself. Its name sits beside the marker or the disc, 12-pixel IBM
  Plex Sans in the body text colour, edged dark so it reads over the Sun.
- **Names give way by rank** where they would overlap: the Sun, the Earth, the Moon,
  then Jupiter, Saturn, Venus, Mars, Mercury, Uranus and Neptune. From far out the
  Moon's name gives way to the Earth's and Mercury's to the Sun's; their markers stay.
- Drawn in the scene, over everything, at a fixed size on screen, faded with the
  solar system, so a card or clip that pulls back carries them; none of them shows in
  any card today.
- Seen in the running app: every planet marked and named from the farthest reach,
  the Sun's marker gone once its disc shows, its name beside the disc.

### Step 5, first part: how the Sun looks (2026-10-07)

- **A surface** (`sunAppearance.ts`): darker and redder toward the limb, as the real
  one is seen through cooler gas at its edge, mottled with slowly changing
  granulation, and drawn brighter than white, 1.6 in linear light, so the bloom of
  the second part can take what is brighter than white and get the Sun alone.
- **A corona that faces the viewer**: a square that always faces the camera, four
  radii from the centre to each side, its light falling off with the cube of the
  distance from the limb and broken into streamers, added to what is behind it
  without touching the canvas's transparency. It fades out as the camera reaches the
  surface.
- **A lens flare** (three.js's `Lensflare`), stood just in front of the surface toward
  the camera, since at the centre the Sun's own surface hid it. It is a camera's, so
  its strength goes with the light the disc throws on the lens, the square of its size
  on screen: whole from 60 pixels in radius, none from the farthest reach.
- Surface and corona hold still for a capture, at the phase of its moment (IM23).
- Seen in the running app: a bright disc with a warm corona and its streamers, faint
  flare ghosts along the line through the middle of the view near the Earth, and a
  small glow from the farthest reach.

### Step 5, second part: the glow (2026-10-07)

- **Bloom on the Sun alone** (`globe-engine/sunBloom.ts`): three.js's
  `UnrealBloomPass` with a threshold of 1, so only light brighter than white blooms,
  which on the globe is the Sun's surface and the inner edge of its corona. Every mark,
  line and name stays crisp.
- **On the composer globe.gl already draws through**, after its one pass, with the
  pass that turns linear light into the screen's colours. Both are switched on only
  while the Sun is drawn and the quality step keeps the glow. Off, the first pass
  renders straight to the screen as before, so every other view and every card is
  unchanged: all 12 golden cards match.
- **The background.** While the glow is on, the scene's background is the renderer's
  own clear colour. The first pass clears its buffer with the colour as last worked out
  for the screen; in the bloom's linear buffer that came out converted twice, and in the
  running app the dark navy behind everything turned bright indigo (blue 17 became 73).
  A scene background is worked out for the buffer it is drawn into.
- **Captures** render through the glow while it is on, and so does the live view drawn
  after them.
- **The quality governor drops it first**: a new top step, "no glow", between full
  detail and softer edges. It counts as a change only while the Sun is drawn; near the
  Earth dropping it would change nothing, and the trial would read the unchanged frame
  rate as a cap. Coming back up, auto returns to the most detail that draws the same,
  so the glow comes back with full detail. Low has no glow, so a card at Low is
  unchanged.
- No antialiasing inside the bloom's buffer: multisampling a half-float buffer at full
  detail would cost some 160 MB of graphics memory, for views where the Earth is a few
  pixels across.
- Seen in the running app at High: the Sun blooming warm, names and orbit lines crisp,
  the background unchanged.

K6 is built: every step of the build order is done.

### Edge pointers (SS5, 2026-10-07)

- A body off screen, or behind the camera, gets an arrow in its colour pointing its
  way, its name just inside (`bodyLabels.ts`'s `pointerAt`), from the camera's own
  right and up, so a body behind the camera is pointed to on the side it lies.
  Pointers give way by rank as names do.
- They stand a tenth of the view's width and an eighth of its height in from the edges.
  The globe's canvas runs under the app's rails and its timeline: in the running app,
  pointers 18 pixels in stood beneath them, the Sun's under the timeline.
- Seen in the running app from the day side at altitude 200: the Sun pointed to below,
  Venus below right, Mars, Jupiter and Uranus to the left.

## Open

- A way to fly out to the Sun or a planet without many zoom steps belongs to the
  viewing experiences (block G, item 6), not here. From the default view to the
  farthest reach is a factor of about 4,900, some 58 wheel steps.
- ~~Whether zooming out should turn the camera toward the Sun~~ — decided 2026-10-07
  (SS5, in Decisions): edge pointers, and the camera never moves on its own.
