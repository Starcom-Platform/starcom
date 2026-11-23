/**
 * Previously untested — this fills that gap and covers the edge cases surfaced during
 * the Phase D hardening pass: an isPlanned/rfsYear combination the type system doesn't
 * forbid but shouldn't render literal "undefined", and empty-but-present real string
 * fields that ?? alone wouldn't catch.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { CommHubDetailPopup } from '../CommHubDetailPopup';
import type { CommHubPickResult, SubmarineCable } from '../../../../types/CommHubs';

function makeCable(overrides: Partial<SubmarineCable> = {}): SubmarineCable {
  return {
    id: 'x',
    name: 'X Cable',
    color: '#e63946',
    paths: [[[0, 0], [1, 1]]],
    isPlanned: false,
    rfsYear: 2020,
    landingPoints: [],
    ...overrides
  };
}

describe('CommHubDetailPopup — cable status text', () => {
  it('shows a real in-service year for an active real cable', () => {
    render(<CommHubDetailPopup item={{ type: 'cable', cable: makeCable({ isPlanned: false, rfsYear: 2020 }) }} onClose={vi.fn()} />);
    expect(screen.getByText('Active — in service since 2020')).toBeInTheDocument();
  });

  it('never renders the literal string "undefined" for an active cable with no known rfsYear — a combination the type system allows but the derivation logic shouldn\'t produce', () => {
    render(<CommHubDetailPopup item={{ type: 'cable', cable: makeCable({ isPlanned: false, rfsYear: undefined }) }} onClose={vi.fn()} />);
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
    expect(screen.getByText('Active — in-service date unknown')).toBeInTheDocument();
  });

  it('shows a real expected year for a planned cable', () => {
    render(<CommHubDetailPopup item={{ type: 'cable', cable: makeCable({ isPlanned: true, rfsYear: 2028 }) }} onClose={vi.fn()} />);
    expect(screen.getByText('Planned — expected 2028')).toBeInTheDocument();
  });

  it('shows an honest unknown-date message for a planned cable with no real rfsYear', () => {
    render(<CommHubDetailPopup item={{ type: 'cable', cable: makeCable({ isPlanned: true, rfsYear: undefined }) }} onClose={vi.fn()} />);
    expect(screen.getByText('Planned — no confirmed in-service date')).toBeInTheDocument();
  });
});

describe('CommHubDetailPopup — empty-but-present real fields treated as Unknown', () => {
  it('shows "Unknown" for a real owners field that is present but an empty string, not a blank line', () => {
    render(<CommHubDetailPopup item={{ type: 'cable', cable: makeCable({ owners: '', length: '45,000 km' }) }} onClose={vi.fn()} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows the real owners string when genuinely present', () => {
    render(<CommHubDetailPopup item={{ type: 'cable', cable: makeCable({ owners: 'Meta, China Mobile' }) }} onClose={vi.fn()} />);
    expect(screen.getByText('Meta, China Mobile')).toBeInTheDocument();
  });
});

describe('CommHubDetailPopup — landing-country list dedupes whitespace-inconsistent real names', () => {
  it('treats a real country name with stray whitespace as the same country as its trimmed form', () => {
    const cable = makeCable({
      landingPoints: [
        { id: 'lp-1', name: 'Point 1', country: 'Japan' },
        { id: 'lp-2', name: 'Point 2', country: ' Japan ' }
      ]
    });
    render(<CommHubDetailPopup item={{ type: 'cable', cable }} onClose={vi.fn()} />);
    expect(screen.getAllByText('Japan')).toHaveLength(1);
  });
});

describe('CommHubDetailPopup — landing point detail', () => {
  const landingPointItem: CommHubPickResult = {
    type: 'landingPoint',
    point: { id: 'lp-1', name: 'Test Point', latitude: 0, longitude: 0, isTbd: false },
    cableCount: 2,
    country: 'Ghana',
    connectedCables: [{ id: 'a', name: 'Cable A' }, { id: 'b', name: 'Cable B' }]
  };

  it('shows the real country and real connected cable names', () => {
    render(<CommHubDetailPopup item={landingPointItem} onClose={vi.fn()} />);
    expect(screen.getByText('Ghana')).toBeInTheDocument();
    expect(screen.getByText('Cable A')).toBeInTheDocument();
    expect(screen.getByText('Cable B')).toBeInTheDocument();
  });

  it('shows an honest unknown-country message rather than blank when country is not known', () => {
    render(<CommHubDetailPopup item={{ ...landingPointItem, country: undefined }} onClose={vi.fn()} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
