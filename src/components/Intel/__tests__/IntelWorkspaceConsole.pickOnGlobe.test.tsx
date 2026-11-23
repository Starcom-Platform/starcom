/**
 * Picking the report's place on the globe from the form (plan item 3.5,
 * story S6): the report being written is kept while its place is picked,
 * and the form comes back with both.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

const mount = (props: React.ComponentProps<typeof IntelWorkspaceConsole> = {}) => render(
  <ApplicationRouterProvider><IntelWorkspaceProvider><IntelWorkspaceConsole {...props} /></IntelWorkspaceProvider></ApplicationRouterProvider>,
);

beforeEach(() => { navigateToApp.mockReset(); placePick.cancel(); reportDraft.take(); });

describe('picking the place on the globe, from the report form', () => {
  it('keeps the report being written, asks the globe for a place, and goes there', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('new-record'));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Berth 4 cranes at night' } });
    fireEvent.click(screen.getByRole('button', { name: /Pick on the globe/ }));
    expect(placePick.isPending()).toBe(true);
    expect(navigateToApp).toHaveBeenCalledWith('cybercommand');
    expect((reportDraft.take() as { title: string }).title).toBe('Berth 4 cranes at night');
  });

  it('comes back with the report as it was and the place picked', async () => {
    reportDraft.save({ title: 'Berth 4 cranes at night', content: 'Three cranes working.', latitude: '', longitude: '', precisionM: '' });
    mount({ newReportAt: { lat: 53.54, lng: 9.98, precisionM: 1000 } });
    expect(((await screen.findByLabelText(/^Title/)) as HTMLInputElement).value).toBe('Berth 4 cranes at night');
    expect((screen.getByLabelText(/^Latitude/) as HTMLInputElement).value).toBe('53.54');
    expect((screen.getByLabelText(/^Longitude/) as HTMLInputElement).value).toBe('9.98');
  });

  it('comes back with the report as it was when the pick is given up', async () => {
    reportDraft.save({ title: 'Berth 4 cranes at night', content: '', latitude: '', longitude: '', precisionM: '' });
    mount({ restoreDraft: true });
    expect(((await screen.findByLabelText(/^Title/)) as HTMLInputElement).value).toBe('Berth 4 cranes at night');
  });
});
