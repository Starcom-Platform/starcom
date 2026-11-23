/**
 * How serious a report is, on the scale Cases use (plan item 1.9, story S7).
 *
 * Reports had ROUTINE, PRIORITY and IMMEDIATE; the globe had critical, high,
 * medium and low, read from tags; Cases had LOW, MEDIUM, HIGH and CRITICAL.
 * Three vocabularies on screen for one idea. Reports now use the Cases' scale,
 * and a report nobody assessed has no value, which is "not assessed", never
 * a quiet LOW.
 *
 * It is the author's word about what they saw. It adds no weight to a claim:
 * weight comes from disclosed method (see the note on IntelReportUI).
 */
import type { IntelReportPriority } from '../../types/intel/IntelReportUI';

export const REPORT_PRIORITIES: readonly IntelReportPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** The words reports used before, as they read on the one scale. */
const OLD_WORDS: Record<string, IntelReportPriority> = {
  ROUTINE: 'LOW', PRIORITY: 'HIGH', IMMEDIATE: 'CRITICAL',
};

/** Any stored or imported value, onto the scale; undefined when it says nothing. */
export function normalizeReportPriority(raw: unknown): IntelReportPriority | undefined {
  if (typeof raw !== 'string') return undefined;
  const word = raw.trim().toUpperCase();
  if ((REPORT_PRIORITIES as readonly string[]).includes(word)) return word as IntelReportPriority;
  return OLD_WORDS[word];
}
