/**
 * The Analyzer's correlation context gives the panels NavCom's field
 * observations as the events they are (decision D-MX, MX21), from the same
 * ingest that feeds correlation, and names each operator's feed by the callsign
 * they gave and their key, short. The vocabulary members are invented.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createNavcomAdapter, NAVCOM_OBSERVATION_KIND, NAVCOM_SOURCE } from '../../../../services/intel/observations/adapters/navcomAdapter';

const OPERATOR = 'a'.repeat(64);
const SEEN = Math.floor(Date.now() / 1000) - 3600;
const raw = (id: string, observedAt: number) => ({
  id, kind: NAVCOM_OBSERVATION_KIND, pubkey: OPERATOR, created_at: observedAt + 60, sig: 'f'.repeat(128),
  tags: [['g', 'st-louis'], ['d', 'anchor-one']],
  content: JSON.stringify({
    anchor: 'anchor-one', observed_at: observedAt, tags: ['alpha_one', 'beta_one'], method: 'saw',
    callsign: 'Kestrel', precision: 'area', area: '9yzg',
  }),
});
const observations = createNavcomAdapter({ verifySignature: () => true, vocabulary: () => null })
  .toObservations([raw('1'.repeat(64), SEEN - 600), raw('2'.repeat(64), SEEN)]).observations;

vi.mock('../../../../services/intel/observations/registerSources', () => ({ registerObservationSources: () => {} }));
vi.mock('../../../../services/intel/observations/ObservationIngestService', async (original) => ({
  ...(await original<typeof import('../../../../services/intel/observations/ObservationIngestService')>()),
  observationIngestService: {
    ingestAll: async () => ({ observations, coverage: { ok: 1, total: 1, degraded: false } }),
    coverage: () => ({ ok: 1, total: 1, degraded: false }),
    registeredSources: () => [NAVCOM_SOURCE],
  },
}));

import { IntelWorkspaceProvider } from '../../../../services/intel/IntelWorkspaceContext';
import { FilterProvider } from '../FilterContext';
import { SelectionProvider } from '../SelectionContext';
import { CorrelationProvider, useCorrelation } from '../CorrelationContext';

const Probe: React.FC = () => {
  const { fieldObservations, names } = useCorrelation();
  return (
    <>
      <div data-testid="rows">{fieldObservations.map((r) => `${r.eventId.slice(0, 1)}:${r.seen.join('+')}`).join(',')}</div>
      <div data-testid="feed">{names.feed(OPERATOR)}</div>
    </>
  );
};

describe('the correlation context lists field observations', () => {
  it('one row per event, newest seen first, and the operator named by callsign and key', async () => {
    render(
      <IntelWorkspaceProvider>
        <FilterProvider>
          <SelectionProvider>
            <CorrelationProvider>
              <Probe />
            </CorrelationProvider>
          </SelectionProvider>
        </FilterProvider>
      </IntelWorkspaceProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('rows').textContent).toBe('2:alpha_one+beta_one,1:alpha_one+beta_one'));
    expect(screen.getByTestId('feed').textContent).toMatch(/^Kestrel · npub1/);
  });
});
