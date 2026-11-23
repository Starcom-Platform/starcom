/**
 * What the person sends to Starcom while browsing, as Uplink keeps it until Starcom takes it
 * (decision D-EX, E2; EX14, EX16): what a right-click captures, what it refuses and why, and a queue
 * that refuses a capture when full rather than drop one.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import type { Capture } from '../protocol';
import { CAPTURES_WAITING, SELECTION_KEPT, badgeFor, captureFromClick, keptOut, queueWith, whatWasSent } from '../uplink/captures';

const AT = Date.UTC(2026, 9, 11, 21, 5, 0);
const PAGE = 'https://news.example.org/2026/10/flood';
const tab = { url: PAGE, title: 'Floodwater reaches the old town' };

describe('a capture from a right-click', () => {
  it('keeps a selection with the page it came from and when, in UTC', () => {
    const made = captureFromClick({ selectionText: 'The river rose 3 m overnight.', pageUrl: PAGE }, tab, AT, 'c1');
    expect(made).toEqual({
      capture: {
        id: 'c1', kind: 'selection', at: '2026-10-11T21:05:00.000Z',
        page: { url: PAGE, title: 'Floodwater reaches the old town' }, text: 'The river rose 3 m overnight.',
      },
    });
  });

  it('takes a link, an image or the page when nothing is selected; a selection inside a link keeps both', () => {
    expect(captureFromClick({ linkUrl: 'https://gov.example/notice', pageUrl: PAGE }, tab, AT, 'c2'))
      .toMatchObject({ capture: { kind: 'link', link: 'https://gov.example/notice' } });
    expect(captureFromClick({ srcUrl: 'https://cdn.example.org/bridge.jpg', mediaType: 'image', linkUrl: 'https://gov.example/x', pageUrl: PAGE }, tab, AT, 'c3'))
      .toMatchObject({ capture: { kind: 'image', image: 'https://cdn.example.org/bridge.jpg', link: 'https://gov.example/x' } });
    expect(captureFromClick({ pageUrl: PAGE }, tab, AT, 'c4')).toMatchObject({ capture: { kind: 'page', page: { url: PAGE } } });
    expect(captureFromClick({ selectionText: 'the notice', linkUrl: 'https://gov.example/notice', pageUrl: PAGE }, tab, AT, 'c5'))
      .toMatchObject({ capture: { kind: 'selection', text: 'the notice', link: 'https://gov.example/notice' } });
  });

  it('cuts a very long selection, and says it was cut', () => {
    const made = captureFromClick({ selectionText: 'x'.repeat(SELECTION_KEPT + 10), pageUrl: PAGE }, tab, AT, 'c6');
    expect(made).toMatchObject({ capture: { cut: true } });
    expect('capture' in made && made.capture.text?.length).toBe(SELECTION_KEPT);
  });

  it('names the page by the tab\'s title only when the tab is that page', () => {
    const made = captureFromClick({ pageUrl: PAGE }, { url: 'https://other.example/', title: 'Another page' }, AT, 'c7');
    expect(made).toMatchObject({ capture: { page: { url: PAGE } } });
    expect('capture' in made && made.capture.page.title).toBeUndefined();
  });

  it('refuses the browser\'s own pages and the person\'s files, saying why', () => {
    for (const pageUrl of ['chrome://settings/', 'file:///Users/someone/notes.txt', 'about:blank', 'brave://wallet/']) {
      expect(captureFromClick({ pageUrl }, undefined, AT, 'c8')).toEqual({ refused: 'Uplink captures from web pages, not the browser\'s own pages or your files' });
    }
  });

  it('refuses an image held inside the page, saying how to keep it, and keeps no link that is not the web', () => {
    expect(captureFromClick({ srcUrl: 'data:image/png;base64,AAAA', mediaType: 'image', pageUrl: PAGE }, tab, AT, 'c9'))
      .toEqual({ refused: 'This image is held inside the page; capture the page as evidence to keep it' });
    const made = captureFromClick({ linkUrl: 'javascript:void(0)', pageUrl: PAGE }, tab, AT, 'c10');
    expect(made).toMatchObject({ capture: { kind: 'page' } });
    expect('capture' in made && made.capture.link).toBeUndefined();
  });
});

describe('the activity log\'s words for what was sent', () => {
  it('names it as the person would, whether or not it was kept', () => {
    expect(whatWasSent({ selectionText: 'x', linkUrl: 'https://a.example/' })).toBe('a selection');
    expect(whatWasSent({ srcUrl: 'data:image/png;base64,AA', mediaType: 'image' })).toBe('an image');
    expect(whatWasSent({ linkUrl: 'https://a.example/' })).toBe('a link');
    expect(whatWasSent({ pageUrl: PAGE })).toBe('a page');
  });
});

describe('the captures waiting for Starcom', () => {
  const capture = (id: string): Capture => ({ id, kind: 'page', at: '2026-10-11T21:05:00.000Z', page: { url: PAGE } });

  it('keeps each capture in the order it came', () => {
    expect(queueWith([capture('a')], capture('b'))).toEqual({ queue: [capture('a'), capture('b')] });
  });

  it('refuses a capture when full, rather than drop one already kept', () => {
    const full = Array.from({ length: CAPTURES_WAITING }, (_, i) => capture(`q${i}`));
    expect(queueWith(full, capture('late'))).toEqual({ refused: `${CAPTURES_WAITING} captures are waiting for Starcom; open Starcom to take them in` });
  });

  it('lets go of only the captures Starcom says it kept', () => {
    expect(keptOut([capture('a'), capture('b'), capture('c')], ['a', 'c', 'zz'])).toEqual({ queue: [capture('b')], released: 2 });
  });
});

describe('the toolbar icon (W7)', () => {
  it('counts every capture not yet filed: waiting for Starcom, and in Starcom\'s inbox', () => {
    expect(badgeFor(0, 0)).toEqual({ text: '', title: 'Starcom Uplink' });
    expect(badgeFor(2, 0)).toEqual({ text: '2', title: 'Starcom Uplink: 2 to file, 2 waiting for Starcom to open' });
    expect(badgeFor(0, 5)).toEqual({ text: '5', title: 'Starcom Uplink: 5 to file' });
    expect(badgeFor(1, 4)).toEqual({ text: '5', title: 'Starcom Uplink: 5 to file, 1 waiting for Starcom to open' });
    expect(badgeFor(0, 1234).text).toBe('999+');
  });
});

