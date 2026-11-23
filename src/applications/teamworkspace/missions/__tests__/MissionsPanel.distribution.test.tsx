/**
 * Undecided missions are found without opening each one (plan item 9.13):
 * every card says who may receive its mission, the undecided ones are counted
 * and can be shown alone, and a mission sent to someone is asked about first
 * when nobody has decided (decision G8), with the choice kept on the mission.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MissionsPanel } from '../MissionsPanel';
import { missionService } from '../../../../services/intel/MissionService';
import { intelWorkspaceManager } from '../../../../services/intel/IntelWorkspaceManager';
import { MissionStatus } from '../../../../types/intel/MissionUI';
import { joinRelay, leaveRelay } from '../../../../services/nostr/joinedRelays';

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: () => ({ accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] }),
}));

const undecidedHere = () => intelWorkspaceManager.getMissions().filter((m) => m.visibility === undefined).length;

describe('MissionsPanel — distribution', () => {
  it("says on each card who may receive its mission, undecided included", async () => {
    const decided = await missionService.createMission({ title: `Decided ${Date.now()}`, briefing: 'Body', visibility: 'limited' });
    const open = await missionService.createMission({ title: `Undecided ${Date.now()}`, briefing: 'Body' });
    render(<MissionsPanel teamMembers={[]} />);
    // The one chip every screen draws (BD18): its word, and what it is to a screen reader.
    const decidedChip = await screen.findByTestId(`mission-card-distribution-${decided.id}`);
    expect(decidedChip.getAttribute('data-distribution')).toBe('limited');
    expect(decidedChip.textContent).toBe('Distribution: Limited');
    const openChip = screen.getByTestId(`mission-card-distribution-${open.id}`);
    expect(openChip.getAttribute('data-distribution')).toBe('undecided');
    expect(openChip.getAttribute('title')).toBe('Nobody has chosen who may receive this mission: it goes nowhere until someone does.');
    // Where it stands, as the one status chip (BD24), in place of Missions' own colour map.
    const status = screen.getByTestId(`mission-card-status-${decided.id}`);
    expect(status.getAttribute('data-status')).toBe(decided.status);
    expect(status.getAttribute('data-tone')).toBe('working');
  });

  it('counts the undecided missions, and shows only them on request', async () => {
    const decided = await missionService.createMission({ title: `Public one ${Date.now()}`, briefing: 'Body', visibility: 'public' });
    const open = await missionService.createMission({ title: `Nobody chose ${Date.now()}`, briefing: 'Body' });
    render(<MissionsPanel teamMembers={[]} />);
    const filter = await screen.findByTestId('missions-undecided-filter');
    expect(filter.textContent).toBe(`${undecidedHere()} undecided`);
    expect(filter.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(filter);
    await waitFor(() => expect(screen.queryByTestId(`open-mission-${decided.id}`)).toBeNull());
    expect(screen.getByTestId(`open-mission-${open.id}`)).toBeTruthy();
    expect(filter.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(filter);
    expect(await screen.findByTestId(`open-mission-${decided.id}`)).toBeTruthy();
  });

  it('shows every mission again once the last undecided one is decided', async () => {
    const decided = await missionService.createMission({ title: `Already chosen ${Date.now()}`, briefing: 'Body', visibility: 'private' });
    render(<MissionsPanel teamMembers={[]} />);
    fireEvent.click(await screen.findByTestId('missions-undecided-filter'));
    await waitFor(() => expect(screen.queryByTestId(`open-mission-${decided.id}`)).toBeNull());
    for (const m of intelWorkspaceManager.getMissions().filter((x) => x.visibility === undefined)) {
      await missionService.saveMission({ ...m, visibility: 'limited' });
    }
    await waitFor(() => expect(screen.queryByTestId('missions-undecided-filter')).toBeNull());
    expect(screen.getByTestId(`open-mission-${decided.id}`)).toBeTruthy();
  });

  it('asks who may receive an undecided mission before sending it, and keeps the choice on the mission', async () => {
    const mission = await missionService.createMission({ title: `Ask first ${Date.now()}`, briefing: 'Body' });
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    const detail = await screen.findByTestId('mission-detail-dialog');
    fireEvent.click(within(detail).getByRole('button', { name: 'Send to…' }));
    const dialog = await screen.findByTestId('send-bundle-dialog');
    fireEvent.click(within(within(dialog).getByTestId('send-bundle-ask')).getByLabelText(/^Limited/));
    await waitFor(() => expect(intelWorkspaceManager.getMission(mission.id)?.visibility).toBe('limited'));
    await waitFor(() => expect(within(dialog).queryByTestId('send-bundle-ask')).toBeNull());
  });

  it("cannot choose for a locked mission from the send dialog, and says to move it back to Planning", async () => {
    const mission = await missionService.createMission({ title: `Locked ${Date.now()}`, briefing: 'Body' });
    const stored = intelWorkspaceManager.getMission(mission.id)!;
    await intelWorkspaceManager.putFromBundle('mission', { ...stored, status: MissionStatus.READY_FOR_PACKAGE } as unknown as Record<string, unknown>);
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    const detail = await screen.findByTestId('mission-detail-dialog');
    expect(within(detail).getByTestId('mission-distribution-consequence').textContent).toBe('Its package is locked, so move it back to Planning to choose.');
    // The alert that says it goes nowhere asks for a choice, and so says how to make one.
    expect(within(detail).getByTestId('publish-destination').textContent)
      .toBe('Nobody has decided who may receive this mission, so it goes nowhere yet. Choose Public, Limited or Private. Its package is locked, so move it back to Planning to choose.');
    fireEvent.click(within(detail).getByRole('button', { name: 'Send to…' }));
    const asking = within(await screen.findByTestId('send-bundle-dialog')).getByTestId('send-bundle-ask');
    expect((within(asking).getByLabelText(/^Limited/) as HTMLInputElement).disabled).toBe(true);
    expect(asking.textContent).toMatch(/Its package is locked, so move it back to Planning to choose\./);
  });

  it('sends a Limited mission to a joined team its author ticks, and saves an untick from the mission (LW1)', async () => {
    const TEAM = 'wss://relay.newark-desk.example';
    joinRelay({ url: TEAM, relayPubkey: '9'.repeat(64), team: 'Newark desk' });
    try {
      render(<MissionsPanel teamMembers={[]} />);
      fireEvent.click(await screen.findByRole('button', { name: /new mission/i }));
      const create = await screen.findByTestId('create-mission-dialog');
      const title = `For Newark ${Date.now()}`;
      fireEvent.change(within(create).getByTestId('mission-title-input'), { target: { value: title } });
      fireEvent.change(within(create).getByTestId('mission-briefing-input'), { target: { value: 'Rests on direct observation.' } });
      fireEvent.click(within(create).getByRole('radio', { name: /^Limited/ }));
      // With no internal relay in this build, a Limited mission goes nowhere until a team is picked.
      expect(within(create).getByTestId('mission-distribution-consequence').textContent).toMatch(/no internal relay/);
      fireEvent.click(within(create).getByLabelText('Newark desk (relay.newark-desk.example)'));
      expect(within(create).getByTestId('mission-distribution-consequence').textContent).toMatch(/^This build publishes to your team's relay/);
      fireEvent.click(within(create).getByTestId('create-mission-submit'));
      const detail = await screen.findByTestId('mission-detail-dialog');
      await waitFor(() => expect(intelWorkspaceManager.getMissions().find((m) => m.title === title)?.limitedTo).toEqual([TEAM]));

      fireEvent.click(within(detail).getByLabelText('Newark desk (relay.newark-desk.example)'));
      await waitFor(() => expect(intelWorkspaceManager.getMissions().find((m) => m.title === title)?.limitedTo).toEqual([]));
    } finally {
      leaveRelay(TEAM);
    }
  });
});

