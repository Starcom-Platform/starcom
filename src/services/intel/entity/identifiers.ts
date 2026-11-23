/**
 * Telling an identifier from a name (plan item 3.6).
 *
 * An identifier a third party assigned is compared by equality: two LEIs one
 * digit apart name two different companies, and a spelling-similarity score
 * between them means nothing. Entity Review asked people to judge
 * `31570010000000034433 ~ 31570010000000033463`, which no one can.
 *
 * Only shapes that cannot be a name are listed. A name that happens to hold a
 * digit ("7-Eleven", "3M") is still a name.
 */
export type IdentifierKind = 'lei' | 'wikidata' | 'key' | 'npub' | 'number';

const SHAPES: ReadonlyArray<[IdentifierKind, RegExp]> = [
  // ISO 17442: 18 letters or digits, then two check digits.
  ['lei', /^[A-Z0-9]{18}[0-9]{2}$/i],
  ['wikidata', /^Q[1-9]\d*$/],
  ['key', /^[0-9a-f]{64}$/i],
  ['npub', /^npub1[0-9a-z]{58}$/],
];

/** What kind of identifier this is, or null for a name. */
export function identifierKind(ref: string): IdentifierKind | null {
  const s = ref.trim();
  for (const [kind, shape] of SHAPES) if (shape.test(s)) return kind;
  // A register number and the like: digits and separators only, four digits or more.
  if (/^[\d\s./-]+$/.test(s) && (s.match(/\d/g) ?? []).length >= 4) return 'number';
  return null;
}

export const isIdentifier = (ref: string): boolean => identifierKind(ref) !== null;
