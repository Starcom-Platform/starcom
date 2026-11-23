/**
 * Companies sharing a registered address, counted from a complete register.
 *
 * This is a different KIND of finding from everything else here, and the
 * difference matters more than the code.
 *
 * Corroboration asks "do two independent sources agree?" and its weight is
 * built from independence. This asks "how many entries in one authoritative
 * register share a field?" — a census, not an agreement. There is no second
 * source and none is wanted: Companies House IS the record of what was filed,
 * and a second opinion about it would be less authoritative, not more.
 *
 * So a structural finding must not borrow the corroboration weight. Passing
 * `sourceCount: 1` through a term designed to reward independent agreement
 * would score a complete national register at a quarter — understating it
 * badly — and inflating the count to compensate would be inventing sources.
 * The strength here comes from COMPLETENESS OF ENUMERATION, which is a
 * different axis, and it is declared as one.
 *
 * WHAT A CLUSTER IS NOT. A mass-registration address is not evidence of
 * wrongdoing. Company-formation agents and virtual-office providers serve
 * thousands of entirely ordinary businesses, and the largest clusters are
 * usually exactly those. The finding is a fact — this many companies share
 * this address — and its use is triage: concentration is where both the
 * interesting and the mundane live, and knowing where it is beats guessing.
 * Anything stronger than the fact has to come from evidence this does not have.
 */

export interface RegisteredCompany {
  number: string;
  name: string;
  addressLine1: string;
  postTown: string;
  postcode: string;
  status: string;
  incorporated: string;
}

export interface AddressCluster {
  /** Normalised address key — the thing companies share. */
  addressLine1: string;
  postcode: string;
  /** Every company registered there, within the enumerated boundary. */
  companyNumbers: string[];
  companyCount: number;
  /** How many are currently active, since a dissolved shell is still a fact. */
  activeCount: number;
  /** Earliest and latest incorporation seen at this address, ISO dates. */
  firstIncorporated: string | null;
  lastIncorporated: string | null;
}

/** Fold an address to a comparison key: case and spacing only, nothing clever. */
function foldAddress(line1: string, postcode: string): string {
  const norm = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ');
  return `${norm(line1)}|${norm(postcode)}`;
}

/**
 * Companies House writes DD/MM/YYYY; Brønnøysundregistrene writes ISO.
 *
 * Both accepted EXPLICITLY rather than by a permissive `Date.parse`, which
 * reads "03/04/2020" as March or April depending on the host locale and would
 * silently file a company in the wrong month.
 */
function toIsoDate(value: string): string | null {
  const s = String(value ?? '').trim();
  const uk = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const iso = uk ? `${uk[3]}-${uk[2]}-${uk[1]}` : (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  if (!iso) return null;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export interface ClusterOptions {
  /**
   * Smallest cluster to report.
   *
   * Not a significance threshold — there is no significance claim here. It
   * bounds output size, and the default is deliberately high enough that an
   * ordinary shared office or a family with two companies at one house does
   * not appear at all. Lowering it produces more facts, not better ones.
   */
  minCompanies?: number;
}

export const DEFAULT_MIN_COMPANIES = 50;

/**
 * Group a complete enumeration of companies by registered address.
 *
 * The input must be COMPLETE within whatever boundary it covers. A filtered
 * sample gives a filtered count, and a count is the entire claim — reporting
 * "40 companies at this address" from data that happened to include 40 of 400
 * would be false rather than partial.
 */
export function clusterByRegisteredAddress(
  companies: RegisteredCompany[],
  options: ClusterOptions = {},
): AddressCluster[] {
  const min = options.minCompanies ?? DEFAULT_MIN_COMPANIES;
  const byAddress = new Map<string, RegisteredCompany[]>();

  for (const c of companies) {
    if (!c?.addressLine1?.trim() || !c?.postcode?.trim()) continue;
    const key = foldAddress(c.addressLine1, c.postcode);
    const at = byAddress.get(key);
    if (at) at.push(c); else byAddress.set(key, [c]);
  }

  const clusters: AddressCluster[] = [];
  for (const group of byAddress.values()) {
    if (group.length < min) continue;
    const dates = group.map(c => toIsoDate(c.incorporated)).filter((d): d is string => !!d).sort();
    clusters.push({
      addressLine1: group[0].addressLine1.trim().toUpperCase().replace(/\s+/g, ' '),
      postcode: group[0].postcode.trim().toUpperCase().replace(/\s+/g, ' '),
      // Sorted so the same input always yields the same cluster, whatever
      // order the register happened to list them in.
      companyNumbers: group.map(c => c.number).sort(),
      companyCount: group.length,
      activeCount: group.filter(c => c.status.trim().toLowerCase() === 'active').length,
      firstIncorporated: dates[0] ?? null,
      lastIncorporated: dates[dates.length - 1] ?? null,
    });
  }

  // Largest first, then by address so ties are stable rather than incidental.
  clusters.sort((a, b) =>
    b.companyCount - a.companyCount
    || a.postcode.localeCompare(b.postcode)
    || a.addressLine1.localeCompare(b.addressLine1));
  return clusters;
}
