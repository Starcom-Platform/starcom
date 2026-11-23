/**
 * What a mission made in Starcom asks to be counted (the owner's MX32, 2026-10-23; spec rev 18): each a line of the
 * form `<what>: a count`, the form Mecha Jono's effect lines take, so a report answers each with a whole number and
 * nothing else. Things are counted, never people (NavCom's invariant 1): a line that counts people is refused here,
 * by NavCom's own words for them, rather than dropped by a reader later.
 *
 * Carried in the package's manifest at `metadata.format.effect`, a field of no one's name, beside Mecha Jono's
 * `metadata.mechaJono.format.effect`, which readers read first.
 */

/** How long what is counted may be, as the screen says it: with ": a count" its line stays within NavCom's 200. */
const COUNT_WHAT_MAX = 190;
/** How many counts one mission may ask for. */
const COUNT_LINES_MAX = 10;
const SUFFIX = ': a count';

/** NavCom's words that make a line a count of people (packages/core/src/missions/package.ts, PEOPLE). */
const PEOPLE =
  /\b(people|persons?|individuals?|residents|clients|guests|households|families|children|kids|men|women|youths?|seniors|neighbou?rs|folks|unhoused)\b/i;

/** The line a count is asked by: "Naloxone kits placed" becomes "Naloxone kits placed: a count". */
export const countLineOf = (what: string): string => `${what.trim().replace(/[:.\s]+$/, '')}${SUFFIX}`;

/** What a line asks to be counted, back from the line. */
export const countedBy = (line: string): string => (line.endsWith(SUFFIX) ? line.slice(0, -SUFFIX.length) : line);

export type CountLineProblem = 'empty' | 'people' | 'long' | 'twice' | 'many';

/** Why this cannot be asked as a count, or null when it can; the screen says it in the reader's language. */
export function countLineProblem(what: string, asked: readonly string[] = []): CountLineProblem | null {
  const said = what.trim();
  if (!said) return 'empty';
  if (PEOPLE.test(said)) return 'people';
  const line = countLineOf(said);
  if (said.length > COUNT_WHAT_MAX) return 'long';
  if (asked.some((a) => a.toLowerCase() === line.toLowerCase())) return 'twice';
  if (asked.length >= COUNT_LINES_MAX) return 'many';
  return null;
}
