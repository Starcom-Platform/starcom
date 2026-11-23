/**
 * "Show on the globe" on a Mission, rendered inside the real globe providers.
 *
 * A mission's pins are its cases' linked reports and the reports attached to it
 * directly, so the camera move has to account for both. Real persistence; the
 * router and the network-facing pieces MissionsPanel.test.tsx also stubs are
 * mocked.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MissionsPanel } from '../MissionsPanel';
import { GlobeProvider, useGlobeContext } from '../../../../context/GlobeContext';
import { VisualizationModeProvider, useVisualizationMode } from '../../../../context/VisualizationModeContext';
import { intelCaseService } from '../../../../services/intel/IntelCaseService';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import { missionService } from '../../../../services/intel/MissionService';

const { navigateToApp } = vi.hoisted(() => ({ navigateToApp: vi.fn() }));
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
}));

vi.mock('../../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: () => ({
    accepted: [], refused: [],
    counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} },
    publishers: [],
  }),
}));

vi.mock('../../../../services/intel/MissionPackageBroadcastService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/intel/MissionPackageBroadcastService')>()),
  MissionPackageBroadcastService: class {
    publishMissionPackage() { return Promise.resolve(); }
    dispose() {}
  },
  missionPackageRelays: () => ['wss://relay.test.example'],
}));

const seen: { globe: ReturnType<typeof useGlobeContext> | null; mode: ReturnType<typeof useVisualizationMode> | null } = {
  globe: null,
  mode: null,
};
const Probe: React.FC = () => {
  seen.globe = useGlobeContext();
  seen.mode = useVisualizationMode();
  return null;
};

const report = (title: string, at: { latitude: number; longitude: number }) =>
  intelReportService.createReport({ title, content: 'Body', category: 'general', tags: [], ...at }, 'analyst-1');

describe('MissionsPanel — show a mission on the globe', () => {
  beforeEach(() => { navigateToApp.mockClear(); });

  it("aims the camera between its cases' pins and its own reports' pins, then opens the globe on the mission", async () => {
    const west = await report('West, through a case', { latitude: 50, longitude: 30 });
    const east = await report('East, attached directly', { latitude: 50, longitude: 36 });
    const linkedCase = await intelCaseService.createCase({ title: 'Case behind the mission', description: 'Body', relatedEntities: [west.id] });
    const mission = await missionService.createMission({
      title: `Mission on the globe ${Date.now()}`,
      briefing: 'Body',
      relatedCases: [linkedCase.id],
      relatedReports: [east.id],
    });

    render(
      <VisualizationModeProvider>
        <GlobeProvider>
          <MissionsPanel teamMembers={[]} selectMissionId={mission.id} />
          <Probe />
        </GlobeProvider>
      </VisualizationModeProvider>,
    );
    const dialog = await screen.findByTestId('mission-detail-dialog');
    fireEvent.click(within(dialog).getByTestId('show-mission-on-globe'));

    await waitFor(() => expect(navigateToApp).toHaveBeenCalledWith('cybercommand'));
    await waitFor(() => expect(seen.globe!.shownOnGlobe).toEqual({ kind: 'mission', id: mission.id }));
    // Either source alone would aim at 30° or at 36°.
    const { lng } = seen.globe!.focusRequest!;
    expect(lng).toBeGreaterThan(32);
    expect(lng).toBeLessThan(34);
    expect(seen.mode!.visualizationMode).toEqual({ mode: 'CyberCommand', subMode: 'IntelReports' });
  });
});
