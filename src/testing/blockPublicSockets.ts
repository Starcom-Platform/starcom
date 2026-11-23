/**
 * No test reaches a host other than this machine over a WebSocket.
 *
 * Found 2026-09-30: SecureChatIntegrationService.activityLog.test.ts connected
 * the real Nostr service and, while sending, published a prekey bundle for a
 * throwaway identity to relay.primal.net, on every run of the suite. A NOTICE
 * from that relay in the log was the only sign. `fetch` has long been mocked by
 * default (setupVitest.ts); WebSocket was real, in jsdom and in Node alike.
 *
 * setupVitest.ts installs this before any test file is imported, so a library
 * that captures WebSocket when it loads (nostr-tools does) captures this one. A
 * refused socket behaves as an unreachable host does: it never opens, and it
 * reports an error and then a close (1006). A test that needs a relay runs one
 * on localhost, which goes through to the real implementation.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Every address refused in this test file, in order. */
export const refusedSocketUrls: string[] = [];

export function isLocalSocketUrl(url: string | URL): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(String(url)).hostname);
  } catch {
    return false;
  }
}

type SocketHandler = ((ev: Event) => void) | null;

class RefusedWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readonly url: string;
  readyState = 0;
  readonly protocol = '';
  readonly extensions = '';
  readonly bufferedAmount = 0;
  binaryType: BinaryType = 'blob';
  onopen: SocketHandler = null;
  onerror: SocketHandler = null;
  onclose: SocketHandler = null;
  onmessage: SocketHandler = null;

  constructor(url: string) {
    super();
    this.url = url;
    // As a browser does for a host it cannot reach: after the caller has
    // attached its handlers, never synchronously. A microtask, so a test on
    // fake timers sees it too.
    queueMicrotask(() => {
      this.readyState = 3;
      const error = new Event('error');
      this.dispatchEvent(error);
      this.onerror?.(error);
      const close = Object.assign(new Event('close'), {
        code: 1006,
        reason: 'Refused in tests: only local hosts are reachable',
        wasClean: false,
      });
      this.dispatchEvent(close);
      this.onclose?.(close);
    });
  }

  send(): void {
    throw new DOMException('WebSocket is not open', 'InvalidStateError');
  }

  close(): void {
    this.readyState = 3;
  }
}

/**
 * A WebSocket that passes local addresses to `Original` and refuses every other.
 *
 * A subclass of `Original`, so code that extends the global WebSocket keeps
 * its own methods on a local socket: relayConformance.ts does, to stop a
 * close() recursion in Node.
 */
export function guardWebSocket(Original: typeof WebSocket | undefined): typeof WebSocket {
  const Base = (Original ?? RefusedWebSocket) as typeof WebSocket;
  class Guarded extends Base {
    static readonly refusesPublicHosts = true;
    constructor(url: string | URL, protocols?: string | string[]) {
      const address = String(url);
      if (!Original || !isLocalSocketUrl(address)) {
        refusedSocketUrls.push(address);
        // A derived constructor may return an object in place of calling super.
        return new RefusedWebSocket(address) as unknown as Guarded;
      }
      super(address, protocols);
    }
  }
  return Guarded;
}

/** Replace the global WebSocket (and jsdom's window's, if it is another object). */
export function blockPublicSockets(): void {
  const Guarded = guardWebSocket(globalThis.WebSocket);
  globalThis.WebSocket = Guarded;
  if (typeof window !== 'undefined' && window.WebSocket !== Guarded) window.WebSocket = Guarded;
}
