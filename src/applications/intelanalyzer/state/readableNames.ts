/**
 * Names for what the engine matches by id (plan item 3.6).
 *
 * The engine keys a company by its LEI and a place by its Wikidata id, because
 * identity a third party assigned beats identity guessed from a spelling. A
 * person reads neither: the walk of 2026-09-26 found single-source claims
 * listed as `headquartersCity: Q169376` under a bare LEI.
 *
 * The names come from the same records: GLEIF's legal name, Wikidata's label
 * for the place, the source a statement cites. They are for reading only and
 * never reach a comparison. The id stays one hover away.
 *
 * Where no record gives a name, the id is said as what it is ("LEI …"), not
 * dressed up as a name it does not have.
 */
import type { Event } from '../adapters/eventsAdapter';
import { normalizeEntityName } from '../../../services/intel/entity/normalizeEntityName';
import { identifierKind, isIdentifier } from '../../../services/intel/entity/identifiers';

export interface ReadableNames {
  /** The subject as a person reads it: its name where a record gives one. */
  subject(ref: string): string;
  /** A claim's value as a person reads it: a place's name, a country's name. */
  value(attribute: string, value: string): string;
  /** A source as a person reads it: its own label. */
  feed(id: string): string;
}

/** `headquartersCity` as "headquarters city". */
export function attributeWords(attribute: string): string {
  return attribute
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim();
}

/** An id said as what it is, where its shape says; otherwise the id itself. */
function idWords(id: string): string {
  const kind = identifierKind(id);
  if (kind === 'lei') return `LEI ${id.trim()}`;
  if (kind === 'wikidata') return `Wikidata ${id.trim()}`;
  return id;
}

/** A label written in capitals only, as registries often write names. */
const allCapitals = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase();

/** Keeps the first label seen, unless a later one is in mixed case and the first is not. */
function keep(map: Map<string, string>, key: string, label: string | undefined): void {
  const text = label?.trim();
  if (!text || isIdentifier(text)) return;
  const held = map.get(key);
  if (held === undefined || (allCapitals(held) && !allCapitals(text))) map.set(key, text);
}

let regions: Intl.DisplayNames | null | undefined;
/** A country's name for its ISO 3166-1 alpha-2 code, or undefined. */
export function countryName(code: string): string | undefined {
  if (!/^[A-Z]{2}$/.test(code)) return undefined;
  if (regions === undefined) {
    try { regions = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { regions = null; }
  }
  const name = regions?.of(code);
  return name && name !== code && name !== 'Unknown Region' ? name : undefined;
}

const WIKIDATA_ITEM = /^Q[1-9]\d*$/;

export function buildReadableNames(
  events: readonly Event[],
  sources: ReadonlyArray<{ id: string; label: string }>,
): ReadableNames {
  const subjects = new Map<string, string>();
  const values = new Map<string, string>();
  const feeds = new Map<string, string>();

  for (const ev of events) {
    if (ev.subjectName) for (const ref of ev.entityRefs ?? []) keep(subjects, normalizeEntityName(ref), ev.subjectName);
    if (ev.claim && ev.valueLabel) {
      // A place id names one place whichever attribute holds it, so GLEIF's
      // registered city and Wikidata's headquarters share its label. Any
      // other value is named only under the attribute it came with.
      const key = WIKIDATA_ITEM.test(ev.claim.value) ? ev.claim.value : `${ev.claim.attribute}\u0000${ev.claim.value}`;
      keep(values, key, ev.valueLabel);
    }
    if (ev.feedId && ev.feedLabel) keep(feeds, ev.feedId, ev.feedLabel);
  }
  // A registered source's own label wins over what a relaying statement calls it.
  for (const source of sources) if (source.label?.trim()) feeds.set(source.id, source.label.trim());

  return {
    subject: (ref) => subjects.get(normalizeEntityName(ref)) ?? idWords(ref),
    value: (attribute, value) =>
      values.get(WIKIDATA_ITEM.test(value) ? value : `${attribute}\u0000${value}`)
      ?? (/country$/i.test(attribute) ? countryName(value) : undefined)
      ?? idWords(value),
    feed: (id) => feeds.get(id) ?? (id.startsWith('wikidata-cites:') ? 'a source Wikidata cites' : id),
  };
}
