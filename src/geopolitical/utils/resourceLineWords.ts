/**
 * A country's standing among producers in words (decision D-DP, DP18): its name, its rank and the amount with its
 * source and year. Diplomacy's brief shows them (DiplomacyBrief.tsx), and Resource Zones' fills say them on a hover and
 * list them on a click (critique-2026-11-01, O9), in the same words, so the two never disagree.
 */
import { amounted, fill, numbered } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';
import type { BriefSource, ResourceLine } from './countryBrief';

export type DiplomacyWords = Messages['diplomacy'];

export const SOURCE_KEY: Record<BriefSource, keyof DiplomacyWords['sourceNames']> = { EIA: 'eia', USGS: 'usgs', 'World Bank': 'worldBank', UNHCR: 'unhcr', OFAC: 'ofac' };

/** Where each figure's source publishes it: EIA's data browser, USGS's 2026 data release, the World Bank's indicator. */
export const RESOURCE_SOURCE_LINKS: Record<ResourceLine['source'], string> = {
  EIA: 'https://www.eia.gov/international/data/world',
  USGS: 'https://doi.org/10.5066/P1WKQ63T',
  'World Bank': 'https://data.worldbank.org/indicator/ER.H2O.INTR.PC',
};

// Each source's unit in the catalogue's words, in whole units: EIA's 13,221 "thousand barrels per day"
// is 13.2 million barrels a day. A unit not here is shown as its source gives it.
const UNITS: Record<string, { key: keyof DiplomacyWords['units']; scale: number }> = {
  'thousand barrels per day': { key: 'barrelsPerDay', scale: 1e3 },
  'billion cubic feet': { key: 'cubicFeetPerYear', scale: 1e9 },
  'quadrillion Btu': { key: 'quadrillionBtuPerYear', scale: 1 },
  'metric tons': { key: 'tonnesPerYear', scale: 1 },
  'thousand metric tons': { key: 'tonnesPerYear', scale: 1e3 },
  'm3 per person': { key: 'waterPerPerson', scale: 1 },
};

export interface ResourceLineWords {
  /** "Crude oil", or a mineral's own name: "Copper". */
  name: string;
  /** "rank 3 of 98 producers · top 3%". */
  rank: string;
  /** The amount, its source and year, and where EIA's figures were read: "13.2 million barrels a day · EIA, 2023". */
  source: string;
}

export function resourceLineWords(line: ResourceLine, words: DiplomacyWords): ResourceLineWords {
  const unit = UNITS[line.unit];
  const amount = unit ? fill(words.units[unit.key], { amount: amounted(line.value * unit.scale) }) : `${amounted(line.value)} ${line.unit}`;
  const name = line.kind === 'minerals' && line.commodity
    ? words.minerals[line.commodity as keyof DiplomacyWords['minerals']] ?? line.commodity
    : words.resourceNames[line.kind];
  const rank = fill(line.kind === 'water' ? words.rankCountries : words.rankProducers, { rank: numbered(line.rank), of: numbered(line.of), top: numbered(line.top) });
  const source = [amount, fill(words.sourceYear, { source: words.sourceNames[SOURCE_KEY[line.source]], year: line.year })];
  if (line.via === 'record') source.push(words.viaRecord);
  return { name, rank, source: source.join(' · ') };
}
