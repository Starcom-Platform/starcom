import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout } from '../fetchWithTimeout';

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('resolves normally when the server responds before the timeout', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ hello: 'world' })
    });

    const result = await fetchWithTimeout('https://example.com', 5000);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ hello: 'world' });
  });

  // The failure mode this guards against: a server that accepts the
  // connection but never responds — a plain `fetch()` with no timeout
  // would hang the calling promise chain forever. This simulates that by
  // never resolving the mocked fetch except in reaction to the abort
  // signal firing, matching real fetch() behavior when aborted.
  it('aborts and rejects once the timeout elapses on a hung request', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    global.fetch = vi.fn((_url: string, opts?: { signal?: AbortSignal }) => {
      capturedSignal = opts?.signal;
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const promise = fetchWithTimeout('https://example.com', 1000);
    const expectation = expect(promise).rejects.toThrow(/aborted/i);

    await vi.advanceTimersByTimeAsync(1000);
    await expectation;

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('does not fire the abort timer once the request already resolved', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) });

    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    await fetchWithTimeout('https://example.com', 1000);
    await vi.advanceTimersByTimeAsync(5000);

    expect(abortSpy).not.toHaveBeenCalled();
  });
});
