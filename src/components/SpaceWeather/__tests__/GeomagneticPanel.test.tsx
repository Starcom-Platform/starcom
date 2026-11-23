import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { GeomagneticPanel } from '../SpaceWeatherControlSurface';

const updateSettings = vi.fn();

let mockContext: {
  settings: { showGeomagneticIndex: boolean; showAuroralOval: boolean };
  updateSettings: typeof updateSettings;
  telemetry: {
    modes: {
      geomagnetic: {
        active: boolean;
        kp: number | null;
        activity?: string;
        trend?: string;
        riskLevel?: string;
        riskDescription?: string;
        quality?: string;
        lastUpdate: number | null;
        error?: string;
      };
    };
  };
};

vi.mock('../../../context/SpaceWeatherContext', () => ({
  useSpaceWeatherContext: () => mockContext
}));

function makeContext(overrides: Partial<typeof mockContext.telemetry.modes.geomagnetic> = {}, showGeomagneticIndex = true) {
  mockContext = {
    settings: { showGeomagneticIndex, showAuroralOval: false },
    updateSettings,
    telemetry: {
      modes: {
        geomagnetic: {
          active: showGeomagneticIndex,
          kp: null,
          lastUpdate: null,
          ...overrides
        }
      }
    }
  };
}

describe('GeomagneticPanel', () => {
  beforeEach(() => {
    updateSettings.mockClear();
  });

  it('shows no data readout when the layer is off, even if telemetry has stale data from before', () => {
    makeContext({ kp: 5, activity: 'minor_storm' }, false);
    render(<GeomagneticPanel />);
    expect(screen.queryByText(/Kp Index/)).not.toBeInTheDocument();
  });

  it('shows no data readout when the layer is on but data has not arrived yet', () => {
    makeContext({ kp: null }, true);
    render(<GeomagneticPanel />);
    expect(screen.queryByText(/Kp Index/)).not.toBeInTheDocument();
  });

  it('shows Kp value and activity label once live data has arrived', () => {
    makeContext({ kp: 6, activity: 'major_storm', quality: 'live' }, true);
    render(<GeomagneticPanel />);
    expect(screen.getByText(/Kp Index/)).toBeInTheDocument();
    expect(screen.getByText(/6\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Major Storm/)).toBeInTheDocument();
    expect(screen.queryByText(/estimated/)).not.toBeInTheDocument();
  });

  it('marks the reading as estimated when quality is fallback, not live', () => {
    makeContext({ kp: 3, activity: 'unsettled', quality: 'fallback' }, true);
    render(<GeomagneticPanel />);
    expect(screen.getByText(/estimated/)).toBeInTheDocument();
    expect(screen.queryByText(/stale/)).not.toBeInTheDocument();
  });

  it('marks the reading as stale (not estimated) when quality is stale, distinguishing it from fallback', () => {
    makeContext({ kp: 3, activity: 'unsettled', quality: 'stale' }, true);
    render(<GeomagneticPanel />);
    expect(screen.getByText(/stale/)).toBeInTheDocument();
    expect(screen.queryByText(/estimated/)).not.toBeInTheDocument();
  });

  it('shows neither suffix when quality is live', () => {
    makeContext({ kp: 3, activity: 'unsettled', quality: 'live' }, true);
    render(<GeomagneticPanel />);
    expect(screen.queryByText(/estimated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stale/)).not.toBeInTheDocument();
  });

  it('shows a clear error message when the layer is on, no data ever arrived, and an error was reported', () => {
    makeContext({ kp: null, error: 'Unable to load geomagnetic data' }, true);
    render(<GeomagneticPanel />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/Kp Index/)).not.toBeInTheDocument();
  });

  it('does not show the error message once real data has arrived, even if an error field is somehow still set', () => {
    makeContext({ kp: 4, activity: 'active', error: 'Unable to load geomagnetic data' }, true);
    render(<GeomagneticPanel />);
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Kp Index/)).toBeInTheDocument();
  });

  it('shows a trend row only when a trend is available', () => {
    makeContext({ kp: 2, activity: 'quiet', trend: 'rising' }, true);
    render(<GeomagneticPanel />);
    expect(screen.getByText(/Rising/)).toBeInTheDocument();
  });

  it('omits the trend row when no trend was computed (no forecast available)', () => {
    makeContext({ kp: 2, activity: 'quiet' }, true);
    render(<GeomagneticPanel />);
    expect(screen.queryByText(/Trend/)).not.toBeInTheDocument();
  });

  it('shows the risk description only when one is available', () => {
    makeContext({ kp: 6, activity: 'major_storm', riskDescription: 'Significant risk to satellite and communication systems.' }, true);
    render(<GeomagneticPanel />);
    expect(screen.getByText(/Significant risk/)).toBeInTheDocument();
  });
});
