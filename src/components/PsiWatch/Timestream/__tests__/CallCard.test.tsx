/**
 * Making a call (decision D-PW, PW56, PW72): the window and the observer's Zone named, a kind and the operative's
 * words, a team whose relay is joined; Seal keeps the call here and opens the review for its fingerprint, a call
 * dropped when the review is cancelled; none sealed once its window has opened.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const reviewed = vi.hoisted(() => ({ outcome: { status: 'sent' } as { status: string; reason?: string }, calls: [] as Array<{ id: string; team: unknown }> }));
vi.mock('../../../../services/publishing/psiCalls', () => ({
  reviewCallSeal: vi.fn(async (id: string, team: unknown) => { reviewed.calls.push({ id, team }); return reviewed.outcome; }),
}));
vi.mock('../../../../services/RealTimeTeamService', () => ({
  realTimeTeamService: { getTeams: () => [{ id: 't1', name: 'Blue Team', relayUrl: 'wss://team.example' }, { id: 't2', name: 'Unjoined', relayUrl: 'wss://other.example' }] },
}));
vi.mock('../../../../services/nostr/joinedRelays', () => ({ isJoinedRelay: (url: string) => url === 'wss://team.example' }));

import CallCard from '../CallCard';
import { getCalls, resetCallsForTests } from '../../../../services/psiWatch/calls';

const NOW = Date.UTC(2026, 9, 28, 2);
const WINDOW = { address: 'w1', title: 'Moon and Mars at change (square)', fromMs: NOW + 86_400_000, untilMs: NOW + 2 * 86_400_000 };
const ZONE = { code: 'zone:levant', name: 'Levant Zone' };

describe('CallCard', () => {
  beforeEach(() => { resetCallsForTests(); reviewed.calls.length = 0; reviewed.outcome = { status: 'sent' }; });

  it('names the window and Zone, offers only joined teams, and seals once words are given', async () => {
    const onDone = vi.fn();
    render(<CallCard window={WINDOW} zone={ZONE} now={NOW} onDone={onDone} />);
    expect(screen.getByRole('dialog').textContent).toContain('Zone: Levant Zone');
    expect(screen.getByRole('option', { name: 'Blue Team' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Unjoined' })).toBeNull();
    const seal = screen.getByRole('button', { name: 'Seal' }) as HTMLButtonElement;
    expect(seal.disabled).toBe(true);
    act(() => { fireEvent.change(screen.getByLabelText('Your words'), { target: { value: 'A strong one on the rift.' } }); });
    expect(seal.disabled).toBe(false);
    await act(async () => { fireEvent.click(seal); });
    expect(reviewed.calls).toHaveLength(1);
    expect(reviewed.calls[0].team).toEqual({ relay: 'wss://team.example', name: 'Blue Team' });
    expect(getCalls()[0].text).toEqual({
      window: { address: 'w1', title: WINDOW.title, start: WINDOW.fromMs / 1000, end: WINDOW.untilMs / 1000 },
      place: { zone: 'zone:levant', name: 'Levant Zone' }, expects: { kind: 'quakes' }, words: 'A strong one on the rift.',
    });
    expect(getCalls()[0].salt).toMatch(/^[0-9a-f]{32}$/);
    expect(onDone).toHaveBeenCalledWith('Sealed: only its fingerprint went to Blue Team');
  });

  it('drops the call when the review is cancelled, and seals none once its window has opened', async () => {
    reviewed.outcome = { status: 'cancelled' };
    const onDone = vi.fn();
    render(<CallCard window={WINDOW} zone={ZONE} now={NOW} onDone={onDone} />);
    act(() => { fireEvent.change(screen.getByLabelText('Your words'), { target: { value: 'x' } }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Seal' })); });
    expect(getCalls()).toEqual([]);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('says so once its window has opened', () => {
    render(<CallCard window={WINDOW} zone={ZONE} now={WINDOW.fromMs + 1} onDone={vi.fn()} />);
    expect(screen.getByRole('dialog').textContent).toContain('This window has opened: a call is sealed before it opens');
    expect((screen.getByRole('button', { name: 'Seal' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
