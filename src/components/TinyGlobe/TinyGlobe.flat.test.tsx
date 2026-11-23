/**
 * The minimap on a device the quality governor steps down (decision D-MG, MG1, MG6): drawn flat, on a
 * 2D canvas, with no engine and no WebGL context, where it was a still outline for good. While it
 * reads its maps, and before the minimap may draw at all, its still breathes and its meridian turns;
 * with reduced motion it does neither.
 */
import * as React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualizationModeProvider } from '../../context/VisualizationModeContext';
import { GlobeProvider } from '../../context/GlobeContext';
import { GlobeLayerControlProvider } from '../Globe/Hooks/useGlobeLayerControl';
import TinyGlobe from './TinyGlobe';

const constructions = vi.hoisted(() => ({ count: 0 }));
const gate = vi.hoisted(() => ({ value: { live: false, flat: true, why: '' } }));

vi.mock('../../globe-engine/GlobeEngine', () => ({
  GlobeEngine: function GlobeEngine() {
    constructions.count += 1;
    return { addOverlay: vi.fn(), getMaterial: vi.fn(() => null), on: vi.fn(), dispose: vi.fn(), getOverlays: () => [] };
  },
}));
vi.mock('react-globe.gl', () => ({ default: () => <div data-testid="mock-globe" />, GlobeMethods: () => {} }));
vi.mock('./useMinimapLive', () => ({ useMinimapLive: () => gate.value }));

const mount = () => render(
  <GlobeProvider>
    <VisualizationModeProvider>
      <GlobeLayerControlProvider><TinyGlobe /></GlobeLayerControlProvider>
    </VisualizationModeProvider>
  </GlobeProvider>,
);
const reduce = (on: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: on && query.includes('reduce'), media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

describe('TinyGlobe on a device drawing less', () => {
  const realFetch = globalThis.fetch;
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    constructions.count = 0;
    // Its maps never arrive here: what shows while they are read.
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {})) as typeof fetch;
    reduce(false);
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    window.matchMedia = realMatchMedia;
    gate.value = { live: false, flat: true, why: '' };
  });

  it('is drawn flat, with no engine and no WebGL globe, its still breathing while it reads its maps', () => {
    mount();
    expect(constructions.count).toBe(0);
    expect(document.querySelector('[data-testid="mock-globe"]')).toBeNull();
    const flat = document.querySelector('[data-testid="tiny-globe-flat"]');
    expect(flat).not.toBeNull();
    expect(flat!.querySelector('canvas')).not.toBeNull();
    const still = flat!.querySelector('[data-testid="tiny-globe-still"]')!;
    expect(still.getAttribute('aria-label')).toBe('Loading the minimap');
    expect(still.getAttribute('class')).toContain('breathing');
    expect(still.querySelector('animate')).not.toBeNull();
    // The textures the globe fetches, the Intel Watch skin's three.
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      '/assets/textures/earth/earth-dark.webp', '/assets/textures/earth/earth-water.webp', '/assets/textures/earth/earth-night.webp',
    ]);
  });

  it('breathes before it may draw at all, and holds still with reduced motion', () => {
    gate.value = { live: false, flat: false, why: 'The minimap starts once the globe has loaded.' };
    const { unmount } = mount();
    let still = document.querySelector('[data-testid="tiny-globe-still"]')!;
    expect(still.getAttribute('class')).toContain('breathing');
    unmount();
    reduce(true);
    mount();
    still = document.querySelector('[data-testid="tiny-globe-still"]')!;
    expect(still.getAttribute('class') ?? '').not.toContain('breathing');
    expect(still.querySelector('animate')).toBeNull();
  });
});
