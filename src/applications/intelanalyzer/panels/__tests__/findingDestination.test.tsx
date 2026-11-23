import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@mui/icons-material/ExpandMore', () => ({ default: () => null }));
vi.mock('@mui/icons-material/ExpandLess', () => ({ default: () => null }));

// The panels navigate now; mock the router the same way CorroborationGapsPanel's
// suite does rather than wrapping every panel test in the whole provider.
const navigateToApp = vi.fn();
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
}));

const corroboratedFindings = [{
  entityRef: 'John Smith', attribute: 'location' as const,
  value: { lat: 40.7, lon: -74.0 }, confidence: 0.81, sourceCount: 3, algorithmVersion: 2,
}];
vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ corroboratedFindings, excludedReports: [], names: NO_NAMES }),
}));
vi.mock('../../../../services/intel/findings/FindingsPublisherService', () => ({
  publishFinding: vi.fn(),
}));

let relays: string[] = [];
vi.mock('../../../../services/intel/findings/FindingsBroadcastService', () => ({
  findingRelays: () => relays,
}));

import FindingsPanel from '../FindingsPanel';
import { buildReadableNames } from '../../state/readableNames';
const NO_NAMES = buildReadableNames([], []);

/**
 * Publishing a finding is ONE click from a list — no dialog, no second step —
 * and until now it disclosed nothing about where the finding was going. The
 * mission path has stated its destination for a while; this is the more
 * dangerous of the two and had less to say.
 *
 * Not a cosmetic test: this project has already published something
 * irretrievably to five public relays while believing it was aimed at a local
 * one.
 */
describe('FindingsPanel — where a finding is going', () => {
  beforeEach(() => { relays = []; });

  it('warns, in words, when the destination is public', () => {
    relays = ['wss://relay.damus.io', 'wss://nos.lol'];
    render(<FindingsPanel />);
    const notice = screen.getByTestId('finding-destination');
    expect(notice.textContent).toMatch(/PUBLIC relays/);
    // The consequence, not just the fact.
    expect(notice.textContent).toMatch(/cannot be recalled/);
  });

  it('says plainly when nothing will leave the network', () => {
    relays = ['ws://127.0.0.1:7447'];
    render(<FindingsPanel />);
    const notice = screen.getByTestId('finding-destination');
    expect(notice.textContent).toMatch(/nothing leaves your network/i);
    expect(notice.textContent).not.toMatch(/PUBLIC relays/);
  });

  it('treats one public relay among private ones as public', () => {
    // Over-warning costs a second thought; under-warning costs a publish
    // somebody believed was a sandbox exercise.
    relays = ['ws://127.0.0.1:7447', 'wss://nos.lol'];
    render(<FindingsPanel />);
    expect(screen.getByTestId('finding-destination').textContent).toMatch(/PUBLIC relays/);
  });
});
