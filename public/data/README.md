# Bundled open datasets

Static, redistributable data shipped with the app rather than fetched from a
credentialed endpoint at runtime.

## Why these are files and not API calls

Every source here was, or could have been, an API. Each is a file instead for
the same reason: **a source only one person can reach fails the test the OSEE
pillar sets** — could a different, unaffiliated group stand up their own
instance of this capability? An endpoint requiring a per-user token answers no.

Files also survive things endpoints do not. They can be pinned to IPFS, served
offline, and read by a fork with no account, no key, and no permission from
anyone.

## `ucdp-ged.json`

UCDP Candidate Events — georeferenced organized-violence events, under a
month's lag, ~1,800 events, ~400 KB.

- **Licence:** CC BY 4.0. Redistribution is permitted *provided the citations
  travel with the data*, which is why they are embedded in the JSON itself
  rather than left in this file.
- **Regenerate:** `npm run data:ucdp`
- **Source:** <https://ucdp.uu.se/downloads/>

Regenerating is a deliberate act, not a build step. A build that silently
refetched would mean two people building the same commit could produce
different data, and a finding derived from one would not be reproducible
against the other. `datasetVersion` and `retrievedAt` are recorded in the asset
so any finding can be traced to the exact data behind it.

The full 1989–2025 GED (~39 MB) is deliberately not bundled. Corroboration
works in a 24-hour window, so events from 1994 cannot corroborate anything
current; the recent slice is what the engine can actually use.

### Attribution

> Shawn Davies, Therése Pettersson, Magnus Öberg, *Organized violence
> 1989–2025, and violent political protests*, Journal of Peace Research, 2026.
> <https://doi.org/10.1093/jopres/xjag046>
>
> Hegre, Håvard, Mihai Croicu, Kristine Eck, and Stina Högbladh (2020)
> *Introducing the UCDP Candidate Events Dataset.* Research & Politics.
>
> UCDP is part of and funded by DEMSCORE, national research infrastructure
> grant 2021-00162 from the Swedish Research Council.

## `gdelt-events.json` — the one built at build time

A day of GDELT 2.0 Event Database events — bilateral, located, in the
cooperative (CAMEO 03–08) and conflict (14–20) ranges — for the Diplomacy and
Conflict Zones layers. ~15,000 events, ~3.3 MB raw (measured 2026-10-13).
From version 3 each event also carries whether GDELT found it in a lead
paragraph, and the coder's highest confidence from the day's Mentions files,
which the build fetches after the exports (another ~7 MB of zips); a Mentions
file that does not arrive is listed, and its events' confidence stays unknown.

- **Built by:** `scripts/snapshot-gdelt.mjs`, as a step of `npm run build`.
  Force a refresh with `npm run data:gdelt`. Not committed (`.gitignore`).
- **Terms:** GDELT data is free and open for unlimited use, with citation of
  the GDELT Project. <https://www.gdeltproject.org/>

**Why this one is a build step.** The rule above — regeneration is deliberate,
so one commit means one dataset — exists so that a finding can be traced to
the exact data behind it. For GDELT a committed file would fail the layer
instead: a 24-hour window is worth little a day later, and committing a new one
daily would put a year of yesterdays in every clone. Traceability comes from
GDELT itself. It keeps every 15-minute export and Mentions file permanently, and the
snapshot lists the windows it was made from and writes its rows in a fixed
order, so the same windows rebuild the same bytes.

**What it cannot promise is freshness.** It is as old as the deploy. The app
filters "the last day" relative to the snapshot's own time (`asOf`), never the
wall clock — against the clock an older snapshot would filter to nothing and
draw an empty globe — and a share card made from it states its age. If GDELT
cannot be reached at build time no file is written and the build still
succeeds; the layers then say this build carries no snapshot.

**Why not fetch it in the browser.** That is what the app did, and it never
worked: the URL was `http://`, which an https page may not fetch, and GDELT's
redirect to https carries no CORS header. It also cost every visitor 96
requests and 7.3 MB of zips, parsed on the main thread.

**GDELT events are machine-coded from news.** Single events can be miscoded —
the export this was tested against codes an article about an office lease as a
"Fight" between Egypt and the UK. Each marker keeps its source article's URL.

## `threat-indicators.json` — also built at build time

The Cyber Threats layer's indicators: an even sample of IPs from seven public
blocklists (Blocklist.de ×4, Spamhaus DROP, DShield, a ThreatFox mirror), each
placed in a country. ~165 indicators. AbuseIPDB's list was dropped on 11 Nov 2026:
its terms bar reproducing its data without permission (decision D-CS).

- **Built by:** `scripts/snapshot-threats.mjs`, a step of `npm run build`.
  Refresh with `npm run data:threats`. Not committed.
- **IP geolocation by DB-IP** (<https://db-ip.com>) — Country Lite, CC BY 4.0,
  via `sapics/ip-location-db`. The table is used at build time and not shipped.

**Why a snapshot.** The browser used to download all eight lists and DB-IP's
whole IPv4 table — 12.3 MB per activation — to place about 220 addresses.

**Dates.** Each list is dated by its own account: firehol's `Source File Date`
header, or for the ThreatFox mirror its repository's last commit to the file.
Never the fetch time. A list that cannot be dated, or is more than a week old,
is recorded with the reason and not drawn. The card states the age of the
oldest list drawn. (Two Botvrij.eu lists were removed outright: last updated
17 and 21 months before they were found still being drawn as current.)

**Sampling.** Every list is sorted by IP address. Taking each list's first
entries — what the app did — drew the lowest-numbered addresses, and so the
countries that hold low address space: China came out at 31% of the map
against 8% of all 98,779 listed IPs, the US at 9% against 31%. The sample is
now spread evenly across each whole list, and interleaved across lists, and the
card says the map is a sample and of how many.

## `eia-production.json` — the fallback, not the first source

EIA's production of crude oil (thousand barrels a day), dry natural gas
(billion cubic feet) and renewables and other (quadrillion Btu) by country,
each series for one year, producers only: about 6.6 KB, 3.3 KB compressed.
Resource Zones ranks countries by it, and Diplomacy's country brief states it.

- **Source:** EIA's international bulk file,
  <https://www.eia.gov/opendata/bulk/INTL.zip>, which needs no key.
- **Terms:** a U.S. Government work, in the public domain; credited "U.S. EIA".
- **Regenerate:** `npm run data:eia`, when EIA publishes the year's figures.
  Not a build step: the bulk file is 24 MB and changes once a year.

**The first source is The Record** (decision D-DP, DP17). Mecha Jono posts each
series as a signed note (`t=energy_production`), which any peer can read; the
app asks for it on demand and reads this file only for a series the notes do
not hold, or when The Record does not answer within six seconds. Nothing here
is loaded until a brief or Resource Zones asks. Until 2026-10-13 these figures
came from api.eia.gov with a person's own key, so a visitor without one had no
oil or gas — the test above, failed.

## `sanctions-changes.json` — built at build time, the fallback

OFAC's publications of the last 30 days, each counted: additions and removals
by type (entities, individuals, vessels, aircraft), by sanctions programme,
and the organisations, vessels and aircraft named with their countries and
programmes. People are counted, never named (decision D-BF, BF2). About 29 KB,
4 KB compressed, on 2026-10-13: 13 publications, 193 named.

- **Built by:** `scripts/snapshot-ofac.mjs`, a step of `npm run build`, from
  OFAC's change history and each publication's delta file
  (`sanctionslistservice.ofac.treas.gov/changes/<id>`). `npm run data:ofac`
  refetches. Not committed: it is a month of a daily-changing list.
- **Terms:** a U.S. Government work, in the public domain.

**The first sources are OFAC's own list and The Record** (BF1). The browser
reads OFAC's change history itself, which answers any site, then Mecha Jono's
`sanctions_changes` notes, and reads this file only for publications the
notes do not hold. The delta files sit on S3, which sends no CORS header,
which is why this file exists at all.

## `health-exclusions.json` — built at build time, the fallback

HHS-OIG's last three monthly supplements to the List of Excluded
Individuals/Entities (LEIE), each counted by state, OIG's category and the
basis in law, with its reinstatements, and the organisations named with
their state, category, basis and date (decision D-BF, BF2). People are
counted, never named: the supplements carry each person's name, date of
birth, NPI and home address, and none of it is kept. A professional practice
whose name carries a professional suffix ("…, MD, INC", "… PC") is often its
owner's name, so it is counted, not named. About 6 KB, 2 KB compressed.

- **Built by:** `scripts/snapshot-leie.mjs`, a step of `npm run build`, from
  `oig.hhs.gov/exclusions/downloadables/<year>/<yymm>excl.csv` and
  `…rein.csv`. `npm run data:leie` refetches. Not committed.
- **Terms:** a U.S. Government work, in the public domain.

**The first source is The Record** (BF1): oig.hhs.gov sends no CORS header,
so the browser reads Mecha Jono's `health_exclusions` notes and this file
only when they hold fewer than three months.

## `sanctions-by-country.json` — built at build time

OFAC's SDN list counted by country, for Diplomacy's country brief (decision
D-DP, DP6): for each country, how many entries have an address there, by
sanctions programme, and how many of them are people, counted, never named.
About 23 KB. OFAC names countries in its own words ("Korea, North",
"Burma"); each is matched to the globe's own country code by Natural Earth's
names and a short list of OFAC's spellings (`sdnByCountry.ts`), and a name
that matches none is listed in the file, never guessed: on 2026-10-13, the
disputed regions OFAC names apart (Kashmir, Kafia Kingi, Crimea), the CIS, and
Gibraltar, which the globe does not draw: 16 entries.

- **Built by:** `scripts/snapshot-ofac.mjs`, beside `sanctions-changes.json`,
  from OFAC's `SDN.CSV` and `ADD.CSV` (about 7 MB). Not committed.
- **Terms:** a U.S. Government work, in the public domain.

## `psi-kp-gfz.json` — Kp since 1932, for Psi Watch's Timestream

GFZ Potsdam's 3-hourly planetary Kp index from 1 January 1932, definitive and
preliminary, for the field lane under the globe (decision D-PW, PW42): a
character a 3-hour slot, Kp in thirds, preliminary values marked apart. About
277 KB, 126 KB compressed. The days since the bake come live from NOAA SWPC
(its last 30 days of estimated planetary K, its 3-day forecast and its 27-day
outlook), each value marked as what it is.

- **Licence:** CC BY 4.0; the citation travels in the file (`credit`).
- **Regenerate:** download `https://kp.gfz.de/app/files/Kp_ap_since_1932.txt`
  (about 17 MB, not committed), then `npm run data:psi-kp -- <that file>`.
- **Source:** <https://kp.gfz.de/en/data>

## `psi-events-*.json` — Mecha Jono's event set, for Psi Watch's history

The event set from Mecha Jono's Psi Watch kit (decision D-PW, PW46), one file a
set, for the Timestream's events lane and, later, Echoes: each event's moment
in time order (stored as steps from the one before), its place to two decimals
and the ZSP 2.0 Zone it falls in, found by Starcom from its coordinates (the
kit names ZSP 1.0's). Each file carries its kind, its licence, its credit and
its source file's sha256, checked against the kit's manifest at the bake.

- `psi-events-conflict.json`: UCDP GED 26.1 one-day events of organised
  violence, 1989–2025, as episodes (one dyad in one Sector within 3 days). The
  lane counts episodes; the kit's first-event deaths are never summed as a toll.
  UCDP's country-level places (precision 6 and 7) are in no Zone. Events whose
  side is named for a person were left out by the kit.
- `psi-events-quakes.json`: USGS ComCat earthquakes of M5.5 and up, 1976–2025,
  declustered (Gardner–Knopoff), with magnitude and depth.
- `psi-events-storms.json`: GFZ's geomagnetic storms, Kp 5 or more, 1932–2025,
  consecutive days one storm, with its days and largest Kp; no place.

- **Licence:** UCDP CC BY 4.0, citing Davies, Pettersson and Öberg (2026) and
  Sundberg and Melander (2013), in full in the file's `credit`; USGS public
  domain; GFZ CC BY 4.0.
- **Regenerate:** copy the kit's `ucdp_exact.csv`, `comcat_m55.csv`,
  `kp_storm.csv` and `manifest.json` into `.local/psi-events/` (not
  committed), then `npm run data:psi-events`.
- **Later events:** UCDP's candidate events monthly, ComCat and GFZ live (each
  file's `laterEvents`).

## `psi-finder-plates.json` — the Finder's plate-boundary control

Psi Watch's Finder runs two archetypes whose answers are already known before
any other (decision D-PW, PW61, PW70). For "a Zone on a plate boundary", every
ZSP 2.0 Zone with its area, the share of that area within 150 km of a PB2002
plate boundary (its resonance), and the earthquakes of M5.5 and up it held in
`psi-events-quakes.json`. Worked on a half-degree grid: each cell's Zone from
the areas the globe draws, each cell within 150 km of a boundary by the
haversine from points along the boundaries a tenth of a degree apart. About
19 KB.

- **Licence:** PB2002, Bird (2003), as GeoJSON by Hugo Ahlenius (Nordpil,
  fraxen/tectonicplates), Open Data Commons Attribution License; the quakes as
  their own file says.
- **Regenerate:** `npm run data:psi-finder`, with PB2002 in
  `.local/zsp2-data/pb2002/` (not committed) and the event set baked first.

## `psi-base.json` — the ψ field's static base, for Psi Watch

Three of the ψ field's four structure bands on its 2° grid (decision D-PW,
PW57, PW78), each exp(−d²/2w²) of a cell's distance to its feature, w 350 km,
to four decimals: the geoid's persistence ridges and valleys (EGM96 to degree
12 less GRS80's normal field, on a 41,253-node Fibonacci mesh, the 30 most
persistent pairs over 0.05 m), the spreading steps of PB2002 (classes OSR and
CRB), and the coasts of Natural Earth's 1:110m land. Also the geoid's arcs
themselves. The fourth band, the core's null-flux line, moves with the year
drawn and is computed in the browser from `psi-igrf14.json`. Read only while
the layer shows. About 280 KB, 80 KB gzipped.

- **Licences:** EGM96 (NASA GSFC and NGA, as the Generic Mapping Tools serve
  its first 36 degrees), US Government public domain; PB2002 (Bird 2003, G³
  4(3) 1027, as converted by Hugo Ahlenius), Open Data Commons Attribution 1.0,
  credited on every card that draws it; Natural Earth, public domain.
- **Regenerate:** `npm run data:psi-base` (fetches each input once into
  `.local/psi-field/`). It checks the arcs against the reference: 13 ridges and
  16 valleys, the most persistent 62.6, 28.9 and 17.5 m, and 41.4, 37.3 and
  22.1 m.

## `psi-igrf14.json` — IGRF-14, for Psi Watch's magnetic shield

The 14th International Geomagnetic Reference Field (IAGA Working Group V-MOD,
2024), for the Magnetic shield layer (decision D-PW, PW7, PW58): the Schmidt
semi-normalised coefficients g and h to degree 13 at every epoch from 1900 to
2025, the secular variation for 2025–30, and both dip poles' tracks, a point a
year from 1900 to 2030, each where the field stands vertical at sea level on
the WGS84 ellipsoid. The browser draws the field from it; it is read only while
the layer shows. About 27 KB.

- **Licence:** public data, as NOAA NCEI serves it
  (www.ngdc.noaa.gov/IAGA/vmod/coeffs/igrf14coeffs.txt).
- **Regenerate:** `npm run data:psi-igrf` (fetches that file once), or
  `npm run data:psi-igrf -- <igrf14coeffs.txt>`.

## Licences of the files above that do not state one

Each is also an entry in the source register (`src/legal/sourceRegister.ts`; decision D-CS), with its terms as read,
quoted and dated, and its status for a commercial build.

| File | Licence | Source |
|---|---|---|
| `gdelt-events.json` | GDELT terms: free use, with citation and a link to gdeltproject.org | GDELT Project |
| `threat-indicators.json` | Each list's own: DShield non-commercial (CC BY-NC-SA 4.0), Spamhaus DROP free to use with credit (its terms are written for filtering), ThreatFox CC0, blocklist.de silent | The lists, via FireHOL's mirror |
| `eia-production.json` | US government data: "You may use and/or distribute any of our data" | US EIA |
| `sanctions-changes.json`, `sanctions-by-country.json` | US federal work (17 U.S.C. 105); OFAC publishes no reuse terms | US Treasury OFAC |
| `health-exclusions.json` | US federal work. The supplements name individuals; this file counts them and never names them | HHS OIG LEIE |
| `psi-base.json` | EGM96 not copyrighted (NASA CDDIS); PB2002 boundaries ODC-By (Nordpil's GeoJSON) | NGA, NASA GSFC; Bird (2003) |
| `brreg.json` | NLOD (Norway), which excludes personal data | Brønnøysund Register Centre |
| `companies-house.json`, `psc-control.json` | Open Government Licence v3.0, which excludes personal data; PSC reusers are controllers under UK GDPR. `psc-control.json` takes corporate controllers only, never an individual | UK Companies House |
| `gleif.json`, `lei-coverage.json` | CC0 | GLEIF |
| `wikidata-hq.json` | CC0 | Wikidata |
| `quakes/history`, `quakes/atlas.json` | US federal data; cite doi:10.7289/V5TD9V7K | NOAA NCEI Global Significant Earthquake Database |
| `quakes/plate-boundaries.json` | ODC-By (Nordpil's GeoJSON of PB2002) | Bird (2003) |
| `sky/sky-mag6.json` | The Yale Bright Star Catalogue, 5th revised edition: HEASARC serves it "solely for the purposes of scientific research"; Yale and the authors keep the copyright | Hoffleit and Warren (1991), via NASA HEASARC |
