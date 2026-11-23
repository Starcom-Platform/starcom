/**
 * The claims this node published, each with what came back about it (plan
 * item 5.1): refutations, other nodes on the same subject and attribute, and
 * the reviews, in one place. Claims were listed only once someone had refuted
 * them, so one nobody had argued with had nowhere to be reviewed.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('@mui/icons-material/ExpandMore', () => ({ default: () => null }));
vi.mock('@mui/icons-material/ExpandLess', () => ({ default: () => null }));

const state = vi.hoisted(() => ({
  live: [] as unknown[],
  contested: [] as unknown[],
  sameSlot: {} as Record<string, number>,
  listeners: new Set<() => void>(),
}));
vi.mock('../../state/CorrelationContext', () => ({ useCorrelation: () => ({ contested: state.contested }) }));
vi.mock('../../../../services/intel/findings/PublishedFindingsLedger', () => ({
  publishedFindingsLedger: {
    live: () => state.live,
    subscribe: (l: () => void) => { state.listeners.add(l); return () => { state.listeners.delete(l); }; },
  },
}));
vi.mock('../../../../services/intel/federation/FederationIngestService', () => ({
  federationIngestService: { store: { forSlot: (slot: string) => Array.from({ length: state.sameSlot[slot] ?? 0 }) } },
}));
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));

import PublishedClaimsPanel from '../PublishedClaimsPanel';

const KEY = 'f'.repeat(64);
const entry = (subjectRef: string, attribute: string, over: Record<string, unknown> = {}) => ({
  slot: `${encodeURIComponent(subjectRef)}:${encodeURIComponent(attribute)}`,
  content: { claim: { subjectRef, attribute }, publishedAt: '2026-09-27T00:00:00Z' },
  publishedAt: '2026-09-27T00:00:00Z', confirmedAt: '2026-09-27T00:00:00Z',
  eventId: 'e'.repeat(64), nostrPubkey: KEY, authorPubkey: 'ml-dsa', ...over,
});

beforeEach(() => {
  state.live = [entry('MV Northwind', 'location'), entry('Berth 4', 'activity', { nostrPubkey: undefined })];
  state.contested = [
    { subjectRef: 'MV Northwind', attribute: 'location', authorPubkey: 'ml-dsa', mine: true, state: 'refuted', refutations: 2, grounds: ['contradicting-observation'] },
    // A peer's claim on the same subject and attribute, argued with: not ours.
    { subjectRef: 'Berth 4', attribute: 'activity', authorPubkey: 'peer', mine: false, state: 'contested', refutations: 1, grounds: ['method'] },
  ];
  state.sameSlot = { 'MV%20Northwind:location': 3 };
});

describe('PublishedClaimsPanel', () => {
  it('lists each claim this node published, with what came back about it', () => {
    render(<PublishedClaimsPanel />);
    const northwind = screen.getByTestId('published-claim-MV%20Northwind:location');
    expect(northwind.textContent).toMatch(/MV Northwind — location/);
    expect(northwind.textContent).toMatch(/refuted/);
    expect(northwind.textContent).toMatch(/2 refutations/);
    expect(northwind.textContent).toMatch(/3 other nodes published about the same subject and attribute/);
    const berth = screen.getByTestId('published-claim-Berth%204:activity');
    expect(berth.textContent).toMatch(/Nobody has disputed this yet\./);
  });

  it('opens a claim\'s reviews, and says why one published before its address was kept cannot be reviewed', async () => {
    render(<PublishedClaimsPanel />);
    fireEvent.click(within(screen.getByTestId('published-claim-MV%20Northwind:location')).getByRole('button', { name: /Reviews/ }));
    expect(await screen.findByTestId('published-claim-reviews')).toBeTruthy();
    const berth = screen.getByTestId('published-claim-Berth%204:activity');
    expect(within(berth).queryByRole('button', { name: /Reviews/ })).toBeNull();
    expect(berth.textContent).toMatch(/cannot be reviewed/i);
  });

  it('shows nothing when nothing has been published', () => {
    state.live = [];
    const { container } = render(<PublishedClaimsPanel />);
    expect(container.textContent).toBe('');
  });

  it('shows a claim as soon as it is published, and drops one once withdrawn', async () => {
    const { act } = await import('@testing-library/react');
    state.live = [entry('MV Northwind', 'location')];
    render(<PublishedClaimsPanel />);
    act(() => {
      state.live = [entry('MV Northwind', 'location'), entry('Berth 4', 'activity')];
      state.listeners.forEach((l) => l());
    });
    expect(screen.getByTestId('published-claim-Berth%204:activity')).toBeTruthy();
    act(() => {
      state.live = [entry('Berth 4', 'activity')];
      state.listeners.forEach((l) => l());
    });
    expect(screen.queryByTestId('published-claim-MV%20Northwind:location')).toBeNull();
  });
});
