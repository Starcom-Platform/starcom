/**
 * A story never names or places people (decision D-RS, RS11; the owner's RS51, 2026-10-18). Before a story is
 * posted, the publish review looks for what names a person (a key, a handle, an email address, a phone number) and
 * what places one (map coordinates, a street address), and refuses it, saying which line. People's names cannot be
 * told from the names of towns, venues or artists, so those stay with the author, as the editor's reminder says.
 */
import type { RosterItem } from './rosterItem';

export type StoryProblemKind = 'secret key' | 'key' | 'email' | 'handle' | 'phone' | 'coordinates' | 'street address';

export interface StoryProblem {
  field: 'title' | 'purpose' | 'limit' | 'text';
  /** The line it is on, from 1; for a limit, which limit. */
  line: number;
  what: StoryProblemKind;
  /** A little of what was found, to find it by. */
  found: string;
  said: string;
}

const NAMES = 'A story never names people';
const PLACES = 'A story never places people';
const SAID: Record<StoryProblemKind, string> = {
  'secret key': 'Never post a secret key: take it out.',
  key: `${NAMES}: take out the key.`,
  email: `${NAMES}: take out the email address.`,
  handle: `${NAMES}: take out the handle.`,
  phone: `${NAMES}: take out the phone number.`,
  coordinates: `${PLACES}: say the town or the state, not a point.`,
  'street address': `${PLACES}: say the town or the state, not a street address.`,
};

const BECH32 = '[02-9ac-hj-np-z]';
const STREET_WORDS = 'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Place|Pl|Terrace|Highway|Hwy|Parkway|Pkwy|Square|Sq|Crescent|Close';

/** What each kind looks like, in the order a line is searched: a secret key before a key, an email before a handle. */
const FINDERS: Array<{ what: StoryProblemKind; find: (line: string) => string[] }> = [
  { what: 'secret key', find: (l) => l.match(new RegExp(`\\bnsec1${BECH32}{20,}`, 'gi')) ?? [] },
  {
    what: 'key',
    find: (l) => [
      ...(l.match(new RegExp(`\\b(?:npub1|nprofile1)${BECH32}{20,}`, 'gi')) ?? []),
      ...(l.match(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/gi) ?? []),
    ],
  },
  { what: 'email', find: (l) => l.match(/[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi) ?? [] },
  // Not part of an email address, nor of a link's path, such as a map's /@44.98,-93.27.
  { what: 'handle', find: (l) => (l.match(/(?<![\w@./])@[A-Za-z_][\w]{1,29}(?![\w@.]*\.[a-z]{2,})/g) ?? []) },
  {
    what: 'phone',
    // Ten to fifteen digits in groups; a date or a time is never one.
    find: (l) => (l.match(/\+?\(?\d[\d\s().-]{8,}\d/g) ?? []).filter((m) => {
      const digits = m.replace(/\D/g, '').length;
      return digits >= 10 && digits <= 15 && !/\d{4}-\d{2}-\d{2}/.test(m);
    }),
  },
  {
    what: 'coordinates',
    find: (l) => [
      ...[...l.matchAll(/(?<![\d.])(-?\d{1,2}\.\d{2,})\s*°?\s*[NS]?\s*[,;/ ]\s*(-?\d{1,3}\.\d{2,})/g)]
        .filter((m) => Math.abs(Number(m[1])) <= 90 && Math.abs(Number(m[2])) <= 180)
        .map((m) => m[0]),
      ...(l.match(/\d{1,3}°\s*\d{1,2}['′](?:\s*\d{1,2}(?:\.\d+)?["″])?\s*[NSEW]/g) ?? []),
    ],
  },
  {
    what: 'street address',
    find: (l) => [
      ...(l.match(new RegExp(`\\b\\d{1,5}[A-Za-z]?\\s+(?:[A-Z][\\w'’.-]*\\s+){0,4}(?:${STREET_WORDS})\\b`, 'g')) ?? []),
      ...(l.match(/\b(?:Rue|Calle|Avenida|Rua|Via|Viale|Corso|Carrer|Ulica)\s+[\p{L}' .-]{2,40}?,?\s*\d{1,5}\b/gu) ?? []),
      ...(l.match(/[\p{L}-]+(?:straße|strasse|gasse|platz|allee|weg)\s+\d{1,5}[a-z]?\b/giu) ?? []),
    ],
  },
];

const excerpt = (text: string) => (text.length > 20 ? `${text.slice(0, 20)}…` : text);

function problemsIn(field: StoryProblem['field'], text: string, numberOf: (lineIndex: number) => number): StoryProblem[] {
  return text.split('\n').flatMap((line, i) => FINDERS.flatMap(({ what, find }) => {
    const [first] = find(line);
    return first ? [{ field, line: numberOf(i), what, found: excerpt(first.trim()), said: SAID[what] }] : [];
  }));
}

/** What in a story names or places a person, field by field and line by line. */
export function storyProblems(item: Pick<RosterItem, 'title' | 'purpose' | 'limits' | 'text'>): StoryProblem[] {
  return [
    ...problemsIn('title', item.title, () => 1),
    ...problemsIn('purpose', item.purpose ?? '', (i) => i + 1),
    ...item.limits.flatMap((limit, n) => problemsIn('limit', limit, () => n + 1)),
    ...problemsIn('text', item.text, (i) => i + 1),
  ];
}

const WHERE: Record<StoryProblem['field'], (line: number) => string> = {
  title: () => 'Its title',
  purpose: (n) => `Line ${n} of its purpose`,
  limit: (n) => `Its limit ${n}`,
  text: (n) => `Line ${n} of its text`,
};

/** The problems as the review says them, one a line. */
export function storyProblemsText(problems: readonly StoryProblem[]): string {
  return problems.map((p) => `${WHERE[p.field](p.line)}: “${p.found}”. ${p.said}`).join('\n');
}

/** What a held-back line held, in a reader's words. */
const HELD: Record<StoryProblemKind, string> = {
  'secret key': 'a secret key',
  key: 'a key',
  email: 'an email address',
  handle: 'a handle',
  phone: 'a phone number',
  coordinates: 'coordinates',
  'street address': 'a street address',
};

/** The words a line is replaced by: what it held, each once. */
const heldLine = (whats: readonly StoryProblemKind[]) => `[held back: ${[...new Set(whats)].map((w) => HELD[w]).join(', ')}]`;

/**
 * A story as a reader sees it (the owner's RS58, 2026-10-23): another app may post one carrying what Starcom refuses
 * when a story is posted from here (RS51). Each line that fails the check is replaced by what was held back, and the
 * author's other words stand. `heldBack` lists them, where each was, so the screen can say so.
 */
export function holdBackStory<T extends Pick<RosterItem, 'title' | 'purpose' | 'limits' | 'text'>>(item: T): T & { heldBack?: string[] } {
  const problems = storyProblems(item);
  if (problems.length === 0) return item;
  const at = (field: StoryProblem['field'], line: number) => problems.filter((p) => p.field === field && p.line === line).map((p) => p.what);
  const lines = (field: 'purpose' | 'text', text: string) => text.split('\n').map((l, i) => {
    const whats = at(field, i + 1);
    return whats.length ? heldLine(whats) : l;
  }).join('\n');
  const title = at('title', 1);
  return {
    ...item,
    title: title.length ? heldLine(title) : item.title,
    ...(item.purpose !== undefined ? { purpose: lines('purpose', item.purpose) } : {}),
    limits: item.limits.map((limit, n) => {
      const whats = at('limit', n + 1);
      return whats.length ? heldLine(whats) : limit;
    }),
    text: lines('text', item.text),
    heldBack: [...new Set(problems.map((p) => `${WHERE[p.field](p.line)}: ${HELD[p.what]}`))],
  };
}

