/**
 * Field work for NavCom, set in the Missions app (D-MX, MX13): a switch on
 * the mission. On, the mission needs a region and an end before it can be
 * marked ready, and its card says where it is.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MissionsPanel } from '../MissionsPanel';
import { missionService } from '../../../../services/intel/MissionService';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import { MissionStatus } from '../../../../types/intel/MissionUI';

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: () => ({ accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] }),
}));

// The missions rest on a report held here, as the evidence gate requires.
beforeAll(async () => {
  await intelReportService.importReport({
    id: 'report-fixture-1', title: 'Fixture report', content: 'Two of the five sites look closed.',
    author: 'analyst-1', category: 'general', tags: [], createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT',
  } as IntelReportUI, { strategy: 'skip' });
});

async function planningMission(title: string) {
  const created = await missionService.createMission({
    title: `${title} ${Date.now()}`, briefing: 'Body', relatedReports: ['report-fixture-1'], visibility: 'public',
    // Field work names something to report (NavCom §4.3; D-MX MX28).
    objectives: ['Count the cooling centres open'],
  });
  return (await missionService.updateStatus(created.id, MissionStatus.PLANNING))!;
}

describe('MissionsPanel — field work for NavCom', () => {
  it('turns field work on for the mission, and will not mark it ready until it names a region and an end', async () => {
    const mission = await planningMission('Field');
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    await screen.findByTestId('mission-detail-dialog');

    fireEvent.click(screen.getByLabelText('Field work for NavCom'));
    await waitFor(async () => expect((await missionService.getMission(mission.id))!.fieldWork).toEqual({}));
    expect((await screen.findByTestId(`blocked-${MissionStatus.READY_FOR_PACKAGE}`)).textContent).toMatch(/needs a region/);
    // Public, so nothing says it would not reach NavCom.
    expect(screen.queryByTestId('mission-profile-unreached')).toBeNull();
  });

  it("says field work on a mission that is not Public never reaches NavCom's map", async () => {
    const mission = await planningMission('Limited');
    await missionService.saveMission({ ...mission, visibility: 'limited', fieldWork: {} });
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    expect((await screen.findByTestId('mission-profile-unreached')).textContent).toMatch(/goes no further than your team/);
  });

  it('locks who takes it and its field work with the package, and says how to change them', async () => {
    const mission = await planningMission('Locked');
    await missionService.saveMission({ ...mission, fieldWork: { jurisdiction: 'us-ca', until: '2099-01-31T23:59:59.000Z' } });
    await missionService.updateStatus(mission.id, MissionStatus.READY_FOR_PACKAGE);
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    await screen.findByTestId('mission-detail-dialog');
    expect((screen.getByLabelText('Field work for NavCom') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('mission-profile-problem').textContent).toBe('Its package is locked, so move it back to Planning to change them.');
  });

  it('says on the card which missions are field work, and where', async () => {
    const mission = await planningMission('Carded');
    await missionService.saveMission({ ...mission, fieldWork: { jurisdiction: 'us-ca', until: '2099-01-31T23:59:59.000Z' } });
    render(<MissionsPanel teamMembers={[]} />);
    expect((await screen.findByTestId(`mission-card-fieldwork-${mission.id}`)).textContent).toBe('Field work · us-ca');
  });
});

// Keeps the JSX runtime import used under the project's lint rules.
void React;
