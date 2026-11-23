/**
 * IntelWeb's Colour by (decision D-IW, IW12): notes by assessment in the globe's colours at first,
 * then by category, country, publisher or age; hubs keep their kind's colour; a key says what each
 * colour means.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IntelGraph } from '../IntelGraph';
import { spriteGlyphFill } from '../../../../../components/Globe/intelReportSprites';
import type { VirtualFileSystem, VirtualFile } from '../../../../../types/DataPack';

const now = new Date().toISOString();
const file = (path: string, frontmatter: Record<string, unknown>): VirtualFile => ({
  path, name: path.split('/').pop()!, extension: 'md', size: 10, mimeType: 'text/markdown', encoding: 'utf-8',
  hash: `h-${path}`, createdAt: now, modifiedAt: now, content: '# x', frontmatter, relationships: [],
} as VirtualFile);

const vault = (): VirtualFileSystem => {
  const files = [
    file('reports/a.md', { type: 'report', confidence: 0.8, assessment: 'critical', jurisdictions: ['ye'] }),
    file('reports/b.md', { type: 'report', confidence: 0.8, assessment: 'raw' }),
    file('countries/ye.md', { type: 'country', confidence: 1, key: 'ye' }),
  ];
  return { root: { path: '/', name: 'root', files, directories: [] } as never, fileIndex: new Map(files.map((f) => [f.path, f])), directoryIndex: new Map(), relationshipGraph: [] };
};
const fillOf = (container: HTMLElement, i: number) => container.querySelectorAll('g.node-group')[i].querySelector('circle')!.getAttribute('fill');

describe('IntelGraph: Colour by', () => {
  beforeEach(() => localStorage.clear());

  it('colours notes by assessment as the globe does, and leaves a hub its own colour', () => {
    const { container } = render(<IntelGraph vault={vault()} />);
    expect(screen.getByRole('combobox', { name: 'Colour by' })).toHaveValue('assessment');
    expect(fillOf(container, 0)).toBe(spriteGlyphFill('critical'));
    expect(fillOf(container, 1)).toBe(spriteGlyphFill('raw'));
    expect(fillOf(container, 2)).not.toBe(spriteGlyphFill('critical'));
  });

  it('says what each colour means, and that hubs keep their own', () => {
    render(<IntelGraph vault={vault()} />);
    const key = screen.getByTestId('intelweb-colour-key');
    expect(within(key).getByText('Critical')).toBeInTheDocument();
    expect(within(key).getByText('Raw: not assessed')).toBeInTheDocument();
    expect(within(key).getByText('Hubs, stubs and packages keep their own colours.')).toBeInTheDocument();
    expect(within(key).getByText('A dashed ring: named by a note, but not held here.')).toBeInTheDocument();
  });

  it('colours by another way when chosen, says so in the key, and remembers it', () => {
    const { unmount } = render(<IntelGraph vault={vault()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Colour by' }), { target: { value: 'country' } });
    const key = screen.getByTestId('intelweb-colour-key');
    expect(within(key).getByText('Yemen')).toBeInTheDocument();
    expect(within(key).getByText('No country stated')).toBeInTheDocument();
    unmount();
    render(<IntelGraph vault={vault()} />);
    expect(screen.getByRole('combobox', { name: 'Colour by' })).toHaveValue('country');
  });
});
