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

type F = { entityRef: string; attribute: 'location'; value: unknown; confidence: number;
  sourceCount: number; algorithmVersion: number; isMock?: boolean };
let corroboratedFindings: F[] = [];
vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ corroboratedFindings, excludedReports: [], names: NO_NAMES }),
}));
vi.mock('../../../../services/intel/findings/FindingsPublisherService', () => ({ publishFinding: vi.fn() }));
vi.mock('../../../../services/intel/findings/FindingsBroadcastService', () => ({
  findingRelays: () => ['ws://127.0.0.1:7447'],
}));

import FindingsPanel from '../FindingsPanel';
import { buildReadableNames } from '../../state/readableNames';
const NO_NAMES = buildReadableNames([], []);

const base = (over: Partial<F> = {}): F => ({
  entityRef: 'Acme Corp', attribute: 'location', value: { lat: 1, lon: 2 },
  confidence: 0.8, sourceCount: 3, algorithmVersion: 2, ...over,
});

/**
 * publicationPolicy refuses evidence that is not explicitly known-real, and
 * refuses `undefined` as firmly as `true`. The panel used to offer the button
 * anyway and report "Refused" after the click — which teaches an operator that
 * the control is unreliable rather than that their evidence is unmeasured.
 *
 * The mission path has always refused before the click. This is that pattern,
 * applied where it was missing.
 */
describe('FindingsPanel — refusing before the click', () => {
  beforeEach(() => { corroboratedFindings = []; });

  it('offers publishing when provenance is stated as real', () => {
    corroboratedFindings = [base({ isMock: false })];
    render(<FindingsPanel />);
    expect(screen.getByTestId('publish-finding')).not.toBeDisabled();
  });

  it('refuses BEFORE the click when nobody stated whether the evidence is real', () => {
    corroboratedFindings = [base({ isMock: undefined })];
    render(<FindingsPanel />);
    expect(screen.getByTestId('publish-finding')).toBeDisabled();
    // And states the absence without implying its cause — it does NOT say the
    // evidence is fake, because nobody said that either.
    expect(document.body.textContent).toMatch(/No contributor stated whether this evidence is real/);
    expect(document.body.textContent).not.toMatch(/fabricated evidence/);
  });

  it('says something different when provenance IS stated, as fabricated', () => {
    corroboratedFindings = [base({ isMock: true })];
    render(<FindingsPanel />);
    expect(screen.getByTestId('publish-finding')).toBeDisabled();
    expect(document.body.textContent).toMatch(/fabricated evidence/);
    // "unmeasured" and "fabricated" are different claims and must not collapse.
    expect(document.body.textContent).not.toMatch(/No contributor stated/);
  });
});
