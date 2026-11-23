/**
 * EIA's international bulk file (https://www.eia.gov/opendata/bulk/INTL.zip, no key) turned into the
 * fallback file energyProduction.ts reads (decision D-DP, DP17). Run by `npm run data:eia`, never by the
 * build: EIA publishes these figures once a year, and the bulk file is 24 MB.
 *
 * Each line of INTL.txt is a series: `INTL.<product>-<activity>-<geography>-<unit>.<frequency>`. Kept:
 * production (activity 1), annual, of crude oil including lease condensate (57, thousand barrels a day),
 * dry natural gas (26, billion cubic feet) and renewables and other (4418, quadrillion Btu), for a
 * three-letter geography. EIA's regions and groups have four letters (WORL, OPEC, EU27); the states that
 * no longer exist have three (SUN, YUG) and no recent figures.
 *
 * A series' year is the one most countries' latest figures are for, and a country is kept when it
 * produced above zero in that year, so every figure is for the same year and "3rd of 106" compares like
 * with like.
 */
import type { EnergyFile, EnergySeries } from './energyProduction';

const WANTED: Record<string, { series: EnergySeries; unit: string }> = {
  '57:TBPD': { series: 'oil', unit: 'TBPD' },
  '26:BCF': { series: 'gas', unit: 'BCF' },
  '4418:QBTU': { series: 'renewable', unit: 'QBTU' },
};

const NAMES: Record<EnergySeries, string> = {
  oil: 'Crude oil including lease condensate production',
  gas: 'Dry natural gas production',
  renewable: 'Renewables and other production',
};

const SERIES_ID = /^INTL\.(\d+)-(\d+)-([A-Z0-9]+)-([A-Z]+)\.A$/;

interface BulkLine {
  series_id?: unknown;
  units?: unknown;
  last_updated?: unknown;
  data?: unknown;
}

export function energyFileFromBulk(lines: Iterable<string>): EnergyFile {
  const found: Partial<Record<EnergySeries, { unit: string; byCountry: Map<string, Map<number, number>> }>> = {};
  let updated = '';
  for (const line of lines) {
    if (!line.startsWith('{"series_id":"INTL.')) continue;
    let row: BulkLine;
    try {
      row = JSON.parse(line) as BulkLine;
    } catch {
      continue;
    }
    const id = typeof row.series_id === 'string' ? SERIES_ID.exec(row.series_id) : null;
    if (!id) continue;
    const [, product, activity, geography, unit] = id;
    const wanted = WANTED[`${product}:${unit}`];
    if (activity !== '1' || !wanted || geography.length !== 3 || !Array.isArray(row.data)) continue;
    const entry = (found[wanted.series] ??= { unit: typeof row.units === 'string' ? row.units : wanted.unit, byCountry: new Map() });
    const years = new Map<number, number>();
    for (const point of row.data) {
      if (!Array.isArray(point) || typeof point[1] !== 'number' || !Number.isFinite(point[1])) continue;
      const year = Number(point[0]);
      if (Number.isInteger(year)) years.set(year, point[1]);
    }
    if (years.size) entry.byCountry.set(geography, years);
    if (typeof row.last_updated === 'string' && row.last_updated > updated) updated = row.last_updated;
  }

  const series: EnergyFile['series'] = {};
  for (const [key, entry] of Object.entries(found) as Array<[EnergySeries, NonNullable<(typeof found)[EnergySeries]>]>) {
    const latest = new Map<number, number>();
    for (const years of entry.byCountry.values()) {
      const last = Math.max(...years.keys());
      latest.set(last, (latest.get(last) ?? 0) + 1);
    }
    // The year most countries' latest figures are for; the later one on a tie.
    const year = [...latest].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
    if (year === undefined) continue;
    const values: Record<string, number> = {};
    for (const [country, years] of [...entry.byCountry].sort(([a], [b]) => a.localeCompare(b))) {
      const value = years.get(year);
      if (value !== undefined && value > 0) values[country] = Number(value.toPrecision(6));
    }
    series[key] = { name: NAMES[key], unit: entry.unit, year, values };
  }

  return {
    version: 1,
    source: 'U.S. Energy Information Administration, International Energy Statistics',
    url: 'https://www.eia.gov/international/data/world',
    license: 'Public domain (a U.S. Government work)',
    updated: updated.slice(0, 10),
    series,
  };
}
