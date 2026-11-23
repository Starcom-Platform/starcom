/**
 * NavCom's field observations in the Analyzer (decision D-MX, MX21), and a
 * report written on one (MX19). Each event is one row; "Write a report on this"
 * leaves the report form a draft that rests on it, and opens the form.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FieldObservationsPanel from '../FieldObservationsPanel';
import type { FieldObservation } from '../../../../services/intel/observations/fieldObservations';
import { reportDraft } from '../../../../services/intel/place/placePick';

const navigateToApp = vi.fn();
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
}));

const readOperatorStanding = vi.hoisted(() => vi.fn(async () => ({ submitted: 3, refined: 1 })));
vi.mock('../../../../services/intel/observations/registerSources', () => ({ readOperatorStanding }));

let rows: FieldObservation[] = [];
vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ fieldObservations: rows }),
}));

const row = (over: Partial<FieldObservation> = {}): FieldObservation => ({
  eventId: '1'.repeat(64), relay: 'wss://relay.example', operator: 'a'.repeat(64),
  operatorLabel: 'Kestrel · npub14242424242…424242', anchor: 'anchor-one', seen: ['alpha_one', 'beta_one'],
  method: 'saw', observedAt: '2026-09-01T12:00:00.000Z', lat: 38.67, lon: -90.18, precisionM: 22_000, ...over,
});

describe('FieldObservationsPanel', () => {
  beforeEach(() => {
    navigateToApp.mockReset();
    rows = [];
    reportDraft.take();
  });

  it('shows nothing while no observation has been read', () => {
    const { container } = render(<FieldObservationsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each one: what was seen, how, when in UTC, where to within its cell, and who says so', () => {
    rows = [row()];
    render(<FieldObservationsPanel />);
    const item = screen.getByTestId('field-observation');
    expect(item.textContent).toContain('alpha one, beta one');
    expect(item.textContent).toContain('seen on 1 Sep 2026 12:00Z');
    expect(item.textContent).toContain('±22 km');
    expect(item.textContent).toContain('Kestrel · npub1');
  });

  it('opens the report form with a draft that rests on the observation', () => {
    rows = [row()];
    render(<FieldObservationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /write a report on this/i }));
    expect(reportDraft.peek()).toMatchObject({
      title: 'Alpha one, beta one',
      cites: [{ eventId: '1'.repeat(64), relay: 'wss://relay.example' }],
    });
    expect(navigateToApp).toHaveBeenCalledWith('inteldashboard', undefined, { restoreDraft: 'true', from: 'intelanalyzer' });
  });

  it("opens the operator's card, their standing as NavCom derives it, from their name", async () => {
    rows = [row()];
    render(<FieldObservationsPanel />);
    fireEvent.click(screen.getByTestId('operator-chip'));
    await waitFor(() => expect(screen.getByTestId('standing-intel').textContent).toBe('3 submitted, 1 refined'));
    expect(readOperatorStanding).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('shows the newest few, and says how many more there are', () => {
    rows = Array.from({ length: 11 }, (_, i) => row({ eventId: String(i).padStart(64, '0') }));
    render(<FieldObservationsPanel />);
    expect(screen.getAllByTestId('field-observation')).toHaveLength(8);
    expect(screen.getByText('+3 more not shown')).toBeTruthy();
  });
});
