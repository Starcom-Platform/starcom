/**
 * TinyGlobe was fully built but never mounted in production. This locks in
 * its new role as a real orientation minimap + activity indicator: it shows
 * where the main globe's camera is pointed (via GlobeCameraTelemetry), which
 * layers are currently active (via useGlobeLayerControl), and the current
 * visualization mode (via an accent-ring color) — "state of the globe" at a
 * glance, per the original concept art.
 *
 * Click-to-fly's raycasting math is covered separately and more directly in
 * utils/__tests__/globeClickRaycast.test.ts (real THREE.js fixtures, no
 * rendering needed). The DOM click-event glue and the own-orbit-controls
 * disable effect are not covered here — they need a ref-forwarding Globe
 * mock exposing real camera/scene/controls, which duplicates most of what
 * that raycast test already verifies for little added confidence; verified
 * instead via tsc + code review, consistent with the rest of this session's
 * Globe.tsx-adjacent (jsdom/WebGL-constrained) code.
 */
import * as React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VisualizationModeProvider } from '../../context/VisualizationModeContext';
import { GlobeProvider } from '../../context/GlobeContext';
import { GlobeLayerControlProvider } from '../Globe/Hooks/useGlobeLayerControl';
import { globeCameraTelemetry } from '../../services/globe/GlobeCameraTelemetry';
import TinyGlobe from './TinyGlobe';
import { GUNMETAL } from '../../styles/tokens';

const { addOverlay, getMaterial, on } = vi.hoisted(() => ({
  addOverlay: vi.fn(),
  getMaterial: vi.fn(),
  on: vi.fn()
}));

vi.mock('../../globe-engine/GlobeEngine', () => ({
  GlobeEngine: vi.fn()
}));

// Allowed to draw (useMinimapLive.test.tsx says when).
vi.mock('./useMinimapLive', () => ({ useMinimapLive: () => ({ live: true, why: '' }) }));

vi.mock('react-globe.gl', () => ({
  default: React.forwardRef((props: { pointsData?: unknown[]; customLayerData?: unknown[] }, _ref: React.Ref<unknown>) => (
    <div data-testid="mock-globe" data-points={JSON.stringify(props.pointsData ?? [])} data-marker={JSON.stringify(props.customLayerData ?? [])} />
  )),
  GlobeMethods: () => {}
}));

// The setup file's global afterEach calls vi.restoreAllMocks(), which wipes
// mockImplementation() — so it must be re-applied before every test, not just
// once at module-mock time (that pattern only survives a file's first test).
import { GlobeEngine } from '../../globe-engine/GlobeEngine';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <GlobeProvider>
      <VisualizationModeProvider>
        <GlobeLayerControlProvider>{ui}</GlobeLayerControlProvider>
      </VisualizationModeProvider>
    </GlobeProvider>
  );
}

// TinyGlobe polls engine.getMaterial() on a real 100ms setInterval until it
// resolves — fake timers make that deterministic instead of racing real
// wall-clock time across tests.
function renderAndResolveMaterial(ui: React.ReactElement) {
  const result = renderWithProviders(ui);
  act(() => {
    vi.advanceTimersByTime(100);
  });
  return result;
}

describe('TinyGlobe — orientation marker + activity indicator', () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
    addOverlay.mockClear();
    on.mockClear();
    getMaterial.mockReset().mockReturnValue({}); // truthy — real Globe branch, not the loading placeholder
    vi.mocked(GlobeEngine).mockImplementation(function () { return ({
      // dispose: TinyGlobe now shuts its engine down on cleanup.
      addOverlay, getMaterial, on, getOverlays: vi.fn(() => []), dispose: vi.fn(),
    }) as unknown as InstanceType<typeof GlobeEngine>; });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks where the main globe looks with an unlit disc, not a lit point, so it reads on the night side too', () => {
    globeCameraTelemetry.publish({ lat: 12, lng: 34, altitude: 2 });

    renderAndResolveMaterial(<TinyGlobe />);

    // A react-globe.gl point is lit, and all but vanished at night (D-MG); the marker is a custom layer.
    const marker = JSON.parse(screen.getByTestId('mock-globe').getAttribute('data-marker') || '[]');
    expect(marker).toEqual([{ lat: 12, lng: 34 }]);
    const points = JSON.parse(screen.getByTestId('mock-globe').getAttribute('data-points') || '[]');
    expect(points).not.toContainEqual(expect.objectContaining({ color: GUNMETAL[100] }));
  });

  it('updates the marker when the camera orientation changes again', () => {
    globeCameraTelemetry.publish({ lat: 0, lng: 0, altitude: 2 });
    renderAndResolveMaterial(<TinyGlobe />);

    act(() => {
      globeCameraTelemetry.publish({ lat: -20, lng: 55, altitude: 1.2 });
    });

    const marker = JSON.parse(screen.getByTestId('mock-globe').getAttribute('data-marker') || '[]');
    expect(marker).toEqual([{ lat: -20, lng: 55 }]);
  });

  it('shows a mode-colored accent ring matching the current visualization mode', () => {
    renderAndResolveMaterial(<TinyGlobe />);
    const container = screen.getByTestId('tiny-globe-container');
    // Default visualization mode in VisualizationModeProvider is CyberCommand.
    expect(container.style.borderColor).toBe('rgb(0, 255, 255)');
  });

  it('renders exactly one activity dot for the default primary layer', () => {
    renderAndResolveMaterial(<TinyGlobe />);
    // Default mode/subMode (CyberCommand/IntelReports) is a real, implemented
    // layer, so exactly one dot (the primary layer) should render.
    const row = screen.getByTitle('Intel Reports');
    expect(row.children).toHaveLength(1);
  });
});
