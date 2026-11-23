/**
 * The Wayback panel (decision D-EX, EX34, W10d): it names the Archive; lists a page's snapshots through
 * Uplink, compares two the person picks, and files one as a capture keeping its address, never the
 * page; and in a plain browser shows the closest snapshot and says why that is all.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const CDX = [
  ['timestamp', 'original', 'statuscode', 'digest', 'length'],
  ['20240101093000', 'https://example.org/', '200', 'AAAA', '1091'],
  ['20250601120000', 'https://example.org/', '200', 'BBBB', '1200'],
];
const PAGES: Record<string, string> = {
  'https://web.archive.org/web/20240101093000id_/https://example.org/': '<body><p>River at 3.1 m</p><p>Gauge A</p></body>',
  'https://web.archive.org/web/20250601120000id_/https://example.org/': '<body><p>River at 4.2 m</p><p>Gauge A</p></body>',
};
const route = vi.hoisted(() => ({ via: 'uplink' as 'uplink' | null, reads: [] as string[] }));
vi.mock('../../../../../extension/siteFetcher', () => ({
  useSiteFetchRoute: () => route.via,
  siteFetcher: async () => (route.via ? {
    via: route.via,
    fetch: async (url: string) => {
      route.reads.push(url);
      return url.startsWith('https://web.archive.org/cdx/')
        ? { ok: true, status: 200, body: JSON.stringify(CDX) }
        : { ok: true, status: 200, body: PAGES[url] ?? '' };
    },
  } : null),
}));
const added = vi.hoisted(() => [] as Array<{ tags: string[]; content: string }>);
vi.mock('../../../../../services/intel/IntelWorkspaceManager', () => ({
  intelWorkspaceManager: { addIntelItem: (item: { tags: string[]; content: string }) => { added.push(item); return { id: 'x', ...item }; } },
}));

import WaybackPanel from '../WaybackPanel';

beforeEach(() => { route.via = 'uplink'; route.reads.length = 0; added.length = 0; });
afterEach(() => vi.unstubAllGlobals());

const list = async () => {
  render(<WaybackPanel />);
  fireEvent.change(screen.getByLabelText('PAGE'), { target: { value: 'example.org' } });
  fireEvent.click(screen.getByRole('button', { name: /LIST SNAPSHOTS/ }));
};

describe('WaybackPanel', () => {
  it('names the Archive, and says a comparison is not kept', () => {
    render(<WaybackPanel />);
    expect(screen.getByRole('link', { name: /Internet Archive's Wayback Machine/ }).getAttribute('href')).toBe('https://web.archive.org/');
    expect(screen.getByText(/A comparison is shown, not kept/)).toBeInTheDocument();
  });

  it('lists the snapshots through Uplink, newest first, and compares two the person picks', async () => {
    await list();
    const picks = await screen.findAllByRole('checkbox');
    expect(picks).toHaveLength(2);
    expect(screen.getAllByText(/2025|2024/)[0].textContent).toMatch(/2025/);
    fireEvent.click(picks[0]);
    fireEvent.click(picks[1]);
    fireEvent.click(screen.getByRole('button', { name: 'COMPARE TWO' }));
    expect(await screen.findByText('1 line removed, 1 added.')).toBeInTheDocument();
    expect(screen.getByText('− River at 3.1 m')).toBeInTheDocument();
    expect(screen.getByText('+ River at 4.2 m')).toBeInTheDocument();
    expect(route.reads.filter((u) => u.includes('id_/'))).toHaveLength(2);
  });

  it('says when two snapshots hold the same words in different markup', async () => {
    PAGES['https://web.archive.org/web/20250601120000id_/https://example.org/'] = '<body><p>River at 3.1 m</p><p>Gauge A</p><script>x()</script></body>';
    await list();
    const picks = await screen.findAllByRole('checkbox');
    fireEvent.click(picks[0]);
    fireEvent.click(picks[1]);
    fireEvent.click(screen.getByRole('button', { name: 'COMPARE TWO' }));
    expect(await screen.findByText('The words are the same. The pages differ only in markup, scripts or styles.')).toBeInTheDocument();
    PAGES['https://web.archive.org/web/20250601120000id_/https://example.org/'] = '<body><p>River at 4.2 m</p><p>Gauge A</p></body>';
  });

  it('files a snapshot as a capture keeping its address, never the page', async () => {
    await list();
    fireEvent.click((await screen.findAllByRole('button', { name: 'file' }))[0]);
    expect(added).toHaveLength(1);
    expect(added[0].tags).toEqual(['capture', 'wayback']);
    expect(added[0].content).toContain('https://web.archive.org/web/20250601120000/https://example.org/');
    expect(added[0].content).not.toContain('River at');
    expect(screen.getByRole('button', { name: 'filed to Captures' })).toBeDisabled();
  });

  it('in a plain browser, shows the closest snapshot and says the full list needs Uplink', async () => {
    route.via = null;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ archived_snapshots: { closest: { available: true, status: '200', timestamp: '20250601120000', url: 'http://web.archive.org/web/20250601120000/https://example.org/' } } }) })));
    await list();
    expect(await screen.findByText('Only the closest snapshot: the full list needs Starcom Uplink or the desktop app.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('says it could not look when the Archive does not answer', async () => {
    route.via = null;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await list();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Could not look: The Wayback Machine answered 503'));
  });
});
