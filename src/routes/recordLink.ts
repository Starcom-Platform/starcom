/**
 * One address for a record, used both as a URL and as in-app navigation.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * No route resolved to a specific case, report or mission. `/cases-dashboard`
 * opened the list; `/investigations/:investigationId` redirected to that same
 * list. So nobody could send a colleague a link to the thing they were
 * discussing — for a tool built to coordinate a team, more limiting than any
 * missing button.
 *
 * ─── WHY IT IS ALSO THE IN-APP MECHANISM ───────────────────────────────────
 *
 * Cross-app handoffs already passed context keys through navigateToApp:
 * `openCaseAbout`, `missionFromCase`, `initialTab`. Adding URLs beside them
 * would make two parallel systems for one idea, and they would drift — a link
 * that opens a different thing than the button does is worse than no link.
 *
 * So the mapping from (kind, id) to (application, context) lives here once, and
 * both the URL resolver and any "copy a link to this" affordance read it.
 */
import type { ApplicationId, ApplicationContext } from '../components/Router/EnhancedApplicationRouter';

/**
 * What can be addressed.
 *
 * Findings are deliberately absent: they are DERIVED from correlation over the
 * current working set and carry no stable id, so a link to one would resolve to
 * something different — or to nothing — the moment the corpus changed. An
 * address that silently means something else later is worse than no address.
 */
export type RecordKind = 'case' | 'report' | 'mission';

export const RECORD_KINDS: readonly RecordKind[] = ['case', 'report', 'mission'];

export function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === 'string' && (RECORD_KINDS as readonly string[]).includes(value);
}

/**
 * The path that opens a record. Stable, and the only place its shape is
 * written. A case has a page of its own (plan item 1.2), so its address is the
 * page's; `/r/case/<id>`, the address it had before, still leads there.
 */
export function recordPath(kind: RecordKind, id: string): string {
  if (kind === 'case') return `/app/cases/${encodeURIComponent(id)}`;
  return `/r/${kind}/${encodeURIComponent(id)}`;
}

/**
 * Where a record lives, and what the destination needs to know to select it.
 *
 * The `select*` keys mirror the `open*` keys the handoffs already use, and are
 * read by the same components — a link arriving from outside and a button
 * pressed inside end up in the same state by the same route.
 */
export function recordTarget(kind: RecordKind, id: string): { app: ApplicationId; context: ApplicationContext } {
  switch (kind) {
    case 'case':
      return { app: 'cases', context: { selectCaseId: id } };
    case 'report':
      // reportId, not selectReportId: it is the key IntelDashboard reads, and
      // the one every in-app handoff to it already sends (the globe's report
      // popup, AnalysisWorkbench). The app receives this context as its props,
      // so a link sending selectReportId opened the dashboard without the report.
      return { app: 'inteldashboard', context: { reportId: id } };
    case 'mission':
      // The tab matters as much as the app: teamworkspace opens on Overview,
      // and a link to a mission that lands on Overview has not opened it.
      return { app: 'teamworkspace', context: { initialTab: 'missions', selectMissionId: id } };
  }
}
