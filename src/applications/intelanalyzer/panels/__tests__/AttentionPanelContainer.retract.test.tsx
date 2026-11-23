/**
 * A withdrawal that did not happen says so on the item (plan item 9.3). It went
 * only to the console, so the claim stood on every relay while the queue looked
 * as though nothing had been tried.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const setState = vi.fn();
const decayed = {
  id: 'decayed:slot-1', subject: 'Vessel at berth 4', subjectKind: 'unknown', reason: 'published-finding-decayed',
  producedBy: 'decayed-finding', caseId: 'case-1', firstSeen: '2026-09-20T00:00:00Z', lastSeen: '2026-09-20T00:00:00Z',
  severity: 0.5, state: 'new', explanation: 'A claim you published has decayed.', evidenceProvenance: 'unknown',
};
vi.mock('../../../../services/intel/attention/useAttentionQueue', () => ({
  useAttentionQueue: () => ({ snapshot: { items: [decayed], hiddenByBudget: 0, actionableCount: 1, failures: [], quiet: false }, setState }),
}));
vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
const reviewRetraction = vi.fn();
vi.mock('../../../../services/publishing/findings', () => ({ reviewRetraction: (...a: unknown[]) => reviewRetraction(...a) }));
vi.mock('../../../../services/intel/attention/setRecordDistribution', () => ({ setRecordDistribution: vi.fn() }));

import AttentionPanelContainer from '../AttentionPanelContainer';

beforeEach(() => { setState.mockReset(); reviewRetraction.mockReset(); });

async function retract() {
  render(<AttentionPanelContainer />);
  fireEvent.click(screen.getByRole('button', { name: 'Retract' }));
}

describe('AttentionPanelContainer — withdrawing a decayed claim', () => {
  it('says no relay took the withdrawal, and that the claim still stands', async () => {
    reviewRetraction.mockResolvedValue({ retracted: false, reason: 'broadcast-failed', broadcast: { success: false, relaysOk: 0, error: 'relay.example: blocked' } });
    await retract();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Not withdrawn: no relay took the withdrawal (relay.example: blocked). The claim still stands on every relay that holds it.',
    );
    expect(setState).not.toHaveBeenCalled();
  });

  it('says why when sending it failed outright', async () => {
    reviewRetraction.mockRejectedValue(new Error('signing was declined'));
    await retract();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Not withdrawn: signing was declined. The claim still stands on every relay that holds it.',
    );
  });

  it('says so when this device has no record of publishing it', async () => {
    reviewRetraction.mockResolvedValue({ retracted: false, reason: 'not-published' });
    await retract();
    expect((await screen.findByRole('alert')).textContent).toBe('Not withdrawn: this device has no record of publishing it.');
  });

  it('retires the item once withdrawn, and says nothing when the review was cancelled', async () => {
    reviewRetraction.mockResolvedValueOnce(null);
    await retract();
    await Promise.resolve();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(setState).not.toHaveBeenCalled();

    reviewRetraction.mockResolvedValueOnce({ retracted: true, broadcast: { success: true, relaysOk: 2 } });
    fireEvent.click(screen.getByRole('button', { name: 'Retract' }));
    await vi.waitFor(() => expect(setState).toHaveBeenCalledWith('decayed:slot-1', 'resolved'));
  });
});
