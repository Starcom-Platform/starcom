/**
 * Sending a reviewed report (decision D-MF, MF11–MF12): sealed to the publisher with the day's time, sent when a
 * relay takes it, and an error when none does.
 */
import { describe, it, expect, vi } from 'vitest';

const sealed = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../../nostr/giftWrap', () => ({
  makeRumor: vi.fn(async (template: object, createdAt: number) => ({ ...template, created_at: createdAt, pubkey: 'reporter', id: 'inside' })),
  wrapRumor: vi.fn(async (rumor: { kind: number; tags: unknown; content: string; created_at: number }, recipient: string) => {
    sealed.calls.push([{ kind: rumor.kind, tags: rumor.tags, content: rumor.content }, recipient, rumor.created_at]);
    return { id: 'wrap', kind: 1059 };
  }),
}));

import { sendMissionReport } from '../sendReport';
import type { ReportTemplate } from '../missionReport';

const TEMPLATE: ReportTemplate = { kind: 1, tags: [['a', '30079:p:d'], ['count', 'Kits', '3'], ['day', '2026-10-16']], content: 'Kits: 3', createdAt: 1_792_108_800 };

describe('sendMissionReport', () => {
  it('seals the report to its publisher at the start of its day, counts the relays that took it, and says the id inside the seal', async () => {
    const publish = vi.fn(() => [Promise.resolve('ok'), Promise.reject(new Error('down')), Promise.resolve('ok')]);
    // The id a settlement names (NavCom §5.3), and the key that sealed it, so its sender can read how it stands.
    expect(await sendMissionReport(TEMPLATE, 'publisher', ['wss://a', 'wss://b', 'wss://c'], { publish } as never)).toEqual({ relays: 2, id: 'inside', author: 'reporter' });
    expect(sealed.calls[0]).toEqual([{ kind: 1, tags: TEMPLATE.tags, content: 'Kits: 3' }, 'publisher', 1_792_108_800]);
    expect(publish).toHaveBeenCalledWith(['wss://a', 'wss://b', 'wss://c'], { id: 'wrap', kind: 1059 });
  });

  it('says why when no relay took it', async () => {
    const publish = vi.fn(() => [Promise.reject(new Error('503')), Promise.reject(new Error('closed'))]);
    await expect(sendMissionReport(TEMPLATE, 'publisher', ['wss://a', 'wss://b'], { publish } as never)).rejects.toThrow('No relay took it: 503; closed');
  });
});
