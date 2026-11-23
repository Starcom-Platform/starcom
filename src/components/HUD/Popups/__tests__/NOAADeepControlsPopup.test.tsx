import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NOAADeepControlsPopup from '../NOAADeepControlsPopup';
import { NOAA_VISUALIZATIONS } from '../../Bars/CyberCommandLeftSideBar/NOAAVisualizationConfig';
import { vi } from 'vitest';

vi.mock('../../Bars/CyberCommandLeftSideBar/NOAAGlobeVisualizationManager', () => ({
  globeVisualizationManager: {
    forceSync: vi.fn()
  }
}));

describe('NOAADeepControlsPopup', () => {
  const initialState = NOAA_VISUALIZATIONS.map((dataset) =>
    dataset.options.map((option) => option.enabled)
  );

  afterEach(() => {
    NOAA_VISUALIZATIONS.forEach((dataset, datasetIndex) => {
      dataset.options.forEach((option, optionIndex) => {
        option.enabled = initialState[datasetIndex][optionIndex];
      });
    });
  });

  it('supports none/all preset flow for deep controls parity', () => {
    render(<NOAADeepControlsPopup onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('None'));

    const activeAfterNone = NOAA_VISUALIZATIONS.reduce(
      (count, dataset) => count + dataset.options.filter((option) => option.enabled).length,
      0
    );
    expect(activeAfterNone).toBe(0);

    fireEvent.click(screen.getByText('All'));

    const activeAfterAll = NOAA_VISUALIZATIONS.reduce(
      (count, dataset) => count + dataset.options.filter((option) => option.enabled).length,
      0
    );
    expect(activeAfterAll).toBeGreaterThan(0);
  });
});