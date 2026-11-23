# Decision D-LS — A real loading state for every layer (critique C4)

**Status:** decided 2026-10-16 (LS1–LS4) and 2026-10-17 (LS5–LS7), the owner's picks; built 2026-10-17. The note to Mecha Jono for v48 is posted (ce49c476-51a9).

The owner's critique, C4: "No loading experience: Comm Hubs looks like an empty cyber globe while its data
loads, and the same is true across all visualizations." Taken as the third of CR3's first-visit essentials,
after C5 and C7.

## What was measured (2026-10-16, the production build, headless)

Each of the 28 layers loaded fresh at `/?mode=<mode>&sub=<layer>`, watched every 500 ms for 60 s: when its
marks were drawn (the share handle's `describeView`), and what visible text said meanwhile. Times are
inflated by software rendering on a loaded machine; the gaps between layers are what matter.

| Layer | First paint → first mark | What the screen said meanwhile |
|---|---|---|
| Comm Hubs | 8.3 s → 30.7 s | the legend's "loading…", the relay chip |
| Conflict Zones | 3.0 s → 19.5 s | the same |
| War & Conflict | 3.2 s → 17.4 s | the same |
| Cyber Threats | 3.9 s → 15.7 s | the same |
| Scene events | 3.0 s → 23.4 s | the same |
| Drug-check alerts | 3.1 s → 15.6 s | the same |
| Relief | 2.7 s → 16.4 s | the same |
| Field missions | 2.1 s → 15.0 s | the same |
| Heat risk | 2.7 s → 14.4 s | the same |
| Diplomacy | 3.1 s → 10.7 s | the same, and its primer |
| Earth Weather | 2.6 s → 11.3 s | the same |
| Lifeboats | 2.5 s → 9.9 s | the same |
| Satellites | 9.0 s → 13.4 s | the same |
| AI Watch (four layers) | 2.1–3.2 s → 8.0–14.4 s | "Reading The Record…" |
| Missions | 2.8 s → 13.5 s | "Reading the missions posted…" |
| Eco Disasters | quakes about 30 s after the globe could be captured (useGeoEvents) | the legend's "loading…" |
| Space Weather | fields, not marks: drawn, not counted | the legend |
| Scene incidents | nothing drawn: none in the window | the legend alone: "1 past its end, not drawn; 2 naming no place, listed" |
| Harm reduction sites | nothing drawn | nothing at all: no feed line either |
| RLSH | nothing counted (registry loaded, 228 days old) | the legend |
| Resource Zones | nothing counted (EIA and USGS loaded) | the legend |

The legend's "loading…" is 10 px text in a box that may be closed. The first-visit loader covers only the
Earth's surface textures. And `whenReady` (the share handle) waits for a list of layer-specific readiness
checks that does not include Eco Disasters, Comm Hubs, Cyber Threats or Conflict Zones: a card made when it
released could predate their data (found in C5's eco probe).

## What is decided

| | Decision |
|---|---|
| LS1 | (2026-10-16.) **On the globe and in the job rail.** A compact EVA status line on the globe, under the mode bar, while any shown layer loads; each load is also a tile in the existing job rail with its real progress. Both go when the marks land. |
| LS2 | (2026-10-16.) **Each feed, as it stands.** Each source by name, its real state and the time waited, and counts where the layer knows them ("Reading The Record · 14 of 68"); a feed that fails says why. Real progress only (the EVA rule): no fake timers. |
| LS3 | (2026-10-16.) **A scanning sweep.** A slow sweep across the visible disc in the layer's colour, low opacity, gone when the marks land. It never draws anything that could be read as data, and it is not in a card or a clip. |
| LS4 | (2026-10-16.) **Empty or failed, on the globe until the next action.** The status line turns to the outcome ("None in the window: 1 past its end · 2 naming no place", or "Submarine cable map did not load: …") and stays until the person changes layer or dismisses it. An empty globe never looks like a quiet world. |
| LS5 | (2026-10-17.) **`whenReady` waits for every shown layer's feeds** to settle, within its timeout, saying which it gave up on: no card predates a shown layer's data. Contract v48, and a short note to Mecha Jono whose text the owner approves first. |
| LS6 | (2026-10-17.) **Intel Reports gets a feed line:** the relays answered and the reports read ("3 of 6 answered · 48 reports"), done when the read settles; in the status, the key and on cards like every feed. |
| LS7 | (2026-10-17.) **Harm reduction sites gets a feed and a legend,** so it says Acquiring, Did not load or Nothing drawn like the other Raver layers; first, why it draws nothing today is found and reported. |

## Build plan

Each step: failing tests first; mutations; the affected tests and the source-scan tests; a build; a probe;
push; the deploy checked.

1. **The model.** One pure function from the shown layers, their feeds (each tagged with its layer), what
   each layer drew, and when each feed was first seen loading, to the status: loading (the feeds waited on,
   with times and counts), failed (which and why), empty (which layer, in its feeds' own words), or nothing.
2. **Feeds know their layer.** `FeedProvenance.layer`, set where each feed is made (`Globe.tsx` and the
   Watch, Missions and War & Conflict hooks); and what each layer drew, from the legend it publishes when it
   draws, with one published by the layers that have none (RLSH, Resource Zones, Harm reduction sites).
3. **The status line** on the globe (LS1, LS2, LS4), in a dock slot under the mode bar.
4. **The job rail** tiles, a `layer-load` kind (LS1).
5. **The sweep** (LS3), over the globe's disc on screen, outside the canvas a capture reads.
6. **Probe every layer** again: the status shows from first paint, says each feed, goes when the marks
   land, and an empty or failed layer says so.

## Built (2026-10-17)

- **The model** (`src/features/globe/loadStatus/layerLoadStatus.ts`): the feeds waited on, with the seconds
  since each was first seen loading and the progress a layer counts; the feeds that failed and why; the layers
  whose feeds are all in and which drew nothing. A feed not yet reported is waited on, not a failure; a layer
  that cannot say what it drew is never called empty. Feeds are keyed by their layer and their place in it,
  not by name: Raver Watch's names grow as its items arrive, and a renamed feed restarted its seconds and
  opened a second job (seen in the probe).
- **Feeds know their layer:** `FeedProvenance.layer`, set as each block of `Globe.tsx`'s feed list starts and
  in the Raver, Hero and AI Watch, Missions and War & Conflict hooks; the four AI Watch layers share theirs.
  What a layer drew is read from the legend it publishes only when it draws (18 layers); RLSH, Resource
  Zones, Space Weather and Harm reduction sites publish none and are never called empty.
- **The status line** (`GlobeLoadStatus.tsx`), in a new top-centre dock corner: "Acquiring", each feed with
  its layer and its seconds or "14 of 68"; "Did not load", each failed feed and why; "Nothing drawn", the
  layer and its feeds' own words. An outcome stays until dismissed or the layers shown change.
- **The job rail:** a `layer-load` job per feed waited on (glyph `job:layer-load`, Lucide's cloud-download),
  with its progress; done when it is in, failed with why, done when its layer is no longer shown.
- **The sweep:** a faint turning wedge over the globe's disc (from `computeGlobeScreenBounds`, followed every
  200 ms), in the layer's colour where the tokens give one, the accent otherwise; a DOM element beside the
  canvas, so never in a card or a clip; still for reduced motion. It stops once the layer has drawn, and the
  line says "Still reading" instead of "Acquiring": Missions, War & Conflict, Earth Weather's cloud image and
  Raver Watch read on for up to 30 s after their first marks.
- **Probed** on the build, all 28 layers (2026-10-17): 24 showed the line 2–6 s after loading began, each feed
  with its seconds, and a job tile; it went when their marks landed or said "Still reading". Satellites said
  "Did not load: … 403" (CelesTrak refusing this network after the evening's probes); Scene incidents ended on
  "Nothing drawn" with its reasons. No line for Intel Reports and Harm reduction sites (no feed), nor RLSH
  (its registry is in at once and it publishes no legend).

## Built, LS5–LS7 (2026-10-17)

- **`whenReady` waits** while a shown layer's feed is still loading (`useGlobeShareCard.ts`), naming which
  when it gives up; contract v48. A feed counts as still loading when nothing of it is in, or when it counts
  its progress short of its total: Intel Reports had a time after one relay of six answered, which
  `feedState` calls loaded, and `whenReady` released with 11 reports drawn. A feed that has not reported at
  all is not waited on. Probed: Comm Hubs released at 23 s with its 1,413 cables drawn (before, with none);
  Eco Disasters with 226 events; Intel Reports at 17 s with 6 of 6 relays answered and 45 reports.
- **Intel Reports' feed line** (`useIntelReportsFeed.ts`): "Intel Reports from the relays (5 of 6
  answered)", a relay answered once it sent an event or the end of what it holds; in when all have, or after
  the read's 30 s; failed only if none answered. In the status, the key and on cards.
- **Harm reduction sites:** Mecha Jono posted none (0 of the 799 Raver Watch notes on The Record carried
  `harm_reduction_site`, 2026-10-17), and this build draws none (`implemented: false` in the catalogue).
  Shown, it reads The Record and its feed says which: "(none posted)", or "(N posted, not drawn: this build
  does not draw them yet)"; the status then says "Nothing drawn" in those words.
- **Found on the way:** the key called a source answered seconds ago "0m ahead", as if a forecast: its clock
  ticks every 30 s, and a fresh time is past it. A time less than a tick ahead is now "0m ago".

## Open

- **The note to Mecha Jono** on v48 was approved as drafted and posted 2026-10-17, reply ce49c476-51a9 in
  the J7 thread of the handoff doc. It also asks the shape of harm reduction sites, if they plan to post them.
- **For D-ML, the new English:** "Acquiring", "Still reading", "Did not load", "Nothing drawn", "Dismiss", "{n} s", "{done} of
  {total}"; the job glyph's meaning "A layer's data, loading".
