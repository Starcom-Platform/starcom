/**
 * "Queued — not yet public" survives a reload (plan item 9.4). It was the
 * panel's own state, so a reload wiped it while the finding still sat in the
 * outbox, and the button offered to publish it again.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { signFinding } from '../../../../services/intel/findings/signFinding';

vi.mock('@mui/icons-material/ExpandMore', () => ({ default: () => null }));
vi.mock('@mui/icons-material/ExpandLess', () => ({ default: () => null }));
vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
const finding = { isMock: false, entityRef: 'Harbour crane', attribute: 'location' as const, value: { lat: 29.7, lon: -95.3 }, confidence: 0.8, sourceCount: 3, algorithmVersion: 1 };
vi.mock('../../state/CorrelationContext', () => ({ useCorrelation: () => ({ corroboratedFindings: [finding], excludedReports: [], names: NO_NAMES }) }));
const reviewFinding = vi.fn();
vi.mock('../../../../services/publishing/findings', () => ({ reviewFinding: (...a: unknown[]) => reviewFinding(...a) }));
vi.mock('../../../../services/intel/outbox/PublishOutbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/intel/outbox/PublishOutbox')>();
  const { MemoryOutboxStore } = await import('../../../../services/intel/outbox/OutboxStore');
  return { ...actual, publishOutbox: new actual.PublishOutbox(new MemoryOutboxStore()) };
});

import { publishOutbox, MAX_ATTEMPTS } from '../../../../services/intel/outbox/PublishOutbox';
import FindingsPanel from '../FindingsPanel';
import { buildReadableNames } from '../../state/readableNames';
const NO_NAMES = buildReadableNames([], []);

const keys = ml_dsa65.keygen();
const queuedFinding = () => signFinding({
  schemaVersion: 2, claim: { subjectRef: 'Harbour crane', subjectKind: 'thing', attribute: 'location', value: { lat: 29.7, lon: -95.3 } }, publishedAt: '2026-09-26T00:00:00.000Z',
} as never, keys.secretKey);

beforeEach(async () => {
  for (const r of [...await publishOutbox.pending(), ...await publishOutbox.abandoned()]) await publishOutbox.cancel(r.id);
});

describe('FindingsPanel — what the outbox holds', () => {
  it('says queued for a finding waiting in the outbox, as it does after a reload', async () => {
    await publishOutbox.enqueue(queuedFinding());
    render(<FindingsPanel />);
    expect(await screen.findByRole('button', { name: 'Queued — not yet public' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish Finding' })).toBeNull();
  });

  it('offers to retry one the outbox gave up on', async () => {
    await publishOutbox.enqueue(queuedFinding());
    for (let i = 0; i < MAX_ATTEMPTS; i++) await publishOutbox.drain(async () => ({ success: false, error: 'down' }));
    render(<FindingsPanel />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  /*
   * Found checking in a browser: once published in this session, the panel's
   * own "queued" outranked the outbox, so a finding the outbox later gave up on
   * still read "Queued". Whether it waits is the outbox's to say.
   */
  it('follows the outbox after publishing in this session: queued, then given up', async () => {
    reviewFinding.mockImplementation(async () => {
      await publishOutbox.enqueue(queuedFinding());
      return { broadcast: { success: false }, queued: true };
    });
    render(<FindingsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publish Finding' }));
    expect(await screen.findByRole('button', { name: 'Queued — not yet public' })).toBeTruthy();

    await act(async () => { for (let i = 0; i < MAX_ATTEMPTS; i++) await publishOutbox.drain(async () => ({ success: false, error: 'down' })); });
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('offers to publish one the outbox does not hold', async () => {
    render(<FindingsPanel />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'Publish Finding' })).toBeTruthy();
  });
});
