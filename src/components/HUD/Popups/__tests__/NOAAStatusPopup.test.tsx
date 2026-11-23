import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NOAAStatusPopup from '../NOAAStatusPopup';
import NOAADeepControlsPopup from '../NOAADeepControlsPopup';
import { vi } from 'vitest';

const showPopup = vi.fn();
const modeState = { mode: 'EcoNatural', subMode: 'SpaceWeather' };

vi.mock('../../../Popup/PopupManager', () => ({
  usePopup: () => ({ showPopup })
}));

vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: modeState
  })
}));

describe('NOAAStatusPopup', () => {
  beforeEach(() => {
    showPopup.mockClear();
    modeState.mode = 'EcoNatural';
    modeState.subMode = 'SpaceWeather';
  });

  it('renders mode details and launches deep controls popup', () => {
    render(<NOAAStatusPopup onClose={vi.fn()} />);

    expect(screen.getByText('EcoNatural')).toBeInTheDocument();
    expect(screen.getByText('SpaceWeather')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('noaa-status-open-deep-controls'));

    expect(showPopup).toHaveBeenCalledWith(
      expect.objectContaining({ component: NOAADeepControlsPopup })
    );
  });

  it('hides deep-controls launch outside EcoNatural/SpaceWeather', () => {
    modeState.mode = 'CyberCommand';
    modeState.subMode = 'IntelReports';

    render(<NOAAStatusPopup onClose={vi.fn()} />);

    expect(screen.queryByTestId('noaa-status-open-deep-controls')).toBeNull();
    expect(screen.getByTestId('noaa-status-deep-controls-unavailable')).toBeInTheDocument();
  });

  it('claims no status nobody measures', () => {
    // "Globe Engine: Operational" and "Data Feeds: Online" were fixed text in
    // green, shown with every feed unreachable. The same kind of claim as
    // "All systems operational", removed in plan item 3.1, and the engine
    // status corner, removed in 4.3 (decision B4).
    render(<NOAAStatusPopup onClose={vi.fn()} />);
    expect(screen.queryByText('Operational')).toBeNull();
    expect(screen.queryByText('Online')).toBeNull();
    expect(screen.queryByText('Globe Engine')).toBeNull();
    expect(screen.queryByText('Data Feeds')).toBeNull();
  });
});
