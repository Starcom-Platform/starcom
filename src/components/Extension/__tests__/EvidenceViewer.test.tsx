/**
 * Kept evidence as the person looks at it (decision D-EX, E2, W8): its files and hashes, checked again
 * on request; its custody record, whose signature is checked and said; signed at the person's click when
 * it came in unsigned; and the page's HTML never drawn.
 */
import React from 'react';
import { createHash } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { finalizeEvent, generateSecretKey, nip19 } from 'nostr-tools';
import type { KeptCustody } from '../../../extension/keepEvidence';
import type { Capture } from '../../../extension/protocol';
import { custodyEvent, custodyRecord } from '../../../extension/evidenceItems';

const store = vi.hoisted(() => ({ records: new Map<string, unknown>(), files: new Map<string, Blob>() }));
vi.mock('../../../extension/evidenceStore', () => ({
  evidenceStore: {
    getRecord: async (id: string) => store.records.get(id),
    putRecord: async (id: string, r: unknown) => { store.records.set(id, r); },
    getFile: async (sha: string) => store.files.get(sha),
    putFile: async (sha: string, b: Blob) => { store.files.set(sha, b); },
  },
}));
const key = vi.hoisted(() => ({ secret: null as Uint8Array | null }));
const completion = vi.hoisted(() => ({ result: null as unknown }));
vi.mock('../../../extension/completeTimestamps', () => ({
  browserCompletion: () => ({}),
  completeTimestamps: async () => completion.result,
}));
vi.mock('../../../services/identity/NostrIdentityService', () => ({
  nostrIdentityService: {
    ensureSigner: vi.fn(async () => 'made'),
    signWithExisting: vi.fn(async (event: Record<string, unknown>) => (key.secret ? finalizeEvent(event as never, key.secret) : Promise.reject(new Error('no key')))),
  },
}));
vi.mock('../../../services/intel/IntelWorkspaceManager', () => ({
  intelWorkspaceManager: { getIntelItem: () => ({ id: 'item-1', content: 'x' }), updateIntelItem: vi.fn() },
}));

import EvidenceViewer from '../EvidenceViewer';

const HTML = '<p>The river rose.</p><script>steal()</script>';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const capture: Capture = {
  id: 'ev1', kind: 'evidence', at: '2026-10-12T00:20:00.000Z', page: { url: 'https://news.example.org/flood', title: 'Flood' }, scaledTo: 1280,
  files: [
    { name: 'page.html', type: 'text/html', size: HTML.length, sha256: sha(HTML) },
    { name: 'text.txt', type: 'text/plain', size: 15, sha256: sha('The river rose.') },
  ],
};
const unsigned = custodyEvent(custodyRecord(capture, '0.1.0'));

afterEach(() => { store.records.clear(); store.files.clear(); key.secret = null; vi.clearAllMocks(); });

describe('EvidenceViewer', () => {
  it('shows the files and hashes, checks them again, and never draws the page\'s HTML', async () => {
    store.records.set('item-1', { captureId: 'ev1', capture, unsigned } satisfies KeptCustody);
    // Node's Blob: jsdom's has no arrayBuffer(), which every browser's has.
    store.files.set(sha(HTML), new NodeBlob([HTML]) as unknown as Blob);
    render(<EvidenceViewer itemId="item-1" title="Evidence: Flood" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('evidence-files').textContent).toContain(sha(HTML)));
    expect(document.body.innerHTML).not.toContain('steal()');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByTestId('evidence-unsigned').textContent).toContain('not signed yet');
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(document.querySelector('[data-state]')).not.toBeNull());
    const states = [...document.querySelectorAll('[data-state]')].map((el) => el.getAttribute('data-state'));
    expect(states).toEqual(['matches', 'missing']);
  });

  it('signs an unsigned record at the person\'s click, and says the signature checks', async () => {
    key.secret = generateSecretKey();
    store.records.set('item-1', { captureId: 'ev1', capture, unsigned } satisfies KeptCustody);
    render(<EvidenceViewer itemId="item-1" title="Evidence: Flood" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign with your key' }));
    await waitFor(() => expect(screen.getByTestId('evidence-signed').textContent).toContain('the signature checks.'));
    const kept = store.records.get('item-1') as KeptCustody;
    expect(screen.getByTestId('evidence-signed').textContent).toContain(nip19.npubEncode(kept.event!.pubkey));
    expect(screen.queryByRole('button', { name: 'Sign with your key' })).toBeNull();
  });

  it('says a signature that does not check, does not', async () => {
    const event = finalizeEvent(unsigned as never, generateSecretKey());
    store.records.set('item-1', { captureId: 'ev1', capture, event: { ...event, content: event.content.replace('Flood', 'Drought') } } satisfies KeptCustody);
    render(<EvidenceViewer itemId="item-1" title="Evidence: Flood" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('evidence-signed').textContent).toContain('the signature does NOT check.'));
  });

  it('completes the timestamps at the person\'s click, keeps them beside the record, and says what is proven', async () => {
    const pending = { calendars: ['https://alice.btc.calendar.opentimestamps.org'], at: '2026-10-12T04:48:01.000Z', proofs: { 'page.html': btoa('pending') } };
    store.records.set('item-1', { captureId: 'ev1', unsigned, capture: { ...capture, timestamps: pending } } satisfies KeptCustody);
    const anchored = {
      checkedAt: '2026-10-12T08:00:00.000Z',
      block: { height: 971047, hash: 'h'.repeat(64), merkleRoot: 'm'.repeat(64), minedAt: '2026-10-12T05:02:23Z', checkedWith: ['mempool.space', 'blockstream.info'] },
      proofs: { 'page.html': btoa('completed') },
    };
    completion.result = { anchored };
    render(<EvidenceViewer itemId="item-1" title="Evidence: Flood" onClose={() => {}} />);
    expect(await screen.findByText(/Only a blinded commitment and a block height are sent/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Complete in Bitcoin' }));
    await waitFor(() => expect(screen.getByTestId('evidence-anchored').textContent)
      .toBe('Proven in Bitcoin: its page HTML existed by 12 Oct 2026 05:02Z, block 971047. Its merkle root was checked with mempool.space and blockstream.info.'));
    expect(store.records.get('item-1')).toMatchObject({ unsigned, anchored, capture: { timestamps: pending } });
    expect(screen.queryByRole('button', { name: 'Complete in Bitcoin' })).not.toBeInTheDocument();
  });

  it('names every file a completion proved', async () => {
    const proofs = Object.fromEntries((capture.files ?? []).map((f) => [f.name, btoa('completed')]));
    store.records.set('item-1', {
      captureId: 'ev1', unsigned, capture,
      anchored: { checkedAt: '2026-10-12T08:00:00.000Z', block: { height: 971047, hash: 'h', merkleRoot: 'm', minedAt: '2026-10-12T05:02:23Z', checkedWith: ['mempool.space'] }, proofs },
    } satisfies KeptCustody);
    render(<EvidenceViewer itemId="item-1" title="Evidence: Flood" onClose={() => {}} />);
    expect(await screen.findByTestId('evidence-anchored')).toHaveTextContent(/^Proven in Bitcoin: its page HTML and page text existed by/);
  });

  it('says there is no finished proof yet, and keeps nothing', async () => {
    store.records.set('item-1', { captureId: 'ev1', unsigned, capture: { ...capture, timestamps: { calendars: [], at: '2026-10-12T04:48:01.000Z', proofs: { 'page.html': btoa('p') } } } } satisfies KeptCustody);
    completion.result = { pending: 'No finished proof yet: Bitcoin may not have confirmed it, or a calendar could not be read. Try again in a few hours.' };
    render(<EvidenceViewer itemId="item-1" title="Evidence: Flood" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete in Bitcoin' }));
    expect(await screen.findByTestId('evidence-completion')).toHaveTextContent('No finished proof yet');
    expect(store.records.get('item-1')).not.toHaveProperty('anchored');
  });

  it('names the calendars a timestamp waits on, and hands each file\'s proof to save', async () => {
    const proof = btoa('ots-proof-bytes');
    store.records.set('item-1', {
      captureId: 'ev1', unsigned,
      capture: { ...capture, timestamps: { calendars: ['https://alice.btc.calendar.opentimestamps.org'], at: '2026-10-12T00:20:02.000Z', proofs: { 'page.html': proof } } },
    } satisfies KeptCustody);
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push(this.download); });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    render(<EvidenceViewer itemId="item-1" title="Evidence: Flood" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('evidence-timestamps').textContent).toContain('alice.btc.calendar.opentimestamps.org'));
    expect(screen.getByTestId('evidence-timestamps').textContent).toContain('pending until Bitcoin confirms it');
    fireEvent.click(screen.getByRole('button', { name: 'Save the proof of Page HTML' }));
    expect(saved).toEqual(['evidence-2026-10-12-00-20-00-page.html.ots']);
  });

  it('says why evidence was not timestamped', async () => {
    store.records.set('item-1', { captureId: 'ev1', unsigned, capture: { ...capture, timestampNote: 'Not timestamped: no calendar answered' } } satisfies KeptCustody);
    render(<EvidenceViewer itemId="item-1" title="Evidence: Flood" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('evidence-timestamps').textContent).toContain('Not timestamped: no calendar answered'));
  });
});

