/**
 * Credit for each data source Starcom draws, as its terms ask (record D-L,
 * docs/missions/01-architecture-decisions/data-licensing.md; decision L5).
 *
 * Every card prints a "Data:" line naming each source drawn, with its licence
 * where the terms name one, so the credit travels with the image when it is
 * reshared without its post. The key links each. The words are the sources'
 * own where they give them: Open-Meteo asks for "Weather data by
 * Open-Meteo.com", DShield for "SANS Technology Institute, Internet Storm
 * Center", UNHCR for the address of its terms.
 */
import type { FeedProvenance } from './shareCardProvenance';

export interface SourceCredit {
  /** As a card's Data line names it. */
  text: string;
  /** As the key names it, when the source asks for other words there. Absent: `text`. */
  keyText?: string;
  /** Where the key links: the source's page, or the page its terms ask a reader be sent to. */
  url?: string;
  /** The licence, when the terms name one; the card prints its name, the key links it. */
  licence?: { name: string; url: string };
}

const CC_BY_4 = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };

export const CREDITS = {
  noaaSwpc: { text: 'NOAA SWPC', url: 'https://www.swpc.noaa.gov/' },
  // Psi Watch (D-PW, PW62): the lines computed in the browser, the sky events' ephemeris, and the field's own sources,
  // in the words the kit gives for them ("Kp history: GFZ Potsdam, CC BY 4.0"; "NIST Randomness Beacon").
  astronomyEngine: { text: 'Astronomy Engine', url: 'https://github.com/cosinekitty/astronomy' },
  jplDe440s: { text: 'JPL DE440s ephemeris via Skyfield', url: 'https://ssd.jpl.nasa.gov/planets/eph_export.html' },
  gfzKp: { text: 'Kp history: GFZ Potsdam', url: 'https://kp.gfz-potsdam.de/', licence: CC_BY_4 },
  nistBeacon: { text: 'NIST Randomness Beacon', url: 'https://beacon.nist.gov/' },
  // Models, not data, named on the Data line as the record asks (D-SW, SW11): the field lines are their output.
  tsyganenkoT96: { text: 'T96 (N. A. Tsyganenko) via geopack', url: 'https://github.com/tsssss/geopack' },
  igrf14: { text: 'IAGA IGRF-14', url: 'https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field' },
  // The ψ field's base (D-PW, PW78): the geoid's ridges and valleys, and the spreading ridges, ODC-By as its converter asks.
  egm96: { text: 'EGM96 (NASA GSFC, NGA)', url: 'https://cddis.nasa.gov/926/egm96/' },
  pb2002: {
    text: 'PB2002 (Bird 2003), converted by Hugo Ahlenius', url: 'https://github.com/fraxen/tectonicplates',
    licence: { name: 'ODC-By 1.0', url: 'https://opendatacommons.org/licenses/by/1-0/' },
  },
  wsaEnlil: { text: 'NOAA SWPC WSA-ENLIL', url: 'https://www.swpc.noaa.gov/products/wsa-enlil-solar-wind-prediction' },
  // CCMC asks its tools be acknowledged in these words (DONKI's rules of the road, read 11 Nov 2026; D-CS).
  donki: {
    text: 'NASA CCMC DONKI',
    keyText: 'We acknowledge the Community Coordinated Modeling Center (CCMC) at Goddard Space Flight Center for the use of DONKI',
    url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
  },
  noaaGfs: { text: 'NOAA GFS', url: 'https://registry.opendata.aws/noaa-gfs-bdp-pds/' },
  noaaGfsPacioos: { text: 'NOAA GFS via PacIOOS', url: 'https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ncep_global.html' },
  openMeteo: { text: 'Open-Meteo.com', keyText: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/', licence: CC_BY_4 },
  nasaEonet: { text: 'NASA EONET', url: 'https://eonet.gsfc.nasa.gov/' },
  // Quakes beside USGS's (D-EQ, EQ2), in the words EMSC's terms ask for, CC BY 4.0.
  emsc: { text: 'EMSC-CSEM SeismicPortal', url: 'https://www.seismicportal.eu', licence: CC_BY_4 },
  // The atlas of significant quakes, 2150 BC on (D-EQ, EQ4), as NCEI asks it be cited; NOAA's data are public domain.
  ncei: { text: 'NCEI/WDS Global Significant Earthquake Database (NOAA NCEI), doi:10.7289/V5TD9V7K', url: 'https://www.ngdc.noaa.gov/hazel/view/hazards/earthquake/search' },
  gdacs: { text: 'GDACS, European Union', url: 'https://www.gdacs.org/', licence: CC_BY_4 },
  // The Holocene volcano catalogue drawn under Eco Disasters (1,214 volcanoes, baked 14 Aug 2026 from VOTW v. 5.4.0). The
  // Smithsonian asks that its content be cited as a printed work and linked; GVP's own citation form, with its DOI.
  gvp: {
    text: 'Global Volcanism Program, Volcanoes of the World (v. 5.4.0; 7 Aug 2026), Smithsonian Institution, doi:10.5479/si.GVP.VOTW5-2026.5.4',
    keyText: 'Smithsonian Global Volcanism Program, Volcanoes of the World',
    url: 'https://volcano.si.edu/',
  },
  // EUMETSAT asks for "[Contains modified] EUMETSAT [data] [Year]" (Data Policy, Art. 6.3); the card states the year.
  eumetsatGeoRing: { text: 'Contains modified EUMETSAT data', keyText: 'Contains modified EUMETSAT Geostationary Ring data', url: 'https://view.eumetsat.int/', licence: CC_BY_4 },
  // RainViewer asks for "Weather data by RainViewer" with a link, wherever its radar is shown (record D-L, L2).
  rainViewer: { text: 'RainViewer', keyText: 'Weather data by RainViewer', url: 'https://www.rainviewer.com/' },
  celestrak: { text: 'CelesTrak', url: 'https://celestrak.org/' },
  blocklistDe: { text: 'blocklist.de', url: 'https://www.blocklist.de/' },
  abuseIpdb: { text: 'AbuseIPDB', url: 'https://www.abuseipdb.com/' },
  spamhausDrop: { text: 'Spamhaus DROP', url: 'https://www.spamhaus.org/blocklists/do-not-route-or-peer/' },
  // DShield's API data moved to CC BY-NC-SA 4.0 (isc.sans.edu/api, read 10 Nov 2026; D-L, D-CS).
  dshield: {
    text: 'SANS Technology Institute, Internet Storm Center',
    url: 'https://isc.sans.edu',
    licence: { name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  },
  threatFox: { text: 'ThreatFox (abuse.ch)', url: 'https://threatfox.abuse.ch/' },
  fireHol: { text: 'FireHOL blocklist-ipsets', url: 'https://github.com/firehol/blocklist-ipsets' },
  // The cyber layer's enrichment ring (D-CS: drawn, and owed a credit): OTX is "free to end users for non-commercial use".
  otx: { text: 'LevelBlue OTX', keyText: 'LevelBlue Open Threat Exchange (formerly AlienVault OTX)', url: 'https://otx.alienvault.com/' },
  // The cyber layer's Known Groups, from ATT&CK's STIX data (D-CS).
  mitreAttack: {
    text: 'MITRE ATT&CK',
    keyText: 'MITRE ATT&CK, The MITRE Corporation, reproduced with its permission. MITRE ATT&CK and ATT&CK are registered trademarks of The MITRE Corporation',
    url: 'https://attack.mitre.org/resources/legal-and-branding/terms-of-use/',
  },
  cables: {
    text: 'TeleGeography, 2022',
    keyText: "TeleGeography's Submarine Cable Map, 2022, as kept in Steve Song's open_undersea_cable_map",
    url: 'https://github.com/stevesong/open_undersea_cable_map',
    licence: { name: 'CC BY-NC-SA 3.0', url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/' },
  },
  gdelt: { text: 'The GDELT Project', url: 'https://www.gdeltproject.org/' },
  unhcr: { text: 'UNHCR Refugee Population Statistics Database', url: 'https://www.unhcr.org/terms-use-datasets', licence: CC_BY_4 },
  eia: { text: 'U.S. EIA', url: 'https://www.eia.gov/' },
  worldBank: { text: 'World Bank', url: 'https://data.worldbank.org/', licence: CC_BY_4 },
  usgs: { text: 'U.S. Geological Survey', url: 'https://www.usgs.gov/' },
  // The tide gauges: NOAA's Center for Operational Oceanographic Products and Services.
  noaaCoops: { text: 'NOAA CO-OPS', url: 'https://tidesandcurrents.noaa.gov/' },
  // The RNLI's GIS Open Data Licence asks for these words, and a link to the licence where possible (D-HW).
  rnliOpenData: { text: 'Contains Open Data licensed under the GIS Open Data Licence', url: 'https://www.arcgis.com/home/item.html?id=7dad2e58254345c08dfde737ec348166' },
  // IFRC GO's terms ask that "any use of the data outside" it "duly identify the data bank and the database
  // owner", and allow no commercial use without an agreement (data-licensing.md; D-HW, step 4).
  ifrcGo: { text: 'IFRC GO, IFRC', keyText: 'IFRC GO, the International Federation of Red Cross and Red Crescent Societies', url: 'https://go.ifrc.org/' },
  // OCHA's operational presence, via HDX: "Creative Commons Attribution International (CC BY)".
  ochaHdx: { text: 'OCHA, via HDX', url: 'https://data.humdata.org/', licence: CC_BY_4 },
  // The country names a card can ask for (decision K5, TS12, TS14): public domain, credited all the same.
  naturalEarth: { text: 'Natural Earth', url: 'https://www.naturalearthdata.com/' },
  wikipediaWars: {
    text: "Wikipedia's List of ongoing armed conflicts",
    url: 'https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts',
    licence: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  },
} as const satisfies Record<string, SourceCredit>;

/** A credit as a card prints it: the source, and its licence's name where it has one. */
export function creditLine(credit: SourceCredit): string {
  return credit.licence ? `${credit.text} (${credit.licence.name})` : credit.text;
}

/** A licence a platform gives for each producer it carries: `<licence> (<platform>, from <producer>, last updated <day>)`. */
const PER_PRODUCER = /^(.+) \((.+), from (.+), last updated (\d{4}-\d{2}-\d{2})\)$/;
/** How many of a platform's producers a card names before counting the rest (the owner, 26 Oct). */
export const PRODUCERS_NAMED = 8;

/**
 * The licences of the notes in a card's picture, as its Data line names them (Interchange 3.25; the owner's pick of
 * 26 Oct): each once, in the order met, and a platform's producers named together on one credit under their licence,
 * `DATAtourisme, Licence Ouverte 2.0 (Etalab): OT Bourges, ADT 79`; past PRODUCERS_NAMED, the rest counted. Each
 * producer, named or counted, is in the card's record with its day.
 */
export function groupedLicences(licences: readonly string[]): string[] {
  const out: Array<string | { key: string; producers: string[] }> = [];
  const platforms = new Map<string, { key: string; producers: string[] }>();
  const seen = new Set<string>();
  for (const licence of licences) {
    const parts = PER_PRODUCER.exec(licence);
    if (!parts) {
      if (!seen.has(licence)) { seen.add(licence); out.push(licence); }
      continue;
    }
    const [, name, platform, producer] = parts;
    const key = `${platform}, ${name}`;
    let group = platforms.get(key);
    if (!group) { group = { key, producers: [] }; platforms.set(key, group); out.push(group); }
    if (!group.producers.includes(producer)) group.producers.push(producer);
  }
  return out.map((item) => {
    if (typeof item === 'string') return item;
    const named = item.producers.slice(0, PRODUCERS_NAMED).join(', ');
    const more = item.producers.length - PRODUCERS_NAMED;
    return `${item.key}: ${named}${more > 0 ? ` and ${more} more, each named with its day in this card's record` : ''}`;
  });
}

/**
 * Whether anything from a feed can be in the picture: it loaded, or arrived
 * without a time; it did not fail, and it reports. The same rule decides a
 * standing note and a credit (shareCardProvenance.noteApplies): a source
 * whose data is not drawn is neither explained nor credited.
 */
export function dataCanBeInPicture(feed: FeedProvenance): boolean {
  if (feed.error || feed.unreported) return false;
  return !(feed.lastUpdated === null && feed.timestamped !== false);
}

/** The card's Data line: each credit whose data can be in the picture, once, in the order the feeds come. */
export function creditsShown(feeds: readonly FeedProvenance[]): string[] {
  const lines = new Set<string>();
  for (const feed of feeds) {
    if (!dataCanBeInPicture(feed)) continue;
    for (const credit of feed.credits ?? []) lines.add(creditLine(credit));
  }
  return [...lines];
}

/**
 * The card's imagery (decisions TX8, TX10): the maker of each image drawn, as a card names
 * it, once, in the order drawn. The makers come from the globe (globe-engine/imagery.ts).
 */
export function imageryShown(sources: readonly SourceCredit[]): string[] {
  return [...new Set(sources.map(creditLine))];
}

/**
 * A card's credits as one paragraph above its footer (decisions L5, TX10, TS14): its
 * data, the names it draws, then its imagery, "Data: … · …. Names: …. Imagery: … · …".
 * Joined, each costs a card a line only where the paragraph wraps. On a line of its own
 * the imagery cost every stacked card a line of picture, and the square critical card
 * fell below its floor and was refused. Null when there is nothing to credit.
 */
export function creditsParagraph(credits: readonly string[], imagery: readonly string[] = [], names: readonly string[] = []): string | null {
  const parts = [
    credits.length ? `Data: ${credits.join(' · ')}` : null,
    names.length ? `Names: ${names.join(' · ')}` : null,
    imagery.length ? `Imagery: ${imagery.join(' · ')}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join('. ') : null;
}

/**
 * Who to credit for the threat lists drawn: each list's own provider, and
 * FireHOL where its mirror served the list. Only the lists drawn: one that
 * failed is not credited (its own feed says it did not load).
 */
export function threatListCredits(lists: ReadonlyArray<{ label: string; url: string }>): SourceCredit[] {
  const out = new Set<SourceCredit>();
  for (const { label, url } of lists) {
    const provider = label.startsWith('Blocklist.de') ? CREDITS.blocklistDe
      : label.startsWith('AbuseIPDB') ? CREDITS.abuseIpdb
        : label.startsWith('Spamhaus') ? CREDITS.spamhausDrop
          : label.startsWith('DShield') ? CREDITS.dshield
            : label.startsWith('ThreatFox') ? CREDITS.threatFox
              : null;
    if (provider) out.add(provider);
    if (url.includes('/firehol/')) out.add(CREDITS.fireHol);
  }
  return [...out];
}
