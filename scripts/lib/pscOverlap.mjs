/**
 * Corporate control overlap: one entity named as PSC of many companies.
 *
 * WHY ONLY CORPORATE ENTITIES, AND NEVER INDIVIDUALS.
 *
 * The plan called this "director/officer overlap — the same people across
 * unrelated entities". The people half of that cannot be done honestly with
 * this data, and the measurement says so rather than an intuition.
 *
 * An individual PSC record carries a name, a country of residence, and a
 * date of birth reduced to MONTH AND YEAR. The `links.self` token is per
 * appointment, not per person, so there is no stable identifier for a human
 * anywhere in the file. Matching people across companies therefore means
 * joining on (name, birth month, birth year) — and in ONE of the snapshot's
 * 32 parts, 15,530 such keys already appear on more than one record, led by
 * 210 records sharing "MR PETER VALAITIS|11|1950". Some of those are one
 * prolific director. Others are different people who share a name and a birth
 * month. NOTHING IN THE DATA DISTINGUISHES THE TWO, and each false merge would
 * publish a claim that a named, identifiable private individual controls
 * companies they have never heard of. So individuals are excluded, and the
 * boundary says they are excluded rather than leaving a reader to assume the
 * count covers everyone.
 *
 * `super-secure` PSCs are excluded too and separately: those are people whose
 * details are withheld because disclosure would put them at risk of violence.
 *
 * A corporate PSC is different in kind. It files a REGISTRATION NUMBER, which
 * is an exact identifier, and the join is an equality test with no judgement in
 * it. Measured on part 1: 85.5% of corporate PSCs normalise to a UK company
 * number, and only 2.11% of those numbers appear under more than one filed
 * name — and those are filing variation, not identity error (BROOKWROTH vs
 * BROOKWORTH, LTD vs PLC vs LIMITED, "&" vs "AND", and genuine renames). Which
 * is exactly why the join is on the number and never on the name.
 */

/** UK company numbers: eight digits, or two letters and six digits. */
const UK_COMPANY_NUMBER = /^([0-9]{8}|[A-Z]{2}[0-9]{6})$/;

/**
 * Filers write "N/A" in a field that wants an identifier.
 *
 * Measured in part 1: 100 "N/A", plus "Not Applicable", "Na", "None",
 * "Unknown", "-", and a family of all-zero strings. The zeros are the
 * dangerous ones — zero-padding "0" to eight digits yields "00000000", which
 * passes the format check and would merge every sentinel record into one
 * fictional entity controlling dozens of companies.
 */
const SENTINEL = /^(n\/?a|none|notapplicable|unknown|nil|tbc|na|-+|0+)$/i;

export function normaliseRegistrationNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().toUpperCase().replace(/[\s.\-/]/g, '');
  if (!s || SENTINEL.test(s)) return null;
  // Pad short numeric filings: "686734" is company 00686734.
  if (/^[0-9]+$/.test(s) && s.length < 8) s = s.padStart(8, '0');
  if (/^0+$/.test(s)) return null;
  return UK_COMPANY_NUMBER.test(s) ? s : null;
}

/**
 * Fold a filed name for COUNTING VARIANTS only. Never joined on, never
 * published.
 *
 * The corporate PSC name field routinely contains a person's name: filers put
 * the contact individual there instead of the entity. Measured on the full
 * snapshot at a floor of ten companies, 502 of 9,591 controllers (5.2%) carry
 * at least one non-corporate-looking name and 72 carry nothing else — names
 * like "JOHN STEPHEN RIVETT ESQ" and "JENNIFER JARVIS" sitting beside
 * registration numbers that control thousands of companies.
 *
 * Publishing those would associate a named private individual with control of
 * thousands of companies on the strength of somebody's data-entry habit —
 * exactly the harm individual PSCs are excluded to avoid, arriving through the
 * corporate path. So the names are counted and discarded. The registration
 * number is the identity, and it is far more checkable than a name: anyone can
 * look it up in the register.
 */
const foldName = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/[.,]/g, '');

/**
 * Accumulate PSC records into per-controller tallies.
 *
 * Streaming: call `add` per record and `finish` once, so the caller never
 * holds 16 million parsed records at one time.
 */
export function createPscAccumulator() {
  const byNumber = new Map();
  const stats = { records: 0, corporate: 0, individual: 0, superSecure: 0, other: 0, unusableNumber: 0 };

  return {
    stats,
    add(record) {
      const d = record?.data;
      if (!d) return;
      stats.records++;
      const kind = String(d.kind ?? '');
      if (kind.startsWith('individual')) { stats.individual++; return; }
      if (kind.startsWith('super-secure')) { stats.superSecure++; return; }
      if (!kind.startsWith('corporate')) { stats.other++; return; }

      stats.corporate++;
      const num = normaliseRegistrationNumber(d.identification?.registration_number);
      if (!num) { stats.unusableNumber++; return; }

      let e = byNumber.get(num);
      if (!e) { e = { companies: new Set(), names: new Set() }; byNumber.set(num, e); }
      if (record.company_number) e.companies.add(String(record.company_number).trim().toUpperCase());
      // Counted, capped, and never emitted. See foldName.
      if (e.names.size < 8) e.names.add(foldName(d.name));
    },
    finish({ minCompanies = 10 } = {}) {
      const out = [];
      for (const [registrationNumber, e] of byNumber) {
        if (e.companies.size < minCompanies) continue;
        out.push({
          registrationNumber,
          // A COUNT of distinct filed name forms, not the forms themselves.
          // Useful signal — many variants means sloppy or contested filing —
          // with none of the personal-name exposure. Capped at 8, so this
          // saturates rather than misleads.
          nameVariants: e.names.size,
          companyCount: e.companies.size,
          companyNumbers: [...e.companies].sort(),
        });
      }
      out.sort((a, b) => b.companyCount - a.companyCount || a.registrationNumber.localeCompare(b.registrationNumber));
      return out;
    },
  };
}
