/**
 * Same-day incorporation batches at one registered address.
 *
 * WHAT THE REAL DATA SAID, AND WHY THIS IS NOT WHAT THE PLAN EXPECTED.
 *
 * The plan called this "incorporation-burst detection — many entities
 * registered together", and the obvious reading is that the mass-registration
 * addresses are where bursts live. Measured against the full register, that is
 * backwards. At 71-75 Shelton Street, 86,035 companies, the busiest single day
 * in twenty years is 264 — 0.3% of the address. Every large formation-agent
 * address sits between 0.2% and 1.0%. That is a smooth, continuous business,
 * and there is no burst in it to find.
 *
 * The batches are at SMALL addresses, which the cluster floor of 50 excludes
 * entirely: 19 of 21 companies at 120 Charing Cross Road on one day; 10 of 11
 * at Higgison House. So this analysis needs the opposite population from
 * address clustering, and reusing that floor would have guaranteed it found
 * nothing while appearing to work.
 *
 * WHAT A BATCH IS NOT. It is not evidence of wrongdoing, and the clearest
 * illustration is in the data: the Higgison House batch is named MEADLAKE
 * PLACE, BOUNDARY HOUSE UXBRIDGE, CLIVEDEN OFFICE VILLAGE, DEVONSHIRE HOUSE
 * BASINGSTOKE — a property group creating one company per building on the day
 * it set them up. Incorporating a company per property, per contract or per
 * fund on a single day is ordinary. The finding is the fact.
 */
import { foldAddress, toIsoDate } from './clusterRegister.mjs';

/**
 * Smallest batch to report, and the smallest share of its address it must be.
 *
 * OUTPUT BOUNDS, not significance thresholds — there is no significance claim
 * here. The share bound is what separates a batch from an agent's ordinary
 * daily volume; the count bound keeps three-company addresses from reporting
 * 100% on no evidence.
 *
 * Neither is load-bearing, which is the only honest defence of a chosen number.
 * Measured on the EC1V+WC2H slice: the share bound returns the same 3 findings
 * anywhere in 0.30–0.50, and the count bound the same 3 anywhere in 5–6. Both
 * sit in a flat region rather than on a cliff, so the output is not an artifact
 * of where they were put.
 */
export const MIN_BATCH_COMPANIES = 5;
export const MIN_BATCH_SHARE = 0.5;

/**
 * One record per address that has a qualifying batch — its LARGEST.
 *
 * Per address rather than per day because the claim is published under a
 * parameterized-replaceable kind, where (author, subject, attribute) is a
 * single slot: emitting one claim per qualifying day at one address would have
 * them silently overwrite each other. `otherQualifyingDays` carries the fact
 * that there were more, so nothing is lost silently.
 */
export function findIncorporationBatches(companies, options = {}) {
  const minCount = options.minCompanies ?? MIN_BATCH_COMPANIES;
  const minShare = options.minShare ?? MIN_BATCH_SHARE;

  const byAddress = new Map();
  for (const c of companies) {
    if (!c?.addressLine1?.trim() || !c?.postcode?.trim()) continue;
    const key = foldAddress(c.addressLine1, c.postcode);
    const at = byAddress.get(key);
    if (at) at.push(c); else byAddress.set(key, [c]);
  }

  const batches = [];
  for (const group of byAddress.values()) {
    const byDay = new Map();
    for (const c of group) {
      const iso = toIsoDate(c.incorporated);
      // A row whose date will not parse is dropped from the DAY tally but
      // still counts toward the address total, because it is still a company
      // at that address. Dropping it from both would inflate every share.
      if (!iso) continue;
      const at = byDay.get(iso);
      if (at) at.push(c); else byDay.set(iso, [c]);
    }

    const qualifying = [...byDay.entries()]
      .filter(([, cs]) => cs.length >= minCount && cs.length / group.length >= minShare)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    if (qualifying.length === 0) continue;

    const [date, cs] = qualifying[0];
    batches.push({
      addressLine1: group[0].addressLine1.trim().toUpperCase().replace(/\s+/g, ' '),
      postcode: group[0].postcode.trim().toUpperCase().replace(/\s+/g, ' '),
      date,
      count: cs.length,
      addressTotal: group.length,
      activeCount: cs.filter(c => c.status.trim().toLowerCase() === 'active').length,
      companyNumbers: cs.map(c => c.number).sort(),
      otherQualifyingDays: qualifying.length - 1,
    });
  }

  batches.sort((a, b) =>
    b.count - a.count
    || a.postcode.localeCompare(b.postcode)
    || a.addressLine1.localeCompare(b.addressLine1));
  return batches;
}
