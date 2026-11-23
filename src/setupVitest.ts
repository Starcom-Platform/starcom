// src/setupVitest.ts
import '@testing-library/jest-dom'; // Import the package directly
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { blockPublicSockets } from './testing/blockPublicSockets';

// Under this project's "@vitest-environment node" per-file override,
// globalThis.crypto is entirely undefined (not merely missing .subtle —
// absent altogether), which breaks anything sourcing randomness from it
// directly, e.g. @noble/ed25519's randomBytes(). Node itself has real
// WebCrypto built in (node:crypto's `webcrypto` export) — vitest's node
// environment just isn't exposing it as a global. Guarded so jsdom-environment
// files (the project default) keep whatever partial `crypto` jsdom already
// provides untouched — this only fills a genuine gap, never overrides it.
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as unknown as { crypto: typeof webcrypto }).crypto = webcrypto;
}

/**
 * jsdom supplies a PARTIAL crypto: `getRandomValues` but no `subtle`.
 *
 * The guard above only fires when crypto is absent altogether, so under the
 * project's default jsdom environment `crypto.subtle` stayed undefined and
 * every WebCrypto call failed with "Cannot read properties of undefined
 * (reading 'importKey')" — 11 failures in PQCryptoService alone, and they
 * looked like a broken service rather than a missing environment.
 *
 * Filled from Node's real WebCrypto, which is what a browser would provide.
 * Only the missing member is added; whatever jsdom does supply is left alone.
 */
if (globalThis.crypto && !('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    value: webcrypto.subtle,
    configurable: true,
  });
}

/**
 * A default fetch mock, REINSTALLED BEFORE EVERY TEST.
 *
 * This used to be assigned once when the setup file loaded. The `afterEach`
 * below calls `vi.restoreAllMocks()`, which strips a `vi.fn()`'s
 * implementation — so from the second test in any file onwards, `fetch`
 * returned `undefined` and every caller died on `response.ok`.
 *
 * The signature of the bug was distinctive and easy to misread: the first test
 * in a file passed and the rest failed, which looks like test pollution or a
 * broken service rather than the harness dismantling its own fixture.
 *
 * A test that wants specific responses still overrides this; a test that wants
 * the real network should not be in the default suite at all.
 */
const defaultFetch = vi.fn();

function installFetchMock() {
  // A test file that installed its OWN fetch owns it. Reassigning
  // `global.fetch` here would swap the object out from under a file that
  // captured the reference at module load — which is exactly what happened to
  // EarthWeatherService, whose `mockFetch` handle went on pointing at an
  // orphan while the code under test called something else. Ten tests failed
  // for a reason that had nothing to do with them.
  if (global.fetch !== defaultFetch) return;

  // Same function identity throughout, only the implementation restored.
  defaultFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
    blob: async () => new Blob(),
    arrayBuffer: async () => new ArrayBuffer(0),
    headers: new Headers(),
    redirected: false,
    statusText: 'OK',
    type: 'basic',
    url: '',
    clone: function () { return this; },
    body: null,
    bodyUsed: false,
  } as Response);
}

global.fetch = defaultFetch;
installFetchMock();
beforeEach(installFetchMock);

// And no WebSocket reaches past this machine: a chat test published to a public
// relay on every run until 2026-09-30. See blockPublicSockets.ts.
blockPublicSockets();

// Polyfill window.matchMedia for RainbowKit/WalletConnect and Globe
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function(query) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  };
}

// Polyfill for canvas to avoid Globe/3D errors
if (typeof window !== 'undefined' && window.HTMLCanvasElement && !window.HTMLCanvasElement.prototype.getContext) {
  window.HTMLCanvasElement.prototype.getContext = () => null;
}

// Mock THREE.TextureLoader for artifact-driven globe tests
vi.mock('three', async (importOriginal) => {
  // Try to import the original module first
  try {
    const originalModule = await importOriginal<typeof import('three')>();
    return {
      ...originalModule,
      TextureLoader: class {
        load(url: string, onLoad: (texture: unknown) => void) {
          // Return a dummy texture object. `offset` is included because real
          // THREE.Texture always has one (a Vector2) — GlobeTextureLoader and other
          // real code assign to `.offset.x`/`.y` directly, which throws if this dummy
          // is missing it.
          const dummyTexture = { image: { src: url }, offset: { x: 0, y: 0 } };
          onLoad(dummyTexture);
          return dummyTexture;
        }
      }
    };
  } catch {
    // If the original module cannot be imported, provide a minimal mock
    return {
      TextureLoader: class {
        load(url: string, onLoad: (texture: unknown) => void) {
          const dummyTexture = { image: { src: url } };
          onLoad(dummyTexture);
          return dummyTexture;
        }
      },
      Vector3: class Vector3 {
        x: number;
        y: number;
        z: number;
        constructor(x = 0, y = 0, z = 0) {
          this.x = x;
          this.y = y;
          this.z = z;
        }
      }
    };
  }
});

// Polyfill ResizeObserver globally for JSDOM-based tests
// Many components (tables, timelines, graphs) rely on ResizeObserver; JSDOM doesn't provide it.
type ResizeObserverCallback = (entries: unknown[], observer: unknown) => void;
type ResizeObserverType = new (callback: ResizeObserverCallback) => {
  observe: (target?: unknown) => void;
  unobserve: (target?: unknown) => void;
  disconnect: () => void;
};

declare global {
  interface Window { ResizeObserver: ResizeObserverType }
}

const g = globalThis as unknown as Window & typeof globalThis;
if (typeof (g as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  class RO {
    constructor(_callback?: ResizeObserverCallback) {}
    observe(_target?: unknown): void {}
    unobserve(_target?: unknown): void {}
    disconnect(): void {}
  }
  Object.defineProperty(g, 'ResizeObserver', { value: RO as unknown as ResizeObserverType, writable: true, configurable: true });
}

afterEach(() => {
  cleanup();

  try {
    vi.runOnlyPendingTimers();
  } catch {
    // Ignore when fake timers are not active
  }

  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();

  try {
    if (typeof window !== 'undefined') {
      window.localStorage?.clear();
      window.sessionStorage?.clear();
    }
  } catch {
    // Ignore storage clear failures in non-standard envs
  }
});

/**
 * Cancel any workspace write still scheduled when a test file ends.
 *
 * IntelWorkspaceManager debounces saves by 300ms. A file that creates records
 * and finishes without waiting leaves a timer armed; it fires during the NEXT
 * file, after that file's `beforeEach` has cleared localStorage, and writes the
 * previous file's workspace into the storage the new one just cleaned. The new
 * file then loads records it never created — a test asserting "2 reports"
 * finds 3.
 *
 * That is D6, and it presented as state leaking between files. It is not:
 * module isolation works, and a probe confirmed a fresh file sees an empty
 * manager. What crosses the boundary is a pending TIMER. It only reproduces in
 * a long sequential run, because that is where files finish close enough
 * together for the 300ms window to still be open — which is exactly why the
 * failure rotated between files and vanished when they were run alone.
 *
 * `afterAll`, so it runs at the file boundary the leak actually crosses.
 * Imported lazily inside the hook and fully guarded: this setup runs for every
 * test file, including ones that mock this module away or never load it.
 */
/**
 * Cancel any workspace write still scheduled when a test file ends.
 *
 * Workspace saves are debounced by 300ms, so a file that creates records and
 * finishes without waiting leaves a write armed. It fires during the NEXT
 * file, after that file's `beforeEach` has cleared localStorage, and writes
 * the previous file's records into the storage the new one just cleaned. The
 * new file then loads records it never created — a test asserting "2 reports"
 * finds 3.
 *
 * Proven with a probe: file A creates two reports and returns; file B clears
 * storage, waits out the 300ms window, and sees A's two reports. With this
 * hook, B sees zero.
 *
 * This is HALF of D6. The other half is that IndexedDB is never cleared
 * between tests — see D6 in docs/build-passes.md, which carries the evidence
 * and why clearing it here proved too expensive to keep.
 *
 * `afterAll`, so it runs at the file boundary the leak actually crosses.
 * Imported lazily and fully guarded: this setup runs for every test file,
 * including ones that mock this module away or never load it.
 */
afterAll(() => {
  /**
   * Hand back any global a test file stubbed.
   *
   * `vi.stubGlobal` is restorable but only if something restores it, and
   * nothing did. One file stubbing `localStorage` at module load leaked that
   * stub to every file after it in the fork — writes silently no-op'd, reads
   * came back undefined, and the victim rotated with file order. Doing this
   * centrally means a future stub cannot cause the same thing by omission.
   */
  vi.unstubAllGlobals();

  /**
   * No mock registry to prune any more. `@vitest/spy` 3 kept every mock in a module-level Set and never
   * removed one, so the afterEach's `vi.restoreAllMocks()` replayed every spy ever made, after every test, for
   * the rest of the fork: one file's `vi.spyOn(globalThis, 'fetch')` overwrote the fetch of every later file
   * (`mockFetch.mockClear is not a function`; test 1 passing and the rest failing; 39 failures, then 17, on an
   * unchanged tree). This block cleared that Set at each file boundary. `@vitest/spy` 5 restores only what
   * `vi.spyOn` replaced and empties its list as it does, so the leak cannot come back (security audit, SA4).
   */
});

afterAll(async () => {
  try {
    const mod = await import('./services/intel/IntelWorkspaceManager');
    // Cancel the scheduled write AND drop the cached workspace. The cache
    // outlives storage teardown under singleFork, so one file's records
    // otherwise arrive in the next.
    mod.intelWorkspaceManager?.resetForTests?.();
  } catch {
    // Module not resolvable here; nothing was scheduled.
  }
});

/**
 * Give every test a FRESH, EMPTY IndexedDB.
 *
 * This is the dominant half of D6, and the cause was inconsistency rather than
 * any single leak.
 *
 * jsdom provides no IndexedDB. But EIGHTEEN test files import
 * `fake-indexeddb`, and the suite runs `pool: 'forks'` with
 * `singleFork: true` — so once any one of them has run, `globalThis.indexedDB`
 * exists for every file after it in that fork. Stores that check for
 * IndexedDB, IntelWorkspaceManager among them, then switch to it as their
 * PRIMARY backing, while teardown only ever cleared localStorage.
 *
 * So whether a file got a clean workspace depended on where it happened to sit
 * relative to those eighteen. That is precisely why the failure rotated
 * between files, only appeared in large runs, and vanished when files were run
 * alone: it was never about which test was wrong, it was about execution
 * order.
 *
 * Replacing the factory is O(1) — a new IDBFactory simply has no databases.
 * Two earlier attempts cleared the data instead and both had to be reverted on
 * cost: `deleteDatabase` BLOCKS while any connection is open, including the
 * manager's own, so every file waited out its timeout and a 35-second run
 * became eight minutes.
 *
 * Assigned unconditionally rather than only where IDB already exists, because
 * conditional availability is the disease. Every file now sees the same thing.
 *
 * `beforeEach`, matching the cadence this file already clears localStorage at.
 * That consistency is the whole point and it was arrived at by measurement:
 * per-FILE reset was tried first and left `relationships-cases` failing four
 * tests even run alone, because those tests read `getRelationships()[0]` and
 * need a clean workspace per test — exactly what the localStorage teardown
 * already gives them. A storage layer that persists across tests while its
 * sibling is wiped between them is the inconsistency, not the fix.
 */
beforeEach(() => {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
});
