/**
 * What the globe is divided by, from one rail button (decision D-ZR, ZR12): Nation States, Zones, Spheres or none,
 * one at a time, read from the layers' own switches so the button always names what the globe shows.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getZonesState, setZonesOn, selectZonePlace } from '../../../../../features/globe/zones/zonesStore';
import { getSpheresState, setSpheresOn } from '../../../../../features/globe/spheres/spheresStore';
import { getOrganisationsState, resetOrganisationsStoreForTests, setOrganisationsOn } from '../../../../../features/globe/organisations/organisationsStore';
import { divisionOf, switchesFor } from '../../../../../features/globe/divisions/divisions';

const overlay = vi.hoisted(() => ({ nations: true, set: vi.fn((on: boolean) => { overlay.nations = on; }) }));
vi.mock('../../../../../hooks/useVisualizationOverlay', () => ({
  useVisualizationOverlay: () => ({ nationalTerritoriesOverlayEnabled: overlay.nations, setNationalTerritoriesOverlayEnabled: overlay.set }),
}));

import { DivisionPicker } from '../DivisionPicker';

beforeEach(() => { overlay.nations = true; overlay.set.mockClear(); setZonesOn(false); setSpheresOn(false); resetOrganisationsStoreForTests(); localStorage.clear(); });
afterEach(() => { setZonesOn(false); setSpheresOn(false); setOrganisationsOn(false); });

describe('divisionOf', () => {
  it('names the most specific layer on, and none when none is', () => {
    expect(divisionOf({ nations: true, zones: false, spheres: false, organisations: false })).toBe('nations');
    expect(divisionOf({ nations: true, zones: true, spheres: true, organisations: true })).toBe('zones');
    expect(divisionOf({ nations: true, zones: false, spheres: true, organisations: true })).toBe('spheres');
    expect(divisionOf({ nations: true, zones: false, spheres: false, organisations: true })).toBe('organisations');
    expect(divisionOf({ nations: false, zones: false, spheres: false, organisations: false })).toBe('none');
  });

  it('a pick leaves its own layer on and every other off', () => {
    expect(switchesFor('zones')).toEqual({ nations: false, zones: true, spheres: false, organisations: false });
    expect(switchesFor('none')).toEqual({ nations: false, zones: false, spheres: false, organisations: false });
  });
});

describe('DivisionPicker', () => {
  it('opens a picker of the five, the one shown chosen and focused', () => {
    render(<DivisionPicker />);
    fireEvent.click(screen.getByTestId('cyber-right-rail-divisions'));
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual(['Nation States', 'Zones', 'Spheres', 'Organisations›', 'None']);
    expect(screen.getByTestId('cyber-right-rail-division-nations')).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(screen.getByTestId('cyber-right-rail-division-nations'));
  });

  it('draws its menu at the top of the page, outside the rail, so no panel over the rail can cover it', () => {
    const { container } = render(<DivisionPicker />);
    fireEvent.click(screen.getByTestId('cyber-right-rail-divisions'));
    const menu = screen.getByTestId('cyber-right-rail-divisions-menu');
    expect(container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
  });

  it('picking Zones turns the Zones on and the countries and Spheres off, and closes', () => {
    setSpheresOn(true);
    render(<DivisionPicker />);
    fireEvent.click(screen.getByTestId('cyber-right-rail-divisions'));
    fireEvent.click(screen.getByTestId('cyber-right-rail-division-zones'));
    expect(getZonesState().on).toBe(true);
    expect(getSpheresState().on).toBe(false);
    expect(overlay.set).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('cyber-right-rail-divisions-menu')).toBeNull();
  });

  it('None turns all three off', () => {
    setZonesOn(true);
    render(<DivisionPicker />);
    fireEvent.click(screen.getByTestId('cyber-right-rail-divisions'));
    fireEvent.click(screen.getByTestId('cyber-right-rail-division-none'));
    expect(getZonesState().on).toBe(false);
    expect(getSpheresState().on).toBe(false);
    expect(overlay.set).toHaveBeenCalledWith(false);
  });

  it('names a layer turned on elsewhere, as a search opening a Zone does', () => {
    render(<DivisionPicker />);
    expect(screen.getByTestId('cyber-right-rail-divisions')).toHaveAttribute('aria-label', 'The globe divided by: Nation States');
    act(() => { selectZonePlace('zone:east-african-rift'); });
    expect(screen.getByTestId('cyber-right-rail-divisions')).toHaveAttribute('aria-label', 'The globe divided by: Zones');
    act(() => { selectZonePlace(null); });
  });

  it('closes on Escape, and on a press outside it, choosing nothing', () => {
    render(<div><DivisionPicker /><span data-testid="outside">x</span></div>);
    fireEvent.click(screen.getByTestId('cyber-right-rail-divisions'));
    fireEvent.keyDown(screen.getByTestId('cyber-right-rail-divisions-menu'), { key: 'Escape' });
    expect(screen.queryByTestId('cyber-right-rail-divisions-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('cyber-right-rail-divisions'));
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('cyber-right-rail-divisions-menu')).toBeNull();
    expect(overlay.set).not.toHaveBeenCalled();
  });

  it('moves between them with the arrow keys, round from the last to the first', () => {
    render(<DivisionPicker />);
    fireEvent.click(screen.getByTestId('cyber-right-rail-divisions'));
    const menu = screen.getByTestId('cyber-right-rail-divisions-menu');
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByTestId('cyber-right-rail-division-none'));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('cyber-right-rail-division-nations'));
  });
});

describe('DivisionPicker, Organisations', () => {
  beforeEach(() => { overlay.nations = true; overlay.set.mockClear(); setZonesOn(false); setSpheresOn(false); resetOrganisationsStoreForTests(); localStorage.clear(); });

  it('picking Organisations turns to the bodies; picking one shows it alone, the rest off', () => {
    setSpheresOn(true);
    render(<DivisionPicker />);
    fireEvent.click(screen.getByTestId('cyber-right-rail-divisions'));
    fireEvent.click(screen.getByTestId('cyber-right-rail-division-organisations'));
    const bodies = screen.getByTestId('cyber-right-rail-organisations-menu');
    expect(bodies.textContent).toContain('European Union');
    expect(bodies.textContent).toContain('Association of Southeast Asian Nations');
    expect(getOrganisationsState().on).toBe(false);
    fireEvent.click(screen.getByTestId('cyber-right-rail-organisation-asean'));
    expect(getOrganisationsState()).toMatchObject({ on: true, shown: 'union:asean' });
    expect(getSpheresState().on).toBe(false);
    expect(getZonesState().on).toBe(false);
    expect(overlay.set).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('cyber-right-rail-divisions')).toHaveAttribute('aria-label', 'The globe divided by: Organisations: Association of Southeast Asian Nations');
  });

  it('is no taller than the room above its button, so fifteen bodies scroll and Back stays on the page', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 1240, bottom: 520, top: 490, right: 1270, width: 30, height: 30, x: 1240, y: 490, toJSON: () => ({}) });
    try {
      render(<DivisionPicker />);
      fireEvent.click(screen.getByTestId('cyber-right-rail-divisions'));
      fireEvent.click(screen.getByTestId('cyber-right-rail-division-organisations'));
      expect(screen.getByTestId('cyber-right-rail-organisations-menu').style.maxHeight).toBe('512px');
    } finally {
      rect.mockRestore();
    }
  });

  it('Back, or Escape, returns from the bodies to the divisions', () => {
    render(<DivisionPicker />);
    fireEvent.click(screen.getByTestId('cyber-right-rail-divisions'));
    fireEvent.click(screen.getByTestId('cyber-right-rail-division-organisations'));
    fireEvent.click(screen.getByTestId('cyber-right-rail-organisations-back'));
    expect(screen.getByTestId('cyber-right-rail-divisions-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cyber-right-rail-division-organisations'));
    fireEvent.keyDown(screen.getByTestId('cyber-right-rail-organisations-menu'), { key: 'Escape' });
    expect(screen.getByTestId('cyber-right-rail-divisions-menu')).toBeInTheDocument();
  });
});
