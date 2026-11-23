/**
 * Missions' panel on the globe (decision D-MF, step 5; MF16–MF17): the missions done from anywhere at rest;
 * a clicked place's missions instead, with the way back; each opening in full, to take, as the Missions app
 * does; and the note panel leaving a place's missions to it.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../../../services/intel/useMissionLabels', () => ({
  useMissionLabels: () => ({ claims: () => [], answered: false }),
}));
vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));

import type { AcceptedPackage } from '../../../services/intel/MissionPackageIngest';
import { missionsByPlace, openMissionCards } from '../../../services/intel/received/missionPlaces';
import { takenMissions, takeInputOf } from '../../../services/intel/received/takenMissions';
import { closeGlobeNotes, openGlobeNotes } from '../../../features/globe/noteDetail/globeNoteStore';
import { placeNoteSet } from '../Hooks/useGlobeMissions';
import { MissionsGlobePanel } from '../MissionsGlobePanel';
import { GlobeNotePanel } from '../GlobeNotePanel';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const PUBKEY = 'b'.repeat(64);
function pkg(d: string, description: string, profile?: Record<string, unknown>): AcceptedPackage {
  return {
    event: { id: d, pubkey: PUBKEY, created_at: 1_790_000_000, kind: 30079, tags: [['d', d], ['t', 'starcom_mission_package']], content: '{}', sig: '' },
    check: {
      ok: true,
      manifest: {
        id: d, name: d, version: '1.0.0', description, author: 'Mecha Jono', createdAt: '2026-10-16T00:00:00Z', license: 'CC-BY-4.0',
        visibility: 'public', reports: [], intel: [], assets: [], metadata: {}, ...(profile ? { profile } : {}),
        objectives: [{ id: `${d}#0`, ask: 'Get naloxone.', effortMinutes: 30, done: false }],
      },
    } as AcceptedPackage['check'],
    relay: 'wss://record.example',
  };
}
const NALOXONE = pkg('starcom_mission_package_field-naloxone-NM', 'MISSION: Put naloxone in more pockets and first-aid kits in New Mexico.', { fieldWork: { jurisdiction: 'us-nm' } });
const ADVISORY = pkg('starcom_mission_package_ic-icsa-26-272-05', 'MISSION: Get owners of Anjvision YSSD-RTMP-H5 a fix they can use tonight.');
const { places, anywhere } = missionsByPlace(openMissionCards([NALOXONE, ADVISORY], NOW), (code) => (code === 'us-nm' ? { name: 'New Mexico' } : null));

beforeEach(() => { takenMissions.reset(); closeGlobeNotes(); });
afterEach(() => { closeGlobeNotes(); });

describe('MissionsGlobePanel', () => {
  it('lists the missions done from anywhere, and says how many are at places on the globe', () => {
    render(<MissionsGlobePanel places={places} anywhere={anywhere} reading={false} now={NOW} />);
    expect(screen.getByTestId('missions-globe-summary')).toHaveTextContent('1 mission at 1 place on the globe: click a clipboard to see them.');
    const rail = screen.getByTestId('missions-globe-anywhere');
    expect(rail).toHaveTextContent('Can be done from anywhere (1)');
    expect(within(rail).getAllByTestId('missions-globe-row').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Get owners of Anjvision YSSD-RTMP-H5 a fix they can use tonight.'),
    ]);
  });

  it("shows a clicked place's missions instead, the note panel leaving them to it, with the way back", () => {
    render(<><MissionsGlobePanel places={places} anywhere={anywhere} reading={false} now={NOW} /><GlobeNotePanel /></>);
    act(() => { openGlobeNotes(placeNoteSet(places[0])); });
    const place = screen.getByTestId('missions-globe-place');
    expect(place).toHaveTextContent('New Mexico · 1 mission');
    expect(within(place).getAllByTestId('missions-globe-row')).toHaveLength(1);
    expect(screen.queryByTestId('missions-globe-anywhere')).toBeNull();
    expect(screen.queryByTestId('globe-note-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('missions-globe-back'));
    expect(screen.queryByTestId('missions-globe-place')).toBeNull();
    expect(screen.getByTestId('missions-globe-anywhere')).toBeInTheDocument();
  });

  it("stays at rest when another layer's mark is clicked, which the note panel shows", () => {
    render(<MissionsGlobePanel places={places} anywhere={anywhere} reading={false} now={NOW} />);
    act(() => { openGlobeNotes({ heading: 'Lifeboats', notes: [{ id: 's1', kind: 'Lifeboat station', title: 'Tynemouth', text: '', timeMs: null, sources: [] }] }); });
    expect(screen.queryByTestId('missions-globe-place')).toBeNull();
    expect(screen.getByTestId('missions-globe-anywhere')).toBeInTheDocument();
  });

  it('opens a mission in full, to take, as the Missions app does', () => {
    render(<MissionsGlobePanel places={places} anywhere={anywhere} reading={false} now={NOW} />);
    act(() => { openGlobeNotes(placeNoteSet(places[0])); });
    fireEvent.click(within(screen.getByTestId('missions-globe-place')).getByTestId('missions-globe-open'));
    const detail = screen.getByTestId('received-package-detail');
    fireEvent.click(within(detail).getByTestId('mission-take-button'));
    expect(takenMissions.isTaken(takeInputOf(NALOXONE).key)).toBe(true);
  });

  it('marks a mission taken here', () => {
    takenMissions.take(takeInputOf(ADVISORY));
    render(<MissionsGlobePanel places={places} anywhere={anywhere} reading={false} now={NOW} />);
    expect(within(screen.getByTestId('missions-globe-anywhere')).getByTestId('missions-globe-row')).toHaveTextContent('Taken');
  });

  it('says it is reading while nothing has arrived', () => {
    render(<MissionsGlobePanel places={[]} anywhere={[]} reading now={NOW} />);
    expect(screen.getByTestId('missions-globe-panel')).toHaveTextContent('Reading the missions posted…');
    expect(screen.queryByTestId('missions-globe-summary')).toBeNull();
  });
});
