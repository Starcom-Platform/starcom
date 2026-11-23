/**
 * Reporting back on a taken mission (decision D-MF, MF11–MF13): a whole number for each count it asks for, sent
 * only through the publish review; the reports sent listed with their day, how many relays took each and where
 * each stands by NavCom's rules (§5.3); and nothing offered for a mission that names no counts.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { takenMissions, type TakeInput } from '../../../../services/intel/received/takenMissions';

const review = vi.hoisted(() => ({ calls: [] as Array<{ key: string; values: Record<string, number> }>, outcome: { status: 'sent', result: { relays: 2 } } as unknown }));
vi.mock('../../../../services/publishing/missionReports', () => ({
  reviewMissionReport: vi.fn(async (mission: { key: string }, values: Record<string, number>) => {
    review.calls.push({ key: mission.key, values });
    if (review.outcome instanceof Error) throw review.outcome;
    return review.outcome;
  }),
}));

// The labels on a mission, as a relay would deliver them; nothing reaches a network.
const ingest = vi.hoisted(() => ({ started: [] as Array<{ coordinates: string[]; words: readonly string[] }>, listeners: new Set<(label: unknown) => void>() }));
vi.mock('../../../../services/intel/MissionLabelIngest', () => ({
  MissionLabelIngest: class {
    subscribe(listener: (label: unknown) => void) { ingest.listeners.add(listener); return () => ingest.listeners.delete(listener); }
    start(coordinates: string[], words: readonly string[] = []) { ingest.started.push({ coordinates, words }); }
    stop() { /* nothing opened */ }
  },
}));

import TakenMissionsList from '../TakenMissionsList';
import type { MissionLabel } from '../../../../services/intel/missionLabels';

const SIGNER = 'a'.repeat(64);
const NALOXONE: TakeInput = {
  key: `${SIGNER}:starcom_mission_package_field-naloxone-nm`, coordinate: `30079:${SIGNER}:starcom_mission_package_field-naloxone-nm`,
  signer: SIGNER, packageId: 'field-naloxone-nm', relay: 'wss://record.example',
  title: 'Put naloxone in more pockets and first-aid kits in New Mexico.', where: 'field',
  counts: [{ id: 'kits', label: 'Naloxone kits carried or placed' }, { id: 'trainings', label: 'Trainings run' }],
  steps: [{ id: 's1', ask: 'Get naloxone.' }],
};
const NOW = Date.parse('2026-10-16T12:00:00Z');

beforeEach(() => { takenMissions.reset(); review.calls.length = 0; review.outcome = { status: 'sent', result: { relays: 2 } }; ingest.started.length = 0; ingest.listeners.clear(); });

const open = () => {
  render(<TakenMissionsList now={NOW} />);
  fireEvent.click(screen.getByTestId('report-back-open'));
  return screen.getByTestId('report-back-form');
};

describe('ReportBack', () => {
  it('offers nothing for a mission that names no counts', () => {
    takenMissions.take({ ...NALOXONE, counts: [] });
    render(<TakenMissionsList now={NOW} />);
    expect(screen.getByTestId('taken-mission')).toBeInTheDocument();
    expect(screen.queryByTestId('report-back')).toBeNull();
  });

  it('says reports are paused, and offers no form, when the publisher\'s key is exposed (NavCom §5.0)', () => {
    const exposed = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
    takenMissions.take({ ...NALOXONE, key: `${exposed}:x`, coordinate: `30079:${exposed}:x`, signer: exposed });
    render(<TakenMissionsList now={NOW} />);
    expect(screen.getByTestId('report-paused')).toHaveTextContent(
      'Reports to its publisher are paused. The key it posted this under was exposed on 28 Sep 2026, so a sealed report could show who sent it. They resume when its new key starts.',
    );
    expect(screen.queryByTestId('report-back-open')).toBeNull();
  });

  it('asks a whole number for each count it names, says it is sealed and claims nothing, and sends only what is given', async () => {
    takenMissions.take(NALOXONE);
    const form = open();
    expect(form).toHaveTextContent('Counts only, sealed to its publisher: nobody else can read it, and it claims nothing.');
    expect(within(form).getByLabelText('Naloxone kits carried or placed')).toBeInTheDocument();
    expect(within(form).getByLabelText('Trainings run')).toBeInTheDocument();
    const send = screen.getByTestId('report-back-send');
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByTestId('report-count-kits'), { target: { value: '3' } });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(screen.queryByTestId('report-back-form')).toBeNull());
    expect(review.calls).toEqual([{ key: NALOXONE.key, values: { kits: 3 } }]);
  });

  it('will not send a count that is not a whole number, 0 or more', () => {
    takenMissions.take(NALOXONE);
    const form = open();
    for (const bad of ['-1', '1.5', 'three']) {
      fireEvent.change(screen.getByTestId('report-count-kits'), { target: { value: bad } });
      expect(screen.getByTestId('report-back-send')).toBeDisabled();
      expect(form).toHaveTextContent('Give at least one count: a whole number, 0 or more.');
    }
    fireEvent.change(screen.getByTestId('report-count-kits'), { target: { value: '0' } });
    expect(screen.getByTestId('report-back-send')).toBeEnabled();
    expect(form).not.toHaveTextContent('Give at least one count');
  });

  it('keeps the form, and says why, when the review refuses or nothing took it', async () => {
    takenMissions.take(NALOXONE);
    open();
    fireEvent.change(screen.getByTestId('report-count-kits'), { target: { value: '3' } });
    review.outcome = { status: 'refused', reason: 'Sign in to send.' };
    fireEvent.click(screen.getByTestId('report-back-send'));
    expect(await screen.findByTestId('report-not-sent')).toHaveTextContent('Not sent: Sign in to send.');
    review.outcome = new Error('No relay took it: 503');
    fireEvent.click(screen.getByTestId('report-back-send'));
    await waitFor(() => expect(screen.getByTestId('report-not-sent')).toHaveTextContent('Not sent: No relay took it: 503'));
    expect(screen.getByTestId('report-count-kits')).toHaveValue('3');
  });

  it('closes on cancel, sending nothing', () => {
    takenMissions.take(NALOXONE);
    open();
    fireEvent.change(screen.getByTestId('report-count-kits'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('report-back-form')).toBeNull();
    expect(review.calls).toEqual([]);
  });

  it('lists each report sent, its day, its counts by name and how many relays took it', () => {
    takenMissions.take(NALOXONE);
    takenMissions.addReport(NALOXONE.key, { day: '2026-10-15', values: { kits: 3, trainings: 1 }, sentAt: '2026-10-15T20:00:00.000Z', relays: 2 });
    takenMissions.addReport(NALOXONE.key, { day: '2026-10-16', values: { kits: 1 }, sentAt: '2026-10-16T08:00:00.000Z', relays: 1 });
    render(<TakenMissionsList now={NOW} />);
    const sent = screen.getAllByTestId('report-sent').map((el) => el.textContent);
    expect(sent).toEqual([
      'Reported 15 Oct 2026: Naloxone kits carried or placed 3 · Trainings run 1 · 2 relays took it',
      'Reported 16 Oct 2026: Naloxone kits carried or placed 1 · 1 relay took it',
    ]);
  });

  it('says where each report stands, read from the labels on its mission by word, never by report (NavCom §5.3)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    try {
      const id = 'f'.repeat(64);
      const challenger = 'd'.repeat(64);
      takenMissions.take(NALOXONE);
      takenMissions.addReport(NALOXONE.key, { day: '2026-10-16', values: { kits: 1 }, sentAt: '2026-10-16T08:00:00.000Z', relays: 1, id, author: 'b'.repeat(64) });
      render(<TakenMissionsList now={NOW} />);
      expect(ingest.started).toEqual([{ coordinates: [NALOXONE.coordinate], words: ['settled', 'witnessed', 'challenged'] }]);
      expect(screen.getByTestId('report-sent')).toHaveTextContent('1 relay took it · settles by itself on 23 Oct 2026');
      const label = (pubkey: string, value: MissionLabel['value']): MissionLabel =>
        ({ id: `${value}-${pubkey.slice(0, 4)}`, pubkey, value, coordinates: [NALOXONE.coordinate!], report: id, createdAt: NOW / 1000 - 60 });
      act(() => { for (const l of [label(challenger, 'challenged'), label(SIGNER, 'settled')]) ingest.listeners.forEach((tell) => tell(l)); });
      expect(screen.getByTestId('report-sent').textContent).toMatch(/1 relay took it · settled by its publisher · challenged by npub1[0-9a-z]{9}…[0-9a-z]{6}$/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads no labels for a report sent before its id was kept', () => {
    takenMissions.take(NALOXONE);
    takenMissions.addReport(NALOXONE.key, { day: '2026-10-16', values: { kits: 1 }, sentAt: '2026-10-16T08:00:00.000Z', relays: 1 });
    render(<TakenMissionsList now={NOW} />);
    expect(ingest.started).toEqual([]);
    expect(screen.getByTestId('report-sent').textContent).toBe('Reported 16 Oct 2026: Naloxone kits carried or placed 1 · 1 relay took it');
  });
});
