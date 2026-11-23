/**
 * The big three: Mecha Jono's archetype lenses, and the filter that focuses Starcom on them
 * (decision D-CT, CT5).
 *
 * A note sorted under a lens carries `["t", "lens:tcs"]`, `["t", "lens:idc"]` or
 * `["t", "lens:cbc"]` (Interchange 3.0, widened in 3.12.2 and 3.14 to 3.17): world notes,
 * conflict notes, war pages, convergence and institution cases, designations, bank actions,
 * and the police notes of the NCA, Counter Terrorism Policing and the PSIA. A note may carry
 * more than one. The lens is the publisher's sorting; the report is the authority's.
 *
 * Read from a report's hashtags, which the ingest lowercases (normalizeTag). Only a `t` tag can
 * give one: a hashtag in a note's text stops at the colon.
 */

export type LensId = 'tcs' | 'idc' | 'cbc';

export interface Lens {
  id: LensId;
  /** The tag that carries it. */
  tag: `lens:${LensId}`;
  short: string;
  name: string;
}

/** In the order the operator named them for the filter: TCS, IDC, CBC. */
export const LENSES: readonly Lens[] = [
  { id: 'tcs', tag: 'lens:tcs', short: 'TCS', name: 'Transnational Crime Syndicates' },
  { id: 'idc', tag: 'lens:idc', short: 'IDC', name: 'International Death Cults' },
  { id: 'cbc', tag: 'lens:cbc', short: 'CBC', name: 'Cabals of Banking Cartels' },
];

const BY_TAG = new Map(LENSES.map((lens) => [lens.tag, lens]));
const IDS = new Set<string>(LENSES.map((lens) => lens.id));

/** The contract's own words, kept wherever the filter is offered (Interchange 3.12.2). */
export const LENS_HELP = 'A lens sorts; it never asserts that a syndicate, cult or cabal exists.';

/** The lenses a report's tags carry, in LENSES order, each once. */
export function lensesOf(tags: readonly string[] | undefined): LensId[] {
  if (!tags?.length) return [];
  const found = new Set<LensId>();
  for (const tag of tags) {
    const lens = BY_TAG.get(String(tag).trim().toLowerCase() as Lens['tag']);
    if (lens) found.add(lens.id);
  }
  return LENSES.filter((lens) => found.has(lens.id)).map((lens) => lens.id);
}

/** A stored or handed-over choice, read: known lenses only, each once, in LENSES order. Anything else is All. */
export function readLensChoice(value: unknown): LensId[] {
  if (!Array.isArray(value)) return [];
  const chosen = new Set(value.filter((v): v is LensId => typeof v === 'string' && IDS.has(v)));
  return LENSES.filter((lens) => chosen.has(lens.id)).map((lens) => lens.id);
}

/** Whether a report with these tags is shown: All (nothing chosen) shows every report; else one carrying a chosen lens. */
export function passesLensChoice(tags: readonly string[] | undefined, chosen: readonly LensId[] | undefined): boolean {
  if (!chosen?.length) return true;
  return lensesOf(tags).some((id) => chosen.includes(id));
}

/** The choice with one lens turned on or off. */
export function toggleLens(chosen: readonly LensId[], id: LensId): LensId[] {
  return readLensChoice(chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
}
