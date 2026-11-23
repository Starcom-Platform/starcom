/**
 * Psi Watch's lists (decision D-PW, build step 9, PW88–PW90): the daily notes, every one read, newest first, a week
 * at a time; and Intel in a window, every Intel Report whose own time falls inside the open sky event's or window's
 * span, nearest its exact moment first. A report's time is its event, or when it was written where it states none
 * (D-E, recordTime.ts), and it falls in the window by overlap, as the timeline's marks do. Nothing is scored, ranked
 * against chance or counted against anything.
 */
import { overlapsWindow, reportTime, type RecordTime } from '../../intel/recordTime';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { readBrief, readField, readScryResult, readSkyEvent, type PsiBrief, type PsiNote } from '../psiEvents';

export interface BriefRead extends PsiBrief {
  /** When it was published, unix seconds: its `published_at`, else when it was signed. */
  publishedS: number;
}

export interface BriefWeek {
  /** The week's Monday, `YYYY-MM-DD` (UTC). */
  monday: string;
  notes: BriefRead[];
}

const publishedOf = (note: PsiNote): number => {
  const tag = note.tags.find((t) => t[0] === 'published_at')?.[1];
  const n = tag !== undefined ? Number(tag) : NaN;
  return Number.isFinite(n) ? n : note.created_at;
};

/** The Monday (UTC) of the week a moment falls in, `YYYY-MM-DD`. */
export function mondayOf(s: number): string {
  const d = new Date(s * 1000);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}

/** Every daily note, the newest first, in weeks, the newest week first; one note an address, its newest. */
export function briefWeeks(notes: readonly PsiNote[]): BriefWeek[] {
  const newest = new Map<string, BriefRead>();
  for (const note of notes) {
    const read = { ...readBrief(note), publishedS: publishedOf(note) };
    const held = newest.get(read.address);
    if (!held || read.publishedS > held.publishedS) newest.set(read.address, read);
  }
  const weeks = new Map<string, BriefRead[]>();
  for (const brief of [...newest.values()].sort((a, b) => b.publishedS - a.publishedS)) {
    const monday = mondayOf(brief.publishedS);
    weeks.set(monday, [...(weeks.get(monday) ?? []), brief]);
  }
  return [...weeks].map(([monday, list]) => ({ monday, notes: list }));
}

export interface IntelInWindow {
  report: IntelReportUI;
  time: RecordTime;
  /** From the window's exact moment to the report's time, ms: below 0 before it. */
  fromExactMs: number;
}

/** The Intel Reports whose own time falls inside a window (unix seconds), nearest its exact moment first. */
export function intelInWindow(reports: readonly IntelReportUI[], window: { from: number; until: number; exact: number }): IntelInWindow[] {
  const span = { start: window.from * 1000, end: window.until * 1000 };
  const seen = new Set<string>();
  const found: IntelInWindow[] = [];
  for (const report of reports) {
    if (seen.has(report.id)) continue;
    seen.add(report.id);
    const time = reportTime(report);
    if (!time || !overlapsWindow(time, span)) continue;
    found.push({ report, time, fromExactMs: time.start - window.exact * 1000 });
  }
  return found.sort((a, b) => Math.abs(a.fromExactMs) - Math.abs(b.fromExactMs) || a.report.id.localeCompare(b.report.id));
}

/** What a daily note names (kit 2.3): its sky events, its field readings, any new result; each opened as its kind is. */
export interface PointedItem {
  kind: 'sky' | 'field' | 'result' | 'other';
  address: string;
  title: string;
  /** Whether Psi Watch holds it, so it can be opened. */
  held: boolean;
}

const addressOfNote = (note: PsiNote) => `${note.kind}:${note.pubkey}:${note.tags.find((t) => t[0] === 'd')?.[1] ?? ''}`;

/** Each address a note names, as the item it is, in the note's own order. */
export function pointedItems(points: readonly string[], held: ReadonlyArray<{ family: string; event: PsiNote }>): PointedItem[] {
  const byAddress = new Map(held.map((f) => [addressOfNote(f.event), f]));
  return points.map((address): PointedItem => {
    const f = byAddress.get(address);
    const d = address.split(':').slice(2).join(':');
    if (f?.family === 'psi_sky_event') return { kind: 'sky', address, title: readSkyEvent(f.event)?.title || d, held: true };
    if (f?.family === 'psi_field') return { kind: 'field', address, title: readField(f.event).title || d, held: true };
    if (f?.family === 'psi_scry_result') return { kind: 'result', address, title: readScryResult(f.event).title || d, held: true };
    const kind = d.startsWith('psi-sky-') ? 'sky' : d.startsWith('psi-field-') ? 'field' : d.startsWith('psi-scry-') ? 'result' : 'other';
    return { kind, address, title: d, held: false };
  });
}

