/**
 * What is new since a moment through the share handle (plan H10; contract v57): Space Weather and Resources from the
 * feeds Starcom reads, refused with its reason when the moment cannot be read.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
    setVisualizationMode: vi.fn(),
  }),
}));
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({ layers: [], pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn() }),
}));
const issued = new Date(Date.now() - 3_600_000).toISOString();
vi.mock('../../../../features/globe/capture/whatsNew', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../features/globe/capture/whatsNew')>();
  return {
    ...actual,
    WHATS_NEW_FEEDS: {
      alerts: async () => [{ productId: 'K05A', issuedAt: issued, headline: 'ALERT: Geomagnetic K-index of 5' }],
      cmes: async () => [],
      energy: async () => ({}),
    },
  };
});

import { useGlobeShareCard, SHARE_HANDLE } from '../useGlobeShareCard';
import type { WhatsNew } from '../../../../features/globe/capture/whatsNew';
import { SHARE_HANDLE_CONTRACT } from '../../../../features/globe/capture/shareHandleContract';

const globeRef = {
  current: {
    renderer: () => ({ domElement: { isConnected: true, clientWidth: 1280, clientHeight: 608 } }),
    scene: () => ({}),
    camera: () => ({}),
    getGlobeRadius: () => 100,
    pointOfView: () => ({ lat: 0, lng: 0, altitude: 2.5 }),
    controls: () => undefined,
  },
};

type Handle = { whatsNew: (since: unknown, options?: { until?: unknown }) => Promise<WhatsNew> };
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];
const mount = () => renderHook(() => useGlobeShareCard({ globeRef: globeRef as never, feeds: [], marks: null }));

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
});

describe('whatsNew (v57)', () => {
  it('is in the contract, since and until in whole unix seconds', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.whatsNew).toEqual({ args: 2, options: ['until'] });
    expect(SHARE_HANDLE_CONTRACT.returns.whatsNew).toEqual(['since', 'until', 'layers']);
  });

  it('answers for Space Weather and Resources from the feeds Starcom reads', async () => {
    mount();
    const answer = await handle().whatsNew(Math.floor(Date.now() / 1000) - 86_400);
    expect(answer.layers.map((l) => [l.layer, l.count])).toEqual([['SpaceWeather', 1], ['ResourceZones', 0]]);
    expect(answer.layers[0].items[0].title).toBe('ALERT: Geomagnetic K-index of 5');
    expect(answer.layers[1].sources[0].read).toMatch(/not read/);
  });

  it('refuses a moment it cannot read, with the reason, as a rejected promise', async () => {
    mount();
    await expect(handle().whatsNew('last week')).rejects.toThrow(/whole unix seconds/);
    await expect(handle().whatsNew(Math.floor(Date.now() / 1000) - 40 * 86_400)).rejects.toThrow(/31 days/);
  });
});
