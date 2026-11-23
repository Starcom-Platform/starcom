/**
 * IntelWeb's Map (decision D-IW, IW13, step 6): offered in the Layout menu; on it the notes and their
 * countries only, a country at its middle once the countries' middles are known.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { VirtualFileSystem, VirtualFile } from '../../../../../types/DataPack';

vi.mock('../../../../../geopolitical/services/NationalTerritoriesService', () => ({
  nationalTerritoriesService: { getCountryCentroids: vi.fn(async () => new Map([['YEM', { lat: 15.5, lng: 47.5 }]])) },
}));

import { IntelGraph } from '../IntelGraph';

const now = new Date().toISOString();
const file = (path: string, frontmatter: Record<string, unknown>): VirtualFile => ({
  path, name: path.split('/').pop()!, extension: 'md', size: 10, mimeType: 'text/markdown', encoding: 'utf-8',
  hash: `h-${path}`, createdAt: now, modifiedAt: now, content: '# x', frontmatter, relationships: [],
} as VirtualFile);
const vault = (): VirtualFileSystem => {
  const files = [
    file('reports/pointed.md', { type: 'report', confidence: 0.8, coordinates: [15.35, 44.2], jurisdictions: ['ye'] }),
    file('reports/yemen.md', { type: 'report', confidence: 0.8, jurisdictions: ['ye'] }),
    file('reports/nowhere.md', { type: 'report', confidence: 0.8 }),
    file('countries/ye.md', { type: 'country', confidence: 1, key: 'ye' }),
    file('tags/war_map.md', { type: 'tag', confidence: 1, key: 'war_map' }),
    // A state's hub: no middle known here, so it has no place on the Map.
    file('countries/us-il.md', { type: 'country', confidence: 1, key: 'us-il' }),
  ];
  return { root: { path: '/', name: 'root', files, directories: [] } as never, fileIndex: new Map(files.map((f) => [f.path, f])), directoryIndex: new Map(), relationshipGraph: [] };
};

describe('IntelGraph: the Map', () => {
  beforeEach(() => {
    localStorage.clear();
    // The borders are not needed here: the Map draws without them while they load.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is offered in the Layout menu', () => {
    render(<IntelGraph vault={vault()} />);
    expect([...screen.getByRole('combobox', { name: 'Layout' }).querySelectorAll('option')].map((o) => o.textContent)).toContain('Map');
  });

  it('draws the notes and their countries, not the tags, and names the notes with no place', async () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Layout' }), { target: { value: 'map' } });
    await waitFor(() => expect(container.querySelectorAll('g.node-group')).toHaveLength(4));
    expect([...container.querySelectorAll('g.node-group')].some((g) => g.textContent?.includes('war_map') || g.textContent?.includes('us-il'))).toBe(false);
    expect(container.querySelector('text.map-unplaced')?.textContent).toBe('No place stated');
  });
});
