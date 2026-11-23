/**
 * IntelWeb's metadata panel says which time places the selected file's node
 * (decision D-E).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { IntelWebRightSideBar } from '../IntelWebRightSideBar';
import type { VirtualFile } from '../../../../types/DataPack';

const file = (frontmatter: Record<string, unknown> | undefined): VirtualFile => ({
  path: '/reports/substation-fire.md',
  name: 'substation-fire.md',
  extension: 'md',
  size: 10,
  mimeType: 'text/markdown',
  encoding: 'utf-8',
  hash: '',
  createdAt: '2026-09-14T10:00:00.000Z',
  modifiedAt: '2026-09-14T10:00:00.000Z',
  content: '# Substation fire',
  frontmatter,
  relationships: [],
});

const renderPanel = (f: VirtualFile) =>
  render(<IntelWebRightSideBar vault={null} selectedFile={f} activeTab="metadata" onTabChange={() => {}} />);

describe('IntelWeb metadata panel: which time places the file', () => {
  it('says when the event happened, as closely as it is known', () => {
    renderPanel(file({ type: 'report', startDate: '2026-07-27T00:00:00.000Z', timePrecisionMs: 86_400_000 }));
    expect(screen.getByTestId('metadata-record-time')).toHaveTextContent(/Happened:\s*27 Jul 2026$/);
  });

  it('says when the record was written, and that no event time was stated', () => {
    renderPanel(file({ type: 'report', timestamp: '2026-09-12T08:00:00.000Z' }));
    expect(screen.getByTestId('metadata-record-time')).toHaveTextContent(/Written:\s*12 Sep 2026 08:00Z \(no stated event time\)/);
  });
});
