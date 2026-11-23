/**
 * Publishing and withdrawing an RLSH card (D-RF, RF1, RF3, RF7) through the review: how old is asked before the card's
 * own key is made, and under 13 nothing is made; the card is signed by that key, never the person's Starcom key; the
 * review says who can find it; a withdrawal is NavCom's deletion, in NavCom's words, the key kept or thrown away.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentReview, decideReview } from '../publishReview';

const sent = vi.hoisted(() => [] as Array<{ kind: number; tags: string[][]; content: string; relays: readonly string[] }>);
vi.mock('../../rlsh/sendCard', () => ({
  sendRlshCard: vi.fn(async (template: { kind: number; tags: string[][]; content: string }, relays: readonly string[]) => {
    sent.push({ ...template, relays });
    return { relays: relays.length, event: { id: `event-${sent.length}` } };
  }),
}));

import { reviewRlshCard, reviewRlshWithdrawal, WITHDRAW_WORDS } from '../rlshCards';
import { contactPubkey, reloadContactKey } from '../../rlsh/contactKey';
import { myCard, reloadMyCard } from '../../rlsh/myCard';
import { keyPrint, NAVCOM_PUBLIC_LABEL, RLSH_LABEL, type RlshCardDraft } from '../../rlsh/rlshCard';
import { registerAgeAsker, resetAge, setAgeAnswer, UNDER_13_REFUSAL } from '../../identity/ageAnswer';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { rlshCardRelays } from '../../nostr/publishTargets';

const draft: RlshCardDraft = { callsign: 'Night Beacon', doing: 'Water on the river path.', zone: { id: 'zone:atlas', name: 'Atlas Zone' }, does: ['patrol'], finding: 'public' };
const NOW = Date.UTC(2026, 10, 10, 12);

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

beforeEach(() => {
  sent.length = 0;
  localStorage.clear();
  resetAge();
  registerAgeAsker(null);
  reloadContactKey();
  reloadMyCard();
});

describe('reviewRlshCard', () => {
  it('asks how old before the card\'s key is made, then shows the card and who can find it', async () => {
    const keyWhenAsked: Array<string | null> = [];
    registerAgeAsker(async () => {
      keyWhenAsked.push(contactPubkey());
      setAgeAnswer('18_plus', NOW);
      return { bracket: '18_plus', method: 'self_declared', at: new Date(NOW).toISOString() };
    });
    const outcome = reviewRlshCard(draft, NOW);
    const shown = await answer(true);
    expect(keyWhenAsked).toEqual([null]);
    const key = contactPubkey()!;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toBe(nostrIdentityService.getPubkey());
    expect(shown.signer).toBe(key);
    expect(shown.act).toBe('Publish your RLSH card');
    expect(shown.content.title).toBe('RLSH card: Night Beacon');
    expect(shown.content.body).toBe('Water on the river path.');
    expect(shown.content.fields.find((f) => f.label === 'Who can find it')?.value).toMatch(/navcom\.app/);
    expect(shown.content.fields.find((f) => f.label === 'Signed by')?.value).toContain(keyPrint(key)!);
    expect(shown.destinations.map((d) => d.address)).toEqual(rlshCardRelays());
    expect(await outcome).toEqual({ status: 'sent', result: { relays: rlshCardRelays().length } });
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe(10911);
    expect(sent[0].tags.filter((t) => t[0] === 'l').map((t) => t[1])).toEqual([RLSH_LABEL, NAVCOM_PUBLIC_LABEL]);
    expect(myCard().published).toEqual({ at: new Date(NOW).toISOString(), relays: rlshCardRelays().length, finding: 'public', eventId: 'event-1' });
  });

  it('makes no key and sends nothing for someone who said under 13', async () => {
    setAgeAnswer('under_13', NOW);
    expect(await reviewRlshCard(draft, NOW)).toEqual({ status: 'refused', reason: UNDER_13_REFUSAL });
    expect(contactPubkey()).toBeNull();
    expect(sent).toEqual([]);
  });

  it('makes no key when the age question is left unanswered', async () => {
    registerAgeAsker(async () => null);
    expect(await reviewRlshCard(draft, NOW)).toEqual({ status: 'cancelled' });
    expect(contactPubkey()).toBeNull();
  });

  it('refuses a card without an alias, or with too long a sentence, before anything', async () => {
    expect(await reviewRlshCard({ ...draft, callsign: ' ' }, NOW)).toMatchObject({ status: 'refused' });
    expect(await reviewRlshCard({ ...draft, doing: 'x'.repeat(141) }, NOW)).toMatchObject({ status: 'refused' });
    expect(contactPubkey()).toBeNull();
  });

  it('sends nothing on a no, and keeps the same key for the next try', async () => {
    const first = reviewRlshCard(draft, NOW);
    await answer(false);
    expect(await first).toEqual({ status: 'cancelled' });
    const key = contactPubkey();
    const second = reviewRlshCard(draft, NOW);
    expect((await answer(true)).signer).toBe(key);
    await second;
    expect(sent).toHaveLength(1);
  });
});

describe('reviewRlshWithdrawal', () => {
  it('asks relays to drop the card in NavCom\'s words, and keeps the key unless told to throw it away', async () => {
    const publishing = reviewRlshCard(draft, NOW);
    await answer(true);
    await publishing;
    const key = contactPubkey()!;

    const kept = reviewRlshWithdrawal({ discardKey: false }, NOW + 1000);
    const shown = await answer(true);
    expect(shown.content.body).toBe(WITHDRAW_WORDS);
    expect(WITHDRAW_WORDS).toBe("This changes what you share from now on. It can't unshare what's already out.");
    await kept;
    expect(sent[1]).toMatchObject({ kind: 5, tags: [['a', `10911:${key}:`], ['k', '10911']], content: '' });
    expect(contactPubkey()).toBe(key);
    expect(myCard().published).toBeNull();
    expect(myCard().withdrawnAt).toBe(new Date(NOW + 1000).toISOString());

    const thrown = reviewRlshWithdrawal({ discardKey: true }, NOW + 2000);
    expect((await answer(true)).content.fields.find((f) => f.label === 'The key')?.value).toMatch(/Thrown away/);
    await thrown;
    expect(contactPubkey()).toBeNull();
    expect(await reviewRlshWithdrawal({ discardKey: false }, NOW + 3000)).toMatchObject({ status: 'refused' });
  });
});
