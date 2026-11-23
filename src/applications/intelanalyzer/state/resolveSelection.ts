/**
 * A saved selection, `{ id, type }`, found again in the workspace.
 *
 * A board saves what was selected as an id and a type, and opening the board
 * restored it as `{ id, type, data: null }`. The Inspector then read the
 * event's time from null and the whole Analyzer was replaced by its error
 * screen, and this happened on saving a board too, since saving opens it
 * (found running the app, 2026-10-02; plan block F, item 5). The deep link
 * already looked its selection up; now both do, the same way. What is no
 * longer in the workspace is no selection at all.
 */
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import type { IntelItemUI } from '../../../types/intel/IntelItemUI';
import { adaptWorkspaceToEvents } from '../adapters/eventsAdapter';
import type { SelectionItem } from './SelectionContext';

export function resolveSelection(
  id: string,
  reports: readonly IntelReportUI[],
  intelItems: readonly IntelItemUI[],
): SelectionItem | null {
  const event = adaptWorkspaceToEvents([...reports], [...intelItems]).find((e) => e.id === id);
  if (event) return { id: event.id, type: 'event', data: event } as SelectionItem;
  const report = reports.find((r) => r.id === id);
  if (report) return { id: report.id, type: 'report', data: report } as SelectionItem;
  const intel = intelItems.find((i) => i.id === id);
  if (intel) return { id: intel.id, type: 'intelItem', data: intel } as SelectionItem;
  return null;
}
