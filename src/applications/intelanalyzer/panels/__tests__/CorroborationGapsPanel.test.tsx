/**
 * The analysis -> collection loop-back's UI half.
 *
 * FindingsPanel answers "what is corroborated?"; this answers "what is one
 * source away?" — the question that actually sends an analyst back out to
 * collect. What matters here is that the panel hands NetRunner the SUBJECT
 * (so the search is pre-filled) and never offers to publish a gap, because an
 * uncorroborated claim is a prompt for work and not evidence.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CorroborationGapsPanel from '../CorroborationGapsPanel';
import type { CorroborationGap } from '../../state/correlationUtils';
import { buildReadableNames, type ReadableNames } from '../../state/readableNames';
import type { Event } from '../../adapters/eventsAdapter';

const navigateToApp = vi.fn();
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
}));

let gaps: CorroborationGap[] = [];
let names: ReadableNames = buildReadableNames([], []);
vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ corroborationGaps: gaps, names }),
}));

const makeGap = (over: Partial<CorroborationGap> = {}): CorroborationGap => ({
  entityRef: 'Acme Corp',
  attribute: 'jurisdiction',
  value: 'Berlin',
  sourceId: 'registry-a',
  confidence: 0.8,
  observedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

describe('CorroborationGapsPanel', () => {
  beforeEach(() => {
    navigateToApp.mockReset();
    gaps = [];
    names = buildReadableNames([], []);
  });

  it('renders nothing when no claim is thin — an empty panel is just noise', () => {
    const { container } = render(<CorroborationGapsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists a thin claim with its subject, attribute, value and lone source', () => {
    gaps = [makeGap()];
    render(<CorroborationGapsPanel />);

    const gap = screen.getByTestId('corroboration-gap');
    expect(gap.textContent).toContain('Acme Corp');
    expect(gap.textContent).toContain('jurisdiction');
    expect(gap.textContent).toContain('Berlin');
    // The single feed is named so an analyst can judge whether a second is plausible.
    expect(gap.textContent).toContain('registry-a');
  });

  it('hands NetRunner the SUBJECT as its search target', () => {
    gaps = [makeGap({ entityRef: 'Globex Ltd' })];
    render(<CorroborationGapsPanel />);

    fireEvent.click(screen.getByTestId('collect-action'));

    // The entity is the search subject; the attribute is what we want
    // corroborated about it, not a query term.
    expect(navigateToApp).toHaveBeenCalledWith('netrunner', 'standalone', { initialTarget: 'Globex Ltd' });
  });

  it('never offers to publish a gap — it is a prompt for work, not evidence', () => {
    gaps = [makeGap()];
    render(<CorroborationGapsPanel />);

    expect(screen.queryByRole('button', { name: /publish/i })).toBeNull();
  });

  it('flags a gap standing on fabricated data, which is not worth collecting against', () => {
    gaps = [makeGap({ isMock: true })];
    render(<CorroborationGapsPanel />);

    expect(screen.getByTestId('corroboration-gap').textContent).toContain('MOCK');
  });

  it('stays a prompt rather than a backlog, reporting how many it held back', () => {
    gaps = Array.from({ length: 12 }, (_, i) => makeGap({ entityRef: `Corp ${i}` }));
    render(<CorroborationGapsPanel />);

    expect(screen.getAllByTestId('corroboration-gap')).toHaveLength(8);
    expect(screen.getByText(/\+4 more not shown/)).toBeTruthy();
    // The true total stays visible in the header, so the cap never hides scale.
    expect(screen.getByText(/Single-source claims \(12\)/)).toBeTruthy();
  });

  it('reads a registry claim by its names, with each id on hover (plan item 3.6)', () => {
    const LEI = '391200XXYCPAKDL8MN50';
    const ev = (over: Partial<Event>): Event => ({
      id: `e-${over.sourceId}`, title: 't', timestamp: '2026-08-18T00:00:00.000Z', category: 'X', tags: [],
      sourceType: 'OBSERVATION', sourceId: 'x', entityRefs: [LEI], ...over,
    });
    names = buildReadableNames([
      ev({ sourceId: 'g', subjectName: 'Lohner Capital GmbH', claim: { attribute: 'registeredCountry', value: 'DE' } }),
      ev({ sourceId: 'w', claim: { attribute: 'headquartersCity', value: 'Q1726' }, valueLabel: 'Munich', feedId: 'wikidata-cites:Q3509449', feedLabel: 'SIRENE' }),
    ], [{ id: 'gleif', label: 'GLEIF Global LEI Index' }]);
    gaps = [makeGap({ entityRef: LEI, attribute: 'headquartersCity', value: 'Q1726', sourceId: 'wikidata-cites:Q3509449' })];
    render(<CorroborationGapsPanel />);

    const gap = screen.getByTestId('corroboration-gap');
    expect(gap.textContent).toContain('Lohner Capital GmbH');
    expect(gap.textContent).toContain('headquarters city: Munich');
    expect(gap.textContent).toContain('SIRENE');
    for (const id of [LEI, 'Q1726', 'wikidata-cites']) expect(gap.textContent).not.toContain(id);
    // Each id is still there for whoever needs it, on hover.
    expect(screen.getByText('Lohner Capital GmbH').getAttribute('title')).toBe(LEI);
    expect(screen.getByText('Munich').getAttribute('title')).toBe('Q1726');
    expect(screen.getByText('SIRENE').closest('[aria-label]')?.getAttribute('aria-label')).toContain('wikidata-cites:Q3509449');

    // The search still goes out by the id, which names one company exactly.
    fireEvent.click(screen.getByTestId('collect-action'));
    expect(navigateToApp).toHaveBeenCalledWith('netrunner', 'standalone', { initialTarget: LEI });
  });

  it('with no name known, says what kind of id the subject is', () => {
    gaps = [makeGap({ entityRef: '391200XXYCPAKDL8MN50', attribute: 'registeredCountry', value: 'DE', sourceId: 'gleif' })];
    names = buildReadableNames([], [{ id: 'gleif', label: 'GLEIF Global LEI Index' }]);
    render(<CorroborationGapsPanel />);
    const gap = screen.getByTestId('corroboration-gap');
    expect(gap.textContent).toContain('LEI 391200XXYCPAKDL8MN50');
    expect(gap.textContent).toContain('registered country: Germany');
    expect(gap.textContent).toContain('GLEIF Global LEI Index');
  });
});
