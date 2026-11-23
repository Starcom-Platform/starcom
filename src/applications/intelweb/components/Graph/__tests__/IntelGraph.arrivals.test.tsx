/**
 * Reports that arrived while IntelWeb was open (decision D-IW, IW3): the bar above the graph says how
 * many, and adds them only when pressed.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IntelGraph } from '../IntelGraph';
import type { VirtualFileSystem } from '../../../../../types/DataPack';

const empty: VirtualFileSystem = { root: { path: '/', name: 'root', files: [], directories: [] } as never, fileIndex: new Map(), directoryIndex: new Map(), relationshipGraph: [] };

describe('IntelGraph: arrivals', () => {
  it('says how many arrived, and adds them only when pressed', () => {
    const onAdd = vi.fn();
    render(<IntelGraph vault={empty} arrivals={{ count: 3, onAdd }} />);
    const button = screen.getByTestId('intelweb-arrivals');
    expect(button).toHaveTextContent('3 new notes since this opened · Add them');
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('says nothing when none arrived', () => {
    render(<IntelGraph vault={empty} arrivals={null} />);
    expect(screen.queryByTestId('intelweb-arrivals')).toBeNull();
  });
});
