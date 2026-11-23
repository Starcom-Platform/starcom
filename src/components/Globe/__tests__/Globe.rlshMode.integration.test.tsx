import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as THREE from 'three';
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
  IntelReportTooltip: (props: { entityLabel?: string; showConfidenceTag?: boolean; visible: boolean }) => {
    tooltipSpy(props);
    return (
      <div
        data-testid="intel-tooltip"
        data-entity-label={props.entityLabel || ''}
        data-confidence-tag={props.showConfidenceTag ? 'true' : 'false'}
        data-visible={props.visible ? 'true' : 'false'}
      />
    );
  }
}));

vi.mock('../../ui/IntelReportPopup/IntelReportPopupPortal', () => ({
  IntelReportPopupPortal: () => <div data-testid="intel-popup-portal" />
}));

vi.mock('../../ui/RLSHPopup/RLSHPopupPortal', () => ({
  RLSHPopupPortal: () => <div data-testid="rlsh-popup-portal" />
}));

describe('RLSH mode integration gating', () => {
  beforeEach(() => {
    tooltipSpy.mockClear();
  });

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

  const renderWithProviders = (subMode: string) => {
    return render(
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
  };

  it('mounts tooltip path in RLSH mode and passes RLSH-specific tooltip props', () => {
    renderWithProviders('RLSH');

    const tooltip = screen.getByTestId('intel-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveAttribute('data-entity-label', 'RLSH Entity');
    expect(tooltip).toHaveAttribute('data-confidence-tag', 'true');

    expect(tooltipSpy).toHaveBeenCalled();
  });

  it('unmounts tooltip path when the markers go away', () => {
    const { rerender } = renderWithProviders('RLSH');
    expect(screen.getByTestId('intel-tooltip')).toBeInTheDocument();

    /*
     * models: [] alongside the mode change, because that is what production
     * does. Globe.tsx builds activeIntelLikeReports from the ACTIVE layers, so
     * leaving RLSH with nothing pinned empties it — the mode change and the
     * marker change are one event, and a harness that moved only the mode was
     * asserting a state the app cannot reach.
     *
     * The assertion is unchanged and now checks the real mechanism: the hover
     * machinery goes away because there is nothing left to hover.
     */
    rerender(
      <ApplicationRouterProvider>
      <VisualizationOverlayProvider>
        <GlobalGlobeContextMenuProvider>
          <PopupProvider>
            <Enhanced3DGlobeInteractivity
              globeRef={globeRef}
              intelReports={[]}
              visualizationMode={{ mode: 'CyberCommand', subMode: 'CyberThreats' }}
              models={[]}
              containerRef={{ current: container }}
            />
          </PopupProvider>
        </GlobalGlobeContextMenuProvider>
      </VisualizationOverlayProvider>
      </ApplicationRouterProvider>
    );

    expect(screen.queryByTestId('intel-tooltip')).toBeNull();
  });

  it('KEEPS the tooltip path when markers are present in another mode — the pinned case', () => {
    /*
     * The capability Phase 2 adds, and the one the old gate made impossible.
     *
     * useGlobeLayerControl lets an operator PIN a layer so it renders while
     * another mode is primary. Before, interaction was gated on the mode, so a
     * pinned layer's markers were drawn (once the selector became additive) and
     * could not be hovered or clicked — visible and dead. Gating on marker
     * PRESENCE is what makes them live.
     */
    render(
      <ApplicationRouterProvider>
      <VisualizationOverlayProvider>
        <GlobalGlobeContextMenuProvider>
          <PopupProvider>
            <Enhanced3DGlobeInteractivity
              globeRef={globeRef}
              intelReports={[]}
              visualizationMode={{ mode: 'CyberCommand', subMode: 'CyberThreats' }}
              models={[rlshModel()]}
              containerRef={{ current: container }}
            />
          </PopupProvider>
        </GlobalGlobeContextMenuProvider>
      </VisualizationOverlayProvider>
      </ApplicationRouterProvider>
    );

    // CyberThreats is primary, yet an RLSH marker is on the globe: interactive.
    expect(screen.getByTestId('intel-tooltip')).toBeInTheDocument();
  });
});
