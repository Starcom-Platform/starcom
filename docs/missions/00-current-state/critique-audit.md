# Critique audit — 2026-10-01

The owner's critiques of 2026-10-01, each checked against the code and, where marked,
against the running build. This records what was found on that date. To check whether
it still holds, re-read the files cited. Nothing here is a plan: the decisions it
raises are in the "Decisions" section at the end, and the plan they feed is
[intern-readiness-plan.md](../04-plan/intern-readiness-plan.md).

How each finding was reached is marked:

- **code**: read in the source, not yet seen in the app;
- **app**: seen in the production build (`vite preview`) in headless Chromium;
- **api**: a live request to the provider.

---

## 1. Globe

### 1.0 Which layers draw (app)

`npm run audit:layers` was run on the production build of `e14449a2`, as a first visit
with relays read-only, at 2026-10-01 22:20Z. It took three views per layer.

| Layer | Drew | Note |
|---|---|---|
| Intel Reports | yes | Its mode's floor, so it has no count. The card shows document glyphs piled on top of one another over the US. |
| Cyber Threats | 249–462 marks | 150 of 96,088 listed addresses, sampled |
| Satellites | 257–476 marks over the floor | Only about 20 satellites are visible in a view. GPS is in the key and never seen. |
| Comm Hubs | 39–150 | |
| RLSH | 209–451 | |
| Diplomacy | yes | Its mode's floor |
| Resources | 174–418 | |
| Conflict Zones | 147–390 | Large overlapping discs (see 11) |
| Space Weather | 6–124 | The field data covers the US only, so most views show a few dots at the edge |
| Eco Disasters | 48–192 | |
| **Earth Weather** | **nothing** | Open-Meteo answered 503. The card says so, and says it is not an all-clear. Only a tracked iceberg is left. |
| Drug-check alerts | 2–4 | |
| **Scene incidents** | **nothing** | Its only note names no place (see 10) |
| Scene events, Heat risk, Raver missions, Harm-reduction sites | nothing | Declared as not built |

So the globe's own layers mostly work. What fails is upstream (Open-Meteo), Raver
Watch, which has nothing with a place, and the four Raver Watch layers not yet built.
What is still unseen: whether the Diplomacy and Conflict tooltips appear on hover
(see 11).

### 1.1 Territories overlay — the renderer is the same; its look changed three times (code)

The renderer was never replaced. It is `useNationalTerritories3D`
(`src/components/Globe/Globe.tsx`) with `NationalTerritoriesService` and the baked
meshes in `public/geopolitical/territories-baked/lod{0,1,2}`. What changed is how it
looks:

| Commit | Date | Change |
|---|---|---|
| `d166d5bb` | 2026-09-11 | Fills moved from 3.5 units (~223 km up, above the clouds: a raised shell) down to 0.2. The elevation slider tops out at 1.5 (`GeopoliticalLayersPopup.tsx:379-381`), so the old height is out of reach. |
| `18d02c69` | 2026-09-12 | 855 objects batched into a handful; screenshots before and after matched. |
| `1fc59d3a` | 2026-09-19 | **Probably the "amazing → good" change** (decision D-F 8). `schemeColor()` had hashed each country id into a four-colour palette, with vivid green `0x00ff41` international borders and a "Colour scheme" setting. All three went. Now there is one fill colour, `0x2b4257`, and pale `0xc9d4e3` borders (`materialTheme.ts:66-90`). The reason recorded: the hash meant nothing, and 27–31% of settled borders came out in the amber or red reserved for disputed ones. |

These still work: sun-shaded translucent fills, cross-fades between detail levels,
dashed borders by type, and the hover and selection halo.

These settings exist and do nothing: `labelVisibility` (no renderer reads it, so country
labels are never drawn) and `useCustomColors`.

Bringing the old look back as a style is small. `territoryBatch` still carries a colour
for each country part, and today it is fed `colorOf: () => TERRITORY_FILL_COLOR`. To
keep what D-F 8 fixed, colour neighbours apart with a four-colouring of the adjacency
graph rather than the id hash, and keep red and amber out of the fills.

Settings that could be offered: fill opacity, elevation (with the range back to 3.5),
border width and opacity, colour per border type, dash length, how strong the shading
is, disputed and maritime toggles, labels (to build), cross-fade length, and an LOD
lock.

### 1.2 The Sun and planet scale — three scale conventions, and a Sun ten times smaller than Jupiter (code)

**The Sun has no shine.**

- It is a flat `MeshBasicMaterial` `0xffaa00` at 0.9 opacity with no texture
  (`src/solar-system/SolarSunManager.ts:167-174`).
- Its glow is a white back-face sphere at 1.5× size and 0.15 opacity.
- The shader corona in `SolarActivityVisualizer.ts:147-205` takes its alpha from the
  sphere's UVs, so it bands along the seam rather than glowing toward the viewer.
- There is no bloom pass, `EffectComposer`, `Lensflare` or glow sprite anywhere in
  `src/`.

**The scales disagree.**

- **Earth** is always the 100-unit globe.
- **The Sun** is `earthRadius × 109.2 × compression` for each tier
  (`SolarSunManager.ts:84-160`). That gives a radius of 32.8 (camera 200–8,000),
  43.7 (to 15,000) and 54.6 (to 50,000): **0.33–0.55 Earth radii instead of 109**.
- **The planets** are `(km / 6371) × 50` (`Planet.ts:219-223`): half the globe's scale,
  but consistent with each other.
- **The Moon** is true size, on the globe's scale (`Moon.ts:40`).

The results:

| Body | Drawn (Earth radii) | Real |
|---|---|---|
| Sun | 0.33–0.55 | 109 |
| Jupiter | 5.49 | 11.2 |
| Saturn | 4.57 | 9.45 |
| Venus | 0.475 | 0.95 |
| Mars | 0.266 | 0.53 |
| Mercury | 0.19 | 0.38 |
| Moon | 0.273 | 0.27 |

- Jupiter, at about 549 units, is ten times the Sun's radius.
- The Moon is bigger than Mercury.
- The planets sit 1,400 units from the Sun per AU (`EphemerisService.ts:39`). The
  Moon sits at its true distance on the globe's scale, about 6,034 units
  (`Moon.ts:106`), and is still drawn in the far tiers. **So the Moon is about four
  times farther from Earth than the Sun is.**

A second size table, `DEFAULT_SCALE_CONFIGS` (`SolarSystemConfig.ts:43-80`), has
different Sun radii again; it is used only to pick the tier.

The solar system is only drawn in EcoNatural, and in CyberCommand outside Intel
Reports (`Globe.tsx:542-543`). Zooming out in GeoPolitical or Intel Reports shows no
Sun at all.

### 1.3 Zooming out — marks never hide (code)

This is by design. Markers are a fixed number of screen pixels: `screenPoints.ts` sets
`gl_PointSize` in CSS pixels with `frustumCulled = false`, and distance only fades marks
at the globe's limb, never with zoom.

- **Layers that stay the same size on screen at any distance:**
  - eco-disaster marks (earthquakes included), space weather;
  - intel country markers and intel/RLSH anchors, intel report glyph sprites ("legible
    at any zoom");
  - satellites, cyber attacks, comm hubs, conflict zones, diplomatic events, earth
    weather.
- **Lines with fixed pixel widths:** borders, cables, conflict outlines, and trade and
  diplomatic arcs.
- **Thinned at low detail, never hidden:** volcanoes and water gauges.
- **Territories** swap detail files at 350 and 200 units, and never hide.
- **Layers that shrink with the globe**, because they are drawn in world space:
  react-globe.gl rings and arcs, country fills, GDACS polygons, weather meshes, and
  region outlines.

**Where to fix it:** every points object has an `onBeforeRender` (`screenPoints.ts:381`,
`intelReportSprites.ts:557`). One distance-fade uniform there would cover about 12
layers. The camera's altitude is already published (`globeCameraTelemetry`, from
`onZoom`), and `useCameraDetailTier` already has thresholds.

### 1.4 Zooming in — the textures run out (code)

| Texture | Size | km per pixel at the equator | Used by |
|---|---|---|---|
| `earth-day.jpg` | 1600×800 | ~25 | EcoNatural (the default) and the terrain skin |
| `earth-dark.jpg` | 2048×1024 | ~20 | CyberCommand |
| `earth-blue-marble.jpg`, `earth-night.jpg` | 4096×2048 | ~10 | GeoPolitical; the night side |

- The camera can come down to about 70 km (`controls.minDistance` ≥ 101.1 units,
  `useGlobeCameraNear.ts:32`). At that height a 25 km pixel fills the screen.
- The textures load through a plain `TextureLoader` with anisotropy 8 and no KTX2.
- **The default mode uses the smallest texture.**

There are no map tiles today. three-globe 2.44 ships a slippy-map engine, which
react-globe.gl 2.35 exposes as `globeTileEngineUrl` (up to zoom 17). Turning it on hides
the globe's own mesh (`three-globe.mjs:688`), and with it the custom shader skins
(day/night, cyber, bump and specular). Its tiles are Web Mercator, so nothing is drawn
above about 85° latitude. Keeping the shader globe far out and fading tiles in close
up would need custom work.

**Where tiles could come from.** The CSP already allows any HTTPS image host
(`vercel.json`: `img-src … https:`).

- NASA GIBS: public domain and CORS-enabled. Its maximum zoom level is still to be
  checked.
- Esri World Imagery: has terms and requires attribution.
- OpenStreetMap's standard tiles: their usage policy rules this use out.
- Whatever the host, it learns which area the person is looking at.

### 1.5 Picking from a group — paging, not a menu (code)

- **Grouping.** `collapseCoLocated` (`useGlobeRLSH.ts:37-58`) keeps one marker per
  place: 197 people on 107 coordinates, 14 of them in San Diego. The tooltip says
  "X and N more here".
- **What a click does.** It opens `RLSHPopupPortal` as a modal with a backdrop
  (`Enhanced3DGlobeInteractivity.tsx:659-690`). The modal has Previous/Next and
  "n/N in group · m/M total" (`RLSHPopup.tsx:905-925`).
  - There is no list of names and no way to jump straight to one.
  - Paging past the group's end carries on into everyone else.
- **Intel reports group the same way.** Reports within ~11 m merge
  (`reportPlaces.ts`), and a click opens the most severe one with paging.
- **No in-place picker exists.** `GlobeContextMenu`
  (`src/components/ui/GlobeContextMenu/`) is the nearest thing. It is positioned at the
  click and closes on Escape or an outside click, but its actions are a fixed list.
  Making it take items would let RLSH and intel places share it. The click position is
  known (`Enhanced3DGlobeInteractivity`'s `geoAt`).

---

## 2. EIA on the globe (api)

Probed live on 2026-10-01 with the owner's test key. The API answers with CORS `*`,
and each request takes 10–16 s. A JSON page holds at most 5,000 rows.

| Dataset (route) | Rows | Place | Freshness | What it could draw |
|---|---|---|---|---|
| `electricity/operating-generator-capacity` | 26,072 operating generators | latitude/longitude per generator; balancing authority | monthly (2026-07) | every US power plant, sized by MW and coloured by fuel; planned retirements |
| `nuclear-outages/generator-nuclear-outages` | per reactor per day | plant id, which joins to the generators' coordinates | **daily, today** (Browns Ferry 1 at 100% outage on 2026-10-01) | reactors offline now |
| `electricity/rto/region-data` | 67 balancing authorities per hour (demand, forecast, generation) | none; can be placed at the capacity-weighted centre of each authority's generators | hourly, ~1–2 h behind | grid load as a heat field |
| `electricity/rto/interchange-data` | 329 authority pairs per hour | the same derived centres | hourly | **live power flows between grid regions, as animated arcs** |
| `electricity/rto/fuel-type-data` | 477 per hour | the same | hourly | each region's fuel mix now |
| `coal/mine-production` | 898 mines | latitude/longitude per mine | annual (2024) | coal mines sized by production |
| `international` | 268 countries and regions | ISO-3 country codes, which join to the territory meshes | annual/monthly to 2026-06 | country production, consumption and imports of oil, gas and power, as fills or heights |
| `petroleum/stoc/wstk` | weekly | PADD regions | weekly (2026-09-25) | US stocks by region |

None of these needs a key the app does not already ask for. The rows are large and slow,
so a layer built on the generator or mine data needs a build-time snapshot, as
`scripts/snapshot-gdelt.mjs` does for GDELT. The grid data is small and changes hourly.

### 2.1 How the app uses EIA today (code, and api where marked)

Each person's own key is read from the browser on each request (`src/api/eia.ts:30`).
No key is built in, and with no key nothing is sent. EIA reaches the screen in two
places:

- **The ticker** polls 11 series every 5 minutes. They are old v1 series ids sent
  through v2's compatibility route (`seriesConfig.ts`, `useEnhancedEIAData.ts:52`).
- **Resources on the globe** colours countries by production of oil, gas and
  renewables, from `international` (`EIAInternationalService.ts:69-77`), cached 24 h.
  The trade arcs in that layer are 11 baked 2023 Comtrade flows, and its "conflict"
  lines are the disputed-border classification. No plant, grid or mine is drawn
  anywhere.

**What is wrong in the ticker:**

- **LNG exports are shown a million times too large** (api). The series is MMcf:
  518,777 for 2026-07, which is 0.52 Tcf. It is formatted as "X.X Tcf" with no
  conversion (`seriesConfig.ts:213-218`).
- **Diesel is a stock shown as a flow** (api). `PET.WDISTUS1.W` is distillate ending
  stocks, 105,180 thousand barrels, but it is labelled "kbd".
- **Four slots never fill:** Gasoline, NG Storage, Grid and Power Price read series
  that are commented out of the config, so they show "—" even with a key.
- **Every poll downloads the whole history** (api). No `length` is sent, so each series
  returns 5,000 rows, 1.4 MB for the daily oil price, to read one value. The cache is
  written and never read (`EIAService.ts:419-447`). That is every 5 minutes, in every
  open tab, at 10–16 s a request. The newest row does come first, so the value shown
  is right.
- `DashboardProvider` fetches the oil price on every load, and nothing shows it.
- `earthAllianceContext` strings ("international banking cartels", "planetary
  reclamation") ship in the bundle, unrendered (`seriesConfig.ts`,
  `topbarCategories.ts`).

*Checked against EIA and fixed 2026-10-02 (plan block F, item 2).* Asking EIA for
every series the ticker named found more than this audit did:
- the gas price read `NG.RNGC1.D`, whose last value is from April 2024, as current;
- "refinery utilization" read crude field production;
- "crude imports" read refiner input;
- "gasoline production" read refinery utilization;
- three series ids do not exist;
- the electricity price comes back as `price`, which was never read;
- the cache's age limit read minutes as seconds.

Now:
- 19 series are checked against EIA, each naming the field it fills.
- One row is asked for each.
- A reading too old for its series' cadence is not shown as current.
- The poll reads its cache.
- LNG is shown in Bcf a month, and distillate as stocks.
- The context strings and the unused dashboard fetch are gone.

On the build with a key, the first load asked for 19 series, 15 KB in all, and every
slot it showed was filled.

---

## 3. Emoji → SVG icons (code)

**Scale.** 141 source files under `src/` (tests excluded) hold 873 emoji, 176
distinct. About 580 of them can reach the screen, in 90 files; the other 293 are in
logs and comments. With tests, Markdown and JSON included: 189 files and 1,503
occurrences. Two plain symbols also act as icons: ✕ (23 close buttons) and ✓ (6).

**By meaning:**

| Meaning | Occurrences | Examples |
|---|---|---|
| Data types | 307 | 🛰️ 📡 ⚡ ☀️ 🌋 🛢️ 🦸 🛡️ 📊 |
| Status and alerts | 214 | ✅ ⚠️ ❌ 🚨 🔴 ⏳ |
| Actions | 128 | 🔍 🔄 🧹 🔗 🗑️ 📋 🔒 📍 |
| Apps, modes and navigation | 126 | 🌍 🌐 🕵️ 🗂️ 📑 🔬 🕸️ 👥 🎯 💰 ⚙️ |
| Decoration | 78 | 🔧 💡 🎨 📝 |
| People and roles | 20 | 👤 🤖 💬 |

**One meaning, several emoji, and one emoji, several meanings.**

- The same layer has a different emoji in the rail (`railModeConfig.ts:26-40`) and in
  quick access (`QuickAccessPanel.tsx:98-101`):
  - Cyber Threats: 🛡️ / ⚠️
  - Diplomatic: 🤝 / 🌐
  - Resource Zones: ⛽ / ⛏️
  - Space Weather: ☀️ / ☄️
  - Earth Weather: 🌦️ / ⛈️
  - Intel Reports: 📑 / 📝
- 🌍 is both the Globe app and the GeoPolitical mode.
- 📑 is the Intel Dashboard app, the CyberCommand mode and a layer.

**What exists.** There is no icon registry. `lucide-react` 0.525 is installed and used
in 24 files, 13 of them NetRunner. `@mui/icons-material` is used in 13 files, and 12
files hand-draw `<svg>`. Apps declare `icon: string`. The only map from meaning to
glyph and colour is the globe's sprites (`intelReportSprites.ts:60-135`).
`guard-icon-barrel-imports.mjs` only blocks the barrel import of MUI icons.

**The RaveLite pattern to follow** (`RaveLite-App/RaveLiteApp/src/components/icons/`):

- A `SYMBOLS` table maps each name to `[LucideIcon, HueName]`, so a symbol and its
  colour are one choice and no call site picks a colour.
- Hues come from a theme module, each chosen to stay legible on the dark background.
- Its own marks are path data on a 24-unit grid with a 1.75 stroke and Lucide's
  keylines.
- Its tests check that every concept has a symbol and a `#RRGGBB` hue.
- Lucide is ISC-licensed and credited.

## 4. Navigation (code)

### 4.1 The bottom bar

`MainBottomBar` sits on every app with nine buttons, all emoji: Globe, NetRunner,
Cases, Intel Dashboard, Intel Analyzer, IntelWeb, OpsCenter, Missions, Market Exchange,
then Support Ops.

- **Its padding is `var(--space-sm)`, a token defined nowhere,** so the declaration is
  dropped and the padding is 0 (`MainBottomBar.module.css:6`). The same happens again
  at `:167`. The scale that does exist is `--space-1…24`.
- Its group labels sit at `top: -18px` inside a box with `overflow-x: auto`, so they
  are probably clipped. Still to be seen in the app.
- **There is no phone layout.** At 390 px the nine buttons need about 415 px of the 374
  available, so the bar scrolls sideways. The shell is `height: 100vh` with no `dvh` or
  safe-area insets, so on iOS Safari the bar can sit under the browser's toolbar.
- **The same list appears five times:** the bar, Ctrl+K quick access, header search,
  the HUD's Layers button (which opens the same palette), and the pipeline guide's
  "Open …" buttons.

### 4.2 OpsCenter and Missions are one app, listed twice

Both open `teamworkspace`. Missions is the same entry with `initialTab: 'missions'`
(`EnhancedApplicationRouter.tsx:166-187, 229-241`). One component,
`TeamWorkspaceApplication`, has tabs for overview, missions, projects (a placeholder),
chat, operatives and admin, and opens on overview. Code exists only to tell the two
apart (`MainBottomBar.tsx:41-50`, `TeamWorkspaceApplication.tsx:224-238`).

**A bug this causes now.** Four pipeline stages point at `teamworkspace` with no tab
(`pipeline.ts:190, 214, 300, 320`). The guide labels them "Open OpsCenter" and lands on
Overview, not Missions.

**What dropping the OpsCenter button touches:**

- the registry entry and default tab;
- three pieces of text (`JoinTeamPage`, `glossary`, `pages/Teams/TeamWorkspace`);
- 13 unit-test files and 3 Playwright specs;
- `audit-ui-layout.mjs`;
- about 10 docs under `docs/missions`.

No guard or shortcut names it. Deep links to `/app/teamworkspace` keep working if the
id stays.

*Fixed 2026-10-02 (plan block F, item 7).*
- The guide's mission steps open the Missions tab and say "Open Missions".
- The bottom bar's padding is the scale's.
- The z-index ratchet is down to 77.
- **A new guard**, `guard-undefined-css-vars`, fails on a `var()` naming a property
  nothing defines. Its first run found nine such names in use: `--space-sm`, the
  header's `--cyber-cyan`, `--mui-palette-divider`, and IntelWeb's six `--intel-*`
  colours, used 112 times and never defined. Every one of those declarations was
  being dropped, which is why IntelWeb's header had no background. All now resolve
  to the design tokens.

Measured on the build: the bar is drawn at `0px 16px`, still 43 px tall; IntelWeb's
colours resolve; and the guide's "Open Missions" lands on OpsCenter with Missions
current.

*Fixed 2026-10-05 (block D, step 2; K1).* The app is named Missions and listed once,
opening on its missions tab, at `/app/missions`. `/app/teamworkspace` still opens it.
The code that told the two entries apart is gone.

## 5. Space (code)

**Every app carries this chrome:**

| Element | Height | Note |
|---|---|---|
| Header | 60 px | no media queries |
| Ticker strip | 40 px | no media queries |
| Bottom bar | 43 px | |

**The Globe adds:**

- a second ticker, 48 px;
- a time scrubber, 52 px;
- 32 px rails, plus a 44 px sub-rail.

| Viewport | Shell chrome | Globe screen, all chrome | Globe's view |
|---|---|---|---|
| 1400×900 | 16% | ~30–33% | 67–70% |
| 390×844 | 18% | 41–48% | |

On a phone the header's fixed content is about 490 px wide in a 390 px window, so its
right end (the key button) is cut off.

**Inside the apps:**

| App | Padding | Hard-coded height | Effect |
|---|---|---|---|
| OpsCenter | `p:3` at the root, `mb:3` and `mb:2`, then a `Paper p:2` | `calc(100vh - 250px)` | About 37 px clipped at 900 px tall. On a phone its six tabs (about 550 px) are cut off at both ends. |
| Market Exchange | `p:3`, then a nested `p:3` | `calc(100vh - 350px)` | |
| Cases | `p:3`, `mb:3`, a divider with `mb:3`, a `Paper p:3 mb:3` | | |

*Measured and corrected 2026-10-02 (plan block F, item 3).* The cut-offs above were
estimated from the code, and only one was real. The shell is a flex column, and an
app root that hides its overflow shrinks to fit, `100vh` or not. So OpsCenter, the
Analyzer and IntelWeb were never cut off.

The Market Exchange was. Its list had a window-sized height inside a root that is not
a flex container, and it ran 66 px past the visible bottom at 1400×900, and 230 px at
390×844. Now every app takes its area's height, its scroll areas flex into what is
left, and a test fails on any `100vh` or `100vw` under `src/applications`. Measured on
the build: no app's scroll area ends past its area, at either size.

Across the code: 75 CSS padding or margin values of 24 px or more (in 27 files), and
78 MUI `p ≥ 3`. The rail buttons are 24 px wide, and 20 px under 768 px, which is below
the WCAG minimum of 24.

## 6. Overlap (code)

**What the two layout audits can't see.**

`audit-layout-collisions.mjs` (part of `guard:style`):

- reads CSS files only, and only `position: fixed`;
- flags only two files that use the identical literal offsets;
- never fails.

It misses `absolute` positioning, the eight inline fixed positions in TSX, `calc()`
and `var()` offsets, sizes and z-index.

`audit-ui-layout.mjs` runs by hand at 1280×720 and 1920×1080 only, after an 8-second
settle. It never sees a phone width, a popup, toast, menu, chat window or notice, or
text on a canvas.

**The z-index scale has tokens and few users.** The tokens run hud 100, panel 2000,
dropdown 3000, modal 4100, notification 5000, tooltip 6000 and critical 9900. Six CSS
rules use them. Raw values are everywhere: 1000 ×31, 9999 ×7, 10000 ×6. Five layers sit
at 10000 or above. The ratchet's ceiling is 137, but the count is 78; the guard itself
says to lower it.

*The layout audit learned phones and popups, 2026-10-02 (plan block F, item 8; K18).*
`audit:ui-layout` now:
- measures 390×844 beside the two desktop sizes;
- opens each popup, menu and panel in turn and measures it open: the header's chat,
  community, key and search, and on the Globe, quick access and the geopolitical
  layers;
- reads relays without ever sending EVENT or AUTH.

It now counts only overlaps that show. Text under something opaque, or inside a
closed `<details>`, which Chromium lays out and does not paint, is not counted.
Without that, a dialog's every label counted against the page beneath it. With the
dialog and the chat window open, the count went from 19 and 29 to 0.

What it finds, run on the build (to be fixed with K4 and K16 in block D):
- the Globe's second ticker, whose "Click for details" hint lies over its own items
  (3 at desktop, 10 on a phone);
- on a phone, the community menu (10), quick access (10), search (9) and the key
  panel (6).

*Block D, step 1 (K4, K16), 2026-10-05.* Measured on the build with `audit:ui-layout`,
before the step and after it:

| Globe | Before | After |
|---|---|---|
| Overlaps at 1280×720 / 1920×1080 / 390×844 | 3 / 2 / 13 | 0 / 0 / 5 |
| Overlaps with a popup open, 1280×720 (community, key, search, quick access) | 4, 3, 5, 4 | 0, 0, 0, 0 |
| The Globe's share of the screen, same three sizes | 61%, 73%, 53% | 67%, 77%, 57% |

- The second ticker is gone. Its readings join the main one only when EIA answered.
- At 1280×720 the bottom-left dock ran over the clock and the minimap. BD4 folded it
  from 425 to 218 px; it fits on windows from 640 px tall.
- The audit now leaves out text a clipping box cuts away. The ticker's text scrolling
  under the screen title had counted as an overlap.
- The phone's five overlaps, the legend on the left column, are step 3's (K2).

*Block D, step 3 (K2, BD5, BD6), 2026-10-05.* On a phone, 390×844, on the build:

| Globe, 390×844 | Step 1 | Step 3 |
|---|---|---|
| Overlaps | 5 | 0 |
| With community, key, search, quick access open | 5, 9, 9, 7 | 0, 0, 0, 0 |
| The bar | 9 icons, no names | 5 named buttons |
| Room for the ticker | about 90 px | 190 px |

Cases has none either, at any size or with any popup open. On a phone the key
button sits inside the window (346–382 px of 390), and the Intel sheet draws over
the Globe's corners at each of its items.

Of the collisions below, every one but the phone's is fixed:
- the identity notice, the coach and the snackbar are docked;
- a chat window opens in the work area;
- the place-pick hint and the key panel sit below the ticker;
- no raw z-index of 9000 or more remains, and the guard fails one;
- `DeepSettingsPanel` sits in the work area (the audit does not open it);
- with the header search open, the audit finds nothing covered.

**Likely collisions:**

- **Bottom right:**
  - The identity notice (z 3200, 360 px wide) sits on Support Ops.
  - The coach (bottom 88, z 1600) sits on the right rail, the dock's Layers button and
    the scrubber.
  - The two stack on each other.
- **Secure chat windows** (z 900): under the rails, over the bottom bar.
- **The place-pick hint** (top 88, z 2000) lands on the ticker's text.
- **`DeepSettingsPanel`** (left 120 hard-coded, z 1001) covers the header and the
  bottom bar.
- **Header search results** sit in the header's z-100 stacking context, so they paint
  under the rails.
- **The key button** (top 64, z 3000) sits over the ticker and the rail.
- **The snackbar** (bottom 32, z 2000) sits on the bottom bar.
- **Stale geometry:** `useWorkArea.ts` never resets `--work-*` when the Globe unmounts,
  so in other apps the dock and the undo stack are placed by the Globe's old
  measurements.

---

## 7. IntelWeb (code)

**Layout.** There are three panes: a 300 px file tree, the graph, and a 300 px sidebar
with five tabs (`IntelWebApplication.tsx:417-466`). The graph is raw D3 v7 force
layout drawn into an SVG (`GraphEngine2D.tsx:99-110`), with link, charge −300, centre
and collide forces.

**Why it is a featureless disc.** The data has no structure, and nothing in the physics
gathers it.

- Network reports never carry entity references, and the vault builder ignores
  hashtags and jurisdictions (`IntelWebIntegrationService.ts:171-176, 209`).
- So each report is one node, joined to at most one location node keyed to five
  decimal places, which almost never merge.
- Hundreds of singletons and pairs pushing each other apart settle into an even disc.
- The Gravity slider exists, and nothing reads it.
- Of five node types, two are never produced (event and source); of five edge types,
  three are never produced (temporal, causal, similar). Their filter boxes can never
  match.

**Controls that fight the screen.**

- Nothing inside IntelWeb sets `position`, so its absolute overlays are placed against
  the whole app area.
  - The graph header spans the full width, over both sidebars' headers.
  - The graph controls (top 16, right 16, z 100) cover the sidebar's tab row.
- Four classes the markup uses have no CSS anywhere: `.controls-panel`,
  `.mode-switcher`, `.graph-stats-mini` and `.tab-nav`.
- The root is 100vw × 100vh inside a shell that takes 143 px, so its bottom is cut off.
- The node and edge counts appear three times, and Freeze/Save/Reset twice.
- Labels are 10 px file names cut to 15 characters ("38.89770_-77.03…"), all drawn
  at zoom ≥ 0.5 with no collision avoidance.
- Isolate asks you to type a vault file path.
- Search removes everything that doesn't match, so a hit loses its surroundings.
- There is no grouping, no colour-by and no layout choice.

**A click restarts everything.** `initializeSimulation` depends on the selection
(`GraphEngine2D.tsx:371`). Each click wipes the SVG and restarts the layout twice, and
loses the zoom.

**3D.** `three` is installed, and `force-graph`, `d3-force-3d` and
`three-render-objects` are already present as dependencies of other packages.
`react-force-graph-3d` and a sprite-label library are not. `IntelNode` already has
z fields. The globe stays mounted with rendering paused, so a 3D graph is a second
live WebGL context and has to follow the quality governor.

**3D alone turns the disc into a ball.** The structure has to come first:

- link reports by tag, jurisdiction, publisher and time;
- cluster by group, with time as an axis;
- collapse clusters.

A separate floating HUD panel, `NodeGraphView`, places nodes on a literal circle
(`:65-88`). It is not IntelWeb.

*Fixed 2026-10-02 (plan block F, item 4).*
- The graph header sits in the flow, over the graph pane only, and the graph starts
  below it.
- The graph pane anchors the controls, which sit under the header.
- The unstyled classes have rules, and the duplicate count is gone.
- A click redraws the selection without rebuilding, so pan and zoom stay.
- The filters offer only the types the graph holds, with counts.
- Gravity pulls toward the centre.

Measured on the build with 126 nodes: every header button and sidebar tab is the
element at its own centre, and after zooming in and clicking a node the graph and its
transform are unchanged.

Seen there too, and left for K9: reports form a loose cloud of singletons, and
labels collide when zoomed in. Before this fix the vault held nothing on a first
visit (section 13). With the globe given 35 s first, it held 130 files.

## 8. Intel Analyzer (code)

**Layout.** Three columns of 300 / flexible / 350 px, so 750 px for the centre at
1400 px wide. The root is 100vh, so its bottom 143 px are cut off.

- The left rail stacks ten panels: Outbox, Boards, Needs attention, Filters, Entity
  Review, Findings, Peer claims, Claims you published, Gaps, Register structure.
- The filter panel scrolls inside the scrolling rail.

**Controls that mislead:**

- **"Open in Dashboard"** goes to `/intel?selected=`. That route reads only `reportId`
  and redirects to `/`, so the selection is lost (`InspectorPanel.tsx:63-71`,
  `pages/Intel/IntelDashboard.tsx:17-23`).
- **Pin to Board and Watch** do nothing when no board is active, and are never
  disabled (`BoardsContext.tsx:54, 73, 88`).
- **A `?board=` link** sets the workbench's copy of the active board, not the one pins
  write to.
- **"Add placeholder geo area"** filters to a hard-coded San Francisco triangle that the
  map's Clear button can't remove, while the map view has real polygon drawing
  (`FilterPanel.tsx:357-395`, `MapView.tsx:263-268`).

**Duplicate paths:** geo filters in two places, a cluster toggle in two places, and
Boards versus the graph's "Manage Views". There is also a second graph explorer
(react-force-graph-2d) with its own Freeze/Save/Reset/Isolate, separate from IntelWeb.

**Jargon, and internal names used as labels:** "producers above did not run",
"committed registers", "register asset", "brushing", "GraphView", "MapView".

**Empty states offer no first step:** "No events available for brushing.", "No events to
render."

**Stories and tests.** Only S28 (Entity Review) and the empty-workspace edge case are
about this app, and `audit-intern.mjs` marks S28 not checked. The Playwright walk only
opens the app. **No story or test follows an analyst through it.**

*Fixed 2026-10-02 (plan block F, item 5).*
- "Open in Dashboard" opens the report the selection came from, and is disabled,
  saying why, when the selection is not a report.
- Pin and the watchlist are disabled, saying why, until a board is open.
- A `?board=` link opens the board pins write to.
- The made-up San Francisco area is gone. The panel points to the map's drawing,
  and names and clears an area drawn there.
- "MapView" and "GraphView" read Map and Graph; the jargon is plain; the empty
  timeline says how to see events.

**Found running the app, and fixed with it.** Saving a board, or opening one, with an
event selected replaced the whole Analyzer with its error screen. A board restored
its selection as `{ id, type, data: null }`, and the Inspector read the event's time
from null. Saved selections are now found again in the workspace, or cleared, and the
Inspector shows nothing for a selection with no data.

The tests that saved boards used event ids no workspace can hold (`ev-123`; a report's
event is `evt-report-<id>`) and mocked the event details out, which is how this went
unseen.

Measured on the build: before a board, Pin is disabled; after saving one, the board is
active, the table keeps its 23 rows, and Pin and the watchlist work. "Open in
Dashboard" opened the Intel Dashboard on that report.

## 9. Market Exchange (code)

**The space.** At 1400×900 the app gets 757 px of height.

- Padding, two stat cards, the tabs and the gaps between them take about 273 px.
- The list beneath is `calc(100vh - 350px)` tall, so **its last ~66 px can never be
  scrolled into view**.
- A heading, intro and filter buttons take another ~160 px before the first card.
- In all, **about 58% of the app's height sits above the first card**.
- Cards are one column, ~1,296 px wide and 140–200 px tall: **about 1.5 cards are
  visible**.

**Defects found (the first and third verified by hand):**

1. **Declared audiences never work for network intel.** Rule 2, "declared beats
   derived", reads `report.tags` (`opportunityAudience.ts:185`). The ingest puts a
   publisher's `t` tags in `hashtags` instead, deliberately, so they can't spoof
   internal tags (`NostrStarcomIntelIngest.ts:1072-1080, 1229-1234`). So a peer's
   `audience:` tag is never seen, which is the case the rule exists for.
2. **The patterns are loose enough to break Rule 3.** "exclusion" plus "award" or
   "paid" names the False Claims Act on any record, a maritime exclusion-zone award
   included. "announcement" alone counts as a funding window (`:145, :171`).
3. **`/\bUEI\b/` can never match.** The text is lowercased first (`:186`), so
   parent-entity routing depends on the word "ownership" alone.
4. **Two advertised archetypes can never be derived:** `recovery_agent` and
   `whitehat`. The test that "routes every archetype it advertises" only counts them.
5. **Cards are dead ends.** They show no record date, publisher, jurisdiction or link.
   "closes in 8 day(s)" is shown without the date it was counted from. The order is
   storage order, and the filter takes one archetype at a time.
6. **Marketplace words survive:** the name, 💰, "Active Listings", a shopping-cart
   icon, "Loading Market Data…".
7. **"Compose & Publish Current Draft" reads `?draft=`, which nothing sets any more,**
   so it picks the newest draft, or the newest report. The review dialog does show
   which before anything is uploaded.

No user story or end-to-end test covers the board.

*Defects 1–4 and 7 fixed 2026-10-02 (plan block F, item 1).* Each has a test that
fails without its fix. Defects 5 and 6 belong to the lead desk (K10).

**Their vocabulary, and ours.** Mecha Jono's interchange declares
`audience:white_hat`, now read as `whitehat`. It also declares `audience:rlsh` and
`audience:public_interest_attorney`, which have no archetype here and are ignored, as
any unknown audience is. Whether the board should add those two is the owner's
call, at K10 or K11.

### 9.1 Who the board is for (brainstorm)

The question was how people doing this work find paid work. The board's answer stays
the same: it points at **published programmes and public records**, and the programme
decides any reward.

- It never lists an amount against a statute.
- It never locates a person.
- It never ranks private individuals.

Today's four patterns serve only rows 1, 4, 5, 8, 9 and 14. The others need new
public-record feeds, each with its own pattern, naming a statute only where the pattern
reaches one.

| # | Who | Comes for | Programmes that pay or fund the work | Story |
|---|---|---|---|---|
| 1 | Qui tam relator (often an ex-contracting officer) | Payments made during an exclusion | False Claims Act qui tam; DOJ and the court decide any share | Exclusion leads grouped by agency, to see which fall in my field before talking to counsel |
| 2 | Ex-military, maritime | Vessel and port records | APPS ocean-dumping awards (33 U.S.C. §1908); Rewards for Justice (DPRK shipping) | Leads by flag state, to work the ones my service covers |
| 3 | Ex-police | Health-care fraud patterns | HHS-OIG exclusions (LEIE) leading to the False Claims Act; state fraud bureaus | Excluded-provider leads by state, to check against my old beat |
| 4 | Ex-intelligence / strategic consultant | Funding windows, corporate parentage | SAM.gov and Grants.gov broad agency announcements (DARPA, IARPA); Challenge.gov | Windows on a calendar by their real closing date |
| 5 | Private investigator | Parentage, exclusions | IRS Whistleblower Office (§7623); work for relators' counsel | The record behind each lead, to verify it before quoting it |
| 6 | Whitehat | An organisation's exposed service | That organisation's own disclosure policy or security.txt; Rewards for Justice (attacks on critical infrastructure) | A link to the disclosure channel, to report the right way |
| 7 | Bounty hunter (fugitive recovery) | Published reward notices | U.S. Marshals, FBI and State narcotics rewards; state bail-recovery licensing | Which states license recovery, to stay legal. The board links the agency's tip line and never locates anyone |
| 8 | Investigative journalist | Revocations, exclusions | Fund for Investigative Journalism; Pulitzer Center grants | Counts by place, to pitch a story |
| 9 | OSINT volunteer | Sanctioned challenges | Trace Labs Search Party; Challenge.gov | Open challenges, to practise on sanctioned cases |
| 10 | Compliance / AML analyst | New exclusions and sanctions designations | FinCEN AML and sanctions whistleblower programme (31 U.S.C. §5323); SEC and CFTC programmes | This week's new exclusions, to rescreen clients |
| 11 | Sanctions researcher | Designations by programme | FinCEN; Rewards for Justice (DPRK and IRGC finance); Kleptocracy Asset Recovery Rewards | Leads by sanctions programme, to route each to the right office |
| 12 | Insurance SIU investigator | Billing while excluded | National Insurance Crime Bureau; state reward programmes | Health-care leads by line of insurance, for triage |
| 13 | Missing-person volunteer | Unidentified cases, events | NamUs (unidentified remains); Trace Labs; NCMEC | Events, not subjects, to help without building dossiers |
| 14 | Academic researcher | Pattern counts over time | NSF and NIH through Grants.gov | Counts to export, to study gaps in enforcement |

Skip tracers are left out on purpose: finding people is outside the board's scope, and
the board should say so.

**Ways to show it better, inside the three rules:**

1. **A lead desk.** The stats shrink to one line, with a dense list on the left and
   detail on the right. This wins back about 250 px.
2. **A matrix of record counts,** pattern by audience, as the home view and the filter.
3. **Group by programme and by who decides,** for example "Decided by DOJ and the
   court: 12 records", each with the programme's link.
4. **A deadline timeline** from the closing date worked out from the record (record
   date + N days). The date is marked as derived, and closed windows are greyed.
5. **A map of lead counts by jurisdiction,** for organisations and places only.
6. **"Why it is here".**
   - The phrase that matched is highlighted.
   - Declared and derived routes are told apart by border style and a label.
   - The record's date, publisher and link are shown.
7. **Lenses.** Several audiences at once, a "names a statute" toggle, and sorting by
   date.
8. **Acting on a lead.** Start a case, or open it in the Analyzer, with a count of
   independent records that agree.

## 10. Raver Watch events (code)

**What the reader takes.** It reads kind 30023 from one publisher key on one relay (The
Record), tagged `t raver_watch` (`services/raverWatch/raverWatch.ts:207`).

- **Required:** `d raver-*`; one of six sub-layer tags; `title`; `source`;
  `valid_from` and `valid_until`.
- **Optional:** `summary`, `r`, `level`, `category`, `jurisdiction` (`xx` or `xx-yy`),
  and `geo` (`lat:…,lon:…`, rounded to 0.1°).
- **Ignored, though their live notes carry them:** `published_at`, `client`,
  `geo_precision`, `geo_kind` and `geo_source`.

Their schema and examples are in `01-architecture-decisions/raver-watch/`. Their newest
upgrade, Interchange v3.0.0, is not filed in the repo; it is noted as held in the plan.

**Why events don't show.** Part of it is time after all.

1. **Scene events are never drawn.** The layer is `implemented: false`, and the hook
   draws only drug-check alerts and scene incidents (`useGlobeRaverWatch.ts:56-57`).
   `scene_event` notes are read, and then nothing draws them.
2. **Live mode hides what hasn't begun** (`raverWatchView.ts:41`). An event whose note
   starts at doors-open is invisible until doors open. The key only says "N not
   begun".
3. **The timeline can't reach the future.** The scrubber spans intel events only
   (`TimeScrubber.tsx:55-89`). There is no Tonight or This weekend.
4. **Notes without a place draw nothing.**
   - Two of the four live notes on 29 September had none.
   - The only scene incident, Mixmag's California story, has none. It runs out on
     2026-10-06 12:30Z, and the layer is then empty.
   - A NIP-52 `g` geohash or a `location` tag is ignored.
   - `eu`, or a subdivision outside the US, has no outline.
5. **One relay and one key.** If The Record is down, nothing loads. When Mecha Jono
   rotates their key, the layers go silently empty until the code changes.

Phases 2 (scene events, heat risk, Tonight / This weekend / Next 7 days) and 3
(missions, pre-event briefs, the weekend tour, harm-reduction sites) wait on their event
feed (decision D-F section 19).

**What to ask Mecha Jono** (the questions are numbered for reference in their reply):

1. Interchange v3.0.0 as files: what do family, roles, categories and endings mean for
   `raver_watch`, and is there a v2 note schema?
2. Scene events:
   - Which kind: 30023, or NIP-52's 31923?
   - Are the event's start and end separate from its validity (`start`, `end`,
     `start_tzid`)?
   - How far ahead should an upcoming event show?
   - Is a cancellation a retraction or a status?
3. Place:
   - What is the canonical `geo` form? Will `g` geohashes be used?
   - What values can `geo_precision` and `geo_kind` take, and which should be drawn?
   - Is there a venue name?
   - How is EU-wide or multi-country scope given, and which subdivisions beyond US
     states?
4. Can every note carry at least a `jurisdiction`? Where should news without a place
   go?
5. The category list for each layer. Policy and law news is filed as scene incidents
   today.
6. What makes a note red rather than amber, per layer?
7. Will alerts and incidents point at their event with an `a` tag, so a pre-event brief
   can gather them?
8. Heat risk: will they publish it, or should Starcom work it out from the event and
   Open-Meteo, which the app already reads?
9. Harm-reduction sites and raver missions: their sources, licences and cadence.
   Are the missions Starcom mission packages, or a kind of their own?
10. The event feed: start date, volume, relays, and the date of the key rotation.
11. What cards, tours and Tonight views their share stack wants.
12. Whether `published_at` or `created_at` is the time to go by.

## 11. Diplomatic and conflict events (code)

**Data.** Both layers share one GDELT 2.0 snapshot made at build time
(`scripts/snapshot-gdelt.mjs`, `/data/gdelt-events.json`, 2.5 MB).

- It covers 96 fifteen-minute windows, so the 24 hours before the last deploy.
- It is real data, as old as the deploy.
- Diplomacy takes CAMEO roots 03–08 and Conflict takes 14–20. Conflict adds UNHCR
  displacement, which is annual.

**What is drawn:**

- One point per actor country, at the country's centre.
- Size is the count.
- Colour is the dominant category, or the mean Goldstein score.
- **Each event's own location is carried and never drawn.**

**What you can do with it:**

- **Hover:** probably nothing. The tooltip text is built, but the layer never registers
  its tooltip group, and only registered groups are hit-tested
  (`useGlobePointTooltips.ts:113`). Still to be seen in the app.
- **Click:** only through the country, whose popup lists lines such as
  "Treaty — USA/CHN — date" with a source link. Conflict events and displacement are
  not in it.
- **Filters:** categories, a Goldstein floor, and up to 24 h. The region filter does
  nothing (`diplomaticEventFilters.ts:42`).
- **Time:** the layers ignore the shared time window (`Globe.tsx:1495-1514`), against
  decision D-E.

**Labels that claim more than the data says** (`diplomaticEventTheme.ts:19-24`):

- Any "sign formal agreement" (CAMEO 057) is called a Treaty.
- Any consultation, phone calls included, is called a Summit.
- Root 06, which includes military and intelligence cooperation, is called Trade
  Cooperation.
- Roots 03, 05, 07 and 08 are loaded and then dropped.
- "Armed conflict" includes protest (14), force posture (15) and reduced relations
  (16).
- Events are counted at both actors' centres, so heavy coverage of a capital reads as a
  war zone.

GDELT is coded by machine from the news. One event can be many rows, and the mention and
source counts that would show this are not kept.

*Fixed 2026-10-02 (plan block F, item 6).*
- The overlay layers (Diplomacy, Conflict Zones, Resources) register their marks for
  hover. Sweeping the mouse over Europe on the build found no hover text before, and
  37 countries' after, such as "IRL: 44 diplomatic events, mostly consultations
  (calls, visits, meetings)".
- The categories read CAMEO's own terms everywhere, from one table: formal agreements
  signed, consultations, material cooperation.
- The region filter has no control anywhere. It is a documented pass-through in the
  settings, so nothing misleads, and it stays until K12.

**Upgrades the data already supports:**

1. **Place.** Draw each event where it happened, with a switch between "where it
   happened" and "who was involved".
2. **Detail.** Register the tooltips. A click opens an event drawer with:
   - the actors;
   - the CAMEO code, with a plain definition;
   - the Goldstein score, with its scale explained;
   - when it was first reported;
   - the source and its link.
3. **Honest labels.** Use CAMEO's own wording, and draw the roots now dropped. Add a
   primer card on CAMEO and Goldstein for learners.
4. **Relationships.** Select a country to draw arcs to its counterparts, split into
   cooperation and conflict (`tallyEventsByPair` already exists).
5. **Corroboration.** Keep actor names, QuadClass, the mention, source and article
   counts, tone and the place name in the snapshot. Then size by distinct sources, flag
   events with a single source, and remove duplicates by URL.
6. **Time.** Bind both layers to the shared time window. The 96 windows are already in
   the file.
7. **Conflict, split.** Separate protest, posture, coercion and violence. Show UCDP's
   verified events (CC BY 4.0) beside GDELT, so learners can compare the methods.
8. **Investigation.** Start a case from an event, seeded with its sources. Show related
   intel for the same countries and window.
9. **A country brief.** This week's relations, displacement, resource rank, and
   sanctions programmes (by country, never by person).

**Where more could come from:**

- **UCDP:** CC BY 4.0, though its API may now want a token.
- **ACLED:** each person needs their own key, which fits the credential store, and it
  restricts redistribution.
- **UN Security Council resolutions; OFAC, EU and UN sanctions lists:** downloads, so
  they would be snapshotted at build time.
- **Wikidata, for treaties:** CC0 and CORS-enabled.

---

## 12. Fixes that need no decision

These are defects. They go into the plan as they stand.

- **Market Exchange:**
  - read declared `audience:` tags from the publisher's tags (`hashtags`);
  - tighten the award-during-exclusion and funding-window patterns, with tests that
    fail on the maritime and "announcement" cases;
  - fix the lowercased `UEI` pattern;
  - make the archetype test check that each one is reachable;
  - make the draft button publish the draft the person chose.
- **EIA ticker:**
  - convert LNG to Tcf;
  - label distillate as stocks;
  - remove the four empty slots or give them live series;
  - request one row (`length=1`, sorted) and read the cache;
  - drop the unused dashboard fetch and the `earthAllianceContext` strings.
- **IntelWeb:**
  - give the app a positioned root so its overlays stay inside it;
  - stop a click from rebuilding the graph;
  - delete or style the four unstyled classes;
  - remove the dead Gravity, event, source and temporal controls, or make them work.
- **Intel Analyzer:**
  - fix Open in Dashboard;
  - disable Pin and Watch when no board is active, and say why;
  - remove the placeholder geo area in favour of the map's drawing;
  - rename the internal names used as labels.
- **Navigation:**
  - define `--space-sm`, or use the existing scale;
  - point the pipeline's teamworkspace stages at the Missions tab;
  - lower the z-index ratchet to 78.
- **Shell height.** Replace `100vh` / `calc(100vh - N px)` roots (Market Exchange,
  OpsCenter, IntelWeb, Analyzer) with the shell's real height, so nothing is cut off.
- **Diplomacy:**
  - register the tooltip groups;
  - make the region filter work, or remove it;
  - use CAMEO's own labels.

## 13. What the running build showed (app)

`audit:ui-layout` was run at 1400×900 and 390×844 (a phone width this audit added),
with zoom captures taken through the share handle's `setView`. This was the production
build of `e14449a2`, relays read-only, on 2026-10-01 around 22:50Z.

**On a phone, the Globe is mostly covered.** Over the globe sit:

- the coverage panel;
- the key;
- the style picker and zoom buttons;
- the "Showing 49 reports from the network" notice.

Above it, the header's search hint ("Press / to focus") sits on the wordmark, and the
ticker is cut off mid-word. The audit measured 60% of the window for the Globe's own
area, and 7 places where text overlaps text.

**On a phone, OpsCenter's tabs are cut off at both ends,** and the bottom bar runs off
the screen to the right.

**IntelWeb, on a first visit, says "No intel reports yet"** while the ticker counts 20
and the Globe draws 49 from the network. Its vault is built from stored reports when it
opens, so it misses what arrives later. This is to confirm when IntelWeb is worked on.

**The Market Exchange held 20 reports and showed 0 leads, in that run.** Two cards,
"Active Listings 20" and "Draft Reports 0", take a third of the screen.

*Corrected 2026-10-02.* The zero was the run, not the board. This audit opened the
Exchange 8 seconds into a fresh visit, before the ingest had stored the records that
route. On the next build (block F, item 1), with the globe given 35 seconds first,
the board showed 28 leads: one naming the False Claims Act, one corporate
parentage, and the rest revoked exemptions and funding windows. All 28 were derived.
None was declared, because Mecha Jono's case notes, which carry `audience:` tags, do
not reach this read set.

**The Globe's second ticker, for anyone without an EIA key, is nothing but "needs an
EIA key"**, repeated for Energy Intel, Clean Energy, Supply Chain, Energy Markets,
Energy Security and Power Grid.

**Zooming out.**

- At altitude 60, the Earth's fixed-size markers form a blob bigger than the Earth
  itself.
- The Sun is a faint grey dot.
- At 99, the furthest the camera goes, the orbits show, the blob stays, and the Sun
  can't be seen.
- Asked for 200 or 480, the camera stops at 99. At 200 it also swung to lng 81.

**Zooming in.** At altitude 0.02 over San Francisco Bay, the default mode's texture is a
few large blurred blocks; the bay can't be recognised.

**The minimap showed Africa** in every capture, wherever the camera was. Still to check:
whether it doesn't follow `setView`, or doesn't follow the camera at all.

**Groups.** At altitude 0.4 over California, RLSH draws count badges (5 at San Diego,
4 and 2 at Los Angeles). Picking from a group is as described in 1.5.

## 14. Decisions (the owner, 2026-10-01)

Numbered K1–K15, because C1–C9 are the chat decisions.

| # | Question | Decided |
|---|---|---|
| K1 | OpsCenter and Missions | **One Missions button.** The app is renamed Missions and opens on the missions tab. Overview, Chat, Operatives and Admin stay as tabs. `/app/teamworkspace` links keep working. |
| K2 | Phone navigation | **Five buttons and a More sheet:** Globe, Cases, Missions, Intel, More. It uses `dvh` and safe-area insets. |
| K3 | Icons | **Lucide plus a Symbol registry,** after RaveLite: each meaning maps to an icon and a hue. Marks drawn on the 24-unit grid fill what Lucide lacks. A guard blocks new emoji. The bar, rail, quick access and HUD go first. |
| K4 | Chrome | **One ticker and a tight shell.** The two tickers merge into one that shows only what the visitor has. The header is compact on phones. The `p:3` padding and `calc(100vh − N)` heights go. |
| K5 | Territories | **A Classic style, plus fine settings for every style.** No two neighbours share a colour, and red and amber stay out of the fills. Green borders. Height up to 3.5. |
| K6 | Solar system | **True sizes, and bloom.** One scale for every body, with distances compressed the same way for all. The Sun gets a surface, a corona, a lens flare and a bloom pass, and bloom is the first thing the quality governor drops. |
| K7 | Close-up | **Sharper textures now, tiles later.** Compressed 8K day and night textures in every mode now. NASA GIBS tiles fading in close up come later. |
| K8 | Groups | **A menu at the click,** listing each member, shared by every layer that groups. |
| K9 | IntelWeb | **Structure, then 3D.** Fix the overlaps and the click restart, link reports, add grouping, colour-by and filters that keep context. Then a 3D view as an option. |
| K10 | Market Exchange | **A lead desk, keeping the name.** No listings, 💰 or cart. |
| K11 | Board feeds | **All four:** HHS-OIG exclusions, sanctions changes by programme, published reward notices, real funding deadlines. |
| K12 | Diplomacy | **Education and investigation:** honest labels, events where they happened, an event drawer, arcs, the timeline, a primer, start-a-case, related intel and a country brief. |
| K13 | EIA layers | **Live grid flows, reactors offline today, country energy.** Not the 26,000 power plants. |
| K14 | Raver Watch | **Ask now and fix the time handling now.** The owner sends Mecha Jono the questions in section 10. Starcom shows upcoming items, lets the timeline reach forward (Tonight, This weekend), and lists notes without a place. |
| K15 | Order | **Fixes, then navigation, then the globe.** 1) The defects in section 12. 2) Block D with K1–K4. 3) Globe: zoom-out fade, K8, K6, K7, K5. 4) Apps: K12, K9, K10/K11, K13, K14. 5) The auto-tour. |

**Placed later the same week (the owner, 2026-10-02).** These are findings no block
owned:

| # | Question | Decided |
|---|---|---|
| K16 | The overlay collisions (section 6) | **Into block D, with K4.** Bottom-right overlays move into the dock, the key button and the place-pick hint stop landing on the ticker, and the 9999/10000 z-indexes go. |
| K17 | The Analyzer's user stories | **Before the pilot.** Three or four analyst stories (filter, inspect, pin to a board, export a finding) go into the intern walk in week 8. |
| K18 | The layout audit's blind spots | **Before D, as F8.** It checks 390×844 and opens each popup, menu, panel, chat window and notice in turn. |

The zoom-out fade needed no decision: marks fade by camera distance through one shared
uniform, so the Earth's markers no longer outgrow the Earth.
