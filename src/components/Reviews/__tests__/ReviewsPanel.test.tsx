/**
 * The reviews on a published item (plan item 5.1): who said what, and whether
 * they said what they checked, never a score; and a way to add one, sent only
 * where the reviewer says it may go, through the publish review.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReviewEvent, ReviewTarget } from '../../../services/reviews/reviewEvents';

const doubles = vi.hoisted(() => ({
  reviews: [] as unknown[],
  fetchReviews: vi.fn(),
  reviewReview: vi.fn(),
}));
vi.mock('../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: doubles.fetchReviews }));
vi.mock('../../../services/publishing/reviews', () => ({ reviewReview: doubles.reviewReview }));
vi.mock('../../../services/reviews/reviewTargets', () => ({
  provenanceOf: (pubkey: string) => (pubkey === 'aisha' ? 'teammate' : pubkey === 'me' ? 'you' : 'unknown'),
}));
vi.mock('../../Identity/KeyName', () => ({ default: ({ pubkey }: { pubkey: string }) => <span>{pubkey === 'aisha' ? 'Aisha' : pubkey === 'me' ? 'you' : 'npub1stranger'}</span> }));

import ReviewsPanel from '../ReviewsPanel';

const target: ReviewTarget = { kind: 30079, author: 'me', coordinate: '30079:me:pkg', eventId: 'v2' };
const reviews: ReviewEvent[] = [
  { type: 'verdict', id: '1', author: 'aisha', at: 2000, verdict: 'disputed', reasoning: 'Checked the berth camera.', version: 'v2' },
  { type: 'verdict', id: '2', author: 'stranger', at: 1500, verdict: 'disputed', reasoning: '', version: 'v1' },
  { type: 'comment', id: '3', author: 'stranger', at: 1600, text: 'Odd.' },
];

beforeEach(() => {
  doubles.fetchReviews.mockReset().mockResolvedValue(reviews);
  doubles.reviewReview.mockReset().mockResolvedValue({ status: 'sent', result: { relaysOk: 1, relaysTried: 1 } });
});

describe('ReviewsPanel', () => {
  it('says who disputed it and what they checked, and scores nobody', async () => {
    render(<ReviewsPanel target={target} itemTitle="Watch berth 4" testId="reviews" />);
    const panel = await screen.findByTestId('reviews');
    await waitFor(() => expect(panel.textContent).toMatch(/Disputed by 2/));
    expect(panel.textContent).toMatch(/Aisha, on your team.*Checked the berth camera\./);
    expect(panel.textContent).toMatch(/npub1stranger, a key you do not know.*no method stated.*on an earlier version/);
    expect(panel.textContent).toMatch(/Odd\./);
    expect(panel.textContent).not.toMatch(/score|trust|%/i);
  });

  it('asks who may receive a review, with nothing chosen, and sends it through the review', async () => {
    render(<ReviewsPanel target={target} itemTitle="Watch berth 4" testId="reviews" />);
    const panel = await screen.findByTestId('reviews');
    fireEvent.click(within(panel).getByRole('radio', { name: /^Confirmed/ }));
    fireEvent.change(within(panel).getByLabelText(/What you checked/), { target: { value: 'Called the harbour office.' } });
    const send = within(panel).getByRole('button', { name: /Send verdict/ }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(within(panel).getByRole('radio', { name: /^Limited/ }));
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(doubles.reviewReview).toHaveBeenCalledWith(
      target, 'Watch berth 4', { type: 'verdict', verdict: 'confirmed', reasoning: 'Called the harbour office.' }, 'limited'));
    await waitFor(() => expect(doubles.fetchReviews).toHaveBeenCalledTimes(2));
  });

  it('names your own review once', async () => {
    doubles.fetchReviews.mockResolvedValue([{ type: 'verdict', id: '9', author: 'me', at: 3000, verdict: 'confirmed', reasoning: 'Walked past.', version: 'v2' }]);
    render(<ReviewsPanel target={target} itemTitle="Watch berth 4" testId="reviews" />);
    const panel = await screen.findByTestId('reviews');
    await waitFor(() => expect(panel.textContent).toMatch(/Confirmed by 1/));
    expect(panel.textContent).toMatch(/you: “Walked past\.”/);
    expect(panel.textContent).not.toMatch(/you, you/);
  });

  it('says so when there are none yet', async () => {
    doubles.fetchReviews.mockResolvedValue([]);
    render(<ReviewsPanel target={target} itemTitle="Watch berth 4" testId="reviews" />);
    expect(await screen.findByText(/No reviews yet/)).toBeTruthy();
  });
});

describe('ReviewsPanel on a dark panel', () => {
  const luminance = (css: string) => {
    const [r, g, b] = (css.match(/[\d.]+/g) ?? []).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  it('writes in a light colour', async () => {
    render(<ReviewsPanel target={target} itemTitle="Watch berth 4" onDark />);
    const label = await screen.findByText('Who may receive it?');
    expect(luminance(getComputedStyle(label).color)).toBeGreaterThan(0.6);
  });
});

describe('ReviewsPanel when its item changes', () => {
  it('shows only the new item\'s reviews, even when the old item\'s answer comes last, and forgets the old draft', async () => {
    const other: ReviewTarget = { kind: 30079, author: 'me', coordinate: '30079:me:other', eventId: 'o1' };
    let finishOld: (r: ReviewEvent[]) => void = () => {};
    doubles.fetchReviews.mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockImplementationOnce(async () => [{ type: 'comment', id: 'new', author: 'aisha', at: 1, text: 'About the other one.' }]);
    const { rerender } = render(<ReviewsPanel target={target} itemTitle="Watch berth 4" testId="reviews" />);
    fireEvent.change(screen.getByRole('textbox', { name: /^Comment/ }), { target: { value: 'Half typed about the first.' } });
    rerender(<ReviewsPanel target={other} itemTitle="Count the pallets" testId="reviews" />);
    await waitFor(() => expect(screen.getByTestId('reviews').textContent).toMatch(/About the other one\./));
    finishOld([{ type: 'comment', id: 'old', author: 'aisha', at: 1, text: 'About the first one.' }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('reviews').textContent).not.toMatch(/About the first one\./);
    expect((screen.getByRole('textbox', { name: /^Comment/ }) as HTMLTextAreaElement).value).toBe('');
  });

  it('does not ask the relays again for the same item handed in afresh', async () => {
    doubles.fetchReviews.mockReset().mockResolvedValue([]);
    const { rerender } = render(<ReviewsPanel target={target} itemTitle="Watch berth 4" />);
    rerender(<ReviewsPanel target={{ ...target }} itemTitle="Watch berth 4" />);
    rerender(<ReviewsPanel target={{ ...target }} itemTitle="Watch berth 4" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(doubles.fetchReviews).toHaveBeenCalledTimes(1);
  });

  it('keeps what was written when no relay took it, and says nothing was published', async () => {
    doubles.fetchReviews.mockReset().mockResolvedValue([]);
    doubles.reviewReview.mockReset().mockResolvedValue({ status: 'sent', result: { relaysOk: 0, relaysTried: 3 } });
    render(<ReviewsPanel target={target} itemTitle="Watch berth 4" testId="reviews" />);
    fireEvent.change(screen.getByRole('textbox', { name: /^Comment/ }), { target: { value: 'Seen it.' } });
    fireEvent.click(screen.getByRole('radio', { name: /^Limited/ }));
    fireEvent.click(screen.getByRole('button', { name: /Send comment/ }));
    await waitFor(() => expect(screen.getByTestId('reviews').textContent).toMatch(/No relay took it: nothing was published/));
    expect((screen.getByRole('textbox', { name: /^Comment/ }) as HTMLTextAreaElement).value).toBe('Seen it.');
  });
});
