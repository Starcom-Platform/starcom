/**
 * Closing a mission in the Missions app (D-MX, MX12): a dispatched mission is
 * closed as completed or cancelled, which offers its closing for review; a
 * closed one says whether its package says so yet; deleting a published one
 * offers its closing first. The review itself is tested in
 * missions.review.test.ts, and stands in here.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MissionsPanel } from '../MissionsPanel';
import { missionService } from '../../../../services/intel/MissionService';
import { intelWorkspaceManager } from '../../../../services/intel/IntelWorkspaceManager';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import { MissionStatus, type MissionUI } from '../../../../types/intel/MissionUI';

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: () => ({ accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] }),
}));
// NavCom's labels on a published mission, through a stand-in.
const labelsFor = vi.hoisted(() => ({ claims: [] as Array<{ pubkey: string; at: number; agent?: string }>, answered: true }));
vi.mock('../../../../services/intel/useMissionLabels', () => ({
  useMissionLabels: (coordinates: string[]) => ({ claims: (c: string) => (coordinates.includes(c) ? labelsFor.claims : []), answered: labelsFor.answered }),
}));
// A dispatched mission is watched for replies; nothing here reaches a relay.
vi.mock('../../../../services/intel/usePackageReplies', () => ({
  usePackageReplies: () => ({ replies: [], missionByCoordinate: new Map(), counters: { seen: 0, accepted: 0, refused: 0 }, watching: 0, unwatchable: 0 }),
}));

const reviewMissionClosing = vi.fn(async (_id: string) => ({ status: 'cancelled' as const }));
vi.mock('../../../../services/publishing/missions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/publishing/missions')>()),
  reviewMissionClosing: (id: string) => reviewMissionClosing(id),
}));

beforeAll(async () => {
  await intelReportService.importReport({
    id: 'report-fixture-1', title: 'Fixture report', content: 'Two of the five sites look closed.',
    author: 'analyst-1', category: 'general', tags: [], createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT',
  } as IntelReportUI, { strategy: 'skip' });
});

beforeEach(() => {
  reviewMissionClosing.mockReset();
  reviewMissionClosing.mockImplementation(async () => ({ status: 'cancelled' as const }));
});

/** A mission as publishing leaves it: dispatched, with where it went. */
async function dispatchedRecord(title: string, extra: Partial<MissionUI> = {}) {
  const created = await missionService.createMission({
    title: `${title} ${Date.now()}`, briefing: 'Body', relatedReports: ['report-fixture-1'], visibility: 'public',
  });
  const record: MissionUI = {
    ...created,
    status: MissionStatus.DISPATCHED,
    publishedAs: `30079:${'a'.repeat(64)}:starcom_mission_package_${created.id}`,
    dispatchReceipt: { eventId: 'e1', relaysAccepted: 2, relaysTried: 5, at: '2026-10-06T12:00:00.000Z' },
    ...extra,
  };
  await intelWorkspaceManager.updateMission(record);
  return record;
}

describe('MissionsPanel — closing a mission (D-MX, MX12)', () => {
  it('closes a dispatched mission as completed, then offers its closing for review', async () => {
    const mission = await dispatchedRecord('Close me');
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    fireEvent.click(await screen.findByTestId('close-completed'));

    await waitFor(() => expect(reviewMissionClosing).toHaveBeenCalledWith(mission.id));
    const stored = (await missionService.getMission(mission.id))!;
    expect(stored.status).toBe(MissionStatus.CLOSED);
    expect(stored.closedAs).toBe('completed');

    // Declined: closed here, its package still says open, and the closing can be published later.
    const closed = await screen.findByTestId('mission-closed');
    expect(closed.getAttribute('data-closing')).toBe('unpublished');
    expect(closed.textContent).toMatch(/Closed as completed\. Its package, as published, still says open\./);
    fireEvent.click(screen.getByTestId('publish-closing'));
    await waitFor(() => expect(reviewMissionClosing).toHaveBeenCalledTimes(2));
  });

  it('closes as cancelled too', async () => {
    const mission = await dispatchedRecord('Called off');
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    fireEvent.click(await screen.findByTestId('close-cancelled'));
    await waitFor(async () => expect((await missionService.getMission(mission.id))!.closedAs).toBe('cancelled'));
  });

  it('says when its closing went out, and offers nothing more', async () => {
    const mission = await dispatchedRecord('Closed out', {
      status: MissionStatus.CLOSED, closedAs: 'cancelled',
      closingReceipt: { eventId: 'e2', relaysAccepted: 3, relaysTried: 5, at: '2026-10-06T13:00:00.000Z' },
    });
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    const closed = await screen.findByTestId('mission-closed');
    expect(closed.getAttribute('data-closing')).toBe('published');
    expect(closed.textContent).toMatch(/Closed as cancelled\. Its package says closed/);
    expect(screen.queryByTestId('publish-closing')).toBeNull();
    expect(screen.queryByTestId('close-completed')).toBeNull();
    // Its dispatch, named, so it is not read as the closing.
    expect(screen.getByTestId('dispatch-receipt').textContent).toMatch(/^Dispatched · Sent to 2 of 5 relays/);
  });

  it('says a closing no relay took, once; one that went out is said by the closed mission alone', async () => {
    const sent = (success: boolean) => async (id: string) => {
      const mission = (await missionService.getMission(id))!;
      const receipt = { eventId: 'e3', relaysAccepted: success ? 4 : 0, relaysTried: 5, at: '2026-10-06T14:00:00.000Z' };
      const recorded = success ? { ...mission, closingReceipt: receipt } : mission;
      await intelWorkspaceManager.updateMission(recorded);
      return { status: 'sent' as const, result: { mission: recorded, broadcast: { success, relaysOk: receipt.relaysAccepted, relaysTried: 5 } } };
    };
    reviewMissionClosing.mockImplementationOnce(sent(false) as never);
    const failed = await dispatchedRecord('No relay took it');
    const { unmount } = render(<MissionsPanel teamMembers={[]} selectMissionId={failed.id} />);
    fireEvent.click(await screen.findByTestId('close-completed'));
    expect(await screen.findByText('No relay took the closing, so its package still says open. Publish the closing to try again.')).toBeTruthy();
    unmount();

    reviewMissionClosing.mockImplementationOnce(sent(true) as never);
    const took = await dispatchedRecord('A relay took it');
    render(<MissionsPanel teamMembers={[]} selectMissionId={took.id} />);
    fireEvent.click(await screen.findByTestId('close-completed'));
    await waitFor(() => expect(screen.getByTestId('mission-closed').getAttribute('data-closing')).toBe('published'));
    expect(screen.queryByText(/now says closed/)).toBeNull();
    expect(screen.queryByText(/No relay took the closing/)).toBeNull();
  });

  it('offers the closing before deleting a published mission, and deletes it whatever the answer', async () => {
    const mission = await dispatchedRecord('Delete me');
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    fireEvent.click(await screen.findByTestId('delete-mission'));
    await waitFor(() => expect(reviewMissionClosing).toHaveBeenCalledWith(mission.id));
    await waitFor(async () => expect(await missionService.getMission(mission.id)).toBeNull());
  });

  it('says so when its closing cannot be offered, and deletes it on a second Delete', async () => {
    reviewMissionClosing.mockRejectedValueOnce(new Error('Its package was published under another key (npub1abc…), and only that key can replace it.'));
    const mission = await dispatchedRecord('Other key');
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    fireEvent.click(await screen.findByTestId('delete-mission'));
    expect(await screen.findByText(/only that key can replace it\. Its package still says open\. Delete again to delete it anyway\./)).toBeTruthy();
    expect(await missionService.getMission(mission.id)).not.toBeNull();

    fireEvent.click(screen.getByTestId('delete-mission'));
    await waitFor(async () => expect(await missionService.getMission(mission.id)).toBeNull());
    expect(reviewMissionClosing).toHaveBeenCalledTimes(1);
  });

  it('says who has publicly taken up its package, from NavCom\'s labels (D-MX, MX1)', async () => {
    labelsFor.claims = [{ pubkey: 'c'.repeat(64), at: 1, agent: 'scout' }];
    try {
      const mission = await dispatchedRecord('Taken up');
      render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
      expect((await screen.findByTestId('mission-claims')).textContent).toMatch(/^1 public claim: .+ \(an agent, scout\)$/);
    } finally {
      labelsFor.claims = [];
    }
  });

  it('offers no closing when deleting a mission never published', async () => {
    const created = await missionService.createMission({ title: `Draft ${Date.now()}`, briefing: 'Body' });
    render(<MissionsPanel teamMembers={[]} selectMissionId={created.id} />);
    fireEvent.click(await screen.findByTestId('delete-mission'));
    await waitFor(async () => expect(await missionService.getMission(created.id)).toBeNull());
    expect(reviewMissionClosing).not.toHaveBeenCalled();
  });
});

// Keeps the JSX runtime import used under the project's lint rules.
void React;
