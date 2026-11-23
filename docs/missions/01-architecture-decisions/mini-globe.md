# Decision D-MG — the mini-globe

**Status:** started 2026-10-11. MG1–MG3 decided by the owner the same day;
the build follows the plan below.

The owner asked on 2026-10-10, for later, that the mini-globe in the top-left
corner (`TinyGlobe`) look alive and true:

1. a slow, repeating 360° turn: its camera orbiting the planet, in Earth's own
   direction of turning;
2. its day and night lit by the real Sun for the time of day;
3. no more grid-line sphere, which "seems dead": if that is a waiting state,
   say so with an animation, at least a fade in and out.

## What it is today (read from the code, 2026-10-11)

- An orientation minimap: a second react-globe.gl globe, 110 px, with its own
  `GlobeEngine`, a white dot where the main globe's camera points
  (`GlobeCameraTelemetry`), the alerts overlay's points, and click-to-fly: a
  click asks the main globe to fly there. Its own orbit controls are off.
- The grid-line sphere is its still: a circle, a meridian and an equator in SVG.
  It shows until `useMinimapLive` allows a draw and the engine's material has
  loaded: until the main globe has loaded and the quality governor has settled,
  then until the browser is next idle; and for good on a device the governor
  steps down. That gate is block B4's (2026-10-01): a second WebGL context
  froze the page 2.6–7 s on a machine that draws in software.
- Its material is the main globe's skin, built by its own engine, and nothing
  aims its Sun: the shader skins keep `sunDirection` at its default, and the
  Phong skins are lit by react-globe.gl's fixed lights, straight above the
  north pole.
- It faces a focused place at that place's longitude plus 90°, the offset the
  scene's two frames differ by (globeCoordinates.ts). To be checked on a
  rendered minimap before the orbit drives it.

## Decisions

| # | Decision |
|---|---|
| MG1 | (2026-10-11.) WebGL where the device is strong, as now; where the quality governor steps it down, a 2D canvas drawn from the same day and night textures, so no device keeps the grid sphere. |
| MG2 | (2026-10-11.) It orbits. When the main globe's camera moves, it turns to face the new view, holds it about 8 s with the dot in the middle, then orbits on from there. Hovering pauses it, so a click lands where it was aimed. |
| MG3 | (2026-10-11.) One turn every 90 s, about 4° a second; the planet seems to turn west to east, as Earth does, while day and night stay where the real Sun puts them. |

Taken as defaults, for the owner to change:

- MG4. The Sun is placed for the main globe's moment (`sunMomentFor`): now while
  the timeline is live, the paused moment otherwise, so the two globes are lit
  alike. The minimap is always sunlit, whatever light mode the main globe uses.
- MG5. With reduced motion asked for, it does not orbit: it faces the main view,
  as it does today.
- MG6. Until its first frame is drawn it shows the still, breathing (a slow fade
  in and out), and the first frame fades in over it. The 2D canvas fetches its
  textures only after the main globe has loaded, so a first visit costs no more.
- MG7. While it orbits it keeps the latitude of the view it last faced.

## Build plan

1. **The orbit** (MG2, MG3, MG5, MG7): a pure model of where the minimap's camera
   is at a moment: orbiting, turning to the main view, holding it, paused.
   Failing tests first.
2. **The Sun on the WebGL minimap** (MG4): its material lit by `applyLighting`
   and a light rig of its own, aimed for the main globe's moment. The 90° offset
   checked on a rendered minimap, and corrected if it is wrong.
3. **The orbit drives it**: the WebGL camera follows the model each frame; the
   dot, hover pause and click-to-fly kept exact.
4. **The 2D canvas** (MG1): an orthographic projection of the day and night
   textures, shaded per pixel by the same Sun, with the dot, a rim and
   click-to-fly; drawn where the governor steps the device down.
5. **Waiting** (MG6): the breathing still and the fade-in, on both paths.
6. **Seen**: both paths rendered headless and looked at, then pushed and checked
   on starcom.app.

## Step notes

### Step 1: the orbit (2026-10-11)

- `minimapOrbit.ts`, pure, on the clock it is given. The camera's longitude
  falls 4° a second, so the planet seems to turn eastward under it as Earth
  does. A turn to the main view takes 1.2 s, the shorter way round, eased; a
  view that moved less than 1° is not turned to. Hovering freezes it and every
  motion's clock with it; a view the main globe moved to while hovered (a
  click-to-fly) is turned to once the pointer leaves. Before any view it orbits
  from 20°N 0°E.
- 9 tests; mutations to the direction, the hover's clock and the short way
  round each failed one.

### Steps 2–3: the Sun, and the orbit drives it (2026-10-11)

- Lit as the main globe is: `applyLighting` on its material for the shader
  skins, a light rig of its own through react-globe.gl's `lights()` for the
  Phong skin, aimed for `sunMomentFor` the main globe's moment, refreshed each
  minute while live. Seen headless at 10:30Z: North America in night with its
  city lights, dawn across South America.
- The 90° offset was wrong, as suspected: with the camera at the main view's
  own longitude, a main view at 5°N 20°E shows Africa in the middle. The old
  focus effect faced 90° east of any focused place. It is gone: a focused
  place reaches the minimap as the main view, once the main globe flies there.
- The marker stood 0.6 radii tall with react-globe.gl's default radius: a
  point a few pixels wide face on and a spike off the rim edge on. It lies flat
  now, 2.2° across, in GUNMETAL[100] (one colour literal fewer), with a ring
  that swells from it every 1.6 s, none with reduced motion.

### Steps 4–5: drawn flat, and waiting (2026-10-11)

- `useMinimapLive` says `flat` where the governor has stepped the device down
  and the main globe is up, after the browser is next idle, and `live` (WebGL)
  only at full detail, as before; WebGL given up on a later step down is drawn
  flat instead.
- `minimapPixels.ts`, pure: each pixel a ray from 3 radii through a 50° lens,
  as react-globe.gl's camera sees the minimap, so the disc is 0.38 of the
  canvas and the limb falls where the WebGL one's does; each skin shaded as its
  shader (Cyber Earth's land, coasts, graticule, amber city lights and rim;
  Terrain's greys; Day and night; Blue Marble as three.js lights Phong, by the
  Sun at 2.4 and the night's ambient), in linear light from sRGB textures and
  raw masks, without the bump relief. Click-to-fly is the same ray, inverted.
- `MinimapCanvas.tsx` reads the skin's textures from the globe's own files at
  512 × 256 when idle, works the planet's pixels out again only when the pose
  or the Sun has moved and at most every 140 ms (the surface moves about 3 px a
  second), and puts the glow, the points and the ring over it each frame.
- Seen side by side with the WebGL minimap at the same pose and moment: Cyber
  Earth nearly identical; Blue Marble close, its night side's marker brighter
  flat, where react-globe.gl lights its points. The glow and the marker's size
  were matched to the WebGL ones as measured (a point drawn 1.8 times its
  radius in degrees).
- Waiting (MG6): the still breathes, a 2.4 s fade in and out, and its meridian
  turns; each minimap fades in over it once its first frame is drawn. Neither
  moves with reduced motion.

### Live, and the marker at night (2026-10-11)

- Steps 1–5 live 085eb124, both paths seen on starcom.app: the WebGL minimap at
  High and the flat one at Low, each facing the main view, then orbiting on.
- Seen there: at night the WebGL marker all but vanished, as react-globe.gl
  lights its points. It is an unlit disc of its own now (a custom layer), as
  wide as the point was, bright by night as the 2D minimap's is.

