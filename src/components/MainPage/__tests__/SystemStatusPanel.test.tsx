/**
 * The status panel the strip opens (decision D-F, step 3.4).
 *
 * It holds every readout, including the ones no screen carries any more: route mode,
 * the Solana link, chain telemetry, auth posture, operator diagnostics, nav history
 * and mission lane. Nothing was retired when the strip stopped showing them.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const ALL = [
  { id: 'timestamp', label: 'MISSION TIME', value: '17:04:12Z' },
  { id: 'mission-lane', label: 'MISSION LANE', value: 'CASES' },
  { id: 'presentation-mode', label: 'ROUTE MODE', value: 'STANDALONE' },
  { id: 'network-posture', label: 'SOLANA', value: 'DEVNET LINK UP' },
  { id: 'network-telemetry', label: 'CHAIN TELEMETRY', value: '138 TPS | BLK 486' },
  { id: 'auth-posture', label: 'AUTH POSTURE', value: 'AUTH DISCONNECTED' },
  { id: 'nostr-relays', label: 'NOSTR RELAYS', value: '4/5 UP' },
  { id: 'operator-diagnostics', label: 'OPERATOR DIAG', value: 'NOMINAL' },
  { id: 'navigation-depth', label: 'NAV HISTORY', value: '3 APPS THIS SESSION' },
];

vi.mock('../usePrimaryMarqueeData', () => ({
  usePrimaryMarqueeData: () => ({ title: 'Cases', signals: [], allSignals: ALL }),
}));

import SystemStatusPanel from '../SystemStatusPanel';

describe('SystemStatusPanel', () => {
  it('lists every readout, label and value', () => {
    render(<SystemStatusPanel onClose={() => {}} />);

    for (const signal of ALL) {
      expect(screen.getByText(signal.label), signal.label).toBeTruthy();
      expect(screen.getByText(signal.value), signal.value).toBeTruthy();
    }
  });

  it('holds the readouts no screen carries any more', () => {
    render(<SystemStatusPanel onClose={() => {}} />);

    for (const label of ['ROUTE MODE', 'SOLANA', 'CHAIN TELEMETRY', 'AUTH POSTURE', 'OPERATOR DIAG', 'NAV HISTORY', 'MISSION LANE']) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });

  it('closes when asked', () => {
    const onClose = vi.fn();
    render(<SystemStatusPanel onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
