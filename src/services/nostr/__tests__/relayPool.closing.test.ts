/**
 * Closing a relay pool (plan item 0.3).
 *
 * nostr-tools' relay close() sends CLOSE for each open subscription, then
 * closes the socket before those sends run, so each lands on a closing socket.
 * A browser logs every one ("WebSocket is already in CLOSING or CLOSED state";
 * six at a time in the 0.1 live runs, one per relay). Closing the socket ends
 * the subscriptions anyway, so the pool sends nothing for them.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SimplePool } from 'nostr-tools';

// nostr-tools takes the global WebSocket once, as it loads, so the recording
// socket has to be in place before anything imports it.
const late = vi.hoisted(() => {
  const sentLate: string[] = [];
  const Native = globalThis.WebSocket;
  globalThis.WebSocket = class RecordingSocket extends Native {
    override send(data: Parameters<WebSocket['send']>[0]): void {
      if (this.readyState !== Native.OPEN) sentLate.push(String(data));
      super.send(data);
    }
  };
  return sentLate;
});

import { createRelayPool } from '../relayPool';
import { standInRelay, stopStandInRelays } from './standInRelay';

let relays: SimplePool;

beforeEach(() => {
  late.length = 0;
  relays = createRelayPool();
});

afterEach(async () => {
  relays.destroy();
  await stopStandInRelays();
});

/** A read that has had everything the relay holds, and the reasons it ended with. */
async function reading(url: string): Promise<string[]> {
  const ended: string[] = [];
  await new Promise<void>((resolve) => {
    relays.subscribeMany([url], { kinds: [1] }, {
      oneose: () => resolve(),
      onclose: (reasons) => { ended.push(...reasons.map((r) => r.reason)); },
    });
  });
  return ended;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('closing a relay pool', () => {
  it('sends nothing on a socket it is closing, and still tells the reader', async () => {
    const open = await standInRelay({ requiresSignIn: false });
    const ended = await reading(open.url);

    relays.close([open.url]);
    await settle();
    expect(late).toEqual([]);
    expect(ended).toEqual(['relay connection closed by us']);
  });

  it('does the same when the whole pool is destroyed', async () => {
    const open = await standInRelay({ requiresSignIn: false });
    const ended = await reading(open.url);

    relays.destroy();
    await settle();
    expect(late).toEqual([]);
    expect(ended).toEqual(['relay connection closed by us']);
  });

  it('still closes a subscription its owner ends while the relay stays open', async () => {
    const open = await standInRelay({ requiresSignIn: false });
    const ended: string[] = [];
    const closing = await new Promise<{ close: (reason?: string) => void }>((resolve) => {
      const sub = relays.subscribeMany([open.url], { kinds: [1] }, {
        oneose: () => resolve(sub),
        onclose: (reasons) => { ended.push(...reasons.map((r) => r.reason)); },
      });
    });

    closing.close('done reading');
    await settle();
    expect(open.closes).toHaveLength(1);
    expect(ended).toEqual(['done reading']);
    expect(late).toEqual([]);
  });
});
