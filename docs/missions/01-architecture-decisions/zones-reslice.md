# Decision D-ZR: the whole globe, re-sliced

*Recorded 2026-10-17. It replaces the Zone parts of D-ZS ([zones-and-spheres.md](zones-and-spheres.md)) once the new
partition lands; until then D-ZS describes what is drawn.*

## The ask (the owner, 2026-10-17)

Zones and Sectors "were done incorrectly". They should be "a re-slice of the entire globe as an alternative way to
designate areas and sub-areas across the world outside of nation states". What shipped instead looked "confined to very
specific areas exclusive to geographic features related to tectonic plates and volcanism". Spheres and supranational
organisations (the EU, BRICS) are to work the same way, all behind "a toggle that switches between Nation States" (the
existing territories, "absolutely fantastic") "and several other ways to slice up the surface of the world".

On the shape: "Zones contain Sectors. Something contains Zones. Tectonic plates should not be what contains zones...
but Tectonic plates ARE something to consider", and "tectonic plates play a significant role, but not an exclusive
role". The template is the East African Rift Zone: "everything impacted geographically by the magma plume underneath",
across twelve countries and the Nubian, Somali, Victoria and Rovuma plates, "so NOT just the fault lines".

## Decisions

| | Decision |
|---|---|
| **ZR1** | **The whole surface, three levels.** Every point on Earth is in one Sector, every Sector in one Zone, every Zone in one Terra or Mare. |
| **ZR2** | **Terrae and Maria**, the IAU's naming for planetary surfaces, are the top level. There are 17: Terra Africana, Arabica, Europaea, Tethyana, Borealis, Sinica, Indica, Sundaica, Sahulica, Laurentia, Amazonia and Antarctica; Mare Pacificum, Atlanticum, Indicum, Arcticum and Australe. Ids are `terra:<slug>` and `mare:<slug>`. (Names revised on 2026-10-18: ZR13.) |
| **ZR3** | **Terra Tethyana** covers the belt where the Tethys Ocean closed: Anatolia, the Caucasus, the Iranian Plateau, the Hindu Kush and the Pamirs. |
| **ZR4** | **Land ends at the continental margin.** Mostly enclosed seas belong to the lands around them; islands on ocean crust are in the Maria. |
| **ZR5** | **Plates first, never alone.** Lines between lands follow plate boundaries, else sutures or great divides. A Zone is never split: where its system straddles a boundary, the container's line goes around it. |
| **ZR6** | **A Zone is a whole region bound by one system** (a rift, belt, basin, shield, plateau, delta, arc, ridge or gyre) and everything it shapes. Zones tile their container, about 8 to 20 each. Country borders set no edge. |
| **ZR7** | **Sectors are layered:** plate boundaries, then physiographic divides, then ecoregion edges on land (RESOLVE 2017; at sea the ocean fronts and the seafloor's divides, since the Marine Ecoregions of the World allow no redistribution), then a generated equal-area grid where nothing else divides (H3 is not equal-area). Each is 50,000 to 500,000 km², and records what each of its edges follows. |
| **ZR8** | **The eleven ZSP 1.0 Zones retire in one swap** when the whole partition passes the checks. Until then they are drawn as now. An old id is kept only where the new Zone is the same region grown; every other id is listed in the manifest's `retired`, with the Zones that now cover it, so reports naming it still find their places. |
| **ZR9** | **Mecha Jono makes the data** as ZSP 2.0 (one manifest, one GeoJSON file per container, Sectors as the atoms, cut so that neighbours share every edge). Starcom's build runs the same checks as the export and refuses a set that fails. |
| **ZR10** | **Part 2, also Mecha Jono's:** cited membership lists for Spheres (moving the thirteen out of `areaRegistry.ts`, CR6) and for Organisations (new), with no geometry. |
| **ZR11** | **Everything complete by Friday 13 November**, "a deadline; work should be complete by then, not after" (the owner, 18 October, correcting the first handoff's "after the 13 November work"). Mecha Jono's dates: the 17 outlines Fri 23 Oct; the Spheres and Organisations lists Mon 26 Oct; Terra Africana Fri 30 Oct, reviewed by the owner on the globe; the rest Mon 9 Nov; the swap by Thu 12 Nov. Starcom's toggle, reader and checks are due Mon 26 Oct. |
| **ZR12** | **Meanwhile Starcom builds** one rail button with a picker in place of today's three (National territories, Zones, Spheres), and the toggle (Nation States, Zones, Spheres, Organisations), and the ZSP 2.0 reader and checks against a test partition of its own that is never shipped. |
| **ZR13** | **The names, revised before Stage 1 (the owner, 2026-10-18).** Terra Australis becomes **Terra Sahulica**: Sahul is geology's name for the continent of Australia, New Guinea and Tasmania. It is free of *terra nullius*, the fiction used to dispossess Aboriginal and Torres Strait Islander peoples, and "southern" is then said once, by Mare Australe. Terra Americana and Terra Andina become **Terra Laurentia** and **Terra Amazonia**, geology's names for the two continental cores, so neither takes the word America from the other. Terra Europa becomes **Terra Europaea**, the adjective, as *terra*'s other names are. **Terra Sinica** stays. Kept: Latin, the IAU's language for planetary surfaces, so a name is the same in every language Starcom speaks and belongs to no nation. |
| **ZR14** | **A Sector's landform in the IAU's own word** (the owner, 2026-10-18): an optional `descriptor`, one of the IAU's descriptor terms (Planitia, Planum, Montes, Chasma, Fossae, Vallis, Sinus, Lacus, Fretum, Insula, Vastitas, Regio and the rest), shown beside its English name. The reader takes only those words, and the checks refuse any other. |
| **ZR15** | **Split, the owner 2026-10-24: "Mecha Jono will make the 5 Maria."** Starcom makes the 12 Terrae, with their Zones and Sectors (the line between the two: ZR16). Before that, on hold: **Starcom makes the partition?** The owner raised it on 2026-10-23, then asked for the history first ("maybe I'm being too assertive here"), so ZR9 and ZR11 stand until the owner decides. As raised: "no waiting, mecha jono shouldn't be responsible for Terra, Zones, or Sectors... they will merely need to be updated about it and forced to upgrade their systems appropriately." Starcom builds ZSP 2.0 to ZR1–ZR8 and ZR13–ZR14, from the sources below, as a labelled 0.1° grid turned into outlines that store each shared edge once. Drafts are commits on a `zsp-2.0` branch, where NavCom's `zsp-vendor.mjs` reads `public/geopolitical/zones/` by commit, so starcom.app serves 1.0 until the swap. Dates: Stage 1 Tue 27 Oct, Terra Africana for the owner's review Fri 30 Oct, the rest Mon 9 Nov, the swap Thu 12 Nov; about 50–55 hours. The plan and the notes to Mecha Jono and NavCom are drafted in [Zones and Spheres: where it stands](https://claude.ai/artifact/7RUfV3NZtpkTq4FpKcoNQq); nothing is built or sent. |
| **ZR16** | **The line, the owner 2026-10-24: "Starcom draws it."** Starcom draws all 17 container outlines, the 12 Terrae and the 5 Maria, the land–sea line at the continental margin (ZR4) included. Mecha Jono fills each Mare with its Zones and Sectors inside that line, in ZR9's format, each Mare's outer edge being Starcom's line point for point. Starcom makes the 12 Terrae's Zones and Sectors. Both halves pass the same checks. The note telling Mecha Jono is drafted in [Starcom to Mecha Jono: share contract v50](https://claude.ai/artifact/V1HHg5rTjQGAiH3dECdASN), for the owner to approve; it asks how the Maria will be handed over. |
| **ZR17** | **The line from Mecha Jono's draft, now (the owner, 2026-10-24).** Mecha Jono's [Maria Review](https://claude.ai/artifact/ReCWFQ3dArVW84uJUTmLMt) built the five Maria (72 Zones, 1,006 Sectors, 307.2 M km², every check passing) on a draft line: Natural Earth's 2,000 m line and EarthByte's continental outlines, both sources listed below. Asked how Starcom draws the line ZR16 gives it, the owner chose "Start from MJ's draft" over drawing it fresh or holding, and "Now, before W4". Starcom rebuilds that mask from the same sources, checks it against ETOPO 2022 and ZR4, fixes what is wrong, draws the borders between the Maria, and publishes the result as Starcom's line; the 12 Terrae's own borders follow with the Terrae. The six maps' verdicts are the owner's, on Mecha Jono's page. |
| **ZR18** | **Continental fragments, above water only (the owner, 2026-10-25, answering Mecha Jono's S7).** A fragment's dry land and its shelf join a Terra (New Zealand, New Caledonia, the Seychelles' granite islands, Madagascar); its submerged plateau beyond the shelf (most of Zealandia, the Rockall and Kerguelen plateaus) lies in its Mare, so no Terra is mostly under water. With it, in the same answers: trenches lie at sea, and ocean islands are not decided by crust type alone (Iceland, the Maldives, Chagos and the Tonga–Kermadec and Izu–Bonin–Mariana arcs are coded as their Mare). The grid: 3,600 × 1,800 cells of 0.1°, row 0 the northernmost, column 0 at −180°, values for cell centres, raw little-endian uint32 with a JSON sidecar; the container raster codes every cell `terra:<slug>` or `mare:<slug>`; Mecha Jono's label file and manifest under `data/zsp2/maria/` on `zsp-2.0`, Starcom's vectoriser writing `public/geopolitical/zones/mare-<slug>.zsp.geojson`; the reader takes the edge types `front` and `margin` and the IAU term Arcus; Mecha Jono's 72 Zone ids reserved. Posted to Mecha Jono 25 Oct. |
| **ZR19** | **Terra Africana's edges (the owner, 2026-10-25),** asked with PB2002 read at each place. **Sinai and the Levant to Arabica:** Africana ends at the Gulf of Suez rift and the isthmus, though PB2002 puts Sinai, Jerusalem and Beirut on the African plate, because the Dead Sea rift shapes both its sides and a Zone is never split (ZR5). **Sicily and Malta to Europaea,** with the Calabrian arc and the Apennines, the line through the Sicily Channel, though PB2002 puts them on the African plate. **Gibraltar: the Strait.** All of Morocco, the Rif included (PB2002: Eurasia), in Africana, the Betics in Europaea, the Alborán Sea split along the arc's axis. Unasked, by the rules: the Mediterranean's waters split along the plate line (the Hellenic and Calabrian arcs), the Levant's and Sicily's margins with their land; Madagascar, the Seychelles and Socotra (all on PB2002's Somali plate) in Africana. **The Red Sea and the Gulf of Aden split along their axes** (asked the same day): each side's half is its own Terra's margin Zone, as an enclosed sea between two lands, and the Afar triangle, where the rifts meet on land, stays in Africana. That bends ZR5's letter for the water only. |
| **ZR20** | **Arabica's and Europaea's edges (the owner, 2026-10-25).** **The Zagros and Bitlis: the mountain front,** where the folds rise from Mesopotamia, the Persian Gulf and the Arabian platform of SE Turkey; the whole fold belt goes with the Iranian Plateau to Tethyana, though PB2002 puts it on the Arabian plate. **The Black Sea at its median, the Caucasus at its northern foot:** the whole Greater Caucasus and Turkey's Pontic coast in Tethyana, though PB2002 puts the sea and the coast on the Eurasian plate. **The Urals: the belt to Europaea,** with Novaya Zemlya, the line at its eastern foot where the West Siberian Basin begins, and south of the range the Ural River to the Caspian. **East of Sicily, the plate line:** the Ionian and Levantine basins Africana's to the Hellenic and Cyprus arcs, the Greek and Turkish margins with their land. With them, from the handoff's own reference Zone (the owner, 17 October), the East African Rift Zone takes in the Ethiopian Highlands, Afar and the Shire and Lower Zambezi to Beira. |
| **ZR21** | **Tethyana's east, Tibet, and the size (the owner, 2026-10-25).** **The Turan lowland to Tethyana** (the Karakum, the Kyzylkum, the Aral basin: the closed Tethys's foreland), **the Kazakh steppe to Borealis** (Turgay, Central Kazakhstan, with the West Siberian side). **The Tian Shan whole in Tethyana** with the Pamirs and Fergana; Sinica begins with the Tarim and Dzungarian basins at its feet. **Tibet to Sinica,** the line at the Indus–Yarlung suture behind the Himalaya, which is Indica's; the Qaidam and the Kunlun in Sinica. **The size:** lines inside a Zone are simplified to about 8 km, with a check that no two cross; Zone and Terra edges stay at about 4 km. |
| **ZR22** | **Northern and eastern Asia's edges (the owner, 2026-10-25).** **Mongolia whole in Sinica,** with Transbaikalia: the line along the Siberian craton's southern rim, the Sayan, Baikal and Stanovoy ranges, east to the Sea of Okhotsk. **Kamchatka, the Magadan coast and Chukotka in Borealis; Sakhalin, the Kurils and all of Japan in Sinica;** the Sea of Okhotsk at its median, though PB2002's Okhotsk plate holds them all. **The Indo-Burman ranges in Sundaica** with Myanmar, the line at their western foot, though PB2002 puts them on the Indian plate. **The Red River fault** between Sinica and Sundaica, where PB2002 draws no line: western Yunnan and Indochina with the Red River delta in Sundaica. By the plates, unasked: the Sulaiman and Kirthar ranges (the Indian plate) in Indica, the Chaman fault the line with Tethyana. |
| **ZR23** | **The last edges (the owner, 2026-10-25).** **Lydekker's Line:** Sahulica is the Sahul shelf itself (Australia, New Guinea with the Bird's Head and Aru, Zealandia's and Melanesia's continental islands); all of Wallacea (Sulawesi, the Moluccas, Halmahera, the Lesser Sundas, Timor) is one Zone of Sundaica. **The Antilles:** Trinidad and Tobago and Aruba, Bonaire and Curaçao with Amazonia, as South America's continental islands; the volcanic arc, Grenada to Anguilla, with the Caribbean in Laurentia. **The Bering and Chukchi seas at their median** between Asia's and America's coasts. By the plates, unasked: the Isthmus of Panama in Laurentia, the line at the Darién (the Panama plate's edge with the North Andes'); South Georgia (South American plate) and Tierra del Fuego (Scotia plate) in Amazonia; the South Orkneys and South Shetlands in Antarctica; Baja California in Laurentia, by the margin rule as the handoff says. |
| **ZR24** | **Every edge at about 8 km (the owner, 2026-10-25),** Zone and Terra edges too, each checked against the arcs near it, small islands kept whole: the twelve Terrae measured 5.58 MB with Zone and Terra edges at 4 km, 4.00 MB at 8 km, leaving about 2 MB of the 6 MB cap for Mecha Jono's five Maria, to be simplified the same way. |
| **ZR25** | **As soon as it is right, not on a date** (the owner, 26 Oct): "the sooner we can start operating on the new zones system the better… The whole 'deadline' thing didn't mean 'wait until'." ZR11's 13 Nov was a latest. Mecha Jono's five Maria landed on `mj/zsp2-maria` (f3808fd3, on 0250dbe9); Starcom traces all 17 containers in one pass, runs every check, shows the owner, and swaps once it passes. |
| **ZR26** | **The shelf is ours by its own name** (the owner, 26 Oct): Terra Antarctica's Zone over the Amundsen/Bellingshausen Offshore province is `zone:amundsen-bellingshausen-shelf`, "Amundsen and Bellingshausen Shelf", so Mare Australe keeps `zone:amundsen-bellingshausen` for the abyssal plains beyond the margin. Found by the id check (S8) on the first trace with Mecha Jono's Maria. |
| **ZR27** | **Serve what is read; the cap at 8 MB** (the owner, 26 Oct): with Mecha Jono's Maria the whole set came to 7.94 MB, over the handoff's 6 MB, three quarters of each Mare file being sector records the reader never reads (an edge's neighbour and length, notes and bounds). The Maria are now served with only the fields Starcom's reader takes (`ZSP2_PLACE_FIELDS`, an edge's follows, name and source), every source in full; the rest stays in Mecha Jono's manifest. The cap is 8 MB before compression: the whole set is 7.28 MB, under 0.9 MB compressed. Drafted whole on `zsp-2.0` (797b8575): 17 containers, 0 problems. |
| **ZR28** | **A retired Zone is the Zones its place is made of** (Starcom, at the swap, 26 Oct; the owner's to change): its `covered_by` lists each 2.0 Zone holding 5% of it, or 1% of it with a tenth of the Zone itself inside it, largest first (`scripts/zones/retired-coverage.ts`). Every Zone it touches would draw the Sahel to Cairo and Nairobi and the Ring of Fire across the open Pacific; a tenth of each Zone alone would leave out Niamey. The Sahel: 6 Zones, 92% of it; the Ring of Fire: 23, 83%; the Golden Triangle 3, Bahia 2, the Dry Corridor 1, each 100%. |
| **ZR29** | **NavCom's checker's two findings, fixed** (26 Oct, on b248325c): the manifest's `bytes` were each file's characters, not its bytes (a dash is three), now `Buffer.byteLength`, and the checks compare a stated size with the file; and the South Pole's corner at the date line was cut by the 8 km simplification, a sliver of about 0.04 km² in no Sector, now every corner of the map is pinned through simplification and the checks test a point 0.01° inside each corner. Only Terra Antarctica's file changed (six ring points). NavCom's third finding, the closed list of system words, was NavCom's own (ZR6 gives examples, not a list). |

## The handoff

[Zones re-slice: handoff to Mecha Jono](https://claude.ai/code/artifact/078e2823-0e23-4818-a98e-764a67e551dc), a Claude
Doc, carries the containers' table, the rules, the reference Zone, the file format, the checks and the stages. Mecha
Jono received it and replied with dates on 18 October. Nothing had landed from it by 23 October.

## Sources

Only public domain, CC0 and CC BY sources draw lines (licences read on each provider's page, 2026-10-17): ETOPO 2022 (CC0), Natural Earth (public domain), PB2002 through Hugo Ahlenius's conversion (ODC-BY 1.0; Bird's own files state no licence), RESOLVE Ecoregions 2017 (CC BY 4.0), EarthByte COBs (CC BY 3.0) and Park and Durand's 2019 fronts (CC BY 4.0). Added 2026-10-25, public domain as US Government works: the USGS's Geologic Provinces of the World, 2000 (Osmonson, Persits, Steinshouer and Klett, doi:10.5066/P9RMSU2R) and of Africa (doi:10.5066/P9IFZKJW), whose provinces the Terrae's Zones are made of; and Natural Earth's countries, regions, lakes and seas, for the lists and names. Reference only: HydroSHEDS and HydroBASINS (no stand-alone redistribution; Mecha Jono's own rule also bars them, with GADM and OpenStreetMap), the Marine Ecoregions of the World (non-commercial or no redistribution), IHO Sea Areas v3 (CC BY-NC-SA) and GEM's faults (CC BY-SA).

## Built (2026-10-18)

- **The reader** (`src/geopolitical/zones/zsp.ts`, 085e30dc): a 2.0 manifest's Terrae and Maria, each file's Zones
  and Sectors, by each level's id rules; what breaks them is counted unread. Box and label are worked out when a
  file leaves them out; `size_reason` is read. A retired 1.0 id finds the Zones that cover it (`placesForCode`).
- **The checks** (`zspChecks.ts`, run by `scripts/guard-zsp.mjs` in the guards and the build): hashes, ids, levels,
  sizes, rings (closed, wound, not crossing), licences (none share-alike or non-commercial), coverage (the area to
  0.01%, and a 2° grid of points each in one Sector), retired ids. While 1.0 is served it says so and passes.
- **The test partition** (`__tests__/testPartition.ts`): two containers, four Zones, eight Sectors, covering the
  globe pole to pole. It passes every check, and tests break it one way at a time. Never shipped.
- **The toggle** (`DivisionPicker.tsx`, `features/globe/divisions/`): one rail button in place of National
  territories, Zones and Spheres. Its glyph names the division shown, and its picker has Nation States, Zones,
  Spheres and None; a pick leaves that layer on and the others off. It is read from the layers' own switches.
  Organisations join it with their lists.

- **The drawing** (2026-10-18): `useZones3D.ts` draws a 2.0 index in three weights. A Terra's or Mare's edge is the
  heaviest. A Zone's edge is lighter than a lone 1.0 Zone's, and the lines between Sectors are faint and thin, since a
  whole-globe partition puts lines everywhere at once. Colour (`partitionTheme.ts`): a Terra takes an earth hue and a
  Mare a deep blue; its Zones are shades of it, and their Sectors shades of theirs. Neighbours never share a shade,
  and none is the app's cyan. The key names every Terra and Mare. The panel says what a place lies in (Terra › Zone ›
  Sector); a Terra or Mare opens and lists its Zones; a Zone gives its system; a Sector its IAU landform, plates, area
  and what its edges follow. The words are in all six languages.
- **The antimeridian:** a segment on ±180° is left out only where one place lies on both sides of it (its own seam).
  Where two places meet there, it is an edge, and drawn.
- **Looked at, not only tested:** a synthetic partition of 2,592 Sectors on a 5° grid, in 288 Zones and 16
  containers, rendered on the globe locally: fills, lines, key, hover and panel. It is near the real count, and it
  passes every check. It was never served beyond that machine. The hemisphere-sized test partition is for the tests
  only; its Sectors are too big to fill (the fill is triangulated in longitude and latitude), as no real Sector is.

- **Part 2, ready for the lists** (2026-10-18): `memberships.ts` reads the two files in the handoff's exact shape;
  `npm run bake:areas` first writes `listedAreas.json` from them (`scripts/geopolitical/list-areas.ts`), and the area
  registry merges it over what it codes (`listedAreas.ts`). Listed Spheres stand in for the thirteen coded ones; a
  listed body replaces the coded one with its code. A body's partners, observers, candidates and suspended members
  are kept as `others`, listed in its panel and never drawn. Until a list lands, nothing changes, the definitions'
  hash included. A body keeps the code reports already name it by, `union:<slug>`, whatever its kind (the handoff's
  first `org:` was corrected the same day).
- **Part 2, landed** (2026-10-25, 8f318b77, plan H7): Mecha Jono's second sending, taken as sent: 13 Spheres and
  15 bodies. Each carries the list's `the` and `note`; a Sphere's members marked `drawn: false` (68) are its
  `others`, status `listed`, named in its panel as listed, not drawn. The tests that pinned the coded set pin the
  lists. Kosovo, listed as an EU candidate though its cited page says "potential candidate", was raised with Mecha
  Jono, and the reader takes the status `potential-candidate` (the owner's pick), so their fix shows rather than
  being dropped as a status the reader does not know.
- **The Organisations mode** (the owner, 2026-10-18: "one at a time"): the picker's fifth division opens the list of
  bodies, and the one picked is filled over its members (`useOrganisations3D.ts`), in a brass gold, with a key, a
  hover chip and a panel (`GlobeOrganisationPanel.tsx`): its members, those not members with their status, the
  reports naming it by its code or an alias (`eu`), and its source. Today it shows the six bodies Starcom codes;
  Mecha Jono's list takes their place when it lands. Organisations borrow Diplomatic Events' glyph until a glyph
  round gives them one.
- **The picker's menu draws at the top of the page**, beside its button, on the dropdown layer. Inside the rail, the
  globe's key had covered half of it and taken its clicks; found by looking, live since e1b78ee3, fixed here.

Still to build: the swap by Thu 12 Nov. Not yet measured: how 2,000
real Sectors run on a weak device, and whether its quality step needs to drop the Sector lines there.

## At full scale (2026-10-19)

The owner chose, after roster step 9: a full-scale test partition measured, and detail stepped down where it lags.

- **The test set.** 16 containers, 288 Zones and 2,592 Sectors on a 5° grid, every edge a wiggle with a point
  every 0.2°, shared exactly by neighbours: 6.45 MB, just over the handoff's 6 MB cap. Every build check passes on
  it in about a second. Generated for measuring only, never committed.
- **What it showed.** Each Sector was a mesh and a material: 3,184 objects and draws a frame. Frame rates under
  SwiftShader on the 8 GB build machine followed memory pressure and pixel fill, not draws (the per-Sector and
  merged builds ran alike there), so the gain on a real GPU, where the CPU cost of thousands of draws is what
  weak devices feel, is reasoned rather than measured.
- **Merged (fadd091e).** A 2.0 partition's fills are one mesh per Terra or Mare, each Sector a part lit by its own
  texel, as the country fills are; its lines are batched once across the partition. 3,184 objects became 19. The
  build yields between containers, so its 1.6 s of triangulation no longer blocks the page. The look and the build
  time are unchanged. ZSP 1.0 is drawn as before until the swap.
- **Stepped down where it lags.** The quality governor's "softer edges" step and those below it draw a partition's
  Sector lines from a simplified copy, at most 0.05° (about 5 km) off and no span over 1°, so they still follow
  the globe: 86,400 Sector-line segments became 25,208 on the test set. Zone and Terra edges stay whole. On a 1×
  display that step changes nothing else, so the governor takes it only while a partition is drawn.

## Stage 1, the line, drafted (2026-10-25)

On the `zsp-2.0` branch (708dc86a): `scripts/zones/build-container-mask.ts` writes `data/zsp2/containers/`, the
container raster (3,600 × 1,800, row 0 the northernmost, column 0 from −180°, cell centres; little-endian uint32,
gzip, 57 KB), its sidecar with the code list (0 the land side, 1 Pacificum, 2 Atlanticum, 3 Indicum, 4 Arcticum, 5
Australe), its sources and checks, and two previews. The source data stay in `.local/zsp2-data`.

- **The land side.** A continent runs to its margin: shallower than 2,000 m inside EarthByte's continental polygons
  (Müller et al. 2019), joined to it; dry land joined to a continent over land or its 200 m shelf is the
  continent's (the Niger delta, built out over ocean crust; Bioko on Cameroon's shelf). A fragment keeps only its dry
  land and shelf (ZR18): New Zealand, New Caledonia, Madagascar, the Seychelles, Socotra and South Georgia (the last
  two named, outside the polygons); Rockall–Hatton is put at sea by name, as ZR18 says. Island arcs and the
  volcanic plateaus the polygons call continental ("loose", their README says: Kerguelen, the Sandwich, Tonga,
  Kermadec, Mariana and Izu–Bonin arcs and their kin) lie at sea.
- **Enclosed seas.** Water reached from the open ocean only through straits under about 300 km between lands or
  islands (an opening by 150 km from one seed in each ocean; a seamount or ridge under water closes nothing) is the
  land's, with the owner's calls over the rule: the Scotia Sea, the Gulf of Oman, the Mozambique Channel and the
  Tasman Sea at sea; the Gulf of Aden (to the line Ras Asir–Ras Fartak), the South China Sea, and the Okhotsk and
  Bering seas behind their arcs on land.
- **Depths from ETOPO 2022,** not Natural Earth's 2,000 m layer, which the draft used: it marks the Arctic shelves,
  Hudson Bay, the Baltic and the Caspian deeper than 2,000 m (ETOPO: the Barents Sea −158 m, Hudson Bay −142 m).
  ETOPO's 60″ ice surface, every sixth sample, from NOAA's ERDDAP.
- **The Maria.** Australe from Antarctica to the Polar Front (Park and Durand 2019, CC BY 4.0); Kerguelen north of
  the Fawn Trough bent into Indicum; Atlanticum and Indicum along the Agulhas–Falkland Fracture Zone and the Agulhas
  Ridge, Indicum and Pacificum along the Tasman Fracture Zone, Pacificum and Atlanticum at Cape Horn's meridian,
  Atlanticum and Arcticum across the Fram Strait at 79° N. **The Agulhas and Tasman lines and the Kerguelen bend
  are from approximate points, for review against Mecha Jono's draft lines.**
- **Against the draft.** Every Mare within 2% of Mecha Jono's: Pacificum 150.2 M km² (148.1), Atlanticum 65.3
  (65.4), Indicum 59.4 (58.5), Australe 29.7 (30.5), Arcticum 4.6 (4.8). **Checks:** every sea cell in one Mare; no
  water deeper than 2,000 m on a margin or a fragment's shelf; no continental dry land at sea; 88,584 deep cells
  given to the land as enclosed seas and inland water (the Mediterranean, Caribbean, Gulf of Mexico, Black, South
  China, Okhotsk, Bering and Japan seas, the Indonesian seas). Ocean islands at sea include Iceland, Hawaii, the
  Galápagos, Kerguelen, Réunion, Mauritius, the Canaries, Cape Verde, the Comoros, Fiji, Vanuatu, Samoa and the
  Solomon and Bismarck arcs; the Lesser Sunda arc (Lombok, Sumbawa) falls at sea with them, for review.
- **Still to come with the Terrae:** the lines between the twelve Terrae, which code the land side's cells.

## Terra Africana, the plan (2026-10-25)

For the owner's review on the `zsp-2.0` branch's preview, Fri 30 Oct. About 20–24 hours.

1. **Sources** (1 h): RESOLVE Ecoregions 2017 (CC BY 4.0), Natural Earth's physical regions and rivers (public
   domain), PB2002 through Ahlenius's conversion (ODC-BY 1.0; in `.local/zsp2-data/pb2002`).
2. **Its edges** (3 h): the land side's cells on PB2002's Africa and Somali plates coded `terra:africana`, with ZR19's
   calls: Sinai and the Levant east of the Gulf of Suez and the isthmus to Arabica, with their margin; Sicily and
   Malta with their margin to Europaea; the Rif in Africana, the Alborán Sea split on the arc's axis; the
   Mediterranean's waters along the plate line, the Red Sea and the Gulf of Aden along their axes.
3. **Zones** (6 h): 14–18 Zones, each one system (ZR6): belts, shields, basins, rifts, plateaus and the margins'
   seas, drawn from ETOPO 2022's divides and Natural Earth's named regions, with what each follows.
4. **Sectors** (6 h): within each Zone, drainage divides from ETOPO first, then RESOLVE's ecoregion edges, then an
   equal-area grid where nothing divides; each 50,000–500,000 km², each edge saying what it follows (ZR7).
5. **Files** (5 h): the vectoriser traces the label grid into rings that store each shared edge once, simplified
   once per edge; `terra-africana.zsp.geojson` and its manifest entry; every check in `zspChecks.ts` that applies to
   one container.
6. **On the globe** (2 h): the branch's preview draws Terra Africana over ZSP 1.0 for review, without the swap.

## Terra Africana, drafted (2026-10-25)

On the `zsp-2.0` branch (4353343d), for the owner's review on the branch's preview,
`https://starcom-app-git-zsp-20-jono-thoras-projects.vercel.app/?zones=draft` (signed in to Vercel; the Zones division
on). `scripts/zones/build-terra-africana.ts` writes `data/zsp2/terrae/` (the Zone and Sector label grids, a sidecar,
previews) and `public/geopolitical/zones-draft/` (the container file and its manifest), which only `?zones=draft` reads.

- **Its edges, as ZR19 says.** 33.0 M km² in three pieces: the continent with Socotra, Madagascar, the Seychelles.
  Pantelleria and Lampedusa, on PB2002's African plate and not named in ZR19, are Africana's, for review.
- **21 Zones,** one over the "about 20" of ZR6, each made of whole USGS provinces (Geologic Provinces of Africa, 2000,
  public domain): Atlas; Reguibat and Taoudeni; Senegal Basin; Leo–Man Shield and the Guinea Coast; Ghadames, Illizi
  and Murzuq; Tuareg Shield and Iullemmeden; Sirte and the Ionian–Levantine Sea; Libyan Desert and the Nile Delta;
  Nubian Shield; Red Sea and Gulf of Aden, African margin; Chad, Darfur and the Sudanese Rifts; Niger Delta and the
  Benue Trough; Congo Basin; West Congo Belt and the Angolan Margin; Ethiopian Highlands and Afar; Horn of Africa;
  East African Rift; Tanzania and Mozambique Coastal Basins; Kalahari and the Damara Belt; Kaapvaal, Karoo and the
  Cape; Madagascar and the Seychelles. Each is one part (the last two islands apart). The 1.0 ids
  `zone:east-african-rift` and `zone:horn-of-africa` are kept, each the same region grown; `zone:sahel` retires at the
  swap.
- **285 Sectors,** median 102,000 km², every one 50,000–500,000 but the Seychelles (40,666 km², with its
  `size_reason`). Drainage divides from ETOPO 2022 first, then the Zones and plates; none needed an ecoregion cut,
  two an equal-area cut. Each is named by its RESOLVE ecoregion (a sea by Natural Earth's water body), told apart by
  where it lies when two in a Zone share one, and given an IAU landform from its relief, water and biome.
- **The file** passes every check in `zspChecks.ts` but coverage, which one container of seventeen must fail: 1.10 MB,
  56,159 ring points, every level traced from one set of arcs. **At this density the twelve Terrae would come to about
  6.7 MB** against the handoff's 6 MB for the whole set, Maria included: the next Terra measures it, and the ways down
  (a coarser tolerance with a crossing check, or the cap raised with Mecha Jono) are for the owner then.
- **Stage 1, corrected on the way:** water hemmed in by ocean islands alone (the Cape Verde, Canary and Azores
  channels) had gone to the land side as an enclosed sea; 3,294 cells are at sea again. Pacificum is 150.5 M km² and
  Atlanticum 65.4; every Stage 1 check still passes.

## Arabica and Europaea, drafted (2026-10-25)

On `zsp-2.0` (a30641a8), beside Africana, at the same preview (`?zones=draft`). One builder,
`scripts/zones/build-terrae.ts`, now codes the whole land side and writes the Terrae marked built.

- **Every USGS province has a Terra** (Geologic Provinces of the World, 2000), so a Zone, made of whole provinces, is
  never split by a Terra's edge (ZR5). A province across a line the owner drew is split by its rule: the plate (the
  Red Sea, the Mediterranean east of Sicily), the Suez line, the Ural River, the Caspian's water to Tethyana, the
  median (the Black Sea). ZR20's calls follow the provinces' own edges: the Zagros Fold Belt and Thrust Zone to
  Tethyana, the Great Caucasus Foldbelt whole in Tethyana, the Ural–Novaya Zemlya Foldbelt in Europaea.
- **Terra Arabica,** 4.38 M km²: 9 Zones (Levant, keeping `zone:levant`; Arabian Shield; Red Sea, Arabian Margin;
  Yemen Highlands and the Gulf of Aden; Rub' al Khali; Oman Mountains and Salt Basins; Central Arabian Arch;
  Mesopotamia and the Persian Gulf; Widyan and the Northern Arches), 41 Sectors, 0.19 MB.
- **Terra Europaea,** 15.95 M km²: 18 Zones (Balkans keeps `zone:balkans`), 117 Sectors, 0.60 MB.
- **Africana re-cut** from the world map with the owner's reference Zone: the East African Rift Zone takes in the
  Ethiopian Highlands, Afar and the Shire and Lower Zambezi to Beira (that last line approximate), and its Sectors
  holding the handoff's twelve points carry its names (Afar Triangle, Main Ethiopian Rift, Lake Victoria Basin…);
  20 Zones, 283 Sectors, 1.11 MB.
- **For review:** Malta's and Sicily's shallow shelf goes to Europaea to its midline with Libya and Tunisia, about
  34.4° N, within the Pelagian Basin; the Ionian keeps the plate line. The Azerbaijani coast north of Absheron lies
  north of the Greater Caucasus's foot, so in Europaea. Pantelleria and Lampedusa are Africana's.
- **The size:** the three files come to 1.90 MB for 53 M km² of the land side's 200 M; at that rate the twelve Terrae
  come to about 7 MB, over the handoff's 6 MB with the Maria still to add.
- **Tethyana, then** (the same day, after ZR21): 6.88 M km², 16 Zones (Anatolian Plateau and the Taurus; Pontic
  Mountains; Western Anatolia; Lesser Caucasus and the Armenian Highlands; Caucasus, keeping `zone:caucasus`; Caspian
  Sea; Black Sea, Anatolian Margin; Zagros; Iranian Plateau; Alborz and Kopet Dag; Makran and Baluchistan; Hindu Kush
  and the Afghan Blocks; Pamirs; Tian Shan; Karakum and the Amu Darya; Aral Sea, the Syr Darya and the Ustyurt), 56
  Sectors. **For review:** Thrace west of the Bosporus, the Marmara and the Dardanelles (Greek, Bulgarian and East
  Thrace) is Europaea's; USGS's one Thrace–Samsun province is split there.
- **The size, after ZR21's coarser lines** and Sectors citing their sources briefly: the four Terrae come to 1.65 MB
  for 60 M km², about 5.5 MB for the twelve at that rate, within the 6 MB with a little room for the Maria.

## Borealis, Sinica and Indica, drafted (2026-10-25)

On `zsp-2.0` (9affa1cc and after), after ZR22. Seven of the twelve Terrae now, 2.85 MB, every check passing but
coverage, each Terra one piece.

- **Terra Borealis,** 16.68 M km², 14 Zones, 145 Sectors. **Terra Sinica,** 16.15 M km², 20 Zones, 134 Sectors.
  **Terra Indica,** 5.06 M km², 10 Zones, 52 Sectors.
- **Approximate, for review:** the Altai and Sayan crests (Borealis | Sinica through the Altay–Sayan Folded Region,
  Tuva on Sinica's side), drawn from points along the ranges; the Red River delta's polygon.
- **By the provinces, for review:** north-east Vietnam (Cao Bang, Lang Son, Quang Ninh) lies east of the Red River
  fault in USGS's South China Fold Belt, so in Sinica; the Gondwana rift basins are one Zone with the Indian Shield.

## All twelve Terrae, drafted (2026-10-25)

On `zsp-2.0` (dc3f4723), after ZR23 and ZR24, at the same preview (`?zones=draft`): **1,422 Sectors in 180 Zones,
4.00 MB,** every check passing but coverage, which waits for the Maria.

| Terra | M km² | Zones | Sectors |
|---|---|---|---|
| Africana | 33.6 | 20 | 281 |
| Arabica | 4.4 | 9 | 41 |
| Europaea | 16.0 | 18 | 113 |
| Tethyana | 6.9 | 16 | 56 |
| Borealis | 16.9 | 14 | 145 |
| Sinica | 15.9 | 20 | 131 |
| Indica | 5.1 | 10 | 52 |
| Sundaica | 11.4 | 11 | 77 |
| Sahulica | 14.0 | 15 | 119 |
| Laurentia | 38.3 | 20 | 275 |
| Amazonia | 21.5 | 15 | 186 |
| Antarctica | 17.1 | 9 | 142 |

- **One trace for the globe:** every built Terra's Sectors on one grid, traced once into 4,800 arcs at about 8 km,
  each checked against the arcs near it, and every file made of those arcs. Checked at 64,800 points of a 1° grid:
  none lies in two Sectors. The 13 land-side points in none lie in the band between a margin's traced edge and the
  grid's line, which closes when Mecha Jono's Maria labels are traced in the same pass (ZR18).
- **Every Terra is one piece** but for real islands (Madagascar, the Seychelles, New Zealand, New Caledonia, the
  Chathams, Norfolk, the Antipodes, South Georgia, part of the Arctic Archipelago cut off by the sea).
- **1.0 ids kept** where the new Zone is the same region grown (ZR8): `zone:east-african-rift`, `horn-of-africa`,
  `levant`, `balkans`, `caucasus`, `amazon-basin`. Retiring at the swap: `zone:sahel`, `bahia-coast-reconcavo`,
  `central-american-dry-corridor`, `golden-triangle`, `ring-of-fire`; their `covered_by` lists are written with the swap.
- **Approximate, for review:** the Altai and Sayan crests, the Shire–Lower Zambezi and Red River delta polygons.

## The Maria's side, built (2026-10-25)

On `zsp-2.0` (0250dbe9), before Mecha Jono's labels: `scripts/zones/maria.ts` reads the Maria where ZR18 put them,
in `data/zsp2/maria/`:

- `maria-sectors-0.1.u32.bin.gz`: each sea cell's Sector code (from 1; 0 elsewhere) on Stage 1's grid, little-endian
  uint32, gzipped as Stage 1's raster is;
- `maria-0.1.json`: `containers` (each Mare), `zones` (each naming its `container`), `sectors` (each with its `code`
  and `zone`, and any of a Sector's fields) and `reserved`, Zone ids held for later.

- **One trace:** the Maria's Sectors join the Terrae's on the globe's grid and are traced in the same pass, so every
  coast is one edge. The build writes `mare-<slug>.zsp.geojson` beside the Terrae and checks the 17 files together.
- **Ids held (S8):** S8 told Mecha Jono their ids were "in the manifest's reserved ids", but nothing held them. Now
  the Zone ids their manifest lists (its Zones' and its `reserved`) are refused to the Terrae as soon as it is on the
  branch, before the labels; a clash stops the build before anything is cut.
- **Proven whole with test Maria:** `--test-maria=<dir>` cuts Stage 1's five Maria into 700 Sectors of equal area,
  one Zone a Mare, written apart and never served. With them every check passes, coverage included: the Sectors'
  areas within 0.01% of the Earth's, and every point of the 2° grid in exactly one Sector. 4.63 MB in all, the test
  Maria's straight cuts 0.63 MB of it; Mecha Jono's, whose edges follow the seafloor, have the 2.0 MB the Terrae
  leave.
- **The same in Mecha Jono's format:** test labels written as above and read back through the reader gave the same
  result, and a Terra Zone id put in `reserved` was refused.
- **The served draft is unchanged** byte for byte while no Maria are on the branch. The points the 2° check found
  in no Sector with the Terrae alone all lie on the sea side of the Terrae's coasts; with the Maria traced, none do.

## The swap, done (2026-10-26)

Starcom serves ZSP 2.0 (ZR8, ZR25): `public/geopolitical/zones/` holds the 17 container files and their manifest,
written there by `build-terrae.ts` with no draft flag; `?zones=draft` and `zones-draft/` are gone. The guard: 17
Terrae and Maria, 251 Zones, 2,632 Sectors, 510,065,881 km², 7.28 MB, every check passed. The eleven 1.0
documents are kept only as the 1.0 tests' copy (`zones/__tests__/zsp-1.0/`).

- **Retired, with `covered_by` (ZR28):** `zone:sahel`, `bahia-coast-reconcavo`, `central-american-dry-corridor`,
  `golden-triangle`, `ring-of-fire`. Each stays an area drawn as those Zones; its note names up to four, else counts
  them and names three. Kept as 2.0 Zones of their own: the other six.
- **No Zone coded in `areaRegistry.ts`** (CR6): every Terra, Mare and Zone comes from the served manifest
  (`zoneAreas.json`, 268 areas and 5 retired). A Zone takes "the" in running text, a Terra or a Mare does not.
- **The areas file:** `areas-lod0.geojson` 445 KB → 1.37 MB (314 KB gzipped), loaded only once an area is drawn.
  Kept exact, not simplified: the outlines already sit on the 0.1° grid at about 8 km (ZR24), so simplifying saves
  nothing until 0.1°, where a Zone's area outline would stand up to 11 km off the Zones layer's lines.
- **The search file:** `zones-search.json` 32 KB → 608 KB, loaded when the search opens; its id list now holds only
  the Terrae's and Maria's (the Zones' and Sectors' are in its Zones), 150 KB less.
- **Labels inside their place:** 56 Sectors without a stored label had their centre outside them (bent or hollow
  shapes); `labelOf` now takes the middle of the widest run across the place when the centre falls outside.
- **Share contract v61:** `listAreas` gives the partition; the five retired ids stay areas; names are 2.0's.

## The swap, rehearsed (2026-10-19)

Run end to end on the full-scale test partition, with the eleven 1.0 ids retired into it: the files swapped in, the
areas baked, the guards, the area, Zone and contract tests, the app; then everything put back.

**Ready now, so 12 November is a data drop:**

- **Zone areas come from the manifest served** (`zoneAreas.ts`, written by `npm run bake:areas` into
  `zoneAreas.json`): each Terra, Mare and Zone is an area of its own kind (`terra`, `mare`, `zone`), its outline its
  container document's, its source the place's own page or the manifest. Each retired id stays an area, drawn as the
  Zones that cover it. The coded 1.0 Zones stand down as soon as a partition is served. Under 1.0 nothing changes.
- **A report naming a retired Zone** is found under the Zones that cover it, in the Zone panel.
- **The 1.0 tests read their own copy** of the eleven documents (`zones/__tests__/zsp-1.0/`), not what is served.
- **The build check passes** on a partition with retired ids; the header search finds a retired Zone and outlines it.

**On the day, once Stage 3 passes every check (about two hours):**

1. Put the final manifest and container files in `public/geopolitical/zones/`; the ZSP guard must pass.
2. `npm run bake:areas`. Measure `areas-lod0.geojson`: 341 KB grew to 471 KB on a 1° test set. If real data takes it
   past about 1 MB, simplify the Zone outlines in the bake. (The bake dates the areas entry in
   `public/geopolitical/manifest.json` only when the file's bytes change; a rehearsal that bakes the test set and
   then the real one again changes the hash twice, so restore that file too when putting a rehearsal back.)
3. Rewrite the tests that describe the first Zones by name: the area bake's Golden Triangle circle, its ring and its
   Sector landmarks; the header search's and the area shapes' Sahel; the area finder's "Africa".
4. The share contract's areas list changes: version 61 as it came to be, its fingerprint re-recorded, the share spec published, and a
   note to Mecha Jono (the owner approves its text).
5. Delete the coded 1.0 Zones from `areaRegistry.ts` (CR6) and, once nothing reads 1.0, its drawing path.
6. The affected tests, the build, the deploy and the globe checked.
