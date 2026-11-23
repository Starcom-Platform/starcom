/**
 * Change the distribution of a record an upgrade may have made Public, from the
 * attention queue (plan item 9.6, decision G3), or choose one for a mission
 * nobody had decided on, before it is sent or exported (plan item 9.13).
 *
 * Resolves only once the stored record holds the new distribution, and throws a
 * plain reason otherwise. The queue retires the item on success, so a change
 * that did not save must never look like one that did: the record would still
 * be Public while the queue showed it handled. A report save that changed only
 * its distribution used to return without storing anything, which is how this
 * came to read the record back.
 */
import type { InformationVisibility } from '../../../types/intel/IntelItemUI';
import type { AttentionItem } from './AttentionItem';
import { intelCaseService } from '../IntelCaseService';
import { missionService } from '../MissionService';
import { intelReportService } from '../IntelReportService';

export async function setRecordDistribution(
  target: Pick<NonNullable<AttentionItem['distributionOf']>, 'kind' | 'id'>,
  visibility: InformationVisibility,
): Promise<void> {
  const gone = new Error(`the ${target.kind} is no longer here`);
  let holds: InformationVisibility | undefined;
  if (target.kind === 'case') {
    const record = await intelCaseService.getCase(target.id);
    if (!record) throw gone;
    await intelCaseService.saveCase({ ...record, visibility });
    holds = (await intelCaseService.getCase(target.id))?.visibility;
  } else if (target.kind === 'mission') {
    const record = await missionService.getMission(target.id);
    if (!record) throw gone;
    await missionService.saveMission({ ...record, visibility });
    holds = (await missionService.getMission(target.id))?.visibility;
  } else {
    const record = await intelReportService.getReport(target.id);
    if (!record) throw gone;
    await intelReportService.saveReport({ ...record, visibility });
    holds = (await intelReportService.getReport(target.id))?.visibility;
  }
  if (holds !== visibility) throw new Error('the change did not save');
}
