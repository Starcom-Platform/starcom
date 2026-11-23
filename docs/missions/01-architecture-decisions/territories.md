# Territories: a Classic style, and fine settings for every style (decision K5)

Decided by the owner on 2026-10-01 (critique audit, K5) and in detail on
2026-10-07, as item 5 of block G. The country fills were once a raised,
four-coloured shell with green borders. In September they became one quiet tone
on the ground, for reasons that still hold. The owner remembers the old look as
the better one. This record holds what was measured, what was decided and why,
and the build order.

## What was there (measured 2026-10-07)

- **One renderer, three looks.** `useNationalTerritories3D` draws the baked meshes
  in `public/geopolitical/territories-baked/lod{0,1,2}` (330, 422 and 615 parts,
  242 territories) as one batched mesh (`territoryBatch.ts`), with a per-vertex
  colour that is fed `TERRITORY_FILL_COLOR` for every part.
- **Why the old look went** (critique audit 1.1). Three changes did it:
  - `d166d5bb` lowered the fills from 3.5 units to 0.2. At 3.5 the shell covered
    every mark drawn under it, whether by depth or by draw order.
  - `1fc59d3a` dropped the id hash that coloured fills from four palettes. The
    hash meant nothing, and 27–31% of settled borders came out in the red and
    amber reserved for contested ones.
  - The same commit dropped the green international borders.
- **The old default palette** was `00ff41`, `00b37a`, `0094ff`, `ffcc00`, chosen
  by a hash of the id, so neighbours often matched.
- **Settings that do nothing.** `labelVisibility` (nothing draws a country name)
  and `useCustomColors`. "Reset rendering" writes a fill lift of 0.5 and
  far-side hiding on, while the defaults are 0.2 and off.
- **The neighbour graph.** Territories that share a border edge, at the bake's
  quantization (1e-6 degrees), give 327 neighbour pairs at every detail level,
  with at most 17 neighbours for one territory. DSATUR colours that graph with
  four colours. Natural Earth's own `MAPCOLOR7` has three clashes: ISR–PSX,
  CHN–HKG and CHN–MAC.
- **Every baked part's `countryCode` is the source's `ADM0_A3`**, at all three
  detail levels, so one colour per territory reaches every part of it.

## Decisions (K5, TS1–TS8)

From the owner, 2026-10-07 (multiple choice, all the recommended options):

- **TS1 Height.** Classic stands at 3.5, like the old look. Every layer's marks
  and lines draw over the shell while it is raised, checked with the layer
  audit. Ground fields (temperature, rain, wind, clouds) stay under it and are
  tinted by it.
- **TS2 Palette.** Classic fills use four colours, and neighbours never share
  one: `00ff41` green, `00b37a` teal, `0094ff` blue and `8a6cff` violet, which
  takes the old amber's place. Red and amber stay out of every fill. The
  international border is green `00ff41`.
- **TS3 Default.** A first visit sees Classic. Cards and clips keep the quiet
  tone unless a shot asks for Classic: the shot's look gains a `territories`
  field (contract v33). The 12 goldens are unchanged.
- **TS4 Labels.** Country names are drawn by rank and fade with zoom, like the
  solar system's labels. The label slider controls them.

From the owner, 2026-10-08 (multiple choice, all the recommended options), with
Classic live:

- **TS9 Classic's fill opacity is 35%,** a step quieter than the old look's 50%.
  The four colours still read apart, and the marks and the Earth's own texture
  show through.
- **TS10 Country names are on screen only, and on a card when its shot asks**
  (a new shot field, contract v34). Cards and clips are otherwise unchanged.
- **TS11 Names show by rank and zoom:** Natural Earth's own label ranks, the
  largest countries far out and more as the camera comes in, never overlapping.
  The label slider moves how many.

From the owner, 2026-10-08, on the names (multiple choice, all the recommended
options), after a design panel (three approaches, two judges) chose names drawn
from one text atlas in the globe's own scene, under every mark:

- **TS12 Natural Earth's names, as it writes them,** de facto control included
  (W. Sahara, Palestine, Somaliland, N. Cyprus, Kosovo, Taiwan, Siachen Glacier).
  A card that shows names says so: "Country names and where they stand are
  Natural Earth's, which shows de facto control; some are disputed."
- **TS13 A country keeps its name close in.** Natural Earth's MAX_LABEL, the zoom
  where a country's name gives way to its provinces', is not applied while there
  are no province names to give way to.
- **TS14 A card that shows names credits them on its Data line:** "Names:
  Natural Earth", and the credits list it.

Mine, reversible:

- **TS5 Two styles, named Classic and Quiet.** Quiet is today's look, unchanged.
- **TS6 Each style keeps its own fine settings.** Only what a person changed is
  stored, and the defaults are derived on every read (the rule `markerStyles.ts`
  already follows), so switching style never loses a tweak. Each style has a
  reset.
- **TS7 The colour is computed once, at build time.** A script writes
  `territoryColours.ts` (`ADM0_A3` → 0..3) from the source GeoJSON, and a test
  recomputes the neighbour graph and fails if two neighbours share a colour.
- **TS8 The reserved colours stay reserved.** A colour chosen per border type
  cannot be the disputed red or the line-of-control amber unless it is for
  those borders. The same holds for fills.

## Build order

1. The four-colouring: the script, the generated table and the neighbour test.
   Nothing visible changes.
2. The style setting, with Classic's fills and green borders at today's height.
   Classic becomes the default on screen, while capture mode draws the shot's
   style, Quiet unless the shot names one (contract v33). Each style keeps its
   own settings. The popup gets a style switch, and its reset matches the
   defaults.
3. The raised shell: Classic at 3.5, with every mark layer drawn over it at the
   shell's height. The layer audit confirms every layer draws marks a person
   can see.
4. Country labels (TS4), decided further in TS9–TS14: on screen, on a card
   whose shot asks (contract v34) and in a clip that asks (v35).
5. The rest of the fine settings: height up to 3.5, colour per border type,
   dash length, shading strength and cross-fade length. Fill opacity, border
   width, border opacity, the disputed and maritime toggles and the detail lock
   exist already.

## Step notes

### Steps 1 and 2: the colouring, and the style (2026-10-07)

- **The colouring.** `scripts/colour-territories.mjs` (`npm run geo:colours`)
  reads all three detail levels, builds the neighbour graph from shared edges
  (`scripts/lib/territoryNeighbours.mjs`), colours it with DSATUR and then
  balances the slots. DSATUR alone fills the lowest free slot, so every island
  landed in green, 128 of 242. After balancing the counts are 61/61/60/60. The
  result is written to `src/geopolitical/theme/territoryColours.ts`.
  `territoryColours.test.ts` recomputes the graph and fails on a clash, on a
  missing or extra code, or on a table that differs from what the script would
  write today.
- **The styles** (`territoryStyles.ts`): Classic and Quiet, each style's
  defaults, the ranges, the Classic palette and the green border. Changes are
  stored per style (`styleSettings`), and only the values a person changed.
- **The settings** (`useGeoPoliticalSettings.tsx`, storage v3):
  - Every reader is handed the resolved config, with the screen style's look in
    the four fields they always read. A change to those fields is stored as a
    change to the screen style.
  - The migration turns a pre-K5 browser's non-default values into changes to
    Quiet.
  - The territories' section is memoized on its own, so a change elsewhere in
    the config no longer hands the territory layer a new object.
- **Drawing either style without a rebuild:**
  - Each fill part carries its Classic colour per vertex. The material holds
    Quiet's tone, and a uniform selects between them (a select, not `mix()`,
    so Quiet cards stay pixel-exact).
  - `recolourLineBatch` repaints border batches in place.
  - `applyTerritoryLook` puts a style's look on what is built. The hook runs it
    from the scene's render hook whenever the style drawn
    (`globe-engine/territoryLook.ts`) changes: the screen's between captures,
    the card's during one or for a whole clip.
- **Cards** draw Quiet unless the shot names `appearance.territories`
  (contract v33). A plan or render resets the style when it ends, however it
  ends. The card record states `appearance.territories` (schema 22), and the
  key prints the territories in the card's style (`legendsForCard`).
- **The key** gains a "Countries" line for Classic: four colours that mean only
  that neighbours differ.
- **The popup** gains the style switch, a reset for each style, and a correct
  "Reset rendering". That button had written a lift of 0.5 and far-side hiding
  on, against defaults of 0.2 and off.
- **Faults found on the way, fixed here:**
  - Every territory setting change rebuilt the whole layer twice. Two rebuild
    effects listed `buildForLOD` among their dependencies, and it changes
    whenever the config does. Now only geometry-changing settings rebuild.
  - The fill lift slider moved nothing after the first build. A rebuild moves
    new parts into the group already in the scene without its scale. The look
    now sets the scale.
  - The first build could run twice. It is asynchronous, and the activation
    effect re-ran on a settings change before it landed; in a locked level of
    detail the lock effect also started one. Groups that never reached the
    scene took the refs, so nothing could change what was drawn.
  - The outgoing fills of a cross-fade faded at the bake's radius, not at
    their own height.
- **The watchdog** (`.local/scripts/watched.sh`) used to stop stray test
  processes with a global `pkill`, which could reach another session's mutation
  run. It now stops only processes running in this repository.

### Step 3: the raised shell, and every mark over it (2026-10-08)

- **The survey.** A read-only workflow of seven agents catalogued 139 scene
  roots. It found three traps that a plain scale would miss:
  - draw order, which decides more than height does;
  - roots that are replaced at every refresh, such as the aurora;
  - three-globe's own arcs and rings, which live inside its root beside the
    Earth.
- **The lift** (`globe-engine/shellLift.ts`): `(100 + h) / (100 × BASE_MAP)`,
  which puts the base map's band on the shell.
  - Each rider marks its root with `ridesShell()`. The territories layer sets
    every marked root's scale at the start of each render, from the style that
    render draws.
  - The world matrix is updated at once. three.js updates matrices before the
    scene's `onBeforeRender`, so a scale left to the next update reached the
    next frame: a Quiet card drawn after a Classic frame showed every mark
    lifted.
  - three-globe's arcs and rings are found by their place among its layer
    groups (pinned by a test against its source) and lifted. Their feet and
    rings now sit on the surface bands.
- **Draw order.** While raised, the shell's group draws at −1: after the ground
  fields (−2) and before everything at 0 or above. On the ground it keeps 95,
  so Quiet draws as it always has.
- **Reading the scene for a card** (`readAtLift`): a card's inset and its "in
  the picture" count are read after the frame is captured. By then a live frame
  may have lifted the riders again, so they are read at the card's lift.
- **The key** prints the territories after every other entry. The store keeps
  publication order, so where the borders fell depended on which layer finished
  loading first: two cards from one page keyed them in different places. The
  goldens were re-kept for that order, which is their only change.
- **Places from a pointer** (`groundUnderShell`): the hover, the place pick,
  the measure tool, the right-click menu and border hover read where the ray
  meets the raised shell. The cursor rides the shell, and a card's featured
  glyph is projected with the card's own lift.
- **A card that missed its own style is refused.** The territories layer notes
  the style each capture drew, and compose refuses a card whose capture drew
  another style, or none. The note is taken only when the groups the layer
  styles are the ones in the scene (below).
- **Why a page of cards came out Classic** (found 2026-10-08). Two golden runs,
  each the first after a fresh preview, drew a whole page of cards Classic under
  records that said Quiet; the reruns passed. The level-of-detail watcher looks
  on its first frame, while the first build is still loading, and started a
  second build there for the camera's level. When that level's files came in
  first, its groups took the layer's place in the registry, which keeps the
  first group it is given. The first build's groups then took the hook's refs
  and never reached the scene. Every look after that went onto groups nobody
  saw, and the scene drew the other build's as built: Classic. A cold load made
  that order likely. The style check passed it, since the hook noted the style
  it had put on its own groups. Now:
  - The watcher starts no build while one is under way, the first among them.
  - A first build replaces whatever the registry held under its id
    (`LayerRegistry.replace`), and the groups leave the scene when the hook
    unmounts. The simple overlays (Diplomacy, Conflict Zones, Resources) had the
    same hole on a remount and take the same fix.
  - The style is noted only when the styled groups are the drawn ones, so a
    stale group drawn as built is refused, whatever put it there.
- **A test names every file that adds to the scene** and what it is (rides,
  ground, sky, places itself, own scene, registry, debug), so a new layer
  cannot be left under the shell by being forgotten.

### Step 4: country names (2026-10-08)

- **How they are drawn.** One text atlas and one instanced draw, in the globe's
  own scene, so a card carries the names exactly as drawn. The group draws at
  order 130: over the fills, borders and outlines, under every mark a person
  clicks (190 and up). It rides the shell, so a name stands on Classic's raised
  fills and on Quiet's ground alike. Names take no picks and test no depth; the
  far side is dropped by how squarely a name faces the camera.
- **Which names.** Natural Earth's own: LABELRANK and MIN_LABEL against a zoom
  read from the local map scale at the view's centre
  (`log2(2π · px per radian / 256)`). The label slider moves the thresholds,
  never the size: 0 draws none, 60 is Natural Earth's own choice, 100 the most.
  On screen a name shown stays until it falls 0.15 below its threshold, so names
  do not flicker as the camera moves. Collision always has the last word: names
  never overlap, never cover a glyph or a badge, and cover at most two small
  dots. A name that meets a mark moves one line up or down or is dropped. A
  two-line shift was tried and named France beside Germany's glyph, over the
  wrong country: kept to one line, and a test pins it.
- **MAX_LABEL is not applied (TS13):** a country keeps its name close in, as
  there are no admin-1 names to replace it.
- **De facto names (TS12):** Natural Earth's, as it writes them. A card or clip
  that draws them says so among its caveats.
- **Cards (TS10, v34).** None unless the shot asks; then Natural Earth's own
  choice, whatever the screen's slider. Refused while the overlay is off or the
  names' face has not loaded, and refused when a capture drew names it did not
  ask for, or none it did. The names keep clear of the card's own label and
  leader, placed before the capture by the layout's own rule, and a close-up
  inset takes the corner over the fewest names when the corners are otherwise
  as good. The record lists the names placed; "Names: Natural Earth" is on the
  credits line (TS14).
- **Clips (v35, clip schema 7).** `recordClip({ countryNames: true })` places
  the names frame by frame with the clip's own memory and fades them over a
  fifth of a second of footage, counted in frames. Each frame is counted once,
  and a live render between frames changes nothing, so the same clip draws the
  same names however fast the page renders. A frame that drew none refuses the
  clip.
- **Measured.** A live card over Europe at altitude 1.2 placed 35 names (build
  7bba6a3d). Two goldens ask for names: `planet-names-classic-wide` and
  `europe-names-quiet-square`.

### Step 5: the rest of the fine settings (2026-10-08)

The owner chose border colours from the palette (2026-10-08). The rest is mine
and reversible.

| Setting | Range | Default | Kept |
| --- | --- | --- | --- |
| Colour per border kind | palette swatches | today's colours | per style |
| Dash length | 50–300% of today's (3 on, 2 off) | 100% | per style |
| Shading strength | 0–100% of today's sun shading | 100% | per style |
| Cross-fade length | 0–2000 ms | 500 ms | one, for the layer |

- **The palette.** Every kind of border may be pale, grey, green, cyan, blue or
  violet. Red is offered only for disputed borders and amber only for lines of
  control: they mean "not settled" (TS8), and a settled border in either would
  say otherwise. The key and the cards draw the colours as set. What is stored is
  the swatch's name, so the palette can be retuned without rewriting anyone's
  settings.
- **Cross-fade length** is motion, not a look, so it is one setting for the layer
  rather than one per style. Reduced motion still makes every fade instant.
- As before, only what a person changes is stored; every default is derived.
- **Borders are built in the style's own colours,** which differ by kind, and a
  person's colours are put on at render. A batch whose lines share one colour
  when built is drawn in one colour for good; built in a person's colours, two
  kinds made alike could share such a batch, and a card in the other style could
  not tell them apart again.
- **Shading** eases the sun's light toward flat (`uShading`), so 100% is exactly
  today's and the cards' look is unchanged.
- **Seen in the app** (dev server, 2026-10-08): over Kashmir with the settled
  border cyan, the disputed one violet, the line of control blue, shading 0 and
  dashes at 300%, the globe and the key drew them as set. The popup shows each
  kind's swatches in one row, red and amber only where they belong.

### Open: a card that drew the screen's fills (found 2026-10-10)

- The golden `raver-night-story`, kept on 2026-10-10 from build 7a88f915's run,
  drew North America in Classic's colours, green land and bright coasts, under a
  record saying `territories: quiet`. Every build since, and 7a88f915's own
  commit built again, draws it Quiet, as its record says, the same in every run:
  so the kept copy caught a race, and the race is still there to be caught. It
  is the class of the LOD watcher's (ba07a6d9): a capture's own style not yet in
  place when its frame was read. Re-kept from dde8d180 after looking. To find: a
  repeatable way to make it happen, then whenReady waiting on the card's style
  being drawn, not only set.
