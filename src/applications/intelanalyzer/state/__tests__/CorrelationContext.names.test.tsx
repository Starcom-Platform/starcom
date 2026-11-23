/**
 * The analyzer reads the names its records carry (plan item 3.6): a GLEIF
 * record's legal name reaches the panels through the correlation context, and
 * a registered source is read by its own label. It also grades each claim by
 * the source the ingest registered for it, GLEIF and Wikidata included.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createGleifAdapter } from '../../../../services/intel/observations/adapters/gleifAdapter';
import { buildPlaceResolver } from '../../../../services/intel/observations/placeGazetteer';

const LEI = '391200XXYCPAKDL8MN50';
const gleif = createGleifAdapter(buildPlaceResolver([{ qid: 'Q1726', countryIso: 'DE', names: ['Munich', 'München'] }]));
const observations = gleif.toObservations([{
  attributes: {
    lei: LEI,
    entity: { legalName: { name: 'Lohner Capital GmbH' }, legalAddress: { city: 'München', country: 'DE' } },
    registration: { lastUpdateDate: '2026-03-04T09:12:00Z' },
  },
}]).observations;

vi.mock('../../../../services/intel/observations/registerSources', () => ({ registerObservationSources: () => {} }));
vi.mock('../../../../services/intel/observations/ObservationIngestService', async (original) => ({
  ...(await original<typeof import('../../../../services/intel/observations/ObservationIngestService')>()),
  observationIngestService: {
    ingestAll: async () => ({ observations, coverage: { ok: 1, total: 1, degraded: false } }),
    coverage: () => ({ ok: 1, total: 1, degraded: false }),
    registeredSources: () => [gleif.source],
  },
}));

import { IntelWorkspaceProvider } from '../../../../services/intel/IntelWorkspaceContext';
import { FilterProvider } from '../FilterContext';
import { SelectionProvider } from '../SelectionContext';
import { CorrelationProvider, useCorrelation } from '../CorrelationContext';

const Probe: React.FC = () => {
  const { names } = useCorrelation();
  return (
    <>
      <div data-testid="subject">{names.subject(LEI)}</div>
      <div data-testid="value">{names.value('registeredCity', 'Q1726')}</div>
      <div data-testid="feed">{names.feed('gleif')}</div>
    </>
  );
};

describe('the correlation context reads names from its records', () => {
  it('gives the panels a GLEIF company by its legal name, its city as written, and GLEIF by its label', async () => {
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
    await waitFor(() => expect(screen.getByTestId('subject').textContent).toBe('Lohner Capital GmbH'));
    expect(screen.getByTestId('value').textContent).toBe('München');
    expect(screen.getByTestId('feed').textContent).toBe('GLEIF Global LEI Index');
  });
});

const Grades: React.FC = () => {
  const { corroborationGaps } = useCorrelation();
  const gap = corroborationGaps.find((g) => g.sourceId === 'gleif');
  return <div data-testid="grade">{gap ? `${gap.confidence}|${String(gap.isMock)}` : 'none'}</div>;
};

describe('the correlation context grades a claim by the source the ingest registered', () => {
  it('maps a GLEIF claim as GLEIF, graded A and known to be genuine, not as an unknown source', async () => {
    // Mapped as unknown, it was graded F (0.02 here) and its genuineness was
    // unmeasured, so nothing GLEIF or Wikidata supported could be published.
    render(
      <IntelWorkspaceProvider>
        <FilterProvider>
          <SelectionProvider>
            <CorrelationProvider>
              <Grades />
            </CorrelationProvider>
          </SelectionProvider>
        </FilterProvider>
      </IntelWorkspaceProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('grade').textContent).not.toBe('none'));
    const [confidence, isMock] = (screen.getByTestId('grade').textContent ?? '').split('|');
    expect(isMock).toBe('false');
    expect(Number(confidence)).toBeGreaterThan(0.1);
  });
});
