/**
 * Whether Starcom Uplink is here, as the app reads it (decision D-EX, E0): absent when no one answers,
 * connected when the bridge does, and noticed without a reload when it is installed with Starcom open.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { BRIDGE_CHANNEL, type ToUplink } from '../protocol';
import { resetUplinkForTests, useStarcomUplink } from '../useStarcomUplink';
import { setLanguage } from '../../i18n/app/i18n';

let installed = false;
/** The language each hello told Uplink, in order. */
let told: Array<string | undefined> = [];
/** How long the bridge takes to answer: none, unless a test says. */
let answerAfterMs = 0;
function bridge() {
  vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
    const { body, direction } = message as { body: ToUplink; direction: string };
    if (direction !== 'to-uplink' || !installed || body.kind !== 'hello') return;
    told.push(body.language);
    const answer = () => window.dispatchEvent(new MessageEvent('message', {
      data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body: { kind: 'hello', id: body.id, extensionVersion: '0.1.0', protocol: 1, capabilities: [] } },
      origin: window.location.origin, source: window,
    }));
    if (answerAfterMs) setTimeout(answer, answerAfterMs);
    else queueMicrotask(answer);
  });
}
const announce = () => window.dispatchEvent(new MessageEvent('message', {
  data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body: { kind: 'present', id: 'present' } },
  origin: window.location.origin, source: window,
}));

afterEach(async () => { resetUplinkForTests(); vi.restoreAllMocks(); installed = false; told = []; answerAfterMs = 0; await setLanguage('en', false); });

describe('useStarcomUplink', () => {
  it('reads absent when Uplink is not installed', async () => {
    bridge();
    const { result } = renderHook(() => useStarcomUplink());
    expect(result.current.status).toBe('checking');
    await waitFor(() => expect(result.current.status).toBe('absent'), { timeout: 2000 });
  });

  it('reads connected, with its version, when the bridge answers', async () => {
    installed = true;
    bridge();
    const { result } = renderHook(() => useStarcomUplink());
    await waitFor(() => expect(result.current).toMatchObject({ status: 'connected', hello: { extensionVersion: '0.1.0' } }));
  });

  it('notices an install the moment the bridge announces itself, with no reload', async () => {
    bridge();
    const { result } = renderHook(() => useStarcomUplink());
    await waitFor(() => expect(result.current.status).toBe('absent'), { timeout: 2000 });
    installed = true;
    act(() => announce());
    await waitFor(() => expect(result.current.status).toBe('connected'));
  });

  it('tells Uplink the language shown, and tells it again the moment it changes (D-ML, ML8)', async () => {
    installed = true;
    bridge();
    const { result } = renderHook(() => useStarcomUplink());
    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(told).toEqual(['en']);
    await act(async () => { await setLanguage('uk', false); });
    await waitFor(() => expect(told).toEqual(['en', 'uk']));
  });

  it('tells Uplink a language that arrives while its first hello is still out', async () => {
    installed = true;
    answerAfterMs = 300;
    bridge();
    const { result } = renderHook(() => useStarcomUplink());
    // The page's own language loads as the first hello goes, as it does when Starcom opens.
    await act(async () => { await setLanguage('hi', false); });
    await waitFor(() => expect(result.current.status).toBe('connected'));
    await waitFor(() => expect(told.at(-1)).toBe('hi'));
  });

  it('asks again when the page gains focus, as when someone comes back from the store', async () => {
    bridge();
    const { result } = renderHook(() => useStarcomUplink());
    await waitFor(() => expect(result.current.status).toBe('absent'), { timeout: 2000 });
    installed = true;
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(result.current.status).toBe('connected'));
  });
});
