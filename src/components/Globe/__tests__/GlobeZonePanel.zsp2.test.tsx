/**
 * A place under ZSP 2.0, open (decision D-ZR): what it lies in, Terra › Zone › Sector; a Terra listing its Zones; a
 * Zone its system; a Sector its IAU landform, its area and what its edges follow. The test partition stands in.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../geopolitical/zones/zsp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../geopolitical/zones/zsp')>();
  const { testPartition } = await import('../../../geopolitical/zones/__tests__/testPartition');
  const { manifest, files } = testPartition();
  const docs = Object.values(files).map((t) => JSON.parse(t)) as Array<{ features: Array<{ properties: Record<string, unknown> }> }>;
  const low = docs[0].features.find((f) => f.properties.id === 'zone:borea-west/sector:low')!.properties;
  Object.assign(low, { descriptor: 'Planitia', plates: ['Eurasian'], area_km2: 120000 });
  const index = actual.indexFrom(manifest, docs);
  return { ...actual, loadZones: async () => index };
});
vi.mock('../Hooks/useGlobeRegionMarks', () => ({ useLatestReports: () => [] }));

import { GlobeZoneHover, GlobeZonePanel } from '../GlobeZonePanel';
import { resetZonesStoreForTests, selectZonePlace, setZoneHover, setZonesOn } from '../../../features/globe/zones/zonesStore';

const LOW = 'zone:borea-west/sector:low';

describe('GlobeZonePanel, ZSP 2.0', () => {
  beforeEach(() => { resetZonesStoreForTests(); localStorage.clear(); });

  it('a Sector: its landform, its Zone, its plates, its area and what its edges follow', async () => {
    act(() => selectZonePlace(LOW));
    render(<GlobeZonePanel />);
    expect(await screen.findByRole('heading', { name: 'west low' })).toBeTruthy();
    expect(screen.getByText('Sector · Planitia')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Terra Borea west Zone' })).toBeTruthy();
    expect(screen.getByText('Eurasian')).toBeTruthy();
    expect(screen.getByText('120,000 km²')).toBeTruthy();
    expect(screen.getByText('the test grid (the grid)')).toBeTruthy();
  });

  it('a Zone: its system, the Terra it lies in, its two Sectors', async () => {
    act(() => selectZonePlace('zone:borea-west'));
    render(<GlobeZonePanel />);
    expect(await screen.findByText('Zone · shield')).toBeTruthy();
    expect(screen.getByText('Sectors · 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Terra Borea' }));
    expect(await screen.findByText('Terra · A land of the world')).toBeTruthy();
  });

  it('a Terra: its kind, and its Zones, each opening itself', async () => {
    act(() => selectZonePlace('terra:borea'));
    render(<GlobeZonePanel />);
    expect(await screen.findByText('Zones · 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Terra Borea east Zone' }));
    expect(await screen.findByRole('heading', { name: 'Terra Borea east Zone' })).toBeTruthy();
  });

  it('a Mare says it is a sea', async () => {
    act(() => selectZonePlace('mare:austra'));
    render(<GlobeZonePanel />);
    expect(await screen.findByText('Mare · A sea of the world')).toBeTruthy();
  });
});

describe('GlobeZoneHover, ZSP 2.0', () => {
  beforeEach(() => { resetZonesStoreForTests(); localStorage.clear(); });

  it('names the Sector under the pointer, its Zone, and its Terra', async () => {
    act(() => { setZonesOn(true); setZoneHover({ id: LOW, x: 10, y: 10 }); });
    render(<GlobeZoneHover />);
    expect(await screen.findByText('Sector of the Terra Borea west Zone · Terra Borea')).toBeTruthy();
  });
});
