/**
 * "Taken on" (decision D-MF, MF7–MF10): each mission taken here, a checklist of its steps, its limits at its
 * head, kept on this device; letting one go asks first, since its ticks go too.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedApplicationRouterContext } from '../../../../context/EnhancedApplicationRouterContext';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import { takenMissions, type TakeInput } from '../../../../services/intel/received/takenMissions';
import TakenMissionsList from '../TakenMissionsList';
import MissionCards from '../MissionCards';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const SIGNER = 'a'.repeat(64);
const NALOXONE: TakeInput = {
  key: `${SIGNER}:starcom_mission_package_field-naloxone-nm`, signer: SIGNER, packageId: 'field-naloxone-nm', relay: 'wss://record.example',
  title: 'Put naloxone in more pockets and first-aid kits in New Mexico.', subject: 'Carry naloxone in New Mexico',
  limits: 'Work in pairs. Never confront anyone.', where: 'field', place: { state: 'NM' }, closesAt: NOW + 30 * 86_400_000,
  steps: [{ id: 's1', ask: 'Get naloxone.', effortMinutes: 30 }, { id: 's2', ask: 'Learn the four steps.', effortMinutes: 10 }],
};

beforeEach(() => { takenMissions.reset(); });

describe('TakenMissionsList', () => {
  it('shows nothing until a mission is taken', () => {
    render(<TakenMissionsList now={NOW} />);
    expect(screen.queryByTestId('taken-missions')).toBeNull();
  });

  it('heads each taken mission with its limits, then its steps to tick', () => {
    takenMissions.take(NALOXONE, '2026-10-16T09:00:00Z');
    render(<TakenMissionsList now={NOW} />);
    expect(screen.getByTestId('taken-missions')).toHaveTextContent('Taken on (1)');
    const card = screen.getByTestId('taken-mission');
    expect(within(card).getByRole('heading', { level: 4 })).toHaveTextContent(NALOXONE.title);
    expect(within(card).getByTestId('taken-mission-limits')).toHaveTextContent('Its safety limits');
    expect(within(card).getByTestId('taken-mission-limits')).toHaveTextContent('Work in pairs. Never confront anyone.');
    expect(within(card).getByTestId('taken-mission-progress')).toHaveTextContent('0 of 2 steps done');
    expect(card).toHaveTextContent('New Mexico');
    expect(card).toHaveTextContent('About 40 minutes');
    expect(card).toHaveTextContent('Kept on this device; nobody is told.');
    expect(within(card).queryByTestId('report-back')).toBeNull();
  });

  it('ticks a step done, says when, and counts it; and back', () => {
    takenMissions.take(NALOXONE, '2026-10-16T09:00:00Z');
    render(<TakenMissionsList now={NOW} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Get naloxone.' }));
    expect(takenMissions.get(NALOXONE.key)!.steps[0].done).toBe(true);
    expect(screen.getByTestId('taken-mission-progress')).toHaveTextContent('1 of 2 steps done');
    expect(screen.getByTestId('taken-mission')).toHaveTextContent(/done \d{1,2} \w{3} \d{2}:\d{2}Z/);
    expect(screen.getByTestId('taken-mission')).toHaveTextContent('About 10 minutes');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Get naloxone.' }));
    expect(takenMissions.get(NALOXONE.key)!.steps[0].done).toBe(false);
  });

  it('lets a mission go only once asked twice', () => {
    takenMissions.take(NALOXONE);
    render(<TakenMissionsList now={NOW} />);
    fireEvent.click(screen.getByTestId('mission-let-go'));
    expect(takenMissions.isTaken(NALOXONE.key)).toBe(true);
    expect(screen.getByTestId('mission-let-go-ask')).toHaveTextContent('Let it go? Its ticks go with it.');
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(takenMissions.isTaken(NALOXONE.key)).toBe(true);
    fireEvent.click(screen.getByTestId('mission-let-go'));
    fireEvent.click(screen.getByTestId('mission-let-go-yes'));
    expect(takenMissions.isTaken(NALOXONE.key)).toBe(false);
    expect(screen.queryByTestId('taken-missions')).toBeNull();
  });
});

describe('MissionCards, a mission taken', () => {
  it('marks a taken mission on its card', () => {
    const pkg: AcceptedPackage = {
      event: { id: 'evt-1', pubkey: SIGNER, created_at: 1_790_000_000, kind: 30079, content: '', sig: '', tags: [['d', 'starcom_mission_package_field-naloxone-nm']] },
      check: { ok: true, manifest: { id: 'field-naloxone-nm', name: 'Carry naloxone', version: '1.0.0', description: '', author: 'Mecha Jono', createdAt: '2026-10-16T09:00:00Z', license: 'CC-BY-4.0', visibility: 'public', reports: [], intel: [], assets: [], metadata: {}, objectives: [] } } as AcceptedPackage['check'],
      relay: 'wss://record.example',
    };
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[pkg]} />);
    expect(screen.queryByTestId('mission-card-taken')).toBeNull();
    act(() => { takenMissions.take(NALOXONE); });
    expect(screen.getByTestId('mission-card-taken')).toHaveTextContent('Taken');
  });

  it('once finished, offers a story about it, written in Operations (D-RS, RS51)', () => {
    const navigateToApp = vi.fn();
    const coordinate = `30079:${SIGNER}:starcom_mission_package_field-naloxone-nm`;
    takenMissions.take({ ...NALOXONE, coordinate }, '2026-10-16T09:00:00Z');
    render(
      <EnhancedApplicationRouterContext.Provider value={{ navigateToApp } as never}>
        <TakenMissionsList now={NOW} />
      </EnhancedApplicationRouterContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: 'Write a story about it' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Get naloxone.' }));
    // Half done is not finished.
    expect(screen.queryByRole('button', { name: 'Write a story about it' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Learn the four steps.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write a story about it' }));
    expect(navigateToApp).toHaveBeenCalledWith('teamworkspace', undefined, {
      initialTab: 'operations', storyTitle: `Mission: ${NALOXONE.title}`, storyToward: coordinate,
    });
  });

  it('offers no story where there is nowhere to write it', () => {
    takenMissions.take(NALOXONE, '2026-10-16T09:00:00Z');
    for (const step of NALOXONE.steps) takenMissions.setStepDone(NALOXONE.key, step.id, true);
    render(<TakenMissionsList now={NOW} />);
    expect(screen.queryByTestId('taken-mission-story')).toBeNull();
  });
});
