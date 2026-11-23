/** A Sphere, open: its states, source, the others where it was opened, and the reports naming it. */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

vi.mock('../../../features/globe/areas/areaShapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../features/globe/areas/areaShapes')>();
  const fsm = await import('node:fs');
  const shapes = actual.areaShapesFrom(JSON.parse(fsm.readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
  return { ...actual, loadAreaShapes: async () => shapes };
});
const reports: IntelReportUI[] = [
  { id: 'r-named', title: 'Commonwealth ministers meet', jurisdictions: ['sphere:anglosphere'], createdAt: new Date('2026-10-10') } as IntelReportUI,
  { id: 'r-ottawa', title: 'Ottawa flood warning', latitude: 45.42, longitude: -75.69, createdAt: new Date('2026-10-09') } as IntelReportUI,
];
vi.mock('../Hooks/useGlobeRegionMarks', () => ({ useLatestReports: () => reports }));

import { GlobeSphereHover, GlobeSpherePanel } from '../GlobeSpherePanel';
import { getSpheresState, resetSpheresStoreForTests, selectSphere, setSphereHover } from '../../../features/globe/spheres/spheresStore';
import { counted, fill, setLanguage } from '../../../i18n/app/i18n';
import de from '../../../i18n/app/locales/de';

describe('GlobeSpherePanel', () => {
  beforeEach(() => { resetSpheresStoreForTests(); localStorage.clear(); });

  it('shows its states, its source, the reports naming it, and a count of those inside', async () => {
    act(() => selectSphere('sphere:anglosphere', ['sphere:anglosphere', 'sphere:francophonie']));
    render(<GlobeSpherePanel />);
    expect(screen.getByRole('heading', { name: 'Anglosphere' })).toBeTruthy();
    expect(screen.getByText('Cultural Sphere · 5 members')).toBeTruthy();
    expect(screen.getByText(/Australia, Canada, United Kingdom, New Zealand, United States/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Commonwealth ministers meet' }).getAttribute('href')).toBe('/r/report/r-named');
    expect(await screen.findByText('1 report is placed inside it.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Francophonie' }));
    expect(getSpheresState()).toMatchObject({ selected: 'sphere:francophonie', also: ['sphere:anglosphere'] });
  });

  it('names the memberships its list counts but does not draw apart from its members (Part 2)', () => {
    act(() => selectSphere('sphere:francophonie'));
    render(<GlobeSpherePanel />);
    expect(screen.getByText(/its 5 associate members and 28 observers are listed, not drawn/)).toBeTruthy();
    const listed = screen.getByText('Listed, not drawn').nextElementSibling!.textContent!;
    expect(listed).toMatch(/^United Arab Emirates, New Caledonia, /);
    expect(screen.getByText('Members').nextElementSibling!.textContent).not.toMatch(/United Arab Emirates/);
  });

  it('closes', () => {
    act(() => selectSphere('sphere:nordic'));
    render(<GlobeSpherePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(getSpheresState().selected).toBeNull();
  });

  describe('in the reader\'s language', () => {
    afterEach(async () => { await act(() => setLanguage('en', false)); });

    it('speaks the catalogue\'s words, counted by the language\'s own rules (D-ZS, D-ML)', async () => {
      await act(() => setLanguage('de', false));
      act(() => selectSphere('sphere:anglosphere'));
      render(<GlobeSpherePanel />);
      const members = counted(de.spheres.members, 5, {}, 'de');
      expect(screen.getByText(fill(de.spheres.eyebrow, { kind: de.spheres.kinds.cultural, members }))).toBeTruthy();
      expect(screen.getByText(de.spheres.membersHeading)).toBeTruthy();
      expect(await screen.findByText(counted(de.spheres.placedInside, 1, {}, 'de'))).toBeTruthy();
      expect(screen.queryByText('Cultural Sphere · 5 members')).toBeNull();
    });
  });
});

describe('GlobeSphereHover', () => {
  beforeEach(() => { resetSpheresStoreForTests(); localStorage.clear(); });

  it('names every Sphere under the pointer, the first most specific', () => {
    act(() => { selectSphere('sphere:lusosphere'); setSphereHover({ codes: ['sphere:anglosphere', 'sphere:francophonie'], x: 10, y: 20 }); });
    render(<GlobeSphereHover />);
    expect(screen.getByText('Anglosphere')).toBeTruthy();
    expect(screen.getByText('Also: Francophonie')).toBeTruthy();
  });
});
