/**
 * A note's sources, from its `r` tags (D-CT, CT2): http and https only, in tag order, each once, at most 20.
 */
import { describe, it, expect } from 'vitest';
import { packageSourceLinks, safeSourceLinks, sourceLinkItems, sourceLinksFromTags } from '../sourceLinks';

/** One link read alone: kept as `new URL` writes it, or dropped. */
const safeSourceUrl = (value: unknown): string | null => safeSourceLinks([value])[0] ?? null;

describe('sourceLinks', () => {
  it('keeps http and https links and drops every other scheme', () => {
    expect(safeSourceUrl('https://www.nationalcrimeagency.gov.uk/news/x')).toBe('https://www.nationalcrimeagency.gov.uk/news/x');
    expect(safeSourceUrl('http://example.org/a')).toBe('http://example.org/a');
    for (const bad of [
      'javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox', 'file:///etc/passwd', 'ftp://example.org/a', 'mailto:a@example.org', '//example.org/a',
      '/relative/path', 'not a url', '', '   ', 'https://', 'wss://relay.example',
    ]) {
      expect(safeSourceUrl(bad), bad).toBeNull();
    }
    for (const notText of [null, undefined, 42, {}, ['https://example.org']]) expect(safeSourceUrl(notText)).toBeNull();
  });

  it('reads r tags in tag order, the first the original, skipping other tags', () => {
    const tags = [
      ['d', 'starcom-intel-world-nca-abc'],
      ['r', 'https://www.nationalcrimeagency.gov.uk/news/one'],
      ['t', 'lens:tcs'],
      ['r', 'https://www.bbc.co.uk/news/two'],
      ['r', 'https://archangel.agency/intel/three'],
    ];
    expect(sourceLinksFromTags(tags)).toEqual([
      'https://www.nationalcrimeagency.gov.uk/news/one',
      'https://www.bbc.co.uk/news/two',
      'https://archangel.agency/intel/three',
    ]);
  });

  it('drops unsafe and repeated links without reordering the rest', () => {
    const tags = [
      ['r', 'javascript:alert(1)'],
      ['r', 'https://a.example/1'],
      ['r', 'https://a.example/1'],
      ['r'],
      ['r', 42],
      ['r', 'https://b.example/2'],
    ];
    expect(sourceLinksFromTags(tags)).toEqual(['https://a.example/1', 'https://b.example/2']);
    expect(sourceLinksFromTags('not tags')).toEqual([]);
    expect(sourceLinksFromTags(undefined)).toEqual([]);
  });

  it('caps a note at 20 sources', () => {
    const tags = Array.from({ length: 30 }, (_, i) => ['r', `https://s${i}.example/`]);
    const links = sourceLinksFromTags(tags);
    expect(links).toHaveLength(20);
    expect(links[0]).toBe('https://s0.example/');
    expect(links[19]).toBe('https://s19.example/');
  });

  it("falls back to a package manifest's source link only when the event carries no r tag", () => {
    const manifest = { metadata: { mechaJono: { source: { name: 'NWS', link: 'https://alerts.weather.gov/x' } } } };
    expect(packageSourceLinks([['d', 'x']], manifest)).toEqual(['https://alerts.weather.gov/x']);
    expect(packageSourceLinks([['r', 'https://www.cpsc.gov/recall']], manifest)).toEqual(['https://www.cpsc.gov/recall']);
    expect(packageSourceLinks([], { metadata: { mechaJono: { source: { link: 'javascript:alert(1)' } } } })).toEqual([]);
    expect(packageSourceLinks([], null)).toEqual([]);
    expect(packageSourceLinks([], 'a string')).toEqual([]);
  });

  it('names each source by its host and marks the first as the original, reading stored links again', () => {
    expect(sourceLinkItems(['https://www.fincen.gov/news/a', 'javascript:alert(1)', 'https://occ.gov/b'])).toEqual([
      { href: 'https://www.fincen.gov/news/a', host: 'fincen.gov', original: true },
      { href: 'https://occ.gov/b', host: 'occ.gov', original: false },
    ]);
    expect(sourceLinkItems(undefined)).toEqual([]);
  });
});
