/**
 * What a report or package rests on, as shown (D-MX: MX3, MX23): each cited
 * observation as read, or why it is not, in words true of this node.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { FieldObservation } from '../../../services/intel/observations/fieldObservations';

const lookUpCited = vi.hoisted(() => vi.fn());
vi.mock('../../../services/intel/observations/citedObservations', () => ({ lookUpCited }));
const readOperatorStanding = vi.hoisted(() => vi.fn(async () => ({ submitted: 2, refined: 0 })));
vi.mock('../../../services/intel/observations/registerSources', () => ({ readOperatorStanding }));

import { RestsOn } from '../RestsOn';
import { readRelays } from '../../../services/nostr/publishTargets';

const A = 'a'.repeat(64);
const row: FieldObservation = {
  eventId: A, operator: 'b'.repeat(64), operatorLabel: 'Kestrel · npub1abc…xyz', anchor: 'anchor-one',
  seen: ['alpha_one', 'beta_one'], method: 'told', observedAt: '2026-09-01T12:00:00.000Z', lat: 38.6, lon: -90.2, precisionM: 18_000,
};

beforeEach(() => { lookUpCited.mockReset(); });

describe('RestsOn', () => {
  it('says it is looking until it knows', () => {
    lookUpCited.mockReturnValue(new Promise(() => {}));
    render(<RestsOn cites={[{ eventId: A }]} />);
    expect(screen.getByTestId('cited-observation').textContent).toMatch(/^Looking for this observation \(aaaaaaaa…\) on the relays Starcom reads/);
  });

  it('shows what was seen, how, when in UTC, where to its precision, and who says so', async () => {
    lookUpCited.mockResolvedValue(new Map([[A, row]]));
    render(<RestsOn cites={[{ eventId: A }]} />);
    await waitFor(() => expect(screen.getByTestId('cited-observation').textContent).toContain('alpha one, beta one'));
    const text = screen.getByTestId('cited-observation').textContent;
    expect(text).toContain('told to the observer on 1 Sep 2026 12:00Z');
    expect(text).toContain('±18 km');
    expect(text).toContain('Kestrel · npub1abc…xyz');
    expect(screen.getByTestId('cited-observation')).toHaveAttribute('title', A);
  });

  it("opens the operator's card from their name", async () => {
    lookUpCited.mockResolvedValue(new Map([[A, row]]));
    render(<RestsOn cites={[{ eventId: A }]} />);
    fireEvent.click(await screen.findByTestId('cited-operator'));
    await waitFor(() => expect(screen.getByTestId('standing-intel').textContent).toBe('2 submitted, 0 refined'));
    expect(readOperatorStanding).toHaveBeenCalledWith('b'.repeat(64));
  });

  it('says no relay it reads holds one, and that it did not ask the stranger-named relay', async () => {
    lookUpCited.mockResolvedValue(new Map([[A, null]]));
    render(<RestsOn cites={[{ eventId: A, relay: 'wss://somewhere-a-stranger-chose.example' }]} />);
    await waitFor(() => expect(screen.getByTestId('cited-observation').textContent).toMatch(/^No relay Starcom reads holds this observation/));
    expect(screen.getByTestId('cited-observation').textContent).toContain('It names wss://somewhere-a-stranger-chose.example, which Starcom does not ask');
  });

  it('says nothing of not asking a named relay it does read: it was asked', async () => {
    lookUpCited.mockResolvedValue(new Map([[A, null]]));
    render(<RestsOn cites={[{ eventId: A, relay: readRelays('MISSION')[0] }]} />);
    await waitFor(() => expect(screen.getByTestId('cited-observation').textContent).toMatch(/^No relay Starcom reads holds/));
    expect(screen.getByTestId('cited-observation').textContent).not.toContain('does not ask');
  });

  it('says so when no relay it reads answered', async () => {
    lookUpCited.mockRejectedValue(new Error('No relay answered'));
    render(<RestsOn cites={[{ eventId: A }]} />);
    await waitFor(() => expect(screen.getByTestId('cited-observation').textContent).toMatch(/^No relay Starcom reads answered, so this observation \(aaaaaaaa…\) could not be looked for/));
  });
});
