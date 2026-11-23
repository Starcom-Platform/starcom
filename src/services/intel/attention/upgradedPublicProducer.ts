/**
 * Records an upgrade may have made Public (plan item 9.6, decision G3).
 *
 * The one-time migration of 9 Sep 2026, from tiers to distribution, filled a
 * missing distribution with Public unless the record carried a protected tier.
 * That broke 0.4 and 0.5's rule that undecided goes nowhere. It leaves them
 * undecided now, but what it already changed cannot be told apart from a
 * Public somebody chose, so every Public record made before that day is
 * listed once, to keep or change.
 */
import type { AttentionItem } from './AttentionItem';
import type { IntelCaseUI } from '../../../types/intel/IntelCaseUI';
import type { MissionUI } from '../../../types/intel/MissionUI';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { missionPackageLocked } from '../MissionService';
import { formatUtcDateTime } from '../../../utils/utcTime';

export const UPGRADED_PUBLIC_PRODUCER = 'upgraded-public';

/** The day the migration shipped (commit 9696e161). */
const MIGRATED_ON_MS = Date.UTC(2026, 8, 9);

/** When a record was made, if that was before the upgrade. */
function madeBeforeUpgrade(value: string | Date | undefined): number | null {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value ?? '');
  return Number.isFinite(ms) && ms < MIGRATED_ON_MS ? ms : null;
}

/** A report someone else wrote came from where it was published; only one made here is listed. */
const madeHere = (report: Pick<IntelReportUI, 'history'>): boolean =>
  !(report.history ?? []).some((entry) => entry?.action === 'IMPORTED');

export function produceUpgradedPublicItems(input: {
  cases: IntelCaseUI[];
  missions: MissionUI[];
  reports: IntelReportUI[];
}): AttentionItem[] {
  const raisedAt = new Date(MIGRATED_ON_MS).toISOString();
  const item = (
    kind: 'case' | 'mission' | 'report',
    record: { id: string; title: string },
    madeMs: number,
    locked: boolean,
  ): AttentionItem => ({
    // The record alone: one concern however often the queue recomputes.
    id: `upgraded-public:${kind}:${record.id}`,
    subject: record.title || `Untitled ${kind}`,
    subjectKind: 'unknown',
    evidenceProvenance: 'unknown',
    reason: 'made-public-by-upgrade',
    producedBy: UPGRADED_PUBLIC_PRODUCER,
    caseId: kind === 'case' ? record.id : '',
    ...(kind === 'mission' ? { missionId: record.id } : {}),
    distributionOf: { kind, id: record.id, locked },
    firstSeen: raisedAt,
    lastSeen: raisedAt,
    severity: 0.6,
    state: 'new',
    explanation: `This ${kind}, made ${formatUtcDateTime(madeMs, { year: true })}, is Public: anyone may read it once it is published. `
      + 'An upgrade on 9 Sep 2026 made records with no distribution Public, so it may never have been chosen.'
      + (locked ? ' Its package is locked, so move it back to Planning to change it.' : ''),
  });

  const items: AttentionItem[] = [];
  for (const record of input.cases ?? []) {
    const made = madeBeforeUpgrade(record.createdAt);
    if (record.visibility === 'public' && made !== null) items.push(item('case', record, made, false));
  }
  for (const record of input.missions ?? []) {
    const made = madeBeforeUpgrade(record.createdAt);
    if (record.visibility === 'public' && made !== null) items.push(item('mission', record, made, missionPackageLocked(record)));
  }
  for (const record of input.reports ?? []) {
    const made = madeBeforeUpgrade(record.createdAt);
    if (record.visibility === 'public' && made !== null && madeHere(record)) items.push(item('report', record, made, false));
  }
  return items;
}
