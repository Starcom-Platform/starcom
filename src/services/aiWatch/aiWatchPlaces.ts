/**
 * Where AI Watch's notes are drawn, and how each is said (decision D-AW).
 *
 * - **AW3:** a note is drawn at the point it gives, else at its country (or subdivision) where that has an
 *   outline here, else it is listed in the panel. Never at its outlet's country: where a story is reported
 *   is not where it happened.
 * - **AW4:** its stance is said as a word and a shape, readable without colour: ▲ good, ▼ bad, ◆ ugly, as
 *   Mecha Jono reads each note's words; a note stating none says so.
 *
 * Pure, so the drawing and the panel say the same, and both are tested without a globe.
 */
import { formatUtcDate } from '../../utils/utcTime';
import { AI_WATCH_SECTIONS, type AiWatchItem, type AiWatchSection, type AiWatchStance } from './aiWatch';

export const SECTION_LABEL: Record<AiWatchSection, string> = {
  AiIncidents: 'Incidents',
  AiFrontier: 'Frontier AI',
  AiWar: 'AI in war',
  AiSafety: 'Safety & security',
};

const SHAPE: Record<AiWatchStance, string> = { good: '▲', bad: '▼', ugly: '◆' };

/** A stance's shape, or null where none is stated. */
export const stanceShape = (stance: AiWatchStance | undefined): string | null => (stance ? SHAPE[stance] : null);

/** A stance as its shape and word, as every mark and row says it. */
export const stanceWords = (stance: AiWatchStance | undefined): string => (stance ? `${SHAPE[stance]} ${stance}` : 'no stance stated');

/** The source as Mecha Jono's summary names it ("QbitAI (量子位): …"), else its id. */
export function sourceNameOf(item: Pick<AiWatchItem, 'summary' | 'source'>): string {
  const named = item.summary?.match(/^([^:]{2,60}):\s/)?.[1];
  return named ?? item.source ?? 'its source';
}

/** The notes in a section that is on, each once however many of its sections are on. */
export function drawnFor<T extends Pick<AiWatchItem, 'sections'>>(items: readonly T[], active: Readonly<Record<AiWatchSection, boolean>>): T[] {
  return items.filter((item) => item.sections.some((section) => active[section]));
}

/** A country's notes, drawn at its middle with a pill counting them. */
export interface AiWatchCountry<T = AiWatchItem> { code: string; notes: T[] }

export interface AiWatchPlaced<T = AiWatchItem> {
  /** Notes giving a point, each drawn there. */
  points: T[];
  /** Notes giving only a country or a subdivision that has an outline here. */
  countries: Array<AiWatchCountry<T>>;
  /** The rest: listed in the panel, never drawn. */
  unplaced: T[];
}

/** Where each note is drawn (AW3), by `outline`, which has an outline for a code or does not. */
export function aiWatchByPlace<T extends Pick<AiWatchItem, 'point' | 'jurisdiction'>>(items: readonly T[], outline: (code: string) => unknown): AiWatchPlaced<T> {
  const points: T[] = [];
  const byCode = new Map<string, T[]>();
  const unplaced: T[] = [];
  for (const item of items) {
    if (item.point) points.push(item);
    else if (item.jurisdiction && outline(item.jurisdiction)) byCode.set(item.jurisdiction, [...(byCode.get(item.jurisdiction) ?? []), item]);
    else unplaced.push(item);
  }
  const countries = [...byCode].map(([code, notes]) => ({ code, notes })).sort((a, b) => b.notes.length - a.notes.length || a.code.localeCompare(b.code));
  return { points, countries, unplaced };
}

/** Notes giving the same point, drawn as one mark: the hover names each. */
export function byPoint<T extends Pick<AiWatchItem, 'point'>>(points: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const note of points) {
    const key = `${note.point!.lat},${note.point!.lon}`;
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }
  return [...groups.values()];
}

/** The hover of notes sharing a point: how many, then each with its stance and source; one alone, its own. */
export function pointTooltip(notes: readonly AiWatchItem[]): string {
  if (notes.length === 1) return tooltipFor(notes[0]);
  return [`AI Watch · ${notes.length} notes at this point`, ...notes.map((note) => `${stanceWords(note.stance)} · ${note.title} (${sourceNameOf(note)})`)].join('\n');
}

/** A country's pill: its name and how many notes it holds. */
export const countryPill = (country: AiWatchCountry<unknown>, name: string): string =>
  `${name} · ${country.notes.length} AI note${country.notes.length === 1 ? '' : 's'}`;

/** A note's sections, in the rail's order, by name. */
export const sectionsInWords = (item: Pick<AiWatchItem, 'sections'>): string =>
  AI_WATCH_SECTIONS.filter((s) => item.sections.includes(s)).map((s) => SECTION_LABEL[s]).join(', ') || 'no section';

/** A note's hover: its sections and stance, its title, and who reported it when. */
export function tooltipFor(item: AiWatchItem): string {
  return [
    `AI Watch · ${sectionsInWords(item)} · ${stanceWords(item.stance)}`,
    item.title,
    `${sourceNameOf(item)}, ${formatUtcDate(item.publishedAt * 1000, { year: true })}`,
  ].join('\n');
}
