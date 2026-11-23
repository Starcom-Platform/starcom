/**
 * Starcom's side of the bridge to Starcom Uplink (decision D-EX): a hello that finds it or finds no
 * one, requests answered by id, and nothing taken from another window or another channel.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_CHANNEL, type FromUplink, type ToUplink } from '../protocol';
import { createUplinkClient } from '../uplinkClient';

/** A stand-in for the extension's bridge: answers what the page posts, from this window, as the bridge does. */
function bridge(answer: (body: ToUplink) => FromUplink | null) {
  const post = vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
    const { body } = message as { body: ToUplink; direction: string };
    if ((message as { direction: string }).direction !== 'to-uplink') return;
    const reply = answer(body);
    if (!reply) return;
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {
      data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body: reply },
      origin: window.location.origin,
      source: window,
    })));
  });
  return post;
}

afterEach(() => vi.restoreAllMocks());

describe('finding Uplink', () => {
  it('says hello and reads what Uplink can do', async () => {
    bridge((body) => (body.kind === 'hello'
      ? { kind: 'hello', id: body.id, extensionVersion: '0.1.0', protocol: 1, capabilities: [{ id: 'activity.read', ready: true }] }
      : null));
    const client = createUplinkClient();
    const hello = await client.hello(200);
    expect(hello).toMatchObject({ extensionVersion: '0.1.0', protocol: 1 });
    expect(hello!.capabilities).toEqual([{ id: 'activity.read', ready: true }]);
    client.dispose();
  });

  it('sends a purpose\'s English beside it, only when it is said in another language (D-ML, ML9)', async () => {
    const sent: ToUplink[] = [];
    bridge((body) => { sent.push(body); return body.kind === 'request' ? { kind: 'answer', id: body.id, ok: true, result: { granted: [] } } : null; });
    const client = createUplinkClient();
    await client.request('permissions.status', 'Показати, до яких сайтів Uplink має доступ', {}, 200, 'Show which sites Uplink may reach');
    await client.request('permissions.status', 'Show which sites Uplink may reach', {}, 200, 'Show which sites Uplink may reach');
    expect(sent.map((b) => (b as { purposeInEnglish?: string }).purposeInEnglish)).toEqual(['Show which sites Uplink may reach', undefined]);
    client.dispose();
  });

  it('finds no one when Uplink is not installed, and says so as null, not an error', async () => {
    bridge(() => null);
    const client = createUplinkClient();
    await expect(client.hello(50)).resolves.toBeNull();
    client.dispose();
  });
});

describe('an install noticed', () => {
  it('hears the bridge announce itself, as it does when Uplink is installed with Starcom open', async () => {
    const client = createUplinkClient();
    const heard = vi.fn();
    const stop = client.onPresent(heard);
    window.dispatchEvent(new MessageEvent('message', {
      data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body: { kind: 'present', id: 'present' } },
      origin: window.location.origin, source: window,
    }));
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new MessageEvent('message', {
      data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body: { kind: 'present', id: 'present' } },
      origin: window.location.origin, source: window,
    }));
    expect(heard).toHaveBeenCalledTimes(1);
    client.dispose();
  });
});

describe('captures waiting (E2)', () => {
  it('hears how many captures wait, and never mistakes the notice for an answer', async () => {
    const client = createUplinkClient();
    const heard = vi.fn();
    const presence = vi.fn();
    const stop = client.onCaptured(heard);
    client.onPresent(presence);
    window.dispatchEvent(new MessageEvent('message', {
      data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body: { kind: 'captured', id: 'captured', waiting: 2 } },
      origin: window.location.origin, source: window,
    }));
    expect(heard).toHaveBeenCalledWith(2);
    expect(presence).not.toHaveBeenCalled();
    stop();
    window.dispatchEvent(new MessageEvent('message', {
      data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body: { kind: 'captured', id: 'captured', waiting: 3 } },
      origin: window.location.origin, source: window,
    }));
    expect(heard).toHaveBeenCalledTimes(1);
    client.dispose();
  });
});

describe('asking Uplink', () => {
  it('sends the purpose with the request, and gets its own answer back by id', async () => {
    const post = bridge((body) => (body.kind === 'request'
      ? { kind: 'answer', id: body.id, ok: true, result: { granted: ['https://example.com/*'], allSites: false } }
      : null));
    const client = createUplinkClient();
    const answer = await client.request('permissions.status', 'Show which sites NetRunner may scan', {}, 200);
    expect(answer).toMatchObject({ ok: true, result: { granted: ['https://example.com/*'], allSites: false } });
    expect(post.mock.calls[0][0]).toMatchObject({ direction: 'to-uplink', body: { purpose: 'Show which sites NetRunner may scan' } });
    expect(post.mock.calls[0][1]).toBe(window.location.origin);
    client.dispose();
  });

  it('refuses a request with no purpose before it leaves the page', async () => {
    const post = bridge(() => null);
    const client = createUplinkClient();
    const answer = await client.request('activity.read', 'why', {}, 50);
    expect(answer).toMatchObject({ ok: false, refusal: 'refused', reason: 'the purpose is too short to say why' });
    expect(post).not.toHaveBeenCalled();
    client.dispose();
  });

  it('calls an unanswered request "could not reach", never a hang', async () => {
    bridge(() => null);
    const client = createUplinkClient();
    await expect(client.request('activity.read', 'Show the activity log', {}, 50))
      .resolves.toMatchObject({ ok: false, refusal: 'unreachable', reason: 'Uplink did not answer' });
    client.dispose();
  });

  it('takes no answer from another window, or from outside its channel', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      const { body } = message as { body: ToUplink };
      queueMicrotask(() => {
        // From another window (a frame), and then off our channel: neither is Uplink's.
        window.dispatchEvent(new MessageEvent('message', {
          data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body: { kind: 'answer', id: body.id, ok: true, result: { entries: [] } } },
          origin: window.location.origin, source: null,
        }));
        window.dispatchEvent(new MessageEvent('message', {
          data: { channel: 'other', direction: 'from-uplink', body: { kind: 'answer', id: body.id, ok: true, result: { entries: [] } } },
          origin: window.location.origin, source: window,
        }));
      });
    });
    const client = createUplinkClient();
    await expect(client.request('activity.read', 'Show the activity log', {}, 80)).resolves.toMatchObject({ ok: false, refusal: 'unreachable' });
    client.dispose();
  });
});
