/**
 * Objectives as work, and the honesty rules that go with the extra fields.
 *
 * The risk the new fields introduce is the one D-C removed from the intel
 * popup: five optional values are five chances to show a default where nobody
 * stated anything, and a default reads as an answer. Most of what is pinned
 * here is therefore about what must NOT appear.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MissionObjectives } from '../MissionObjectives';
import type { MissionObjective } from '../../../../types/intel/MissionUI';

const bare = (over: Partial<MissionObjective> = {}): MissionObjective => ({
  id: 'o1', description: 'Read the federal award record', completed: false, ...over,
});

const renderList = (objectives: MissionObjective[], onPatch = vi.fn()) => {
  const onToggle = vi.fn();
  const onRemove = vi.fn();
  render(
    <MissionObjectives
      objectives={objectives} busy={false}
      onToggle={onToggle} onRemove={onRemove} onPatch={onPatch}
    />,
  );
  return { onToggle, onRemove, onPatch };
};

describe('MissionObjectives', () => {
  it('shows no effort or beneficiary for an objective nobody described further', () => {
    renderList([bare()]);
    const row = screen.getByTestId('objective-o1');
    // Matched per element, not against textContent. The chips concatenate —
    // "…record" + "1 h" + "unclaimed" reads as "record1 hunclaimed" — so a
    // word-boundary regex over the whole string silently matches nothing, and
    // the first version of this test passed against a defaulted effort.
    expect(within(row).queryByText(/^\d+(\.\d+)?\s*(min|h)$/)).toBeNull();
    expect(within(row).queryByText(/^The public$/)).toBeNull();
    expect(within(row).queryByText(/^A regulator or enforcement body$/)).toBeNull();
  });

  it('says unclaimed rather than leaving the reader to guess', () => {
    renderList([bare()]);
    expect(within(screen.getByTestId('objective-o1')).getByText('unclaimed')).toBeTruthy();
  });

  it('shows what was stated, and only that', () => {
    renderList([bare({ effortMinutes: 90, beneficiary: 'public', claimedBy: 'Aisha' })]);
    const row = screen.getByTestId('objective-o1');
    expect(within(row).getByText('1.5 h')).toBeTruthy();
    expect(within(row).getByText('The public')).toBeTruthy();
    expect(within(row).getByText('claimed by Aisha')).toBeTruthy();
  });

  it('does not let a tick imply the artifact arrived', () => {
    renderList([bare({ completed: true, expectedArtifact: 'a field note' })]);
    expect(screen.getByTestId('objective-marked-done-o1').textContent)
      .toBe('Marked done by a person. Expected back: a field note');
  });

  it('counts limits, because an unstated limit is not a limit', () => {
    renderList([bare({ limits: ['no contact with subjects', 'public sources only'] })]);
    expect(within(screen.getByTestId('objective-o1')).getByText('2 limits')).toBeTruthy();
  });

  it('edits a field through onPatch', () => {
    const { onPatch } = renderList([bare()]);
    fireEvent.click(screen.getByTestId('objective-expand-o1'));
    fireEvent.change(screen.getByTestId('objective-artifact-o1'), {
      target: { value: 'a reproducible method' },
    });
    expect(onPatch).toHaveBeenCalledWith('o1', { expectedArtifact: 'a reproducible method' });
  });

  it('clears an estimate rather than storing a number nobody meant', () => {
    const { onPatch } = renderList([bare({ effortMinutes: 60 })]);
    fireEvent.click(screen.getByTestId('objective-expand-o1'));
    fireEvent.change(screen.getByTestId('objective-effort-o1'), { target: { value: '' } });
    expect(onPatch).toHaveBeenCalledWith('o1', { effortMinutes: undefined });
  });

  it('keeps limits one per line and drops the blanks', () => {
    const { onPatch } = renderList([bare()]);
    fireEvent.click(screen.getByTestId('objective-expand-o1'));
    fireEvent.change(screen.getByTestId('objective-limits-o1'), {
      target: { value: 'public sources only\n\n  no photography  \n' },
    });
    expect(onPatch).toHaveBeenCalledWith('o1', {
      limits: ['public sources only', 'no photography'],
    });
  });

  it('offers an explicit not-stated choice for who it is for', () => {
    const { onPatch } = renderList([bare({ beneficiary: 'public' })]);
    fireEvent.click(screen.getByTestId('objective-expand-o1'));
    // MUI renders the options only once the select is open.
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^For/ }));
    // Selecting "no stated beneficiary" must be reachable: a field that can be
    // set and never unset traps a wrong answer in the record.
    fireEvent.click(screen.getByText('no stated beneficiary'));
    expect(onPatch).toHaveBeenCalledWith('o1', { beneficiary: undefined });
  });

  it('still says None yet with no objectives', () => {
    renderList([]);
    expect(screen.getByText('None yet.')).toBeTruthy();
  });

  it("names who claimed it and what it rests on to a screen reader, not only by a caption (story S18's Sam)", () => {
    renderList([bare()]);
    fireEvent.click(screen.getByRole('button', { name: /^Show details for "Read the federal award record"/ }));
    expect(screen.getByLabelText('Claimed by')).toBeTruthy();
    expect(screen.getByLabelText(/^Rests on/)).toBeTruthy();
  });
});
