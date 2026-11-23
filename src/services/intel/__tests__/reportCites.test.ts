/**
 * A report keeps what it rests on (decision D-MX, MX19): the observation it
 * cites, by event id and a relay that held it, from the form through storage
 * and any later edit, so the citation can go out when it is published.
 *
 * Each layer between the form and storage names its fields one by one. A field
 * one of them leaves out is gone at the next save, without a word.
 */
import { describe, it, expect } from 'vitest';
import { intelReportService } from '../IntelReportService';
import { uiToWorkspaceReportData, workspaceFileToUI } from '../adapters/reportMappers';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const OBSERVATION = '1'.repeat(64);
const RELAY = 'wss://relay.example';

const ui = (over: Partial<IntelReportUI>): IntelReportUI => ({
  id: 'c1', title: 'T', content: 'C', author: 'a', category: 'GENERAL', tags: [],
  createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT', ...over,
});
const fileOf = (data: ReturnType<typeof uiToWorkspaceReportData>) =>
  ({ path: '', filename: 'c1.intelReport', extension: '.intelReport', reportData: data, size: 0, createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '' }) as never;

describe("a report's citations", () => {
  it('are kept when the report is made, and after it is edited', async () => {
    const made = await intelReportService.createReport({
      title: 'Seen at the anchor', content: 'What was there', category: 'GENERAL', tags: [],
      latitude: 38.6, longitude: -90.2, cites: [{ eventId: OBSERVATION, relay: RELAY }],
    }, 'Tester');
    expect((await intelReportService.getReport(made.id))?.cites).toEqual([{ eventId: OBSERVATION, relay: RELAY }]);
    await intelReportService.saveReport({ ...made, content: 'What was there, and what was not' });
    expect((await intelReportService.getReport(made.id))?.cites).toEqual([{ eventId: OBSERVATION, relay: RELAY }]);
  });

  it('are absent from a report that cites nothing, rather than an empty list', async () => {
    const made = await intelReportService.createReport({ title: 'Nothing cited', content: 'C', category: 'GENERAL', tags: [], cites: [] }, 'Tester');
    expect((await intelReportService.getReport(made.id))?.cites).toBeUndefined();
  });

  it('read back from storage, keep only what is a citation: a relay that is not one is dropped, the id kept', () => {
    const data = uiToWorkspaceReportData(ui({}));
    (data.metadata as Record<string, unknown>).cites = [
      { eventId: OBSERVATION, relay: RELAY },
      { eventId: '2'.repeat(64), relay: 'https://not-a-relay.example' },
      { eventId: 'not an event id' },
      'a string',
      null,
    ];
    expect(workspaceFileToUI(fileOf(data)).cites).toEqual([{ eventId: OBSERVATION, relay: RELAY }, { eventId: '2'.repeat(64) }]);
  });

  it('read back as nothing when what is stored is not a list', () => {
    const data = uiToWorkspaceReportData(ui({}));
    (data.metadata as Record<string, unknown>).cites = { eventId: OBSERVATION };
    expect(workspaceFileToUI(fileOf(data)).cites).toBeUndefined();
  });
});
