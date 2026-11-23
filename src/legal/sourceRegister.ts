/**
 * The source register (decision D-CS, CS1–CS3; docs/missions/01-architecture-decisions/commercial-split.md): every
 * data source Starcom draws on, by how it reaches the app, with its terms as read, the attribution they ask and what a
 * commercial build may do with it. It is the evidence a grant's data-handling questions are answered from, and what a
 * build profile switches sources by (CS1). Each status is taken from the terms' own words, never from a mirror's label.
 *
 * `commercial` reads:
 * - `allowed`: the terms allow commercial use (attribution and other conditions in `conditions`);
 * - `noncommercial`: the free terms bar commercial use, with no paid path known;
 * - `paid`: a commercial licence or paid tier exists;
 * - `permission`: commercial use needs the source's written permission;
 * - `person-key`: drawn only on the person's own key and account, under their own terms; a commercial build ships no
 *   shared key;
 * - `per-item`: each item carries its own licence (Mecha Jono's notes);
 * - `infrastructure`: no data is taken from it under a licence (relays, gateways, identity lookups);
 * - `unclear`: the terms are silent or ambiguous;
 * - `unread`: the terms have not been read for commercial use yet (the audit's next pass).
 */

export type SourceKind = 'fetched' | 'baked' | 'notes' | 'relay' | 'asset' | 'model' | 'service' | 'on-device';
export type CommercialStatus =
  | 'allowed' | 'noncommercial' | 'paid' | 'permission' | 'person-key' | 'per-item' | 'infrastructure' | 'unclear' | 'unread';

export interface SourceEntry {
  id: string;
  name: string;
  kind: SourceKind;
  /** Hosts a visitor's browser contacts for it (empty for a baked file or an asset). */
  hosts: string[];
  /** Files in the build that hold its data. */
  files?: string[];
  /** Its licence or terms, as they name themselves. */
  licence: string;
  /** Where its terms were read, when, and the words that decide. `read` is a date or 'unread'. */
  terms: { url?: string; read: string; words?: string; record?: string };
  commercial: CommercialStatus;
  /** What the terms ask in any build: attribution, no endorsement, a logo's permission. */
  conditions?: string;
  /** What Starcom uses it for. */
  usedBy: string;
}

const DL = 'data-licensing.md (D-L)';

export const SOURCE_REGISTER: readonly SourceEntry[] = [
  // ── Public agencies, read at run time ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'noaa', name: 'NOAA: SWPC, NWS alerts, GFS on AWS, CO-OPS tides', kind: 'fetched',
    hosts: ['services.swpc.noaa.gov', 'api.weather.gov', 'noaa-gfs-bdp-pds.s3.amazonaws.com', 'api.tidesandcurrents.noaa.gov'],
    licence: 'US government data', terms: { read: '2026-10-05', words: '"open to the public and can be used as desired"', record: DL },
    commercial: 'allowed', conditions: 'no implied endorsement', usedBy: 'Space Weather, Earth Weather, alerts, tides, the field readings',
  },
  {
    id: 'usgs', name: 'USGS: earthquakes (ComCat), water data', kind: 'fetched',
    hosts: ['earthquake.usgs.gov', 'api.waterdata.usgs.gov'], files: ['public/data/psi-events-quakes.json'],
    licence: 'public domain', terms: { read: '2026-10-05', words: '"Credit: U.S. Geological Survey"', record: DL },
    commercial: 'allowed', conditions: 'credit USGS', usedBy: 'Earthquakes, river gauges, Psi Watch history',
  },
  {
    id: 'eumetsat', name: 'EUMETSAT imagery and the Geostationary Ring mosaic', kind: 'fetched', hosts: ['view.eumetsat.int'],
    licence: 'CC BY 4.0 (core data)', terms: { read: '2026-10-05', words: '"Free and Unrestricted … CC-BY-4.0"', record: DL },
    commercial: 'allowed', conditions: 'attribution; the logo needs permission', usedBy: 'Earth Weather clouds',
  },
  {
    id: 'nasaEonet', name: 'NASA EONET', kind: 'fetched', hosts: ['eonet.gsfc.nasa.gov'],
    licence: 'NASA open data', terms: { read: '2026-10-05', words: 'no implied endorsement; "according to NASA" prohibited in AI products', record: DL },
    commercial: 'allowed', conditions: 'no implied endorsement; merch needs NASA approval', usedBy: 'Ecological disasters, Earth Weather',
  },
  {
    id: 'nasaCcmc', name: 'NASA CCMC: DONKI, WSA-ENLIL', kind: 'fetched', hosts: ['ccmc.gsfc.nasa.gov'],
    licence: 'DONKI rules of the road and disclaimer; no licence',
    terms: { url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', read: '2026-11-11', words: 'use "does not … constitute the grant of a license"; real-time data "prototyping quality and in research context"' },
    commercial: 'allowed', conditions: '"We acknowledge the Community Coordinated Modeling Center (CCMC) at Goddard Space Flight Center for the use of" the tool; model runs credited to CCMC and the model\'s developers; no implied endorsement. Treated as a US federal work (17 U.S.C. 105) under CS7; the agency is asked to confirm in writing (letter drafted 2026-11-11).', usedBy: 'Space Weather: CMEs, solar wind model',
  },
  {
    id: 'emsc', name: 'EMSC seismic portal', kind: 'fetched', hosts: ['www.seismicportal.eu'],
    licence: 'CC BY 4.0',
    terms: { url: 'https://www.seismicportal.eu/terms.html', read: '2026-11-11', words: '"permits reuse, including commercial use, as long as there is attribution"' },
    commercial: 'allowed', conditions: '"Credit: EMSC-CSEM SeismicPortal, https://www.seismicportal.eu"; mirroring or bulk-copying its databases needs written permission', usedBy: 'Earthquakes outside the US',
  },
  {
    id: 'gdacs', name: 'GDACS (European Commission JRC)', kind: 'fetched', hosts: ['www.gdacs.org'],
    licence: 'CC BY (European Commission)', terms: { read: '2026-10-05', words: 'attribution', record: DL },
    commercial: 'allowed', conditions: 'attribution', usedBy: 'Disaster alerts, Intel Analyzer',
  },
  {
    id: 'unhcr', name: 'UNHCR refugee data API', kind: 'fetched', hosts: ['api.unhcr.org'],
    licence: 'UNHCR terms', terms: { read: '2026-10-05', words: 'attribution', record: DL },
    commercial: 'allowed', conditions: 'attribution, with the address of its terms', usedBy: 'Conflict Zones displacement',
  },
  {
    id: 'worldBank', name: 'World Bank indicators', kind: 'fetched', hosts: ['api.worldbank.org'],
    licence: 'CC BY 4.0', terms: { read: '2026-10-05', words: 'attribution', record: DL },
    commercial: 'allowed', conditions: 'attribution', usedBy: 'Resource Zones',
  },
  {
    id: 'pacioos', name: 'PacIOOS ERDDAP (GFS fallback)', kind: 'fetched', hosts: ['pae-paha.pacioos.hawaii.edu'],
    licence: 'PacIOOS', terms: { read: '2026-10-05', words: '"used and redistributed for free"', record: DL },
    commercial: 'allowed', usedBy: 'Earth Weather winds, when AWS is unreachable',
  },
  {
    id: 'orbitalDebris', name: 'NASA Orbital Debris Program Office: the Orbital Debris Quarterly News', kind: 'baked', hosts: [],
    files: ['src/services/Satellites/debrisClouds.ts'],
    licence: 'facts cited with a link (a US federal work)',
    terms: { url: 'https://orbitaldebris.jsc.nasa.gov/faq/', read: '2026-11-11', words: 'Starcom takes only facts from the quarterly reports (what broke up, and when), each cited by a link; the browser never contacts the site; facts are not copyrightable, and the site states no terms' },
    commercial: 'allowed', conditions: 'cite the issue', usedBy: 'Satellites: the debris clouds\' breakups (their orbits are CelesTrak\'s)',
  },
  {
    id: 'ofac', name: 'US Treasury OFAC sanctions lists', kind: 'fetched', hosts: ['sanctionslistservice.ofac.treas.gov'], files: ['public/data/sanctions-changes.json', 'public/data/sanctions-by-country.json'],
    licence: 'no reuse terms published (US federal work: 17 U.S.C. 105)',
    terms: { url: 'https://ofac.treasury.gov/sanctions-list-service', read: '2026-11-11', words: 'no licence or reuse text found; "The Department of the Treasury does not endorse any commercial product"' },
    commercial: 'allowed', conditions: 'no implied endorsement; the Treasury seal is restricted by law. Treated as a US federal work (17 U.S.C. 105) under CS7; the agency is asked to confirm in writing (letter drafted 2026-11-11).', usedBy: 'Market Exchange leads, sanctions feed',
  },
  {
    id: 'rewardsForJustice', name: 'US State Department Rewards for Justice', kind: 'fetched', hosts: ['rewardsforjustice.net'],
    licence: 'its footer claims copyright, 2026 (State Department content otherwise public domain)',
    terms: { url: 'https://rewardsforjustice.net/privacy-policy/', read: '2026-11-11', words: 'no terms page; footer claims copyright; State Department seals and logos need written permission (secondary)' },
    commercial: 'allowed', conditions: 'no implied endorsement; listings name people. Treated as a US federal work (17 U.S.C. 105) under CS7; the agency is asked to confirm in writing (letter drafted 2026-11-11).', usedBy: 'Market Exchange reward programmes',
  },
  {
    id: 'fbiApi', name: 'FBI API (Wanted)', kind: 'fetched', hosts: ['api.fbi.gov'],
    licence: 'no API terms found (fbi.gov: public unless attributed)',
    terms: { url: 'https://api.fbi.gov/docs', read: '2026-11-11', words: 'no API-specific terms; the FBI seal, name and initials are restricted by 18 U.S.C. 701 and 709 (secondary)' },
    commercial: 'allowed', conditions: 'listings name people. Treated as a US federal work (17 U.S.C. 105) under CS7; the agency is asked to confirm in writing (letter drafted 2026-11-11).', usedBy: 'Market Exchange',
  },
  {
    id: 'oigExclusions', name: 'HHS OIG exclusions list (LEIE)', kind: 'baked', hosts: [], files: ['public/data/health-exclusions.json'],
    licence: 'no reuse terms found (US federal work)',
    terms: { url: 'https://oig.hhs.gov/exclusions/', read: '2026-11-11', words: 'the download "does not contain SSNs or EINs"; a match on first and last name alone "is not sufficient"; replaced monthly (secondary)' },
    commercial: 'allowed', conditions: 'names individuals: personal data; must be refreshed monthly so reinstated people leave it. Treated as a US federal work (17 U.S.C. 105) under CS7; the agency is asked to confirm in writing (letter drafted 2026-11-11).', usedBy: 'Market Exchange health-fraud leads',
  },
  {
    id: 'celestrak', name: 'CelesTrak orbital elements', kind: 'fetched', hosts: ['celestrak.org'],
    licence: 'no published reuse terms', terms: { read: '2026-10-05', words: 'no published terms on reuse; one download per group per 2 h', record: DL },
    commercial: 'unclear', usedBy: 'Satellites',
  },
  {
    id: 'gfsOnAws', name: 'NOAA GFS on the AWS Open Data registry', kind: 'fetched', hosts: ['noaa-gfs-bdp-pds.s3.amazonaws.com'],
    licence: 'NOAA open data', terms: { read: '2026-10-05', words: 'NOAA: "open to the public"', record: DL },
    commercial: 'allowed', usedBy: 'Earth Weather winds and temperatures',
  },

  // ── Free tiers with non-commercial terms ─────────────────────────────────────────────────────────────────────────
  {
    id: 'openMeteo', name: 'Open-Meteo (free tier)', kind: 'fetched', hosts: ['api.open-meteo.com', 'air-quality-api.open-meteo.com'],
    licence: 'Open-Meteo terms; data CC BY 4.0',
    terms: { read: '2026-11-10', words: '"only … for non-commercial purposes"; apps with "subscriptions or advertising" are commercial', record: DL },
    commercial: 'paid', conditions: '"Weather data by Open-Meteo.com", linked', usedBy: 'Earth Weather: a place\'s forecast and air quality',
  },
  {
    id: 'rainViewer', name: 'RainViewer radar', kind: 'fetched', hosts: ['api.rainviewer.com'],
    licence: 'RainViewer terms', terms: { url: 'https://www.rainviewer.com/api.html', read: '2026-11-11', words: '"available for personal and educational use only"; for "commercial integration … bespoke commercial terms are arranged case-by-case"; "Attribution is mandatory"' },
    commercial: 'permission', conditions: '"Weather data by RainViewer", linked', usedBy: 'Earth Weather radar',
  },
  {
    id: 'cables', name: 'Submarine cables (TeleGeography 2022, via Steve Song\'s mirror)', kind: 'fetched', hosts: ['raw.githubusercontent.com'],
    licence: 'CC BY-NC-SA 3.0 (the mirror is labelled MIT, wrongly)', terms: { url: 'https://www2.telegeography.com/license-geocoded-map-data', read: '2026-11-11', words: '"The raw, geocoded data underlying TeleGeography\'s interactive maps is available via an annual license"; "We no longer maintain or update a GitHub repository for our data"; the CC BY-SA 4.0 statement covers map images and screen captures, and "the underlying databases remains restricted to paying subscribers"', record: DL },
    commercial: 'paid', conditions: 'credit TeleGeography and the licence', usedBy: 'Comm Hubs: cables',
  },
  {
    id: 'acled', name: 'ACLED (configured, on the person\'s key; no layer fetches it)', kind: 'fetched', hosts: ['api.acleddata.com'],
    licence: 'ACLED terms', terms: { url: 'https://acleddata.com/eula', read: '2026-11-11', words: 'the agreement of 1 Nov 2026: "Commercial entities may not access or use the Content and/or Platforms without first obtaining a corporate license"; even non-commercial outputs "must be transformative", and "It is not sufficient for Licensed Content to simply be … made available through the Licensee\'s own dashboard"' },
    commercial: 'paid', usedBy: 'none yet',
  },
  {
    id: 'otx', name: 'LevelBlue (AlienVault) OTX', kind: 'fetched', hosts: ['otx.alienvault.com'],
    licence: 'OTX EULA', terms: { url: 'https://www.levelblue.com/legal/otx-eula-terms', read: '2026-11-11', words: '"OTX is free to end users for non-commercial use"; users may not "copy, modify, duplicate, create derivative works from, frame, mirror, republish, download, display, transmit, or distribute all or any portion of OTX"' },
    commercial: 'permission', conditions: 'no commercial plan is published; the EULA\'s bar on displaying any portion of OTX puts even the non-commercial display in doubt', usedBy: 'none: off since 11 Nov 2026 (the owner) until LevelBlue permits it; no switch ever offered the enrichment ring',
  },
  {
    id: 'firehol', name: 'FireHOL lists: Spamhaus DROP, blocklist.de, ThreatFox mirrors (AbuseIPDB\'s dropped 11 Nov)', kind: 'fetched', hosts: ['raw.githubusercontent.com'],
    files: ['public/data/threat-indicators.json'],
    licence: 'each list\'s own: Spamhaus DROP free to use with credit; ThreatFox CC0; blocklist.de silent',
    terms: { read: '2026-11-11', words: 'Spamhaus: "available at no cost, regardless of size or business type", credited, its name never in commercial materials; ThreatFox: "commercial or for-profit needs may require a paid subscription"; AbuseIPDB\'s list was dropped on 11 Nov: no part of its data may be reproduced "without express permission"' },
    commercial: 'unclear', conditions: 'Spamhaus\'s terms are written for filtering, not display: ask before a commercial build shows it; ThreatFox through Spamhaus\'s paid API; blocklist.de states no terms', usedBy: 'Cyber threats',
  },
  {
    id: 'mitreAttack', name: 'MITRE ATT&CK (enterprise STIX data)', kind: 'fetched', hosts: ['raw.githubusercontent.com'],
    licence: 'ATT&CK terms of use',
    terms: { url: 'https://attack.mitre.org/resources/legal-and-branding/terms-of-use/', read: '2026-11-11', words: '"a non-exclusive, royalty-free license to use ATT&CK" (the mark sign follows) "for research, development, and commercial purposes"' },
    commercial: 'allowed', conditions: 'a copy reproduces MITRE\'s copyright designation and the licence; "MITRE ATT&CK and ATT&CK are registered trademarks of The MITRE Corporation"', usedBy: 'Cyber threats: Known Groups, credited while drawn',
  },
  {
    id: 'dshield', name: 'DShield top attacking networks (SANS Internet Storm Center), via FireHOL\'s mirror', kind: 'fetched', hosts: ['raw.githubusercontent.com'],
    licence: 'CC BY-NC-SA 4.0', terms: { url: 'https://isc.sans.edu/api/', read: '2026-11-11', words: '"It is ok to use this data for commercial purposes, for example to protect your own company\'s network"; "Do not resell the data"; "If your lawyers ask, the data is provided using a … CC BY-NC-SA 4.0 License"' },
    commercial: 'permission', conditions: '"SANS Technology Institute, Internet Storm Center"', usedBy: 'Cyber threats',
  },

  // ── On the person's own key ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'eia', name: 'US EIA energy data (the person\'s key; a baked fallback)', kind: 'fetched', hosts: ['api.eia.gov'],
    files: ['public/data/eia-production.json'], licence: 'US government data',
    terms: { read: '2026-10-05', words: '"You may use and/or distribute any of our data"', record: DL },
    commercial: 'allowed', usedBy: 'Resource Zones energy',
  },
  {
    id: 'openWeatherMap', name: 'OpenWeatherMap (the person\'s key)', kind: 'fetched', hosts: ['api.openweathermap.org'],
    licence: 'OpenWeather terms', terms: { read: '2026-10-05', words: '"Commercial use is allowed", with visible credit', record: DL },
    commercial: 'person-key', usedBy: 'Weather, on a key the person adds',
  },
  {
    id: 'netrunnerKeys', name: 'NetRunner\'s keyed tools: VirusTotal, Censys, Shodan, Hunter.io, Alpha Vantage, N2YO', kind: 'fetched',
    hosts: ['www.virustotal.com', 'search.censys.io', 'api.shodan.io', 'api.hunter.io', 'www.alphavantage.co', 'api.n2yo.com'],
    licence: 'each service\'s own', terms: { read: '2026-10-05', words: 'VirusTotal: "must not be used in commercial products"; Censys free accounts non-commercial', record: DL },
    commercial: 'person-key', usedBy: 'NetRunner, on keys the person adds',
  },
  {
    id: 'keylessRecon', name: 'NetRunner\'s keyless lookups: RDAP (IANA bootstrap, rdap.org and each registry), DNS over HTTPS (Cloudflare, Google), crt.sh, Wayback Machine',
    kind: 'fetched', hosts: ['data.iana.org', 'rdap.org', 'cloudflare-dns.com', 'dns.google', 'crt.sh', 'web.archive.org'],
    licence: 'each service\'s own', terms: { read: '2026-10-12', words: 'ARIN and RIPE limit uses; Wayback "for scholarship and research purposes only"', record: DL },
    commercial: 'unclear', usedBy: 'NetRunner recon, on a person\'s request',
  },

  // ── Translation (D-ML) ───────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'nllb', name: 'NLLB-200 distilled 600M translation model (Meta)', kind: 'model', hosts: ['huggingface.co'],
    licence: 'CC BY-NC 4.0', terms: { url: 'https://github.com/facebookresearch/fairseq/blob/nllb/README.md', read: '2026-11-11', words: '"All models are licensed under CC-BY-NC 4.0"; "not released for production deployment"', record: DL },
    commercial: 'noncommercial', usedBy: 'Translation in the browser',
  },
  {
    id: 'm2m100', name: 'M2M-100 418M translation model (Meta)', kind: 'model', hosts: ['huggingface.co'],
    licence: 'MIT', terms: { read: '2026-10-12', words: 'keep its copyright and licence notice', record: DL },
    commercial: 'allowed', conditions: 'its notice kept', usedBy: 'Translation in the browser',
  },
  {
    id: 'chromeTranslator', name: 'Chrome\'s built-in Translator and Language Detector', kind: 'on-device', hosts: [],
    licence: 'Google\'s Generative AI Prohibited Use Policy', terms: { read: '2026-10-12', record: DL },
    commercial: 'allowed', conditions: 'runs on the person\'s device; no misrepresented provenance', usedBy: 'Translation',
  },
  {
    id: 'cloudTranslators', name: 'Azure Translator, Google Cloud Translation (the person\'s key)', kind: 'service',
    hosts: ['api.cognitive.microsofttranslator.com', 'translation.googleapis.com'],
    licence: 'each provider\'s product terms', terms: { read: '2026-10-12', record: DL },
    commercial: 'person-key', usedBy: 'Translation, on keys the person adds',
  },

  // ── Baked into the build ─────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'ucdp', name: 'UCDP georeferenced events (Uppsala)', kind: 'baked', hosts: [],
    files: ['public/data/ucdp-ged.json', 'public/data/psi-events-conflict.json'],
    licence: 'CC BY 4.0', terms: { read: '2026-10-26', words: 'redistribution permitted "provided the citations travel with the data"', record: 'public/data/README.md' },
    commercial: 'allowed', conditions: 'the citations travel in the files', usedBy: 'Conflict, Psi Watch history',
  },
  {
    id: 'gfzKp', name: 'GFZ Potsdam Kp index since 1932', kind: 'baked', hosts: [], files: ['public/data/psi-kp-gfz.json', 'public/data/psi-events-storms.json'],
    licence: 'CC BY 4.0', terms: { read: '2026-10-27', words: 'the citation travels in the file', record: 'public/data/README.md' },
    commercial: 'allowed', conditions: '"Kp history: GFZ Potsdam, CC BY 4.0"', usedBy: 'Psi Watch Kp lane, storms set',
  },
  {
    id: 'igrf14', name: 'IAGA IGRF-14 (NOAA NCEI)', kind: 'baked', hosts: [], files: ['public/data/psi-igrf14.json'],
    licence: 'public data (NCEI)', terms: { read: '2026-10-30', record: 'public/data/README.md' },
    commercial: 'allowed', usedBy: 'Magnetic shield',
  },
  {
    id: 'pb2002', name: 'PB2002 plate boundaries (Bird 2003; GeoJSON by Nordpil)', kind: 'baked', hosts: [],
    files: ['public/data/psi-finder-plates.json', 'public/data/psi-base.json', 'public/data/quakes/plate-boundaries.json'],
    licence: 'ODC-By (the GeoJSON conversion)', terms: { read: '2026-10-27', record: 'public/data/README.md' },
    commercial: 'allowed', conditions: 'attribution', usedBy: 'Psi Watch Finder and ψ field, earthquakes',
  },
  {
    id: 'egm96', name: 'EGM96 geoid (NGA, NASA GSFC)', kind: 'baked', hosts: [], files: ['public/data/psi-base.json'],
    licence: 'not copyrighted (NASA CDDIS)',
    terms: { url: 'https://cddis.nasa.gov/About/Citing_our_data.html', read: '2026-11-11', words: '"The data are not copyrighted"; "NASA should be acknowledged as the source of the material"' },
    commercial: 'allowed', conditions: 'acknowledge NASA', usedBy: 'ψ field base',
  },
  {
    id: 'gdelt', name: 'GDELT Project events', kind: 'baked', hosts: [], files: ['public/data/gdelt-events.json'],
    licence: 'GDELT terms: free use with citation and link', terms: { read: '2026-10-05', words: 'attribution', record: DL },
    commercial: 'allowed', conditions: 'cite and link GDELT', usedBy: 'Diplomatic events',
  },
  {
    id: 'gvp', name: 'Smithsonian Global Volcanism Program, Volcanoes of the World (Holocene)', kind: 'baked', hosts: [], files: ['public/eco-natural/volcanoes-baked.json'],
    licence: 'Smithsonian Terms of Use; GVP says the database is a product of U.S. government employees',
    terms: {
      url: 'https://volcano.si.edu/gvp_termsofuse.cfm', read: '2026-11-22',
      words: 'Secondary, through a search (the page refuses automated readers): "personal, educational, and other non-commercial uses" allowed; "You may not use the Content for commercial purposes"; "You must cite the author and source of the Content as you would material from any printed work. You must also cite and link to, when possible, the SI Website"; the VOTW database "a product of U.S. government employees". Citation: Global Volcanism Program, 2026. Volcanoes of the World (v. 5.4.0; 7 Aug 2026). Distributed by Smithsonian Institution, compiled by Venzke, E. https://doi.org/10.5479/si.GVP.VOTW5-2026.5.4',
    },
    commercial: 'unclear', conditions: 'cite and link as GVP asks (CREDITS.gvp, on every card that draws the volcanoes). Whether a work of U.S. government employees escapes the Smithsonian\'s non-commercial term is for the owner to read in a browser and the Smithsonian to confirm in writing, as CS7 asks the agencies; until then the commercial build leaves the volcanoes out.', usedBy: 'Eco Disasters: the volcano catalogue drawn under the eruptions',
  },
  {
    id: 'ncei', name: 'NOAA NCEI Global Significant Earthquake Database', kind: 'baked', hosts: [], files: ['public/data/quakes/history', 'public/data/quakes/atlas.json'],
    licence: 'no licence stated (US federal data)',
    terms: { url: 'https://www.ncei.noaa.gov/products/natural-hazards/tsunamis-earthquakes-volcanoes/earthquakes', read: '2026-11-11', words: '"Please cite this data/database as doi: 10.7289/V5TD9V7K"; "Access to this dataset is unrestricted" (secondary)' },
    commercial: 'allowed', conditions: 'cite doi:10.7289/V5TD9V7K. Treated as a US federal work (17 U.S.C. 105) under CS7; the agency is asked to confirm in writing (letter drafted 2026-11-11).', usedBy: 'Earthquake history and atlas',
  },
  {
    id: 'companyRegisters', name: 'Company registers: Brønnøysund (Norway), Companies House and PSC (UK), GLEIF LEI, Wikidata headquarters', kind: 'baked', hosts: [], files: ['public/data/brreg.json', 'public/data/companies-house.json', 'public/data/psc-control.json', 'public/data/gleif.json', 'public/data/lei-coverage.json', 'public/data/wikidata-hq.json'],
    licence: 'NLOD (Norway), OGL v3 (UK), CC0 (GLEIF, Wikidata)',
    terms: { url: 'https://www.gov.uk/guidance/companies-house-data-products', read: '2026-11-11', words: 'OGL: "exploit the Information commercially and non-commercially", but not "personal data in the Information"; PSC reusers "become controllers" under UK GDPR; NLOD excludes personal data; GLEIF and Wikidata CC0' },
    commercial: 'allowed', conditions: 'personal data (PSC, Brønnøysund) is outside the licences: a reuser is a data controller; "Contains public sector information licensed under the Open Government Licence v3.0"; no implied GLEIF endorsement', usedBy: 'Market Exchange company context',
  },
  {
    id: 'starCatalogue', name: 'The Yale Bright Star Catalogue, 5th revised edition (Hoffleit and Warren 1991), via NASA HEASARC', kind: 'baked', hosts: [], files: ['public/data/sky/sky-mag6.json'],
    licence: 'HEASARC: for scientific research; Yale and the authors keep the copyright',
    terms: { url: 'https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html', read: '2026-11-11', words: 'provided "solely for the purposes of scientific research"; HEASARC "does not control the licensing for commercial usage"' },
    commercial: 'permission', conditions: 'a commercial build needs Yale\'s or the authors\' permission, or another catalogue (HYG: CC BY-SA 4.0)', usedBy: 'The sky behind the globe',
  },
  {
    id: 'iauFigures', name: 'Constellation figures (IAU / Sky & Telescope, via the skymap repository)', kind: 'asset', hosts: [],
    licence: 'CC BY 4.0 (the lines only; skymap\'s code is MIT, and its star file, which Starcom does not take, CC BY-NC 3.0 IGO)',
    terms: { url: 'https://github.com/rhannequin/skymap', read: '2026-11-11', words: 'the lines "adapted from the original charts by the IAU and Sky & Telescope magazine (Roger Sinnott & Rick Fienberg)" are "released under the Creative Commons Attribution 4.0 International license"' },
    commercial: 'allowed', conditions: 'credit the IAU and Sky & Telescope (Sinnott, Fienberg) and the transcription', usedBy: 'The sky behind the globe',
  },
  {
    id: 'naturalEarth', name: 'Natural Earth boundaries', kind: 'baked', hosts: [],
    licence: 'public domain',
    terms: { url: 'https://www.naturalearthdata.com/about/terms-of-use/', read: '2026-11-11', words: '"for personal, educational, and commercial purposes"; "No permission is needed"' },
    commercial: 'allowed', conditions: 'optional: "Made with Natural Earth"', usedBy: 'Borders and areas',
  },
  {
    id: 'wikipedia', name: 'Wikipedia (wars list, area pages)', kind: 'baked', hosts: [],
    licence: 'CC BY-SA 4.0',
    terms: { url: 'https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content', read: '2026-11-11', words: '"these licenses do allow commercial uses"; facts "may be reused freely without attribution"' },
    commercial: 'allowed', conditions: 'link to the page reused; adapted prose stays CC BY-SA 4.0', usedBy: 'War & Conflict list, areas',
  },

  // ── Textures and imagery ─────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'solarSystemScope', name: 'Solar System Scope planet textures', kind: 'asset', hosts: [],
    licence: 'CC BY 4.0',
    terms: { url: 'https://www.solarsystemscope.com/textures/', read: '2026-11-11', words: '"You may use, adapt, and share these textures for any purpose, even commercially"' },
    commercial: 'allowed', conditions: 'credit Solar System Scope, with the licence', usedBy: 'The globe and planets',
  },
  {
    id: 'nasaImagery', name: 'NASA imagery: Blue Marble, topography, clouds, SVS land mask and Moon', kind: 'asset', hosts: [],
    licence: 'NASA media guidelines (not copyrighted in the US)',
    terms: { url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/', read: '2026-11-11', words: 'commercial use allowed if it does not "convey NASA\'s endorsement"; Blue Marble: credit "NASA Earth Observatory"; SVS "in the public domain (unless otherwise noted)"' },
    commercial: 'allowed', conditions: 'credit NASA (Blue Marble: "NASA Earth Observatory"); no endorsement; the insignia and logotype are not public domain; in AI products "according to NASA" is prohibited', usedBy: 'The globe and the Moon',
  },
  {
    id: 'googleDataArts', name: 'Google Data Arts Team globe image (webgl-globe world.jpg)', kind: 'asset', hosts: [],
    licence: 'Apache 2.0 (the repository; the image\'s own source is not given)',
    terms: { url: 'https://github.com/dataarts/webgl-globe', read: '2026-11-11', words: 'the licence covers the repository and says nothing of globe/world.jpg, whose source is unknown' },
    commercial: 'unclear', conditions: 'keep the Apache licence and notice', usedBy: 'The globe (Cyber-Earth look)',
  },

  // ── Through Mecha Jono's notes ───────────────────────────────────────────────────────────────────────────────────
  {
    id: 'mechaJonoNotes', name: 'Mecha Jono\'s notes on The Record (Intel reports, Raver, Hero, AI and Psi Watch, War & Conflict, Civil Unrest, missions)',
    kind: 'notes', hosts: ['record.cosmiccodex.app'],
    licence: 'each note\'s own `license` tag; most carry none',
    terms: { read: '2026-11-11', words: '2,954 notes read: 2,041 untagged; tagged include CC BY-NC, CC BY-NC-ND, CC BY-ND, CC BY-SA 4.0, ODbL, OGL, CC0', record: 'commercial-split.md (D-CS)' },
    commercial: 'per-item', conditions: 'CS6: a commercial build shows a note only when its license tag allows commercial use; an untagged note only in the non-commercial build. Mecha Jono is asked to tag every note', usedBy: 'Most modes',
  },

  // ── Infrastructure ───────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'publicRelays', name: 'Public Nostr relays', kind: 'relay',
    hosts: ['nos.lol', 'nostr.mom', 'relay.damus.io', 'relay.primal.net', 'relay.wellorder.net'],
    licence: 'each relay operator\'s policy', terms: { read: 'unread' }, commercial: 'infrastructure', usedBy: 'Reading and publishing notes',
  },
  {
    id: 'ownRelays', name: 'Registered Starcom relay nodes: The Record, the first, and blackpi, its read-only mirror', kind: 'relay', hosts: ['record.cosmiccodex.app', 'blackpi.cosmiccodex.app'],
    licence: 'the node\'s own policy', terms: { read: 'not applicable' }, commercial: 'infrastructure', usedBy: 'Mecha Jono\'s notes, teams, the globe\'s intel',
  },
  {
    id: 'nip05', name: 'Publishers\' NIP-05 addresses (e.g. Mecha Jono\'s), and NavCom', kind: 'service', hosts: ['mecha.jono.archangel.agency', 'navcom.app'],
    licence: 'identity lookups', terms: { read: 'not applicable' }, commercial: 'infrastructure', usedBy: 'Naming publishers, NavCom links',
  },
];
