/**
 * Psi Watch's panel (decision D-PW, step 3), on the build kit's own fixtures: the one Experimental badge and no
 * other qualifier (PW34, PW48), the field's readings, the sky's events on the shared timeline, and the publisher
 * never named.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { GlobeLayerId, GlobeLayerInfo } from '../../Globe/Hooks/useGlobeLayerControl';

const on = new Set<GlobeLayerId>(['PsiLines', 'PsiField', 'PsiZones', 'PsiRifts', 'PsiWindows']);
const chosen: { layer: GlobeLayerId } = { layer: 'PsiLines' };
const layer = (id: GlobeLayerId, label: string, implemented = false): GlobeLayerInfo => ({
  id, label, category: 'PsiWatch', description: '', isPrimary: id === chosen.layer, isPinned: false, isActive: on.has(id), isImplemented: implemented,
});
vi.mock('../../Globe/Hooks/useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({
    layers: [layer('PsiLines', 'Planet lines'), layer('PsiField', 'Field readings', true), layer('PsiZones', 'Tested places'), layer('PsiRifts', 'Rifts'), layer('PsiWindows', 'Windows')],
    isLayerActive: (id: GlobeLayerId) => on.has(id),
  }),
}));

import { PsiWatchPanel } from '../PsiWatchPanel';

// 26 Oct 2026 14:00Z: the kit's sky runs from 26 Oct to 25 Nov.
const NOW = Date.UTC(2026, 9, 26, 14, 0, 0);

describe('PsiWatchPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    chosen.layer = 'PsiLines';
    // The kit's invented samples show only in a tab opened with ?psi=kit (PW48, restored 2 Nov).
    window.history.replaceState({}, '', '/?psi=kit');
  });
  afterEach(() => { vi.useRealTimers(); window.history.replaceState({}, '', '/'); window.sessionStorage.clear(); });

  const opened = async () => {
    render(<PsiWatchPanel />);
    await act(async () => { await vi.dynamicImportSettled(); });
    await screen.findAllByText('Moon and Mars at change (square)', { exact: false });
  };

  it('shows the one Experimental badge, once, and names no publisher', async () => {
    await opened();
    expect(screen.getAllByText('Experimental')).toHaveLength(1);
    expect(screen.getByTestId('psi-watch-panel').textContent).not.toMatch(/Mecha Jono|Archangel/);
  });

  it("lists the field's readings with their percentiles where computed, and their credits", async () => {
    await opened();
    const field = screen.getByTestId('psi-field');
    expect(within(field).getByTestId('psi-channel-kp').textContent).toContain('percentile 55, against 1932-2026 (GFZ Potsdam, CC BY 4.0)');
    expect(within(field).getByTestId('psi-channel-flare').textContent).toMatch(/^Latest flareB8.4/);
    expect(within(field).getByTestId('psi-channel-sw_speed').textContent).toMatch(/^Solar wind speed332.0 km\/s/);
    expect(within(field).getByText(/Kp history: GFZ Potsdam/)).toBeTruthy();
  });

  it("lists the sky's events in time order and opens the first on the shared timeline", async () => {
    await opened();
    const sky = within(screen.getByTestId('psi-sky'));
    const titles = sky.getAllByRole('button').map((b) => b.textContent);
    expect(titles[0]).toMatch(/^Moon and Mars at change \(square\)/);
    expect(sky.getByRole('slider', { name: /^The window of Moon and Mars at change \(square\)/ })).toBeTruthy();
    fireEvent.click(sky.getByRole('button', { name: /^Last Quarter/ }));
    expect(sky.getByRole('slider', { name: /^The window of Last Quarter/ })).toBeTruthy();
  });

  it('carries nothing but the Experimental badge: no FIXTURE label, no caveat line (PW34, PW48)', async () => {
    await opened();
    const panel = screen.getByTestId('psi-watch-panel');
    expect(within(panel).getAllByText('Experimental')).toHaveLength(1);
    expect(within(panel).queryByText('FIXTURE')).toBeNull();
    expect(panel.textContent).not.toMatch(/correlation, not a cause|Build kit v0|Every result is listed/);
  });

  it('says which layers are on and which are not drawn yet', async () => {
    await opened();
    expect(screen.getAllByText('Not drawn yet')).toHaveLength(4);
  });

  it("puts the chosen layer's section first, before the sky", async () => {
    chosen.layer = 'PsiWindows';
    await opened();
    const sections = [...screen.getByTestId('psi-watch-panel').querySelectorAll('details')].map((d) => d.getAttribute('data-testid'));
    expect(sections.slice(0, 5)).toEqual(['psi-windows', 'psi-field', 'psi-results', 'psi-rifts', 'psi-sky']);
  });
});
