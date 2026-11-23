import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { CountryInfoPopup } from '../CountryInfoPopup';

function baseConfig() {
  return {
    resourceZones: {
      resourceTypes: { oil: true, gas: true, minerals: true, water: false, renewable: false },
      showProductionRates: true,
      showReserveData: false,
      zoneOpacity: 60,
      showTradeRoutes: true,
      tradeRouteIntensity: 50,
      conflictZones: { show: true, highlightDisputed: true, alertLevel: 'medium' as const }
    },
    diplomaticEvents: {
      eventTypes: { intent: true, consult: true, diplomatic: true, agreement: true, material: true, aid: true, yield: true },
      markerSize: 1.0,
      showConnections: true,
      connectionOpacity: 40,
      animateEvents: true,
      filters: { minOutlets: 1 as const, saidOrDone: 'both' as const, minConfidence: 0 as const, leadOnly: false }, placeBy: 'event' as const
    }
  };
}

// Mutable module-level state read fresh by the mocked hooks on every render —
// vi.mock's factory only runs once, so a per-test `let` (reset in beforeEach)
// is what lets each test vary what the mocked hooks return. Percentiles mocked
// directly (rather than letting the real network-fetching hook run) since this is
// a component-rendering test, not a real-data verification test — that lives in
// EIAInternationalService.test.ts.
let mockConfig = baseConfig();
let overlayState = { resourceZonesOverlayEnabled: true, diplomaticEventsOverlayEnabled: true };
let mockPercentiles = new Map([['USA', [{ resourceType: 'oil' as const, percentile: 80 }]]]);
let mockFigures: unknown = null;

vi.mock('../../../../hooks/useGeoPoliticalSettings', () => ({
  useGeoPoliticalSettings: () => ({ config: mockConfig })
}));

vi.mock('../../../../hooks/useVisualizationOverlay', () => ({
  useVisualizationOverlay: () => overlayState
}));

vi.mock('../../../../geopolitical/hooks/useResourceZonePercentiles', () => ({
  useResourceZonePercentiles: () => ({ percentilesByCountry: mockPercentiles, figures: mockFigures, loading: false, error: null })
}));

describe('CountryInfoPopup', () => {
  beforeEach(() => {
    mockConfig = baseConfig();
    overlayState = { resourceZonesOverlayEnabled: true, diplomaticEventsOverlayEnabled: true };
    mockPercentiles = new Map([['USA', [{ resourceType: 'oil' as const, percentile: 80 }]]]);
    mockFigures = null;
  });

  // critique-2026-11-01, O9: in the Resource Zones sub-mode, with the overlay toggle off, it said "turn on Resource Zones".
  it("counts a layer the globe draws as on, though its overlay toggle is off, and lists the country's figures", () => {
    overlayState = { resourceZonesOverlayEnabled: false, diplomaticEventsOverlayEnabled: false };
    mockFigures = {
      energy: { oil: { name: 'Crude oil', unit: 'thousand barrels per day', year: 2023, values: { USA: 12_935, CAN: 4_865 }, via: 'file' } },
      water: [{ countryISO3: 'USA', countryName: 'United States', value: 8_457, year: '2021' }],
      minerals: [],
    };
    render(<CountryInfoPopup countryCode="USA" name="United States" onClose={() => {}} resourceZonesOn diplomaticEventsOn={false} />);
    expect(screen.queryByText(/Turn on Resource Zones/)).not.toBeInTheDocument();
    expect(screen.getByText('Oil')).toBeInTheDocument();
    const figures = screen.getByTestId('country-resource-figures');
    // Water is off in this config: only oil is listed, with its source.
    expect(figures.querySelectorAll('li')).toHaveLength(1);
    expect(figures).toHaveTextContent('Crude oil: rank 1 of 2 producers · top 1%');
    expect(figures).toHaveTextContent(/barrels a day · EIA, 2023/);
    expect(screen.queryByText(/Diplomatic Events/)).not.toBeInTheDocument();
  });

  it('shows a Resource Zone badge for a country that resolves an active resource type', () => {
    render(<CountryInfoPopup countryCode="USA" name="United States" onClose={() => {}} />);
    expect(screen.getByText('Resource Zone')).toBeInTheDocument();
    expect(screen.getByText('Oil')).toBeInTheDocument();
  });

  it('shows "No active resource zone" when zoneOpacity is 0', () => {
    mockConfig.resourceZones.zoneOpacity = 0;
    render(<CountryInfoPopup countryCode="USA" name="United States" onClose={() => {}} />);
    expect(screen.getByText('No active resource zone for this country.')).toBeInTheDocument();
  });

  it('shows the Diplomatic Events section with a count and event titles', () => {
    render(<CountryInfoPopup countryCode="USA" name="United States" onClose={() => {}} />);
    expect(screen.getByText(/Diplomatic Events \(\d+\)/)).toBeInTheDocument();
  });

  it('hides the Resource Zone section entirely when that overlay is disabled', () => {
    overlayState = { resourceZonesOverlayEnabled: false, diplomaticEventsOverlayEnabled: true };
    render(<CountryInfoPopup countryCode="USA" name="United States" onClose={() => {}} />);
    expect(screen.queryByText('Resource Zone')).not.toBeInTheDocument();
    expect(screen.getByText(/Diplomatic Events \(\d+\)/)).toBeInTheDocument();
  });

  it('hides the Diplomatic Events section entirely when that overlay is disabled', () => {
    overlayState = { resourceZonesOverlayEnabled: true, diplomaticEventsOverlayEnabled: false };
    render(<CountryInfoPopup countryCode="USA" name="United States" onClose={() => {}} />);
    expect(screen.getByText('Resource Zone')).toBeInTheDocument();
    expect(screen.queryByText(/Diplomatic Events \(\d+\)/)).not.toBeInTheDocument();
  });

  it('shows a hint to enable overlays when both are disabled, and neither section renders', () => {
    overlayState = { resourceZonesOverlayEnabled: false, diplomaticEventsOverlayEnabled: false };
    render(<CountryInfoPopup countryCode="USA" name="United States" onClose={() => {}} />);
    expect(screen.getByText(/Turn on Resource Zones or Diplomatic Events/)).toBeInTheDocument();
    expect(screen.queryByText('Resource Zone')).not.toBeInTheDocument();
    expect(screen.queryByText(/Diplomatic Events \(\d+\)/)).not.toBeInTheDocument();
  });

  it('shows "No active diplomatic events" for a country with none', () => {
    render(<CountryInfoPopup countryCode="ZZZ" name="Nowhere" onClose={() => {}} />);
    expect(screen.getByText('No active diplomatic events for this country.')).toBeInTheDocument();
  });

  it('still renders name/code/close button as before', () => {
    const onClose = vi.fn();
    render(<CountryInfoPopup countryCode="USA" name="United States" onClose={onClose} />);
    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(screen.getByText('USA')).toBeInTheDocument();
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });
});
