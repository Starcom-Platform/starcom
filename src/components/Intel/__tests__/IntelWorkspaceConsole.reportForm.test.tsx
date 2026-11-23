/**
 * The report form (plan item 1.9, stories S7 and S8). "Every field is labelled
 * only by a placeholder that disappears when typing. Create stays disabled
 * until both Title and Content are filled, and nothing says so." And the form
 * had no way to say how serious a report is, where it applies, or how exactly
 * it was placed, and createReport dropped the last two.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}
import { IntelWorkspaceProvider } from '../../../services/intel/IntelWorkspaceContext';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';
import { GlobeProvider } from '../../../context/GlobeContext';
import { IntelWorkspaceConsole } from '../IntelWorkspaceConsole';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import { reportReach } from '../../../services/intel/bundles/bundleDistribution';

vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../context/GlobeContext', () => ({
  GlobeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGlobeContext: () => ({ focusLocation: null, setFocusLocation: vi.fn(), focusRequest: null, consumeFocusRequest: vi.fn() }),
}));
vi.mock('../../../context/VisualizationModeContext', () => ({ useVisualizationMode: () => ({ setVisualizationMode: vi.fn() }) }));
vi.mock('../../Globe/Hooks/useTerritories', () => ({
  loadTerritories: async () => ({ countries: () => [{ code: 'DE', name: 'Germany' }, { code: 'NZ', name: 'New Zealand' }] }),
}));

async function openForm() {
  render(
    <ApplicationRouterProvider>
      <GlobeProvider>
        <IntelWorkspaceProvider>
          <IntelWorkspaceConsole />
        </IntelWorkspaceProvider>
      </GlobeProvider>
    </ApplicationRouterProvider>,
  );
  fireEvent.click(await screen.findByTestId('new-record'));
}

describe('the report form', () => {
  it('labels every field where it can be read while typing, and marks what is required', async () => {
    await openForm();
    for (const label of ['Title', 'Content', 'Severity', 'Category', 'Tags', 'Jurisdictions', 'Latitude', 'Longitude', 'Place precision']) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeTruthy();
    }
    expect(screen.getByLabelText(/^Title/).getAttribute('aria-required')).toBe('true');
    expect(screen.getByLabelText(/^Content/).getAttribute('aria-required')).toBe('true');
  });

  it('says what is missing while Create is off, and stops saying it once it is there', async () => {
    await openForm();
    expect(screen.getByTestId('create-record')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('form-missing').textContent).toMatch(/title and content/i);

    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Bridge closed' } });
    expect(screen.getByTestId('form-missing').textContent).toMatch(/content/i);
    fireEvent.change(screen.getByLabelText(/^Content/), { target: { value: 'Barriers across both lanes.' } });
    expect(screen.queryByTestId('form-missing')).toBeNull();
    expect(screen.getByTestId('create-record')).toHaveProperty('disabled', false);
  });

  it('offers severity on the Cases scale as five buttons, each its badge, not assessed until chosen (BD17)', async () => {
    await openForm();
    const severity = screen.getByRole('radiogroup', { name: /^Severity/ });
    const radios = within(severity).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.labels?.[0]?.textContent)).toEqual(['Not assessed', 'Low', 'Medium', 'High', 'Critical']);
    expect(radios.filter((r) => r.checked).map((r) => r.labels?.[0]?.textContent)).toEqual(['Not assessed']);
  });

  it('asks who may receive the report, with nothing chosen, and lets it wait (BD16)', async () => {
    await openForm();
    const ask = screen.getByTestId('report-distribution');
    const radios = within(ask).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['']);
    expect(within(ask).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('undecided');
    expect(screen.getByTestId('report-distribution-consequence').textContent).toBe(reportReach(undefined));

    fireEvent.click(within(ask).getByRole('radio', { name: /^Limited/ }));
    expect(within(ask).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('limited');
    expect(screen.getByTestId('report-distribution-consequence').textContent).toBe(reportReach('limited'));
    fireEvent.click(within(ask).getByRole('radio', { name: /^Decide later/ }));
    expect(within(ask).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('undecided');
  });

  it('keeps the distribution chosen, and creates an undecided report when nobody chose', async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Ferry cancelled' } });
    fireEvent.change(screen.getByLabelText(/^Content/), { target: { value: 'Notice at the terminal.' } });
    fireEvent.click(within(screen.getByTestId('report-distribution')).getByRole('radio', { name: /^Private/ }));
    fireEvent.click(screen.getByTestId('create-record'));
    await waitFor(async () => {
      expect((await intelReportService.listReports()).find((r) => r.title === 'Ferry cancelled')?.visibility).toBe('private');
    });

    fireEvent.click(screen.getByTestId('new-record'));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Ferry resumed' } });
    fireEvent.change(screen.getByLabelText(/^Content/), { target: { value: 'Notice taken down.' } });
    fireEvent.click(screen.getByTestId('create-record'));
    await waitFor(async () => {
      const made = (await intelReportService.listReports()).find((r) => r.title === 'Ferry resumed');
      expect(made).toBeTruthy();
      expect(made?.visibility).toBeUndefined();
    });
  });

  // On a phone the open report or the editor takes the screen in place of the
  // list (the stylesheet reads this): three columns in 390 px ran the report's
  // page off the edge.
  it('says when a report is open, and when it closes', async () => {
    await intelReportService.createReport({ title: 'Open me', content: 'Body of the report.', category: 'GENERAL', tags: [] });
    await openForm();
    fireEvent.click(screen.getByTestId('cancel-record'));
    const body = screen.getByTestId('workspace-body');
    expect(body.getAttribute('data-detail-open')).toBe('false');
    fireEvent.click((await screen.findAllByTestId('report-row')).find((r) => r.textContent?.includes('Open me'))!);
    expect(body.getAttribute('data-detail-open')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(body.getAttribute('data-detail-open')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(body.getAttribute('data-detail-open')).toBe('true');
    // A new report is written where the list was, so the open one gives way.
    fireEvent.click(screen.getByTestId('new-record'));
    expect(body.getAttribute('data-detail-open')).toBe('false');
    fireEvent.click(screen.getByTestId('cancel-record'));
    expect(body.getAttribute('data-detail-open')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close the report' }));
    expect(body.getAttribute('data-detail-open')).toBe('false');
  });

  it('draws each report\'s severity and distribution on its row', async () => {
    await intelReportService.createReport({ title: 'Row marks', content: 'Body of the row.', category: 'GENERAL', tags: [], priority: 'CRITICAL', visibility: 'limited' });
    await openForm();
    const row = (await screen.findAllByTestId('report-row')).find((r) => r.textContent?.includes('Row marks'))!;
    // The report's own reading, which takes a peer's tag where nothing was stated.
    expect(within(row).getByTestId('report-severity').getAttribute('data-level')).toBe('critical');
    expect(within(row).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('limited');
  });

  it('asks an intel item\'s distribution with nothing chosen in advance, as D2 says', async () => {
    await openForm();
    fireEvent.click(screen.getByTestId('tab-intel'));
    fireEvent.click(screen.getByTestId('new-record'));
    const ask = screen.getByTestId('item-distribution');
    expect((within(ask).getAllByRole('radio') as HTMLInputElement[]).filter((r) => r.checked).map((r) => r.value)).toEqual(['']);
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Undecided item' } });
    fireEvent.change(screen.getByLabelText(/^Content/), { target: { value: 'Seen from the bridge.' } });
    fireEvent.click(screen.getByTestId('create-record'));
    await waitFor(() => expect(intelWorkspaceManager.getIntelItems().find((i) => i.title === 'Undecided item')).toBeTruthy());
    expect(intelWorkspaceManager.getIntelItems().find((i) => i.title === 'Undecided item')?.visibility).toBeUndefined();
    const row = (await screen.findAllByTestId('intel-row')).find((r) => r.textContent?.includes('Undecided item'))!;
    expect(within(row).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('undecided');
  });

  it('keeps what it was told: severity, jurisdictions, and how precisely the place was given, under the signer', async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Pantry closed at noon' } });
    fireEvent.change(screen.getByLabelText(/^Content/), { target: { value: 'Sign on the door.' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /^Severity/ })).getByRole('radio', { name: 'High' }));
    fireEvent.change(screen.getByLabelText(/^Jurisdictions/), { target: { value: ' US, us-NJ ' } });
    expect(screen.getByLabelText(/^Place precision/)).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText(/^Latitude/), { target: { value: '40.7357' } });
    fireEvent.change(screen.getByLabelText(/^Longitude/), { target: { value: '-74.1724' } });
    fireEvent.change(screen.getByLabelText(/^Place precision/), { target: { value: '1000' } });
    fireEvent.click(screen.getByTestId('create-record'));

    await waitFor(async () => {
      const saved = (await intelReportService.listReports()).find((r) => r.title === 'Pantry closed at noon');
      expect(saved).toMatchObject({ priority: 'HIGH', jurisdictions: ['us', 'us-nj'], geoPrecisionM: 1000 });
      expect(saved?.author).toBe(nostrIdentityService.signerPubkey());
    });
  });

  it('says where a report is about by finding the country by name (plan item 3.5, story S6)', async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText(/^Jurisdictions/), { target: { value: 'us' } });
    const finder = screen.getByLabelText(/Find a country/);
    fireEvent.focus(finder);
    fireEvent.change(finder, { target: { value: 'germ' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Germany' }));
    expect((screen.getByLabelText(/^Jurisdictions/) as HTMLInputElement).value).toBe('us, de');
    // Chosen again, it is not added twice.
    fireEvent.change(finder, { target: { value: 'germ' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Germany' }));
    expect((screen.getByLabelText(/^Jurisdictions/) as HTMLInputElement).value).toBe('us, de');
  });
});
