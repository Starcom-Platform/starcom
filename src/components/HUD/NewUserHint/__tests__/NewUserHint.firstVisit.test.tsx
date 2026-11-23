/**
 * A first visit sees the globe (decision D-F, step 3).
 *
 * The pipeline guide opened expanded in the globe's top-right corner, and at
 * 1280×720 it ran past the globe's area onto the bottom bar, over OpsCenter, LIVE,
 * the chat button and the Layers button, while the support ask opened over the
 * centre. The guide now opens collapsed to its title line, and says whether it is
 * open, so the support ask can wait while it is.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NewUserHint from '../NewUserHint';
import { isPipelineGuideOpen, resetPipelineGuideForTests } from '../pipelineGuideOpen';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import { missionService } from '../../../../services/intel/MissionService';
import { intelCaseService } from '../../../../services/intel/IntelCaseService';

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../../services/intel/IntelReportService', () => ({
  intelReportService: { listReports: vi.fn(), onChange: vi.fn(() => () => {}) },
}));
vi.mock('../../../../services/intel/MissionService', () => ({
  missionService: { listMissions: vi.fn(), onChange: vi.fn(() => () => {}) },
}));
vi.mock('../../../../services/intel/IntelCaseService', () => ({
  intelCaseService: { listCases: vi.fn(), onChange: vi.fn(() => () => {}) },
}));
// Docked portals to a dock host that doesn't exist in this harness.
vi.mock('../../../Dock/Docked', () => ({
  Docked: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderGuide = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <NewUserHint />
    </MemoryRouter>,
  );

const collapsedGuide = () => screen.findByTitle('Show the intel pipeline guide');

beforeEach(() => {
  localStorage.clear();
  resetPipelineGuideForTests();
  vi.mocked(intelReportService.listReports).mockResolvedValue([] as never);
  vi.mocked(missionService.listMissions).mockResolvedValue([] as never);
  vi.mocked(intelCaseService.listCases).mockResolvedValue([] as never);
});

describe('NewUserHint on a first visit', () => {
  it('opens collapsed to its title line', async () => {
    renderGuide();

    expect(await collapsedGuide()).toBeTruthy();
    expect(screen.getByText(/Pipeline · 4 left/)).toBeTruthy();
    expect(screen.queryByTestId('pipeline-step-collect')).toBeNull();
  });

  it('is not open until the person opens it', async () => {
    renderGuide();
    await collapsedGuide();

    expect(isPipelineGuideOpen()).toBe(false);
  });

  it('says it is open while expanded, and closed once collapsed again', async () => {
    renderGuide();

    fireEvent.click(await collapsedGuide());
    await waitFor(() => expect(isPipelineGuideOpen()).toBe(true));

    fireEvent.click(screen.getByTitle('Minimize'));
    await waitFor(() => expect(isPipelineGuideOpen()).toBe(false));
  });

  it('says it is closed once dismissed', async () => {
    renderGuide();
    fireEvent.click(await collapsedGuide());
    await waitFor(() => expect(isPipelineGuideOpen()).toBe(true));

    fireEvent.click(screen.getByTitle('Dismiss for good'));

    await waitFor(() => expect(isPipelineGuideOpen()).toBe(false));
  });

  it('says it is closed once it is gone from the screen', async () => {
    const { unmount } = renderGuide();
    fireEvent.click(await collapsedGuide());
    await waitFor(() => expect(isPipelineGuideOpen()).toBe(true));

    unmount();

    expect(isPipelineGuideOpen()).toBe(false);
  });
});
