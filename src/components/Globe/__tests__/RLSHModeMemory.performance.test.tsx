import React from 'react';
import * as THREE from 'three';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Enhanced3DGlobeInteractivity } from '../Enhanced3DGlobeInteractivity';
import { GlobalGlobeContextMenuProvider } from '../../../context/GlobalGlobeContextMenuProvider';
import { VisualizationOverlayProvider } from '../../../context/VisualizationOverlayContext';
import { ApplicationRouterProvider } from '../../Router/ApplicationRouter';
import { PopupProvider } from '../../Popup/PopupManager';
import { vi } from 'vitest';

vi.mock('../../../hooks/useVisualizationOverlay', () => ({
  useVisualizationOverlay: () => ({ cursorTrailIndicatorEnabled: false })
}));

vi.mock('../../../services/OfflineIntelReportService', () => ({
  OfflineIntelReportService: {
    getInstance: () => ({
      createOfflineReport: vi.fn()
    })
  }
}));

vi.mock('../../Intel/OfflineIntelReportsManager', () => ({
  OfflineIntelReportsManager: () => null
}));

vi.mock('../../../hooks/useGlobeRightClickInteraction', () => ({
  useGlobeRightClickInteraction: vi.fn()
}));

// Enhanced3DGlobeInteractivity only reads addActiveFeature from this context — mocking it
// avoids pulling in FloatingPanelManager's own provider dependencies (useVisualizationMode,
// useGlobeContext), matching this file's existing pattern of mocking each hook dependency
// individually rather than mounting the full app provider tree.
vi.mock('../../HUD/FloatingPanels/FloatingPanelContext', () => ({
  useFloatingPanels: () => ({ addActiveFeature: vi.fn() })
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}));

vi.mock('../../ui/IntelReportTooltip/IntelReportTooltip', () => ({
  IntelReportTooltip: () => <div data-testid="intel-tooltip" />
}));

vi.mock('../../ui/IntelReportPopup/IntelReportPopupPortal', () => ({
  IntelReportPopupPortal: () => <div data-testid="intel-popup-portal" />
}));

vi.mock('../../ui/RLSHPopup/RLSHPopupPortal', () => ({
  RLSHPopupPortal: () => <div data-testid="rlsh-popup-portal" />
}));

describe('RLSH mode toggle memory and cleanup budget', () => {
  const TOGGLE_ITERATIONS = 20;

  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
      right: 1280,
      bottom: 720,
      x: 0,
      y: 0
    })
  });

  const scene = new THREE.Scene();
  scene.add = vi.fn(scene.add.bind(scene));
  scene.remove = vi.fn(scene.remove.bind(scene));

  const globeRef = {
    current: {
      camera: () => new THREE.PerspectiveCamera(),
      scene: () => scene
    }
  } as React.RefObject<{ camera: () => THREE.Camera; scene: () => THREE.Scene }>;

  const renderMode = (subMode: string) => (
    <ApplicationRouterProvider>
    <VisualizationOverlayProvider>
      <GlobalGlobeContextMenuProvider>
        <PopupProvider>
          <Enhanced3DGlobeInteractivity
            globeRef={globeRef}
            intelReports={[]}
            visualizationMode={(subMode === 'RLSH' ? { mode: 'HeroWatch', subMode } : { mode: 'CyberCommand', subMode }) as never}
            models={[]}
            containerRef={{ current: container }}
          />
        </PopupProvider>
      </GlobalGlobeContextMenuProvider>
    </VisualizationOverlayProvider>
    </ApplicationRouterProvider>
  );

  it('keeps heap growth within +80MB after 20 mode toggles', () => {
    if (typeof global.gc === 'function') {
      global.gc();
    }

    const heapStart = process.memoryUsage().heapUsed;
    const { rerender, unmount } = render(renderMode('CyberThreats'));

    for (let index = 0; index < TOGGLE_ITERATIONS; index += 1) {
      rerender(renderMode('RLSH'));
      rerender(renderMode('CyberThreats'));
    }

    unmount();

    if (typeof global.gc === 'function') {
      global.gc();
    }

    const heapEnd = process.memoryUsage().heapUsed;
    const deltaMb = (heapEnd - heapStart) / (1024 * 1024);

    console.info(
      `[RLSH][Perf] mode-toggle memory delta=${deltaMb.toFixed(2)}MB after ${TOGGLE_ITERATIONS} toggles`
    );

    expect(deltaMb).toBeLessThanOrEqual(80);
  });

  it('removes scene resources during mode exit/unmount cycles', () => {
    const { rerender, unmount } = render(renderMode('RLSH'));

    for (let index = 0; index < TOGGLE_ITERATIONS; index += 1) {
      rerender(renderMode('CyberThreats'));
      rerender(renderMode('RLSH'));
    }

    unmount();

    const addCalls = (scene.add as vi.Mock).mock.calls.length;
    const removeCalls = (scene.remove as vi.Mock).mock.calls.length;

    console.info(`[RLSH][Perf] scene add=${addCalls} remove=${removeCalls}`);

    expect(removeCalls).toBeGreaterThan(0);
    expect(removeCalls).toBeGreaterThanOrEqual(addCalls - 3);
  });
});
