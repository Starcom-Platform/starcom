/**
 * Two layers side by side, said on screen (D-CM, CM2): the bar names each half's layer and ends the comparison with
 * one click, letting go of the layer it pinned; each half draws its own layer's arcs, so it says nothing of them.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

const unpinLayer = vi.fn();
vi.mock('../../Globe/Hooks/useGlobeLayerControl', () => ({
  useGlobeLayerControlOptional: () => ({
    layers: [{ id: 'EcologicalDisasters', label: 'Eco Disasters' }, { id: 'EarthWeather', label: 'Earth Weather' }, { id: 'WarConflict', label: 'War & Conflict' }],
    isLayerActive: (id: string) => id === 'EcologicalDisasters',
    pinLayer: vi.fn(),
    unpinLayer,
  }),
}));

import CompareBar from '../CompareBar';
import { beginComparison, currentComparison, resetComparisonForTests } from '../../../globe-engine/compareLayers';
import { comparePins } from '../comparePins';
import { useGlobeLayerControlOptional } from '../../Globe/Hooks/useGlobeLayerControl';

afterEach(() => { act(() => resetComparisonForTests()); unpinLayer.mockReset(); });

describe('the comparison bar', () => {
  it('shows nothing while no comparison is chosen', () => {
    render(<CompareBar />);
    expect(screen.queryByTestId('compare-bar')).toBeNull();
  });

  it('names each half, and ends the comparison, letting go of what it pinned', () => {
    render(<CompareBar />);
    act(() => beginComparison({ left: 'EcologicalDisasters', right: 'EarthWeather' }, comparePins(useGlobeLayerControlOptional()!)));
    expect(screen.getByTestId('compare-left')).toHaveTextContent('Eco Disasters');
    expect(screen.getByTestId('compare-right')).toHaveTextContent('Earth Weather');
    expect(screen.getByTestId('compare-divider')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('compare-end'));
    expect(currentComparison()).toBeNull();
    expect(unpinLayer).toHaveBeenCalledWith('EarthWeather');
  });

  it('says nothing of arcs left out: each half draws its own layer\'s', () => {
    render(<CompareBar />);
    act(() => beginComparison({ left: 'WarConflict', right: 'IntelReports' }, comparePins(useGlobeLayerControlOptional()!)));
    expect(screen.getByTestId('compare-bar').textContent).not.toMatch(/arc/i);
  });
});
