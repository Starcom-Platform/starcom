/**
 * An Organisation, open (decision D-ZR, ZR10): its members, the reports naming it by its code or an alias, how many
 * are placed in its members, and where its list was taken from; the chip naming it under the pointer.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const reports: IntelReportUI[] = [
  { id: 'r-eu', title: 'Council adopts a new sanctions package', latitude: 50.8, longitude: 4.35, jurisdictions: ['eu'], createdAt: new Date('2026-10-12') } as IntelReportUI,
  { id: 'r-paris', title: 'Strike in Paris', latitude: 48.86, longitude: 2.35, createdAt: new Date('2026-10-11') } as IntelReportUI,
];
vi.mock('./../Hooks/useGlobeRegionMarks', () => ({ useLatestReports: () => reports }));
vi.mock('../../../features/globe/areas/areaShapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../features/globe/areas/areaShapes')>();
  const fsm = await import('node:fs');
  const shapes = actual.areaShapesFrom(JSON.parse(fsm.readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
  return { ...actual, loadAreaShapes: async () => shapes };
});

import { GlobeOrganisationHover, GlobeOrganisationPanel } from '../GlobeOrganisationPanel';
import {
  getOrganisationsState, resetOrganisationsStoreForTests, setOrganisationHover, showOrganisation,
} from '../../../features/globe/organisations/organisationsStore';

describe('GlobeOrganisationPanel', () => {
  beforeEach(() => { resetOrganisationsStoreForTests(); localStorage.clear(); });

  it('shows nothing until the body shown is opened', () => {
    act(() => showOrganisation('union:eu'));
    const { container } = render(<GlobeOrganisationPanel />);
    expect(container.textContent).toBe('');
  });

  it('the EU, opened: its 27 members, the report naming it by "eu", and the one placed in its members', async () => {
    act(() => showOrganisation('union:eu', true));
    render(<GlobeOrganisationPanel />);
    expect(await screen.findByRole('heading', { name: 'European Union' })).toBeTruthy();
    expect(screen.getByText('Organisation · 27 members')).toBeTruthy();
    expect(screen.getByText(/Germany/)).toBeTruthy();
    expect(screen.getByText('Intel about this Organisation · 1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Council adopts a new sanctions package' }).getAttribute('href')).toBe('/r/report/r-eu');
    expect(await screen.findByText('1 report is placed inside it.')).toBeTruthy();
  });

  it('closes', async () => {
    act(() => showOrganisation('union:eu', true));
    render(<GlobeOrganisationPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(getOrganisationsState().open).toBe(false);
  });
});

describe('GlobeOrganisationPanel, a body with members and others', () => {
  beforeEach(() => { resetOrganisationsStoreForTests(); localStorage.clear(); });

  it('lists its countries that are not members, each with its status and day, apart from its members', async () => {
    const registry = await import('../../../features/globe/areas/areaRegistry');
    const eu = registry.areaByCode('union:eu') as { others?: unknown };
    const listed = eu.others;
    eu.others = [{ code: 'ua', status: 'candidate', since: '2022-06-23' }, { code: 'xk', status: 'potential-candidate' }];
    try {
      act(() => showOrganisation('union:eu', true));
      render(<GlobeOrganisationPanel />);
      expect(await screen.findByText('Not members')).toBeTruthy();
      expect(screen.getByText('Ukraine (candidate, since 2022-06-23), Kosovo (potential candidate)')).toBeTruthy();
    } finally {
      eu.others = listed;
    }
  });
});

describe('GlobeOrganisationHover', () => {
  beforeEach(() => { resetOrganisationsStoreForTests(); localStorage.clear(); });

  it('names the body under the pointer, and that a click opens it', () => {
    act(() => { showOrganisation('union:asean'); setOrganisationHover({ code: 'union:asean', x: 5, y: 5 }); });
    render(<GlobeOrganisationHover />);
    expect(screen.getByText('Association of Southeast Asian Nations')).toBeTruthy();
    expect(screen.getByText('Organisation · click to open')).toBeTruthy();
  });
});
