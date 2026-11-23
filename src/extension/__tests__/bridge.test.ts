/**
 * Uplink's bridge in a Starcom page (decision D-EX, E0): one bridge answers a page, and a bridge an
 * update cut off goes quiet. Found 2026-10-11: after Uplink reloaded under an open tab, the bridge
 * left in the page answered "Uplink is not running", which reads as not installed.
 *
 * A page here is its script worlds over one window: each world sees the window as its own, keeps its
 * own globals, and hears every message the page posts.
 */
import { describe, expect, it, vi } from 'vitest';
import { BRIDGE_CHANNEL, type ToUplink } from '../protocol';
import { startBridge, type BridgeRuntime } from '../uplink/bridge';

const ORIGIN = 'https://starcom.app';
type Listener = (event: MessageEvent) => unknown;

function page() {
  const listening: Array<{ world: Window; listener: Listener }> = [];
  const posted: Array<{ direction: string; body: { kind: string; id: string; refusal?: string; extensionVersion?: string } }> = [];
  const world = () => {
    const w = {
      location: { origin: ORIGIN },
      addEventListener: (_type: string, listener: Listener) => { listening.push({ world: w, listener }); },
      removeEventListener: (_type: string, listener: Listener) => {
        const at = listening.findIndex((l) => l.listener === listener);
        if (at >= 0) listening.splice(at, 1);
      },
      postMessage: (data: (typeof posted)[number]) => { posted.push(data); },
    } as unknown as Window;
    return w;
  };
  /** The page posts to its own window; every world listening hears it as from its window. */
  const say = async (body: ToUplink) => {
    for (const { world: w, listener } of [...listening]) {
      listener({ source: w, origin: ORIGIN, data: { channel: BRIDGE_CHANNEL, direction: 'to-uplink', body } } as unknown as MessageEvent);
    }
    await new Promise((done) => setTimeout(done, 0));
  };
  const answersTo = (id: string) => posted.filter((p) => p.direction === 'from-uplink' && p.body.id === id).map((p) => p.body);
  return { world, say, answersTo, listening, posted };
}

/** Uplink as one bridge reaches it: connected, answering hello with its version. */
function uplink(version: string, waiting = 0) {
  /** Who is watching the captures waiting, as the browser's storage would tell them. */
  const watchers = new Set<(waiting: number) => void>();
  const runtime = {
    id: 'uplink' as string | undefined,
    watchCaptures: (heard: (waiting: number) => void) => {
      watchers.add(heard);
      if (waiting > 0) heard(waiting);
      return () => { watchers.delete(heard); };
    },
    sendMessage: vi.fn(async (message: unknown) => {
      const { body } = message as { body: ToUplink };
      return { kind: 'hello', id: body.id, extensionVersion: version, protocol: 1, capabilities: [] };
    }),
  };
  /** An update or removal: this script is cut off from Uplink. */
  const cutOff = () => {
    runtime.id = undefined;
    runtime.sendMessage.mockRejectedValue(new Error('Extension context invalidated.'));
  };
  /** A capture arrives in Uplink's storage. */
  const capture = () => { waiting += 1; for (const heard of watchers) heard(waiting); };
  return { runtime: runtime as BridgeRuntime & typeof runtime, cutOff, capture, watchers };
}

const hello = (id: string): ToUplink => ({ kind: 'hello', id, protocol: 1 });

describe("Uplink's bridge", () => {
  it('announces itself, and carries a hello to Uplink and its answer back', async () => {
    const p = page();
    const one = uplink('0.1.0');
    startBridge(p.world(), one.runtime);
    expect(p.answersTo('present')).toEqual([{ kind: 'present', id: 'present' }]);
    await p.say(hello('h1'));
    expect(one.runtime.sendMessage).toHaveBeenCalledWith({ via: 'bridge', body: hello('h1') });
    expect(p.answersTo('h1').map((a) => a.extensionVersion)).toEqual(['0.1.0']);
  });

  it('says "not running" when Uplink is there but does not answer', async () => {
    const p = page();
    const one = uplink('0.1.0');
    one.runtime.sendMessage.mockRejectedValue(new Error('Could not establish connection.'));
    startBridge(p.world(), one.runtime);
    await p.say(hello('h1'));
    expect(p.answersTo('h1')).toEqual([expect.objectContaining({ kind: 'answer', ok: false, refusal: 'unreachable' })]);
  });

  it('added again in the same world, takes the place of the bridge before: one answer', async () => {
    const p = page();
    const w = p.world();
    startBridge(w, uplink('0.1.0').runtime);
    startBridge(w, uplink('0.1.1').runtime);
    await p.say(hello('h1'));
    expect(p.answersTo('h1').map((a) => a.extensionVersion)).toEqual(['0.1.1']);
    expect(p.listening).toHaveLength(1);
  });

  it('cut off by an update, goes quiet and stops listening, so the bridge that replaced it is the one that answers', async () => {
    const p = page();
    const before = uplink('0.1.0');
    startBridge(p.world(), before.runtime);
    before.cutOff();
    startBridge(p.world(), uplink('0.1.1').runtime);
    await p.say(hello('h1'));
    expect(p.answersTo('h1')).toEqual([expect.objectContaining({ kind: 'hello', extensionVersion: '0.1.1' })]);
    expect(p.listening).toHaveLength(1);
  });

  it('cut off by a removal, answers nothing: the page reads Uplink as not here', async () => {
    const p = page();
    const one = uplink('0.1.0');
    startBridge(p.world(), one.runtime);
    one.cutOff();
    await p.say(hello('h1'));
    expect(p.answersTo('h1')).toEqual([]);
    expect(p.listening).toHaveLength(0);
  });

  it('tells the page captures are waiting, and how many: at once when it starts, and as each arrives (E2)', async () => {
    const p = page();
    const one = uplink('0.1.0', 2);
    startBridge(p.world(), one.runtime);
    expect(p.answersTo('captured')).toEqual([{ kind: 'captured', id: 'captured', waiting: 2 }]);
    one.capture();
    expect(p.answersTo('captured').map((n) => (n as { waiting?: number }).waiting)).toEqual([2, 3]);
  });

  it('stops watching for captures when it stops, or when an update cuts it off', async () => {
    const p = page();
    const one = uplink('0.1.0');
    const stop = startBridge(p.world(), one.runtime);
    expect(one.watchers.size).toBe(1);
    stop();
    expect(one.watchers.size).toBe(0);
    const two = uplink('0.1.0');
    startBridge(p.world(), two.runtime);
    two.cutOff();
    two.capture();
    expect(p.answersTo('captured')).toEqual([]);
    expect(two.watchers.size).toBe(0);
  });
});
