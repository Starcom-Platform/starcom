/**
 * The minimap before it may draw (plan item 8.3, block B4). It makes no engine
 * and no second globe, so no WebGL context, and shows a still globe saying why.
 * It showed a spinning emoji and "INIT..." while its own engine fetched the
 * same textures as the main globe.
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

vi.mock('react-globe.gl', () => ({
  default: () => <div data-testid="mock-globe" />,
  GlobeMethods: () => {}
}));

// Not yet allowed to draw: the main globe is loading, or this device draws less.
vi.mock('./useMinimapLive', () => ({ useMinimapLive: () => ({ live: false, why: 'The minimap starts once the globe has loaded.' }) }));

function renderWithProvider(ui: React.ReactElement) {
  return render(
    <GlobeProvider>
      <VisualizationModeProvider>
        <GlobeLayerControlProvider>{ui}</GlobeLayerControlProvider>
      </VisualizationModeProvider>
    </GlobeProvider>
  );
}

describe('TinyGlobe, before it may draw', () => {
  it('makes no engine and no globe, and says why it is still', () => {
    constructions.count = 0;
    renderWithProvider(<TinyGlobe />);
    expect(constructions.count).toBe(0);
    expect(document.querySelector('[data-testid="mock-globe"]')).toBeNull();
    const still = document.querySelector('[data-testid="tiny-globe-still"]');
    expect(still?.getAttribute('aria-label')).toBe('The minimap starts once the globe has loaded.');
    expect(document.body.textContent).not.toMatch(/INIT/);
  });
});
