/**
 * With your teams (decision D-RS, RS55): what each joined team is working on, read from its own relay's step
 * labels: how many members are on each mission; one taken here alone worked with them in a click; one not taken
 * yet taken as any mission is. Nothing shown without a joined team, or while no team works anything.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import type { StepLabel } from '../../../../services/roster/stepLabels';

const SIGNER = 'a'.repeat(64);
const YOU = 'b'.repeat(64);
const SAM = 'c'.repeat(64);
const TEAM = { relay: 'wss://team.example.org', name: 'Bay Area crew' };

const watch = vi.hoisted(() => ({ asked: [] as Array<{ relay: string; coordinate: string | null }>, tell: new Map<string, (l: StepLabel[]) => void>() }));
vi.mock('../../../../services/roster/stepLabels', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../services/roster/stepLabels')>();
  return {
    ...real,
    watchStepLabels: (relay: string, coordinate: string | null, h: { onLabels: (l: StepLabel[]) => void }) => {
      watch.asked.push({ relay, coordinate }); watch.tell.set(relay, h.onLabels);
      return () => { watch.tell.delete(relay); };
    },
  };
});
const teams = vi.hoisted(() => ({ list: [] as Array<{ id: string; name: string; relayUrl?: string }> }));
vi.mock('../../../../services/RealTimeTeamService', () => ({ realTimeTeamService: { getTeams: () => teams.list } }));
vi.mock('../../../../services/nostr/joinedRelays', () => ({ isJoinedRelay: (url: string) => url === TEAM.relay }));
vi.mock('../../../../components/Fieldwork/FieldGate', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../TakeMission', () => ({ TakeMission: ({ pkg }: { pkg: AcceptedPackage }) => <button type="button">{`Take on ${pkg.event.tags[0][1]}`}</button> }));

import TeamMissions from '../TeamMissions';
import { takenMissions, takeInputOf } from '../../../../services/intel/received/takenMissions';

const pkg = (d: string): AcceptedPackage => ({
  event: { id: `evt-${d}`, pubkey: SIGNER, created_at: 1_790_000_000, kind: 30079, tags: [['d', d]], content: '', sig: '' },
  check: {
    ok: true,
    manifest: {
      id: d, name: d, version: '1.0.0', description: '', author: 'Mecha Jono', createdAt: '2026-10-16T09:00:00Z',
      license: 'CC-BY-4.0', visibility: 'public', reports: [], intel: [], assets: [], metadata: {}, objectives: [],
    },
  } as AcceptedPackage['check'],
  relay: 'wss://record.example',
});
const SWIFTS = pkg('swifts');
const GAUGES = pkg('gauges');
const at = (p: AcceptedPackage) => takeInputOf(p).coordinate!;
const label = (pubkey: string, coordinate: string, step = 's1', createdAt = 1_792_300_000): StepLabel =>
  ({ id: `${pubkey.slice(0, 2)}-${coordinate.slice(-6)}-${step}`, pubkey, value: 'taken', coordinate, step, createdAt, expiresAt: createdAt + 86_400 });
const tell = (labels: StepLabel[]) => act(() => { watch.tell.get(TEAM.relay)!(labels); });
const row = (text: string) => screen.getAllByTestId('team-mission').find((li) => li.textContent?.includes(text))!;

beforeEach(() => {
  takenMissions.reset();
  watch.asked.length = 0; watch.tell.clear();
  teams.list = [{ id: 't1', name: TEAM.name, relayUrl: TEAM.relay }, { id: 't2', name: 'Not joined', relayUrl: 'wss://other.example.org' }];
});

describe('With your teams', () => {
  it('reads every mission\'s step labels from each joined team\'s relay alone, and shows nothing while none is worked', () => {
    render(<TeamMissions received={[SWIFTS]} />);
    expect(watch.asked).toEqual([{ relay: TEAM.relay, coordinate: null }]);
    expect(screen.queryByTestId('team-missions')).toBeNull();
  });

  it('names what the team is working on and how many are on each, the latest first', () => {
    render(<TeamMissions received={[SWIFTS, GAUGES]} />);
    tell([label(YOU, at(SWIFTS)), label(SAM, at(SWIFTS), 's2', 1_792_300_100), label(SAM, at(GAUGES), 's1', 1_792_300_050)]);
    expect(screen.getByTestId('team-missions-team').textContent).toContain('Bay Area crew is working on these');
    expect(screen.getAllByTestId('team-mission').map((li) => li.textContent)).toEqual([
      expect.stringContaining('2 members on it'), expect.stringContaining('1 member on it'),
    ]);
  });

  it('offers one not taken here to take, as any mission is', () => {
    render(<TeamMissions received={[SWIFTS]} />);
    tell([label(SAM, at(SWIFTS))]);
    expect(within(row('member')).getByRole('button', { name: 'Take on swifts' })).toBeTruthy();
  });

  it('one taken here alone is worked with them in a click, and then says so', () => {
    takenMissions.take(takeInputOf(SWIFTS));
    render(<TeamMissions received={[SWIFTS]} />);
    tell([label(SAM, at(SWIFTS))]);
    fireEvent.click(within(row('member')).getByRole('button', { name: 'Work it with them' }));
    expect(takenMissions.all()[0].team).toEqual(TEAM);
    expect(row('member').textContent).toContain('You are working it with them.');
  });

  it('one worked here with another team is offered to work with this one', () => {
    takenMissions.take(takeInputOf(SWIFTS));
    takenMissions.setTeam(takeInputOf(SWIFTS).key, { relay: 'wss://other.example.org', name: 'Not joined' });
    render(<TeamMissions received={[SWIFTS]} />);
    tell([label(SAM, at(SWIFTS))]);
    expect(within(row('member')).getByRole('button', { name: 'Work it with them' })).toBeTruthy();
  });

  it('says so of a mission not read here', () => {
    render(<TeamMissions received={[]} />);
    tell([label(SAM, at(SWIFTS))]);
    expect(row('member').textContent).toContain('A mission not read here yet.');
    expect(within(row('member')).queryByRole('button')).toBeNull();
  });
});
