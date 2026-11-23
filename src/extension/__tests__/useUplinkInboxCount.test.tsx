/**
 * Starcom telling Uplink how many captures wait to be filed, for its toolbar icon (decision D-EX, E2,
 * W7): when Uplink connects, and again only when the count changes, so the activity log is not filled
 * with the same number.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { BRIDGE_CHANNEL, type ToUplink } from '../protocol';
import { resetUplinkForTests } from '../useStarcomUplink';
import { resetInboxCountForTests, useUplinkInboxCount } from '../useUplinkInboxCount';
import { captureToItem } from '../captureItems';
import { intelWorkspaceManager } from '../../services/intel/IntelWorkspaceManager';

const reported: number[] = [];
/** What Uplink's icon shows when it says hello; undefined for an Uplink too old to say. */
let shown: number | undefined;
const say = (body: object) => window.dispatchEvent(new MessageEvent('message', {
  data: { channel: BRIDGE_CHANNEL, direction: 'from-uplink', body }, origin: window.location.origin, source: window,
}));
const addCapture = (id: string) => intelWorkspaceManager.addIntelItem(captureToItem({
  id, kind: 'page', at: '2026-10-11T21:05:00.000Z', page: { url: 'https://news.example.org/', title: id },
}));

beforeEach(async () => {
  intelWorkspaceManager.resetForTests();
  localStorage.clear();
  await intelWorkspaceManager.ensureInitialized();
  vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
    const { body, direction } = message as { body: ToUplink; direction: string };
    if (direction !== 'to-uplink') return;
    if (body.kind === 'hello') {
      queueMicrotask(() => say({ kind: 'hello', id: body.id, extensionVersion: '0.1.0', protocol: 1, capabilities: [], waiting: 0, ...(shown === undefined ? {} : { inbox: shown }) }));
      return;
    }
    if (body.capability === 'inbox.count') reported.push((body.args as { count: number }).count);
    queueMicrotask(() => say({ kind: 'answer', id: body.id, ok: true, result: {} }));
  });
});
afterEach(() => { resetUplinkForTests(); resetInboxCountForTests(); vi.restoreAllMocks(); reported.length = 0; shown = undefined; });

describe('useUplinkInboxCount', () => {
  it('says the count when Uplink connects, and again only when it changes', async () => {
    addCapture('a');
    renderHook(() => useUplinkInboxCount());
    await waitFor(() => expect(reported).toEqual([1]));
    addCapture('b');
    await waitFor(() => expect(reported).toEqual([1, 2]));
    intelWorkspaceManager.addIntelItem({ ...captureToItem({ id: 'x', kind: 'page', at: '2026-10-11T21:05:00.000Z', page: { url: 'https://a.example/' } }), tags: ['other'], categories: ['other'] });
    await new Promise((done) => setTimeout(done, 800));
    expect(reported).toEqual([1, 2]);
  });

  it('says nothing on connect when Uplink\'s icon already shows the count', async () => {
    shown = 1;
    addCapture('a');
    renderHook(() => useUplinkInboxCount());
    await new Promise((done) => setTimeout(done, 800));
    expect(reported).toEqual([]);
    addCapture('b');
    await waitFor(() => expect(reported).toEqual([2]));
  });

  it('does not repeat a count another Starcom page has just said', async () => {
    shown = 1;
    addCapture('a');
    renderHook(() => useUplinkInboxCount());
    await new Promise((done) => setTimeout(done, 800));
    // Another tab, or the side panel, said 2 first: this page sees the same change and stays quiet.
    localStorage.setItem('starcom-uplink-inbox-said', '2');
    addCapture('b');
    await new Promise((done) => setTimeout(done, 800));
    expect(reported).toEqual([]);
  });

  it('says nothing of a count that passes: a page catching up never announces its older view', async () => {
    shown = 1;
    addCapture('a');
    renderHook(() => useUplinkInboxCount());
    await new Promise((done) => setTimeout(done, 800));
    // For a moment this page's view lacks the capture, then has it again.
    const item = intelWorkspaceManager.getIntelItems().find((i) => i.title === 'a')!;
    intelWorkspaceManager.removeIntelItem(item.id);
    addCapture('a2');
    await new Promise((done) => setTimeout(done, 800));
    expect(reported).toEqual([]);
  });
});
