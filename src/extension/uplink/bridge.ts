/**
 * The bridge between Starcom's page and Uplink (decision D-EX, E0), as Uplink's content script runs
 * it: it carries a message the page posts to its own window to the extension, and the answer back. It
 * passes nothing but our channel's messages, from the page's own window.
 *
 * One bridge answers a page. Uplink adds the bridge to Starcom tabs already open when it is installed
 * or updated, and an update leaves the bridge before it in the page, cut off from Uplink. A bridge
 * added again takes the place of one in its own script world; a bridge cut off, in whatever world,
 * goes quiet and stops listening, rather than answer "not running" ahead of the bridge that replaced
 * it. A page whose Uplink was removed hears nothing, which is how the app reads "not installed".
 *
 * It also tells the page when captures are waiting for Starcom, and how many (E2): as it starts, and
 * as each arrives, by watching Uplink's own storage, so every Starcom page hears it, a tab or the side
 * panel's, with nothing to track and nothing woken. The page then asks for them as for anything else.
 */
import { BRIDGE_CHANNEL, isBridgeMessage, refusal } from '../protocol';

export interface BridgeRuntime {
  /** Uplink's id while this script is connected to it; undefined once an update or removal cuts it off. */
  readonly id: string | undefined;
  sendMessage(message: unknown): Promise<unknown>;
  /** Calls `heard` with how many captures wait, now if any do and on each change; returns how to stop. */
  watchCaptures?(heard: (waiting: number) => void): () => void;
}

/** Where a bridge leaves how to stop it, so a bridge added again in the same world replaces it. */
const MARK = '__starcomUplinkBridge';

/** Starts the bridge in this page; returns how to stop it. */
export function startBridge(win: Window, runtime: BridgeRuntime): () => void {
  const marked = win as unknown as Record<typeof MARK, (() => void) | undefined>;
  marked[MARK]?.();

  const post = (body: unknown) => win.postMessage({ channel: BRIDGE_CHANNEL, direction: 'from-uplink', body }, win.location.origin);
  const listen = async (event: MessageEvent) => {
    if (event.source !== win || event.origin !== win.location.origin) return;
    if (!isBridgeMessage(event.data, 'to-uplink')) return;
    if (!runtime.id) return stop();
    const { body } = event.data;
    let answer: unknown;
    try {
      answer = await runtime.sendMessage({ via: 'bridge', body });
    } catch {
      if (!runtime.id) return stop();
      answer = refusal(body.id, 'unreachable', 'Uplink is not running');
    }
    if (answer) post(answer);
  };
  let unwatch: (() => void) | undefined;
  const stop = () => {
    win.removeEventListener('message', listen);
    unwatch?.();
    unwatch = undefined;
    if (marked[MARK] === stop) marked[MARK] = undefined;
  };

  win.addEventListener('message', listen);
  marked[MARK] = stop;
  // Arrived: a Starcom page open when Uplink was installed or updated notices without a reload.
  post({ kind: 'present', id: 'present' });
  let stopped = false;
  const watching = runtime.watchCaptures?.((waiting) => {
    if (stopped) return;
    if (!runtime.id) { stop(); return; }
    post({ kind: 'captured', id: 'captured', waiting });
  });
  // Stopped while it was starting to watch (cut off at once): let go of the watch too.
  unwatch = () => { stopped = true; watching?.(); };
  if (marked[MARK] !== stop) unwatch();
  return stop;
}
