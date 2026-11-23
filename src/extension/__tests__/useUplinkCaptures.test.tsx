/**
 * A Starcom page taking what the person sent from their browser (decision D-EX, E2, W5): with Uplink
 * connected and a capture waiting, the capture is kept in the workspace as an intel item, and only then
 * is Uplink told to let it go; a capture arriving later comes in on the bridge's word.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { BRIDGE_CHANNEL, type Capture, type ToUplink } from '../protocol';
import { resetUplinkForTests } from '../useStarcomUplink';
import { useUplinkCaptures } from '../useUplinkCaptures';
import { CAPTURE_TAG } from '../captureItems';
import { intelWorkspaceManager } from '../../services/intel/IntelWorkspaceManager';

const capture = (id: string, text: string): Capture => ({
  id, kind: 'selection', at: '2026-10-11T21:05:00.000Z', page: { url: 'https://news.example.org/flood', title: 'Flood' }, text,
});

let queue: Capture[] = [];
const asked: string[] = [];
const say = (body: object) => window.dispatchEvent(new MessageEvent('message', {
  data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body }, origin: window.location.origin, source: window,
}));

beforeEach(() => {
  intelWorkspaceManager.resetForTests();
  localStorage.clear();
  vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
    const { body, direction } = message as { body: ToUplink; direction: string };
    if (direction !== 'to-uplink') return;
    if (body.kind === 'hello') {
      queueMicrotask(() => say({ kind: 'hello', id: body.id, extensionVersion: '0.1.0', protocol: 1, capabilities: [], waiting: queue.length }));
      return;
    }
    asked.push(body.capability);
    const result = body.capability === 'captures.read'
      ? { captures: [...queue] }
      : (() => { const ids = (body.args as { ids: string[] }).ids; const before = queue.length; queue = queue.filter((c) => !ids.includes(c.id)); return { released: before - queue.length }; })();
    queueMicrotask(() => say({ kind: 'answer', id: body.id, ok: true, result }));
  });
});

afterEach(() => { resetUplinkForTests(); vi.restoreAllMocks(); queue = []; asked.length = 0; });

describe('useUplinkCaptures', () => {
  it('keeps a capture waiting at hello as an intel item, then lets Uplink let it go', async () => {
    queue = [capture('c1', 'The river rose 3 m overnight.')];
    renderHook(() => useUplinkCaptures());
    await waitFor(() => expect(queue).toEqual([]));
    expect(asked).toEqual(['captures.read', 'captures.kept']);
    const items = intelWorkspaceManager.getIntelItems().filter((i) => i.tags.includes(CAPTURE_TAG));
    expect(items.map((i) => i.title)).toEqual(['The river rose 3 m overnight.']);
  });

  it('takes a capture arriving later, on the bridge\'s word', async () => {
    renderHook(() => useUplinkCaptures());
    await waitFor(() => expect(asked).toEqual([]));
    await new Promise((done) => setTimeout(done, 50));
    queue = [capture('c2', 'Roads closed at the bridge.')];
    act(() => say({ kind: 'captured', id: 'captured', waiting: 1 }));
    await waitFor(() => expect(queue).toEqual([]));
    expect(intelWorkspaceManager.getIntelItems().map((i) => i.title)).toContain('Roads closed at the bridge.');
  });
});
