/**
 * An objective is given to a person, and rests on a record, chosen from the
 * mission (plan item 2.5, stories S16 and S17). "Claimed by" was typed in, so
 * nobody could tell a teammate from a typo; "Rests on" asked for "a report or
 * finding id", which nobody has to hand.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MissionObjectives } from '../MissionObjectives';
import type { MissionObjective } from '../../../../types/intel/MissionUI';

vi.mock('../../../../components/Identity/KeyName', () => ({
  default: ({ pubkey }: { pubkey: string }) => <span>{({ [AISHA]: 'Aisha', [PRIYA]: 'Priya' } as Record<string, string>)[pubkey] ?? 'npub1unknown'}</span>,
}));

const AISHA = 'a'.repeat(64);
const PRIYA = 'b'.repeat(64);
const bare = (over: Partial<MissionObjective> = {}): MissionObjective => ({ id: 'o1', description: 'Photograph the cranes', completed: false, ...over });
const open = (objective: MissionObjective, onPatch = vi.fn()) => {
  render(
    <MissionObjectives
      objectives={[objective]} busy={false} onToggle={vi.fn()} onRemove={vi.fn()} onPatch={onPatch}
      people={[AISHA, PRIYA]}
      evidence={[{ id: 'intel-1', label: 'Report: Berth 4 cranes at night' }, { id: 'intelcase-1', label: 'Case: Night loading at berth 4' }]}
    />,
  );
  fireEvent.click(screen.getByTestId('objective-expand-o1'));
  return onPatch;
};
const choose = (label: RegExp, option: RegExp) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
};

describe('MissionObjectives — who it is given to, and what it rests on', () => {
  it('gives an objective to someone on the mission, by name, and records their key', () => {
    const onPatch = open(bare());
    choose(/Claimed by/, /^Priya$/);
    expect(onPatch).toHaveBeenCalledWith('o1', { claimedBy: PRIYA });
  });

  it('names who it was given to', () => {
    open(bare({ claimedBy: AISHA }));
    expect(within(screen.getByTestId('objective-o1')).getByText(/claimed by/).textContent).toMatch(/claimed by Aisha/);
  });

  it('rests an objective on one of the mission\'s records, chosen by what it is called', () => {
    const onPatch = open(bare());
    choose(/Rests on/, /Case: Night loading at berth 4/);
    expect(onPatch).toHaveBeenCalledWith('o1', { evidenceRef: 'intelcase-1' });
    expect(screen.queryByText(/report or finding id/i)).toBeNull();
  });

  it('keeps what was typed in before, and shows it', () => {
    open(bare({ claimedBy: 'Marcus', evidenceRef: 'finding-7' }));
    expect(screen.getByRole('combobox', { name: /Claimed by/ }).textContent).toMatch(/Marcus/);
    expect(screen.getByRole('combobox', { name: /Rests on/ }).textContent).toMatch(/finding-7/);
  });
});
