/**
 * The first publish from a key, in the review (plan item 0.1): "you are the
 * publisher" must be understood before anything is sent, and a key that lives
 * only in this browser is offered for backup first.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const identity = vi.hoisted(() => ({ pubkey: 'f'.repeat(64), extension: false }));
vi.mock('../../../services/identity/NostrIdentityService', () => ({
  nostrIdentityService: {
    getPubkey: () => identity.pubkey,
    signerPubkey: () => identity.pubkey,
    refreshSigner: async () => identity.pubkey,
    hasExtension: () => identity.extension,
    exportNsec: () => 'nsec1keepthissafekeepthissafekeepthissafekeepthissafe',
    exportNsecUnlocking: async () => 'nsec1keepthissafekeepthissafekeepthissafekeepthissafe',
  },
}));

import PublishReviewRoot from '../PublishReviewRoot';
import { requestReview, currentReview, decideReview, sha256Hex } from '../../../services/publishing/publishReview';
import { recordIdentityCreated, clearIdentityNotice, keyMayExistOnlyHere } from '../../../services/identity/identityNotice';
import { publisherConsentRefusal } from '../../../services/intel/findings/publisherConsent';

function start(signer: string, sealed?: boolean) {
  const send = vi.fn(async () => 'sent');
  const outcome = requestReview<{ text: string }, string>({
    ...(sealed ? { sealed } : {}),
    act: 'Publish finding',
    payload: { text: 'Two of the five sites look closed.' },
    show: (p) => ({ title: 'Newark food bank 3 — status', body: p.text, fields: [] }),
    destinations: [{ address: 'wss://relay.one.example', kind: 'public' }],
    digest: (p) => sha256Hex(p.text),
    signer,
    send,
  });
  return { send, outcome };
}

beforeEach(() => {
  localStorage.clear();
  clearIdentityNotice();
  identity.pubkey = 'f'.repeat(64);
  identity.extension = false;
});

afterEach(async () => {
  for (let i = 0; i < 50 && currentReview(); i++) {
    decideReview(currentReview()!.id, false);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

describe('the first publish from a key', () => {
  it('says "you are the publisher", and will not send until it is understood', async () => {
    render(<PublishReviewRoot />);
    const { send, outcome } = start(identity.pubkey);

    expect((await screen.findByTestId('publish-review-acknowledgement')).textContent).toContain('You are the publisher');
    const confirm = screen.getByTestId('publish-review-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand' }));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    expect((await outcome).status).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    expect(publisherConsentRefusal(identity.pubkey)).toBeNull();
  });

  it('offers the key for backup when it lives only in this browser, and remembers it was shown', async () => {
    recordIdentityCreated('publishing a finding');
    render(<PublishReviewRoot />);
    const { outcome } = start(identity.pubkey);

    expect((await screen.findByTestId('publish-review-backup')).textContent).toMatch(/lives only in this browser/);
    fireEvent.click(screen.getByTestId('publish-review-reveal'));

    expect((await screen.findByTestId('publish-review-nsec')).textContent).toMatch(/^nsec1/);
    expect(screen.getByRole('button', { name: 'Copy SECRET key — never share' })).toBeTruthy();
    expect(keyMayExistOnlyHere()).toBe(false);
    fireEvent.click(screen.getByTestId('publish-review-cancel'));
    await outcome;
  });

  it('does not offer a backup when a signer extension holds the key', async () => {
    identity.extension = true;
    render(<PublishReviewRoot />);
    const { outcome } = start(identity.pubkey);

    await screen.findByTestId('publish-review');
    expect(screen.queryByTestId('publish-review-backup')).toBeNull();
    fireEvent.click(screen.getByTestId('publish-review-cancel'));
    await outcome;
  });

  it('does not ask again once the key has acknowledged', async () => {
    render(<PublishReviewRoot />);
    const first = start(identity.pubkey);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'I understand' }));
    fireEvent.click(screen.getByTestId('publish-review-confirm'));
    await first.outcome;
    await waitFor(() => expect(screen.queryByTestId('publish-review')).toBeNull());

    const second = start(identity.pubkey);
    await screen.findByTestId('publish-review');
    expect(screen.queryByTestId('publish-review-acknowledgement')).toBeNull();
    expect((screen.getByTestId('publish-review-confirm') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('publish-review-cancel'));
    await second.outcome;
  });

  it('asks no "you are the publisher" of a message sealed to one key, says its relays hold it sealed, and still offers the backup', async () => {
    recordIdentityCreated('reporting back on a mission');
    render(<PublishReviewRoot />);
    const { send, outcome } = start(identity.pubkey, true);

    await screen.findByTestId('publish-review');
    expect(screen.queryByTestId('publish-review-acknowledgement')).toBeNull();
    expect(screen.getByTestId('publish-review-backup')).toBeTruthy();
    expect(screen.getByTestId('publish-review-destinations').textContent).toBe('wss://relay.one.example · Public relay: it holds the message sealed, for good; only the key it is sealed to can open it');
    fireEvent.click(screen.getByTestId('publish-review-confirm'));
    expect((await outcome).status).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    // Not taken as consent to publish in public: the first public publish still asks.
    expect(publisherConsentRefusal(identity.pubkey)).not.toBeNull();
  });
});
