/**
 * One month of HHS-OIG's exclusions as the board counts it (decision D-BF, BF1, BF2): the month's
 * supplement to the LEIE (`<yymm>excl.csv`) and its reinstatements (`<yymm>rein.csv`), counted by
 * state, by OIG's category and by the basis in law, with the organisations named.
 *
 * People are counted, never named: the rows carry a person's name, date of birth, NPI and home
 * address, and none of it leaves this function. A business is named with its state, category, basis
 * and date, never its street address; a professional practice whose name carries a professional
 * suffix ("…, MD, INC", "… PC") is often its owner's name, so it is counted, not named.
 *
 * Used at build time (scripts/snapshot-leie.mjs) and in tests, never by the app: oig.hhs.gov sends no
 * CORS header.
 */

/** OIG's bases for exclusion, in its own words (oig.hhs.gov/exclusions/authorities.asp, 2026-10-13). */
export const EXCLUSION_BASES: Readonly<Record<string, { section: string; label: string }>> = {
  '1128a1': { section: '1128(a)(1)', label: 'Conviction of program-related crimes' },
  '1128a2': { section: '1128(a)(2)', label: 'Conviction relating to patient abuse or neglect' },
  '1128a3': { section: '1128(a)(3)', label: 'Felony conviction relating to health care fraud' },
  '1128a4': { section: '1128(a)(4)', label: 'Felony conviction relating to controlled substance' },
  '1128b1': { section: '1128(b)(1)', label: 'Conviction relating to fraud' },
  '1128b2': { section: '1128(b)(2)', label: 'Conviction relating to obstruction of an investigation or audit' },
  '1128b3': { section: '1128(b)(3)', label: 'Misdemeanor conviction relating to controlled substance' },
  '1128b4': { section: '1128(b)(4)', label: 'License revocation, suspension, or surrender' },
  '1128b5': { section: '1128(b)(5)', label: 'Exclusion or suspension under a federal or state health care program' },
  '1128b6': { section: '1128(b)(6)', label: 'Excessive charges, unnecessary services or substandard care' },
  '1128b7': { section: '1128(b)(7)', label: 'Fraud, kickbacks, and other prohibited activities' },
  '1128b8': { section: '1128(b)(8)', label: 'Entities controlled by a sanctioned individual' },
  '1128b11': { section: '1128(b)(9)–(11)', label: 'Failure to disclose or supply required information' },
  '1128b12': { section: '1128(b)(12)', label: 'Failure to grant immediate access' },
  '1128b13': { section: '1128(b)(13)', label: 'Failure to take corrective action' },
  '1128b14': { section: '1128(b)(14)', label: 'Default on health education loan or scholarship obligations' },
  '1128b15': { section: '1128(b)(15)', label: 'Individuals controlling a sanctioned entity' },
  '1128b16': { section: '1128(b)(16)', label: 'False statements or misrepresentations of material fact' },
  '1156': { section: '1156', label: 'Failure to provide medically necessary services meeting professional standards (QIO findings)' },
};

export interface ExcludedOrganisation {
  name: string;
  state: string;
  /** OIG's category, as it writes it: "DME COMPANY". */
  category: string;
  basis: string;
  /** YYYY-MM-DD. */
  date: string;
}

export interface ExclusionMonth {
  /** YYYY-MM. */
  month: string;
  exclusions: number;
  reinstatements: number;
  people: number;
  /** Businesses counted rather than named: a professional practice under its owner's name. */
  practicesCounted: number;
  byState: Record<string, number>;
  byCategory: Record<string, number>;
  /** By OIG's code ("1128b4"); EXCLUSION_BASES says what each is. */
  byBasis: Record<string, number>;
  organisations: ExcludedOrganisation[];
}

/** RFC 4180 rows: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

function records(text: string): Array<Record<string, string>> {
  const [header, ...rows] = csvRows(text);
  if (!header?.includes('EXCLTYPE')) throw new Error('not an LEIE file');
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// A professional suffix: a practice in its owner's name ("ALAN … SCHANKMAN, MD, INC", "AAA MEDICAL, PC").
const PROFESSIONAL = /(^|[\s,.])(MD|M\.D\.|DO|D\.O\.|DDS|DMD|DC|DPM|OD|PHD|RN|NP|PA|PC|P\.C\.|PLLC|PROFESSIONAL CORPORATION)([\s,.]|$)/i;

const day = (yyyymmdd: string) => (/^\d{8}$/.test(yyyymmdd) ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}` : '');
const bump = (counts: Record<string, number>, key: string) => { if (key) counts[key] = (counts[key] ?? 0) + 1; };

export function monthFromLeie(month: string, exclusions: string, reinstatements: string | null): ExclusionMonth {
  const rows = records(exclusions);
  const out: ExclusionMonth = {
    month, exclusions: rows.length, reinstatements: reinstatements ? records(reinstatements).length : 0,
    people: 0, practicesCounted: 0, byState: {}, byCategory: {}, byBasis: {}, organisations: [],
  };
  for (const r of rows) {
    bump(out.byState, r.STATE);
    bump(out.byCategory, r.GENERAL);
    bump(out.byBasis, r.EXCLTYPE);
    const person = !!(r.LASTNAME || r.FIRSTNAME) || !r.BUSNAME;
    if (person) { out.people += 1; continue; }
    if (PROFESSIONAL.test(r.BUSNAME)) { out.practicesCounted += 1; continue; }
    out.organisations.push({ name: r.BUSNAME, state: r.STATE, category: r.GENERAL, basis: r.EXCLTYPE, date: day(r.EXCLDATE) });
  }
  out.organisations.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
