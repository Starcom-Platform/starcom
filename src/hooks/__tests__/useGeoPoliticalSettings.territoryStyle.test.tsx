/**
 * The territories' style and each style's own settings (decision K5, TS6), as
 * the settings hand them to every reader.
 */
import React, { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VisualizationOverlayProvider } from '../../context/VisualizationOverlayContext';
import { GeoPoliticalSettingsProvider, useGeoPoliticalSettings } from '../useGeoPoliticalSettings';
import { TERRITORY_STYLE_DEFAULTS } from '../../geopolitical/theme/territoryStyles';

const KEY = 'starcom-geo-political-settings';

const Harness: React.FC = () => {
  const api = useGeoPoliticalSettings();
  const territories = api.config.nationalTerritories;
  // How often the territories' settings object changed, which is what makes the layer rebuild.
  const seen = useRef<unknown[]>([]);
  if (seen.current.at(-1) !== territories) seen.current.push(territories);
  return (
    <div>
      <div data-testid="style">{api.territoryStyle}</div>
      <div data-testid="resolved-style">{territories.style}</div>
      <div data-testid="opacity">{territories.territoryColors.opacity}</div>
      <div data-testid="height">{territories.fillElevationEpsilon}</div>
      <div data-testid="quiet-opacity">{api.territoryLooks.quiet.fillOpacity}</div>
      <div data-testid="shading">{api.territoryLooks[api.territoryStyle].shading}</div>
      <div data-testid="settled-colour">{api.territoryLooks[api.territoryStyle].borderColours.international}</div>
      <button onClick={() => api.updateTerritoryLook({ shading: 40, borderColours: { international: 'cyan' } })}>shade and colour</button>
      <div data-testid="identities">{seen.current.length}</div>
      <button onClick={() => api.updateNationalTerritories({ territoryColors: { ...territories.territoryColors, opacity: 30 } })}>opacity 30</button>
      <button onClick={() => api.setTerritoryStyle('quiet')}>quiet</button>
      <button onClick={() => api.setTerritoryStyle('classic')}>classic</button>
      <button onClick={() => api.resetTerritoryLook(api.territoryStyle)}>reset</button>
      <button onClick={() => api.updateConflictZones({ markerSize: 2 })}>elsewhere</button>
    </div>
  );
};

function renderHarness() {
  return render(
    <VisualizationOverlayProvider>
      <GeoPoliticalSettingsProvider>
        <Harness />
      </GeoPoliticalSettingsProvider>
    </VisualizationOverlayProvider>,
  );
}
const text = (id: string) => screen.getByTestId(id).textContent;

describe('the territories\' style in the settings', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('is Classic on a first visit, and every reader is handed Classic\'s look', () => {
    renderHarness();
    expect(text('style')).toBe('classic');
    expect(text('resolved-style')).toBe('classic');
    expect(text('opacity')).toBe(String(TERRITORY_STYLE_DEFAULTS.classic.fillOpacity));
    expect(text('height')).toBe(String(TERRITORY_STYLE_DEFAULTS.classic.height));
  });

  it('stores a change as the screen style\'s own, so switching style keeps each one\'s', () => {
    renderHarness();
    fireEvent.click(screen.getByText('opacity 30'));
    expect(text('opacity')).toBe('30');
    fireEvent.click(screen.getByText('quiet'));
    expect(text('opacity')).toBe(String(TERRITORY_STYLE_DEFAULTS.quiet.fillOpacity));
    fireEvent.click(screen.getByText('classic'));
    expect(text('opacity')).toBe('30');
  });

  it('puts a style back to its defaults, and only that style', () => {
    renderHarness();
    fireEvent.click(screen.getByText('opacity 30'));
    fireEvent.click(screen.getByText('quiet'));
    fireEvent.click(screen.getByText('opacity 30'));
    fireEvent.click(screen.getByText('reset'));
    expect(text('opacity')).toBe(String(TERRITORY_STYLE_DEFAULTS.quiet.fillOpacity));
    fireEvent.click(screen.getByText('classic'));
    expect(text('opacity')).toBe('30');
  });

  it('leaves the territories\' settings object as it was when another layer\'s setting changes', () => {
    renderHarness();
    const before = Number(text('identities'));
    fireEvent.click(screen.getByText('elsewhere'));
    expect(Number(text('identities'))).toBe(before);
    fireEvent.click(screen.getByText('opacity 30'));
    expect(Number(text('identities'))).toBe(before + 1);
  });

  it('reads a browser\'s settings from before K5 as changes to Quiet, and shows it Classic', () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 2,
      timestamp: 0,
      data: {
        nationalTerritories: {
          borderVisibility: 70, borderThickness: 1, fillElevationEpsilon: 0.2,
          territoryColors: { useCustomColors: false, opacity: 35 },
          showDisputedTerritories: true, showMaritimeBorders: false, labelVisibility: 60, highlightOnHover: true,
        },
      },
    }));
    renderHarness();
    expect(text('style')).toBe('classic');
    expect(text('opacity')).toBe(String(TERRITORY_STYLE_DEFAULTS.classic.fillOpacity));
    expect(text('quiet-opacity')).toBe('35');
    fireEvent.click(screen.getByText('quiet'));
    expect(text('opacity')).toBe('35');
  });

  it('saves the style and what was changed in it', async () => {
    renderHarness();
    fireEvent.click(screen.getByText('quiet'));
    fireEvent.click(screen.getByText('opacity 30'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.version).toBe(7);
    expect(stored.data.nationalTerritories.style).toBe('quiet');
    expect(stored.data.nationalTerritories.styleSettings).toEqual({ quiet: { fillOpacity: 30 } });
  });

  it('stores a change to any of the screen style\'s settings as that style\'s own, only what differs', async () => {
    renderHarness();
    fireEvent.click(screen.getByText('shade and colour'));
    expect(text('shading')).toBe('40');
    expect(text('settled-colour')).toBe('cyan');
    fireEvent.click(screen.getByText('quiet'));
    expect(text('shading')).toBe('100');
    expect(text('settled-colour')).toBe('pale');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.data.nationalTerritories.styleSettings).toEqual({ classic: { shading: 40, borderColours: { international: 'cyan' } } });
  });
});
