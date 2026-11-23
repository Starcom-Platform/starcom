import React from 'react';
import * as THREE from 'three';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Enhanced3DGlobeInteractivity } from '../Enhanced3DGlobeInteractivity';
import { GlobalGlobeContextMenuProvider } from '../../../context/GlobalGlobeContextMenuProvider';
import { VisualizationOverlayProvider } from '../../../context/VisualizationOverlayContext';
import { ApplicationRouterProvider } from '../../Router/ApplicationRouter';
import { PopupProvider } from '../../Popup/PopupManager';
import { vi } from 'vitest';

const tooltipSpy = vi.fn();

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
  IntelReportTooltip: (props: { visible: boolean }) => {
    tooltipSpy(props);
    return <div data-testid="intel-tooltip" data-visible={props.visible ? 'true' : 'false'} />;
  }
}));

vi.mock('../../ui/IntelReportPopup/IntelReportPopupPortal', () => ({
  IntelReportPopupPortal: () => <div data-testid="intel-popup-portal" />
}));

vi.mock('../../ui/RLSHPopup/RLSHPopupPortal', () => ({
  RLSHPopupPortal: () => <div data-testid="rlsh-popup-portal" />
}));

const p95 = (samples: number[]): number => {
  if (!samples.length) {
    return 0;
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index];
};

describe('RLSH mode switch performance budget', () => {
  const ITERATIONS = 50;

  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      right: 1024,
      bottom: 768,
      x: 0,
      y: 0
    })
  });

  const globeRef = {
    current: {
      camera: () => new THREE.PerspectiveCamera(),
      scene: () => {
        const scene = new THREE.Scene();
        scene.add = vi.fn(scene.add.bind(scene));
        scene.remove = vi.fn(scene.remove.bind(scene));
        return scene;
      }
    }
  } as React.RefObject<{ camera: () => THREE.Camera; scene: () => THREE.Scene }>;

  /**
 * One marker, because the interaction system is now gated on marker PRESENCE
 * rather than on the visualization mode.
 *
 * These tests passed models={[rlshModel()]} and asserted the tooltip mounts in RLSH mode.
 * That conflated two questions the refactor separates: whether the machinery
 * should run (are there markers?) and what a specific marker IS (ask the
 * marker). With nothing on the globe there is nothing to hover, so mounting the
 * hover machinery was work with no possible effect.
 *
 * Giving the test a marker is the precondition the behaviour now requires — and
 * a mode switch with markers on screen is the case that actually happens.
 */
const rlshModel = () => {
  const mesh = new THREE.Object3D();
  return {
    positionContainer: new THREE.Group(),
    orientationContainer: new THREE.Group(),
    rotationContainer: new THREE.Group(),
    mesh,
    report: {
      pubkey: 'rlsh-fixture-1',
      title: 'Fixture Hero',
      content: '',
      tags: ['RLSH'],
      latitude: 45.5,
      longitude: -122.6,
      timestamp: 0,
      author: 'wiki.rlsh.net',
      kind: 'rlsh' as const
    },
    basePosition: new THREE.Vector3(),
    surfaceAnchor: new THREE.Vector3(),
    surfaceAnchorIsWorld: false,
    hoverOffset: 0,
    localRotationY: 0,
    globeRadius: 100,
    hoverAltitude: 10
  } as unknown as Parameters<typeof Enhanced3DGlobeInteractivity>[0]['models'][number];
};

  const renderMode = (subMode: string) => (
    <ApplicationRouterProvider>
    <VisualizationOverlayProvider>
      <GlobalGlobeContextMenuProvider>
        <PopupProvider>
          <Enhanced3DGlobeInteractivity
            globeRef={globeRef}
            intelReports={[]}
            visualizationMode={(subMode === 'RLSH' ? { mode: 'HeroWatch', subMode } : { mode: 'CyberCommand', subMode }) as never}
            models={[rlshModel()]}
            containerRef={{ current: container }}
          />
        </PopupProvider>
      </GlobalGlobeContextMenuProvider>
    </VisualizationOverlayProvider>
    </ApplicationRouterProvider>
  );

  it('keeps synthetic mode-switch p95 within 350ms target', () => {
    const samples: number[] = [];

    const { rerender } = render(renderMode('CyberThreats'));

    for (let index = 0; index < ITERATIONS; index += 1) {
      const start = performance.now();
      rerender(renderMode('RLSH'));
      screen.getByTestId('intel-tooltip');
      samples.push(performance.now() - start);

      rerender(renderMode('CyberThreats'));
    }

    const measuredP95 = p95(samples);
    console.info(`[RLSH][Perf] synthetic mode-switch p95=${measuredP95.toFixed(2)}ms over ${ITERATIONS} iterations`);
    expect(measuredP95).toBeLessThan(350);
  });
});
