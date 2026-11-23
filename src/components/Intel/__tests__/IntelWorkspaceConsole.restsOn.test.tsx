/**
 * A report written on a field observation (decision D-MX, MX19). The form
 * opened from the Analyzer says what the report rests on, keeps it through the
 * trip to pick a place on the globe, and the report made keeps it. It comes
 * off: a report need not rest on what it was started from.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
const navigateToApp = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp }) }));
vi.mock('../../../context/GlobeContext', () => ({
  GlobeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGlobeContext: () => ({ focusLocation: null, setFocusLocation: vi.fn(), focusRequest: null, consumeFocusRequest: vi.fn() }),
}));
vi.mock('../../../context/VisualizationModeContext', () => ({ useVisualizationMode: () => ({ setVisualizationMode: vi.fn() }) }));

import { IntelWorkspaceProvider } from '../../../services/intel/IntelWorkspaceContext';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';
import { IntelWorkspaceConsole } from '../IntelWorkspaceConsole';
import { placePick, reportDraft } from '../../../services/intel/place/placePick';
import { intelReportService } from '../../../services/intel/IntelReportService';

const OBSERVATION = '1'.repeat(64);
const RELAY = 'wss://relay.example';
const CITES = [{ eventId: OBSERVATION, relay: RELAY }];

const mount = (props: React.ComponentProps<typeof IntelWorkspaceConsole> = {}) => render(
  <ApplicationRouterProvider><IntelWorkspaceProvider><IntelWorkspaceConsole {...props} /></IntelWorkspaceProvider></ApplicationRouterProvider>,
);
const draftOnObservation = () => reportDraft.save({
  title: 'Alpha one', content: 'On a field observation: alpha one, seen on 1 Sep 2026 (UTC).',
  latitude: '38.6719', longitude: '-90.1758', precisionM: '100000',
  event: { startDate: '2026-09-01', startTime: '', endDate: '', endTime: '', precision: 'day' },
  cites: CITES,
});

beforeEach(() => { navigateToApp.mockReset(); placePick.cancel(); reportDraft.take(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('a report written on an observation', () => {
  it('says what it rests on, and the report made keeps it', async () => {
    const create = vi.spyOn(intelReportService, 'createReport');
    draftOnObservation();
    mount({ restoreDraft: true });
    expect((await screen.findByTestId('report-rests-on')).textContent).toMatch(/Rests on an observation: event 11111111…/);
    fireEvent.click(screen.getByTestId('create-record'));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].cites).toEqual(CITES);
  });

  it('comes off, and the report made then rests on nothing', async () => {
    const create = vi.spyOn(intelReportService, 'createReport');
    draftOnObservation();
    mount({ restoreDraft: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(screen.queryByTestId('report-rests-on')).toBeNull();
    fireEvent.click(screen.getByTestId('create-record'));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].cites).toBeUndefined();
  });

  it('keeps it through picking a place on the globe', async () => {
    draftOnObservation();
    mount({ restoreDraft: true });
    await screen.findByTestId('report-rests-on');
    fireEvent.click(screen.getByRole('button', { name: /Pick on the globe/ }));
    expect((reportDraft.peek() as { cites: unknown }).cites).toEqual(CITES);
  });

  it('is not said of a report started from nothing', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('new-record'));
    await screen.findByLabelText(/^Title/);
    expect(screen.queryByTestId('report-rests-on')).toBeNull();
  });
});
