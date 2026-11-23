/**
 * An address line that names a person is not a place.
 *
 * Company registers routinely record a registered address as "C/O <someone>",
 * and in Norway that someone is often a private individual whose home is the
 * registered office for a handful of small companies. A claim keyed on that
 * line is a claim about a PERSON, published under `subjectKind: 'place'` —
 * a false declaration, and the publication policy gates on subjectKind, so the
 * one control that could have caught it never saw a person to protect.
 *
 * HOW THIS GOT SHIPPED. Address clustering has a floor of 50 companies, and a
 * private home almost never has 50, so that floor was protecting privacy
 * without anyone noticing it was. Same-day incorporation batches need no such
 * floor — the whole point is small addresses — so adding them removed the
 * protection silently. Found by auditing what the published subjects actually
 * said: "C/O RAYMOND FRIVÅG, 0194", a name and a postcode.
 *
 * DELIBERATELY OVER-EXCLUDES. A company with no legal-form suffix in its name
 * is withheld too. Losing a finding is recoverable — the address is still in
 * the register and anyone can look — while naming a private individual is not.
 * The count of what was withheld is published, so the population stays
 * honestly described rather than quietly smaller.
 */

/** A line with any of these is describing a place, not a party. */
const STREET_HINT = /\d|\b(GATE|GATA|GT|VEI|VEG|VEIEN|VEGEN|PLASS|ALLE|ALLÉ|TORG|BRYGGE|KAI|SVING|STUBBEN|STIEN|BAKKEN|STREET|ROAD|LANE|AVENUE|SQUARE|COURT|PARK|HILL|WAY|CLOSE|DRIVE|TERRACE|PLACE|WHARF|QUAY|ESTATE|INDUSTRIAL|BUSINESS)\b/i;

/** A line with any of these is naming an organisation. */
const ORGANISATION = /\b(LIMITED|LTD|PLC|LLP|LP|INC|CORP|CORPORATION|COMPANY|HOLDINGS?|GROUP|AS|ASA|ANS|DA|BA|SA|NUF|BBL|AB|OY|GMBH|BV|NV|SARL|TRUST|FOUNDATION|PARTNERS?|PARTNERSHIP|ASSOCIATION|SOCIETY|COUNCIL|UNION|FORENING\w*|LAG|BOLIG\w*|FORVALTNING|EIENDOM\w*|REGNSKAP\w*|ADVOKAT\w*|REVISJON|SERVICES?|SOLUTIONS?|CONSULT\w*|ACCOUNT\w*|SECRETAR\w*|HOUSE|HUS|CENTRE|CENTER|OFFICE|CHAMBERS|BANK|CAPITAL|INVEST\w*|NORDIC|AVD|SENTER|KONTOR)\b/i;

/**
 * Norwegian builds compounds, so an organisational word is often a SUFFIX
 * rather than a standalone token: "skogeierforening" is a forest owners'
 * association and `\bFORENING\b` does not see it.
 *
 * Matched as substrings, and deliberately only the unambiguous ones. Every
 * addition here withholds FEWER addresses, so a loose morpheme — bare "lag",
 * say, which appears inside ordinary surnames — trades privacy for coverage
 * in the direction that cannot be undone.
 */
const ORGANISATION_COMPOUND = /(FORENING|FORBUND|BYGGELAG|BORETTSLAG|SAMEIE|STIFTELSE|FORVALTNING|EIENDOM|REGNSKAP|SELSKAP|SENTER|KONTOR|VERKET|BRUKET)/i;

/** Capitalised words and nothing else — the shape of a personal name. */
const NAME_SHAPED = /^[A-ZÆØÅÄÖÉÈ][A-Za-zÆØÅæøåÄÖäöÉÈéè.\-']*(\s+[A-ZÆØÅÄÖÉÈ][A-Za-zÆØÅæøåÄÖäöÉÈéè.\-']*){0,3}$/;

/**
 * True when this address line should not be published as a place.
 *
 * The care-of prefix is stripped first because it is the commonest way a
 * person's name reaches an address field, and "CO" without a slash is the same
 * thing typed differently.
 */
export function namesAPersonRatherThanAPlace(addressLine) {
  const line = String(addressLine ?? '').trim();
  if (!line) return false;
  const party = line.replace(/^(C\s*\/\s*O|V\s*\/|CO)\s+/i, '').trim();
  if (!party) return false;
  if (STREET_HINT.test(party)) return false;
  if (ORGANISATION.test(party) || ORGANISATION_COMPOUND.test(party)) return false;
  return NAME_SHAPED.test(party);
}

/** Split a list into what may be published and what must be withheld. */
export function partitionByPublishability(items, addressOf = (x) => x.addressLine1) {
  const publishable = [], withheld = [];
  for (const item of items) {
    (namesAPersonRatherThanAPlace(addressOf(item)) ? withheld : publishable).push(item);
  }
  return { publishable, withheld };
}
