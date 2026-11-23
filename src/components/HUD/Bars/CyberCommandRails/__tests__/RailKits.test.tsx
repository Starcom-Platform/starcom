/**
 * The second left rail's kits (critique-2026-11-01, OR1, OR10, OR11; plan A2, B1): the chosen layer's controls as
 * icon buttons, a toggle switching on a click and kept as a layer choice; a selector or a set of chips opening a
 * flyout, bound to the layer's own settings; a switcher at the top once two layers with controls are drawn.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GeoPoliticalSettingsProvider } from '../../../../../hooks/useGeoPoliticalSettings';
import { layerChoice, resetLayerChoicesForTests } from '../../../../../features/globe/rail/layerChoices';
import { resetWarConflictOverlayForTests } from '../../../../../services/globe/warConflictOverlay';

const drawn: { layers: Array<{ id: string; isActive: boolean; isPrimary: boolean }> } = { layers: [] };
vi.mock('../../../../Globe/Hooks/useGlobeLayerControl', () => ({ useGlobeLayerControl: () => drawn, useGlobeLayerControlOptional: () => drawn }));
const overlays = { resourceZonesOverlayEnabled: false, diplomaticEventsOverlayEnabled: false };
vi.mock('../../../../../hooks/useVisualizationOverlay', () => ({ useVisualizationOverlay: () => overlays }));

import RailKits from '../RailKits';

const renderRail = (subMode: string) => render(<GeoPoliticalSettingsProvider><RailKits subMode={subMode} /></GeoPoliticalSettingsProvider>);

describe('RailKits', () => {
  beforeEach(() => {
    localStorage.clear();
    resetLayerChoicesForTests();
    resetWarConflictOverlayForTests();
    drawn.layers = [];
    overlays.resourceZonesOverlayEnabled = false;
    overlays.diplomaticEventsOverlayEnabled = false;
  });

  it("shows War & Conflict's four toggles, each kept as a layer choice", () => {
    drawn.layers = [{ id: 'WarConflict', isActive: true, isPrimary: true }];
    renderRail('WarConflict');
    expect(screen.queryByRole('tablist')).toBeNull();
    const arcs = screen.getByTestId('rail-control-war:arcs');
    expect(arcs).toHaveAttribute('aria-pressed', 'true');
    expect(arcs).toHaveAttribute('title', "Forces' arcs: on");
    fireEvent.click(arcs);
    expect(arcs).toHaveAttribute('aria-pressed', 'false');
    expect(arcs).toHaveAttribute('title', "Forces' arcs: off");
    expect(layerChoice('WarConflict', 'war:arcs', true)).toBe(false);
    for (const id of ['war:items', 'war:deaths', 'war:map']) expect(screen.getByTestId(`rail-control-${id}`)).toBeTruthy();
  });

  it("switches between the layers drawn, and binds Diplomacy's categories to its own settings", () => {
    drawn.layers = [{ id: 'WarConflict', isActive: true, isPrimary: true }];
    overlays.diplomaticEventsOverlayEnabled = true;
    renderRail('WarConflict');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('data-testid'))).toEqual(['rail-layer-WarConflict', 'rail-layer-DiplomaticEvents']);
    fireEvent.click(screen.getByTestId('rail-layer-DiplomaticEvents'));
    const categories = screen.getByTestId('rail-control-diplomacy:categories');
    expect(categories).toHaveAttribute('title', 'Categories shown: 7 of 7');
    fireEvent.click(categories);
    expect(screen.getByTestId('rail-flyout')).toHaveAttribute('aria-label', 'Categories shown');
    fireEvent.click(screen.getByTestId('rail-option-diplomacy:categories-aid'));
    expect(categories).toHaveAttribute('title', 'Categories shown: 6 of 7');
    expect(screen.getByTestId('rail-option-diplomacy:categories-aid')).toHaveAttribute('aria-checked', 'false');
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(screen.queryByTestId('rail-flyout')).toBeNull();
  });

  it("chooses an option from a selector's flyout, its face and words following", () => {
    drawn.layers = [{ id: 'DiplomaticEvents', isActive: true, isPrimary: true }];
    renderRail('DiplomaticEvents');
    const said = screen.getByTestId('rail-control-diplomacy:saidOrDone');
    expect(said).toHaveAttribute('title', 'Said or done: Both');
    fireEvent.click(said);
    fireEvent.click(screen.getByTestId('rail-option-diplomacy:saidOrDone-said'));
    expect(said).toHaveAttribute('title', 'Said or done: Said: statements');
  });

  it('draws nothing for a layer without controls', () => {
    drawn.layers = [{ id: 'Satellites', isActive: true, isPrimary: true }];
    const { container } = renderRail('Satellites');
    expect(container.querySelector('[data-testid="rail-kits"]')).toBeNull();
  });
});
