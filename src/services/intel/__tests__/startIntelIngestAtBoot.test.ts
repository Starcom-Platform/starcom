/**
 * The relays are asked while the app boots, not when the globe mounts
 * (decision D-F, step 4.2).
 *
 * Under a software rasterizer a first visit paints the globe at 10.9 s and shows
 * intel at 21.7 s, because the ingest does not start until the globe's effect
 * runs. On hardware the globe mounts at 0.8 s and this changes nothing
 * measurable. It is for the visitors who wait.
 *
 * Boot owns the lifecycle outright. Moving the start alone would have been a
 * regression: the globe starts the ingest inside an effect whose cleanup calls
 * stop(), and that effect re-runs on sub-mode change, layer change, timeline
 * scrub and any refresh-setting change — so a boot-started ingest would have been
 * killed by the first layer switch and never restarted.
 *
 * Shaped after startFindingsOutboxDrain, which runs at app level for the same
 * reason and whose rule this one inherits: never let a failure escape into app
 * startup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const startMock = vi.fn();
const stopMock = vi.fn();
const isActiveMock = vi.fn();

vi.mock('../NostrStarcomIntelIngest', () => ({
  nostrStarcomIntelIngest: {
    start: (...a: unknown[]) => startMock(...a),
    stop: (...a: unknown[]) => stopMock(...a),
    isActive: () => isActiveMock(),
  },
}));

const { startIntelIngestAtBoot } = await import('../startIntelIngestAtBoot');

describe('startIntelIngestAtBoot', () => {
  beforeEach(() => {
    startMock.mockReset();
    stopMock.mockReset();
    isActiveMock.mockReset();
    startMock.mockResolvedValue(undefined);
    isActiveMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the relays without waiting for the globe', async () => {
    startIntelIngestAtBoot();

    await vi.waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
  });

  /*
   * start() awaits a dynamic import of nostr-tools and opens a pool on every
   * configured relay. A machine with no network reachable must still boot.
   */
  it('never lets a failed start escape into app startup', async () => {
    startMock.mockRejectedValue(new Error('no relay reachable'));

    expect(() => startIntelIngestAtBoot()).not.toThrow();
    await vi.waitFor(() => expect(startMock).toHaveBeenCalled());
  });

  /*
   * React 18 StrictMode double-invokes mount effects in development, which is
   * what bootstrapServices' own in-flight guard exists for. start() is
   * idempotent, so the second call is harmless — this pins that it stays so.
   */
  it('is safe to call twice', async () => {
    startIntelIngestAtBoot();
    startIntelIngestAtBoot();

    await vi.waitFor(() => expect(startMock).toHaveBeenCalled());
    expect(() => startIntelIngestAtBoot()).not.toThrow();
  });

  /*
   * The disposer exists so App.tsx's effect cleanup has something to call, in
   * the same shape as startFindingsOutboxDrain. Boot owning the lifecycle means
   * the GLOBE does not stop the ingest; the app teardown still may.
   */
  it('returns a disposer that stops the ingest', () => {
    isActiveMock.mockReturnValue(true);

    const dispose = startIntelIngestAtBoot();
    expect(typeof dispose).toBe('function');

    dispose();
    expect(stopMock).toHaveBeenCalled();
  });

  /*
   * Disposing before the start settles must not leave a pool open behind it.
   * The outbox drain guards the same way with `disposed`.
   */
  it('does not leave the ingest running when disposed during startup', async () => {
    let settle: () => void = () => {};
    startMock.mockReturnValue(new Promise<void>((resolve) => { settle = resolve; }));

    const dispose = startIntelIngestAtBoot();
    dispose();
    isActiveMock.mockReturnValue(true);
    settle();

    await vi.waitFor(() => expect(stopMock).toHaveBeenCalled());
  });

  /*
   * Nothing to do outside a browser. start() returns early without a window, and
   * a boot path that assumed one would fail under any non-DOM runtime.
   */
  it('does nothing without a window', () => {
    const original = globalThis.window;
    // @ts-expect-error — deleting the global is the point of the case
    delete globalThis.window;

    try {
      expect(() => startIntelIngestAtBoot()).not.toThrow();
      expect(startMock).not.toHaveBeenCalled();
    } finally {
      globalThis.window = original;
    }
  });
});
