/**
 * An evidence capture as Uplink makes it (decision D-EX, E2, W8; EX14, EX21, EX22): the page's picture,
 * scaled to one width so it tells nothing of the capturer's screen, the page's HTML and its text, each
 * with its SHA-256, kept in Uplink's storage one file to a key until Starcom takes them.
 *
 * @vitest-environment node
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_LIMIT_BYTES, EVIDENCE_WIDTH, evidenceFromPage, fileKeysOf, scaledSize } from '../uplink/evidence';
import { bytesToBase64, base64ToBytes } from '../bytes';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const subtleSha = async (bytes: Uint8Array) => sha(bytes);
const AT = Date.UTC(2026, 9, 12, 0, 20, 0);
const page = { url: 'https://news.example.org/flood', title: 'Floodwater reaches the old town', html: '<!DOCTYPE html><html><body><p>The river rose.</p></body></html>', text: 'The river rose.' };
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

describe('evidenceFromPage', () => {
  it('makes an evidence capture: picture, HTML and text, each with its size and SHA-256, and the width it was scaled to', async () => {
    const made = await evidenceFromPage(page, png, AT, 'ev1', subtleSha);
    if (!('capture' in made)) throw new Error(made.refused);
    expect(made.capture).toEqual({
      id: 'ev1', kind: 'evidence', at: '2026-10-12T00:20:00.000Z', page: { url: page.url, title: page.title },
      scaledTo: EVIDENCE_WIDTH,
      files: [
        { name: 'screenshot.png', type: 'image/png', size: png.length, sha256: sha(png) },
        { name: 'page.html', type: 'text/html', size: new TextEncoder().encode(page.html).length, sha256: sha(new TextEncoder().encode(page.html)) },
        { name: 'text.txt', type: 'text/plain', size: new TextEncoder().encode(page.text).length, sha256: sha(new TextEncoder().encode(page.text)) },
      ],
    });
    expect(made.files['screenshot.png']).toEqual(png);
    expect(new TextDecoder().decode(made.files['page.html'])).toBe(page.html);
  });

  it('refuses the browser\'s own pages and the person\'s files, and a page too large to keep, saying why', async () => {
    expect(await evidenceFromPage({ ...page, url: 'chrome://settings/' }, png, AT, 'ev2', subtleSha))
      .toEqual({ refused: 'Uplink captures from web pages, not the browser\'s own pages or your files' });
    const huge = 'x'.repeat(EVIDENCE_LIMIT_BYTES + 1);
    expect(await evidenceFromPage({ ...page, html: huge }, png, AT, 'ev3', subtleSha))
      .toEqual({ refused: `This page is larger than Uplink keeps as evidence (${EVIDENCE_LIMIT_BYTES / 1_000_000} MB)` });
  });
});

describe('the screenshot\'s size', () => {
  it('is always one width, keeping its shape, so it tells nothing of the screen it was taken on', () => {
    expect(scaledSize(2560, 1440)).toEqual({ width: 1280, height: 720 });
    expect(scaledSize(800, 600)).toEqual({ width: 1280, height: 960 });
    expect(scaledSize(1279, 1000)).toEqual({ width: 1280, height: 1001 });
  });
});

describe('an evidence capture\'s files in Uplink\'s storage', () => {
  it('each have a key of their own, apart from the queue', () => {
    expect(fileKeysOf({ id: 'ev1', files: [{ name: 'screenshot.png' }, { name: 'text.txt' }] })).toEqual(['file:ev1:screenshot.png', 'file:ev1:text.txt']);
    expect(fileKeysOf({ id: 'c1' })).toEqual([]);
  });

  it('travel as base64 and come back as the same bytes', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
