/**
 * The Wayback Machine in NetRunner (decision D-EX, EX34, W10d): a page's snapshots listed, two the
 * person picks compared, and the Archive credited. The Archive allows research use and bars storing
 * personal data, so nothing is kept from a snapshot unless the person files it, and filing keeps its
 * address, time and digest, never the page.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  WAYBACK_TAG, cdxUrl, citesTheArchive, closestSnapshot, diffLines, listSnapshots, pageText, parseCdx, snapshotToItem, waybackTime,
} from '../wayback';
import { CAPTURE_CATEGORY, CAPTURE_TAG } from '../../../../extension/captureItems';

const CDX = [
  ['timestamp', 'original', 'statuscode', 'digest', 'length'],
  ['20240101093000', 'https://example.org/', '200', 'AAAA', '1091'],
  ['20250601120000', 'https://example.org/', '200', 'BBBB', '1200'],
  ['garbage'],
];

describe('reading the Archive\'s answers', () => {
  it('turns its 14-digit times into UTC', () => {
    expect(waybackTime('20240101093005')).toBe('2024-01-01T09:30:05Z');
    expect(waybackTime('2024')).toBeNull();
  });

  it('asks the index for distinct contents, newest last, and lists them newest first', () => {
    expect(cdxUrl('example.org/a b')).toBe('https://web.archive.org/cdx/search/cdx?url=example.org%2Fa%20b&output=json&fl=timestamp,original,statuscode,digest,length&collapse=digest&limit=-200');
    const list = parseCdx(CDX);
    expect(list.map((s) => s.at)).toEqual(['2025-06-01T12:00:00Z', '2024-01-01T09:30:00Z']);
    expect(list[0]).toEqual({
      timestamp: '20250601120000', at: '2025-06-01T12:00:00Z', original: 'https://example.org/', status: '200', digest: 'BBBB', length: 1200,
      replay: 'https://web.archive.org/web/20250601120000/https://example.org/',
      raw: 'https://web.archive.org/web/20250601120000id_/https://example.org/',
    });
    expect(parseCdx({ not: 'rows' })).toEqual([]);
  });

  it('reads the closest snapshot from the availability answer, or none', () => {
    expect(closestSnapshot({ archived_snapshots: { closest: { available: true, status: '200', timestamp: '20261012020440', url: 'http://web.archive.org/web/20261012020440/https://example.com/' } } }))
      .toMatchObject({ at: '2026-10-12T02:04:40Z', original: 'https://example.com/', status: '200', raw: 'https://web.archive.org/web/20261012020440id_/https://example.com/' });
    expect(closestSnapshot({ archived_snapshots: {} })).toBeNull();
  });
});

describe('listSnapshots', () => {
  const PURPOSE_HAS_HOST = /example\.org/;

  it('reads the full index through Uplink or the desktop app, saying why, with the site in the purpose', async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, body: JSON.stringify(CDX) }));
    const result = await listSnapshots('https://example.org/', { via: 'uplink', fetch } as never);
    expect(result).toMatchObject({ complete: true, via: 'uplink' });
    expect(result.snapshots).toHaveLength(2);
    expect(fetch.mock.calls[0][1]).toMatch(PURPOSE_HAS_HOST);
  });

  it('in a plain browser, gives the closest snapshot only, and says the full list needs Uplink', async () => {
    const plain = vi.fn(async () => ({ ok: true, json: async () => ({ archived_snapshots: { closest: { available: true, status: '200', timestamp: '20240101093000', url: 'http://web.archive.org/web/20240101093000/https://example.org/' } } }) }));
    const result = await listSnapshots('https://example.org/', null, plain as never);
    expect(plain.mock.calls[0][0]).toBe('https://archive.org/wayback/available?url=https%3A%2F%2Fexample.org%2F');
    expect(result).toMatchObject({ complete: false, note: 'Only the closest snapshot: the full list needs Starcom Uplink or the desktop app.' });
    expect(result.snapshots).toHaveLength(1);
  });

  it('says it could not look when the Archive does not answer, never that nothing was archived', async () => {
    await expect(listSnapshots('https://example.org/', { via: 'uplink', fetch: async () => ({ ok: false, status: 503, body: '' }) } as never))
      .rejects.toThrow('The Wayback Machine answered 503');
  });
});

describe('pageText', () => {
  it('keeps what a reader sees, a line per block, without scripts or styles', () => {
    const html = '<html><head><title>T</title><style>p{}</style></head><body><h1>Flood  board</h1><p>River at <b>4.2 m</b>.</p><script>var x=1</script><ul><li>Gauge A</li><li>Gauge B</li></ul></body></html>';
    expect(pageText(html)).toEqual(['Flood board', 'River at 4.2 m.', 'Gauge A', 'Gauge B']);
  });
});

describe('diffLines', () => {
  it('says what was removed and added, in order', () => {
    const d = diffLines(['A', 'B', 'C'], ['A', 'C', 'D']);
    expect(d.exact).toBe(true);
    expect(d.ops).toEqual([
      { kind: 'same', text: 'A' }, { kind: 'removed', text: 'B' }, { kind: 'same', text: 'C' }, { kind: 'added', text: 'D' },
    ]);
    expect([d.added, d.removed]).toEqual([1, 1]);
  });

  it('falls back to which lines appear only on one side, and says so, when the pages are too large to align', () => {
    const d = diffLines(['A', 'B'], ['B', 'C'], 1);
    expect(d.exact).toBe(false);
    expect(d.ops).toEqual([{ kind: 'removed', text: 'A' }, { kind: 'added', text: 'C' }]);
  });
});

describe('filing a snapshot', () => {
  const snapshot = parseCdx(CDX)[0];

  it('keeps its address, time and digest as a capture to file, crediting the Archive, never the page', () => {
    const item = snapshotToItem(snapshot);
    expect(item).toMatchObject({
      type: 'CAPTURE', source: 'web.archive.org', reliability: 'F', verified: false,
      tags: [CAPTURE_TAG, WAYBACK_TAG], categories: [CAPTURE_CATEGORY], collectedAt: '2025-06-01T12:00:00Z',
    });
    expect(item.title).toBe('Wayback snapshot: example.org, 1 Jun 2025');
    expect(item.content).toContain('<https://web.archive.org/web/20250601120000/https://example.org/>');
    expect(item.content).toContain('Internet Archive');
    expect(item.content).toContain('BBBB');
  });

  it('knows when a case rests on a snapshot, so its published finding credits the Archive', () => {
    const items = [{ id: 'w1', tags: [CAPTURE_TAG, WAYBACK_TAG] }, { id: 'c1', tags: [CAPTURE_TAG, 'page'] }];
    expect(citesTheArchive({ relatedEntities: ['c1'], contradictedBy: ['w1'] }, items)).toBe(true);
    expect(citesTheArchive({ relatedEntities: ['c1'] }, items)).toBe(false);
  });
});
