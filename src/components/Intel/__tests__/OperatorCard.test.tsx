/**
 * An operator's card (D-MX: MX8, MX25, MX26): NavCom's kinds of standing side
 * by side, as this device sees them. Intel as two counts; the kinds Starcom
 * cannot read yet say so; nothing added, ranked or divided.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const readOperatorStanding = vi.hoisted(() => vi.fn());
vi.mock('../../../services/intel/observations/registerSources', () => ({ readOperatorStanding }));

import OperatorCard from '../OperatorCard';

const OPERATOR = 'a'.repeat(64);
const open = () => render(<OperatorCard operator={OPERATOR} label="Kestrel · npub14242…" anchorEl={document.body} onClose={() => {}} />);

beforeEach(() => { readOperatorStanding.mockReset(); });

describe('OperatorCard', () => {
  it("shows NavCom's kinds side by side, Intel as two counts, read for this operator", async () => {
    readOperatorStanding.mockResolvedValue({ submitted: 4, refined: 1 });
    open();
    await waitFor(() => expect(screen.getByTestId('standing-intel').textContent).toBe('4 submitted, 1 refined'));
    expect(readOperatorStanding).toHaveBeenCalledWith(OPERATOR);
    for (const kind of ['honor', 'hours', 'supply']) {
      expect(screen.getByTestId(`standing-${kind}`).textContent).toBe('From settled reports, which Starcom does not read yet.');
    }
    expect(screen.getByTestId('standing-karma').textContent).toBe('From bounties, which Starcom does not read.');
  });

  it('never adds the kinds up, ranks the operator or divides the counts', async () => {
    readOperatorStanding.mockResolvedValue({ submitted: 4, refined: 1 });
    open();
    await waitFor(() => expect(screen.getByTestId('standing-intel').textContent).toContain('submitted'));
    const card = screen.getByTestId('operator-card').textContent ?? '';
    expect(card).not.toMatch(/%|\btotal\b|\brank(ed)? \d|\d\s*\/\s*\d/);
  });

  it('says it is counting, and says so when no relay answered', async () => {
    let fail: (e: Error) => void = () => {};
    readOperatorStanding.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    open();
    await waitFor(() => expect(screen.getByTestId('standing-intel').textContent).toMatch(/^Counting, on the relays Starcom reads/));
    fail(new Error('No relay answered'));
    await waitFor(() => expect(screen.getByTestId('standing-intel').textContent).toBe('No relay Starcom reads answered.'));
  });

  it('reads nothing while closed', async () => {
    render(<OperatorCard operator={OPERATOR} label="Kestrel" anchorEl={null} onClose={() => {}} />);
    // The reader loads on demand, so a read would land after this render: give it the time it would take.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(readOperatorStanding).not.toHaveBeenCalled();
  });
});
