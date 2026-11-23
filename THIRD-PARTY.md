# Third-party data, media and fonts

Starcom's own code is AGPL-3.0 (`LICENSE`). What it ships from others keeps its own licence, listed here with its
source. A dataset under a licence the AGPL cannot carry (non-commercial, share-alike) stays in its own file with its
notice, and is never relabelled. Data Starcom only fetches at run time is credited on screen and on every card
(`src/features/globe/capture/sourceCredits.ts`), not listed here.

Entries marked TO VERIFY are not yet confirmed; the public mirror (`scripts/publish-public-mirror.mjs`) refuses to
publish while any remain.

## Maps and places

| Files | Source | Licence |
|---|---|---|
| `public/geopolitical/world-borders*.geojson`, `world-territories*.geojson`, `us-states-50m.geojson`, `areas-lod0.geojson`, `topology/`, `normalized/`, `territories-baked/`, `data/raw/geopolitical/ne_50m_*` | [Natural Earth](https://www.naturalearthdata.com/) (derived by Starcom's scripts) | Public domain |
| `data/eez/raw/` | Flanders Marine Institute (2023). Maritime Boundaries Geodatabase: Maritime Boundaries and Exclusive Economic Zones (200NM), version 12. Available online at https://www.marineregions.org/. https://doi.org/10.14284/632 (read through its WFS, 2025-08-30) | CC BY 4.0. VLIZ asks that its files not be offered for download elsewhere |
| `public/geopolitical/minerals-baked.json` | USGS National Minerals Information Center, Mineral Commodity Summaries 2026 data release ([doi:10.5066/P1WKQ63T](https://doi.org/10.5066/P1WKQ63T)) | CC0 1.0 |
| `public/geopolitical/trade-routes-baked.json` | UN Comtrade, 2023 bilateral exports: 11 curated routes | © United Nations. A free application may carry up to 100,000 records without a licence ([UN Comtrade's re-dissemination terms](https://uncomtrade.org/docs/)); credited "UN Comtrade" |
| `public/eco-natural/volcanoes-baked.json` | Smithsonian Institution, [Global Volcanism Program](https://volcano.si.edu/), Volcanoes of the World (Holocene), 1,214 volcanoes baked 14 Aug 2026. Cited as GVP asks: Global Volcanism Program, 2026. Volcanoes of the World (v. 5.4.0; 7 Aug 2026). Distributed by Smithsonian Institution, compiled by Venzke, E. [doi:10.5479/si.GVP.VOTW5-2026.5.4](https://doi.org/10.5479/si.GVP.VOTW5-2026.5.4) | Smithsonian Terms of Use: personal, educational and other non-commercial use, citing the author and source and linking the Smithsonian; credited on every card that draws it. Held back from the public repository until verified (`scripts/eco-natural/bake-volcanoes.ts` bakes it from the source). TO VERIFY (the owner, in a browser: [GVP's terms](https://volcano.si.edu/gvp_termsofuse.cfm) refuse automated readers): the terms as read through a search on 22 Nov, and whether the database, "a product of U.S. government employees", is outside the non-commercial term. The commercial build leaves it out until then (source register, `gvp`). |
| `public/geopolitical/zones/` | Mecha Jono's Zone and Sector Protocol export (the owner's project) | As each file's manifest entry states: Amazon Basin CC BY 4.0; Central American Dry Corridor CC BY-SA 4.0, kept in its own file with that notice; the rest AGPL-3.0 with Starcom |

## Bundled datasets (`public/data/`)

Each file's licence and attribution is in `public/data/README.md` and in the file itself; summarised here.

| File | Source | Licence |
|---|---|---|
| `ucdp-ged.json` | Uppsala Conflict Data Program, Candidate Events | CC BY 4.0, citations embedded in the file |
| `eia-production.json` | U.S. Energy Information Administration | Public domain (U.S. Government work); credited "U.S. EIA" |
| `gleif.json` | [GLEIF](https://www.gleif.org/) Global LEI Index | CC0 1.0 |
| `companies-house.json`, `psc-control.json` | UK Companies House: the company data product and the PSC register (corporate controllers only; personal addresses withheld) | Open Government Licence v3.0: "Contains public sector information licensed under the Open Government Licence v3.0." |
| `brreg.json` | Brønnøysundregistrene, Enhetsregisteret (Norway) | NLOD 2.0: "Inneholder data under norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Brønnøysundregistrene." |
| `lei-coverage.json` | The registers above joined to the GLEIF index | Each source's terms, as above (OGL v3, NLOD 2.0, CC0) |
| `wikidata-hq.json` | Wikidata | CC0 1.0 |

## Built when Starcom is deployed, not in this repository

Their scripts are here; their data is fetched at build time and is not committed (`.gitignore`).

| File | Script | Source and terms |
|---|---|---|
| `gdelt-events.json` | `scripts/snapshot-gdelt.mjs` | The GDELT Project: free and open for unlimited use, with citation |
| `threat-indicators.json` | `scripts/snapshot-threats.mjs` | The blocklists credited in it; IP places by DB-IP Country Lite (CC BY 4.0), used at build time only |
| `sanctions-changes.json`, `sanctions-by-country.json` | `scripts/snapshot-ofac.mjs` | U.S. Treasury OFAC: public domain (U.S. Government work) |
| `health-exclusions.json` | `scripts/snapshot-leie.mjs` | U.S. HHS-OIG LEIE: public domain (U.S. Government work); people are counted, never named |

## Textures

Each image's maker, licence and what Starcom changed are in `src/globe-engine/imagery.ts`, shown on the credits page
(starcom.app/credits).

| Files | Source | Licence |
|---|---|---|
| `public/assets/textures/earth/earth-day*`, `earth-night*`, `8k/earth-day-8k.ktx2`, `8k/earth-night-8k.ktx2`, `public/assets/textures/planets/` | [Solar System Scope](https://www.solarsystemscope.com/textures/) | CC BY 4.0 |
| `public/assets/textures/earth/earth-blue-marble*`, `8k/earth-blue-marble-8k.ktx2` | NASA Earth Observatory, Blue Marble Next Generation | NASA imagery, credited as NASA asks ("NASA Earth Observatory"); no NASA insignia used |
| `public/assets/textures/earth/earth-topology*` | Jesse Allen, NASA's Earth Observatory, from GEBCO data by the British Oceanographic Data Centre | NASA imagery, credited as asked |
| `public/assets/textures/earth/earth-water*` | NASA/Goddard Space Flight Center Scientific Visualization Studio, land-sea mask (inverted) | NASA imagery, credited as asked |
| `public/assets/textures/earth/clouds*` | NASA Goddard Space Flight Center, image by Reto Stöckli (Blue Marble, 2002), as Tom Patterson's Natural Earth III | NASA imagery, credited as asked |
| `public/assets/textures/earth/earth-dark*` | Google Data Arts Team, [WebGL Globe](https://github.com/dataarts/webgl-globe) | Apache 2.0 |
| `public/assets/textures/moon/` | NASA's Scientific Visualization Studio, CGI Moon Kit | NASA imagery, credited as asked |

## Fonts

| Font | Source | Licence |
|---|---|---|
| IBM Plex Sans, IBM Plex Sans Devanagari, JetBrains Mono, Oxanium (via `@fontsource`) | Their authors, through Fontsource | SIL Open Font License 1.1 |
| `public/assets/fonts/Aldrich-Regular.ttf` | Aldrich, copyright (c) Matthew Desmond, 2011; "Aldrich" is a trademark of Matthew Desmond | SIL Open Font License 1.1 (`public/assets/fonts/OFL.txt`) |

## Sounds and images

| Files | Source | Licence |
|---|---|---|
| `public/assets/sfx/` | Made for Starcom; nothing sampled from any game or recording (`public/assets/sfx/README.md`) | AGPL-3.0 |
| `public/assets/images/icons/`, `public/social/`, `public/assets/store/`, app icons | Starcom's own | AGPL-3.0 |
