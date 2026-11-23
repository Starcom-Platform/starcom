/**
 * The diplomatic categories in the settings (decision D-DP, DP4): seven, under CAMEO's categories'
 * own keys. A browser stored three, under the names they were drawn with: treaties, summits and
 * trade agreements.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VisualizationOverlayProvider } from '../../context/VisualizationOverlayContext';
import { GeoPoliticalSettingsProvider, useGeoPoliticalSettings } from '../useGeoPoliticalSettings';

const KEY = 'starcom-geo-political-settings';

const Harness: React.FC = () => {
  const { config } = useGeoPoliticalSettings();
  return (
    <div>
      <div data-testid="types">{JSON.stringify(config.diplomaticEvents.eventTypes)}</div>
      <div data-testid="events">{JSON.stringify(config.diplomaticEvents)}</div>
      <div data-testid="conflict">{JSON.stringify(config.conflictZones)}</div>
    </div>
  );
};

function renderHarness() {
  return render(
    <VisualizationOverlayProvider>
      <GeoPoliticalSettingsProvider>
        <Harness />
      </GeoPoliticalSettingsProvider>
    </VisualizationOverlayProvider>,
  );
}
const types = () => JSON.parse(screen.getByTestId('types').textContent!);

function storeV3(eventTypes: Record<string, boolean>) {
  localStorage.setItem(KEY, JSON.stringify({
    version: 3,
    timestamp: 0,
    data: {
      diplomaticEvents: {
        eventTypes, timeRange: 1, markerSize: 1, showConnections: true, connectionOpacity: 40, animateEvents: true,
        eventFiltering: { importance: 'medium', regions: [] },
      },
    },
  }));
}

/*
 * D-DP, DP9–DP10: the Goldstein floor and the regions list go. Nothing set either: importance was
 * 'medium' for everyone, and the regions filtered nothing. The four filters come in, filtering nothing.
 */
describe('the diplomatic filters in the settings', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  const NO_FILTERS = { minOutlets: 1, saidOrDone: 'both', minConfidence: 0, leadOnly: false };

  it('filter nothing on a first visit', () => {
    renderHarness();
    const events = JSON.parse(screen.getByTestId('events').textContent!);
    expect(events.filters).toEqual(NO_FILTERS);
    expect(events).not.toHaveProperty('eventFiltering');
  });

  it('drop a browser\'s stored floor and regions', () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 4,
      timestamp: 0,
      data: {
        diplomaticEvents: {
          eventTypes: { intent: true, consult: false, diplomatic: true, agreement: true, material: true, aid: true, yield: true },
          timeRange: 1, markerSize: 1, showConnections: true, connectionOpacity: 40, animateEvents: true,
          eventFiltering: { importance: 'medium', regions: [] },
        },
      },
    }));
    renderHarness();
    const events = JSON.parse(screen.getByTestId('events').textContent!);
    expect(events).not.toHaveProperty('eventFiltering');
    expect(events.filters).toEqual(NO_FILTERS);
    expect(events.eventTypes.consult).toBe(false);
  });
});

/* D-DP, DP2: marks where it happened by default; a switch puts them at the countries involved. */
describe('where Diplomacy\'s marks stand, in the settings', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('is where it happened, on a first visit', () => {
    renderHarness();
    expect(JSON.parse(screen.getByTestId('events').textContent!).placeBy).toBe('event');
  });

  it('is where it happened for a browser that stored the settings before, which drew at the countries', () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 5,
      timestamp: 0,
      data: {
        diplomaticEvents: {
          eventTypes: { intent: true, consult: true, diplomatic: true, agreement: true, material: true, aid: true, yield: true },
          timeRange: 1, markerSize: 1, showConnections: true, connectionOpacity: 40, animateEvents: true,
          filters: { minOutlets: 2, saidOrDone: 'both', minConfidence: 0, leadOnly: false },
        },
      },
    }));
    renderHarness();
    const events = JSON.parse(screen.getByTestId('events').textContent!);
    expect(events.placeBy).toBe('event');
    expect(events.filters.minOutlets).toBe(2);
  });
});

/* D-DP, DP15: one shared time. The GDELT layers' own time ranges, a second cursor, are gone. */
describe('the GDELT layers\' time in the settings', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('holds no time range of its own, on a first visit or after a browser stored one', () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 6, timestamp: 0,
      data: {
        diplomaticEvents: {
          eventTypes: { intent: true, consult: true, diplomatic: true, agreement: true, material: true, aid: true, yield: true },
          timeRange: 0.25, markerSize: 1, showConnections: true, connectionOpacity: 40, animateEvents: true,
          filters: { minOutlets: 1, saidOrDone: 'both', minConfidence: 0, leadOnly: false }, placeBy: 'event',
        },
        conflictZones: { layerTypes: { warEvents: true, humanitarianCrisis: true }, timeRange: 0.5, markerSize: 1 },
      },
    }));
    renderHarness();
    expect(JSON.parse(screen.getByTestId('events').textContent!)).not.toHaveProperty('timeRange');
    expect(JSON.parse(screen.getByTestId('conflict').textContent!)).not.toHaveProperty('timeRange');
    expect(JSON.parse(screen.getByTestId('conflict').textContent!).layerTypes.humanitarianCrisis).toBe(true);
  });
});

describe('the diplomatic categories in the settings', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('are all seven, all on, on a first visit', () => {
    renderHarness();
    expect(types()).toEqual({ intent: true, consult: true, diplomatic: true, agreement: true, material: true, aid: true, yield: true });
  });

  it('keep what a browser turned off before, under the new keys, and show the four it never had', () => {
    storeV3({ treaties: true, summits: false, tradeAgreements: false });
    renderHarness();
    expect(types()).toEqual({ intent: true, consult: false, diplomatic: true, agreement: true, material: true, aid: true, yield: true });
  });

  it('keep a formal agreement turned off', () => {
    storeV3({ treaties: false, summits: true, tradeAgreements: true });
    renderHarness();
    expect(types()).toMatchObject({ agreement: false, consult: true, material: true });
  });

  it('are stored under the new keys', async () => {
    storeV3({ treaties: true, summits: false, tradeAgreements: false });
    renderHarness();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.version).toBe(7);
    expect(stored.data.diplomaticEvents.eventTypes).toEqual(
      { intent: true, consult: false, diplomatic: true, agreement: true, material: true, aid: true, yield: true });
  });
});
