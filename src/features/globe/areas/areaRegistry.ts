/**
 * New kinds of area (decisions BA16–BA18; plan block J, item 6): continents,
 * unions, spheres and zones.
 *
 * A report names one in its `jurisdiction` tag by a prefixed code, never
 * mistaken for a country's (BA17): `continent:africa`, `union:eu`,
 * `sphere:anglosphere`, `zone:east-african-rift`; a bare `eu` is read as the
 * European Union too. It is listed, featured and opened as a territory is, and
 * the globe and the share handle can look by area (BA16).
 *
 * Each area says where its members or its shape were taken from, and when that
 * page was read: a membership changes (Timor-Leste joined ASEAN in October
 * 2025; Mali, Burkina Faso and Niger left the Francophonie that March), and an
 * area that cannot say as of when is a claim nobody can check.
 *
 * - A continent is the map's own: Natural Earth's `CONTINENT` field, with the
 *   two places that field files under a continent they are not on cut out of it
 *   (CONTINENT_SPLITS), and the island states it files under the open ocean
 *   given to theirs.
 * - A union or sphere is its members, by ISO 3166-1 alpha-2 code, drawn as one
 *   outline around them all. A territory the map holds under no code
 *   (Somaliland) is added by name where the source counts it as part of a
 *   member.
 * - A zone is members, or a shape Starcom drew from the cited definition:
 *   lines widened into a band, a ring, or a circle. Its edges are approximate,
 *   and its `note` says so.
 * - Or a Zone, Terra or Mare is the partition Starcom serves (ZSP 2.0, zoneAreas.ts;
 *   none is coded here since the swap, CR6): its outline in its container's
 *   document in public/geopolitical/zones/, the same one the Zones layer fills
 *   with its Sectors, so a report's outline and the layer never disagree.
 *   `sha256` is the document's, from that folder's manifest, so a redrawn Zone
 *   changes this file's hash and is baked again.
 *
 * The shapes are baked from these definitions by `npm run bake:areas` into
 * public/geopolitical/areas-lod0.geojson, which the app loads only once an
 * area is named; a test fails when the two drift apart (areaDefinitionsHash).
 */

import listed from './listedAreas.json';
import { mergeListed, type ListedAreas } from './listedAreas';
import zoneAreas from './zoneAreas.json';
import { mergeZoneAreas, type ZoneAreas } from './zoneAreas';

/** `terra` and `mare`: a ZSP 2.0 partition's Terrae and Maria, its Zones `zone` (zoneAreas.ts). */
export type AreaKind = 'continent' | 'union' | 'sphere' | 'zone' | 'terra' | 'mare';

/** Where an area's members or shape were taken from, and the day that page was read. */
export interface AreaSource {
  name: string;
  url: string;
  read: string;
}

interface AreaBase {
  code: string;
  kind: AreaKind;
  name: string;
  /** Takes "the" in running text: about the Sahel, but about Africa. */
  the?: true;
  source: AreaSource;
  /** What a reader should know of its edges or members. */
  note?: string;
  /**
   * A sphere's kind, from the canon's types of Sphere (FusionGirl wiki, "Sphere"; the Zone and
   * Sector Protocol's influence lens): what reaches its states. Semantic, a language; cultural,
   * a civilisation; political, a community of states with institutions.
   */
  influence?: 'semantic' | 'cultural' | 'political';
  /**
   * An Organisation's countries that are not members, each with its status and the day it began (D-ZR, ZR10): its
   * partners, observers, candidates and suspended members. Listed in its panel, never drawn as members. A Sphere's
   * are the memberships its list counts but does not draw, status `listed`.
   */
  others?: ReadonlyArray<{ code: string; status: string; since?: string }>;
}

/** A pair of [longitude, latitude], as GeoJSON orders them. */
export type LngLat = readonly [number, number];

export type AreaDef =
  | (AreaBase & {
      from: 'continent';
      continent: string;
      /** Countries the map files under the open ocean, by ISO 3166-1 alpha-2 code, that lie on this continent. */
      also?: readonly string[];
    })
  | (AreaBase & {
      from: 'members';
      members: readonly string[];
      /** Territories the map holds under no code, by name, counted as part of a member by the source. */
      alsoNamed?: readonly string[];
      /** Members the source says are suspended: not drawn. */
      suspended?: readonly string[];
    })
  | (AreaBase & { from: 'lines'; lines: ReadonlyArray<readonly LngLat[]>; widthKm: number })
  | (AreaBase & { from: 'ring'; ring: readonly LngLat[] })
  | (AreaBase & { from: 'circle'; centre: LngLat; radiusKm: number })
  | (AreaBase & {
      from: 'zsp'; file: string; sha256: string;
      /** For a Zone drawn as whole countries (the Horn of Africa, the Balkans, the Levant): those countries. */
      members?: readonly string[];
    })
  /** A Zone a ZSP 2.0 manifest retired, drawn as the Zones that now cover it (zoneAreas.ts). */
  | (AreaBase & { from: 'covered'; coveredBy: readonly string[] });

const READ = '2026-10-04';
const NATURAL_EARTH: AreaSource = {
  name: "Natural Earth's admin-0 countries, the map's own CONTINENT field",
  url: 'https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/',
  read: READ,
};
const wikipedia = (title: string): AreaSource => ({ name: `Wikipedia: ${title.replace(/_/g, ' ')}`, url: `https://en.wikipedia.org/wiki/${title}`, read: READ });
/** Areas added on 2026-10-12: the spheres after the first five. */
const READ_ZSP = '2026-10-12';
const wikipediaRead = (title: string, read: string): AreaSource => ({ ...wikipedia(title), read });

const continent = (slug: string, name: string, more: { also?: readonly string[]; note?: string } = {}): AreaDef =>
  ({ code: `continent:${slug}`, kind: 'continent', name, from: 'continent', continent: name, ...more, source: NATURAL_EARTH });

/**
 * A country the map files under one continent although part of it is on
 * another: its land inside `within` is drawn on `inside`, the rest on `outside`.
 */
export interface ContinentSplit {
  /** By ISO 3166-1 alpha-2 code. */
  country: string;
  inside: string;
  outside: string;
  within: readonly LngLat[];
  why: string;
}

export const CONTINENT_SPLITS: readonly ContinentSplit[] = [
  {
    country: 'ru', inside: 'Europe', outside: 'Asia',
    // West of the Ural River from the Kazakh border to its source, then of the Urals to the Kara Sea, then of a line through it that leaves Novaya Zemlya in Europe.
    within: [
      [15.0, 40.0], [58.5, 40.0], [58.5, 51.0], [59.0, 53.4], [59.5, 54.3], [59.8, 56.8], [59.5, 58.7], [59.2, 60.5], [59.3, 61.8], [59.6, 63.5],
      [60.1, 65.0], [61.5, 65.9], [63.5, 66.4], [64.9, 66.7], [66.1, 68.5], [66.3, 68.9], [65.0, 71.5], [66.5, 73.2], [70.0, 76.0], [70.0, 85.0],
      [15.0, 85.0], [15.0, 40.0],
    ],
    why: 'The map files all of Russia under Europe. The usual divide is the Urals and the Ural River, drawn here by Starcom: approximate.',
  },
];

/**
 * A country a list names whole though the map draws its parts apart (8 Nov 2026, Mecha Jono's note of 7 Nov, the
 * owner's choice): French Guiana, Guadeloupe, Martinique, Réunion and Mayotte are regions of the French Republic, each
 * with its own ISO 3166-1 code and drawn as its own territory (scripts/geopolitical/split-france-overseas.mjs). A
 * union or sphere that lists France holds them too, as it did while the map drew French Guiana inside France: the EU
 * counts them as its outermost regions (TFEU, art. 349).
 */
export const PARTS_OF: Readonly<Record<string, readonly string[]>> = { fr: ['gf', 'gp', 'mq', 're', 'yt'] };

/** The areas coded here; Mecha Jono's lists are merged over them below (listedAreas.ts). */
const CODED_AREAS: readonly AreaDef[] = [
  continent('africa', 'Africa', { also: ['sc', 'mu', 're'], note: 'The map\'s own, with the Seychelles, Mauritius and Réunion, which it files under the open ocean.' }),
  continent('antarctica', 'Antarctica'),
  continent('asia', 'Asia', { also: ['mv'], note: 'The map\'s own, with Russia east of the Urals, and the Maldives.' }),
  continent('europe', 'Europe', { note: 'The map\'s own, with Russia only west of the Urals; France\'s overseas regions are on their own continents.' }),
  continent('north-america', 'North America'),
  continent('oceania', 'Oceania'),
  continent('south-america', 'South America', { note: 'The map\'s own, French Guiana with it.' }),

  {
    code: 'union:eu', kind: 'union', name: 'European Union', the: true, from: 'members',
    members: ['at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie', 'it', 'lv', 'lt', 'lu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se'],
    source: { name: 'European Union: EU countries', url: 'https://european-union.europa.eu/principles-countries-history/eu-countries_en', read: READ },
    note: 'Northern Cyprus is left out: EU law is suspended there.',
  },
  {
    code: 'union:au', kind: 'union', name: 'African Union', the: true, from: 'members',
    members: ['dz', 'ao', 'bj', 'bw', 'bf', 'bi', 'cv', 'cm', 'cf', 'td', 'km', 'cd', 'cg', 'ci', 'dj', 'eg', 'gq', 'er', 'sz', 'et', 'ga', 'gm', 'gh', 'gn', 'gw', 'ke', 'ls', 'lr', 'ly', 'mg', 'mw', 'ml', 'mr', 'mu', 'ma', 'mz', 'na', 'ne', 'ng', 'rw', 'eh', 'st', 'sn', 'sc', 'sl', 'so', 'za', 'ss', 'sd', 'tz', 'tg', 'tn', 'ug', 'zm', 'zw'],
    alsoNamed: ['Somaliland'],
    source: { name: 'African Union: Member States', url: 'https://au.int/en/node/3678', read: READ },
    note: 'Somaliland is drawn as part of Somalia, a member; members the Union has suspended are drawn too.',
  },
  {
    code: 'union:asean', kind: 'union', name: 'ASEAN', from: 'members',
    members: ['bn', 'kh', 'id', 'la', 'my', 'mm', 'ph', 'sg', 'th', 'vn', 'tl'],
    source: wikipedia('ASEAN'),
    note: 'Timor-Leste joined on 26 October 2025, the eleventh member.',
  },
  {
    code: 'union:arab-league', kind: 'union', name: 'Arab League', the: true, from: 'members',
    members: ['dz', 'bh', 'km', 'dj', 'eg', 'iq', 'jo', 'kw', 'lb', 'ly', 'mr', 'ma', 'om', 'ps', 'qa', 'sa', 'so', 'sd', 'sy', 'tn', 'ae', 'ye'],
    alsoNamed: ['Somaliland'],
    source: wikipedia('Arab_League'),
    note: "Syria's membership was reinstated on 7 May 2023; Somaliland is drawn as part of Somalia, a member.",
  },
  {
    code: 'union:gcc', kind: 'union', name: 'Gulf Cooperation Council', the: true, from: 'members',
    members: ['bh', 'kw', 'om', 'qa', 'sa', 'ae'],
    source: wikipedia('Gulf_Cooperation_Council'),
  },
  {
    code: 'union:mercosur', kind: 'union', name: 'Mercosur', from: 'members',
    members: ['ar', 'br', 'py', 'uy', 'bo'],
    suspended: ['ve'],
    source: wikipedia('Mercosur'),
    note: 'Bolivia became a full member in July 2024; Venezuela has been suspended since 1 December 2016 and is not drawn.',
  },

  {
    code: 'sphere:anglosphere', kind: 'sphere', influence: 'cultural', name: 'Anglosphere', the: true, from: 'members',
    members: ['us', 'gb', 'ca', 'au', 'nz'],
    source: wikipedia('Anglosphere'),
    note: 'Its core five; some definitions add Ireland.',
  },
  {
    code: 'sphere:francophonie', kind: 'sphere', influence: 'political', name: 'Francophonie', the: true, from: 'members',
    members: ['al', 'ad', 'am', 'be', 'bj', 'bg', 'bi', 'cv', 'kh', 'cm', 'ca', 'cf', 'cy', 'km', 'cg', 'cd', 'ci', 'dj', 'dm', 'eg', 'fr', 'ga', 'gh', 'gr', 'gn', 'gw', 'gq', 'ht', 'la', 'lb', 'lu', 'mk', 'mg', 'ma', 'mu', 'mr', 'md', 'mc', 'ro', 'rw', 'lc', 'st', 'sn', 'sc', 'ch', 'td', 'tg', 'tn', 'vu', 'vn'],
    source: { name: "OIF: the 93 states and governments, XIXth Summit (October 2024)", url: 'https://www.francophonie.org/sites/default/files/2024-11/Liste_93_Etats_et_gouvernements_OIF.pdf', read: READ },
    note: 'The full member states: the three governments (Quebec, New Brunswick, Wallonia-Brussels) are within members, and Mali, Burkina Faso and Niger left in March 2025.',
  },
  {
    code: 'sphere:hispanosphere', kind: 'sphere', influence: 'semantic', name: 'Hispanosphere', the: true, from: 'members',
    members: ['es', 'mx', 'co', 'ar', 'pe', 've', 'cl', 'ec', 'gt', 'cu', 'bo', 'do', 'hn', 'py', 'sv', 'ni', 'cr', 'pa', 'uy', 'gq', 'pr'],
    source: wikipedia('List_of_countries_and_territories_where_Spanish_is_an_official_language'),
    note: 'The 20 states with Spanish as an official language, and Puerto Rico.',
  },
  {
    code: 'sphere:lusosphere', kind: 'sphere', influence: 'political', name: 'Lusosphere', the: true, from: 'members',
    members: ['pt', 'br', 'ao', 'mz', 'cv', 'gw', 'st', 'tl', 'gq'],
    source: wikipedia('Community_of_Portuguese_Language_Countries'),
    note: "The CPLP's nine; Guinea-Bissau's part in it was reported suspended after its November 2025 coup, and it stays in the sphere of the language.",
  },
  {
    code: 'sphere:sinosphere', kind: 'sphere', influence: 'cultural', name: 'Sinosphere', the: true, from: 'members',
    members: ['cn', 'tw', 'hk', 'mo', 'jp', 'kr', 'kp', 'vn'],
    source: wikipedia('East_Asian_cultural_sphere'),
    note: 'Greater China, Japan, Korea and Vietnam.',
  },
  // Added 2026-10-12 (the owner's picks, from cited membership lists).
  {
    code: 'sphere:russophone', kind: 'sphere', influence: 'semantic', name: 'Russophone world', the: true, from: 'members',
    members: ['ru', 'by', 'kz', 'kg'],
    source: wikipediaRead('Geographical_distribution_of_Russian_speakers', READ_ZSP),
    note: 'The states where Russian is an official or co-official language; it is spoken far beyond them.',
  },
  {
    code: 'sphere:arabophone', kind: 'sphere', influence: 'semantic', name: 'Arabophone world', the: true, from: 'members',
    members: ['dz', 'bh', 'km', 'dj', 'eg', 'iq', 'jo', 'kw', 'lb', 'ly', 'mr', 'ma', 'om', 'ps', 'qa', 'sa', 'so', 'sd',
      'sy', 'tn', 'ae', 'ye', 'td', 'eh'],
    source: wikipediaRead('List_of_countries_and_territories_where_Arabic_is_an_official_language', READ_ZSP),
    note: 'Where Arabic is an official language: the Arab League’s 22, Chad, and Western Sahara as the map draws it. The language, not the union.',
  },
  {
    code: 'sphere:turkic', kind: 'sphere', influence: 'political', name: 'Turkic world', the: true, from: 'members',
    members: ['tr', 'az', 'kz', 'kg', 'uz'],
    source: wikipediaRead('Organization_of_Turkic_States', READ_ZSP),
    note: 'The Organization of Turkic States’ five members; Hungary and Turkmenistan are observers and are not drawn.',
  },
  {
    code: 'sphere:persianate', kind: 'sphere', influence: 'semantic', name: 'Persianate world', the: true, from: 'members',
    members: ['ir', 'af', 'tj'],
    source: wikipediaRead('Persian_language', READ_ZSP),
    note: 'Where Persian is official: as Farsi in Iran, Dari in Afghanistan and Tajik in Tajikistan.',
  },
  {
    code: 'sphere:germanosphere', kind: 'sphere', influence: 'semantic', name: 'Germanosphere', the: true, from: 'members',
    members: ['de', 'at', 'ch', 'li', 'lu', 'be'],
    source: wikipediaRead('German_language', READ_ZSP),
    note: 'The states where German is an official language; in Belgium, Luxembourg and Switzerland one of several.',
  },
  {
    code: 'sphere:malay', kind: 'sphere', influence: 'semantic', name: 'Malay world', the: true, from: 'members',
    members: ['id', 'my', 'bn', 'sg'],
    source: wikipediaRead('Malay_language', READ_ZSP),
    note: 'Where Malay, or Indonesian, its standard form there, is a national language.',
  },
  {
    code: 'sphere:swahili', kind: 'sphere', influence: 'semantic', name: 'Swahili sphere', the: true, from: 'members',
    members: ['tz', 'ke', 'ug', 'rw', 'cd'],
    source: wikipediaRead('Swahili_language', READ_ZSP),
    note: 'Where Swahili is an official or national language; it is spoken well beyond these five.',
  },
  {
    code: 'sphere:nordic', kind: 'sphere', influence: 'political', name: 'Nordic world', the: true, from: 'members',
    members: ['dk', 'fi', 'is', 'no', 'se', 'fo', 'gl', 'ax'],
    source: { name: 'Nordic Council: about the Nordic Council', url: 'https://www.norden.org/en/information/about-nordic-council', read: READ_ZSP },
    note: 'The Nordic Council’s five states and its three autonomous territories, the Faroe Islands, Greenland and Åland.',
  },

];

/**
 * Every area: those coded here, with the Spheres and Organisations Mecha Jono's lists hold merged over them (CR6,
 * D-ZR ZR10). listedAreas.json is written by `npm run bake:areas`; while it is empty, these are the coded ones.
 */
export const AREAS: readonly AreaDef[] = mergeZoneAreas(mergeListed(CODED_AREAS, listed as unknown as ListedAreas), zoneAreas as unknown as ZoneAreas);

/** Bare codes read as an area: the European Union's, which is in common use. */
export const AREA_ALIASES: Readonly<Record<string, string>> = { eu: 'union:eu' };

const byCode = new Map(AREAS.map((area) => [area.code, area]));

/** The area a jurisdiction names, by its prefixed code or an alias, or null when it names none. */
export function areaCodeOf(jurisdiction: string): string | null {
  const code = jurisdiction.trim().toLowerCase().replace(/\s*:\s*/, ':');
  const named = AREA_ALIASES[code] ?? code;
  return byCode.has(named) ? named : null;
}

export function areaByCode(code: string): AreaDef | null {
  return byCode.get(code) ?? null;
}

/**
 * A short hash of every definition (FNV-1a, 32 bits), which the baked shapes
 * record: when a member or a shape changes and the file is not baked again, a
 * test says so.
 */
export function areaDefinitionsHash(): string {
  const text = JSON.stringify({ AREAS, CONTINENT_SPLITS, PARTS_OF });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
