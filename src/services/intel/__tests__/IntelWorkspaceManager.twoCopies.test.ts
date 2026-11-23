/**
 * Two copies of Starcom in one browser, one workspace (found 2026-10-11, building Uplink's side panel,
 * decision D-EX, E2, W6). A tab and the side panel are two copies of the app, each with the workspace
 * in memory. A copy saving wrote its whole workspace back, so the one open longer erased what the
 * other had saved since. Now a copy lays only its own changes over what is stored, and hears the other
 * copy's saves, so each sees the other's work without a reload.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { IntelWorkspaceManager } from '../IntelWorkspaceManager';
import type { CreateIntelItemInput } from '../../../types/intel/IntelItemUI';

const item = (title: string): CreateIntelItemInput => ({
  title, type: 'CAPTURE', source: 'news.example.org', reliability: 'F', confidence: 0.9, tags: ['capture'], categories: ['uplink-capture'], content: title,
});
const titles = (copy: IntelWorkspaceManager) => copy.getIntelItems().map((i) => i.title).sort();
const settle = () => new Promise((done) => setTimeout(done, 30));
const copyOpened = async () => {
  const copy = new IntelWorkspaceManager();
  await copy.ensureInitialized();
  return copy;
};

beforeEach(() => {
  localStorage.clear();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

describe('two copies of Starcom, one workspace', () => {
  it('keeps what one copy saved when the copy open since before saves its own', async () => {
    const tab = await copyOpened();
    const panel = await copyOpened();
    panel.addIntelItem(item('Captured in the panel'));
    panel.flushPendingSave();
    tab.addIntelItem(item('Noted in the tab'));
    tab.flushPendingSave();
    await settle();
    expect(titles(await copyOpened())).toEqual(['Captured in the panel', 'Noted in the tab']);
  });

  it('shows each copy what the other saved, without a reload', async () => {
    const tab = await copyOpened();
    const panel = await copyOpened();
    let heard = 0;
    tab.subscribe(() => { heard += 1; });
    panel.addIntelItem(item('Captured in the panel'));
    panel.flushPendingSave();
    await settle();
    expect(titles(tab)).toEqual(['Captured in the panel']);
    expect(heard).toBeGreaterThan(0);
  });

  it('keeps a copy\'s change not yet saved when the other copy\'s save arrives', async () => {
    const tab = await copyOpened();
    const panel = await copyOpened();
    tab.addIntelItem(item('Waiting out the debounce in the tab'));
    panel.addIntelItem(item('Captured in the panel'));
    panel.flushPendingSave();
    await settle();
    expect(titles(tab)).toEqual(['Captured in the panel', 'Waiting out the debounce in the tab']);
    tab.flushPendingSave();
    await settle();
    expect(titles(await copyOpened())).toEqual(['Captured in the panel', 'Waiting out the debounce in the tab']);
  });

  it('keeps gone what one copy took out when the other saves', async () => {
    const tab = await copyOpened();
    const kept = tab.addIntelItem(item('Discarded in the tab'));
    tab.flushPendingSave();
    await settle();
    const panel = await copyOpened();
    tab.removeIntelItem(kept.id);
    tab.flushPendingSave();
    panel.addIntelItem(item('Captured in the panel'));
    panel.flushPendingSave();
    await settle();
    expect(titles(await copyOpened())).toEqual(['Captured in the panel']);
  });
});
