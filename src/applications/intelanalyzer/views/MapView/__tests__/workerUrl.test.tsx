import { describe, it, expect, vi } from 'vitest';

/**
 * maplibre-gl 6 loads its worker from a file beside its own module, and a bundle keeps no such file: on the
 * first build with it the map drew only its background and never loaded (security audit, SA2). The view
 * must hand maplibre the worker file the build emits, before the first map is made.
 */
const calls = vi.hoisted(() => [] as string[]);

vi.mock('maplibre-gl', () => {
  class MockMap {
    constructor(_: unknown) { calls.push('map'); }
    on() {}
    off() {}
    addSource() {}
    addLayer() {}
    getSource() { return { setData: () => {} }; }
    getBounds() { return { getWest: () => -180, getSouth: () => -85, getEast: () => 180, getNorth: () => 85 }; }
    getZoom() { return 2; }
    queryRenderedFeatures() { return []; }
    remove() {}
  }
  return { Map: MockMap, setWorkerUrl: (url: string) => { calls.push(`worker ${url}`); } };
});

vi.mock('../../../../../services/intel/IntelWorkspaceContext', () => ({
  useIntelWorkspace: () => ({ reports: [], intelItems: [] }),
}));

vi.mock('../../../state/CorrelationContext', () => ({
  useCorrelation: () => ({ showClusters: false, placeClusters: [], cooccurrence: [], tagCooccurrence: [], anomaliesByDay: new Set<string>(), setShowClusters: () => {} }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import { FilterProvider } from '../../../state/FilterContext';
import { SelectionProvider } from '../../../state/SelectionContext';
import MapView from '../MapView';

describe('MapView and maplibre-gl 6', () => {
  it('points maplibre at the worker file the build emits, before the first map', () => {
    render(
      <FilterProvider>
        <SelectionProvider>
          <MapView />
        </SelectionProvider>
      </FilterProvider>,
    );
    const worker = calls.findIndex((c) => c.startsWith('worker '));
    expect(worker).toBeGreaterThanOrEqual(0);
    expect(calls[worker]).toMatch(/maplibre-gl-worker[^/]*\.mjs$/);
    expect(calls.indexOf('map')).toBeGreaterThan(worker);
  });
});
