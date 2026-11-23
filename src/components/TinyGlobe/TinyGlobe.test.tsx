import * as React from 'react';
import { render } from '@testing-library/react';
import { VisualizationModeProvider } from '../../context/VisualizationModeContext';
import { GlobeProvider } from '../../context/GlobeContext';
import { GlobeLayerControlProvider } from '../Globe/Hooks/useGlobeLayerControl';
import TinyGlobe from './TinyGlobe';
import { vi } from 'vitest';

// Allowed to draw (useMinimapLive.test.tsx says when).
vi.mock('./useMinimapLive', () => ({ useMinimapLive: () => ({ live: true, why: '' }) }));

vi.mock('react-globe.gl', () => ({
  default: () => <div data-testid="mock-globe" />,
  GlobeMethods: () => {},
}));
vi.mock('three', async () => {
  const actual = await vi.importActual<object>('three');
  return {
    ...actual,
    TextureLoader: class { loadAsync = () => Promise.resolve({}); },
    ShaderMaterial: class { dispose() {} },
    // Vectors and lights are three's own: the minimap's Sun is one, and its light rig (D-MG, MG4).
  };
});

// Helper to render with context
function renderWithProvider(ui: React.ReactElement) {
  return render(
    <GlobeProvider>
      <VisualizationModeProvider>
        <GlobeLayerControlProvider>{ui}</GlobeLayerControlProvider>
      </VisualizationModeProvider>
    </GlobeProvider>
  );
}

describe('TinyGlobe Mode Synchronization', () => {
  it('renders without crashing', () => {
    renderWithProvider(<TinyGlobe />);
  });

  // The previous second test here ("UI buttons update VisualizationMode
  // context") clicked shader-switch buttons (🌎/📑/☀️) that no longer exist —
  // TinyGlobe stopped rendering per-mode shader buttons in an earlier,
  // unrelated iteration (dead CSS for them still sits in TinyGlobe.module.css,
  // flagged but intentionally not cleaned up as part of this change). Removed
  // rather than fixed forward, since there's nothing current to smoke-test
  // there; TinyGlobe.minimap.test.tsx covers today's real interactive surface
  // (orientation marker, activity dots, mode ring).
});
