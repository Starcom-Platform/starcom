/**
 * The workspace's list and its report form in the language chosen (decision D-ML, L3): the form's labels,
 * how exactly a place is known with its distances as the language writes them, what is missing, and a
 * count of search results by the language's own plural rules.
 */
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}
import { IntelWorkspaceProvider } from '../../../services/intel/IntelWorkspaceContext';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';
import { GlobeProvider } from '../../../context/GlobeContext';
import { IntelWorkspaceConsole } from '../IntelWorkspaceConsole';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { setLanguage } from '../../../i18n/app/i18n';

vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../context/GlobeContext', () => ({
  GlobeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGlobeContext: () => ({ focusLocation: null, setFocusLocation: vi.fn(), focusRequest: null, consumeFocusRequest: vi.fn() }),
}));
vi.mock('../../../context/VisualizationModeContext', () => ({ useVisualizationMode: () => ({ setVisualizationMode: vi.fn() }) }));
vi.mock('../../Globe/Hooks/useTerritories', () => ({
  loadTerritories: async () => ({ countries: () => [{ code: 'DE', name: 'Germany' }] }),
}));

afterEach(async () => { await setLanguage('en', false); });

const renderConsole = () => render(
  <ApplicationRouterProvider>
    <GlobeProvider>
      <IntelWorkspaceProvider>
        <IntelWorkspaceConsole />
      </IntelWorkspaceProvider>
    </GlobeProvider>
  </ApplicationRouterProvider>,
);
const km = (lang: string, n: number) => new Intl.NumberFormat(lang, { style: 'unit', unit: 'kilometer', unitDisplay: 'short' }).format(n);
const m = (lang: string, n: number) => new Intl.NumberFormat(lang, { style: 'unit', unit: 'meter', unitDisplay: 'short' }).format(n);

describe('The workspace, in another language', () => {
  it("labels the report form in German, and says how exactly a place is known as German writes distances", async () => {
    await setLanguage('de', false);
    renderConsole();
    fireEvent.click(await screen.findByTestId('new-record'));

    for (const label of ['Titel', 'Inhalt', 'Schweregrad', 'Kategorie', 'Hoheitsgebiete', 'Ortsgenauigkeit']) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeTruthy();
    }
    const precision = screen.getByTestId('record-precision') as HTMLSelectElement;
    expect([...precision.options].map((o) => o.textContent)).toEqual([
      'Nicht angegeben', `Genau, auf ${m('de', 10)}`, `Auf ${m('de', 100)} genau`, `Auf ${km('de', 1)} genau`,
      `Auf ${km('de', 10)} genau`, `Auf ${km('de', 100)} genau`, `Auf ${km('de', 1000)} genau`,
    ]);
    expect(screen.getByTestId('form-missing').textContent).toBe('Titel und Inhalt sind erforderlich.');
  });

  it('keeps the English distances as they were', async () => {
    renderConsole();
    fireEvent.click(await screen.findByTestId('new-record'));
    const precision = screen.getByTestId('record-precision') as HTMLSelectElement;
    expect([...precision.options].map((o) => o.textContent)).toEqual([
      'Not stated', 'Exact, within 10 m', 'Within 100 m', 'Within 1 km', 'Within 10 km', 'Within 100 km', 'Within 1,000 km',
    ]);
  });

  it('counts search results in Ukrainian by its own plural rules', async () => {
    for (const side of ['north', 'south']) {
      await intelReportService.createReport({ title: `Zebrabridge ${side}`, content: 'Water level at the bridge', category: 'GENERAL', tags: [] });
    }
    await setLanguage('uk', false);
    renderConsole();
    fireEvent.change(await screen.findByTestId('search-reports'), { target: { value: 'Zebrabridge' } });

    await waitFor(() => expect(screen.getByText('(2 результати)')).toBeTruthy());
    expect(screen.getByTestId('tab-reports').textContent).toMatch(/^Звіти \(\d+\)$/);
  });
});
