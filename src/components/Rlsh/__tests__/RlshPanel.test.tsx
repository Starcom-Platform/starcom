/**
 * The RLSH panel (D-RF, RF4, RF6, RF7): the form keeps a draft on this device, three of NavCom's terms at most and
 * never "A crew" yet, a Zone only from the list; the list shows each card by alias with its key's print, its Zone and
 * terms and "Nobody has checked this card", and counts nobody.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReadCard } from '../../../services/rlsh/rlshCard';

const listed = vi.hoisted(() => ({ cards: [] as ReadCard[], status: { loaded: true, error: null as string | null } }));
vi.mock('../../../services/rlsh/rlshRoster', () => ({
  startRlshRead: () => () => undefined,
  rlshCards: () => listed.cards,
  rlshReadStatus: () => listed.status,
  subscribeRlshCards: () => () => undefined,
}));

import { RlshPanel } from '../RlshPanel';
import { openRlshPanel, resetRlshPanelForTests, rlshPanel } from '../../../features/rlsh/rlshPanel';
import { myCard, reloadMyCard } from '../../../services/rlsh/myCard';
import { reloadContactKey } from '../../../services/rlsh/contactKey';
import { openStoryPanel, resetStoryPanelForTests } from '../../../features/story/storyPanel';

const card = (callsign: string, c: string, over: Partial<ReadCard> = {}): ReadCard => ({
  pubkey: c.repeat(64), callsign, doing: null, zone: { id: 'zone:atlas', name: 'Atlas Zone' }, does: ['patrol', 'firstaid'], labels: ['starcom:rlsh'], agent: false, at: 1, ...over,
});

beforeEach(() => {
  localStorage.clear();
  reloadMyCard();
  reloadContactKey();
  resetRlshPanelForTests();
  resetStoryPanelForTests();
  listed.cards = [];
  listed.status = { loaded: true, error: null };
});

describe('RlshPanel', () => {
  it('keeps the draft as it is written, three terms at most and no crew term yet', () => {
    act(() => openRlshPanel('mine'));
    render(<RlshPanel />);
    fireEvent.change(screen.getByTestId('rlsh-alias'), { target: { value: 'Night Beacon' } });
    fireEvent.change(screen.getByTestId('rlsh-doing'), { target: { value: 'Water on the river path.' } });
    for (const id of ['patrol', 'supplies', 'comms', 'search']) fireEvent.click(screen.getByTestId(`rlsh-does-${id}`));
    expect(myCard().draft).toMatchObject({ callsign: 'Night Beacon', doing: 'Water on the river path.', does: ['patrol', 'supplies', 'comms'] });
    expect(screen.getByRole('status')).toHaveTextContent('Three at most');
    expect(screen.queryByTestId('rlsh-does-crew')).toBeNull();
    expect(screen.getByText('116 left')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('rlsh-find-address'));
    expect(myCard().draft.finding).toBe('address');
    expect(screen.getByTestId('rlsh-publish')).toBeEnabled();
  });

  it('takes a Zone only from the list, and holds the publish until one is picked or the field is empty', () => {
    act(() => openRlshPanel('mine'));
    render(<RlshPanel />);
    fireEvent.change(screen.getByTestId('rlsh-alias'), { target: { value: 'Night Beacon' } });
    fireEvent.change(screen.getByTestId('rlsh-zone'), { target: { value: 'Atlantis' } });
    expect(myCard().draft.zone).toBeNull();
    expect(screen.getByTestId('rlsh-publish')).toBeDisabled();
    fireEvent.change(screen.getByTestId('rlsh-zone'), { target: { value: 'atlas zone' } });
    expect(myCard().draft.zone).toEqual({ id: 'zone:atlas', name: 'Atlas Zone' });
    expect(screen.getByTestId('rlsh-publish')).toBeEnabled();
  });

  it('lists the cards by alias with each key\'s print, Zone and terms, unchecked, and counts nobody', () => {
    listed.cards = [card('Atlas Watch', 'a', { agent: true, doing: 'Nights on the ridge.' }), card('Beacon', 'b', { zone: null, does: [] })];
    act(() => openRlshPanel('list'));
    render(<RlshPanel />);
    const rows = screen.getAllByTestId('rlsh-card');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Atlas Watch');
    expect(rows[0]).toHaveTextContent('aaaa aaaa aaaa aaaa');
    expect(rows[0]).toHaveTextContent('Atlas Zone · Patrol and Carries a kit');
    expect(rows[0]).toHaveTextContent('AI agent');
    expect(rows[0]).toHaveTextContent('Nights on the ridge.');
    expect(rows[1]).toHaveTextContent('No Zone given');
    expect(screen.getAllByText('Nobody has checked this card')).toHaveLength(2);
    expect(screen.getByTestId('rlsh-list').textContent).not.toMatch(/\b2\b/);
  });

  it('says it is reading until the relays answer, and there are none yet after', () => {
    listed.status = { loaded: false, error: null };
    act(() => openRlshPanel('list'));
    const { rerender } = render(<RlshPanel />);
    expect(screen.getByText('Reading the relays…')).toBeInTheDocument();
    listed.status = { loaded: true, error: null };
    act(() => openRlshPanel('list'));
    rerender(<RlshPanel />);
    expect(screen.getByText('No cards yet.')).toBeInTheDocument();
  });

  it('is one of the two panels on the left: the Story panel opening closes it, and Esc does', () => {
    act(() => openRlshPanel('mine'));
    render(<RlshPanel />);
    expect(screen.getByTestId('rlsh-panel')).toBeInTheDocument();
    act(() => openStoryPanel(null));
    expect(rlshPanel().open).toBe(false);
    act(() => openRlshPanel('mine'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(rlshPanel().open).toBe(false);
  });
});
