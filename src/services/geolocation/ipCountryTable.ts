// ipCountryTable.ts — DB-IP's country ranges, parsed and searched. Pure: no network, no
// logger, so the build (scripts/snapshot-threats.mjs) can use exactly what the app used.
//
// IP Geolocation by DB-IP — https://db-ip.com — Country Lite, CC BY 4.0, via the
// sapics/ip-location-db mirror.

export interface RangeTable {
  starts: Uint32Array;
  ends: Uint32Array;
  countries: string[]; // parallel array, real ISO 3166-1 alpha-2 codes
}


export function ipToUint32(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

// Exported for direct unit testing — the real CSV is confirmed sorted by start-IP with
// non-overlapping ranges (spot-checked live), which is what makes a plain binary search
// correct here rather than needing an interval tree.
export function parseCountryRangesCsv(text: string): RangeTable {
  const lines = text.split('\n');
  const starts: number[] = [];
  const ends: number[] = [];
  const countries: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const comma1 = line.indexOf(',');
    if (comma1 === -1) continue;
    const comma2 = line.indexOf(',', comma1 + 1);
    if (comma2 === -1) continue;
    const start = ipToUint32(line.slice(0, comma1));
    const end = ipToUint32(line.slice(comma1 + 1, comma2));
    // Full remaining field, not a fixed-width slice — a fixed 2-char slice would silently
    // truncate a malformed longer field (e.g. a real bug caught here: "AUS" sliced to "AU"
    // instead of being rejected) rather than actually validating its length.
    const country = line.slice(comma2 + 1).trim();
    if (start === null || end === null || country.length !== 2) continue;
    starts.push(start);
    ends.push(end);
    countries.push(country);
  }
  return { starts: Uint32Array.from(starts), ends: Uint32Array.from(ends), countries };
}

export function binarySearchCountry(table: RangeTable, ipNum: number): string | null {
  let lo = 0;
  let hi = table.starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (ipNum < table.starts[mid]) {
      hi = mid - 1;
    } else if (ipNum > table.ends[mid]) {
      lo = mid + 1;
    } else {
      return table.countries[mid];
    }
  }
  return null;
}
