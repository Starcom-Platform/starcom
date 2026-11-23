/**
 * Grouping register rows by registered address, for the acquisition script.
 *
 * A deliberate second implementation of src/services/intel/structural/
 * addressClustering.ts. The script must not import app code — it runs under
 * plain node with no bundler, same rule as conformance.mjs — so the choice is
 * between duplicating this and shipping 38MB of rows for the app to count.
 *
 * The duplication is only safe because it is CHECKED: registerFold.test.ts
 * runs both implementations over the same input and requires identical output.
 * An unchecked copy of a counting rule is how two parts of one system come to
 * disagree about a number they both publish.
 */

/** Fold an address to a comparison key: case and spacing only, nothing clever. */
export function foldAddress(line1, postcode) {
  const norm = (v) => String(v).trim().toUpperCase().replace(/\s+/g, ' ');
  return `${norm(line1)}|${norm(postcode)}`;
}

/** Companies House writes dates as DD/MM/YYYY. */
export function toIsoDate(value) {
  const s = String(value ?? '').trim();
  // Companies House writes DD/MM/YYYY; Brønnøysundregistrene writes ISO. Both
  // are accepted EXPLICITLY rather than by a permissive Date.parse, which
  // would read "03/04/2020" as either March or April depending on the host's
  // locale and silently put a company in the wrong month.
  const uk = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const iso = uk ? `${uk[3]}-${uk[2]}-${uk[1]}` : (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  if (!iso) return null;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export const DEFAULT_MIN_COMPANIES = 50;

export function clusterByRegisteredAddress(companies, options = {}) {
  const min = options.minCompanies ?? DEFAULT_MIN_COMPANIES;
  const byAddress = new Map();

  for (const c of companies) {
    if (!c?.addressLine1?.trim() || !c?.postcode?.trim()) continue;
    const key = foldAddress(c.addressLine1, c.postcode);
    const at = byAddress.get(key);
    if (at) at.push(c); else byAddress.set(key, [c]);
  }

  const clusters = [];
  for (const group of byAddress.values()) {
    if (group.length < min) continue;
    const dates = group.map(c => toIsoDate(c.incorporated)).filter(Boolean).sort();
    clusters.push({
      addressLine1: group[0].addressLine1.trim().toUpperCase().replace(/\s+/g, ' '),
      postcode: group[0].postcode.trim().toUpperCase().replace(/\s+/g, ' '),
      companyNumbers: group.map(c => c.number).sort(),
      companyCount: group.length,
      activeCount: group.filter(c => c.status.trim().toLowerCase() === 'active').length,
      firstIncorporated: dates[0] ?? null,
      lastIncorporated: dates[dates.length - 1] ?? null,
    });
  }

  clusters.sort((a, b) =>
    b.companyCount - a.companyCount
    || a.postcode.localeCompare(b.postcode)
    || a.addressLine1.localeCompare(b.addressLine1));
  return clusters;
}
