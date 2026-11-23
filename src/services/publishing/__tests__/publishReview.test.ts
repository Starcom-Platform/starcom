/**
 * The publish review's core (plan item 0.1): nothing is sent without a yes,
 * what is sent is what was reviewed, and the person is shown the fingerprint
 * the signer will sign.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { jobs } from '../../jobs/jobRegistry';
import {
  requestReview, currentReview, decideReview, subscribeReview,
  confirmLabel, findHighlights, freeze, sha256Hex,
  type ReviewSpec, type Destination,
} from '../publishReview';
import { UNDER_13_REFUSAL, ageAnswer, registerAgeAsker, resetAge, setAgeAnswer } from '../../identity/ageAnswer';

const PUBLIC_FIVE: Destination[] = [1, 2, 3, 4, 5].map((n) => ({ address: `wss://relay${n}.example`, kind: 'public' }));

function spec(overrides: Partial<ReviewSpec<{ text: string; tags: string[] }, string>> = {}) {
  const send = vi.fn(async (payload: Readonly<{ text: string; tags: string[] }>) => `sent:${payload.text}`);
  return {
    send,
    spec: {
      act: 'Publish finding',
      payload: { text: 'Two of the five sites look closed.', tags: ['food'] },
      show: (p: Readonly<{ text: string; tags: string[] }>) => ({ title: 'Newark food banks', body: p.text, fields: [{ label: 'Tags', value: p.tags.join(', ') }] }),
      destinations: PUBLIC_FIVE,
      digest: (p: Readonly<{ text: string; tags: string[] }>) => sha256Hex(JSON.stringify(p)),
      signer: 'a'.repeat(64),
      send,
      ...overrides,
    } as ReviewSpec<{ text: string; tags: string[] }, string>,
  };
}

/** Waits until a review is on screen, then answers it. */
async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  decideReview(currentReview()!.id, confirmed, { acknowledged: true });
}

// Leaves nothing queued for the next test. Bounded and yielding: a review left
// sending by a failed test would otherwise hold the loop forever.
afterEach(async () => {
  for (let i = 0; i < 50 && currentReview(); i++) {
    decideReview(currentReview()!.id, false);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});

describe('requestReview', () => {
  it('sends nothing until the person confirms, and nothing when they cancel', async () => {
    const { spec: s, send } = spec();
    const outcome = requestReview(s);
    await vi.waitFor(() => expect(currentReview()).not.toBeNull());
    expect(send).not.toHaveBeenCalled();

    await answer(false);

    expect(await outcome).toEqual({ status: 'cancelled' });
    expect(send).not.toHaveBeenCalled();
    expect(currentReview()).toBeNull();
  });

  it('sends the payload as it was reviewed, even if the caller changes theirs afterwards', async () => {
    const { spec: s, send } = spec();
    const outcome = requestReview(s);
    s.payload.text = 'Changed after the review opened.';
    s.payload.tags.push('changed');

    await answer(true);

    expect(await outcome).toEqual({ status: 'sent', result: 'sent:Two of the five sites look closed.' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({ text: 'Two of the five sites look closed.', tags: ['food'] });
    expect(Object.isFrozen(send.mock.calls[0][0])).toBe(true);
    expect(Object.isFrozen(send.mock.calls[0][0].tags)).toBe(true);
  });

  it('shows the digest of the frozen payload, the one the signer will sign', async () => {
    const { spec: s } = spec();
    const expected = sha256Hex(JSON.stringify({ text: 'Two of the five sites look closed.', tags: ['food'] }));
    const outcome = requestReview(s);

    await vi.waitFor(() => expect(currentReview()?.digest).toBe(expected));
    await answer(false);
    await outcome;
  });

  it('shows the act and the destination on the confirm button, and what is easy to miss', async () => {
    const { spec: s } = spec({ payload: { text: 'Meet at 40.7357, -74.1724 or call 973-555-0100.', tags: [] } });
    const outcome = requestReview(s);

    await vi.waitFor(() => expect(currentReview()).not.toBeNull());
    expect(currentReview()!.confirmLabel).toBe('Publish finding to 5 public relays');
    expect(currentReview()!.highlights.map((h) => h.kind)).toEqual(['coordinates', 'phone']);
    await answer(false);
    await outcome;
  });

  it('refuses sample material without showing a review', async () => {
    const { spec: s, send } = spec({ sample: true });

    const outcome = await requestReview(s);

    expect(outcome.status).toBe('refused');
    expect(currentReview()).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('shows one review at a time, in the order asked', async () => {
    const first = spec();
    const second = spec({ act: 'Publish refutation' });
    const shown: string[] = [];
    const stop = subscribeReview((r) => { if (r && !shown.includes(r.id)) shown.push(r.id); });

    const a = requestReview(first.spec);
    const b = requestReview(second.spec);
    await vi.waitFor(() => expect(currentReview()?.act).toBe('Publish finding'));
    await answer(false);
    await vi.waitFor(() => expect(currentReview()?.act).toBe('Publish refutation'));
    await answer(true);
    stop();

    expect((await a).status).toBe('cancelled');
    expect((await b).status).toBe('sent');
    expect(shown).toHaveLength(2);
  });

  it('ignores an answer meant for another review, and a second answer while sending', async () => {
    let release: () => void = () => {};
    const send = vi.fn(() => new Promise<string>((r) => { release = () => r('done'); }));
    const { spec: s } = spec({ send });
    const outcome = requestReview(s);
    await vi.waitFor(() => expect(currentReview()).not.toBeNull());

    decideReview('review-that-is-not-on-screen', true);
    expect(currentReview()!.state).toBe('deciding');

    await answer(true);
    await vi.waitFor(() => expect(currentReview()?.state).toBe('sending'));
    decideReview(currentReview()!.id, true);
    release();

    expect(await outcome).toEqual({ status: 'sent', result: 'done' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('the first publish from a key', () => {
  it('asks "you are the publisher" once per key, and will not send until it is acknowledged', async () => {
    const signer = `${'d'.repeat(63)}1`;
    const { spec: s, send } = spec({ signer });
    const outcome = requestReview(s);
    await vi.waitFor(() => expect(currentReview()).not.toBeNull());
    expect(currentReview()!.firstPublish.acknowledgement?.title).toBe('You are the publisher');

    decideReview(currentReview()!.id, true);
    expect(currentReview()!.state).toBe('deciding');
    expect(send).not.toHaveBeenCalled();

    decideReview(currentReview()!.id, true, { acknowledged: true });
    expect((await outcome).status).toBe('sent');

    const again = spec({ signer });
    const second = requestReview(again.spec);
    await vi.waitFor(() => expect(currentReview()).not.toBeNull());
    expect(currentReview()!.firstPublish.acknowledgement).toBeNull();
    decideReview(currentReview()!.id, true);
    expect((await second).status).toBe('sent');
  });

  it("does not say it goes to public relays when it goes nowhere public, and still asks at the key's first public publish", async () => {
    const signer = `${'f'.repeat(63)}3`;
    const internalOnly = spec({ signer, destinations: [{ address: 'wss://relay.team.example', kind: 'internal' }] });
    const first = requestReview(internalOnly.spec);
    await vi.waitFor(() => expect(currentReview()).not.toBeNull());
    // Its words are about public relays and permanence, which a sealed send to a team relay is not.
    expect(currentReview()!.firstPublish.acknowledgement).toBeNull();
    decideReview(currentReview()!.id, true);
    expect((await first).status).toBe('sent');

    const publicLater = spec({ signer });
    const second = requestReview(publicLater.spec);
    await vi.waitFor(() => expect(currentReview()).not.toBeNull());
    expect(currentReview()!.firstPublish.acknowledgement?.title).toBe('You are the publisher');
    decideReview(currentReview()!.id, false);
    await second;
  });

  it('asks again for a different key, because the liability follows the key', async () => {
    const { spec: s } = spec({ signer: `${'e'.repeat(63)}2` });
    const outcome = requestReview(s);
    await vi.waitFor(() => expect(currentReview()).not.toBeNull());

    expect(currentReview()!.firstPublish.acknowledgement).not.toBeNull();
    decideReview(currentReview()!.id, false);
    await outcome;
  });
});

describe('confirmLabel', () => {
  it('names each kind of destination, and IPFS', () => {
    expect(confirmLabel('Publish Mission Package', PUBLIC_FIVE)).toBe('Publish Mission Package to 5 public relays');
    expect(confirmLabel('Publish', [
      { address: 'wss://a', kind: 'public' }, { address: 'wss://b', kind: 'public' },
      { address: 'wss://team', kind: 'internal' }, { address: 'IPFS', kind: 'ipfs' },
    ])).toBe('Publish to 2 public relays, 1 internal relay and IPFS');
    expect(confirmLabel('Publish', [{ address: 'wss://one', kind: 'public' }])).toBe('Publish to 1 public relay');
  });

  it('says so when there is nowhere to send it', () => {
    expect(confirmLabel('Publish', [])).toBe('Publish: nowhere to send it');
  });
});

describe('findHighlights', () => {
  it('finds coordinates, addresses, emails, phone numbers and long numbers', () => {
    const text = 'At 40.7357, -74.1724, near 150 Broad Street. Write to lead@example.org or call (973) 555-0100. Case 12345678.';
    expect(findHighlights(text)).toEqual([
      { kind: 'coordinates', text: '40.7357, -74.1724' },
      { kind: 'address', text: '150 Broad Street' },
      { kind: 'email', text: 'lead@example.org' },
      { kind: 'phone', text: '(973) 555-0100' },
      { kind: 'long-number', text: '12345678' },
    ]);
  });

  it('reports a span once, under the first pattern that found it', () => {
    expect(findHighlights('Call +1 973-555-0100.').map((h) => h.kind)).toEqual(['phone']);
  });

  it('keeps a sentence\'s full stop out of an address, and an abbreviation\'s in', () => {
    expect(findHighlights('Near 150 Broad Street. Then 12 Main St. again.').map((h) => h.text)).toEqual(['150 Broad Street', '12 Main St.']);
  });

  it('finds nothing in plain words', () => {
    expect(findHighlights('Two of the five sites look closed.')).toEqual([]);
  });
});

describe('freeze', () => {
  it('copies deeply, and the copy cannot be changed', () => {
    const original = { a: { b: [1, 2] } };
    const frozen = freeze(original);
    original.a.b.push(3);
    expect(frozen).toEqual({ a: { b: [1, 2] } });
    expect(() => { (frozen.a.b as number[]).push(4); }).toThrow();
  });
});

/*
 * The job rail (BD13): a confirmed send is a job from when it starts sending to
 * when it ends; the time spent reading the review is not. A send no relay took
 * ends failed, not done.
 */
describe('requestReview on the job rail', () => {
  // The other tests' sends end as jobs too, and a finished job lingers.
  beforeEach(() => jobs.clearForTest());
  afterEach(() => jobs.clearForTest());

  it('lists no job while the person reads, and one while it sends, named by its act', async () => {
    let finish!: (v: string) => void;
    const { spec: s } = spec({ send: () => new Promise<string>((r) => { finish = r; }) });
    const outcome = requestReview(s);
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    expect(jobs.list()).toEqual([]);
    decideReview(currentReview()!.id, true, { acknowledged: true });
    await vi.waitFor(() => expect(jobs.list()).toHaveLength(1));
    expect(jobs.list()[0]).toMatchObject({ kind: 'publish', label: 'Publish finding', state: 'running' });
    finish('ok');
    await outcome;
    expect(jobs.list()[0]).toMatchObject({ state: 'done' });
  });

  it('ends failed when no relay took it, and failed with the reason when sending throws', async () => {
    const { spec: unheard } = spec({ send: (async () => ({ broadcast: { success: false } })) as never });
    const first = requestReview(unheard);
    await answer(true);
    await first;
    expect(jobs.list()[0]).toMatchObject({ state: 'failed', detail: 'no relay took it' });

    const { spec: broken } = spec({ send: async () => { throw new Error('signer timed out'); } });
    const second = requestReview(broken);
    await answer(true);
    await expect(second).rejects.toThrow('signer timed out');
    expect(jobs.list()[1]).toMatchObject({ state: 'failed', detail: 'signer timed out' });
  });
});

/* How old, before a first key; nothing posted under 13 (D-RS, RS39). */
describe('requestReview: age', () => {
  beforeEach(() => { resetAge(); registerAgeAsker(null); });
  afterEach(() => { resetAge(); registerAgeAsker(null); });

  it('refuses anyone who said under 13, showing nothing and sending nothing', async () => {
    setAgeAnswer('under_13');
    const { spec: s, send } = spec();
    expect(await requestReview(s)).toEqual({ status: 'refused', reason: UNDER_13_REFUSAL });
    expect(currentReview()).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('asks how old before a first key, then shows the review', async () => {
    let asked = 0;
    registerAgeAsker(async () => { asked += 1; setAgeAnswer('18_plus'); return ageAnswer(); });
    const { spec: s } = spec({ signer: null });
    const outcome = requestReview(s);
    await answer(true);
    expect(await outcome).toMatchObject({ status: 'sent' });
    expect(asked).toBe(1);
  });

  it('sends nothing when the question is put off', async () => {
    registerAgeAsker(async () => null);
    const { spec: s, send } = spec({ signer: null });
    expect(await requestReview(s)).toEqual({ status: 'cancelled' });
    expect(send).not.toHaveBeenCalled();
  });

  it('asks nothing when there is a key already', async () => {
    let asked = 0;
    registerAgeAsker(async () => { asked += 1; return null; });
    const { spec: s } = spec();
    const outcome = requestReview(s);
    await answer(true);
    expect(await outcome).toMatchObject({ status: 'sent' });
    expect(asked).toBe(0);
  });
});
