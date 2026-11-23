/**
 * TinyGlobe used to construct two separate GlobeEngine instances — one for
 * material polling, one for overlay events — so the overlay-listening engine
 * always had an empty overlays array. Worse, its own overlay-request loop
 * (`engine.getOverlays().forEach(o => engine.addOverlay(o))`) would have been
 * a no-op even with a populated array, since addOverlay() guards on
 * `!this.overlays.includes(overlay)`. Net effect: TinyGlobe never actually
 * requested or rendered overlay data. This locks in the fix: one engine,
 * and a real overlay explicitly requested via addOverlay('alerts').
 */
import * as React from 'react';
import { render, cleanup } from '@testing-library/react';
import { VisualizationModeProvider } from '../../context/VisualizationModeContext';
import { GlobeProvider } from '../../context/GlobeContext';
import { GlobeLayerControlProvider } from '../Globe/Hooks/useGlobeLayerControl';
import TinyGlobe from './TinyGlobe';
import { vi } from 'vitest';

const { addOverlay, getMaterial, on, dispose } = vi.hoisted(() => ({
  addOverlay: vi.fn(),
  getMaterial: vi.fn(() => null),
  on: vi.fn(),
  dispose: vi.fn(),
}));

const constructions = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../globe-engine/GlobeEngine', () => ({
  // A plain constructor rather than vi.fn().mockImplementation: the suite's
  // global mock reset strips an implementation between tests, so the SECOND
  // test here received an engine with no methods at all.
  GlobeEngine: function GlobeEngine() {
    constructions.count += 1;
    return { addOverlay, getMaterial, on, dispose, getOverlays: () => [] };
  },
}));

// Allowed to draw (useMinimapLive.test.tsx says when).
vi.mock('./useMinimapLive', () => ({ useMinimapLive: () => ({ live: true, why: '' }) }));

vi.mock('react-globe.gl', () => ({
  default: () => <div data-testid="mock-globe" />,
  GlobeMethods: () => {}
}));

function renderWithProvider(ui: React.ReactElement) {
  return render(
    <GlobeProvider>
      <VisualizationModeProvider>
        <GlobeLayerControlProvider>{ui}</GlobeLayerControlProvider>
      </VisualizationModeProvider>
    </GlobeProvider>
  );
}

describe('TinyGlobe — GlobeEngine wiring', () => {
  beforeEach(() => {
    cleanup();
    constructions.count = 0;
    addOverlay.mockClear();
    getMaterial.mockClear();
    on.mockClear();
    dispose.mockClear();
  });

  it('constructs exactly one GlobeEngine instance and wires it up correctly — one instance, a real listener, a real overlay request', () => {
    renderWithProvider(<TinyGlobe />);

    expect(constructions.count).toBe(1);
    expect(on).toHaveBeenCalledWith('overlayDataUpdated', expect.any(Function));
    expect(addOverlay).toHaveBeenCalledWith('alerts');
  });

  /*
   * The engine it built is shut down when it is replaced or unmounted.
   *
   * The effect's cleanup cleared its polling interval and never touched the
   * engine, so every mode change left one behind — its material, its handler,
   * and its 'alerts' overlay. The same defect as Globe.tsx's engine effect,
   * found by counting constructions on 2026-09-25: the minimap's own engine was
   * the two "unexplained" rebuilds in a 21-switch probe.
   */
  it('disposes its engine on unmount', () => {
    const { unmount } = renderWithProvider(<TinyGlobe />);
    expect(dispose).not.toHaveBeenCalled();
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
