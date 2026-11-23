/**
 * Names as published (decision D-NP, docs/missions/01-architecture-decisions/names-as-published.md): a note that names
 * a person, as a cited source names them, carries `["t","names_people"]` from its publisher, from the first, and a
 * note that names no one never does.
 *
 * What Starcom does with one (the operator, 13 October):
 * - NP1: shows it, labelled "names a person, as <source> names them" (NamesPeopleLabel), wherever it is read;
 * - NP2: leaves it out of every card and clip;
 * - NP5: refuses a mission whose text carries its words.
 *
 * The tag is read from the note's own `t` tags alone. The intel intake also takes `#words` from a note's text as
 * hashtags, and a note that only writes "#names_people" in its text neither names anyone for it nor is left out.
 */

export const NAMES_PEOPLE_TAG = 'names_people';

type Tags = ReadonlyArray<ReadonlyArray<unknown>> | undefined | null;

/** Whether a note's own tags say it names a person. */
export function tagsNamePeople(tags: Tags): boolean {
  return Array.isArray(tags) && tags.some((tag) => Array.isArray(tag) && tag[0] === 't'
    && typeof tag[1] === 'string' && tag[1].trim().toLowerCase() === NAMES_PEOPLE_TAG);
}

/*
 * ─── THE WORDS OF TAGGED NOTES (NP5) ────────────────────────────────────────
 *
 * A mission names no one; NP5 asserts it. Each reader that meets a tagged note tells this register its title and
 * text, and a mission is checked against them: a title of four words or more, or a sentence of six or more, found
 * whole in a mission's text is a tagged note's words. Shorter passages are left out, since "Fighting in Kharkiv"
 * or a two-word name alone would refuse missions that quote nobody.
 *
 * A retracted note's words stay: a mission that carries them still names the person.
 */
const MIN_TITLE_WORDS = 4;
const MIN_SENTENCE_WORDS = 6;
/** Notes remembered at most; the oldest go first. A desk posts tens a day, so this is weeks of them. */
const MAX_NOTES = 2000;

const named = new Map<string, string[]>();
/** Each tagged note's title, normalized, whatever its length: what a mark's hover would quote. */
const titles = new Map<string, string>();
/** A title this short could be a place's name alone; it is not looked for in a mark's words. */
const MIN_MARK_TITLE_WORDS = 2;

/** Lower case, letters and digits only, one space between words: so punctuation and case do not hide a quote. */
function normalizedWords(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const wordCount = (normalized: string) => (normalized ? normalized.split(' ').length : 0);

/** Remember a tagged note's title and text, by its id, for the mission checks. */
export function rememberNamedNote(id: string, title?: string | null, text?: string | null): void {
  const passages = new Set<string>();
  const heading = normalizedWords(title ?? '');
  if (wordCount(heading) >= MIN_TITLE_WORDS) passages.add(heading);
  for (const sentence of (text ?? '').split(/[.!?\n]+/)) {
    const words = normalizedWords(sentence);
    if (wordCount(words) >= MIN_SENTENCE_WORDS) passages.add(words);
  }
  named.delete(id);
  named.set(id, [...passages]);
  titles.delete(id);
  if (wordCount(heading) >= MIN_MARK_TITLE_WORDS) titles.set(id, heading);
  while (named.size > MAX_NOTES) {
    const oldest = named.keys().next().value as string;
    named.delete(oldest);
    titles.delete(oldest);
  }
}

/**
 * Whether a mark's words quote a tagged note's title (NP2): what the share handle's description of a view leaves
 * out. A mark's hover can join several notes' titles; one naming a person is enough to leave the whole of it out.
 */
export function mentionsNamedTitle(words: string): boolean {
  if (titles.size === 0) return false;
  const haystack = ` ${normalizedWords(words)} `;
  for (const title of titles.values()) if (haystack.includes(` ${title} `)) return true;
  return false;
}

/** Every remembered passage of a tagged note, normalized. */
function namedNotePassages(): string[] {
  return [...named.values()].flat();
}

/** The first tagged note's passage a text carries, or null (NP5). */
export function carriesNamedWords(text: string, passages: readonly string[] = namedNotePassages()): string | null {
  if (passages.length === 0) return null;
  const haystack = ` ${normalizedWords(text)} `;
  for (const passage of passages) if (haystack.includes(` ${passage} `)) return passage;
  return null;
}

/** What a card or clip may print (NP2): every item but those that name a person. */
export function capturable<T extends { namesPeople?: boolean }>(items: readonly T[]): T[] {
  return items.filter((item) => !item.namesPeople);
}
