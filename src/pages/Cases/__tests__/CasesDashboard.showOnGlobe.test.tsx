/**
 * "Show on globe" on a Case row, rendered inside the real globe providers.
 *
 * The other CasesDashboard suites stub this action out, because they test the
 * table. This one checks what the click leaves behind for the globe: the case's
 * id, a camera request toward its pins, and the report layer switched on.
 * Real persistence; only the router is mocked.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { GlobeProvider, useGlobeContext } from '../../../context/GlobeContext';
import { VisualizationModeProvider, useVisualizationMode } from '../../../context/VisualizationModeContext';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { intelReportService } from '../../../services/intel/IntelReportService';

const { navigateToApp } = vi.hoisted(() => ({ navigateToApp: vi.fn() }));
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
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

const renderWithGlobe = () =>
  render(
    <VisualizationModeProvider>
      <GlobeProvider>
        <CasesDashboard />
        <Probe />
      </GlobeProvider>
    </VisualizationModeProvider>,
  );

const report = (title: string, at?: { latitude: number; longitude: number }) =>
  intelReportService.createReport({ title, content: 'Body', category: 'general', tags: [], ...at }, 'analyst-1');

describe('CasesDashboard — show a case on the globe', () => {
  beforeEach(() => { navigateToApp.mockClear(); });

  it('leaves the case, a camera move toward its pins and the report layer for the globe, then opens it', async () => {
    const east = await report('East of the line', { latitude: 10, longitude: 170 });
    const west = await report('West of the line', { latitude: 10, longitude: -170 });
    const nowhere = await report('No coordinates');
    const title = `Pacific ${Date.now()}`;
    const created = await intelCaseService.createCase({
      title,
      description: 'Body',
      relatedEntities: [east.id, west.id, nowhere.id],
    });

    renderWithGlobe();
    const button = await screen.findByRole('button', { name: `Show ${title} on the globe` });
    act(() => seen.mode!.setVisualizationMode({ mode: 'GeoPolitical', subMode: 'ConflictZones' }));

    fireEvent.click(button);

    await waitFor(() => expect(navigateToApp).toHaveBeenCalledWith('cybercommand'));
    await waitFor(() => expect(seen.globe!.shownOnGlobe).toEqual({ kind: 'case', id: created.id }));
    // Between the two pins, across the antimeridian: not a point through Greenwich.
    expect(Math.abs(seen.globe!.focusRequest!.lng)).toBeGreaterThan(179);
    expect(seen.globe!.focusRequest!.lat).toBeCloseTo(10, 0);
    expect(seen.mode!.visualizationMode).toEqual({ mode: 'CyberCommand', subMode: 'IntelReports' });
  });

  it('still opens the globe for a case with nothing placeable, and leaves the camera where it is', async () => {
    const nowhere = await report('Still no coordinates');
    const title = `Unplaced ${Date.now()}`;
    const created = await intelCaseService.createCase({ title, description: 'Body', relatedEntities: [nowhere.id] });

    renderWithGlobe();
    fireEvent.click(await screen.findByRole('button', { name: `Show ${title} on the globe` }));

    await waitFor(() => expect(navigateToApp).toHaveBeenCalledWith('cybercommand'));
    await waitFor(() => expect(seen.globe!.shownOnGlobe).toEqual({ kind: 'case', id: created.id }));
    expect(seen.globe!.focusRequest).toBeNull();
  });
});
