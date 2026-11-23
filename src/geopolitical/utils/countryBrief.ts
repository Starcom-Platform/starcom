/**
 * Diplomacy's country brief (decision D-DP, DP6, DP18, DP19): where a country stands among producers,
 * and UNHCR's counts of its people displaced and of those it hosts. Its sanctions are countrySanctions.ts. Pure; the figures are read by
 * useCountryBrief.ts. The relations in the time shown are the drawer's own (diplomaticRelations.ts).
 */
import { ENERGY_SERIES, type EnergyProduction, type EnergySeries } from '../../services/geopolitical/energyProduction';
import type { CountryWaterResource } from '../../services/geopolitical/WorldBankWaterService';
import type { MineralProductionRecord } from '../../services/geopolitical/USGSMineralsService';
import type { CountryDisplacement, CountryDisplacementFrom } from '../../services/geopolitical/UNHCRDisplacementService';

export interface Standing {
  /** 1 and how many have more. */
  rank: number;
  /** How many have a figure. */
  of: number;
  /** The share at or above it, as Resource Zones' percentile puts it (computeCountryPercentiles), never under 1%. */
  top: number;
}

export function standingAmong(values: Iterable<readonly [string, number]>, code: string): Standing | null {
  let mine: number | undefined;
  const all: number[] = [];
  for (const [country, value] of values) {
    all.push(value);
    if (country === code) mine = value;
  }
  if (mine === undefined) return null;
  const rank = 1 + all.filter((value) => value > mine!).length;
  const of = all.length;
  const percentile = of <= 1 ? 100 : ((of - rank) / (of - 1)) * 100;
  return { rank, of, top: Math.max(1, Math.round(100 - percentile)) };
}

export type ResourceKind = EnergySeries | 'minerals' | 'water';
export type BriefSource = 'EIA' | 'USGS' | 'World Bank' | 'UNHCR' | 'OFAC';

export interface ResourceLine extends Standing {
  kind: ResourceKind;
  /** For minerals, USGS's commodity: the one it stands highest in. */
  commodity?: string;
  /** In the source's unit. */
  value: number;
  unit: string;
  year: string;
  source: Exclude<BriefSource, 'UNHCR' | 'OFAC'>;
  /** For EIA's figures, where they were read (DP17). */
  via?: 'record' | 'file';
}

export interface ResourceFigures {
  energy?: EnergyProduction | null;
  water?: readonly CountryWaterResource[] | null;
  minerals?: readonly MineralProductionRecord[] | null;
}

/** Oil, gas, renewables, its best mineral, then water per person: only those it has a figure for. */
export function resourceLines(code: string, figures: ResourceFigures): ResourceLine[] {
  const lines: ResourceLine[] = [];
  for (const kind of ENERGY_SERIES) {
    const series = figures.energy?.[kind];
    const standing = series ? standingAmong(Object.entries(series.values), code) : null;
    if (series && standing) {
      lines.push({ kind, ...standing, value: series.values[code], unit: series.unit, year: String(series.year), source: 'EIA', via: series.via });
    }
  }

  const byCommodity = new Map<string, MineralProductionRecord[]>();
  for (const record of figures.minerals ?? []) {
    byCommodity.set(record.commodity, [...(byCommodity.get(record.commodity) ?? []), record]);
  }
  let best: ResourceLine | null = null;
  for (const [commodity, records] of byCommodity) {
    const standing = standingAmong(records.map((r) => [r.countryISO3, r.value] as const), code);
    const mine = records.find((r) => r.countryISO3 === code);
    if (!standing || !mine) continue;
    // Its best standing, as Resource Zones ranks a country's minerals (deriveMineralsResourceRecords).
    if (!best || standing.top < best.top) {
      best = { kind: 'minerals', commodity, ...standing, value: mine.value, unit: mine.unit, year: mine.year, source: 'USGS' };
    }
  }
  if (best) lines.push(best);

  const water = figures.water ?? [];
  const standing = standingAmong(water.map((r) => [r.countryISO3, r.value] as const), code);
  const mine = water.find((r) => r.countryISO3 === code);
  if (standing && mine) {
    lines.push({ kind: 'water', ...standing, value: mine.value, unit: 'm3 per person', year: mine.year, source: 'World Bank' });
  }
  return lines;
}

export interface DisplacementBrief {
  year: number;
  /** Its people who are refugees, and asylum seekers, in other countries. */
  refugeesAbroad: number;
  asylumAbroad: number;
  /** Its people displaced inside it. */
  inside: number;
  /** The refugees, and asylum seekers, it hosts. */
  refugeesHosted: number;
  asylumHosted: number;
}

/** UNHCR's figures for it both ways (DP19); null when UNHCR lists it on neither side. */
export function displacementOf(
  code: string,
  hosted: readonly CountryDisplacement[],
  from: readonly CountryDisplacementFrom[],
): DisplacementBrief | null {
  const out = from.find((r) => r.countryISO3 === code);
  const host = hosted.find((r) => r.countryISO3 === code);
  if (!out && !host) return null;
  return {
    year: out?.year ?? host!.year,
    refugeesAbroad: out?.refugees ?? 0,
    asylumAbroad: out?.asylumSeekers ?? 0,
    // Counted where they are, so on both sides; by origin first, as the side that is about its people.
    inside: out?.idps || host?.idps || 0,
    refugeesHosted: host?.refugees ?? 0,
    asylumHosted: host?.asylumSeekers ?? 0,
  };
}
