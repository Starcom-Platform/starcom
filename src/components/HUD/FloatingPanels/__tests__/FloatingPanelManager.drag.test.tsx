/**
 * A panel dragged by its header moves while it is dragged.
 *
 * The manager moved the panel's anchor with the pointer, but the frame kept
 * drawing the panel where it had last been clamped, so in the running app a
 * dragged panel stayed put and jumped to the new place only when released.
 */
import React, { useEffect } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// One object for every render, as the real context gives: a fresh one each render
// re-runs the manager's visibility effect without end.
const mode = vi.hoisted(() => ({ visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' } }));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => mode,
}));
vi.mock('../../../../context/GlobeContext', () => ({
  useGlobeContext: () => ({ focusLocation: null }),
}));

import FloatingPanelManager from '../FloatingPanelManager';
import { useFloatingPanels } from '../FloatingPanelContext';

const Body: React.FC = () => <div>timeline body</div>;

let panels: ReturnType<typeof useFloatingPanels> | null = null;

const Harness: React.FC = () => {
  const ctx = useFloatingPanels();
  panels = ctx;
  const { registerPanel } = ctx;
  useEffect(() => {
    registerPanel({ id: 'timeline-panel', type: 'wide', title: 'Timeline', component: Body,
      position: { anchorTo: 'screen', x: 400, y: 400, offset: { x: 0, y: 0 } },
      priority: 'primary', triggers: ['timeline'], data: {} });
  }, [registerPanel]);
  return null;
};

const drawnAt = () => {
  const el = document.querySelector('[data-panel-id="timeline-panel"]') as HTMLElement;
  return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
};

describe('FloatingPanelManager dragging a panel', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    window.innerWidth = 1024;
    window.innerHeight = 768;
    panels = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('moves with the pointer before it is released', () => {
    render(<FloatingPanelManager><Harness /></FloatingPanelManager>);
    act(() => panels!.addActiveFeature('timeline'));
    const start = drawnAt();

    fireEvent.mouseDown(screen.getByText('Timeline'), { clientX: 400, clientY: 400 });
    fireEvent.mouseMove(document, { clientX: 460, clientY: 430 });

    // Still held: no mouseup yet.
    expect(drawnAt()).toEqual({ x: start.x + 60, y: start.y + 30 });

    fireEvent.mouseUp(document, { clientX: 460, clientY: 430 });
    expect(drawnAt()).toEqual({ x: start.x + 60, y: start.y + 30 });
  });
});
