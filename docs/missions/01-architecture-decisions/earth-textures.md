# The Earth's maps, sharp close up (decision K7)

Decided by the owner on 2026-10-01 (critique audit, K7: "sharper textures now, tiles
later") and in detail on 2026-10-07, as item 4 of block G. This record holds what was
there, what was decided and why, and how it was built.

## What was there (measured 2026-10-01, critique audit section 1.4)

| Map | Size | km per pixel at the equator | Used by |
|---|---|---|---|
| `earth-day.jpg` | 1600×800 | ~25 | EcoNatural (the default) and the terrain skin |
| `earth-dark.jpg` | 2048×1024 | ~20 | CyberCommand |
| `earth-blue-marble.jpg`, `earth-night.jpg` | 4096×2048 | ~10 | GeoPolitical; the night side |

- The camera can come down to about 70 km, where a 25 km pixel fills the screen.
- The maps were three-globe's own example images. Their source was never recorded;
  the day map was a vivid, relief-shaded style and the night map bluish, with the land
  showing through. GeoPolitical's Blue Marble is NASA's December 2004 mosaic.

## Decisions

| # | Question | Decision |
|---|---|---|
| K7 | Sharper close-ups (owner, 2026-10-01) | **Compressed 8K day and night maps in every mode now; NASA GIBS tiles fading in close up later.** |
| TX1 | Compression (owner, 2026-10-07) | **KTX2, Basis Universal.** Compressed on the graphics card: an 8K map takes about 22 MB of graphics memory on a phone and about 45 MB on a desktop, mipmaps included, instead of the 180 MB a plain image takes. |
| TX2 | Imagery (owner, 2026-10-07) | **Solar System Scope** (8192×4096, CC BY 4.0), the source of the planets' maps too. |
| TX3 | When the 8K maps load (owner, 2026-10-07) | **On approach**: once the camera comes closer than the default view (altitude 2.5), and only at the top two quality steps. A first visit fetches nothing more, and the golden cards, made at Low, never use them. Once fetched they stay. |
| TX4 | How the files are made (owner, 2026-10-07) | **Basis Universal's own WebAssembly encoder** (the npm package `ktx2-encoder`, MIT), run once from a scratch folder; nothing installed on the machine or added to the project. Homebrew has no KTX-Software package: it was first offered as the way, without being checked. |
| TX5 | GeoPolitical (owner, 2026-10-07) | **NASA's Blue Marble at 8K**: the same December 2004 topography-and-bathymetry mosaic as today's, cut to 8K from 21600×10800. This row first called it public domain: NASA's guidelines say its material is generally not under US copyright, and also that NASA imagery is made available under them, so it is credited as they ask and not called public domain. |
| TX6 | CyberCommand (owner, 2026-10-07) | **The 8K night lights only.** Its stylised dark base (black land, grey sea) has no 8K source and stays as it is. |
| TX7 | Today's day and night maps (owner, 2026-10-07) | **Solar System Scope everywhere.** The day and night maps far out are Solar System Scope's too, cut from the same 8K maps (day 2048×1024, night 4096×2048), so the 8K maps only sharpen what is there. Switching styles only close in would have changed the globe's look at the default distance. TX2's option text had called Solar System Scope's map "the same look as today's"; it was not. |
| TX8 | Credits (owner, 2026-10-07) | **Cards and a credits page.** Every card's credits gain an imagery line; a page lists every source and licence, linked from Settings. |
| TX9 | The two maps with no source (owner, 2026-10-07) | **Replaced with NASA's.** The water mask, whose source nobody could find, is NASA SVS's land-sea mask made to match the Blue Marble (public domain, credit "NASA/Goddard Space Flight Center Scientific Visualization Studio"), inverted so water is white, at 2048×1024: 101 KB as WebP against 162 KB. The relief map turned out to be NASA Earth Observatory's topography map already, resized (RMSE 0.77 of 255 against the download resized the same way, 39 for the map turned 180°), so it stays, credited. |
| TX10 | Where a card credits its imagery (owner, 2026-10-07) | **After its data, on the same line**: "Data: NOAA GFS · RainViewer. Imagery: Solar System Scope (CC BY 4.0) · NASA". On a line of its own it cost every stacked card 20 to 26 px of picture, and the golden war-critical-square, 498 px against its 486 px floor, would have been refused. |
| TX11 | How the credits open (owner, 2026-10-07) | **A dialog over the app, from Settings and at starcom.app/credits.** The globe stays beneath it, with its 8K maps; a page of its own would have dropped them. |
| TX12 | What the credits list (owner, 2026-10-07) | **Data and imagery**, from the same lists a card's credits come from, each image with what it was made from and what Starcom changed, as CC BY asks. The software Starcom ships is not listed here. |

## How it is built

- **The files.** `public/assets/textures/earth/8k/`: the day map (2.66 MB), the night map
  (1.04 MB) and NASA's Blue Marble (4.28 MB), each Basis ETC1S at quality 200 with
  mipmaps, the sRGB transfer function flagged, rows stored bottom first because a
  compressed texture cannot be flipped as it is uploaded. Made with `ktx2-encoder`
  0.5.0: 0.6.0 carries Basis Universal 2.5, whose encoder refuses images over 12.6
  million pixels to keep its 32-bit WebAssembly memory in bounds, and an 8K map is 33.5
  million. Decoded back with three.js's own transcoder and compared crop by crop with the
  sources before use.
- **The transcoder** is three.js's own, from the same version as its `KTX2Loader`,
  patched. Its Emscripten glue builds the functions that call into the decoder by
  compiling code from strings, which the content security policy forbids: it allows
  WebAssembly (`'wasm-unsafe-eval'`) but not `'unsafe-eval'`, and a worker made from a
  blob takes the page's policy. Unpatched, the transcoder would have failed while
  starting, on the live site alone (the dev server sends no policy), and the maps would
  have waited for it for ever: a review found it before it shipped. Allowing `'unsafe-eval'` would
  have opened the whole app to code compiled from strings for one decoder, so the two
  functions are replaced with the form Emscripten builds when it may not compile code
  (`scripts/lib/basisTranscoderPatch.mjs`), and only if they hash to the code reviewed.
  `node scripts/patch-basis-transcoder.mjs` writes `src/assets/basis/basis_transcoder.js`.
  Its test decodes the three maps in a Node that refuses code from strings, where
  three.js's own transcoder fails at once, and gets byte for byte what three.js's own
  decodes where it may run. The copy and three.js's WebAssembly are imported as URLs,
  so the build serves them under content-hashed names, which the year-long cache on
  `/assets/*.js` requires, and the WebAssembly comes from three.js as installed, never
  a copy that could fall behind it.
- **When** (TX3, as built). Only a person's own zoom fetches the maps: the controls fire
  `start` and `end` only for a press, a scroll or a touch, and the camera must end below
  altitude 2.5 and at least a hundredth closer than where the person's input began. A
  run of scroll steps less than half a second apart counts from the first, as a trackpad
  zooms in many small steps. The first visit's turn to the first reports flies to
  altitude 1.8 in code, so it fetches nothing, and nor does a drag there afterwards. The
  hundredth keeps a drag at the default view out: its altitude can read
  2.4999999999999996. Then only at the top two quality steps, once auto quality has
  measured the device (a slow device steps down within seconds, and would have paid for
  maps it could not draw), and never on a graphics card that cannot hold a texture
  8192 wide, which would draw an incomplete texture: a black Earth.
- **Loading** (`src/globe-engine/sharpEarthMaps.ts`, `useGlobeSharpMaps`): each map
  fetched once and kept while the globe is up, and put into the slot its skin samples:
  the day and night maps in the day/night skin, the day map in the terrain skin, the
  night lights in CyberCommand's, NASA's map in GeoPolitical's. Sampled as the 2K maps
  are: wrapping round in longitude, so the date line has no seam, and read as sRGB
  colour. A material built later, for another mode, gets the maps it draws; a map no
  mode has drawn yet comes on the next approach. The KTX2 loader and its two workers,
  each holding an 8K map in WebAssembly memory, live only while maps are on their way.
  A failure or two minutes without the maps ends them too, and the next approach starts
  afresh: a loader keeps a transcoder that failed to start for good. A loader is ended
  only once nothing is on its way, since one ended while its transcoder starts goes on
  to start a worker that nothing ends.
- **Captures.** A card renders and reads in one go, so the maps cannot land in the
  middle of one. A clip holds the globe's look for its whole length
  (`holdForCapture`): maps that arrive meanwhile wait for its end, so a clip is drawn
  with the maps it started with.
- **Credits** (TX8–TX12; `src/globe-engine/imagery.ts`). One list says who made each
  image the globe draws, from what, and what Starcom changed. A card's Data line goes on
  to name the makers of the images in its picture; a clip's end card does the same; the
  credits dialog lists every image and data source. Traced on 2026-10-07: the dark base
  is byte for byte Google's WebGL Globe texture (Apache 2.0); the clouds are Natural Earth
  III's, made from NASA's 2002 Blue Marble cloud map; the planets are Solar System Scope's
  2K maps, byte for byte; the Moon is NASA's CGI Moon Kit, from globe.gl's example. The
  globe says what it draws as it draws it: a map that failed and was drawn as a stand-in
  is not credited, nor clouds hidden, nor the planets while they are faded out.
- **Far out**, the day and night maps are Solar System Scope's at 2048×1024 and
  4096×2048: 166 KB and 326 KB as WebP, against 150 KB and 372 KB before, so a first
  visit weighs about the same.

## Open

- NASA GIBS tiles fading in close up, the second half of K7.
- A close look at the 8K maps on a phone: the upload of a map the first time it is drawn
  (22 MB as ETC2) has not been timed there.
- ~~The Intel Report model's own texture~~: closed 2026-10-08, when the model was retired
  for SVG glyphs everywhere (globe-visualization.md, D-F): nothing of it is drawn.
