import { describe, it, expect } from 'vitest';
import { produceTakenAskItems, TAKEN_ASK_PRODUCER } from '../takenAskProducer';
import type { TakenAsk } from '../../received/takenAsks';

/*
 * An ask taken on from another node's package is work you chose (plan item
 * 2.6). The package is gone once the relays stop sending it, so the queue is
 * where it is found again.
 */

const SIGNER = 'b778a0d16f78f237bedca54c1a65f893bf0192de4ee5b8530011223344556677';
const taken = (over: Partial<TakenAsk> = {}): TakenAsk => ({
  signer: SIGNER, packageId: 'm-1', packageName: 'Coastal survey handoff', relay: 'wss://relay.example',
  askId: 'o-1', ask: 'Photograph the cranes at berth 4', handsBack: 'three photos', takenAt: '2026-09-28T18:30:00.000Z',
  ...over,
});

describe('produceTakenAskItems', () => {
  it('raises each ask you took on, saying where it came from and what it hands back', () => {
    const [item, ...rest] = produceTakenAskItems({ asks: [taken()], callSigner: () => 'Harbour Watch' });
    expect(rest).toHaveLength(0);
    expect(item).toMatchObject({
      subject: 'Photograph the cranes at berth 4',
      reason: 'ask-you-took-on',
      producedBy: TAKEN_ASK_PRODUCER,
      caseId: '',
      state: 'new',
    });
    expect(item.missionId).toBeUndefined();
    expect(item.explanation).toBe('You took this on from "Coastal survey handoff", a package signed by Harbour Watch, on 28 Sep 2026 18:30Z. It hands back three photos.');
  });

  it('says nothing of what it hands back when the package did not say', () => {
    const [item] = produceTakenAskItems({ asks: [taken({ handsBack: undefined })], callSigner: () => 'Harbour Watch' });
    expect(item.explanation).toBe('You took this on from "Coastal survey handoff", a package signed by Harbour Watch, on 28 Sep 2026 18:30Z.');
  });

  it('is one concern per ask, however often the queue recomputes', () => {
    const a = produceTakenAskItems({ asks: [taken(), taken({ askId: 'o-2' })], callSigner: () => 'x' });
    const b = produceTakenAskItems({ asks: [taken(), taken({ askId: 'o-2' })], callSigner: () => 'x' });
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(new Set(a.map((i) => i.id)).size).toBe(2);
    expect(a[0].id).toContain(SIGNER);
  });

  it('raises nothing when nothing was taken on', () => {
    expect(produceTakenAskItems({ asks: [], callSigner: () => 'x' })).toEqual([]);
  });
});
