/**
 * Starcom in Uplink's side panel (decision D-EX, E2, W6; EX16): it holds the case open for captures,
 * opens again with the case it had, lets it go when it closes, and shows what was sent to the case and
 * the limits of the missions resting on it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import { captureToItem } from '../../../extension/captureItems';
import { OPEN_CASE_KEY, chooseOpenCase } from '../../../extension/openCase';
import type { MissionUI } from '../../../types/intel/MissionUI';

const missions = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock('../../../core/intel/hooks/useCaseMissions', () => ({ useCaseMissions: () => ({ missions: missions.value, loading: false }) }));
vi.mock('../../../extension/useUplinkCaptures', () => ({ useUplinkCaptures: () => undefined }));
vi.mock('../../../extension/useUplinkInboxCount', () => ({ useUplinkInboxCount: () => undefined }));
vi.mock('../../../extension/useStarcomUplink', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../extension/useStarcomUplink')>()),
  useStarcomUplink: () => ({ status: 'connected', hello: { kind: 'hello', id: 'h', extensionVersion: '0.1.0', protocol: 1, capabilities: [] } }),
}));

import UplinkPanel from '../UplinkPanel';

let floodId = '';
let roadsId = '';

beforeEach(async () => {
  intelWorkspaceManager.resetForTests();
  localStorage.clear();
  await intelWorkspaceManager.ensureInitialized();
  const sent = intelWorkspaceManager.addIntelItem(captureToItem({
    id: 'c1', kind: 'selection', at: '2026-10-11T21:05:00.000Z', page: { url: 'https://news.example.org/flood' }, text: 'The river rose 3 m overnight.',
  }));
  intelWorkspaceManager.addIntelItem(captureToItem({ id: 'c2', kind: 'page', at: '2026-10-11T21:06:00.000Z', page: { url: 'https://news.example.org/other', title: 'Unfiled page' } }));
  floodId = (await intelWorkspaceManager.addCase({ title: 'Flood response', description: 'x', relatedEntities: [sent.id] } as never)).id;
  roadsId = (await intelWorkspaceManager.addCase({ title: 'Road closures', description: 'x' } as never)).id;
  missions.value = [];
});
afterEach(() => vi.restoreAllMocks());

const select = () => screen.getByLabelText('Case open for captures') as HTMLSelectElement;

describe('UplinkPanel', () => {
  it('opens with no case, saying captures wait to be filed, and counts what waits', async () => {
    render(<UplinkPanel />);
    await waitFor(() => expect(select().options).toHaveLength(3));
    expect(select().value).toBe('');
    expect(screen.getByText('What you send from this browser waits on the Cases page to be filed.')).toBeTruthy();
    expect(screen.getByTestId('panel-waiting').textContent).toBe('Waiting to be filed: 1');
    expect(screen.getByText('Uplink connected')).toBeTruthy();
  });

  it('holds the chosen case open for captures, and lets it go when the panel closes', async () => {
    render(<UplinkPanel />);
    await waitFor(() => expect(select().options).toHaveLength(3));
    fireEvent.change(select(), { target: { value: roadsId } });
    expect(localStorage.getItem(OPEN_CASE_KEY)).toBe(roadsId);
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(OPEN_CASE_KEY)).toBeNull();
  });

  it('opens again with the case it had, and lists what was sent to it', async () => {
    chooseOpenCase(floodId);
    localStorage.removeItem(OPEN_CASE_KEY);
    render(<UplinkPanel />);
    await waitFor(() => expect(select().value).toBe(floodId));
    expect(localStorage.getItem(OPEN_CASE_KEY)).toBe(floodId);
    expect(screen.getAllByTestId('panel-capture').map((li) => li.textContent)).toEqual([expect.stringContaining('The river rose 3 m overnight.')]);
    expect(screen.getAllByTestId('panel-capture')[0].textContent).toContain('news.example.org · 11 Oct 21:05Z');
  });

  it('shows the open objectives of the missions resting on the case, with their limits', async () => {
    missions.value = [{ id: 'm1', title: 'Map the flood', status: 'ACTIVE', objectives: [
      { id: 'o1', description: 'Photograph the bridge', completed: false, limits: ['No drones', 'Public land only'] },
    ] }] as unknown as MissionUI[];
    chooseOpenCase(floodId);
    render(<UplinkPanel />);
    await waitFor(() => expect(screen.getByTestId('panel-mission')).toBeTruthy());
    expect(screen.getByTestId('panel-mission').textContent).toContain('Photograph the bridge');
    expect(screen.getByTestId('panel-mission').textContent).toContain('Limits: No drones; Public land only');
    expect(screen.getByRole('link', { name: 'Map the flood' }).getAttribute('target')).toBe('_blank');
  });
});
