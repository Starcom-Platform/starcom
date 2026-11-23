/**
 * One OFAC publication's delta file as the board counts it (decision D-BF, BF1, BF2): what was added
 * and removed, by type and by sanctions programme, and the organisations, vessels and aircraft named,
 * each with its countries and programmes. People are counted, never named: no person's name leaves
 * this function. An entry with no action amends an existing one and lists only what changed, so it is
 * counted as amended and no more.
 *
 * Used at build time (scripts/snapshot-ofac.mjs) and in tests, never by the app: the delta files sit
 * on S3, which sends no CORS header, and xml2js stays out of the bundle.
 */
import { parseStringPromise } from 'xml2js';

export interface Tally {
  entities: number;
  individuals: number;
  vessels: number;
  aircraft: number;
  /** A type OFAC names that is none of the four. */
  other: number;
}

export interface NamedChange {
  action: 'add' | 'remove';
  type: 'Entity' | 'Vessel' | 'Aircraft';
  name: string;
  countries: string[];
  programmes: string[];
}

export interface SanctionsPublication {
  id: number;
  /** As OFAC dates it, YYYY-MM-DD. */
  date: string;
  /** OFAC's kind of publication: "Standard Action". */
  kind: string;
  added: Tally;
  removed: Tally;
  amended: number;
  /** Each programme's entries added and removed; an entry under two programmes counts under each. */
  programmes: Array<{ code: string; added: number; removed: number }>;
  named: NamedChange[];
}

export const emptyTally = (): Tally => ({ entities: 0, individuals: 0, vessels: 0, aircraft: 0, other: 0 });

const TALLY_KEY: Record<string, keyof Tally> = { Entity: 'entities', Individual: 'individuals', Vessel: 'vessels', Aircraft: 'aircraft' };

type Node = Record<string, unknown>;
const all = (node: unknown, key: string): Node[] => {
  const value = (node as Node | undefined)?.[key];
  return Array.isArray(value) ? (value as Node[]) : [];
};
const one = (node: unknown, ...path: string[]): Node | undefined => path.reduce<Node | undefined>((at, key) => all(at, key)[0], node as Node);
const textOf = (node: unknown): string => {
  if (typeof node === 'string') return node.trim();
  const text = (node as Node | undefined)?._;
  return typeof text === 'string' ? text.trim() : '';
};
const attr = (node: unknown, name: string): string | undefined => ((node as Node | undefined)?.$ as Record<string, string> | undefined)?.[name];
const isPrimary = (node: Node) => textOf(all(node, 'isPrimary')[0]) === 'true';

/** The entry's primary name in its primary script; never asked of a person. */
function primaryName(entity: Node): string {
  const names = all(one(entity, 'names'), 'name');
  const name = names.find(isPrimary) ?? names[0];
  const translations = all(one(name, 'translations'), 'translation');
  const translation = translations.find(isPrimary) ?? translations[0];
  return textOf(all(translation, 'formattedFullName')[0]);
}

export async function publicationFromDelta(xml: string, id: number): Promise<SanctionsPublication> {
  const parsed = (await parseStringPromise(xml)) as Node;
  const root = parsed.sanctionsData as Node | undefined;
  if (!root) throw new Error(`publication ${id} is not an OFAC delta file`);
  const info = one(root, 'publicationInfo');
  const date = textOf(all(info, 'datePublished')[0]).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`publication ${id} has no date`);

  const added = emptyTally();
  const removed = emptyTally();
  let amended = 0;
  const programmes = new Map<string, { added: number; removed: number }>();
  const named: NamedChange[] = [];

  for (const entity of all(one(root, 'entities'), 'entity')) {
    const action = attr(entity, 'action');
    if (action !== 'add' && action !== 'remove') {
      amended += 1;
      continue;
    }
    const type = textOf(one(entity, 'generalInfo', 'entityType'));
    const tally = action === 'add' ? added : removed;
    tally[TALLY_KEY[type] ?? 'other'] += 1;
    const codes = all(one(entity, 'sanctionsPrograms'), 'sanctionsProgram').map(textOf).filter(Boolean);
    for (const code of codes) {
      const held = programmes.get(code) ?? { added: 0, removed: 0 };
      held[action === 'add' ? 'added' : 'removed'] += 1;
      programmes.set(code, held);
    }
    // People are counted above and never named (BF2).
    if (type === 'Entity' || type === 'Vessel' || type === 'Aircraft') {
      const countries = [...new Set(all(one(entity, 'addresses'), 'address').map((a) => textOf(all(a, 'country')[0])).filter(Boolean))];
      named.push({ action, type, name: primaryName(entity), countries, programmes: codes });
    }
  }

  return {
    id,
    date,
    kind: textOf(all(info, 'publicationType')[0]),
    added,
    removed,
    amended,
    programmes: [...programmes].map(([code, n]) => ({ code, ...n })).sort((a, b) => b.added + b.removed - a.added - a.removed || a.code.localeCompare(b.code)),
    named: named.sort((a, b) => a.action.localeCompare(b.action) || a.name.localeCompare(b.name)),
  };
}
