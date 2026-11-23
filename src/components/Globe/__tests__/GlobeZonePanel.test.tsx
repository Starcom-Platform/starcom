/**
 * A Zone or a Sector, open (ZSP 1.0): what it is, its ground, its lines' precision,
 * and the reports about it; and the chip naming the place under the pointer.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

vi.mock('../../../geopolitical/zones/zsp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../geopolitical/zones/zsp')>();
  const fsm = await import('node:fs');
  const rift = actual.zoneFrom(JSON.parse(fsm.readFileSync('src/geopolitical/zones/__tests__/zsp-1.0/east-african-rift.zsp.geojson', 'utf8')))!;
  const index = actual.zoneIndexOf([rift]);
  return { ...actual, loadZones: async () => index };
});

const reports: IntelReportUI[] = [
  { id: 'r-afar', title: 'Erta Ale lava lake rising', latitude: 13.6, longitude: 40.67, createdAt: new Date('2026-10-10') } as IntelReportUI,
  { id: 'r-kivu', title: 'Gas readings at Lake Kivu', latitude: -2.05, longitude: 29.15, createdAt: new Date('2026-10-09') } as IntelReportUI,
];
vi.mock('../Hooks/useGlobeRegionMarks', () => ({ useLatestReports: () => reports }));

import { GlobeZoneHover, GlobeZonePanel } from '../GlobeZonePanel';
import { getZonesState, resetZonesStoreForTests, selectZonePlace, setZoneHover } from '../../../features/globe/zones/zonesStore';
import { fill, setLanguage } from '../../../i18n/app/i18n';
import de from '../../../i18n/app/locales/de';

const AFAR = 'zone:east-african-rift/sector:afar-triangle';

describe('GlobeZonePanel', () => {
  beforeEach(() => { resetZonesStoreForTests(); localStorage.clear(); });

  it('shows nothing until a place is opened', () => {
    const { container } = render(<GlobeZonePanel />);
    expect(container.textContent).toBe('');
  });

  it('a Sector: its Zone, its character, its ground, its approximate lines and the intel placed in it', async () => {
    act(() => selectZonePlace(AFAR));
    render(<GlobeZonePanel />);
    expect(await screen.findByRole('heading', { name: 'Afar Triangle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'East African Rift Zone' })).toBeTruthy();
    expect(screen.getByText(/Extreme lowland depression/)).toBeTruthy();
    expect(screen.getByText('Approximate lines')).toBeTruthy();
    expect(screen.getByText('Erta Ale, Dallol, Danakil Depression')).toBeTruthy();
    expect(screen.getByText(/Ethiopia/)).toBeTruthy();
    expect(screen.getByText('Intel in this Sector · 1')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Erta Ale lava lake rising' });
    expect(link.getAttribute('href')).toBe('/r/report/r-afar');
    expect(screen.queryByText('Gas readings at Lake Kivu')).toBeNull();
  });

  it('a Zone: its eight Sectors, each opening itself, and the intel anywhere in it', async () => {
    act(() => selectZonePlace('zone:east-african-rift'));
    render(<GlobeZonePanel />);
    expect(await screen.findByText('Sectors · 8')).toBeTruthy();
    expect(screen.getByText('Anchor Zone · geological frame')).toBeTruthy();
    expect(screen.getByText('Intel in this Zone · 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Afar Triangle' }));
    expect(getZonesState().selected).toBe(AFAR);
  });

  it('names its sources, with what each was used for', async () => {
    act(() => selectZonePlace(AFAR));
    render(<GlobeZonePanel />);
    expect(await screen.findByText('Sources and licences · 2')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'FusionGirl wiki: East African Rift Zone' })).toBeTruthy();
    expect(screen.getByText('For the approximate lines')).toBeTruthy();
  });

  it('closes', async () => {
    act(() => selectZonePlace(AFAR));
    render(<GlobeZonePanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(getZonesState().selected).toBeNull();
  });

  describe('in the reader\'s language', () => {
    afterEach(async () => { await act(() => setLanguage('en', false)); });

    it('speaks the catalogue\'s words, not its own (D-ZS, D-ML)', async () => {
      await act(() => setLanguage('de', false));
      act(() => selectZonePlace(AFAR));
      render(<GlobeZonePanel />);
      expect(await screen.findByText(fill(de.zones.intelIn.sector, { n: 1 }))).toBeTruthy();
      expect(screen.getByText(de.zones.lines.approximate)).toBeTruthy();
      expect(screen.getByRole('button', { name: de.settings.close })).toBeTruthy();
      expect(screen.queryByText('Intel in this Sector · 1')).toBeNull();
    });
  });
});

describe('GlobeZoneHover', () => {
  beforeEach(() => { resetZonesStoreForTests(); localStorage.clear(); });

  it('names the Sector under the pointer, its Zone, and that its lines are approximate', async () => {
    act(() => { selectZonePlace('zone:east-african-rift'); setZoneHover({ id: AFAR, x: 100, y: 200 }); });
    render(<GlobeZoneHover />);
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    expect(screen.getByText('Afar Triangle')).toBeTruthy();
    expect(screen.getByText('Sector of the East African Rift Zone')).toBeTruthy();
    expect(screen.getByText('Approximate lines · click to open')).toBeTruthy();
  });
});
