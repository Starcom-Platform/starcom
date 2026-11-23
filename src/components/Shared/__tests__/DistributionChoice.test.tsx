/**
 * Who may receive a case or a mission, asked with nothing chosen in advance
 * (plan item 0.5, decision D2), and, where it cannot be changed, why not and
 * what to do instead (plan item 9.13): a control that is greyed out and still
 * says "Choose one" asks for something nobody can give.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DistributionChoice from '../DistributionChoice';
import { joinedRelays, joinRelay, leaveRelay } from '../../../services/nostr/joinedRelays';

const radios = () => screen.getAllByRole('radio') as HTMLInputElement[];

describe('DistributionChoice', () => {
  it('asks, with nothing chosen in advance', () => {
    render(<DistributionChoice value={undefined} onChange={vi.fn()} what="case" testId="d" />);
    expect(screen.getByTestId('d-consequence').textContent).toBe('Choose one. Nothing is published until someone does.');
    expect(radios().some((r) => r.checked)).toBe(false);
    expect(radios().some((r) => r.disabled)).toBe(false);
  });

  it('where it cannot be changed, says why instead of asking, and takes no choice', () => {
    render(<DistributionChoice value={undefined} onChange={vi.fn()} what="mission" lockedBecause="Its package is locked, so move it back to Planning to choose." testId="d" />);
    expect(screen.getByTestId('d-consequence').textContent).toBe('Its package is locked, so move it back to Planning to choose.');
    expect(radios().every((r) => r.disabled)).toBe(true);
  });

  it('where a choice made cannot be changed, says why, and still what it does', () => {
    render(
      <DistributionChoice
        value="limited" onChange={vi.fn()} what="mission" testId="d"
        consequence="Goes to wss://relay.internal.example."
        lockedBecause="Its package is locked, so move it back to Planning to change it."
      />,
    );
    expect(screen.getByTestId('d-consequence').textContent).toBe('Its package is locked, so move it back to Planning to change it. Goes to wss://relay.internal.example.');
    expect(radios().find((r) => r.value === 'limited')?.checked).toBe(true);
  });

  it('shows the chip for what is chosen, beside the question', () => {
    const { rerender } = render(<DistributionChoice value={undefined} onChange={vi.fn()} what="case" testId="d" />);
    const chip = () => within(screen.getByTestId('d')).getByTestId('distribution-chip');
    expect(chip().getAttribute('data-distribution')).toBe('undecided');
    rerender(<DistributionChoice value="limited" onChange={vi.fn()} what="case" testId="d" />);
    expect(chip().getAttribute('data-distribution')).toBe('limited');
  });

  // BD16: a report may wait. The choice is still asked, with nothing chosen in
  // advance; waiting is said as a choice of its own rather than left as a blank.
  it('where a record may wait, offers Decide later, held until someone chooses', () => {
    const onChange = vi.fn();
    const onDecideLater = vi.fn();
    const { rerender } = render(
      <DistributionChoice value={undefined} onChange={onChange} onDecideLater={onDecideLater} what="report"
        consequence="Nothing is sent until someone decides." testId="d" />,
    );
    expect(radios().map((r) => r.value)).toEqual(['public', 'limited', 'private', '']);
    expect(radios().filter((r) => r.checked).map((r) => r.value)).toEqual(['']);
    expect(screen.getByRole('radio', { name: /^Decide later/ })).toBeTruthy();
    expect(screen.getByTestId('d-consequence').textContent).toBe('Nothing is sent until someone decides.');

    fireEvent.click(screen.getByRole('radio', { name: /^Limited/ }));
    expect(onChange).toHaveBeenLastCalledWith('limited');
    rerender(
      <DistributionChoice value="limited" onChange={onChange} onDecideLater={onDecideLater} what="report"
        consequence="Goes to the people you name." testId="d" />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /^Decide later/ }));
    expect(onDecideLater).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('where it may not wait, offers no Decide later', () => {
    render(<DistributionChoice value={undefined} onChange={vi.fn()} what="case" testId="d" />);
    expect(radios().map((r) => r.value)).toEqual(['public', 'limited', 'private']);
  });

  describe('under Limited, the teams it also goes to (LW1)', () => {
    const TEAM = 'wss://relay.newark-desk.example';
    const KEY = '9'.repeat(64);
    const boxes = () => screen.queryAllByRole('checkbox') as HTMLInputElement[];
    const reset = () => { for (const r of joinedRelays()) leaveRelay(r.url); };

    it('offers each joined team relay, none ticked in advance, and passes on what is ticked', () => {
      reset();
      joinRelay({ url: TEAM, relayPubkey: KEY, team: 'Newark desk' });
      joinRelay({ url: 'wss://relay.second.example', relayPubkey: KEY, team: 'Second team' });
      const onTeams = vi.fn();
      render(<DistributionChoice value="limited" onChange={vi.fn()} what="mission" testId="d" teams={{ chosen: [], onChange: onTeams }} />);
      expect(screen.getByTestId('d-teams')).toHaveTextContent('Also to a team you joined, on its own relay:');
      expect(screen.getByLabelText('Newark desk (relay.newark-desk.example)')).not.toBeChecked();
      expect(boxes().some((b) => b.checked)).toBe(false);
      fireEvent.click(screen.getByLabelText('Newark desk (relay.newark-desk.example)'));
      expect(onTeams).toHaveBeenCalledWith([TEAM]);
      reset();
    });

    it('shows what is picked, and unticks it', () => {
      reset();
      joinRelay({ url: TEAM, relayPubkey: KEY, team: 'Newark desk' });
      const onTeams = vi.fn();
      render(<DistributionChoice value="limited" onChange={vi.fn()} what="case" testId="d" teams={{ chosen: [`${TEAM}/`], onChange: onTeams }} />);
      expect(screen.getByLabelText('Newark desk (relay.newark-desk.example)')).toBeChecked();
      fireEvent.click(screen.getByLabelText('Newark desk (relay.newark-desk.example)'));
      expect(onTeams).toHaveBeenCalledWith([]);
      reset();
    });

    it('offers no teams under Public or Private, with none joined, or where teams are not asked for', () => {
      reset();
      const { rerender } = render(<DistributionChoice value="limited" onChange={vi.fn()} what="mission" testId="d" teams={{ chosen: [], onChange: vi.fn() }} />);
      expect(screen.queryByTestId('d-teams')).toBeNull();
      joinRelay({ url: TEAM, relayPubkey: KEY, team: 'Newark desk' });
      rerender(<DistributionChoice value="public" onChange={vi.fn()} what="mission" testId="d" teams={{ chosen: [], onChange: vi.fn() }} />);
      expect(screen.queryByTestId('d-teams')).toBeNull();
      rerender(<DistributionChoice value="limited" onChange={vi.fn()} what="report" testId="d" />);
      expect(screen.queryByTestId('d-teams')).toBeNull();
      reset();
    });
  });
});

