/**
 * What is waiting to be sent, shown and withdrawable (plan item 0.2).
 *
 * A finding that reached no relay is queued, and the queue drains by itself at
 * startup and whenever the browser comes back online. Nothing showed the queue,
 * so a finding published days ago could go out with no one watching.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { signFinding } from '../../../../services/intel/findings/signFinding';
import type { FindingContent } from '../../../../services/intel/findings/FindingContent';

vi.mock('../../../../services/intel/outbox/PublishOutbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/intel/outbox/PublishOutbox')>();
  const { MemoryOutboxStore } = await import('../../../../services/intel/outbox/OutboxStore');
  return { ...actual, publishOutbox: new actual.PublishOutbox(new MemoryOutboxStore()) };
});

import { publishOutbox, MAX_ATTEMPTS } from '../../../../services/intel/outbox/PublishOutbox';
import FindingsOutboxStatus from '../FindingsOutboxStatus';

const keys = ml_dsa65.keygen();
const signed = (entityRef: string, attribute: string) => {
  const content: FindingContent = {
    schemaVersion: 1,
    claim: { entityRef, attribute, value: 'closed' },
    confidence: 0.8,
    corroboration: { sourceCount: 2, algorithmVersion: 1, criteria: '2+ independent, no unresolved conflict' },
    publishedAt: '2026-09-26T00:00:00.000Z',
  };
  return signFinding(content, keys.secretKey);
};

describe('FindingsOutboxStatus', () => {
  beforeEach(async () => {
    for (const record of [...await publishOutbox.pending(), ...await publishOutbox.abandoned()]) await publishOutbox.cancel(record.id);
  });

  it('shows nothing when nothing is waiting', async () => {
    const { container } = render(<FindingsOutboxStatus />);
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toBe('');
  });

  it('counts what is waiting, names each finding, and cancels one at a time', async () => {
    await publishOutbox.enqueue(signed('Newark food bank 3', 'status'));
    await publishOutbox.enqueue(signed('Newark food bank 5', 'status'));
    render(<FindingsOutboxStatus />);

    expect(await screen.findByText('Waiting to send (2)')).toBeTruthy();
    expect(screen.getByText(/Newark food bank 3/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel sending Newark food bank 3 — status' }));

    await waitFor(() => expect(screen.getByText('Waiting to send (1)')).toBeTruthy());
    expect(screen.queryByText(/Newark food bank 3/)).toBeNull();
  });

  // It left the list once it had used its tries, though it was never sent (plan item 9.4).
  it('keeps a finding it gave up on, says so, and offers to try again', async () => {
    await publishOutbox.enqueue(signed('Harbour crane', 'status'));
    for (let i = 0; i < MAX_ATTEMPTS; i++) await publishOutbox.drain(async () => ({ success: false, error: 'no relays reachable' }));
    render(<FindingsOutboxStatus />);

    expect(await screen.findByText('Not sent (1)')).toBeTruthy();
    expect(screen.getByText('Gave up after 10 tries: no relays reachable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel sending Harbour crane — status' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again to send Harbour crane — status' }));

    await waitFor(() => expect(screen.getByText('Waiting to send (1)')).toBeTruthy());
    expect(screen.queryByText('Not sent (1)')).toBeNull();
  });

  it('updates when a finding is queued while it is on screen', async () => {
    render(<FindingsOutboxStatus />);
    await act(async () => { await publishOutbox.enqueue(signed('Relay outage', 'cause')); });

    expect(await screen.findByText('Waiting to send (1)')).toBeTruthy();
  });
});
