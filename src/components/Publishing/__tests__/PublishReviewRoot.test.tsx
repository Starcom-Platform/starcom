/**
 * The publish review on screen (plan item 0.1): where it goes, exactly what
 * goes, what is easy to miss, who signs, and a confirm button that says what it
 * does. Enter never publishes.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { nip19 } from 'nostr-tools';
import PublishReviewRoot from '../PublishReviewRoot';
import { requestReview, currentReview, decideReview, sha256Hex, type ReviewSpec } from '../../../services/publishing/publishReview';

type Payload = { text: string };

function start(overrides: Partial<ReviewSpec<Payload, string>> = {}) {
  const send = vi.fn(async (p: Readonly<Payload>) => `sent:${p.text}`);
  const outcome = requestReview<Payload, string>({
    act: 'Publish finding',
    payload: { text: 'Two of the five sites look closed. Call 973-555-0100.' },
    show: (p) => ({ title: 'Newark food bank 3 — status', body: p.text, fields: [{ label: 'Confidence', value: '0.8' }] }),
    destinations: [
      { address: 'wss://relay.one.example', kind: 'public' },
      { address: 'wss://relay.two.example', kind: 'public' },
    ],
    digest: (p) => sha256Hex(p.text),
    signer: 'a'.repeat(64),
    send,
    ...overrides,
  });
  return { send, outcome };
}

// Leaves nothing queued for the next test. Bounded and yielding: a review left
// sending by a failed test would otherwise hold a synchronous loop forever.
afterEach(async () => {
  for (let i = 0; i < 50 && currentReview(); i++) {
    decideReview(currentReview()!.id, false);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

describe('PublishReviewRoot', () => {
  it('shows nothing while nothing is being published', () => {
    const { container } = render(<PublishReviewRoot />);
    expect(container.textContent).toBe('');
  });

  it('shows where it goes, exactly what goes, what is easy to miss, and who signs', async () => {
    render(<PublishReviewRoot />);
    const { outcome } = start();

    expect(await screen.findByTestId('publish-review')).toBeTruthy();
    expect(screen.getByText('Publish finding: check it before it goes')).toBeTruthy();
    expect(screen.getByTestId('publish-review-destinations').textContent).toMatch(/wss:\/\/relay\.one\.example · Public: anyone can read it/);
    expect(screen.getByTestId('publish-review-content').textContent).toContain('Two of the five sites look closed.');
    expect(screen.getByTestId('publish-review-highlights').textContent).toContain('A phone number: 973-555-0100');
    expect(screen.getByTestId('publish-review-signer').textContent).toBe(`${nip19.npubEncode('a'.repeat(64)).slice(0, 14)}…${nip19.npubEncode('a'.repeat(64)).slice(-6)}`);
    const digest = sha256Hex('Two of the five sites look closed. Call 973-555-0100.');
    expect(screen.getByTestId('publish-review-digest').getAttribute('title')).toBe(digest);
    expect(screen.getByTestId('publish-review-confirm').textContent).toBe('Publish finding to 2 public relays');

    fireEvent.click(screen.getByTestId('publish-review-cancel'));
    expect((await outcome).status).toBe('cancelled');
  });

  it('gives the focus to Cancel, so Enter never publishes', async () => {
    render(<PublishReviewRoot />);
    const { outcome, send } = start();

    const cancel = await screen.findByTestId('publish-review-cancel');
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.click(document.activeElement as HTMLElement);

    expect((await outcome).status).toBe('cancelled');
    expect(send).not.toHaveBeenCalled();
  });

  it('sends on confirm, says so while sending, and closes when done', async () => {
    let release: () => void = () => {};
    const send = vi.fn(() => new Promise<string>((r) => { release = () => r('ok'); }));
    render(<PublishReviewRoot />);
    const { outcome } = start({ send });

    const confirm = await screen.findByTestId('publish-review-confirm');
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand' }));
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByTestId('publish-review-confirm').textContent).toBe('Sending…'));
    expect((screen.getByTestId('publish-review-confirm') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { release(); await outcome; });

    expect(await outcome).toEqual({ status: 'sent', result: 'ok' });
    await waitFor(() => expect(screen.queryByTestId('publish-review')).toBeNull());
  });

  it('cannot confirm when there is nowhere to send it', async () => {
    render(<PublishReviewRoot />);
    const { outcome } = start({ destinations: [] });

    expect(((await screen.findByTestId('publish-review-confirm')) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('publish-review-cancel'));
    await outcome;
  });
});
